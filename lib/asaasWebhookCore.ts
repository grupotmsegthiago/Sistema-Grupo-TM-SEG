/**
 * SSOT — POST /api/asaas/webhook
 * Baixa automática de faturas (sem token SEC-03 — comportamento legado).
 */
import { createSupabaseAdminClient } from './supabaseAdmin.js';

export type AsaasWebhookPayload = {
  event?: string;
  payment?: {
    id?: string;
    status?: string;
    externalReference?: string;
  };
};

export type AsaasWebhookResult = {
  received: true;
  error?: string;
};

export async function handleAsaasPaymentWebhook(body: AsaasWebhookPayload): Promise<AsaasWebhookResult> {
  const { event, payment } = body || {};
  console.log(`[Asaas Webhook] Evento: ${event} | Payment: ${payment?.id}`);

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error('Supabase admin indisponível');
  }

  if (['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].includes(String(event || '')) && payment?.id) {
    const orParts: string[] = [`asaas_payment_id.eq.${payment.id}`];
    if (payment.externalReference) {
      const nfNumber = String(payment.externalReference).replace(/^NF-/, '').replace(/^TMSEG-/, '');
      if (nfNumber) orParts.push(`number.eq.${nfNumber}`);
    }
    const { data: invoices } = await supabase
      .from('financial_invoices')
      .select('id, number, client')
      .or(orParts.join(','));

    if (invoices && invoices.length > 0) {
      for (const inv of invoices) {
        await supabase
          .from('financial_invoices')
          .update({
            status: 'PAGA',
            asaas_status: payment.status || 'RECEIVED',
          })
          .eq('id', inv.id);

        await supabase
          .from('financial_transactions')
          .update({ status: 'PAID', paid_date: new Date().toISOString().split('T')[0] })
          .ilike('description', `%${inv.number}%`)
          .eq('status', 'PENDING');

        console.log(`[Asaas Webhook] Baixa automática: NF ${inv.number} — ${inv.client}`);
      }
    } else {
      console.log(
        `[Asaas Webhook] Pagamento ${payment.id} sem fatura vinculada (ref=${payment.externalReference || '—'})`,
      );
    }
  }

  return { received: true };
}
