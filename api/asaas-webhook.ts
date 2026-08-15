/**
 * POST /api/asaas/webhook — handler Vercel leve (P4-NB07-CRIT).
 * Preserva contrato legado: sem requireAuth; SEC-03/token em bloco futuro.
 */
import { handleAsaasPaymentWebhook } from '../lib/asaasWebhookCore.js';

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

type WebhookDeps = {
  handleWebhook?: typeof handleAsaasPaymentWebhook;
};

export async function handleAsaasWebhookRequest(
  req: any,
  res: any,
  deps: WebhookDeps = {},
) {
  const handleWebhook = deps.handleWebhook ?? handleAsaasPaymentWebhook;

  if (req.method === 'OPTIONS') {
    res.status(200).json({ ok: true });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');

  try {
    const body = parseBody(req.body);
    const result = await handleWebhook(body as any);
    res.status(200).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Asaas Webhook] Erro:', message);
    res.status(200).json({ received: true, error: message });
  }
}

export default async function handler(req: any, res: any) {
  return handleAsaasWebhookRequest(req, res);
}

export const config = { maxDuration: 30 };
