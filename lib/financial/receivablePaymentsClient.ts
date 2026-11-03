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
const inFlightRequests = new Map<string, Promise<unknown>>();

/** Evita double-submit sem bloquear operações financeiras diferentes. */
export function runFinancialPaymentSingleFlight<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const current = inFlightRequests.get(key) as Promise<T> | undefined;
  if (current) return current;

  const request = operation();
  inFlightRequests.set(key, request);
  const clear = () => {
    if (inFlightRequests.get(key) === request) inFlightRequests.delete(key);
  };
  void request.then(clear, clear);
  return request;
}

async function readApiJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error('A consulta de pagamentos respondeu uma página em vez dos dados. Atualize a tela e abra de novo.');
  }
}

async function readApiError(res: Response): Promise<string> {
  try {
    const body = await readApiJson(res);
    const message = String(body?.error || res.statusText || `HTTP ${res.status}`);
    if (res.status === 503) {
      return 'Este computador não tem a chave de administrador do banco para ler os pagamentos.';
    }
    return message;
  } catch (e: any) {
    return e?.message || res.statusText || `HTTP ${res.status}`;
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
  const body = await readApiJson(res);
  return (body.payments || []) as FinancialTransactionPayment[];
}

export function addPaymentToTransaction(params: {
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
  const key = `add:${JSON.stringify(params)}`;
  return runFinancialPaymentSingleFlight(key, async () => {
    const res = await authFetch(API_PATH, {
      method: 'POST',
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(await readApiError(res));
    const body = await readApiJson(res);
    return {
      payment: body.payment,
      paid: body.paid,
      open: body.open,
      status: body.status,
      notes: body.notes,
    };
  });
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
  const body = await readApiJson(res);
  return {
    paid: body.paid,
    open: body.open,
    status: body.status,
    notes: body.notes,
  };
}
