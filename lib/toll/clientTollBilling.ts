/**
 * Pedágio cobrado do cliente vs pago ao fornecedor.
 * Regra interna de faturamento — não exibir percentual/markup na UI.
 */

const TOLL_MARKUP_THRESHOLD_BRL = 10;
const TOLL_MARKUP_FACTOR = 1.2;

/** Valor digitado/confirmado pelo operador (base). */
export function normalizeTollAmount(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Pedágio a cobrar do cliente na fatura/relatório.
 * Se base > R$ 10,00, aplica fator interno (sem exibir na interface).
 */
export function billableClientToll(storedOrEntered: unknown): number {
  const base = normalizeTollAmount(storedOrEntered);
  if (base > TOLL_MARKUP_THRESHOLD_BRL) {
    return Math.round(base * TOLL_MARKUP_FACTOR * 100) / 100;
  }
  return base;
}

/** Pedágio a pagar ao fornecedor = valor base (sem markup). */
export function billableProviderToll(storedOrEntered: unknown, isSameOs = false): number {
  if (isSameOs) return 0;
  return normalizeTollAmount(storedOrEntered);
}

/**
 * Persistência: grava o valor digitado nos dois campos.
 * O markup do cliente entra só na hora de faturar (billableClientToll).
 */
export function tollPersistencePair(entered: unknown, isSameOs = false): {
  toll_value: number;
  toll_value_provider: number;
} {
  const base = normalizeTollAmount(entered);
  return {
    toll_value: base,
    toll_value_provider: billableProviderToll(base, isSameOs),
  };
}
