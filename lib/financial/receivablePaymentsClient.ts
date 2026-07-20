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

export async function listPaymentsForTransaction(
  transactionId: string,
): Promise<FinancialTransactionPayment[]> {
  const { data, error } = await supabase
    .from('financial_transaction_payments')
    .select('*')
    .eq('transaction_id', transactionId)
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as FinancialTransactionPayment[];
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
}> {
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
  if (error) throw error;

  const payments = await listPaymentsForTransaction(params.transactionId);
  const settlement = computePaymentSettlement(
    params.titleAmount,
    payments as ReceivedPaymentInput[],
    params.titleNotes,
  );

  let nextStatus = settlement.suggestedStatus;
  // Preserva SCHEDULED/OVERDUE se ainda não houve recebimento
  if (settlement.suggestedStatus === 'PENDING' && params.previousStatus) {
    const prev = String(params.previousStatus).toUpperCase();
    if (prev === 'SCHEDULED' || prev === 'OVERDUE') nextStatus = prev as typeof nextStatus;
  }

  const updates: Record<string, unknown> = {
    amount_paid: settlement.paid,
    amount_open: settlement.open,
    status: nextStatus,
    updated_by: params.createdBy || undefined,
  };
  if (nextStatus === 'PAID') {
    updates.payment_date = params.paymentDate;
  } else if (settlement.paid > 0) {
    updates.payment_date = params.paymentDate;
  }

  let { error: updErr } = await supabase
    .from('financial_transactions')
    .update(updates)
    .eq('id', params.transactionId);

  // Se o banco ainda não aceita PARTIALLY_PAID (CHECK antigo), grava PENDING + saldo em aberto
  if (updErr && nextStatus === 'PARTIALLY_PAID') {
    const fallback = { ...updates, status: 'PENDING' };
    const retry = await supabase
      .from('financial_transactions')
      .update(fallback)
      .eq('id', params.transactionId);
    if (!retry.error) {
      updErr = null;
      nextStatus = 'PENDING';
    }
  }
  if (updErr) throw updErr;

  return {
    payment: data as FinancialTransactionPayment,
    paid: settlement.paid,
    open: settlement.open,
    status: nextStatus,
  };
}

export async function deletePaymentFromTransaction(params: {
  paymentId: string;
  transactionId: string;
  titleAmount: number;
  titleNotes?: string | null;
  createdBy?: string;
}): Promise<{ paid: number; open: number; status: string }> {
  const { error } = await supabase
    .from('financial_transaction_payments')
    .delete()
    .eq('id', params.paymentId);
  if (error) throw error;

  const payments = await listPaymentsForTransaction(params.transactionId);
  const settlement = computePaymentSettlement(
    params.titleAmount,
    payments as ReceivedPaymentInput[],
    params.titleNotes,
  );

  const updates: Record<string, unknown> = {
    amount_paid: settlement.paid,
    amount_open: settlement.open,
    status: settlement.suggestedStatus,
    updated_by: params.createdBy || undefined,
  };
  if (settlement.suggestedStatus !== 'PAID') {
    updates.payment_date = settlement.paid > 0 ? payments[0]?.payment_date || null : null;
  }

  const { error: updErr } = await supabase
    .from('financial_transactions')
    .update(updates)
    .eq('id', params.transactionId);
  if (updErr) throw updErr;

  return {
    paid: settlement.paid,
    open: settlement.open,
    status: settlement.suggestedStatus,
  };
}
