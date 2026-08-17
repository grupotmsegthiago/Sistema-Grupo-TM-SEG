import { authFetch } from '../authFetch';
import {
  PAYMENTS_NOTES_MARKER,
  mergeTitleNotes,
  splitTitleNotes,
  type FinancialTransactionPayment,
} from './receivablePaymentsApiCore';

export { PAYMENTS_NOTES_MARKER, mergeTitleNotes, splitTitleNotes };
export type { FinancialTransactionPayment };

const API_PATH = '/api/financial-transaction-payments';

async function readApiError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return String(body?.error || res.statusText || `HTTP ${res.status}`);
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

export async function listPaymentsForTransaction(
  transactionId: string,
  titleNotes?: string | null,
): Promise<FinancialTransactionPayment[]> {
  const qs = new URLSearchParams({ transactionId });
  if (titleNotes) qs.set('titleNotes', titleNotes);
  const res = await authFetch(`${API_PATH}?${qs.toString()}`);
  if (!res.ok) throw new Error(await readApiError(res));
  const body = await res.json();
  return (body.payments || []) as FinancialTransactionPayment[];
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
  const res = await authFetch(API_PATH, {
    method: 'POST',
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  const body = await res.json();
  return {
    payment: body.payment,
    paid: body.paid,
    open: body.open,
    status: body.status,
    notes: body.notes,
  };
}

export async function deletePaymentFromTransaction(params: {
  paymentId: string;
  transactionId: string;
  titleAmount: number;
  titleNotes?: string | null;
  createdBy?: string;
}): Promise<{ paid: number; open: number; status: string; notes?: string }> {
  const qs = new URLSearchParams({
    id: params.paymentId,
    transactionId: params.transactionId,
  });
  const res = await authFetch(`${API_PATH}?${qs.toString()}`, {
    method: 'DELETE',
    body: JSON.stringify({
      paymentId: params.paymentId,
      transactionId: params.transactionId,
      titleAmount: params.titleAmount,
      titleNotes: params.titleNotes ?? null,
      createdBy: params.createdBy || '',
    }),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  const body = await res.json();
  return {
    paid: body.paid,
    open: body.open,
    status: body.status,
    notes: body.notes,
  };
}
