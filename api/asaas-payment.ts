/**
 * GET/DELETE /api/asaas/payment/:id — handler Vercel leve (P4-NB07-CRIT).
 */
import {
  deleteAsaasPayment,
  getAsaasPaymentDetail,
} from '../lib/asaasPaymentRoutesCore.js';
import { authorizeSupabaseAdminRequest } from '../lib/supabaseAdminApiAuth.js';

const ASAAS_FINANCE_ROLES = ['administrador', 'diretoria', 'financeiro'] as const;

function queryValue(value: unknown): string {
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

type PaymentItemDeps = {
  authorize?: typeof authorizeSupabaseAdminRequest;
  getDetail?: typeof getAsaasPaymentDetail;
  remove?: typeof deleteAsaasPayment;
};

export async function handleAsaasPaymentItemRequest(
  req: any,
  res: any,
  deps: PaymentItemDeps = {},
) {
  const authorize = deps.authorize ?? authorizeSupabaseAdminRequest;
  const getDetail = deps.getDetail ?? getAsaasPaymentDetail;
  const remove = deps.remove ?? deleteAsaasPayment;

  const method = String(req.method || '').toUpperCase();
  if (method === 'OPTIONS') {
    res.status(200).json({ ok: true });
    return;
  }
  if (method !== 'GET' && method !== 'DELETE') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const auth = await authorize(req, ASAAS_FINANCE_ROLES);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const paymentId = queryValue(req.query?.id);
  if (!paymentId) {
    res.status(400).json({ error: 'id obrigatório' });
    return;
  }

  const company = queryValue(req.query?.company) || undefined;
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (method === 'DELETE') {
      res.status(200).json(await remove({ paymentId, company }));
      return;
    }
    res.status(200).json(await getDetail({ paymentId, company }));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
}

export default async function handler(req: any, res: any) {
  return handleAsaasPaymentItemRequest(req, res);
}

export const config = { maxDuration: 30 };
