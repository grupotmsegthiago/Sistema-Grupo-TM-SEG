/**
 * Resumo do Gestor Fiscal para a futura API.
 * Usa o motor canônico. Não lê tabela inteira e não trata conta pagadora como CNPJ.
 */
import { computeCanonicalRevenueCost, type CanonicalRefs } from '../../missionFinancialsCanonical';
import { MissionStatus } from '../../../types';
import { EMPRESAS_TMSEG, classificarEmpresa } from '../empresas';

const REFS_VAZIAS: CanonicalRefs = { clientTables: [], providerTables: [], clientsData: [] };

export interface OsParaResumoHttp {
  id: string;
  status: string;
  empresaEmissora: string | null;
  revenue_value: number;
  cost_value: number;
  billing_approved: boolean;
  /** Presente só para provar que não escolhe a empresa. */
  contaPagadora?: string | null;
}

export interface ResumoEmpresaHttp {
  empresaKey: string;
  quantidadeOs: number;
  receita: number;
  custo: number;
}

export function empresasPadraoDaDiretoria(): string[] {
  return EMPRESAS_TMSEG.map((empresa) => empresa.key);
}

export function resumirGestorCanonico(
  linhas: readonly OsParaResumoHttp[],
  empresasAutorizadas: readonly string[],
): ResumoEmpresaHttp[] {
  const autorizadas = new Set(empresasAutorizadas);
  const mapa = new Map<string, ResumoEmpresaHttp>();
  for (const linha of linhas) {
    if (linha.status === MissionStatus.REFUSED) continue;
    const empresa = classificarEmpresa(linha.empresaEmissora);
    if (empresa === 'SEM_EMISSORA' || !autorizadas.has(empresa)) continue;
    const canon = computeCanonicalRevenueCost({
      id: linha.id,
      status: linha.status,
      revenue_value: linha.revenue_value,
      cost_value: linha.cost_value,
      billing_approved: linha.billing_approved,
    }, REFS_VAZIAS);
    const atual = mapa.get(empresa) ?? { empresaKey: empresa, quantidadeOs: 0, receita: 0, custo: 0 };
    atual.quantidadeOs += 1;
    atual.receita += canon.rev;
    atual.custo += canon.cost;
    mapa.set(empresa, atual);
  }
  return [...mapa.values()];
}
