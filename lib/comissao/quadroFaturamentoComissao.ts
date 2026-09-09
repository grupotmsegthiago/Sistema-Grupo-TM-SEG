/**
 * Quadro gerencial: cliente × faturamento × comissão prevista (16% / 3%).
 * Lê faturas reais. Não atribui comercial. Não grava comissão pagável.
 */
import { calcularComissao } from './comissaoCalc';
import {
  casarClienteDaFatura,
  fetchAllRows,
  normalizeClienteNome,
  type ClienteComissaoMatch,
  type InvoiceComissaoMatch,
} from './sincronizarComissoesFaturas';
import type { ComissaoDbClient } from './comissaoCore';

export type LinhaQuadroCliente = {
  empresa: 'TM SEG' | 'TORRES';
  cliente: string;
  faturas: number;
  faturamento: number;
  imposto: number;
  baseLiquida: number;
  comissao: number;
  comercialNome: string | null;
};

export type FaturaQuadro = {
  empresa: 'TM_SEG' | 'TORRES';
  cliente: string | null;
  amount: number | null;
  date: string | null;
  status: string | null;
  comercialId?: string | null;
};

export function faturaCancelada(status: string | null | undefined): boolean {
  return /CANCEL/i.test(String(status || ''));
}

export function faturaNoPeriodo(date: string | null | undefined, start: string, end: string): boolean {
  const d = String(date || '').slice(0, 10);
  return d >= start && d <= end;
}

export function periodoDeDataIso(iso: string | null | undefined): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})/.exec(String(iso || '').slice(0, 10));
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

export function anosFiltroComissao(...extras: Array<number | null | undefined>): number[] {
  const set = new Set<number>([2024, 2025, 2026, 2027]);
  for (const y of extras) {
    if (Number.isFinite(Number(y))) set.add(Number(y));
  }
  return [...set].sort((a, b) => a - b);
}

export function mesesComFatura(faturas: Array<{ date?: string | null; status?: string | null }>): string[] {
  const set = new Set<string>();
  for (const fat of faturas) {
    if (faturaCancelada(fat.status)) continue;
    const mes = String(fat.date || '').slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(mes)) set.add(mes);
  }
  return [...set].sort().reverse();
}

export function montarQuadroClientes(
  faturas: FaturaQuadro[],
  clients: ClienteComissaoMatch[],
  comerciais: Array<{ id: string; nome?: string | null }>,
  periodStart: string,
  periodEnd: string,
): LinhaQuadroCliente[] {
  const nomeComercial = (id?: string | null) => {
    if (!id) return null;
    return comerciais.find((c) => c.id === id)?.nome || null;
  };
  const map = new Map<string, LinhaQuadroCliente>();
  for (const fat of faturas) {
    if (faturaCancelada(fat.status)) continue;
    if (!faturaNoPeriodo(fat.date, periodStart, periodEnd)) continue;
    const calc = calcularComissao(Number(fat.amount) || 0, 16, 3);
    const match = casarClienteDaFatura(fat.cliente, clients);
    const comercialId = fat.comercialId || (match.status === 'ok' ? match.client?.responsavel_comercial_id : null);
    const empresa = fat.empresa === 'TORRES' ? 'TORRES' : 'TM SEG';
    const cliente = String(fat.cliente || '—').trim().toUpperCase() || '—';
    const key = `${empresa}|${normalizeClienteNome(cliente)}`;
    const prev = map.get(key) || {
      empresa,
      cliente,
      faturas: 0,
      faturamento: 0,
      imposto: 0,
      baseLiquida: 0,
      comissao: 0,
      comercialNome: nomeComercial(comercialId),
    };
    prev.faturas += 1;
    prev.faturamento += calc.valorFaturamento;
    prev.imposto += calc.valorImposto;
    prev.baseLiquida += calc.valorBaseLiquida;
    prev.comissao += calc.valorComissao;
    if (!prev.comercialNome) prev.comercialNome = nomeComercial(comercialId);
    map.set(key, prev);
  }
  return [...map.values()].sort((a, b) => b.faturamento - a.faturamento);
}

