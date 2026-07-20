import { supabase } from '../supabase';
import { computePaymentSettlement, type ReceivedPaymentInput } from './partialPayments';

export type FinancialTransactionPayment = {
  id: string;
  transaction_id: string;
  amount: number;
  payment_date: string;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
};

/** Bloco embutido em financial_transactions.notes quando a tabela de pagamentos ainda não existe. */
export const PAYMENTS_NOTES_MARKER = '<!--TMSEG_PAYMENTS-->';

let paymentsTableAvailable: boolean | null = null;

function isMissingTableError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const msg = String(err.message || '');
  return err.code === '42P01' || err.code === 'PGRST205' || /financial_transaction_payments|schema cache/i.test(msg);
}

function isMissingColumnError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const msg = String(err.message || '');
  return err.code === '42703' || /amount_paid|amount_open|column/i.test(msg);
}

export function splitTitleNotes(notes: string | null | undefined): { text: string; payments: FinancialTransactionPayment[] } {
  const raw = String(notes || '');
  const idx = raw.indexOf(PAYMENTS_NOTES_MARKER);
  if (idx < 0) return { text: raw, payments: [] };
  const text = raw.slice(0, idx).replace(/\s+$/, '');
  const jsonPart = raw.slice(idx + PAYMENTS_NOTES_MARKER.length).trim();
  try {
    const parsed = JSON.parse(jsonPart);
    const list = Array.isArray(parsed) ? parsed : [];
    return {
      text,
      payments: list.map((p: any) => ({
        id: String(p.id || ''),
        transaction_id: String(p.transaction_id || ''),
        amount: Number(p.amount || 0),
        payment_date: String(p.payment_date || ''),
        notes: p.notes || '',
        created_by: p.created_by || '',
        created_at: p.created_at || '',
      })),
    };
  } catch {
    return { text, payments: [] };
  }
}

export function mergeTitleNotes(text: string, payments: FinancialTransactionPayment[]): string {
  const base = String(text || '').replace(/\s+$/, '');
  if (!payments.length) return base;
  const compact = payments.map((p) => ({
    id: p.id,
    transaction_id: p.transaction_id,
    amount: p.amount,
    payment_date: p.payment_date,
    notes: p.notes || '',
    created_by: p.created_by || '',
    created_at: p.created_at || '',
  }));
  return `${base}${base ? '\n\n' : ''}${PAYMENTS_NOTES_MARKER}${JSON.stringify(compact)}`;
}

async function probePaymentsTable(): Promise<boolean> {
  if (paymentsTableAvailable === true) return true;
  const { error } = await supabase
    .from('financial_transaction_payments')
    .select('id')
    .limit(1);
  if (error && isMissingTableError(error)) {
    paymentsTableAvailable = false;
    return false;
  }
  paymentsTableAvailable = true;
  return true;
}

async function updateTransactionSettlement(params: {
  transactionId: string;
  paid: number;
  open: number;
  status: string;
  paymentDate?: string | null;
  createdBy?: string;
  notes?: string;
}): Promise<string> {
  let nextStatus = params.status;
  const base: Record<string, unknown> = {
    status: nextStatus,
    updated_by: params.createdBy || undefined,
    amount_paid: params.paid,
    amount_open: params.open,
  };
  if (params.paymentDate !== undefined) base.payment_date = params.paymentDate;
  if (params.notes !== undefined) base.notes = params.notes;

  let { error } = await supabase.from('financial_transactions').update(base).eq('id', params.transactionId);

  if (error && nextStatus === 'PARTIALLY_PAID') {
    const retry = await supabase
      .from('financial_transactions')
      .update({ ...base, status: 'PENDING' })
      .eq('id', params.transactionId);
    if (!retry.error) {
      error = null;
      nextStatus = 'PENDING';
    } else {
      error = retry.error;
    }
  }

  // Colunas amount_* ainda não migradas: tenta sem elas
  if (error && isMissingColumnError(error)) {
    const slim: Record<string, unknown> = {
      status: nextStatus,
      updated_by: params.createdBy || undefined,
    };
    if (params.paymentDate !== undefined) slim.payment_date = params.paymentDate;
    if (params.notes !== undefined) slim.notes = params.notes;
    const retry = await supabase.from('financial_transactions').update(slim).eq('id', params.transactionId);
    if (retry.error && nextStatus === 'PARTIALLY_PAID') {
      const retry2 = await supabase
        .from('financial_transactions')
        .update({ ...slim, status: 'PENDING' })
        .eq('id', params.transactionId);
      if (!retry2.error) {
        nextStatus = 'PENDING';
        error = null;
      } else {
        error = retry2.error;
      }
    } else {
      error = retry.error;
    }
  }

  if (error) throw error;
  return nextStatus;
}

