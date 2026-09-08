/**
 * SSOT — POST /api/asaas/sync-open-payments
 * Sincroniza cobranças em aberto com o Asaas (sem emitir NF).
 */
import {
  getInvoicesByPayment,
  getPayment,
} from './asaasChargeApi.js';
import { createSupabaseAdminClient } from './supabaseAdmin.js';
import { isCanceledNfStatus, overdueDays } from './invoiceDisplay.js';
import { atualizarStatusAposBaixaCliente } from './comissao/comissaoCore.js';

export type SyncOpenPaymentsResult = {
  success: true;
  checked: number;
  markedPaid: number;
  markedOverdue: number;
  markedCancelled: number;
  dueDateUpdated: number;
  nfUpdated: number;
  errors: number;
  paidIds: string[];
};

export type AsaasOpenPaymentLike = {
  status?: string;
  deleted?: boolean;
  dueDate?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
};

export function isAsaasPaymentCancelled(payment: AsaasOpenPaymentLike | null | undefined): boolean {
  if (!payment) return false;
  if (payment.deleted === true) return true;
  const st = String(payment.status || '').toUpperCase();
  return st === 'DELETED' || st === 'CANCELLED' || st === 'CANCELED' || st === 'REFUNDED';
}

/** Não recua vencimento local (prorrogação no Contas a Receber) com data mais antiga do Asaas. */
export function preferLaterDueDate(...dates: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  for (const raw of dates) {
    const due = String(raw || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) continue;
    if (!best || due > best) best = due;
  }
  return best;
}

export function isAsaasPaymentPaid(payment: AsaasOpenPaymentLike | null | undefined): boolean {
  return ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(String(payment.status || '').toUpperCase());
}

export function isAsaasGoneError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Asaas API Error \(404\)/i.test(msg) || /n[aã]o encontrad|not found/i.test(msg);
}

function parseLimit(queryLimit: unknown, bodyLimit: unknown): number {
  const raw = Number(queryLimit ?? bodyLimit);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 40) : 15;
}

function dueDateFromPayment(payment: AsaasOpenPaymentLike): string | null {
  const due = String(payment.dueDate || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null;
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
      'id, number, client, asaas_payment_id, issuer_company, status, nf_status, nf_provider, plugnotas_invoice_id, nf_image_url, asaas_bankslip_url, boleto_due_date',
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
  let markedCancelled = 0;
  let dueDateUpdated = 0;
  let nfUpdated = 0;
  let errors = 0;
  const paidIds: string[] = [];

  const markCancelled = async (inv: { id: string; number?: string | null }, asaasStatus: string) => {
    await supabase.from('financial_invoices').update({
      status: 'CANCELADA',
      asaas_status: asaasStatus,
      nf_retry_paused: true,
    }).eq('id', inv.id);
    if (inv.number) {
      await supabase
        .from('financial_transactions')
        .update({ status: 'CANCELLED' })
        .ilike('description', `%${inv.number}%`)
        .eq('status', 'PENDING');
    }
    try {
      await supabase
        .from('comissoes')
        .update({ status: 'CANCELADO' })
        .eq('fatura_id', inv.id)
        .in('status', ['AGUARDANDO_PAGAMENTO_CLIENTE', 'LIBERADO_PARA_PAGAMENTO']);
    } catch {
      /* comissão opcional */
    }
    markedCancelled++;
  };

  for (const inv of openInvs || []) {
    if (!inv.asaas_payment_id) continue;
    checked++;
    try {
      if (isCanceledNfStatus(inv.nf_status)) {
        await markCancelled(inv, 'CANCELED');
        continue;
      }

      const payment = await getPayment(inv.asaas_payment_id, inv.issuer_company || undefined);
      if (isAsaasPaymentCancelled(payment)) {
        await markCancelled(inv, payment.status || 'DELETED');
        continue;
      }

      const patch: Record<string, unknown> = { asaas_status: payment.status };
      if (payment.invoiceUrl) patch.asaas_invoice_url = payment.invoiceUrl;
      if (payment.bankSlipUrl) {
        patch.asaas_bankslip_url = payment.bankSlipUrl;
        patch.boleto_image_url = payment.bankSlipUrl;
      }

      let txDue: string | null = null;
      if (inv.number) {
        const { data: txs } = await supabase
          .from('financial_transactions')
          .select('due_date, status')
          .or(`notes.ilike.%${inv.number}%,description.ilike.%${inv.number}%`)
          .limit(5);
        for (const tx of txs || []) {
          const st = String(tx.status || '').toUpperCase();
          if (st === 'CANCELLED' || st === 'CANCELED') continue;
          txDue = preferLaterDueDate(txDue, tx.due_date);
        }
      }

      const localDue = String(inv.boleto_due_date || '').slice(0, 10);
      const asaasDue = dueDateFromPayment(payment);
      const effectiveDue = preferLaterDueDate(localDue, asaasDue, txDue);
      if (effectiveDue && effectiveDue !== localDue) {
        patch.boleto_due_date = effectiveDue;
        dueDateUpdated++;
      }

      if (isAsaasPaymentPaid(payment)) {
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
      } else {
        const days = overdueDays(effectiveDue);
        const isPastDue = days !== null && days > 0;
        if (isPastDue && inv.status !== 'VENCIDA') {
          patch.status = 'VENCIDA';
          markedOverdue++;
        } else if (!isPastDue && inv.status === 'VENCIDA') {
          patch.status = 'EMITIDA';
        }
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
      if (patch.status === 'PAGA') {
        try {
          await atualizarStatusAposBaixaCliente(supabase, String(inv.id));
        } catch {
          /* comissão opcional */
        }
      }
    } catch (e: unknown) {
      if (isAsaasGoneError(e)) {
        try {
          await markCancelled(inv, 'DELETED');
          continue;
        } catch {
          /* cai no erro abaixo */
        }
      }
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
    markedCancelled,
    dueDateUpdated,
    nfUpdated,
    errors,
    paidIds,
  };
}
