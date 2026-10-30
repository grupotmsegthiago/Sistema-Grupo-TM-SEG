/**
 * Grava receita e custo da OS com o motor oficial.
 * Não cria outra fórmula e não reescreve OS aprovada, conferida ou com ajuste manual.
 */
import { MissionStatus } from '../../types';
import { calculateMissionFinancials, isIntentionalBillingOverride } from '../financialUtils';
import { carimboAprovacaoHumana } from '../missionSnapshot';

export type ValoresOficiais = {
  receitaServico: number;
  custoServico: number;
  tabelaCliente: string;
  tabelaFornecedor: string;
};

export type FotoOperacao = {
  provider: string;
  startKm: string;
  endKm: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  tollValue: string;
};

const arredondar = (valor: number) => Math.round(Number(valor || 0) * 100) / 100;

function texto(valor: unknown): string {
  return String(valor ?? '').trim();
}

/** Motivo de sistema não é ajuste do operador. */
export function motivoBloqueiaSincronia(motivo: string | null | undefined): boolean {
  const cru = texto(motivo).toLowerCase();
  if (!cru) return false;
  if (cru.includes('recalculado pelo sistema')) return false;
  if (cru.includes('os recusada')) return false;
  if (cru === 'aguardando definição' || cru === 'aguardando definicao' || cru === 'mesma os') return false;
  return isIntentionalBillingOverride(motivo);
}

export function osImpedeSincronia(
  mission: any,
  opcoes?: { statusDestino?: string | null; incluirTravaPrejuizo?: boolean },
): string | null {
  if (!mission) return 'OS ausente.';
  const status = texto(opcoes?.statusDestino || mission.status);
  if (status === MissionStatus.REFUSED || status === 'Recusada') return 'OS recusada permanece zerada.';
  if (status === MissionStatus.CANCELLED || status === 'Cancelada') return 'OS cancelada segue o recálculo do cancelamento.';
  if (mission.billing_approved) return 'OS aprovada para faturamento.';
  if (carimboAprovacaoHumana(mission.snapshot_approved_by)) return 'OS com aprovação gravada.';
  if (mission.billing_verified_by) return 'OS conferida.';
  if (motivoBloqueiaSincronia(mission.revenue_edit_reason)) return 'Receita com ajuste manual.';
  if (motivoBloqueiaSincronia(mission.cost_edit_reason)) return 'Custo com ajuste manual.';
  if (opcoes?.incluirTravaPrejuizo && mission.negative_margin_locked) return 'Prejuízo já analisado e travado.';
  return null;
}

export function operacaoDoFormularioMudou(antes: FotoOperacao | null | undefined, depois: FotoOperacao): boolean {
  if (!antes) return false;
  const campos: (keyof FotoOperacao)[] = [
    'provider', 'startKm', 'endKm', 'startDate', 'endDate', 'startTime', 'endTime', 'tollValue',
  ];
  return campos.some((campo) => texto(antes[campo]) !== texto(depois[campo]));
}

export function calcularValoresOficiais(entrada: {
  mission: any;
  clientTables: any[];
  providerTables: any[];
  clientData?: any;
  providers?: any[] | null;
  clientTableId?: string | null;
  providerTableId?: string | null;
  providerOpsOverride?: { distanceKm: number; durationHours: number };
  now?: Date;
}): ValoresOficiais | null {
  try {
    const fin = calculateMissionFinancials(
      entrada.mission,
      entrada.clientTables || [],
      entrada.providerTables || [],
      entrada.clientData,
      entrada.now || new Date(),
      {
        clientTableId: entrada.clientTableId || undefined,
        providerTableId: entrada.providerTableId || undefined,
        providerOpsOverride: entrada.providerOpsOverride,
      },
      entrada.providers,
    );
    return {
      receitaServico: arredondar(fin?.client?.serviceTotal || 0),
      custoServico: arredondar(fin?.provider?.serviceTotal || 0),
      tabelaCliente: texto(fin?.client?.tableName),
      tabelaFornecedor: texto(fin?.provider?.tableName),
    };
  } catch {
    return null;
  }
}

/**
 * Só grava lado com tabela e valor maior que zero.
 * Não apaga receita ou custo que já existe quando o motor não acha tabela.
 */
export function colunasDoMotor(
  atual: { revenue?: number | null; cost?: number | null },
  oficial: ValoresOficiais | null,
  mesmaOs: boolean,
): { revenue_value?: number; cost_value?: number } | null {
  if (!oficial) return null;
  const saida: { revenue_value?: number; cost_value?: number } = {};
  const receitaAtual = Number(atual.revenue || 0);
  const custoAtual = Number(atual.cost || 0);
  if (oficial.tabelaCliente && oficial.receitaServico > 0 && Math.abs(oficial.receitaServico - receitaAtual) >= 0.01) {
    saida.revenue_value = oficial.receitaServico;
  }
  if (mesmaOs) {
    if (Math.abs(custoAtual) >= 0.01) saida.cost_value = 0;
  } else if (oficial.tabelaFornecedor && oficial.custoServico > 0 && Math.abs(oficial.custoServico - custoAtual) >= 0.01) {
    saida.cost_value = oficial.custoServico;
  }
  return saida.revenue_value != null || saida.cost_value != null ? saida : null;
}

/** Na criação ainda não há hora final. A janela zerada evita cobrar hora corrida até o relógio de agora. */
export function janelaZeradaNaCriacao(inicioIso: string): { startTime: string; endTime: string } {
  return { startTime: inicioIso, endTime: inicioIso };
}
