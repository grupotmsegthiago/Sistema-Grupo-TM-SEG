/**
 * Cancelamento único da fatura: Controle de NF, título em Contas a Receber,
 * boleto no Asaas e NFS-e. O número TMSEG fica na observação do título
 * (`Fatura {número}`), não na descrição.
 */
import { isCanceledNfStatus } from './invoiceDisplay.js';
import { receivableMatchFilter } from './invoiceReceivableSync.js';

const OPEN_RECEIVABLE_STATUSES = ['PENDING', 'PARTIALLY_PAID', 'OVERDUE', 'SCHEDULED'] as const;
const OPEN_COMMISSION_STATUSES = ['AGUARDANDO_PAGAMENTO_CLIENTE', 'LIBERADO_PARA_PAGAMENTO'] as const;

export type InvoiceCancelRow = {
  id: string;
  number?: string | null;
  status?: string | null;
  asaas_payment_id?: string | null;
  asaas_invoice_id?: string | null;
  asaas_status?: string | null;
  issuer_company?: string | null;
  nf_status?: string | null;
  nf_provider?: string | null;
  plugnotas_invoice_id?: string | null;
};

export type CancelExternalStep = {
  attempted: boolean;
  ok: boolean;
  status: string | null;
  error: string | null;
};

export type CancelFinancialInvoiceResult = {
  ok: boolean;
  httpStatus: number;
  error: string | null;
  invoiceId: string;
  number: string | null;
  receivablesUpdated: number;
  boleto: CancelExternalStep;
  nf: CancelExternalStep;
};

type QueryError = { message: string } | null;
type QueryResult = { data: unknown; error: QueryError };

export type InvoiceCancelDb = {
  from: (table: string) => {
    select: (columns?: string) => InvoiceCancelQuery;
    update: (patch: Record<string, unknown>) => InvoiceCancelQuery;
  };
};

type InvoiceCancelQuery = {
  eq: (column: string, value: unknown) => InvoiceCancelQuery;
  in: (column: string, values: readonly string[]) => InvoiceCancelQuery;
  or: (filters: string) => InvoiceCancelQuery;
  maybeSingle: () => PromiseLike<QueryResult>;
  then: PromiseLike<QueryResult>['then'];
};

export type InvoiceCancelPorts = {
  sb: InvoiceCancelDb;
  invoiceId: string;
  getPayment: (paymentId: string, company?: string) => Promise<{ status?: string | null; deleted?: boolean | null }>;
  deletePayment: (paymentId: string, company?: string) => Promise<{ status?: string | null; deleted?: boolean | null }>;
  cancelAsaasNf: (asaasInvoiceId: string, company?: string) => Promise<unknown>;
  cancelPlugnotasNf: (plugnotasId: string) => Promise<unknown>;
};

function blankStep(): CancelExternalStep {
  return { attempted: false, ok: true, status: null, error: null };
}

function failStep(error: string): CancelExternalStep {
  return { attempted: true, ok: false, status: null, error };
}

export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function isMissingAsaasCharge(err: unknown): boolean {
  const msg = messageOf(err);
  return /Asaas API Error \(404\)/i.test(msg) || /n[aã]o encontrad|not found/i.test(msg);
}

export function isAsaasChargeReceived(status?: string | null): boolean {
  return ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(String(status || '').toUpperCase());
}

/** Filtro do título. Sem número e sem cobrança, não consulta (evita pegar a base inteira). */
export function buildReceivableCancelFilter(number?: string | null, asaasPaymentId?: string | null): string | null {
  const n = String(number || '').replace(/[,()]/g, '').trim();
  const pay = String(asaasPaymentId || '').replace(/[,()]/g, '').trim();
  if (!n && !pay) return null;
  if (!n) return `notes.ilike.%${pay}%`;
  return receivableMatchFilter(n, pay || null);
}

export type NfCancelTarget = 'none' | 'asaas' | 'plugnotas' | 'missing-id';

/** Só nota autorizada entra no cancelamento externo. */
export function nfCancelTarget(invoice: Pick<InvoiceCancelRow, 'nf_status' | 'nf_provider' | 'asaas_invoice_id' | 'plugnotas_invoice_id'>): NfCancelTarget {
  if (isCanceledNfStatus(invoice.nf_status)) return 'none';
  if (String(invoice.nf_status || '').toUpperCase() !== 'AUTHORIZED') return 'none';
  const provider = String(invoice.nf_provider || 'ASAAS').toUpperCase();
  if (provider === 'PLUGNOTAS') {
    return String(invoice.plugnotas_invoice_id || '').trim() ? 'plugnotas' : 'missing-id';
  }
  return String(invoice.asaas_invoice_id || '').trim() ? 'asaas' : 'missing-id';
}

function issuerCompany(invoice: InvoiceCancelRow): string | undefined {
  const name = String(invoice.issuer_company || '').trim();
  return name || undefined;
}

