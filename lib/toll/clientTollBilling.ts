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

export type OrigemParPedagio =
  | 'par_gravado'
  | 'igual_preservado'
  | 'mesma_os'
  | 'fornecedor_ausente';

export type ParPedagioRecalculo = {
  toll_value: number;
  toll_value_provider: number | null;
  escreverFornecedor: boolean;
  origem: OrigemParPedagio;
};

function fornecedorFoiGravado(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

/**
 * Par usado pelos recálculos.
 * O motor devolve o custo já gravado, não um pedágio novo de rota.
 * Por isso esta função não aplica a faixa de novo: 120/100 continua 120/100.
 * Valores iguais permanecem iguais (DHL, até R$ 10 ou legado).
 * Fornecedor ausente não é preenchido com o valor do cliente nem com zero.
 */
export function preservarParPedagioNoRecalculo(input: {
  tollValue: unknown;
  tollValueProvider?: unknown | null;
  isSameOs?: boolean;
}): ParPedagioRecalculo {
  const cliente = normalizeTollAmount(input.tollValue);
  const temFornecedor = fornecedorFoiGravado(input.tollValueProvider);

  if (input.isSameOs) {
    return {
      toll_value: cliente,
      toll_value_provider: temFornecedor ? 0 : null,
      escreverFornecedor: temFornecedor,
      origem: 'mesma_os',
    };
  }

  if (!temFornecedor) {
    return {
      toll_value: cliente,
      toll_value_provider: null,
      escreverFornecedor: false,
      origem: 'fornecedor_ausente',
    };
  }

  const fornecedor = normalizeTollAmount(input.tollValueProvider);
  const iguais = Math.abs(cliente - fornecedor) < 0.009;
  return {
    toll_value: cliente,
    toll_value_provider: fornecedor,
    escreverFornecedor: true,
    origem: iguais ? 'igual_preservado' : 'par_gravado',
  };
}

export type EstadoLeituraPedagio =
  | 'par_novo'
  | 'manual'
  | 'igual_esperado'
  | 'legado_ambiguo'
  | 'fornecedor_ausente'
  | 'fornecedor_zero'
  | 'mesma_os';

export type ClassificacaoParPedagio = {
  estado: EstadoLeituraPedagio;
  clienteGravado: number;
  fornecedorGravado: number | null;
  clienteExibido: number;
  fornecedorExibido: number;
  fornecedorConfirmado: boolean;
  faixaAplicadaNaLeitura: boolean;
  aviso: string | null;
};

function reaisLeitura(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

/**
 * Classifica a leitura do par já gravado.
 * clienteExibido é resolveStoredClientToll e fornecedorExibido é resolveStoredProviderToll.
 * Não grava, não reaplica a faixa quando o par já é diferente e não inventa custo novo.
 */
export function classificarParPedagio(input: {
  tollValue: unknown;
  tollValueProvider?: unknown | null;
  clientName?: string | null;
  isSameOs?: boolean;
  snapshotToll?: unknown | null;
}): ClassificacaoParPedagio {
  const clienteGravado = normalizeTollAmount(input.tollValue);
  const fornecedorInformado = input.tollValueProvider !== undefined && input.tollValueProvider !== null;
  const fornecedorGravado = fornecedorInformado ? normalizeTollAmount(input.tollValueProvider) : null;
  const clienteExibido = resolveStoredClientToll(input.tollValue, input.tollValueProvider, input.clientName);
  const fornecedorExibido = resolveStoredProviderToll(input.tollValue, input.tollValueProvider, !!input.isSameOs);
  const faixaAplicadaNaLeitura = Math.abs(clienteExibido - clienteGravado) >= 0.009;

  let estado: EstadoLeituraPedagio;
  if (input.isSameOs) {
    estado = 'mesma_os';
  } else if (!fornecedorInformado) {
    estado = 'fornecedor_ausente';
  } else if ((fornecedorGravado ?? 0) === 0) {
    estado = 'fornecedor_zero';
  } else if (Math.abs(clienteGravado - (fornecedorGravado ?? 0)) < 0.009) {
    const semFaixa = isDhlClientTollExempt(input.clientName) || clienteGravado <= TOLL_NO_MARKUP_MAX_BRL;
    estado = semFaixa ? 'igual_esperado' : 'legado_ambiguo';
  } else if (Math.abs(clienteGravado - billableClientToll(fornecedorGravado, input.clientName)) < 0.009) {
    estado = 'par_novo';
  } else {
    estado = 'manual';
  }

  const partes: string[] = [];
  if (estado === 'legado_ambiguo') {
    partes.push('OS antiga com pedágio igual acima de R$ 10. A leitura aplica a faixa uma vez. O valor gravado não mudou.');
  } else if (estado === 'fornecedor_ausente') {
    partes.push('Fornecedor do pedágio não está gravado. O custo exibido segue a leitura histórica e não está confirmado.');
  } else if (estado === 'fornecedor_zero') {
    partes.push('Fornecedor do pedágio está zerado. O zero foi mantido.');
  } else if (estado === 'manual') {
    partes.push('Par manual. A leitura não reaplica a faixa.');
  } else if (estado === 'mesma_os' && !fornecedorInformado) {
    partes.push('OS mesma. O custo do fornecedor segue a regra existente e o campo não está gravado.');
  }

  const snapshotInformado = input.snapshotToll !== undefined && input.snapshotToll !== null && String(input.snapshotToll).trim() !== '';
  if (snapshotInformado) {
    const snapshot = normalizeTollAmount(input.snapshotToll);
    if (Math.abs(snapshot - clienteExibido) >= 0.009) {
      partes.push(`Snapshot ${reaisLeitura(snapshot)} difere da leitura ${reaisLeitura(clienteExibido)}. O snapshot não foi alterado.`);
    }
  }

  return {
    estado,
    clienteGravado,
    fornecedorGravado,
    clienteExibido,
    fornecedorExibido,
    fornecedorConfirmado: estado !== 'fornecedor_ausente',
    faixaAplicadaNaLeitura,
    aviso: partes.length > 0 ? partes.join(' ') : null,
  };
}

export type CamposPedagioSnapshotAceite = {
  tollVal: number;
  tollProvider: number | null;
  totalGeral: number;
};

/**
 * Campos de pedágio do primeiro snapshot do aceite em lote.
 * tollVal é o cliente já cobrável no boletim. totalGeral soma esse valor uma vez.
 * Fornecedor numérico, inclusive zero, permanece. Fornecedor ausente permanece null.
 * O par bruto continua nas colunas da OS: o snapshot não tem campo separado para ele.
 */
export function camposPedagioSnapshotAceite(input: {
  tollValue: unknown;
  tollValueProvider?: unknown | null;
  clientName?: string | null;
  isSameOs?: boolean;
  revenueServiceOnly?: unknown;
  displacementVal?: unknown;
}): CamposPedagioSnapshotAceite {
  const leitura = classificarParPedagio({
    tollValue: input.tollValue,
    tollValueProvider: input.tollValueProvider,
    clientName: input.clientName,
    isSameOs: !!input.isSameOs,
  });
  const receita = Number(input.revenueServiceOnly) || 0;
  const deslocamento = Number(input.displacementVal) || 0;
  const fornecedorInformado = input.tollValueProvider !== undefined && input.tollValueProvider !== null;
  const tollProvider = !fornecedorInformado
    ? null
    : (input.isSameOs ? 0 : leitura.fornecedorGravado);
  const tollVal = leitura.clienteExibido;
  return {
    tollVal,
    tollProvider,
    totalGeral: Math.round((receita + tollVal + deslocamento) * 100) / 100,
  };
}
