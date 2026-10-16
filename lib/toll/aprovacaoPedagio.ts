/**
 * Proteção do Salvar/Aprovar da auditoria da OS.
 * Campo omitido no patch permanece como está no banco (contrato do PATCH).
 * Fornecedor ausente e campo intocado não viram zero.
 */
import {
  camposPedagioSnapshotAceite,
  resolveStoredClientToll,
  resolveStoredProviderToll,
  type CamposPedagioSnapshotAceite,
} from './clientTollBilling';

export type SituacaoFornecedorPedagio = 'ausente' | 'zero' | 'positivo';

/** Ausente contra zero é alteração quando o operador editou. Zero já gravado contra zero não é. */
export function fornecedorPedagioMudou(original: unknown, informado: number, editado = true): boolean {
  if (!editado) return false;
  if (classificarFornecedorGravado(original) === 'ausente') return true;
  const gravado = classificarFornecedorGravado(original) === 'zero' ? 0 : Number(original);
  return Math.abs(gravado - informado) > 0.009;
}

export type ImpactoPedagioFornecedor = {
  clienteAntes: number;
  clienteDepois: number;
  fornecedorAntes: number;
  fornecedorDepois: number;
  lucroAntes: number;
  lucroDepois: number;
};

/**
 * Só quando o operador informa zero e a coluna estava ausente.
 * Zero já gravado devolve null.
 */
export function impactoTrocaFornecedorAusentePorZero(input: {
  tollValue: unknown;
  tollValueProvider: unknown;
  clientName?: string | null;
  isSameOs?: boolean;
  informado: number;
}): ImpactoPedagioFornecedor | null {
  if (classificarFornecedorGravado(input.tollValueProvider) !== 'ausente') return null;
  if (Math.abs(input.informado) >= 0.009) return null;
  const clienteAntes = resolveStoredClientToll(input.tollValue, input.tollValueProvider, input.clientName);
  const fornecedorAntes = resolveStoredProviderToll(input.tollValue, input.tollValueProvider, !!input.isSameOs);
  const clienteDepois = resolveStoredClientToll(input.tollValue, 0, input.clientName);
  const fornecedorDepois = resolveStoredProviderToll(input.tollValue, 0, !!input.isSameOs);
  const lucro = (cliente: number, fornecedor: number) => Math.round((cliente - fornecedor) * 100) / 100;
  return {
    clienteAntes,
    clienteDepois,
    fornecedorAntes,
    fornecedorDepois,
    lucroAntes: lucro(clienteAntes, fornecedorAntes),
    lucroDepois: lucro(clienteDepois, fornecedorDepois),
  };
}

export function classificarFornecedorGravado(value: unknown): SituacaoFornecedorPedagio {
  if (value === undefined || value === null) return 'ausente';
  if (typeof value === 'string' && value.trim() === '') return 'ausente';
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return 'ausente';
  if (Math.abs(n) < 0.009) return 'zero';
  return 'positivo';
}

