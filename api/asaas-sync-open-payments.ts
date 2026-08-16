/**
 * POST /api/asaas/sync-open-payments — handler Vercel leve (P4-NB07-CRIT).
 */
import { runAsaasSyncOpenPayments } from '../lib/asaasSyncOpenPaymentsCore.js';
import { authorizeSupabaseAdminRequest } from '../lib/supabaseAdminApiAuth.js';

const ASAAS_FINANCE_ROLES = ['administrador', 'diretoria', 'financeiro'] as const;

function parseBody(body: unknown): Record<string, unknown> {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof body === 'object') return body as Record<string, unknown>;
  return {};
}

type SyncOpenPaymentsDeps = {
  authorize?: typeof authorizeSupabaseAdminRequest;
  runSync?: typeof runAsaasSyncOpenPayments;
};

export async function handleAsaasSyncOpenPaymentsRequest(
  req: any,
  res: any,
  deps: SyncOpenPaymentsDeps = {},
) {
  const authorize = deps.authorize ?? authorizeSupabaseAdminRequest;
  const runSync = deps.runSync ?? runAsaasSyncOpenPayments;

  if (req.method === 'OPTIONS') {
    res.status(200).json({ ok: true });
    return;
  }
  if (req.method !== 'POST') {
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
    const body = parseBody(req.body);
    const result = await runSync({
      queryLimit: req.query?.limit,
      bodyLimit: body.limit,
    });
    res.status(200).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
}

export default async function handler(req: any, res: any) {
  return handleAsaasSyncOpenPaymentsRequest(req, res);
}

export const config = { maxDuration: 60 };
