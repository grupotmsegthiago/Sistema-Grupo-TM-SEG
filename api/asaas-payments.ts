/**
 * GET /api/asaas/payments — handler Vercel leve (P4-NB07-CRIT).
 */
import { listAsaasPayments } from '../lib/asaasPaymentRoutesCore.js';
import { authorizeSupabaseAdminRequest } from '../lib/supabaseAdminApiAuth.js';

const ASAAS_FINANCE_ROLES = ['administrador', 'diretoria', 'financeiro'] as const;

function queryValue(value: unknown): string {
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

type PaymentsListDeps = {
  authorize?: typeof authorizeSupabaseAdminRequest;
  list?: typeof listAsaasPayments;
};

export async function handleAsaasPaymentsListRequest(
  req: any,
  res: any,
  deps: PaymentsListDeps = {},
) {
  const authorize = deps.authorize ?? authorizeSupabaseAdminRequest;
  const list = deps.list ?? listAsaasPayments;

  if (req.method === 'OPTIONS') {
    res.status(200).json({ ok: true });
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const auth = await authorize(req, ASAAS_FINANCE_ROLES);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');

  try {
    const result = await list({
      status: queryValue(req.query?.status) || undefined,
      externalReference: queryValue(req.query?.externalReference) || undefined,
      offset: parseInt(queryValue(req.query?.offset) || '0', 10) || 0,
      limit: parseInt(queryValue(req.query?.limit) || '50', 10) || 50,
      company: queryValue(req.query?.company) || undefined,
    });
    res.status(200).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
}

export default async function handler(req: any, res: any) {
  return handleAsaasPaymentsListRequest(req, res);
}

export const config = { maxDuration: 30 };
