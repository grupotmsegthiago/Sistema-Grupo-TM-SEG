/**
 * Quadro gerencial: cliente × faturamento × comissão prevista (16% / 3%).
 * Só lista faturamento com responsável comercial. Não grava comissão pagável.
 */
import { calcularComissao } from './comissaoCalc.js';
import {
  casarClienteDaFatura,
  fetchAllRows,
  normalizeClienteNome,
  type ClienteComissaoMatch,
  type InvoiceComissaoMatch,
} from './sincronizarComissoesFaturas.js';
import { extractFaturaNumeroFromNotes, type ComissaoDbClient } from './comissaoCore.js';

export type DetalheFaturaQuadro = {
  id: string;
  numero: string | null;
  date: string | null;
  faturamento: number;
  imposto: number;
  valorAPagar: number;
  pago: boolean;
  osIds: string[];
};

export type LinhaQuadroCliente = {
  empresa: 'TM SEG' | 'TORRES';
  cliente: string;
  faturas: number;
  faturamento: number;
  imposto: number;
  baseLiquida: number;
  comissao: number;
  comercialId: string | null;
  comercialNome: string | null;
  detalhes: DetalheFaturaQuadro[];
  /** True quando o bruto do comercial no período (TM SEG + TORRES) ainda não chegou a R$ 50 mil. */
  abaixoDoPiso?: boolean;
};

export type FaturaQuadro = {
  id?: string | null;
  empresa: 'TM_SEG' | 'TORRES';
  cliente: string | null;
  number?: string | null;
  amount: number | null;
  date: string | null;
  status: string | null;
  asaasStatus?: string | null;
  comercialId?: string | null;
  osIds?: string[];
  receivableStatus?: string | null;
  paymentDate?: string | null;
};

