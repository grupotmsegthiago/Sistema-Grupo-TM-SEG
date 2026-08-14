/**
 * Webhook Asaas — baixa automática de faturas (PAYMENT_RECEIVED / PAYMENT_CONFIRMED).
 * Validação por token próprio (ASAAS_PAYMENT_WEBHOOK_TOKEN), sem requireAuth de usuário.
 */
import { timingSafeEqual } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeAsaasWebhookToken, readAsaasWebhookAccessToken } from './asaasTransferApproval.js';

export const ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV = 'ASAAS_PAYMENT_WEBHOOK_TOKEN';

export type AsaasPaymentWebhookBody = {
  event?: string;
  payment?: {
    id?: string;
    status?: string;
    externalReference?: string;
  };
};

export function getConfiguredAsaasPaymentWebhookToken(): string {
  return normalizeAsaasWebhookToken(process.env[ASAAS_PAYMENT_WEBHOOK_TOKEN_ENV]);
}

function tokensEqual(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyAsaasPaymentWebhookRequest(req: {
  headers?: Record<string, string | string[] | undefined>;
}): { ok: boolean; configured: boolean; reason?: string } {
  const expected = getConfiguredAsaasPaymentWebhookToken();
  if (!expected) {
    return { ok: false, configured: false, reason: 'webhook_not_configured' };
  }
  const received = readAsaasWebhookAccessToken(req);
  if (!received) {
    return { ok: false, configured: true, reason: 'token_missing' };
  }
  if (!tokensEqual(expected, received)) {
    return { ok: false, configured: true, reason: 'token_invalid' };
  }
  return { ok: true, configured: true };
}

/**
 * Processa evento de pagamento. Idempotência comportamental: reprocessar o mesmo
 * payment.id mantém status PAGA (sem tabela de dedup — dependência futura se necessário).
 */
export async function processAsaasPaymentWebhookEvent(
  body: AsaasPaymentWebhookBody,
  supabase: SupabaseClient,
): Promise<{ received: true; processed: boolean; matched?: number; note?: string }> {
  const { event, payment } = body || {};
  const paymentId = payment?.id ? String(payment.id) : '';

  if (!['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].includes(String(event || '')) || !paymentId) {
    return { received: true, processed: false, note: 'event_ignored' };
  }

  const orParts: string[] = [`asaas_payment_id.eq.${paymentId}`];
  if (payment?.externalReference) {
    const nfNumber = String(payment.externalReference).replace(/^NF-/, '').replace(/^TMSEG-/, '');
    if (nfNumber) orParts.push(`number.eq.${nfNumber}`);
  }

  const { data: invoices } = await supabase
    .from('financial_invoices')
    .select('id, number, client')
    .or(orParts.join(','));

  if (!invoices?.length) {
    return { received: true, processed: false, note: 'no_invoice_match' };
  }

  for (const inv of invoices) {
    await supabase
      .from('financial_invoices')
      .update({
        status: 'PAGA',
        asaas_status: payment?.status || 'RECEIVED',
      })
      .eq('id', inv.id);

    await supabase
      .from('financial_transactions')
      .update({ status: 'PAID', paid_date: new Date().toISOString().split('T')[0] })
      .ilike('description', `%${inv.number}%`)
      .eq('status', 'PENDING');
  }

  return { received: true, processed: true, matched: invoices.length };
}