export function somarQuadro(linhas: LinhaQuadroCliente[]): {
  faturamento: number;
  imposto: number;
  baseLiquida: number;
  comissao: number;
  faturas: number;
} {
  return linhas.reduce(
    (acc, l) => ({
      faturamento: acc.faturamento + l.faturamento,
      imposto: acc.imposto + l.imposto,
      baseLiquida: acc.baseLiquida + l.baseLiquida,
      comissao: acc.comissao + l.comissao,
      faturas: acc.faturas + l.faturas,
    }),
    { faturamento: 0, imposto: 0, baseLiquida: 0, comissao: 0, faturas: 0 },
  );
}

export async function resolverPeriodoInicialFaturas(
  sb: ComissaoDbClient,
): Promise<{ year: number; month: number } | null> {
  const q = sb.from('financial_invoices').select('date').order('date', { ascending: false });
  const ranged = typeof q.limit === 'function' ? q.limit(1) : q;
  const { data, error } = await ranged;
  if (error) return null;
  return periodoDeDataIso(data?.[0]?.date);
}

export async function carregarQuadroTmSeg(
  sb: ComissaoDbClient,
  periodStart: string,
  periodEnd: string,
  comerciais: Array<{ id: string; nome?: string | null }>,
): Promise<{ linhas: LinhaQuadroCliente[]; meses: string[]; error?: string }> {
  const invRes = await fetchAllRows(sb, 'financial_invoices', 'id, client, number, amount, date, status');
  if (invRes.error) return { linhas: [], meses: [], error: invRes.error };
  const cliRes = await fetchAllRows(sb, 'clients', 'id, name, trading_name, responsavel_comercial_id');
  if (cliRes.error) return { linhas: [], meses: [], error: cliRes.error };
  const invoices = (invRes.rows || []) as InvoiceComissaoMatch[];
  const faturas: FaturaQuadro[] = invoices.map((inv) => ({
    empresa: 'TM_SEG',
    cliente: inv.client || null,
    amount: inv.amount ?? null,
    date: inv.date || null,
    status: inv.status || null,
  }));
  return {
    linhas: montarQuadroClientes(faturas, (cliRes.rows || []) as ClienteComissaoMatch[], comerciais, periodStart, periodEnd),
    meses: mesesComFatura(invoices),
  };
}

export function quadroDeComissoesTorres(
  rows: Array<{
    empresa_origem?: string | null;
    cliente_nome?: string | null;
    valor_faturamento?: number | null;
    valor_comissao?: number | null;
    percentual_imposto_aplicado?: number | null;
    valor_base_liquida?: number | null;
    comerciais?: { nome?: string | null } | null;
  }>,
): LinhaQuadroCliente[] {
  const map = new Map<string, LinhaQuadroCliente>();
  for (const r of rows) {
    if (String(r.empresa_origem || '').toUpperCase() !== 'TORRES') continue;
    const calc = calcularComissao(
      Number(r.valor_faturamento) || 0,
      Number(r.percentual_imposto_aplicado) || 16,
      3,
    );
    const cliente = String(r.cliente_nome || '—').trim().toUpperCase() || '—';
    const key = normalizeClienteNome(cliente);
    const prev = map.get(key) || {
      empresa: 'TORRES' as const,
      cliente,
      faturas: 0,
      faturamento: 0,
      imposto: 0,
      baseLiquida: 0,
      comissao: 0,
      comercialNome: r.comerciais?.nome || null,
    };
    prev.faturas += 1;
    prev.faturamento += calc.valorFaturamento;
    prev.imposto += calc.valorImposto;
    prev.baseLiquida += Number(r.valor_base_liquida) || calc.valorBaseLiquida;
    prev.comissao += Number(r.valor_comissao) || calc.valorComissao;
    if (!prev.comercialNome) prev.comercialNome = r.comerciais?.nome || null;
    map.set(key, prev);
  }
  return [...map.values()].sort((a, b) => b.faturamento - a.faturamento);
}
