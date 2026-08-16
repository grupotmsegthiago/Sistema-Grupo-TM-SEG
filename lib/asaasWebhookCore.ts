/**
 * SSOT — POST /api/asaas/webhook
 * Baixa automática de faturas. A autenticação SEC-03 ocorre nos handlers
 * Vercel/Express antes de esta função criar o cliente Supabase.
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

export type AsaasWebhookCoreDeps = {
  createAdminClient?: () => ReturnType<typeof createSupabaseAdminClient>;
  today?: () => string;
  log?: (message: string) => void;
};

export async function handleAsaasPaymentWebhook(
  body: AsaasWebhookPayload | null | undefined,
  deps: AsaasWebhookCoreDeps = {},
): Promise<AsaasWebhookResult> {
  // Paridade Express legado: const { event, payment } = req.body (lança se body ausente)
  const { event, payment } = body as AsaasWebhookPayload;
  const log = deps.log ?? console.log;
  log(`[Asaas Webhook] Evento: ${event} | Payment: ${payment?.id}`);

  const supabase = (deps.createAdminClient ?? createSupabaseAdminClient)();
  if (!supabase) {
    throw new Error('Supabase admin indisponível');
  }

  if (['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].includes(event as string) && payment?.id) {
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
          .update({
            status: 'PAID',
            paid_date: deps.today ? deps.today() : new Date().toISOString().split('T')[0],
          })
          .ilike('description', `%${inv.number}%`)
          // Idempotência existente: evento duplicado não atualiza transação já PAID.
          .eq('status', 'PENDING');

        log(`[Asaas Webhook] Baixa automática: NF ${inv.number} — ${inv.client}`);
      }
    } else {
      log(
        `[Asaas Webhook] Pagamento ${payment.id} sem fatura vinculada (ref=${payment.externalReference || '—'})`,
      );
    }
  }

  return { received: true };
}
