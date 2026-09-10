/**
 * Sincronismo TM SEG ↔ TORRES para o quadro de comissões.
 * Persiste na tabela comissoes o universo TORRES com responsável comercial
 * (NF + OS sem NF + receita), sem recálculo de preço.
 * Fail-closed: sem chave TORRES o live pull não inventa faturamento.
 */
import {
  atualizarStatusAposBaixaPorOrigem,
  gerarComissaoAoFaturar,
  type ComissaoDbClient,
} from './comissaoCore.js';
import {
  fetchAllRows,
  sincronizarComissoesFaturasExistentes,
  type SyncComissoesFaturasResult,
} from './sincronizarComissoesFaturas.js';
import { type FaturaQuadro } from './quadroFaturamentoComissao.js';
import { carregarFaturasQuadroTorresLive as carregarLiveTorres } from './quadroTorres.js';
import { createTorresAdminClient } from './torresSupabase.js';

export type ClienteTorresComercial = {
  id: number;
  nome: string;
  comercialId: string;
};

export type SyncTorresResult = {
  ok: boolean;
  liveDisponivel: boolean;
  clientesComComercial: ClienteTorresComercial[];
  faturasLidas: number;
  generated: number;
  skippedJaExiste: number;
  skippedSemComercial: number;
  paidUpdated: number;
  errors: number;
  error?: string;
};

export type SyncTmTorresResult = {
  ok: boolean;
  tm: SyncComissoesFaturasResult;
  torres: SyncTorresResult;
  syncedAt: string;
  error?: string;
};

