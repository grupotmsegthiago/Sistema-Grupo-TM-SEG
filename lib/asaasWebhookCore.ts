/**
 * SSOT — POST /api/asaas/webhook
 * Baixa automática de faturas. A autenticação SEC-03 ocorre nos handlers
 * Vercel/Express antes de esta função criar o cliente Supabase.
 */
import { createSupabaseAdminClient } from './supabaseAdmin.js';
import { atualizarStatusAposBaixaCliente } from './comissao/comissaoCore.js';
import { getPayment } from './asaasChargeApi.js';
import {
  normalizeAsaasReceipt,
  syncAsaasReceiptToReceivables,
  upsertAsaasReceiptNote,
  type AsaasReceiptPayment,
} from './asaasReceiptDetails.js';

export type AsaasWebhookPayload = {
  event?: string;
  payment?: AsaasReceiptPayment;
};

export type AsaasWebhookResult = {
  received: true;
  error?: string;
};

export type AsaasWebhookCoreDeps = {
  createAdminClient?: () => ReturnType<typeof createSupabaseAdminClient>;
  getPayment?: typeof getPayment;
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
      .select('id, number, client, amount, notes, issuer_company')
      .or(orParts.join(','));

    if (invoices && invoices.length > 0) {
      let paidPayment = payment;
      try {
        normalizeAsaasReceipt(paidPayment);
      } catch {
        const loadPayment = deps.getPayment ?? getPayment;
        paidPayment = await loadPayment(payment.id, invoices[0]?.issuer_company || undefined);
      }
      const receipt = normalizeAsaasReceipt(paidPayment);
      for (const inv of invoices) {
        await supabase
          .from('financial_invoices')
          .update({
            status: 'PAGA',
            asaas_status: paidPayment.status || payment.status || 'RECEIVED',
            notes: upsertAsaasReceiptNote(inv.notes, receipt),
          })
          .eq('id', inv.id);

        await syncAsaasReceiptToReceivables(supabase, inv, paidPayment);

        log(`[Asaas Webhook] Baixa automática: NF ${inv.number} — ${inv.client}`);
        try {
          await atualizarStatusAposBaixaCliente(
            supabase,
            String(inv.id),
            receipt.paymentDate,
          );
        } catch (e) {
          log(`[Asaas Webhook] Comissão (baixa) ignorada: ${e instanceof Error ? e.message : e}`);
        }
      }
    } else {
      log(
        `[Asaas Webhook] Pagamento ${payment.id} sem fatura vinculada (ref=${payment.externalReference || '—'})`,
      );
    }
  }

  try {
    const { syncPaidInvoicesToReceivables } = await import('./invoiceReceivableSync.js');
    await syncPaidInvoicesToReceivables(supabase);
  } catch {
    /* a fatura já foi marcada; a tela sincroniza de novo */
  }

  return { received: true };
}
