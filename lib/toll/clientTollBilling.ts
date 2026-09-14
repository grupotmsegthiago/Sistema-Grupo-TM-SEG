/**
 * Pedágio cobrado do cliente vs pago ao fornecedor.
 * Regra interna (demais clientes): se base > R$ 10, cliente = base × 1,2; fornecedor = base (valor real).
 * Exceção DHL: o valor que a operação informar é o valor faturado ao cliente (sem acréscimo).
 * Não exibir o percentual na UI — só os valores detalhados (cliente / fornecedor).
 */

const TOLL_MARKUP_THRESHOLD_BRL = 10;
const TOLL_MARKUP_FACTOR = 1.2;

/** Cliente DHL não recebe o acréscimo de 20% no pedágio. Demais clientes mantêm a regra. */
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
 * Aplica a regra de faturamento do cliente sobre o valor real (base).
 * Se base > R$ 10,00, multiplica pelo fator interno — exceto DHL.
 */
export function billableClientToll(baseOrEntered: unknown, clientName?: string | null): number {
  const base = normalizeTollAmount(baseOrEntered);
  if (isDhlClientTollExempt(clientName)) return base;
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
 * - DHL: valor da operação (sem 20%). Se houver pedágio do fornecedor > 0, usa esse valor.
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
