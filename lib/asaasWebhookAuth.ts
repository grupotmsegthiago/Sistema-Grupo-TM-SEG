import { createHash, timingSafeEqual } from 'node:crypto';

export const ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV = 'ASAAS_PAYMENT_WEBHOOK_TOKEN';
export const ASAAS_PAYMENT_WEBHOOK_HEADER = 'asaas-access-token';

export type AsaasWebhookAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: 'unauthorized' | 'webhook_not_configured' };

function readHeaderCaseInsensitive(headers: Record<string, unknown> | undefined, name: string): string {
  if (!headers) return '';
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  const raw = entry?.[1];
  if (Array.isArray(raw)) return String(raw[0] || '');
  return String(raw || '');
}

function isValidConfiguredToken(token: string): boolean {
  return token.length >= 32 && token.length <= 255 && !/\s/.test(token);
}

function secureEqual(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(left, 'utf8').digest();
  const rightDigest = createHash('sha256').update(right, 'utf8').digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

/**
 * Autenticação servidor-servidor do webhook de pagamentos Asaas.
 *
 * Contrato oficial: o `authToken` configurado no painel Asaas chega no header
 * `asaas-access-token`. O token deve ter 32–255 caracteres, sem espaços, e não
 * deve ser uma API key Asaas.
 */
export function verifyAsaasPaymentWebhookRequest(
  req: { headers?: Record<string, unknown> },
  configuredToken = process.env[ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV],
): AsaasWebhookAuthResult {
  const expected = String(configuredToken || '');
  if (!isValidConfiguredToken(expected)) {
    return { ok: false, status: 503, error: 'webhook_not_configured' };
  }

  const provided = readHeaderCaseInsensitive(req.headers, ASAAS_PAYMENT_WEBHOOK_HEADER);
  if (!provided || !secureEqual(provided, expected)) {
    return { ok: false, status: 401, error: 'unauthorized' };
  }

  return { ok: true };
}
