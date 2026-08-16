/**
 * SSOT — POST /api/asaas/sync-open-payments
 * Sincroniza cobranças em aberto com o Asaas (sem emitir NF).
 */
import {
  getInvoicesByPayment,
  getPayment,
} from './asaasChargeApi.js';
import { createSupabaseAdminClient } from './supabaseAdmin.js';

export type SyncOpenPaymentsResult = {
  success: true;
  checked: number;
  markedPaid: number;
  markedOverdue: number;
  nfUpdated: number;
  errors: number;
  paidIds: string[];
};

function parseLimit(queryLimit: unknown, bodyLimit: unknown): number {
  const raw = Number(queryLimit ?? bodyLimit);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 40) : 15;
}

export async function runAsaasSyncOpenPayments(params: {
  queryLimit?: unknown;
  bodyLimit?: unknown;
}): Promise<SyncOpenPaymentsResult> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error('Supabase admin indisponível');
  }

  const limit = parseLimit(params.queryLimit, params.bodyLimit);
  const { data: openInvs, error } = await supabase
    .from('financial_invoices')
    .select(
      'id, number, client, asaas_payment_id, issuer_company, status, nf_status, nf_provider, plugnotas_invoice_id, nf_image_url, asaas_bankslip_url',
    )
    .in('status', ['EMITIDA', 'VENCIDA'])
    .not('asaas_payment_id', 'is', null)
    .order('boleto_due_date', { ascending: true, nullsFirst: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  let checked = 0;
  let markedPaid = 0;
  let markedOverdue = 0;
  let nfUpdated = 0;
  let errors = 0;
  const paidIds: string[] = [];

  for (const inv of openInvs || []) {
    if (!inv.asaas_payment_id) continue;
    checked++;
    try {
      const payment = await getPayment(inv.asaas_payment_id, inv.issuer_company || undefined);
      const isPaid = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(payment.status);
      const patch: Record<string, unknown> = { asaas_status: payment.status };
      if (payment.invoiceUrl) patch.asaas_invoice_url = payment.invoiceUrl;
      if (payment.bankSlipUrl) {
        patch.asaas_bankslip_url = payment.bankSlipUrl;
        patch.boleto_image_url = payment.bankSlipUrl;
      }

      if (isPaid) {
        patch.status = 'PAGA';
        markedPaid++;
        paidIds.push(inv.id);
        if (inv.number) {
          await supabase
            .from('financial_transactions')
            .update({ status: 'PAID', paid_date: new Date().toISOString().split('T')[0] })
            .ilike('description', `%${inv.number}%`)
            .eq('status', 'PENDING');
        }
      } else if (payment.status === 'OVERDUE' && inv.status !== 'VENCIDA') {
        patch.status = 'VENCIDA';
        markedOverdue++;
      }

      const prov = String(inv.nf_provider || '').toUpperCase();
      const isPlug = prov === 'PLUGNOTAS' || (!!inv.plugnotas_invoice_id && !prov);
      if (!isPlug && inv.nf_status !== 'AUTHORIZED') {
        try {
          const list = await getInvoicesByPayment(
            inv.asaas_payment_id,
            inv.issuer_company || undefined,
          );
          const nfData =
            list.find((i: { status?: string; pdfUrl?: string }) => i.status === 'AUTHORIZED' || i.pdfUrl) ||
            list.find((i: { status?: string }) => i.status === 'SCHEDULED' || i.status === 'SYNCHRONIZED') ||
            list[0];
          if (nfData) {
            if (nfData.status) patch.nf_status = nfData.status;
            if (nfData.number) patch.nf_number = String(nfData.number);
            if (nfData.pdfUrl) {
              patch.nf_image_url = nfData.pdfUrl;
              patch.nf_retry_paused = false;
            }
            if (nfData.id) patch.asaas_invoice_id = nfData.id;
            if (nfData.status === 'AUTHORIZED' || nfData.pdfUrl) nfUpdated++;
          } else if (!inv.nf_status) {
            patch.nf_status = 'PROCESSING';
          }
        } catch {
          /* NF sync best-effort */
        }
      }

      await supabase.from('financial_invoices').update(patch).eq('id', inv.id);
    } catch (e: unknown) {
      errors++;
      const message = e instanceof Error ? e.message : String(e);
      console.log(`[Asaas Sync Open] falha fatura ${inv.id}: ${message}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  return {
    success: true,
    checked,
    markedPaid,
    markedOverdue,
    nfUpdated,
    errors,
    paidIds,
  };
}
