/**
 * Cobertura de OS do período × faturamento do cliente.
 * Fail-closed: ausência de dado ≠ “todas faturadas”.
 * Período pela DRE: end_time, status Concluída | Faturada. Valores persistidos (sem recálculo).
 */
import { roundMoney } from './comissaoCalc.js';
import { casarClienteDaFatura, fetchAllRows, normalizeClienteNome, type ClienteComissaoMatch } from './sincronizarComissoesFaturas.js';
import { resolveStoredClientToll, resolveStoredProviderToll } from '../toll/clientTollBilling.js';
import type { ComissaoDbClient } from './comissaoCore.js';

export const STATUS_OS_COBERTURA = ['Concluída', 'Faturada'] as const;

export type EstadoCobertura = 'ENCONTRADO' | 'NÃO EXISTE' | 'CONSULTA INCOMPLETA' | 'ERRO';

export type MissaoCoberturaInput = {
  id?: string | null;
  client?: string | null;
  status?: string | null;
  end_time?: string | null;
  invoice_number?: string | null;
  billing_approved?: boolean | null;
  revenue_value?: number | null;
  cost_value?: number | null;
  toll_value?: number | null;
  toll_value_provider?: number | null;
  displacement_value?: number | null;
  displacement_value_provider?: number | null;
  is_same_os?: boolean | null;
};

export type OsPeriodoItem = {
  id: string;
  cliente: string;
  comercialId: string | null;
  faturada: boolean;
  invoiceNumber: string | null;
  receita: number;
  custo: number;
  lucro: number;
  date: string | null;
};

export type CoberturaCliente = {
  cliente: string;
  comercialId: string | null;
  comercialNome: string | null;
  missoes: number;
  faturadas: number;
  semFatura: number;
  osSemFaturaIds: string[];
  receita: number;
  custo: number;
  lucro: number;
  margemPct: number | null;
  estado: EstadoCobertura;
};

export type CoberturaOsPeriodo = {
  estado: EstadoCobertura;
  error?: string;
  consultaIncompleta: boolean;
  itens: OsPeriodoItem[];
  porCliente: CoberturaCliente[];
  totais: {
    missoes: number;
    faturadas: number;
    semFatura: number;
    receita: number;
    custo: number;
    lucro: number;
  };
};

export function osEstaFaturada(args: {
  invoiceNumber?: string | null;
  missionId?: string | null;
  idsVinculados?: Set<string> | null;
}): boolean {
  const numero = String(args.invoiceNumber || '').trim();
  if (numero && numero !== '0') return true;
  const id = String(args.missionId || '').trim();
  if (id && args.idsVinculados?.has(id)) return true;
  return false;
}

export function receitaOsPersistida(m: MissaoCoberturaInput): number {
  const receita = Number(m.revenue_value) || 0;
  const pedagio = resolveStoredClientToll(m.toll_value || 0, m.toll_value_provider);
  const desloc = Number(m.displacement_value) || 0;
  return roundMoney(receita + pedagio + desloc);
}

export function custoOsPersistido(m: MissaoCoberturaInput): number {
  const mesma = m.is_same_os === true;
  const custo = mesma ? 0 : Number(m.cost_value) || 0;
  const pedagio = resolveStoredProviderToll(m.toll_value || 0, m.toll_value_provider, mesma);
  const desloc = mesma ? 0 : Number(m.displacement_value_provider) || 0;
  return roundMoney(custo + pedagio + desloc);
}

export function margemOperacionalPct(receita: number, lucro: number): number | null {
  const rec = Number(receita) || 0;
  if (rec <= 0) return null;
  return roundMoney((Number(lucro) / rec) * 100);
}

export function missaoNoPeriodoCobertura(endTime: string | null | undefined, start: string, end: string): boolean {
  const d = String(endTime || '').slice(0, 10);
  return d >= start && d <= end;
}

