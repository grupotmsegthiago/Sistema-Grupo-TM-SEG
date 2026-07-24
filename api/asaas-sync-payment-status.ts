/**
 * Sync pagamento/NF Asaas — rota LEVE (evita 504 do Express).
 * Rewrite: /api/asaas/sync-payment-status → /api/asaas-sync-payment-status
 */
import { assertAsaasApiAccess, extractAuthToken } from '../lib/asaasApiAuth.js';
import { runAsaasSyncPaymentStatus } from '../lib/asaasSyncPaymentStatusCore.js';

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

export default async function handler(req: any, res: any) {
  try {
    if (req.method === 'OPTIONS') {
      res.status(200).json({ ok: true });
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'method_not_allowed' });
      return;
    }

    const token = extractAuthToken(req);
    const denied = await assertAsaasApiAccess(token, req);
    if (denied) {
      res.status(denied === 'Não autorizado' ? 401 : 403).json({ ok: false, error: denied });
      return;
    }

    const body = parseBody(req.body);
    const paymentId = String(body.paymentId || '').trim();
    if (!paymentId) {
      res.status(400).json({ ok: false, error: 'paymentId obrigatório' });
      return;
    }

    const result = await runAsaasSyncPaymentStatus({
      paymentId,
      invoiceId: String(body.invoiceId || '').trim() || undefined,
      company: String(body.company || '').trim() || undefined,
    });

    res.status(200).json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[asaas-sync-payment-status]', message);
    res.status(500).json({ ok: false, error: message || 'Falha ao sincronizar' });
  }
}

export const config = { maxDuration: 30 };