export function unirOsIds(...grupos: Array<string[] | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const grupo of grupos) {
    for (const raw of grupo || []) {
      const id = String(raw || '').trim();
      if (!id || id === '0' || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function faturaCancelada(status: string | null | undefined): boolean {
  return /CANCEL/i.test(String(status || ''));
}

export function faturaNoPeriodo(date: string | null | undefined, start: string, end: string): boolean {
  const d = String(date || '').slice(0, 10);
  return d >= start && d <= end;
}

/** Pagamento do faturamento pelo cliente (não o pagamento da comissão ao vendedor). */
export function faturaClienteEstaPaga(args: {
  status?: string | null;
  asaasStatus?: string | null;
  receivableStatus?: string | null;
  paymentDate?: string | null;
}): boolean {
  const blob = `${args.status || ''} ${args.asaasStatus || ''} ${args.receivableStatus || ''}`.toUpperCase();
  if (/CANCEL/.test(blob)) return false;
  if (args.paymentDate && String(args.paymentDate).slice(0, 10) > '1900-01-01') return true;
  return (
    /\bPAGA\b/.test(blob) ||
    /\bPAID\b/.test(blob) ||
    /\bRECEBIDA\b/.test(blob) ||
    /\bRECEIVED\b/.test(blob) ||
    /\bCONFIRMED\b/.test(blob) ||
    /\bLIBERADO_PARA_PAGAMENTO\b/.test(blob)
  );
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
    const match = casarClienteDaFatura(fat.cliente, clients);
    const comercialId = String(
      fat.comercialId || (match.status === 'ok' ? match.client?.responsavel_comercial_id : '') || '',
    ).trim() || null;
    if (!comercialId) continue;
    const calc = calcularComissao(Number(fat.amount) || 0, 16, 3);
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
      comercialId,
      comercialNome: nomeComercial(comercialId),
      detalhes: [] as DetalheFaturaQuadro[],
    };
    prev.faturas += 1;
    prev.faturamento += calc.valorFaturamento;
    prev.imposto += calc.valorImposto;
    prev.baseLiquida += calc.valorBaseLiquida;
    prev.comissao += calc.valorComissao;
    if (!prev.comercialNome) prev.comercialNome = nomeComercial(comercialId);
    prev.detalhes.push({
      id: String(fat.id || fat.number || `${key}|${prev.faturas}`),
      numero: fat.number || null,
      date: fat.date || null,
      faturamento: calc.valorFaturamento,
      imposto: calc.valorImposto,
      valorAPagar: calc.valorComissao,
      pago: faturaClienteEstaPaga({
        status: fat.status,
        asaasStatus: fat.asaasStatus,
        receivableStatus: fat.receivableStatus,
        paymentDate: fat.paymentDate,
      }),
      osIds: unirOsIds(fat.osIds),
    });
    map.set(key, prev);
  }
  for (const linha of map.values()) {
    linha.detalhes.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
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

export function chaveLinhaQuadro(linha: Pick<LinhaQuadroCliente, 'empresa' | 'cliente'>): string {
  return `${linha.empresa}|${normalizeClienteNome(linha.cliente)}`;
}

/** Une API + ingest sem duplicar a mesma fatura/OS. */
export function mesclarLinhasQuadro(
  preferencial: LinhaQuadroCliente[],
  extra: LinhaQuadroCliente[],
): LinhaQuadroCliente[] {
  const map = new Map<string, LinhaQuadroCliente>();
  for (const origem of [preferencial, extra]) {
    for (const linha of origem) {
      const key = chaveLinhaQuadro(linha);
      const prev = map.get(key);
      if (!prev) {
        map.set(key, {
          ...linha,
          detalhes: [...(linha.detalhes || [])],
        });
        continue;
      }
      const ids = new Set(prev.detalhes.map((d) => d.id));
      for (const detalhe of linha.detalhes || []) {
        if (ids.has(detalhe.id)) continue;
        ids.add(detalhe.id);
        prev.detalhes.push(detalhe);
        prev.faturas += 1;
        prev.faturamento += detalhe.faturamento;
        prev.imposto += detalhe.imposto;
        prev.baseLiquida += detalhe.faturamento - detalhe.imposto;
        prev.comissao += detalhe.valorAPagar;
      }
      if (!prev.comercialId) prev.comercialId = linha.comercialId;
      if (!prev.comercialNome) prev.comercialNome = linha.comercialNome;
    }
  }
  for (const linha of map.values()) {
    linha.detalhes.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }
  return [...map.values()].sort((a, b) => b.faturamento - a.faturamento);
}

/** Piso homologado: abaixo disso o comercial só recebe o valor fixo. */
export const PISO_FATURAMENTO_COMISSAO = 50_000;

function zerarComissaoAbaixoDoPiso(linha: LinhaQuadroCliente, abaixo: boolean): LinhaQuadroCliente {
  if (!abaixo) {
    return { ...linha, abaixoDoPiso: false, detalhes: [...(linha.detalhes || [])] };
  }
  return {
    ...linha,
    comissao: 0,
    abaixoDoPiso: true,
    detalhes: (linha.detalhes || []).map((d) => ({ ...d, valorAPagar: 0 })),
  };
}

/**
 * Comissão % só aparece a partir de R$ 50 mil de faturamento do comercial no período.
 * O bruto do piso é TM SEG + TORRES daquele comercial, mesmo se a tela filtrar uma empresa.
 */
export function aplicarPisoComissaoQuadro(
  linhasTm: LinhaQuadroCliente[],
  linhasTorres: LinhaQuadroCliente[],
  piso = PISO_FATURAMENTO_COMISSAO,
): { linhasTm: LinhaQuadroCliente[]; linhasTorres: LinhaQuadroCliente[] } {
  const brutoPorComercial = new Map<string, number>();
  for (const linha of [...linhasTm, ...linhasTorres]) {
    const id = String(linha.comercialId || '').trim();
    if (!id) continue;
    brutoPorComercial.set(id, (brutoPorComercial.get(id) || 0) + (Number(linha.faturamento) || 0));
  }
  const aplicar = (linhas: LinhaQuadroCliente[]) =>
    linhas.map((linha) => {
      const id = String(linha.comercialId || '').trim();
      const bruto = brutoPorComercial.get(id) || 0;
      return zerarComissaoAbaixoDoPiso(linha, bruto < piso);
    });
  return { linhasTm: aplicar(linhasTm), linhasTorres: aplicar(linhasTorres) };
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
  const invRes = await fetchAllRows(
    sb,
    'financial_invoices',
    'id, client, number, amount, date, status, asaas_status',
  );
  if (invRes.error) return { linhas: [], meses: [], error: invRes.error };
  const cliRes = await fetchAllRows(sb, 'clients', 'id, name, trading_name, responsavel_comercial_id');
  const vinculosRes = await fetchAllRows(sb, 'financial_invoice_missions', 'invoice_id, mission_id');
  const missRes = await fetchAllRows(sb, 'missions', 'id, invoice_number');
  const recRes = await fetchAllRows(
    sb,
    'financial_transactions',
    'notes, status, type',
    (q) => q.eq('type', 'INCOME').ilike('notes', '%Fatura%'),
  );
  const osPorFatura = new Map<string, string[]>();
  for (const row of vinculosRes.rows || []) {
    const invoiceId = String(row.invoice_id || '').trim();
    const missionId = String(row.mission_id || '').trim();
    if (!invoiceId || !missionId) continue;
    const prev = osPorFatura.get(invoiceId) || [];
    prev.push(missionId);
    osPorFatura.set(invoiceId, prev);
  }
  const osPorNumero = new Map<string, string[]>();
  for (const row of missRes.rows || []) {
    const numero = String(row.invoice_number || '').trim();
    const missionId = String(row.id || '').trim();
    if (!numero || numero === '0' || !missionId) continue;
    const prev = osPorNumero.get(numero) || [];
    prev.push(missionId);
    osPorNumero.set(numero, prev);
  }
  const recebidoPorNumero = new Map<string, string>();
  for (const row of recRes.rows || []) {
    const numero = extractFaturaNumeroFromNotes(row.notes);
    if (!numero) continue;
    recebidoPorNumero.set(numero, String(row.status || ''));
  }
  const invoices = (invRes.rows || []) as Array<InvoiceComissaoMatch & { asaas_status?: string | null }>;
  const faturas: FaturaQuadro[] = invoices.map((inv) => ({
    id: inv.id,
    empresa: 'TM_SEG',
    cliente: inv.client || null,
    number: inv.number || null,
    amount: inv.amount ?? null,
    date: inv.date || null,
    status: inv.status || null,
    asaasStatus: inv.asaas_status || null,
    osIds: unirOsIds(
      osPorFatura.get(String(inv.id)),
      inv.number ? osPorNumero.get(String(inv.number)) : [],
    ),
    receivableStatus: inv.number ? recebidoPorNumero.get(String(inv.number)) || null : null,
  }));
  const linhas = montarQuadroClientes(
    faturas,
    (cliRes.rows || []) as ClienteComissaoMatch[],
    comerciais,
    periodStart,
    periodEnd,
  );
  return {
    linhas,
    meses: mesesComFatura(invoices),
    error: cliRes.error || vinculosRes.error || missRes.error || recRes.error,
  };
}

export function quadroDeComissoesTorres(
  rows: Array<{
    id?: string | null;
    origem_fatura_id?: string | null;
    fatura_numero?: string | null;
    empresa_origem?: string | null;
    cliente_nome?: string | null;
    valor_faturamento?: number | null;
    valor_comissao?: number | null;
    percentual_imposto_aplicado?: number | null;
    valor_base_liquida?: number | null;
    data_faturamento?: string | null;
    status?: string | null;
    comercial_id?: string | null;
    ordem_servico_id?: string | null;
    comerciais?: { nome?: string | null } | null;
  }>,
  comerciais: Array<{ id: string; nome?: string | null }> = [],
): LinhaQuadroCliente[] {
  const faturas: FaturaQuadro[] = [];
  for (const r of rows) {
    if (String(r.empresa_origem || '').toUpperCase() !== 'TORRES') continue;
    const comercialId = String(r.comercial_id || '').trim() || null;
    if (!comercialId) continue;
    faturas.push({
      id: r.origem_fatura_id || r.id || r.fatura_numero || null,
      empresa: 'TORRES',
      cliente: r.cliente_nome || null,
      number: r.fatura_numero || r.origem_fatura_id || null,
      amount: Number(r.valor_faturamento) || 0,
      date: r.data_faturamento || null,
      status: r.status || null,
      comercialId,
      osIds: r.ordem_servico_id ? [String(r.ordem_servico_id)] : [],
    });
  }
  const clients: ClienteComissaoMatch[] = [];
  return montarQuadroClientes(faturas, clients, comerciais, '0000-01-01', '9999-12-31');
}
