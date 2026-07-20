/**
 * Contas a Receber — pagamentos parciais / valor em aberto.
 * Status PARTIALLY_PAID quando há recebimento e ainda resta saldo.
 */

export type ReceivedPaymentInput = {
  amount: number;
  notes?: string | null;
  payment_date?: string | null;
};

export type PaymentSettlement = {
  paid: number;
  open: number;
  /** true se alguma observação indica pagamento parcial */
  hasPartialNote: boolean;
  suggestedStatus: 'PENDING' | 'PARTIALLY_PAID' | 'PAID';
};

const PARTIAL_NOTE_RE =
  /\b(valor\s*parcial|pagamento\s*parcial|parcialmente\s*pago|pgto\s*parcial|parcial)\b/i;

export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function normalizePaymentNote(notes: string | null | undefined): string {
  return String(notes || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Detecta observação do tipo "valor parcial". */
export function isPartialPaymentNote(notes: string | null | undefined): boolean {
  const n = normalizePaymentNote(notes);
  if (!n) return false;
  return PARTIAL_NOTE_RE.test(n);
}

export function sumPaymentAmounts(payments: Array<{ amount?: number | null }> | null | undefined): number {
  if (!Array.isArray(payments) || payments.length === 0) return 0;
  return roundMoney(payments.reduce((s, p) => s + (Number(p?.amount) || 0), 0));
}

/**
 * Calcula recebido / em aberto e sugere status do título.
 * - Sem pagamentos → PENDING
 * - Com pagamentos e saldo > 0 → PARTIALLY_PAID
 * - Saldo zerado → PAID (mesmo com nota parcial, se quitou o valor)
 */
export function computePaymentSettlement(
  titleAmount: number,
  payments: ReceivedPaymentInput[] | null | undefined,
  titleNotes?: string | null,
): PaymentSettlement {
  const total = roundMoney(titleAmount);
  const paid = sumPaymentAmounts(payments);
  const open = roundMoney(Math.max(0, total - paid));
  const hasPartialNote =
    isPartialPaymentNote(titleNotes) ||
    (Array.isArray(payments) && payments.some((p) => isPartialPaymentNote(p.notes)));

  let suggestedStatus: PaymentSettlement['suggestedStatus'] = 'PENDING';
  if (paid > 0 && open > 0.009) {
    suggestedStatus = 'PARTIALLY_PAID';
  } else if (paid > 0 && open <= 0.009) {
    suggestedStatus = 'PAID';
  } else if (hasPartialNote && total > 0) {
    // Observação sem valor lançado ainda: mantém radar de aberto
    suggestedStatus = 'PARTIALLY_PAID';
  }

  return { paid, open, hasPartialNote, suggestedStatus };
}

/** Valor ainda em aberto no título (para cards / radar). */
export function getTransactionOpenAmount(t: {
  amount?: number | null;
  status?: string | null;
  amount_open?: number | null;
  amount_paid?: number | null;
}): number {
  const status = String(t.status || '').toUpperCase();
  if (status === 'PAID' || status === 'CANCELLED' || status === 'CANCELED') return 0;
  if (t.amount_open != null && Number.isFinite(Number(t.amount_open))) {
    return roundMoney(Math.max(0, Number(t.amount_open)));
  }
  const amount = roundMoney(t.amount);
  const paid = t.amount_paid != null ? roundMoney(t.amount_paid) : 0;
  if (status === 'PARTIALLY_PAID' || paid > 0) {
    return roundMoney(Math.max(0, amount - paid));
  }
  return amount;
}

/** Quanto já foi recebido no título. */
export function getTransactionPaidAmount(t: {
  amount?: number | null;
  status?: string | null;
  amount_paid?: number | null;
}): number {
  const status = String(t.status || '').toUpperCase();
  if (t.amount_paid != null && Number.isFinite(Number(t.amount_paid))) {
    return roundMoney(Math.max(0, Number(t.amount_paid)));
  }
  if (status === 'PAID') return roundMoney(t.amount);
  return 0;
}

export function isOpenReceivableStatus(status: string | null | undefined): boolean {
  const s = String(status || '').toUpperCase();
  return s === 'PENDING' || s === 'SCHEDULED' || s === 'OVERDUE' || s === 'PARTIALLY_PAID';
}