export function periodoSyncComissoes(todayIso: string, monthsBack = 18): { start: string; end: string } {
  const end = String(todayIso || '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(end);
  if (!m) return { start: '2025-01-01', end: end || '2025-01-01' };
  let year = Number(m[1]);
  let month = Number(m[2]) - monthsBack;
  while (month <= 0) {
    month += 12;
    year -= 1;
  }
  return { start: `${year}-${String(month).padStart(2, '0')}-01`, end };
}

export function origemFaturaTorresPersistencia(fat: { id?: string | null; number?: string | null }): string {
  const raw = String(fat.id || fat.number || '').trim();
  if (raw.startsWith('inv:')) return raw.slice(4);
  return raw;
}

export function faturaTorresPaga(fat: {
  paymentDate?: string | null;
  status?: string | null;
  asaasStatus?: string | null;
  receivableStatus?: string | null;
}): boolean {
  if (String(fat.paymentDate || '').trim()) return true;
  const s = `${fat.status || ''} ${fat.asaasStatus || ''} ${fat.receivableStatus || ''}`.toUpperCase();
  return /\b(PAGA|PAGO|RECEIVED|CONFIRMED)\b/.test(s);
}

export async function persistirFaturasTorresNoCadastro(
  sbTm: ComissaoDbClient,
  faturas: FaturaQuadro[],
): Promise<{ generated: number; skippedJaExiste: number; skippedSemComercial: number; paidUpdated: number; errors: number }> {
  const out = {
    generated: 0,
    skippedJaExiste: 0,
    skippedSemComercial: 0,
    paidUpdated: 0,
    errors: 0,
  };
  for (const fat of faturas) {
    const comercialId = String(fat.comercialId || '').trim();
    const origem = origemFaturaTorresPersistencia(fat);
    if (!origem) {
      out.errors += 1;
      continue;
    }
    if (!comercialId) {
      out.skippedSemComercial += 1;
      continue;
    }
    const gerada = await gerarComissaoAoFaturar(sbTm, {
      empresaOrigem: 'TORRES',
      origemFaturaId: origem,
      clienteOrigemId: null,
      clienteNome: fat.cliente,
      comercialId,
      valorFaturamento: Number(fat.amount) || 0,
      dataFaturamento: fat.date,
      faturaNumero: fat.number,
      ordemServicoId: fat.osIds?.[0] || null,
    });
    if (gerada.error) out.errors += 1;
    else if (gerada.reason === 'já existe') out.skippedJaExiste += 1;
    else if (gerada.reason === 'cliente sem responsável comercial') out.skippedSemComercial += 1;
    else if (gerada.ok && !gerada.skipped) out.generated += 1;
    if (faturaTorresPaga(fat)) {
      const pago = await atualizarStatusAposBaixaPorOrigem(sbTm, 'TORRES', origem, fat.paymentDate);
      if (pago.ok && (pago.updated || 0) > 0) out.paidUpdated += pago.updated;
    }
  }
  return out;
}

async function listarClientesTorresComComercial(
  sbTorres: ComissaoDbClient,
): Promise<{ rows: ClienteTorresComercial[]; error?: string }> {
  const cliRes = await fetchAllRows(
    sbTorres,
    'clients',
    'id, name, nome_fantasia, razao_social, responsavel_comercial_id',
  );
  if (cliRes.error) return { rows: [], error: cliRes.error };
  const rows: ClienteTorresComercial[] = [];
  for (const c of cliRes.rows || []) {
    const comercialId = String(c.responsavel_comercial_id || '').trim();
    if (!comercialId) continue;
    rows.push({
      id: Number(c.id),
      nome: String(c.nome_fantasia || c.name || c.razao_social || '').trim() || `Cliente ${c.id}`,
      comercialId,
    });
  }
  rows.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return { rows };
}

export async function sincronizarComissoesTorres(
  sbTm: ComissaoDbClient,
  opts?: {
    periodStart?: string;
    periodEnd?: string;
    todayIso?: string;
    sbTorres?: ComissaoDbClient | null;
  },
): Promise<SyncTorresResult> {
  const empty: SyncTorresResult = {
    ok: false,
    liveDisponivel: false,
    clientesComComercial: [],
    faturasLidas: 0,
    generated: 0,
    skippedJaExiste: 0,
    skippedSemComercial: 0,
    paidUpdated: 0,
    errors: 0,
  };
  const today = String(opts?.todayIso || new Date().toISOString()).slice(0, 10);
  const periodo = periodoSyncComissoes(today);
  const start = opts?.periodStart || periodo.start;
  const end = opts?.periodEnd || periodo.end;
  const live = opts?.sbTorres === undefined ? createTorresAdminClient() : opts.sbTorres;
  if (!live) {
    return {
      ...empty,
      error: 'TORRES_SUPABASE_SERVICE_ROLE_KEY ausente — a TM SEG não lê o cadastro/OS da TORRES neste ambiente.',
    };
  }
  const clientes = await listarClientesTorresComComercial(live);
  const liveFat = await carregarLiveTorres(live, start, end);
  if (liveFat.error && !(liveFat.faturas || []).length) {
    return {
      ...empty,
      liveDisponivel: true,
      clientesComComercial: clientes.rows,
      error: liveFat.error || clientes.error,
    };
  }
  const persist = await persistirFaturasTorresNoCadastro(sbTm, liveFat.faturas || []);
  return {
    ok: !liveFat.error && !clientes.error,
    liveDisponivel: true,
    clientesComComercial: clientes.rows,
    faturasLidas: (liveFat.faturas || []).length,
    generated: persist.generated,
    skippedJaExiste: persist.skippedJaExiste,
    skippedSemComercial: persist.skippedSemComercial,
    paidUpdated: persist.paidUpdated,
    errors: persist.errors,
    error: liveFat.error || clientes.error,
  };
}

export async function sincronizarComissoesTmETorres(
  sbTm: ComissaoDbClient,
  opts?: {
    periodStart?: string;
    periodEnd?: string;
    todayIso?: string;
    sbTorres?: ComissaoDbClient | null;
  },
): Promise<SyncTmTorresResult> {
  const tm = await sincronizarComissoesFaturasExistentes(sbTm);
  const torres = await sincronizarComissoesTorres(sbTm, opts);
  return {
    ok: tm.ok && (torres.ok || !torres.liveDisponivel),
    tm,
    torres,
    syncedAt: new Date().toISOString(),
    error: tm.error || torres.error,
  };
}
