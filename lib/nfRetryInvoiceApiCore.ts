/**
 * Retry manual individual de NF — SSOT compartilhada entre Express e handler Vercel leve.
 * Reutiliza retryOne do worker (ou bundle CJS) sem duplicar scheduleInvoice.
 */
import { createSupabaseAdminClient } from './supabaseAdmin.js';

export type ManualRetryInvoiceRow = {
  id: string;
  client?: string | null;
  number?: string | null;
  amount?: number | null;
  asaas_payment_id?: string | null;
  asaas_invoice_id?: string | null;
  issuer_company?: string | null;
  nf_status?: string | null;
  nf_last_error?: string | null;
  nf_retry_count?: number | null;
  nf_retry_paused?: boolean | null;
  nf_provider?: string | null;
  plugnotas_invoice_id?: string | null;
  plugnotas_protocol?: string | null;
  due_date?: string | null;
  description?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

export type RetryOneResult = {
  ok: boolean;
  status?: string;
  pdfUrl?: string;
  number?: string;
  error?: string;
  paused?: boolean;
  action?: string;
};

const INVOICE_SELECT =
  'id, client, number, amount, asaas_payment_id, asaas_invoice_id, issuer_company, nf_status, nf_last_error, nf_retry_count, nf_retry_paused, nf_provider, plugnotas_invoice_id, plugnotas_protocol, due_date, description, notes, created_at';

export function inferNfProvider(inv: ManualRetryInvoiceRow): 'ASAAS' | 'PLUGNOTAS' {
  const rawProvider = String(inv.nf_provider || '').toUpperCase();
  return rawProvider === 'PLUGNOTAS' || (!rawProvider && inv.plugnotas_invoice_id)
    ? 'PLUGNOTAS'
    : 'ASAAS';
}

export function validateManualRetryInvoice(inv: ManualRetryInvoiceRow): string | null {
  const provider = inferNfProvider(inv);
  if (provider === 'PLUGNOTAS') {
    if (!inv.plugnotas_invoice_id) {
      return 'Fatura PlugNotas sem ID de integração — não pode reemitir.';
    }
    return null;
  }
  if (!inv.asaas_payment_id) {
    return 'Fatura sem ID Asaas — não pode reemitir NF pelo Asaas.';
  }
  return null;
}

export async function loadInvoiceForManualRetry(
  invoiceId: string,
  listPendingNfs?: () => Promise<ManualRetryInvoiceRow[]>,
): Promise<ManualRetryInvoiceRow | null> {
  const id = String(invoiceId || '').trim();
  if (!id) return null;

  if (listPendingNfs) {
    try {
      const pending = await listPendingNfs();
      const found = pending.find((row) => row.id === id);
      if (found) return found;
    } catch {
      /* fallback Supabase */
    }
  }

  const sb = createSupabaseAdminClient();
  if (!sb) return null;
  const { data } = await sb
    .from('financial_invoices')
    .select(INVOICE_SELECT)
    .eq('id', id)
    .maybeSingle();
  return (data as ManualRetryInvoiceRow | null) ?? null;
}

export async function unpauseManualRetryInvoice(inv: ManualRetryInvoiceRow): Promise<ManualRetryInvoiceRow> {
  if (!inv.nf_retry_paused) return inv;
  const sb = createSupabaseAdminClient();
  if (!sb) return inv;
  await sb.from('financial_invoices').update({ nf_retry_paused: false }).eq('id', inv.id);
  return { ...inv, nf_retry_paused: false };
}

export async function executeManualInvoiceRetry(
  invoiceId: string,
  retryOneFn: (inv: ManualRetryInvoiceRow) => Promise<RetryOneResult>,
  opts?: { listPendingNfs?: () => Promise<ManualRetryInvoiceRow[]> },
): Promise<
  | { httpStatus: 404; body: { success: false; error: string } }
  | { httpStatus: 400; body: { success: false; error: string } }
  | { httpStatus: 200; body: { success: boolean } & RetryOneResult & { unpaused: boolean; liteHandler?: boolean } }
> {
  const inv = await loadInvoiceForManualRetry(invoiceId, opts?.listPendingNfs);
  if (!inv) {
    return { httpStatus: 404, body: { success: false, error: 'Fatura não encontrada' } };
  }

  const validationError = validateManualRetryInvoice(inv);
  if (validationError) {
    return { httpStatus: 400, body: { success: false, error: validationError } };
  }

  const wasPaused = !!inv.nf_retry_paused;
  const ready = await unpauseManualRetryInvoice(inv);
  const result = await retryOneFn(ready);

  return {
    httpStatus: 200,
    body: {
      success: result.ok,
      unpaused: wasPaused,
      ...result,
    },
  };
}
