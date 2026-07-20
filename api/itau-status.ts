/**
 * Diagnóstico Itaú for Developers (sem expor segredos).
 * GET /api/itau/status?company=tmsecurity&probe=1
 */
import {
  ITAU_COMPANIES,
  parseItauCompanyParam,
  summarizeAllItauEnv,
  summarizeItauCompanyEnv,
  type ItauCompanyId,
} from '../lib/itauEnvKeys.js';
import { getItauAccessToken } from '../lib/itauAuth.js';

export const config = { maxDuration: 30 };

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');

  const companyParam = parseItauCompanyParam(req.query?.company);
  const probe =
    String(req.query?.probe || '').trim() === '1' ||
    String(req.query?.probe || '').toLowerCase() === 'true';

  const companies = summarizeAllItauEnv();
  const focus = summarizeItauCompanyEnv(companyParam);

  let tokenProbe: {
    company: ItauCompanyId;
    ok: boolean;
    expiresIn?: number;
    cached?: boolean;
    error?: string;
    hint?: string;
    httpStatus?: number;
  } | null = null;

  if (probe) {
    const token = await getItauAccessToken(companyParam, { forceRefresh: true });
    if (token.ok) {
      tokenProbe = {
        company: companyParam,
        ok: true,
        expiresIn: token.expiresIn,
        cached: token.cached,
      };
    } else {
      tokenProbe = {
        company: companyParam,
        ok: false,
        error: token.error,
        hint: token.hint,
        httpStatus: token.httpStatus,
      };
    }
  }

  const anyReady = companies.some((c) => c.readyForToken);
  const focusReady = focus.readyForToken;
  const probeOk = tokenProbe ? tokenProbe.ok : null;

  res.status(200).json({
    ok: probe ? Boolean(probeOk) : focusReady || anyReady,
    focus: companyParam,
    companies: Object.fromEntries(companies.map((c) => [c.company, c])),
    tokenProbe,
    nextSteps: focus.readyForToken
      ? [
          'Credenciais + certificado OK para obter access_token.',
          'Próximo: liberar produtos no Portal (PIX/boleto/extrato) e mapear endpoints.',
        ]
      : [
          focus.hint || 'Complete Client ID/Secret e certificado dinâmico (.crt + .key).',
          'Portal: https://devportal.itau.com.br/certificado-dinamico-demais-produtos',
        ],
    supportedCompanies: [...ITAU_COMPANIES],
  });
}
