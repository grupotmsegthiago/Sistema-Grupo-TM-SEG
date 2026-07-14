/**
 * Pedágio cobrado do cliente vs pago ao fornecedor.
 * Regra interna: se base > R$ 10, cliente = base × 1,2; fornecedor = base (valor real).
 * Não exibir o percentual na UI — só os valores detalhados (cliente / fornecedor).
 */

const TOLL_MARKUP_THRESHOLD_BRL = 10;
const TOLL_MARKUP_FACTOR = 1.2;

/** Valor digitado/confirmado pelo operador (base / valor real da rota). */
export function normalizeTollAmount(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Aplica a regra de faturamento do cliente sobre o valor real (base).
 * Se base > R$ 10,00, multiplica pelo fator interno.
 */
export function billableClientToll(baseOrEntered: unknown): number {
  const base = normalizeTollAmount(baseOrEntered);
  if (base > TOLL_MARKUP_THRESHOLD_BRL) {
    return Math.round(base * TOLL_MARKUP_FACTOR * 100) / 100;
  }
  return base;
}

/** Pedágio a pagar ao fornecedor = valor real (sem markup). */
export function billableProviderToll(storedOrEntered: unknown, isSameOs = false): number {
  if (isSameOs) return 0;
  return normalizeTollAmount(storedOrEntered);
}

/**
 * Persistência ao salvar a SM / confirmação:
 * - toll_value (cliente) = valor com regra
 * - toll_value_provider (fornecedor) = valor real
 */
export function tollPersistencePair(enteredReal: unknown, isSameOs = false): {
  toll_value: number;
  toll_value_provider: number;
} {
  const base = normalizeTollAmount(enteredReal);
  return {
    toll_value: billableClientToll(base),
    toll_value_provider: billableProviderToll(base, isSameOs),
  };
}

/**
 * Lê o pedágio do cliente a partir do que está no banco.
 * - Formato novo: toll_value ≠ toll_value_provider → toll_value já tem a regra.
 * - Legado: mesmos valores (ambos base) → aplica a regra na leitura.
 * - toll_value_provider null/undefined → trata toll_value como base.
 */
export function resolveStoredClientToll(
  tollValue: unknown,
  tollValueProvider?: unknown | null,
): number {
  const client = normalizeTollAmount(tollValue);
  if (tollValueProvider === undefined || tollValueProvider === null) {
    return billableClientToll(client);
  }
  const provider = normalizeTollAmount(tollValueProvider);
  if (Math.abs(client - provider) < 0.009) {
    return billableClientToll(client);
  }
  return client;
}

/** Valor real do fornecedor a partir dos campos salvos. */
export function resolveStoredProviderToll(
  tollValue: unknown,
  tollValueProvider?: unknown | null,
  isSameOs = false,
): number {
  if (isSameOs) return 0;
  if (tollValueProvider !== undefined && tollValueProvider !== null) {
    return normalizeTollAmount(tollValueProvider);
  }
  return normalizeTollAmount(tollValue);
}

/**
 * Par cliente/fornecedor para exibir na Auditoria de Faturamento.
 * Corrige legado em que ambos foram gravados com o valor real (sem +20% no cliente).
 */
export function resolveTollUiPair(
  tollValue: unknown,
  tollValueProvider?: unknown | null,
  isSameOs = false,
): { client: number; provider: number } {
  return {
    client: resolveStoredClientToll(tollValue, tollValueProvider),
    provider: resolveStoredProviderToll(tollValue, tollValueProvider, isSameOs),
  };
}
