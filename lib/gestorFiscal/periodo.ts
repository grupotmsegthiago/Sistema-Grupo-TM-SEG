/** Histórico fiscal desta etapa começa em janeiro de 2026. Período anterior é cortado e avisado. */

export const HISTORICO_INICIO = '2026-01-01';

export interface PeriodoFiscal {
  inicio: string;
  fim: string;
  cortado: boolean;
  aviso: string | null;
}

function isoValida(valor: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor);
}

export function clampPeriodoFiscal(inicio: string, fim: string): PeriodoFiscal {
  const ini = isoValida(inicio) ? inicio : HISTORICO_INICIO;
  const end = isoValida(fim) ? fim : HISTORICO_INICIO;
  const cortado = ini < HISTORICO_INICIO;
  const inicioEfetivo = cortado ? HISTORICO_INICIO : ini;
  const fimEfetivo = end < inicioEfetivo ? inicioEfetivo : end;
  return {
    inicio: inicioEfetivo,
    fim: fimEfetivo,
    cortado,
    aviso: cortado
      ? `O recorte pedido começa antes de janeiro de 2026. A leitura usa ${HISTORICO_INICIO}.`
      : null,
  };
}

export function mesDeIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const s = String(iso).slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s : null;
}

export function mesDentro(mes: string, inicio: string, fim: string): boolean {
  const dia = `${mes}-01`;
  const fimMes = `${mes}-31`;
  return fimMes >= inicio && dia <= fim;
}
