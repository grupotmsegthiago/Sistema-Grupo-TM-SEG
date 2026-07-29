/**
 * Resolução oficial dos totais financeiros da OS para o grid (MissionCard).
 *
 * Espelha a decomposição da Auditoria de OS (MissionFinancialModal):
 *   cliente     = revenue_value + toll_value + displacement_value
 *   fornecedor  = cost_value + toll_value_provider + displacement_value_provider
 *
 * Não deriva deslocamento, não aplica markup de pedágio na leitura e não
 * substitui valores salvos/aprovados por projeção de tabela.
 *
 * Pendência arquitetural: snapshot_data ainda NÃO é lido aqui (fora do escopo).
 * Pendência: Cockpit/DRE/LossesDialog continuam em computeCanonicalRevenueCost.
 */

import { MissionStatus } from '../types';

/** Origem semântica do valor (contrato tipado; UI mapeia para labels). */
export type OrigemValorFinanceiro =
  | 'aprovado'
  | 'salvo'
  | 'persistido'
  | 'calculado'
  | 'pendente';

/** Badge/status financeiro do card. */
export type StatusFinanceiroOs =
  | 'aprovado'
  | 'salvo'
  | 'calculado'
  | 'pendente'
  | 'revisao';

export type OfficialMissionFinancials = {
  valorCliente: number | null;
  valorFornecedor: number | null;
  resultadoBruto: number | null;
  margemPercentual: number | null;

  origemCliente: OrigemValorFinanceiro;
  origemFornecedor: OrigemValorFinanceiro;
  statusFinanceiro: StatusFinanceiroOs;

  consistente: boolean;
  inconsistencias: string[];

  revenueService: number;
  tollClient: number;
  displacementClient: number;
  costService: number;
  tollProvider: number;
  displacementProvider: number;

  labelFaturamento: string;
  labelFornecedor: string;
  labelStatus: string;

  usedProjection: boolean;
};

export type ResolveOfficialMissionFinancialsOptions = {
  /**
   * Totais projetados pelo motor de tabela (calculateMissionFinancials).
   * Só entram se a OS for elegível a projeção (sem save/aprovação formal).
   */
  projectedClientTotal?: number | null;
  projectedProviderTotal?: number | null;
};

function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(String(value).replace(',', '.'));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function isPresentNumber(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') {
    const n = Number(String(value).replace(',', '.'));
    return Number.isFinite(n);
  }
  return false;
}

/** Serviço persistido “com valor” (> 0). Zero sozinho não conta como persistido informal. */
function hasPersistedService(value: unknown): boolean {
  return isPresentNumber(value) && num(value) > 0;
}

function missionStatus(m: any): string {
  return String(m?.status ?? '');
}

function isProjectionEligible(m: any): boolean {
  if (m?.billing_approved) return false;
  if (m?.billing_verified_by) return false;
  if (hasPersistedService(m?.revenue_value) || hasPersistedService(m?.cost_value)) return false;
  return missionStatus(m) === MissionStatus.IN_TRANSIT || missionStatus(m) === 'Em Viagem';
}

function origemFormal(m: any): 'aprovado' | 'salvo' | null {
  if (m?.billing_approved === true) return 'aprovado';
  if (m?.billing_verified_by) return 'salvo';
  return null;
}

function labelFromOrigem(origem: OrigemValorFinanceiro): string {
  switch (origem) {
    case 'aprovado':
      return '(Auditado)';
    case 'salvo':
      return '(Salvo)';
    case 'persistido':
      return '(Persistido)';
    case 'calculado':
      return '(Projetado)';
    default:
      return '';
  }
}

function labelStatusFrom(status: StatusFinanceiroOs): string {
  switch (status) {
    case 'aprovado':
      return 'Auditado';
    case 'salvo':
      return 'Salvo';
    case 'calculado':
      return 'Projetado';
    case 'revisao':
      return 'Revisão';
    default:
      return 'Pendente';
  }
}

