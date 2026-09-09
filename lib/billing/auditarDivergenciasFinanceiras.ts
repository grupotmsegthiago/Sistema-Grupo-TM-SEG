/**
 * Auditoria de divergência Fatura ↔ soma das OS (e comissão).
 * Só considera faturas com vínculo em financial_invoice_missions.
 * Consulta incompleta ≠ “sem divergência”.
 */
import { supabase } from '../supabase';
import { roundMoney } from '../comissao/comissaoCalc';
import {
  deveSincronizarStatusFatura,
  somarReceitasOs,
  type InvoiceSyncClient,
  type ReceitaOsFaturaInput,
} from './sincronizarFaturaAberta';

export const DIVERGENCIA_TOLERANCIA_BRL = 0.01;

export type EstadoDivergencia = 'DIVERGENTE' | 'CONSULTA_INCOMPLETA';

export type ItemDivergenciaFinanceira = {
  invoiceId: string;
  faturaNumero: string | null;
  cliente: string;
  status: string;
  valorOs: number;
  valorFatura: number;
  valorComissaoFaturamento: number | null;
  diferencaFatura: number;
  diferencaComissao: number | null;
  osCount: number;
  missionIdSync: string;
  estado: EstadoDivergencia;
  podeSincronizar: boolean;
};

export type AuditoriaDivergenciasResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  consultaIncompleta?: boolean;
  items: ItemDivergenciaFinanceira[];
  error?: string;
};

export type EntradaAuditoriaFatura = {
  invoiceId: string;
  faturaNumero?: string | null;
  cliente?: string | null;
  status?: string | null;
  valorFatura: number;
  valorOs: number;
  valorComissaoFaturamento?: number | null;
  osCount: number;
  missionIdSync: string;
  consultaOsIncompleta?: boolean;
};

const MISSION_SELECT =
  'id, revenue_value, toll_value, toll_value_provider, displacement_value';

function isMissingRelation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === '42703' || /does not exist/i.test(String(error.message || ''));
}

export function valoresDivergem(a: number, b: number, tolerancia = DIVERGENCIA_TOLERANCIA_BRL): boolean {
  return Math.abs(roundMoney(roundMoney(a) - roundMoney(b))) > tolerancia;
}

export function avaliarDivergenciaFatura(entrada: EntradaAuditoriaFatura): ItemDivergenciaFinanceira | null {
  const status = String(entrada.status || '').trim().toUpperCase();
  const valorOs = roundMoney(entrada.valorOs);
  const valorFatura = roundMoney(entrada.valorFatura);
  const valorComissao = entrada.valorComissaoFaturamento == null
    ? null
    : roundMoney(entrada.valorComissaoFaturamento);
  const base: ItemDivergenciaFinanceira = {
    invoiceId: String(entrada.invoiceId),
    faturaNumero: entrada.faturaNumero || null,
    cliente: String(entrada.cliente || '—').trim() || '—',
    status,
    valorOs,
    valorFatura,
    valorComissaoFaturamento: valorComissao,
    diferencaFatura: roundMoney(valorOs - valorFatura),
    diferencaComissao: valorComissao == null ? null : roundMoney(valorOs - valorComissao),
    osCount: entrada.osCount,
    missionIdSync: String(entrada.missionIdSync || ''),
    estado: 'DIVERGENTE',
    podeSincronizar: deveSincronizarStatusFatura(status),
  };

  if (entrada.consultaOsIncompleta) {
    return { ...base, estado: 'CONSULTA_INCOMPLETA', podeSincronizar: false };
  }

  const fatDiverge = valoresDivergem(valorOs, valorFatura);
  const comDiverge = valorComissao != null && valoresDivergem(valorOs, valorComissao);
  if (!fatDiverge && !comDiverge) return null;
  return base;
}

export function filtrarDivergenciasAbertas(
  items: ItemDivergenciaFinanceira[] | null | undefined,
): ItemDivergenciaFinanceira[] {
  return (items || []).filter((i) => deveSincronizarStatusFatura(i.status));
}

async function fetchAllRows(
  sb: InvoiceSyncClient,
  table: string,
  columns: string,
): Promise<{ rows: any[]; complete: boolean; error?: string }> {
  const rows: any[] = [];
  let from = 0;
  const page = 1000;
  const max = 50_000;
  while (rows.length < max) {
    const to = from + page - 1;
    let q = sb.from(table).select(columns);
    if (typeof q.range === 'function') q = q.range(from, to);
    const { data, error } = await q;
    if (error) {
      return { rows: [], complete: false, error: error.message };
    }
    const batch = data || [];
    rows.push(...batch);
    if (typeof q.range !== 'function') {
      return { rows, complete: true };
    }
    if (batch.length < page) return { rows, complete: true };
    from += batch.length;
  }
  return { rows, complete: false };
}

async function fetchByIds<T>(
  sb: InvoiceSyncClient,
  table: string,
  columns: string,
  idField: string,
  ids: string[],
): Promise<{ data: T[]; error?: string }> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data, error } = await sb.from(table).select(columns).in(idField, chunk);
    if (error) return { data: [], error: error.message };
    out.push(...((data || []) as T[]));
  }
  return { data: out };
}

