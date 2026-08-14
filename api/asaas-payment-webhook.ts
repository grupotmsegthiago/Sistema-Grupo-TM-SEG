/**
 * POST /api/asaas/webhook — baixa automática de faturas (serverless leve).
 * Valida asaas-access-token contra ASAAS_PAYMENT_WEBHOOK_TOKEN antes de processar.
 */
import { createSupabaseAdminClient } from '../lib/supabaseAdmin.js';
import {
  processAsaasPaymentWebhookEvent,
  verifyAsaasPaymentWebhookRequest,
} from '../lib/asaasPaymentWebhook.js';

function parseBody(body: unknown): Record<string, unknown> {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return (body && typeof body === 'object') ? (body as Record<string, unknown>) : {};
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const auth = verifyAsaasPaymentWebhookRequest(req);
  if (!auth.ok) {
    const status = auth.reason === 'webhook_not_configured' ? 503 : 401;
    res.status(status).json({ received: false, error: auth.reason });
    return;
  }

  const sb = createSupabaseAdminClient();
  if (!sb) {
    res.status(503).json({ received: false, error: 'supabase_unavailable' });
    return;
  }

  try {
    const body = parseBody(req.body);
    const result = await processAsaasPaymentWebhookEvent(body as any, sb);
    res.status(200).json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[asaas/payment-webhook]', message);
    res.status(200).json({ received: true, processed: false, error: message });
  }
}