/**
 * Pedágio do fornecedor alinhado à Auditoria:
 * - is_same_os → 0
 * - toll_value_provider preenchido (inclui 0) → usa o valor
 * - null/undefined → 0 (modal: “se nulo, é 0”), NÃO copia toll_value do cliente
 *
 * Nota: MissionCard legado fazia `toll_value_provider ?? toll_value`.
 * Amostra read-only (jul/2026): null praticamente ausente; há OS com pedágios distintos.
 * Canonical (`resolveStoredProviderToll`) ainda faz fallback legado — divergência documentada.
 */
function resolveProviderToll(m: any, inconsistencias: string[]): number {
  if (m?.is_same_os === true) return 0;
  const raw = m?.toll_value_provider;
  if (raw === null || raw === undefined) {
    if (num(m?.toll_value) > 0) {
      inconsistencias.push('toll_provider_null_com_toll_cliente');
    }
    return 0;
  }
  return num(raw);
}

function resolveProviderDisplacement(m: any): number {
  if (m?.is_same_os === true) return 0;
  return Math.max(0, num(m?.displacement_value_provider));
}

function resolveSideOrigem(
  formal: 'aprovado' | 'salvo' | null,
  hasService: boolean,
  hasAdditives: boolean,
  canProject: boolean,
  hasProjection: boolean,
): { origem: OrigemValorFinanceiro; useProjection: boolean; useStored: boolean } {
  if (formal) {
    return { origem: formal, useProjection: false, useStored: true };
  }
  if (hasService || hasAdditives) {
    return { origem: 'persistido', useProjection: false, useStored: true };
  }
  if (canProject && hasProjection) {
    return { origem: 'calculado', useProjection: true, useStored: false };
  }
  return { origem: 'pendente', useProjection: false, useStored: true };
}

/**
 * Resolve totais oficiais da OS para exibição no grid.
 * Função pura — não lê rede, não grava, não altera produção.
 */
