/**
 * Status Asaas leve (sem cold start do Express).
 * GET /api/asaas/status
 */
import {
  getAsaasApiKeyTmGestao,
  getAsaasApiKeyTmSeguranca,
  getAsaasApiKeyTmSecurity,
} from '../lib/asaasEnvKeys.js';

export const config = { maxDuration: 10 };

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');

  const companies = {
    tmGestao: Boolean(getAsaasApiKeyTmGestao()),
    tmSeguranca: Boolean(getAsaasApiKeyTmSeguranca()),
    tmSecurity: Boolean(getAsaasApiKeyTmSecurity()),
  };
  const configured = companies.tmGestao || companies.tmSeguranca || companies.tmSecurity;

  res.status(200).json({
    ok: true,
    configured,
    companies,
  });
}