export function montarCoberturaOsPeriodo(args: {
  missions: MissaoCoberturaInput[];
  clients: ClienteComissaoMatch[];
  comerciais: Array<{ id: string; nome?: string | null }>;
  idsVinculados: Set<string>;
  periodStart: string;
  periodEnd: string;
  consultaIncompleta?: boolean;
  error?: string;
}): CoberturaOsPeriodo {
  if (args.error && !(args.missions || []).length) {
    return coberturaVazia('ERRO', args.error, true);
  }

  const nomeComercial = (id?: string | null) => {
    if (!id) return null;
    return args.comerciais.find((c) => c.id === id)?.nome || null;
  };
  const vinculosIncompletos = !!args.consultaIncompleta;

  const itens: OsPeriodoItem[] = [];
  for (const m of args.missions || []) {
    const status = String(m.status || '');
    if (status !== 'Concluída' && status !== 'Faturada') continue;
    if (!missaoNoPeriodoCobertura(m.end_time, args.periodStart, args.periodEnd)) continue;
    const id = String(m.id || '').trim();
    if (!id) continue;
    const match = casarClienteDaFatura(m.client, args.clients);
    const comercialId = String(match.status === 'ok' ? match.client?.responsavel_comercial_id || '' : '').trim() || null;
    const receita = receitaOsPersistida(m);
    const custo = custoOsPersistido(m);
    itens.push({
      id,
      cliente: String(m.client || '—').trim().toUpperCase() || '—',
      comercialId,
      faturada: osEstaFaturada({ invoiceNumber: m.invoice_number, missionId: id, idsVinculados: args.idsVinculados }),
      invoiceNumber: String(m.invoice_number || '').trim() || null,
      receita,
      custo,
      lucro: roundMoney(receita - custo),
      date: String(m.end_time || '').slice(0, 10) || null,
    });
  }

  const map = new Map<string, CoberturaCliente>();
  for (const os of itens) {
    const key = `${os.comercialId || 'sem'}|${normalizeClienteNome(os.cliente)}`;
    const prev = map.get(key) || {
      cliente: os.cliente,
      comercialId: os.comercialId,
      comercialNome: nomeComercial(os.comercialId),
      missoes: 0,
      faturadas: 0,
      semFatura: 0,
      osSemFaturaIds: [] as string[],
      receita: 0,
      custo: 0,
      lucro: 0,
      margemPct: null as number | null,
      estado: 'ENCONTRADO' as EstadoCobertura,
    };
    prev.missoes += 1;
    prev.receita = roundMoney(prev.receita + os.receita);
    prev.custo = roundMoney(prev.custo + os.custo);
    prev.lucro = roundMoney(prev.lucro + os.lucro);
    if (os.faturada) prev.faturadas += 1;
    else if (!vinculosIncompletos) {
      prev.semFatura += 1;
      prev.osSemFaturaIds.push(os.id);
    }
    if (!prev.comercialNome) prev.comercialNome = nomeComercial(os.comercialId);
    map.set(key, prev);
  }

  const porCliente = [...map.values()].map((c) => ({
    ...c,
    margemPct: margemOperacionalPct(c.receita, c.lucro),
    estado: (vinculosIncompletos
      ? 'CONSULTA INCOMPLETA'
      : c.missoes > 0 ? 'ENCONTRADO' : 'NÃO EXISTE') as EstadoCobertura,
  })).sort((a, b) => b.semFatura - a.semFatura || b.receita - a.receita);

  const totais = itens.reduce(
    (acc, os) => ({
      missoes: acc.missoes + 1,
      faturadas: acc.faturadas + (os.faturada ? 1 : 0),
      semFatura: acc.semFatura + (!os.faturada && !vinculosIncompletos ? 1 : 0),
      receita: roundMoney(acc.receita + os.receita),
      custo: roundMoney(acc.custo + os.custo),
      lucro: roundMoney(acc.lucro + os.lucro),
    }),
    { missoes: 0, faturadas: 0, semFatura: 0, receita: 0, custo: 0, lucro: 0 },
  );

  const estado: EstadoCobertura = vinculosIncompletos
    ? 'CONSULTA INCOMPLETA'
    : itens.length === 0
      ? 'NÃO EXISTE'
      : 'ENCONTRADO';

  return {
    estado,
    error: args.error,
    consultaIncompleta: vinculosIncompletos,
    itens,
    porCliente,
    totais,
  };
}

export function coberturaVazia(
  estado: EstadoCobertura = 'CONSULTA INCOMPLETA',
  error?: string,
  consultaIncompleta = true,
): CoberturaOsPeriodo {
  return {
    estado,
    error,
    consultaIncompleta,
    itens: [],
    porCliente: [],
    totais: { missoes: 0, faturadas: 0, semFatura: 0, receita: 0, custo: 0, lucro: 0 },
  };
}

export async function carregarCoberturaOsPeriodo(
  sb: ComissaoDbClient,
  periodStart: string,
  periodEnd: string,
  comerciais: Array<{ id: string; nome?: string | null }>,
): Promise<CoberturaOsPeriodo> {
  const missRes = await fetchAllRows(
    sb,
    'missions',
    'id, client, status, end_time, invoice_number, billing_approved, revenue_value, cost_value, toll_value, toll_value_provider, displacement_value, displacement_value_provider, is_same_os',
    (q) => q
      .in('status', [...STATUS_OS_COBERTURA])
      .gte('end_time', `${periodStart}T00:00:00`)
      .lte('end_time', `${periodEnd}T23:59:59`),
  );
  if (missRes.error) {
    return coberturaVazia('ERRO', missRes.error, true);
  }
  const cliRes = await fetchAllRows(sb, 'clients', 'id, name, trading_name, responsavel_comercial_id');
  const vinculosRes = await fetchAllRows(sb, 'financial_invoice_missions', 'invoice_id, mission_id');
  const consultaIncompleta = Boolean(cliRes.error || vinculosRes.error);
  const idsVinculados = new Set<string>();
  for (const row of vinculosRes.rows || []) {
    const id = String(row.mission_id || '').trim();
    if (id) idsVinculados.add(id);
  }
  return montarCoberturaOsPeriodo({
    missions: missRes.rows || [],
    clients: (cliRes.rows || []) as ClienteComissaoMatch[],
    comerciais,
    idsVinculados,
    periodStart,
    periodEnd,
    consultaIncompleta,
    error: consultaIncompleta ? (cliRes.error || vinculosRes.error) : undefined,
  });
}