function arredondar(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Null com zero só de exibição fica de fora do patch. Zero gravado continua zero. */
export function valorSeAlteradoDeNulo(original: unknown, informado: number): number | undefined {
  if (classificarFornecedorGravado(original) === 'ausente' && informado === 0) return undefined;
  return arredondar(informado);
}

export type MotivosSnapshotAprovacao = {
  revenueChanged: boolean;
  costChanged: boolean;
  tollChanged: boolean;
  tollProvChanged: boolean;
  dispChanged: boolean;
  dispProvChanged: boolean;
  tableChanged: boolean;
  providerTableChanged: boolean;
  breakdownChanged: boolean;
};

export function franquiaSnapshotLoteZerada(snap: Record<string, unknown> | null | undefined): boolean {
  if (!snap) return false;
  return [snap.franchiseKm, snap.franchiseHours, snap.unitKm, snap.unitHr]
    .every((n) => n == null || Number(n) === 0);
}

/**
 * Diferença artificial não regrava snapshot aprovado.
 * Edição real de receita, custo, pedágio, deslocamento ou tabela continua valendo.
 */
export function deveReescreverSnapshotAprovado(input: MotivosSnapshotAprovacao & {
  fornecedorEditado: boolean;
  fornecedorOriginalAusente: boolean;
  pedagioClienteEditado: boolean;
  franquiaSnapshotZerada: boolean;
}): boolean {
  const tollProvReal = input.tollProvChanged && !(input.fornecedorOriginalAusente && !input.fornecedorEditado);
  const tollReal = input.tollChanged && input.pedagioClienteEditado;
  const breakdownReal = input.breakdownChanged
    && !(input.franquiaSnapshotZerada && !input.tableChanged && !input.providerTableChanged);
  return input.revenueChanged
    || input.costChanged
    || tollReal
    || tollProvReal
    || input.dispChanged
    || input.dispProvChanged
    || input.tableChanged
    || input.providerTableChanged
    || breakdownReal;
}

export type AtualizacaoPedagioAprovacao = {
  patch: Record<string, unknown>;
  snapshotPedagio: CamposPedagioSnapshotAceite;
  reescreverSnapshot: boolean;
};

export function montarAtualizacaoPedagio(input: {
  tollValueInformado: number;
  tollProviderOriginal: unknown;
  tollProviderInformado: number;
  fornecedorEditado: boolean;
  pedagioClienteEditado: boolean;
  isSameOs: boolean;
  clientName?: string | null;
  revenueServiceOnly: number;
  displacementOriginal: unknown;
  displacementInformado: number;
  displacementProviderOriginal: unknown;
  displacementProviderInformado: number;
  motivosSnapshot?: MotivosSnapshotAprovacao;
  snapshotExistente?: Record<string, unknown> | null;
}): AtualizacaoPedagioAprovacao {
  const origem = classificarFornecedorGravado(input.tollProviderOriginal);
  const editouFornecedor = input.fornecedorEditado && !input.isSameOs;
  let incluirFornecedor = true;
  let valorFornecedor: number | null = 0;

  if (origem === 'ausente' && !editouFornecedor) {
    incluirFornecedor = false;
    valorFornecedor = null;
  } else if (input.isSameOs) {
    valorFornecedor = 0;
  } else if (!editouFornecedor && origem === 'zero') {
    valorFornecedor = 0;
  } else if (!editouFornecedor && origem === 'positivo') {
    valorFornecedor = arredondar(Number(input.tollProviderOriginal));
  } else {
    valorFornecedor = arredondar(input.tollProviderInformado);
  }

  const tollCliente = arredondar(input.tollValueInformado);
  const snapshotPedagio = camposPedagioSnapshotAceite({
    tollValue: tollCliente,
    tollValueProvider: incluirFornecedor ? valorFornecedor : null,
    clientName: input.clientName,
    isSameOs: input.isSameOs,
    revenueServiceOnly: input.revenueServiceOnly,
    displacementVal: input.displacementInformado,
  });

  const patch: Record<string, unknown> = { toll_value: tollCliente };
  if (incluirFornecedor && valorFornecedor != null) patch.toll_value_provider = valorFornecedor;

  const deslocamento = valorSeAlteradoDeNulo(input.displacementOriginal, input.displacementInformado);
  if (deslocamento !== undefined) patch.displacement_value = deslocamento;

  if (input.isSameOs) {
    if (classificarFornecedorGravado(input.displacementProviderOriginal) !== 'ausente') {
      patch.displacement_value_provider = 0;
    }
  } else {
    const deslocamentoFornecedor = valorSeAlteradoDeNulo(
      input.displacementProviderOriginal,
      input.displacementProviderInformado,
    );
    if (deslocamentoFornecedor !== undefined) patch.displacement_value_provider = deslocamentoFornecedor;
  }

  const motivos = input.motivosSnapshot;
  const reescreverSnapshot = motivos
    ? deveReescreverSnapshotAprovado({
      ...motivos,
      fornecedorEditado: editouFornecedor,
      fornecedorOriginalAusente: origem === 'ausente',
      pedagioClienteEditado: input.pedagioClienteEditado,
      franquiaSnapshotZerada: franquiaSnapshotLoteZerada(input.snapshotExistente),
    })
    : false;

  return { patch, snapshotPedagio, reescreverSnapshot };
}

/** Mesma regra do PATCH: chave ausente ou undefined não substitui a coluna. */
export function aplicarPatchPreservandoAusentes<T extends Record<string, unknown>>(
  atual: T,
  patch: Record<string, unknown>,
): T {
  const next = { ...atual };
  for (const [chave, valor] of Object.entries(patch)) {
    if (valor !== undefined) next[chave as keyof T] = valor as T[keyof T];
  }
  return next;
}
