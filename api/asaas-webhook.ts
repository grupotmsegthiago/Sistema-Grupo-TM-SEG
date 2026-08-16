/**
 * POST /api/asaas/webhook — handler Vercel leve (P4-NB07-CRIT).
 * Preserva contrato legado: sem requireAuth; SEC-03/token em bloco futuro.
 */
import { handleAsaasPaymentWebhook } from '../lib/asaasWebhookCore.js';

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
    // Paridade Express: repassa req.body sem converter ausente → {}
    const result = await handleWebhook(req.body);
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
