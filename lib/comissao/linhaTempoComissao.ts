/**
 * Fluxo por cliente: OS gerada no nome do comercial segue até o pagamento
 * da comissão, tenha ou não NF. Não altera a fórmula 16%/3%/piso.
 */
export type EtapaLinhaTempoId = 'OS_GERADA' | 'FATURADO' | 'PAGO' | 'COMISSAO';
export type EstadoEtapaLinhaTempo = 'FEITO' | 'ATUAL' | 'PENDENTE';

export type EtapaLinhaTempo = {
  id: EtapaLinhaTempoId;
  label: string;
  estado: EstadoEtapaLinhaTempo;
};

export type LinhaTempoCliente = {
  etapas: EtapaLinhaTempo[];
  etapaAtual: EtapaLinhaTempoId | null;
};

export const LABELS_LINHA_TEMPO: Record<EtapaLinhaTempoId, string> = {
  OS_GERADA: 'OS Gerada',
  FATURADO: 'Faturado',
  PAGO: 'Pago',
  COMISSAO: 'Comissão',
};

export const ORDEM_LINHA_TEMPO: EtapaLinhaTempoId[] = [
  'OS_GERADA',
  'FATURADO',
  'PAGO',
  'COMISSAO',
];

export function detalheEhOsSemNf(d: {
  id?: string | null;
  numero?: string | null;
  osIds?: string[] | null;
}): boolean {
  const osIds = (d.osIds || []).map((id) => String(id || '').trim()).filter(Boolean);
  const num = String(d.numero || '').trim();
  const id = String(d.id || '').trim();
  if (osIds.length === 0) return false;
  if (num && osIds.includes(num)) return true;
  if (id && osIds.includes(id)) return true;
  return /^GTM-/i.test(num || id);
}

function marcarEtapas(feitos: boolean[]): EstadoEtapaLinhaTempo[] {
  let atualMarcado = false;
  return feitos.map((ok) => {
    if (ok) return 'FEITO';
    if (!atualMarcado) {
      atualMarcado = true;
      return 'ATUAL';
    }
    return 'PENDENTE';
  });
}

export function montarLinhaTempoCliente(args: {
  empresa?: string | null;
  faturamento?: number | null;
  missoes?: number | null;
  osFaturadas?: number | null;
  osSemFatura?: number | null;
  coberturaEstado?: string | null;
  statusFatura?: string | null;
  statusComissao?: string | null;
  detalhes?: Array<{
    id?: string | null;
    numero?: string | null;
    osIds?: string[] | null;
    pago?: boolean;
  }>;
}): LinhaTempoCliente {
  const detalhes = args.detalhes || [];
  const temOs = (Number(args.missoes) || 0) > 0
    || detalhes.some((d) => (d.osIds || []).length > 0)
    || (Number(args.faturamento) || 0) > 0;
  const empresaTorres = String(args.empresa || '').toUpperCase() === 'TORRES';
  const temNfReal = empresaTorres || detalhes.some((d) => !detalheEhOsSemNf(d));
  const consultaIncompleta = args.coberturaEstado === 'CONSULTA INCOMPLETA';
  const osSemFatura = Number(args.osSemFatura) || 0;
  const osFaturadas = Number(args.osFaturadas) || 0;
  const pendenteNf = consultaIncompleta || osSemFatura > 0;
  const faturado = temOs && !pendenteNf && (osFaturadas > 0 || temNfReal);
  const pago = faturado && args.statusFatura === 'PAGO';
  const comissao = pago && args.statusComissao === 'PAGO';
  const feitos = [temOs, faturado, pago, comissao];
  const estados = marcarEtapas(feitos);
  const etapas = ORDEM_LINHA_TEMPO.map((id, i) => ({
    id,
    label: LABELS_LINHA_TEMPO[id],
    estado: estados[i],
  }));
  return {
    etapas,
    etapaAtual: etapas.find((e) => e.estado === 'ATUAL')?.id || null,
  };
}
