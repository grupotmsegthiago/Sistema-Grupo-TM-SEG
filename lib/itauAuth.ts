/**
 * Autenticação Itaú for Developers (produção):
 * OAuth2 client_credentials + mTLS no STS.
 * Docs: https://devportal.itau.com.br/autenticacao-documentacao
 */
import https from 'node:https';
import { URL } from 'node:url';
import {
  getItauCredentials,
  type ItauCompanyId,
  summarizeItauCompanyEnv,
} from './itauEnvKeys.js';

export const ITAU_STS_TOKEN_URL = 'https://sts.itau.com.br/api/oauth/token';
export const ITAU_API_BASE = 'https://api.itau.com.br';

type TokenCacheEntry = {
  accessToken: string;
  expiresAtMs: number;
};

const tokenCache = new Map<ItauCompanyId, TokenCacheEntry>();

export type ItauMtlsResponse = {
  status: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
};

/** POST/GET HTTPS com certificado de cliente (mTLS). */
export function itauMtlsRequest(opts: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  certPem: string;
  keyPem: string;
  timeoutMs?: number;
}): Promise<ItauMtlsResponse> {
  const method = opts.method || 'GET';
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const u = new URL(opts.url);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method,
        headers: opts.headers,
        cert: opts.certPem,
        key: opts.keyPem,
        rejectUnauthorized: true,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            body: Buffer.concat(chunks).toString('utf8'),
            headers: res.headers as Record<string, string | string[] | undefined>,
          });
        });
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timeout Itaú mTLS após ${timeoutMs}ms`));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

export type ItauTokenResult = {
  ok: true;
  accessToken: string;
  expiresIn: number;
  tokenType: string;
  cached: boolean;
};

export type ItauTokenError = {
  ok: false;
  error: string;
  httpStatus?: number;
  hint?: string;
};

export async function getItauAccessToken(
  company: ItauCompanyId,
  opts?: { forceRefresh?: boolean },
): Promise<ItauTokenResult | ItauTokenError> {
  const summary = summarizeItauCompanyEnv(company);
  if (!summary.readyForToken) {
    return {
      ok: false,
      error: 'Credenciais Itaú incompletas',
      hint: summary.hint || undefined,
    };
  }

  const now = Date.now();
  const cached = tokenCache.get(company);
  // Renova ~60s antes do fim (token STS = 300s)
  if (!opts?.forceRefresh && cached && cached.expiresAtMs > now + 60_000) {
    return {
      ok: true,
      accessToken: cached.accessToken,
      expiresIn: Math.max(0, Math.floor((cached.expiresAtMs - now) / 1000)),
      tokenType: 'Bearer',
      cached: true,
    };
  }

  const creds = getItauCredentials(company);
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  }).toString();

  let res: ItauMtlsResponse;
  try {
    res = await itauMtlsRequest({
      url: ITAU_STS_TOKEN_URL,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
      certPem: creds.certPem,
      keyPem: creds.keyPem,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `Falha mTLS/STS: ${msg}`,
      hint:
        'Verifique CERT_PEM/KEY_PEM do certificado dinâmico e se o client_id está ativo no Portal Itaú.',
    };
  }

  let data: Record<string, unknown> = {};
  try {
    data = res.body ? (JSON.parse(res.body) as Record<string, unknown>) : {};
  } catch {
    data = { raw: res.body?.slice(0, 200) };
  }

  if (res.status < 200 || res.status >= 300 || !data.access_token) {
    const detail =
      (typeof data.error_description === 'string' && data.error_description) ||
      (typeof data.error === 'string' && data.error) ||
      (typeof data.message === 'string' && data.message) ||
      `HTTP ${res.status}`;
    return {
      ok: false,
      error: detail,
      httpStatus: res.status,
      hint:
        res.status === 401 || res.status === 403
          ? 'Client ID/Secret ou certificado rejeitados pelo STS Itaú.'
          : undefined,
    };
  }

  const expiresIn = Number(data.expires_in || 300);
  const accessToken = String(data.access_token);
  tokenCache.set(company, {
    accessToken,
    expiresAtMs: now + Math.max(30, expiresIn) * 1000,
  });

  return {
    ok: true,
    accessToken,
    expiresIn,
    tokenType: String(data.token_type || 'Bearer'),
    cached: false,
  };
}

/** Chamada autenticada a api.itau.com.br (Bearer + mTLS). */
export async function itauApiRequest(
  company: ItauCompanyId,
  path: string,
  opts?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    forceTokenRefresh?: boolean;
  },
): Promise<ItauMtlsResponse | ItauTokenError> {
  const token = await getItauAccessToken(company, { forceRefresh: opts?.forceTokenRefresh });
  if (!token.ok) return token;

  const creds = getItauCredentials(company);
  const url = path.startsWith('http') ? path : `${ITAU_API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;

  try {
    return await itauMtlsRequest({
      url,
      method: opts?.method || 'GET',
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        Accept: 'application/json',
        ...(opts?.headers || {}),
      },
      body: opts?.body,
      certPem: creds.certPem,
      keyPem: creds.keyPem,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Falha chamada API Itaú: ${msg}` };
  }
}

export function clearItauTokenCache(company?: ItauCompanyId): void {
  if (company) tokenCache.delete(company);
  else tokenCache.clear();
}