export async function cancelLinkedReceivables(
  sb: InvoiceCancelDb,
  number?: string | null,
  asaasPaymentId?: string | null,
): Promise<{ updated: number; error: string | null }> {
  const filter = buildReceivableCancelFilter(number, asaasPaymentId);
  if (!filter) return { updated: 0, error: null };
  const { data, error } = await sb
    .from('financial_transactions')
    .update({ status: 'CANCELLED', amount_open: 0 })
    .or(filter)
    .eq('type', 'INCOME')
    .in('status', OPEN_RECEIVABLE_STATUSES)
    .select('id');
  if (error) return { updated: 0, error: error.message };
  return { updated: Array.isArray(data) ? data.length : 0, error: null };
}

async function cancelOpenCommission(sb: InvoiceCancelDb, invoiceId: string): Promise<void> {
  try {
    await sb
      .from('comissoes')
      .update({ status: 'CANCELADO' })
      .eq('fatura_id', invoiceId)
      .in('status', OPEN_COMMISSION_STATUSES);
  } catch {
    /* comissão é acessória; a fatura e o título seguem */
  }
}

export async function cancelFinancialInvoice(ports: InvoiceCancelPorts): Promise<CancelFinancialInvoiceResult> {
  const base = {
    invoiceId: ports.invoiceId,
    number: null as string | null,
    receivablesUpdated: 0,
    boleto: blankStep(),
    nf: blankStep(),
  };

  const loaded = await ports.sb
    .from('financial_invoices')
    .select('id, number, status, asaas_payment_id, asaas_invoice_id, asaas_status, issuer_company, nf_status, nf_provider, plugnotas_invoice_id')
    .eq('id', ports.invoiceId)
    .maybeSingle();
  if (loaded.error) {
    return { ...base, ok: false, httpStatus: 500, error: loaded.error.message };
  }
  const invoice = loaded.data as InvoiceCancelRow | null;
  if (!invoice?.id) {
    return { ...base, ok: false, httpStatus: 404, error: 'Fatura não encontrada.' };
  }
  base.number = invoice.number || null;
  if (String(invoice.status || '').toUpperCase() === 'PAGA') {
    return { ...base, ok: false, httpStatus: 409, error: 'Fatura paga não é cancelada.' };
  }

  const saved = await ports.sb
    .from('financial_invoices')
    .update({ status: 'CANCELADA', nf_retry_paused: true })
    .eq('id', invoice.id);
  if (saved.error) {
    return { ...base, ok: false, httpStatus: 500, error: saved.error.message };
  }

  const receivables = await cancelLinkedReceivables(ports.sb, invoice.number, invoice.asaas_payment_id);
  base.receivablesUpdated = receivables.updated;
  await cancelOpenCommission(ports.sb, invoice.id);

  const company = issuerCompany(invoice);
  const paymentId = String(invoice.asaas_payment_id || '').trim();
  if (paymentId) {
    base.boleto = { attempted: true, ok: false, status: null, error: null };
    try {
      const payment = await ports.getPayment(paymentId, company);
      if (isAsaasChargeReceived(payment?.status)) {
        base.boleto = failStep('Cobrança já recebida no Asaas. O boleto não foi cancelado.');
        base.boleto.status = String(payment.status || '');
      } else {
        const removed = await ports.deletePayment(paymentId, company);
        const asaasStatus = String(removed?.status || (removed?.deleted ? 'DELETED' : 'DELETED'));
        base.boleto = { attempted: true, ok: true, status: asaasStatus, error: null };
        await ports.sb.from('financial_invoices').update({ asaas_status: asaasStatus }).eq('id', invoice.id);
      }
    } catch (err) {
      if (isMissingAsaasCharge(err)) {
        base.boleto = { attempted: true, ok: true, status: 'DELETED', error: null };
        await ports.sb.from('financial_invoices').update({ asaas_status: 'DELETED' }).eq('id', invoice.id);
      } else {
        base.boleto = failStep(messageOf(err));
      }
    }
  }

  const target = nfCancelTarget(invoice);
  if (target === 'missing-id') {
    base.nf = failStep('Nota autorizada sem identificador para cancelar no emissor.');
  } else if (target === 'asaas') {
    base.nf = { attempted: true, ok: false, status: null, error: null };
    try {
      await ports.cancelAsaasNf(String(invoice.asaas_invoice_id), company);
      base.nf = { attempted: true, ok: true, status: 'CANCELED', error: null };
      await ports.sb.from('financial_invoices').update({ nf_status: 'CANCELED' }).eq('id', invoice.id);
    } catch (err) {
      base.nf = failStep(messageOf(err));
    }
  } else if (target === 'plugnotas') {
    base.nf = { attempted: true, ok: false, status: null, error: null };
    try {
      await ports.cancelPlugnotasNf(String(invoice.plugnotas_invoice_id));
      base.nf = { attempted: true, ok: true, status: 'CANCELED', error: null };
      await ports.sb.from('financial_invoices').update({ nf_status: 'CANCELED' }).eq('id', invoice.id);
    } catch (err) {
      base.nf = failStep(messageOf(err));
    }
  }

  const externalError = [receivables.error, base.boleto.error, base.nf.error].filter(Boolean).join(' ');
  const ok = !receivables.error && base.boleto.ok && base.nf.ok;
  return {
    ...base,
    ok,
    httpStatus: 200,
    error: externalError || null,
  };
}
