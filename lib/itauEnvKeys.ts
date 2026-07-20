/** Credenciais Itaú for Developers — multi-empresa (TM SECURITY → TM SEG → TM GESTÃO). */
import { createHash } from 'node:crypto';

export type ItauCompanyId = 'tmsecurity' | 'tmseguranca' | 'tmgestao';

export const ITAU_COMPANIES: readonly ItauCompanyId[] = [
  'tmsecurity',
  'tmseguranca',
  'tmgestao',
] as const;

export const ITAU_COMPANY_LABEL: Record<ItauCompanyId, string> = {
  tmsecurity: 'TM SECURITY',
  tmseguranca: 'TM SEGURANÇA',
  tmgestao: 'TM GESTÃO',
};

export function sanitizeItauEnvValue(raw: unknown): string {
  return String(raw || '')
    .replace(/^\uFEFF/, '')
    .replace(/[\r\u200b\u200c\u200d]/g, '')
    .trim()
    .replace(/^["']+|["']+$/g, '');
}

export function readFirstEnv(...names: string[]): string {
  for (const name of names) {
    const value = sanitizeItauEnvValue(process.env[name]);
    if (value) return value;
  }
  return '';
}

export function fingerprintItauSecret(value: string): string {
  if (!value) return '';
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

/**
 * Normaliza PEM vindo de env (Vercel):
 * - literais com \\n
 * - Base64 do PEM inteiro (quando não começa com BEGIN)
 */
export function normalizePem(raw: string): string {
  let value = sanitizeItauEnvValue(raw);
  if (!value) return '';

  if (!value.includes('BEGIN') && /^[A-Za-z0-9+/=\s]+$/.test(value.replace(/\n/g, ''))) {
    try {
      const decoded = Buffer.from(value.replace(/\s+/g, ''), 'base64').toString('utf8');
      if (decoded.includes('BEGIN')) value = decoded;
    } catch {
      /* mantém original */
    }
  }

  value = value.replace(/\\n/g, '\n').replace(/\\r/g, '');
  return value.trim();
}

const CLIENT_ID_ENV: Record<ItauCompanyId, readonly string[]> = {
  tmsecurity: ['ITAU_TMSECURITY_CLIENT_ID', 'ITAU_CLIENT_ID_TMSECURITY'],
  tmseguranca: [
    'ITAU_TMSEGURANCA_CLIENT_ID',
    'ITAU_TMSEG_CLIENT_ID',
    'ITAU_CLIENT_ID_TMSEGURANCA',
  ],
  tmgestao: ['ITAU_TMGESTAO_CLIENT_ID', 'ITAU_CLIENT_ID_TMGESTAO'],
};

const CLIENT_SECRET_ENV: Record<ItauCompanyId, readonly string[]> = {
  tmsecurity: ['ITAU_TMSECURITY_CLIENT_SECRET', 'ITAU_CLIENT_SECRET_TMSECURITY'],
  tmseguranca: [
    'ITAU_TMSEGURANCA_CLIENT_SECRET',
    'ITAU_TMSEG_CLIENT_SECRET',
    'ITAU_CLIENT_SECRET_TMSEGURANCA',
  ],
  tmgestao: ['ITAU_TMGESTAO_CLIENT_SECRET', 'ITAU_CLIENT_SECRET_TMGESTAO'],
};

const CERT_ENV: Record<ItauCompanyId, readonly string[]> = {
  tmsecurity: ['ITAU_TMSECURITY_CERT_PEM', 'ITAU_CERT_PEM_TMSECURITY'],
  tmseguranca: [
    'ITAU_TMSEGURANCA_CERT_PEM',
    'ITAU_TMSEG_CERT_PEM',
    'ITAU_CERT_PEM_TMSEGURANCA',
  ],
  tmgestao: ['ITAU_TMGESTAO_CERT_PEM', 'ITAU_CERT_PEM_TMGESTAO'],
};

const KEY_ENV: Record<ItauCompanyId, readonly string[]> = {
  tmsecurity: ['ITAU_TMSECURITY_KEY_PEM', 'ITAU_KEY_PEM_TMSECURITY'],
  tmseguranca: [
    'ITAU_TMSEGURANCA_KEY_PEM',
    'ITAU_TMSEG_KEY_PEM',
    'ITAU_KEY_PEM_TMSEGURANCA',
  ],
  tmgestao: ['ITAU_TMGESTAO_KEY_PEM', 'ITAU_KEY_PEM_TMGESTAO'],
};

export type ItauCompanyCredentials = {
  company: ItauCompanyId;
  clientId: string;
  clientSecret: string;
  certPem: string;
  keyPem: string;
};

export function getItauCredentials(company: ItauCompanyId): ItauCompanyCredentials {
  return {
    company,
    clientId: readFirstEnv(...CLIENT_ID_ENV[company]),
    clientSecret: readFirstEnv(...CLIENT_SECRET_ENV[company]),
    certPem: normalizePem(readFirstEnv(...CERT_ENV[company])),
    keyPem: normalizePem(readFirstEnv(...KEY_ENV[company])),
  };
}

export type ItauCompanyEnvSummary = {
  company: ItauCompanyId;
  label: string;
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
  certConfigured: boolean;
  keyConfigured: boolean;
  readyForToken: boolean;
  clientIdFingerprint: string;
  sourceEnv: {
    clientId: string | null;
    clientSecret: string | null;
    cert: string | null;
    key: string | null;
  };
  hint: string | null;
};

function firstConfiguredEnvName(names: readonly string[]): string | null {
  for (const name of names) {
    if (sanitizeItauEnvValue(process.env[name])) return name;
  }
  return null;
}

export function summarizeItauCompanyEnv(company: ItauCompanyId): ItauCompanyEnvSummary {
  const creds = getItauCredentials(company);
  const clientIdConfigured = Boolean(creds.clientId);
  const clientSecretConfigured = Boolean(creds.clientSecret);
  const certConfigured = Boolean(creds.certPem && creds.certPem.includes('BEGIN'));
  const keyConfigured = Boolean(creds.keyPem && creds.keyPem.includes('BEGIN'));
  const readyForToken =
    clientIdConfigured && clientSecretConfigured && certConfigured && keyConfigured;

  let hint: string | null = null;
  if (!clientIdConfigured || !clientSecretConfigured) {
    hint = `Configure ITAU_${company.toUpperCase()}_CLIENT_ID e _CLIENT_SECRET na Vercel.`;
  } else if (!certConfigured || !keyConfigured) {
    hint =
      `OAuth + mTLS exigem certificado dinâmico: configure ITAU_${company.toUpperCase()}_CERT_PEM ` +
      `e ITAU_${company.toUpperCase()}_KEY_PEM (PEM ou Base64).`;
  }

  return {
    company,
    label: ITAU_COMPANY_LABEL[company],
    clientIdConfigured,
    clientSecretConfigured,
    certConfigured,
    keyConfigured,
    readyForToken,
    clientIdFingerprint: fingerprintItauSecret(creds.clientId),
    sourceEnv: {
      clientId: firstConfiguredEnvName(CLIENT_ID_ENV[company]),
      clientSecret: firstConfiguredEnvName(CLIENT_SECRET_ENV[company]),
      cert: firstConfiguredEnvName(CERT_ENV[company]),
      key: firstConfiguredEnvName(KEY_ENV[company]),
    },
    hint,
  };
}

export function summarizeAllItauEnv(): ItauCompanyEnvSummary[] {
  return ITAU_COMPANIES.map((c) => summarizeItauCompanyEnv(c));
}

export function parseItauCompanyParam(raw: unknown): ItauCompanyId {
  const v = String(raw || 'tmsecurity')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '');
  if (v === 'tmsecurity' || v === 'security') return 'tmsecurity';
  if (v === 'tmseguranca' || v === 'tmseg' || v === 'seguranca' || v === 'segurança') {
    return 'tmseguranca';
  }
  if (v === 'tmgestao' || v === 'gestao' || v === 'gestão') return 'tmgestao';
  return 'tmsecurity';
}