function pickComissaoFaturamento(rows: Array<{ valor_faturamento?: number | null; status?: string | null }>): number | null {
  const vivos = (rows || []).filter((r) => String(r.status || '').toUpperCase() !== 'CANCELADO');
  if (vivos.length === 0) return null;
  const aguardando = vivos.find((r) => String(r.status || '').toUpperCase() === 'AGUARDANDO_PAGAMENTO_CLIENTE');
  const escolhida = aguardando || vivos[0];
  return Number(escolhida.valor_faturamento) || 0;
}

export async function auditarDivergenciasInvoices(
  opts?: { sb?: InvoiceSyncClient },
): Promise<AuditoriaDivergenciasResult> {
  const sb = opts?.sb || supabase;
  try {
    const vinculosRes = await fetchAllRows(sb, 'financial_invoice_missions', 'invoice_id, mission_id');
    if (vinculosRes.error) {
      if (isMissingRelation({ message: vinculosRes.error })) {
        return { ok: true, skipped: true, reason: 'tabela_vinculo_ausente', items: [] };
      }
      return { ok: false, items: [], error: vinculosRes.error };
    }

    const byInvoice = new Map<string, string[]>();
    for (const row of vinculosRes.rows) {
      const invoiceId = String(row.invoice_id || '').trim();
      const missionId = String(row.mission_id || '').trim();
      if (!invoiceId || !missionId) continue;
      const list = byInvoice.get(invoiceId) || [];
      if (!list.includes(missionId)) list.push(missionId);
      byInvoice.set(invoiceId, list);
    }

    const invoiceIds = [...byInvoice.keys()];
    if (invoiceIds.length === 0) {
      return { ok: true, items: [], consultaIncompleta: !vinculosRes.complete };
    }

    const fatRes = await fetchByIds<{
      id: string;
      client?: string | null;
      number?: string | null;
      status?: string | null;
      amount?: number | null;
    }>(sb, 'financial_invoices', 'id, client, number, status, amount', 'id', invoiceIds);
    if (fatRes.error) return { ok: false, items: [], error: fatRes.error };

    const allMissionIds = [...new Set(invoiceIds.flatMap((id) => byInvoice.get(id) || []))];
    const missRes = await fetchByIds<ReceitaOsFaturaInput>(
      sb,
      'missions',
      MISSION_SELECT,
      'id',
      allMissionIds,
    );
    if (missRes.error) return { ok: false, items: [], error: missRes.error };

    const missionsById = new Map<string, ReceitaOsFaturaInput>();
    for (const m of missRes.data) {
      const id = String(m.id || '').trim();
      if (id) missionsById.set(id, m);
    }

    const comResFat = await fetchByIds<{
      fatura_id?: string | null;
      origem_fatura_id?: string | null;
      valor_faturamento?: number | null;
      status?: string | null;
    }>(
      sb,
      'comissoes',
      'fatura_id, origem_fatura_id, valor_faturamento, status',
      'fatura_id',
      invoiceIds,
    );
    const comResOrig = await fetchByIds<{
      fatura_id?: string | null;
      origem_fatura_id?: string | null;
      valor_faturamento?: number | null;
      status?: string | null;
    }>(
      sb,
      'comissoes',
      'fatura_id, origem_fatura_id, valor_faturamento, status',
      'origem_fatura_id',
      invoiceIds,
    );
    const comErr = comResFat.error || comResOrig.error;
    if (comErr && !isMissingRelation({ message: comErr })) {
      return { ok: false, items: [], error: comErr };
    }

    const comByInvoice = new Map<string, Array<{ valor_faturamento?: number | null; status?: string | null }>>();
    for (const c of [...(comResFat.data || []), ...(comResOrig.data || [])]) {
      const key = String(c.fatura_id || c.origem_fatura_id || '').trim();
      if (!key) continue;
      const list = comByInvoice.get(key) || [];
      list.push(c);
      comByInvoice.set(key, list);
    }

    const items: ItemDivergenciaFinanceira[] = [];
    for (const fatura of fatRes.data) {
      const invoiceId = String(fatura.id);
      const missionIds = byInvoice.get(invoiceId) || [];
      const found = missionIds.map((id) => missionsById.get(id)).filter(Boolean) as ReceitaOsFaturaInput[];
      const incompleta = found.length !== missionIds.length;
      const item = avaliarDivergenciaFatura({
        invoiceId,
        faturaNumero: fatura.number,
        cliente: fatura.client,
        status: fatura.status,
        valorFatura: Number(fatura.amount) || 0,
        valorOs: incompleta ? 0 : somarReceitasOs(found),
        valorComissaoFaturamento: pickComissaoFaturamento(comByInvoice.get(invoiceId) || []),
        osCount: missionIds.length,
        missionIdSync: missionIds[0] || '',
        consultaOsIncompleta: incompleta,
      });
      if (item) items.push(item);
    }

    return {
      ok: true,
      items,
      consultaIncompleta: !vinculosRes.complete || fatRes.data.length !== invoiceIds.length,
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn('[BILLING_AUDIT_DIVERGENCE]', message);
    return { ok: false, items: [], error: message };
  }
}

export function formatarTagDivergencia(item: Pick<ItemDivergenciaFinanceira, 'valorOs' | 'valorFatura'>): string {
  const os = item.valorOs.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fat = item.valorFatura.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `[ ⚠️ Divergência Detectada: OS R$ ${os} vs Fatura R$ ${fat} ]`;
}
