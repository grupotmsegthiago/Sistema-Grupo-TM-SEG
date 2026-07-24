/**
 * Espelha status da NF Asaas → financial_invoices (handler leve Vercel).
 * Limpa nf_last_error stale (ex.: 401 antigo) quando a NF já existe no Asaas.
 */
import { getInvoicesByPayment } from './asaasChargeApi.js';
import { createSupabaseAdminClient } from './supabaseAdmin.js';

export type NfStatusSyncResult = {
  checked: number;
  updated: number;
  clearedErrors: number;
  errors: number;
  items: Array<{
    id: string;
    number?: string | null;
    nf_status?: string | null;
    asaas_invoice_id?: string | null;
    clearedError?: boolean;
  }>;
};

function pickBestInvoice(list: any[]): any | null {
  if (!list.length) return null;
  return (
    list.find((i) => i.status === 'AUTHORIZED' || i.pdfUrl) ||
    list.find((i) => i.status === 'SCHEDULED' || i.status === 'SYNCHRONIZED') ||
    list[0] ||
    null
  );
}

/** Sincroniza NFs pendentes (PROCESSING/ERROR/…) com o estado real no Asaas. */
export async function syncPendingAsaasNfStatuses(opts?: {
  limit?: number;
  paymentId?: string;
}): Promise<NfStatusSyncResult> {
  const sb = createSupabaseAdminClient();
  const result: NfStatusSyncResult = {
    checked: 0,
    updated: 0,
    clearedErrors: 0,
    errors: 0,
    items: [],
  };
  if (!sb) return result;

  const limit = Math.max(1, Math.min(Number(opts?.limit) || 20, 40));
  let query = sb
    .from('financial_invoices')
    .select(
      'id, number, client, asaas_payment_id, asaas_invoice_id, issuer_company, nf_status, nf_last_error, status',
    )
    .not('asaas_payment_id', 'is', null)
    .in('status', ['EMITIDA', 'VENCIDA'])
    .or(
      'nf_status.is.null,nf_status.in.(PROCESSING,PENDING,SCHEDULED,SYNCHRONIZED,ERROR,FAILED,RETRY,STUCK)',
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (opts?.paymentId) {
    query = sb
      .from('financial_invoices')
      .select(
        'id, number, client, asaas_payment_id, asaas_invoice_id, issuer_company, nf_status, nf_last_error, status',
      )
      .eq('asaas_payment_id', opts.paymentId)
      .limit(5);
  }

  const { data: rows, error } = await query;
  if (error) {
    console.warn('[NF Sync Lite] listagem falhou:', error.message);
    return result;
  }

  for (const inv of rows || []) {
    if (!inv.asaas_payment_id) continue;
    result.checked++;
    try {
      const list = await getInvoicesByPayment(
        String(inv.asaas_payment_id),
        inv.issuer_company || undefined,
      );
      const nf = pickBestInvoice(list);
      if (!nf?.id) continue;

      const hadStaleError = !!String(inv.nf_last_error || '').trim();
      const patch: Record<string, unknown> = {
        asaas_invoice_id: nf.id,
        nf_status: nf.status || inv.nf_status || 'PROCESSING',
        nf_retry_at: new Date().toISOString(),
      };
      if (nf.number) patch.nf_number = String(nf.number);
      if (nf.pdfUrl) {
        patch.nf_image_url = nf.pdfUrl;
        patch.asaas_invoice_url = nf.pdfUrl;
        patch.nf_retry_paused = false;
      }
      const asaasErr = String(nf.statusDescription || '').trim();
      const nfStatusUpper = String(nf.status || '').toUpperCase();
      if ((nfStatusUpper === 'ERROR' || nfStatusUpper === 'FAILED') && asaasErr) {
        // Erro real da prefeitura/Asaas (ex.: falha de autenticação fiscal).
        patch.nf_last_error = asaasErr.slice(0, 500);
      } else if (nf.status === 'AUTHORIZED' || nf.pdfUrl) {
        patch.nf_last_error = null;
        patch.nf_retry_paused = false;
        if (hadStaleError) result.clearedErrors++;
      } else if (hadStaleError && nfStatusUpper !== 'ERROR' && nfStatusUpper !== 'FAILED') {
        // Qualquer NF ativa no Asaas invalida erro stale de chave/CEP antigo.
        patch.nf_last_error = null;
        result.clearedErrors++;
      }

      const { error: upErr } = await sb.from('financial_invoices').update(patch).eq('id', inv.id);
      if (upErr) {
        console.warn(`[NF Sync Lite] update ${inv.id}:`, upErr.message);
        result.errors++;
        continue;
      }
      result.updated++;
      result.items.push({
        id: inv.id,
        number: inv.number,
        nf_status: String(patch.nf_status || ''),
        asaas_invoice_id: String(nf.id),
        clearedError: hadStaleError,
      });
    } catch (e: any) {
      result.errors++;
      console.warn(`[NF Sync Lite] ${inv.id}:`, e?.message || e);
    }
  }

  return result;
}