export function resolveOfficialMissionFinancials(
  mission: any,
  options: ResolveOfficialMissionFinancialsOptions = {},
): OfficialMissionFinancials {
  const inconsistencias: string[] = [];
  const m = mission || {};

  const revenueService = num(m.revenue_value);
  const tollClient = Math.max(0, num(m.toll_value));
  const displacementClient = Math.max(0, num(m.displacement_value));
  const costService = m.is_same_os === true ? 0 : num(m.cost_value);
  const tollProvider = resolveProviderToll(m, inconsistencias);
  const displacementProvider = resolveProviderDisplacement(m);

  if (
    (isPresentNumber(m.revenue_value) && !Number.isFinite(num(m.revenue_value)) && typeof m.revenue_value === 'number') ||
    (typeof m.revenue_value === 'number' && !Number.isFinite(m.revenue_value)) ||
    (typeof m.cost_value === 'number' && !Number.isFinite(m.cost_value))
  ) {
    inconsistencias.push('valores_nao_finitos');
  }

  const formal = origemFormal(m);
  const storedCliente = revenueService + tollClient + displacementClient;
  const storedFornecedor = costService + tollProvider + displacementProvider;

  const canProject = isProjectionEligible(m);
  const hasProjClient = options.projectedClientTotal != null && Number.isFinite(Number(options.projectedClientTotal));
  const hasProjProvider = options.projectedProviderTotal != null && Number.isFinite(Number(options.projectedProviderTotal));

  const sideCliente = resolveSideOrigem(
    formal,
    hasPersistedService(m.revenue_value),
    tollClient > 0 || displacementClient > 0,
    canProject,
    hasProjClient,
  );

  const sideFornecedor = resolveSideOrigem(
    formal,
    m.is_same_os === true ? false : hasPersistedService(m.cost_value),
    m.is_same_os === true ? false : tollProvider > 0 || displacementProvider > 0,
    canProject,
    hasProjProvider,
  );

  // Mesma OS: com save formal, fornecedor oficial é zero na mesma origem.
  if (m.is_same_os === true && formal) {
    sideFornecedor.origem = formal;
    sideFornecedor.useProjection = false;
    sideFornecedor.useStored = true;
  } else if (m.is_same_os === true && sideCliente.origem !== 'pendente' && sideCliente.origem !== 'calculado') {
    sideFornecedor.origem = sideCliente.origem === 'aprovado' || sideCliente.origem === 'salvo'
      ? sideCliente.origem
      : 'persistido';
    sideFornecedor.useProjection = false;
    sideFornecedor.useStored = true;
  }

  let valorCliente: number | null = sideCliente.useProjection
    ? Number(options.projectedClientTotal)
    : storedCliente;
  let valorFornecedor: number | null = sideFornecedor.useProjection
    ? Number(options.projectedProviderTotal)
    : storedFornecedor;

  if (m.is_same_os === true && !sideFornecedor.useProjection) {
    valorFornecedor = 0;
  }

  // Projeção NUNCA sobrepõe save/aprovação formal
  let usedProjection = sideCliente.useProjection || sideFornecedor.useProjection;
  if (formal && usedProjection) {
    usedProjection = false;
    valorCliente = storedCliente;
    valorFornecedor = m.is_same_os === true ? 0 : storedFornecedor;
    sideCliente.origem = formal;
    sideFornecedor.origem = formal;
    inconsistencias.push('projecao_bloqueada_por_save_formal');
  }

  const origemCliente = sideCliente.origem;
  const origemFornecedor = sideFornecedor.origem;

  const incompatible =
    (origemCliente === 'calculado' && (origemFornecedor === 'salvo' || origemFornecedor === 'aprovado' || origemFornecedor === 'persistido')) ||
    (origemFornecedor === 'calculado' && (origemCliente === 'salvo' || origemCliente === 'aprovado' || origemCliente === 'persistido'));

  if (incompatible) {
    inconsistencias.push(`origem_incompativel:${origemCliente}|${origemFornecedor}`);
  }

  if ((valorCliente ?? 0) === 0 && (valorFornecedor ?? 0) > 0) {
    inconsistencias.push('cliente_zero_fornecedor_positivo');
  }

  if (origemCliente === 'pendente' && (origemFornecedor === 'salvo' || origemFornecedor === 'aprovado' || origemFornecedor === 'persistido')) {
    inconsistencias.push('cliente_ausente_fornecedor_presente');
  }
  if (
    origemFornecedor === 'pendente' &&
    (origemCliente === 'salvo' || origemCliente === 'aprovado' || origemCliente === 'persistido') &&
    m.is_same_os !== true
  ) {
    inconsistencias.push('fornecedor_ausente_cliente_presente');
  }

  const consistente = inconsistencias.length === 0;

  let resultadoBruto: number | null = null;
  let margemPercentual: number | null = null;
  if (valorCliente != null && valorFornecedor != null && Number.isFinite(valorCliente) && Number.isFinite(valorFornecedor)) {
    resultadoBruto = valorCliente - valorFornecedor;
    margemPercentual = valorCliente > 0 ? (resultadoBruto / valorCliente) * 100 : null;
  }

  let statusFinanceiro: StatusFinanceiroOs = 'pendente';
  if (incompatible) {
    statusFinanceiro = 'revisao';
  } else if (formal === 'aprovado') {
    statusFinanceiro = 'aprovado';
  } else if (formal === 'salvo') {
    statusFinanceiro = 'salvo';
  } else if (origemCliente === 'calculado' || origemFornecedor === 'calculado') {
    statusFinanceiro = 'calculado';
  } else {
    // persistido informal ou vazio → badge Pendente (não confundir com Salvo formal)
    statusFinanceiro = 'pendente';
  }

  return {
    valorCliente,
    valorFornecedor,
    resultadoBruto,
    margemPercentual,
    origemCliente,
    origemFornecedor,
    statusFinanceiro,
    consistente,
    inconsistencias,
    revenueService,
    tollClient,
    displacementClient,
    costService,
    tollProvider,
    displacementProvider,
    labelFaturamento: labelFromOrigem(origemCliente),
    labelFornecedor: labelFromOrigem(origemFornecedor),
    labelStatus: labelStatusFrom(statusFinanceiro),
    usedProjection,
  };
}

/** Atalho: OS com prejuízo oficial (mesmo critério do card). */
export function isOfficialNegativeMargin(
  mission: any,
  options?: ResolveOfficialMissionFinancialsOptions,
): boolean {
  const fin = resolveOfficialMissionFinancials(mission, options);
  return fin.resultadoBruto != null && fin.resultadoBruto < 0;
}
