import { extractAsaasReceiptDetails } from '../asaasReceiptDetails.js';

type TransactionAmountsInput = {
  amount?: number | null;
  amount_paid?: number | null;
  manual_payment_amount?: number | null;
  status?: string | null;
  notes?: string | null;
};

const round2 = (value: number): number => Math.round((Number(value) || 0) * 100) / 100;

/** Valor bruto efetivamente quitado pelo cliente (principal + encargos − desconto). */
export function getGrossReceivedAmount(transaction: TransactionAmountsInput): number {
  const receipt = extractAsaasReceiptDetails(transaction.notes);
  if (receipt) return round2(receipt.paidAmount);
  const manual = Number(transaction.manual_payment_amount);
  if (Number.isFinite(manual) && manual > 0) return round2(manual);
  const paid = Number(transaction.amount_paid);
  if (Number.isFinite(paid) && paid > 0) return round2(paid);
  return String(transaction.status || '').toUpperCase() === 'PAID'
    ? round2(Number(transaction.amount) || 0)
    : 0;
}

/**
 * Crédito líquido disponível na conta.
 * CONFIRMED ainda não entrou: retorna 0 até o Asaas mudar para RECEIVED.
 * Títulos legados sem marcador mantêm o valor recebido como fallback explícito.
 */
export function getNetCreditedAmount(transaction: TransactionAmountsInput): number {
  const receipt = extractAsaasReceiptDetails(transaction.notes);
  if (!receipt) return getGrossReceivedAmount(transaction);
  if (receipt.availability !== 'AVAILABLE') return 0;
  return round2(receipt.netAmount ?? receipt.paidAmount);
}

/** Crédito líquido previsto, ainda não disponível (Asaas CONFIRMED). */
export function getScheduledNetCreditAmount(transaction: TransactionAmountsInput): number {
  const receipt = extractAsaasReceiptDetails(transaction.notes);
  if (!receipt || receipt.availability !== 'SCHEDULED') return 0;
  return round2(receipt.netAmount ?? receipt.paidAmount);
}
