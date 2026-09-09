import {
  atualizarStatusAposBaixaPorOrigem,
  cancelarComissaoPorOrigem,
  gerarComissaoAoFaturar,
  normalizeEmpresaOrigem,
  type ComissaoDbClient,
  type EmpresaOrigem,
} from './comissaoCore.js';

export const COMISSAO_INGEST_EVENTOS = ['FATURADO', 'PAGO', 'CANCELADO'] as const;
export type ComissaoIngestEvento = (typeof COMISSAO_INGEST_EVENTOS)[number];

export type ComissaoIngestPayload = {
  empresa?: string | null;
  evento?: string | null;
  origemFaturaId?: string | number | null;
  clienteOrigemId?: string | number | null;
  clienteNome?: string | null;
  comercialId?: string | null;
  valorFaturamento?: number | string | null;
  dataFaturamento?: string | null;
  faturaNumero?: string | null;
  ordemServicoId?: string | number | null;
  dataRecebimento?: string | null;
};

export type ComissaoIngestParsed = {
  empresa: EmpresaOrigem;
  evento: ComissaoIngestEvento;
  origemFaturaId: string;
  clienteOrigemId: number | null;
  clienteNome: string | null;
  comercialId: string | null;
  valorFaturamento: number;
  dataFaturamento: string | null;
  faturaNumero: string | null;
  ordemServicoId: string | null;
  dataRecebimento: string | null;
};

export function parseComissaoIngestPayload(body: unknown): { ok: true; data: ComissaoIngestParsed } | { ok: false; error: string } {
  const raw = (body && typeof body === 'object' ? body : {}) as ComissaoIngestPayload;
  const empresa = normalizeEmpresaOrigem(raw.empresa);
  const eventoRaw = String(raw.evento || '').trim().toUpperCase();
  if (!COMISSAO_INGEST_EVENTOS.includes(eventoRaw as ComissaoIngestEvento)) {
    return { ok: false, error: 'evento inválido' };
  }
  const origemFaturaId = String(raw.origemFaturaId ?? '').trim();
  if (!origemFaturaId) return { ok: false, error: 'origemFaturaId ausente' };
  const comercialId = String(raw.comercialId || '').trim() || null;
  const clienteOrigem = raw.clienteOrigemId != null && String(raw.clienteOrigemId).trim()
    ? Number(raw.clienteOrigemId)
    : null;
  return {
    ok: true,
    data: {
      empresa,
      evento: eventoRaw as ComissaoIngestEvento,
      origemFaturaId,
      clienteOrigemId: Number.isFinite(clienteOrigem as number) ? clienteOrigem : null,
      clienteNome: String(raw.clienteNome || '').trim() || null,
      comercialId,
      valorFaturamento: Number(raw.valorFaturamento) || 0,
      dataFaturamento: raw.dataFaturamento ? String(raw.dataFaturamento).slice(0, 10) : null,
      faturaNumero: String(raw.faturaNumero || '').trim() || null,
      ordemServicoId: raw.ordemServicoId != null ? String(raw.ordemServicoId) : null,
      dataRecebimento: raw.dataRecebimento ? String(raw.dataRecebimento).slice(0, 10) : null,
    },
  };
}

export async function processarComissaoIngest(
  sb: ComissaoDbClient,
  parsed: ComissaoIngestParsed,
): Promise<{ ok: boolean; skipped?: boolean; reason?: string; comissaoId?: string; updated?: number; error?: string }> {
  if (parsed.evento === 'FATURADO') {
    return gerarComissaoAoFaturar(sb, {
      empresaOrigem: parsed.empresa,
      origemFaturaId: parsed.origemFaturaId,
      clienteOrigemId: parsed.clienteOrigemId,
      clienteNome: parsed.clienteNome,
      comercialId: parsed.comercialId,
      valorFaturamento: parsed.valorFaturamento,
      dataFaturamento: parsed.dataFaturamento,
      faturaNumero: parsed.faturaNumero,
      ordemServicoId: parsed.ordemServicoId,
    });
  }
  if (parsed.evento === 'PAGO') {
    return atualizarStatusAposBaixaPorOrigem(
      sb,
      parsed.empresa,
      parsed.origemFaturaId,
      parsed.dataRecebimento,
    );
  }
  return cancelarComissaoPorOrigem(sb, parsed.empresa, parsed.origemFaturaId);
}

export function isComissaoIngestAuthorized(token: string | undefined, expectedTokens: Array<string | undefined>): boolean {
  const received = String(token || '').trim();
  if (!received) return false;
  return expectedTokens.some((t) => String(t || '').trim() && t === received);
}

export type ComercialIngestListItem = { id: string; nome: string };

export async function listarComerciaisParaIngest(
  sb: ComissaoDbClient,
): Promise<{ ok: boolean; comerciais: ComercialIngestListItem[]; error?: string }> {
  const { data, error } = await sb
    .from('comerciais')
    .select('id, nome, ativo')
    .order('nome', { ascending: true });
  if (error) return { ok: false, comerciais: [], error: error.message };
  const comerciais = (data || [])
    .filter((row: { ativo?: boolean | null }) => row.ativo !== false)
    .map((row: { id: string; nome?: string | null }) => ({
      id: String(row.id),
      nome: String(row.nome || '').trim() || String(row.id),
    }));
  return { ok: true, comerciais };
}