export async function listPaymentsForTransaction(
  transactionId: string,
  titleNotes?: string | null,
): Promise<FinancialTransactionPayment[]> {
  const useTable = await probePaymentsTable();
  if (useTable) {
    const { data, error } = await supabase
      .from('financial_transaction_payments')
      .select('*')
      .eq('transaction_id', transactionId)
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) {
      if (isMissingTableError(error)) {
        paymentsTableAvailable = false;
        return splitTitleNotes(titleNotes).payments;
      }
      throw error;
    }
    return (data || []) as FinancialTransactionPayment[];
  }
  return splitTitleNotes(titleNotes).payments;
}

export async function addPaymentToTransaction(params: {
  transactionId: string;
  titleAmount: number;
  titleNotes?: string | null;
  amount: number;
  paymentDate: string;
  notes?: string;
  createdBy?: string;
  previousStatus?: string | null;
}): Promise<{
  payment: FinancialTransactionPayment;
  paid: number;
  open: number;
  status: string;
  notes?: string;
}> {
  const useTable = await probePaymentsTable();
  const payment: FinancialTransactionPayment = {
    id: crypto.randomUUID(),
    transaction_id: params.transactionId,
    amount: params.amount,
    payment_date: params.paymentDate,
    notes: params.notes || '',
    created_by: params.createdBy || '',
    created_at: new Date().toISOString(),
  };

  let payments: FinancialTransactionPayment[] = [];
  let notesForUpdate: string | undefined;

  if (useTable) {
    const { data, error } = await supabase
      .from('financial_transaction_payments')
      .insert([
        {
          transaction_id: params.transactionId,
          amount: params.amount,
          payment_date: params.paymentDate,
          notes: params.notes || '',
          created_by: params.createdBy || '',
        },
      ])
      .select('*')
      .single();
    if (error) {
      if (!isMissingTableError(error)) throw error;
      paymentsTableAvailable = false;
    } else {
      Object.assign(payment, data);
      payments = await listPaymentsForTransaction(params.transactionId, params.titleNotes);
    }
  }

  if (!useTable || paymentsTableAvailable === false) {
    const split = splitTitleNotes(params.titleNotes);
    payments = [payment, ...split.payments];
    notesForUpdate = mergeTitleNotes(split.text, payments);
  }

  const settlement = computePaymentSettlement(
    params.titleAmount,
    payments as ReceivedPaymentInput[],
    splitTitleNotes(params.titleNotes).text,
  );

  let nextStatus = settlement.suggestedStatus;
  if (settlement.suggestedStatus === 'PENDING' && params.previousStatus) {
    const prev = String(params.previousStatus).toUpperCase();
    if (prev === 'SCHEDULED' || prev === 'OVERDUE') nextStatus = prev as typeof nextStatus;
  }

  nextStatus = await updateTransactionSettlement({
    transactionId: params.transactionId,
    paid: settlement.paid,
    open: settlement.open,
    status: nextStatus,
    paymentDate: settlement.paid > 0 ? params.paymentDate : null,
    createdBy: params.createdBy,
    notes: notesForUpdate,
  });

  return {
    payment,
    paid: settlement.paid,
    open: settlement.open,
    status: nextStatus,
    notes: notesForUpdate,
  };
}

export async function deletePaymentFromTransaction(params: {
  paymentId: string;
  transactionId: string;
  titleAmount: number;
  titleNotes?: string | null;
  createdBy?: string;
}): Promise<{ paid: number; open: number; status: string; notes?: string }> {
  const useTable = await probePaymentsTable();
  let payments: FinancialTransactionPayment[] = [];
  let notesForUpdate: string | undefined;

  if (useTable && paymentsTableAvailable !== false) {
    const { error } = await supabase
      .from('financial_transaction_payments')
      .delete()
      .eq('id', params.paymentId);
    if (error) {
      if (!isMissingTableError(error)) throw error;
      paymentsTableAvailable = false;
    } else {
      payments = await listPaymentsForTransaction(params.transactionId, params.titleNotes);
    }
  }

  if (!useTable || paymentsTableAvailable === false) {
    const split = splitTitleNotes(params.titleNotes);
    payments = split.payments.filter((p) => p.id !== params.paymentId);
    notesForUpdate = mergeTitleNotes(split.text, payments);
  }

  const settlement = computePaymentSettlement(
    params.titleAmount,
    payments as ReceivedPaymentInput[],
    splitTitleNotes(params.titleNotes).text,
  );

  const nextStatus = await updateTransactionSettlement({
    transactionId: params.transactionId,
    paid: settlement.paid,
    open: settlement.open,
    status: settlement.suggestedStatus,
    paymentDate: settlement.paid > 0 ? payments[0]?.payment_date || null : null,
    createdBy: params.createdBy,
    notes: notesForUpdate,
  });

  return {
    paid: settlement.paid,
    open: settlement.open,
    status: nextStatus,
    notes: notesForUpdate,
  };
}
