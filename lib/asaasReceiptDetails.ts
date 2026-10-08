import { receivableMatchFilter } from './invoiceReceivableSync.js';

export const ASAAS_RECEIPT_MARKER = '<!--TMSEG_ASAAS_RECEIPT:';
const PAYMENTS_NOTES_MARKER = '<!--TMSEG_PAYMENTS-->';

export type AsaasReceiptPayment = {
  id?: string;
  status?: string;
  value?: number | string | null;
  netValue?: number | string | null;
  originalValue?: number | string | null;
  interestValue?: number | string | null;
  paymentDate?: string | null;
  customerPaymentDate?: string | null;
  clientPaymentDate?: string | null;
  confirmedDate?: string | null;
  creditDate?: string | null;
  externalReference?: string | null;
};

export type AsaasReceiptDetails = {
  paymentId: string;
  paidAmount: number;
  paymentDate: string;
  originalAmount: number | null;
  interestAndFineAmount: number;
  discountAmount: number;
  netAmount: number | null;
  feeAmount: number;
  status: string;
  creditDate: string | null;
  availability: 'AVAILABLE' | 'SCHEDULED' | 'UNKNOWN';
};

function money(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100) / 100;
}

function dateOnly(value: unknown): string | null {
  const date = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/** Dados oficiais da baixa retornados pelo Asaas. Ausência não vira valor presumido. */
export function normalizeAsaasReceipt(payment: AsaasReceiptPayment): AsaasReceiptDetails {
  const paymentId = String(payment?.id || '').trim();
  const paidAmount = money(payment?.value);
  const paymentDate = dateOnly(
    payment?.customerPaymentDate
      || payment?.clientPaymentDate
      || payment?.paymentDate
      || payment?.confirmedDate,
  );
  if (!paymentId) throw new Error('Pagamento Asaas sem identificador');
  if (paidAmount === null || paidAmount <= 0) {
    throw new Error(`Pagamento Asaas ${paymentId} sem valor recebido`);
  }
  if (!paymentDate) {
    throw new Error(`Pagamento Asaas ${paymentId} sem data de pagamento`);
  }

  const originalAmount = money(payment?.originalValue);
  const interestAndFineAmount = Math.max(0, money(payment?.interestValue) || 0);
  const expectedWithCharges = originalAmount === null
    ? paidAmount
    : originalAmount + interestAndFineAmount;
  const discountAmount = Math.round(Math.max(0, expectedWithCharges - paidAmount) * 100) / 100;
  const netAmount = money(payment?.netValue);
  const feeAmount = netAmount === null
    ? 0
    : Math.round(Math.max(0, paidAmount - netAmount) * 100) / 100;
  const status = String(payment.status || '').toUpperCase();
  const creditDate = dateOnly(payment?.creditDate);
  const availability = ['RECEIVED', 'RECEIVED_IN_CASH'].includes(status)
    ? 'AVAILABLE'
    : status === 'CONFIRMED'
      ? 'SCHEDULED'
      : 'UNKNOWN';

  return {
    paymentId,
    paidAmount,
    paymentDate,
    originalAmount,
    interestAndFineAmount,
    discountAmount,
    netAmount,
    feeAmount,
    status,
    creditDate,
    availability,
  };
}

function receiptMarker(details: AsaasReceiptDetails): string {
  return `${ASAAS_RECEIPT_MARKER}${JSON.stringify(details)}-->`;
}

/** Mantém o histórico de pagamentos parciais no fim das observações. */
export function upsertAsaasReceiptNote(
  notes: string | null | undefined,
  details: AsaasReceiptDetails,
): string {
  const raw = String(notes || '');
  const paymentsAt = raw.indexOf(PAYMENTS_NOTES_MARKER);
  const text = paymentsAt >= 0 ? raw.slice(0, paymentsAt).trimEnd() : raw.trimEnd();
  const payments = paymentsAt >= 0 ? raw.slice(paymentsAt) : '';
  const withoutOld = text
    .replace(/<!--TMSEG_ASAAS_RECEIPT:\{.*?\}-->/gs, '')
    .replace(/\s+$/, '');
  const next = [withoutOld, receiptMarker(details)].filter(Boolean).join('\n');
  return payments ? `${next}\n\n${payments}` : next;
}

export function extractAsaasReceiptDetails(
  notes: string | null | undefined,
): AsaasReceiptDetails | null {
  const match = String(notes || '').match(/<!--TMSEG_ASAAS_RECEIPT:(\{.*?\})-->/s);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as AsaasReceiptDetails;
    if (!parsed?.paymentId || !parsed?.paymentDate || Number(parsed?.paidAmount) <= 0) return null;
    const status = String(parsed.status || '').toUpperCase();
    return {
      ...parsed,
      creditDate: dateOnly(parsed.creditDate),
      availability: parsed.availability
        || (['RECEIVED', 'RECEIVED_IN_CASH'].includes(status)
          ? 'AVAILABLE'
          : status === 'CONFIRMED' ? 'SCHEDULED' : 'UNKNOWN'),
    };
  } catch {
    return null;
  }
}

type InvoiceForReceipt = {
  id: string;
  number?: string | null;
  notes?: string | null;
};

/**
 * Replica a baixa oficial no Contas a Receber sem alterar o valor nominal
 * (`amount`) do título. O recebido, data, juros/multa e líquido ficam no marcador.
 */
export async function syncAsaasReceiptToReceivables(
  sb: any,
  invoice: InvoiceForReceipt,
  payment: AsaasReceiptPayment,
): Promise<{ details: AsaasReceiptDetails; transactions: number }> {
  const details = normalizeAsaasReceipt(payment);
  const number = String(invoice.number || '').trim();
  if (!number) return { details, transactions: 0 };

  const { data: transactions, error: readError } = await sb
    .from('financial_transactions')
    .select('id, amount, notes')
    .eq('type', 'INCOME')
    .or(receivableMatchFilter(number, details.paymentId));
  if (readError) throw readError;

  let updated = 0;
  for (const transaction of transactions || []) {
    const patch = {
      status: 'PAID',
      payment_date: details.paymentDate,
      amount_paid: details.paidAmount,
      amount_open: 0,
      notes: upsertAsaasReceiptNote(transaction.notes, details),
      updated_by: 'Integração Asaas',
    };
    const { error } = await sb
      .from('financial_transactions')
      .update(patch)
      .eq('id', transaction.id);
    if (error) throw error;
    updated += 1;
  }
  return { details, transactions: updated };
}
