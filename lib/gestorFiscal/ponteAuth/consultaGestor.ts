/**
 * Consulta do Gestor Fiscal preparada para uma API autenticada.
 * A homologação real permanece desligada. Não há chamada de produção.
 */
import { atenderProducao } from './ponte';
import type { LinhaFicticia } from './tipos';

export interface TotalGestor {
  empresaId: string;
  quantidadeOs: number;
  valorCentavos: number;
}

export function projetarGestor(linhas: readonly LinhaFicticia[]): TotalGestor[] {
  const mapa = new Map<string, TotalGestor>();
  for (const linha of linhas) {
    const atual = mapa.get(linha.empresaId) ?? { empresaId: linha.empresaId, quantidadeOs: 0, valorCentavos: 0 };
    atual.quantidadeOs += linha.os;
    atual.valorCentavos += linha.financeiroCentavos;
    mapa.set(linha.empresaId, atual);
  }
  return [...mapa.values()];
}

export function consultarGestorProducao(env?: Record<string, string | undefined>): {
  ok: false;
  codigo: string;
  motivo: string;
  homologacaoReal: false;
  dados: [];
} {
  const recusa = atenderProducao(env);
  return {
    ok: false,
    codigo: recusa.codigo,
    motivo: recusa.motivo,
    homologacaoReal: false,
    dados: [],
  };
}
