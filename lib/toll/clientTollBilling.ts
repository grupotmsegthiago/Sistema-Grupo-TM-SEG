/**
 * Pedágio cobrado do cliente vs pago ao fornecedor.
 * Demais clientes (base > R$ 10):
 *   até R$ 100,00 → +20%
 *   de R$ 100,01 a R$ 150,00 → +10%
 *   acima de R$ 150,00 → +5%
 * Exceção DHL: o valor que a operação informar é o valor faturado ao cliente (sem acréscimo).
 * Não exibir o percentual na UI — só os valores detalhados (cliente / fornecedor).
 */

const TOLL_NO_MARKUP_MAX_BRL = 10;
const TOLL_MARKUP_20_MAX_BRL = 100;
const TOLL_MARKUP_10_MAX_BRL = 150;

/** Cliente DHL não recebe acréscimo no pedágio. Demais clientes seguem as faixas. */
export function isDhlClientTollExempt(clientName?: string | null): boolean {
  if (!clientName) return false;
  const n = String(clientName)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  return n.includes('DHL');
}

/** Valor digitado/confirmado pelo operador (base / valor real da rota). */
export function normalizeTollAmount(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Fator de acréscimo do pedágio do cliente sobre o valor real (base).
 * DHL e valores até R$ 10,00 = 1 (sem acréscimo).
 */
export function clientTollMarkupFactor(baseOrEntered: unknown, clientName?: string | null): number {
  if (isDhlClientTollExempt(clientName)) return 1;
  const base = normalizeTollAmount(baseOrEntered);
  if (base <= TOLL_NO_MARKUP_MAX_BRL) return 1;
  if (base <= TOLL_MARKUP_20_MAX_BRL) return 1.2;
  if (base <= TOLL_MARKUP_10_MAX_BRL) return 1.1;
  return 1.05;
}

/**
 * Aplica a regra de faturamento do cliente sobre o valor real (base).
 * DHL: sem acréscimo. Demais: faixas 20% / 10% / 5%.
 */
export function billableClientToll(baseOrEntered: unknown, clientName?: string | null): number {
  const base = normalizeTollAmount(baseOrEntered);
  const factor = clientTollMarkupFactor(base, clientName);
  if (factor === 1) return base;
  return Math.round(base * factor * 100) / 100;
}

/** Pedágio a pagar ao fornecedor = valor real (sem markup). */
export function billableProviderToll(storedOrEntered: unknown, isSameOs = false): number {
  if (isSameOs) return 0;
  return normalizeTollAmount(storedOrEntered);
}

/**
 * Persistência ao salvar a SM / confirmação:
 * - toll_value (cliente) = valor com regra (DHL = valor da operação)
 * - toll_value_provider (fornecedor) = valor real
 */
export function tollPersistencePair(
  enteredReal: unknown,
  isSameOs = false,
  clientName?: string | null,
): {
  toll_value: number;
  toll_value_provider: number;
} {
  const base = normalizeTollAmount(enteredReal);
  return {
    toll_value: billableClientToll(base, clientName),
    toll_value_provider: billableProviderToll(base, isSameOs),
  };
}

/**
 * Lê o pedágio do cliente a partir do que está no banco.
 * - DHL: valor da operação (sem acréscimo). Se houver pedágio do fornecedor > 0, usa esse valor.
 * - Formato novo: toll_value ≠ toll_value_provider → toll_value já tem a regra.
 * - Legado: mesmos valores (ambos base) → aplica a regra na leitura (não DHL).
 * - toll_value_provider null/undefined → trata toll_value como base.
 */
export function resolveStoredClientToll(
  tollValue: unknown,
  tollValueProvider?: unknown | null,
  clientName?: string | null,
): number {
  const client = normalizeTollAmount(tollValue);
  if (isDhlClientTollExempt(clientName)) {
    if (tollValueProvider !== undefined && tollValueProvider !== null) {
      const provider = normalizeTollAmount(tollValueProvider);
      if (provider > 0) return provider;
    }
    return client;
  }
  if (tollValueProvider === undefined || tollValueProvider === null) {
    return billableClientToll(client, clientName);
  }
  const provider = normalizeTollAmount(tollValueProvider);
  if (Math.abs(client - provider) < 0.009) {
    return billableClientToll(client, clientName);
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
