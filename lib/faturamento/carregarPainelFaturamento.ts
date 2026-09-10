/**
 * Carga integral do painel de faturamento.
 * Paginação com contagem — consulta parcial não vira “tudo faturado”.
 */
import { formatIsoDateBR } from '../dateUtils.js';
import { fetchAllPages, SupabasePagingIntegrityError } from '../supabasePaging.js';
import { FATURAMENTO_PAINEL_INICIO } from './cicloFaturamento.js';
import {
  montarPainelFaturamento,
  painelVazio,
  type ClientePainel,
  type FaturaPainel,
  type MissaoPainel,
  type PainelFaturamento,
  type ReceberPainel,
  type VinculoPainel,
} from './painelFaturamento.js';

export type FaturamentoDbClient = {
  from: (table: string) => any;
};

const PAGE = 1000;
const MAX = 50_000;

async function loadAll<T extends { id?: string | number | null }>(
  sb: FaturamentoDbClient,
  table: string,
  columns: string,
  configure?: (q: any) => any,
): Promise<{ rows: T[]; complete: boolean; error?: string }> {
  try {
    const result = await fetchAllPages<T>(
      async (from, size) => {
        let q = sb.from(table).select(columns, { count: 'exact' });
        if (configure) q = configure(q);
        q = q.range(from, from + size - 1);
        const { data, error, count } = await q;
        return { data: data as T[] | null, error, count };
      },
      PAGE,
      MAX,
      { getRowKey: (row) => String((row as { id?: unknown }).id ?? JSON.stringify(row)) },
    );
    if (result.truncated) {
      return { rows: result.rows, complete: false, error: `CONSULTA INCOMPLETA em ${table}` };
    }
    return { rows: result.rows, complete: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (e instanceof SupabasePagingIntegrityError) {
      return { rows: [], complete: false, error: message };
    }
    return { rows: [], complete: false, error: message };
  }
}

export async function carregarPainelFaturamento(
  sb: FaturamentoDbClient,
  todayIso = formatIsoDateBR(),
): Promise<PainelFaturamento> {
  const today = String(todayIso || formatIsoDateBR()).slice(0, 10);
  const lookbackStart = FATURAMENTO_PAINEL_INICIO;
  const lookbackTs = `${lookbackStart}T00:00:00`;

  const [cliRes, missRes, invRes, vincRes, rxRes] = await Promise.all([
    loadAll<ClientePainel>(sb, 'clients', 'id, name, trading_name, status, ciclo_faturamento'),
    loadAll<MissaoPainel>(
      sb,
      'missions',
      'id, client, status, start_time, billing_period_override, billing_approved, invoice_number, exclude_from_billing, revenue_value',
      (q) =>
        q
          .neq('status', 'Recusada')
          .or(
            [
              `and(start_time.gte.${lookbackTs},start_time.lte.${today}T23:59:59)`,
              `and(billing_period_override.gte.${lookbackTs},billing_period_override.lte.${today}T23:59:59)`,
            ].join(','),
          ),
    ),
    loadAll<FaturaPainel>(
      sb,
      'financial_invoices',
      'id, client, number, amount, date, status, boleto_due_date, notes, period_start, period_end',
      (q) => q.gte('date', lookbackStart),
    ),
    loadAll<VinculoPainel & { id?: string }>(sb, 'financial_invoice_missions', 'id, invoice_id, mission_id'),
    loadAll<ReceberPainel & { id?: string }>(
      sb,
      'financial_transactions',
      'id, description, notes, status, due_date, payment_date, amount, entity_name, type',
      (q) => q.eq('type', 'INCOME'),
    ),
  ]);

  const errors = [cliRes, missRes, invRes, vincRes, rxRes]
    .map((r) => r.error)
    .filter(Boolean) as string[];
  const complete = [cliRes, missRes, invRes, vincRes, rxRes].every((r) => r.complete);
  if (!cliRes.rows.length && cliRes.error) {
    return painelVazio('ERRO', cliRes.error, today);
  }

  let invoices = invRes.rows;
  if (invRes.error) {
    const retry = await loadAll<FaturaPainel>(
      sb,
      'financial_invoices',
      'id, client, number, amount, date, status, boleto_due_date, notes',
      (q) => q.gte('date', lookbackStart),
    );
    invoices = retry.rows;
    if (retry.error) errors.push(retry.error);
    else errors.push(invRes.error);
  }

  let missions = missRes.rows;
  if (missRes.error && /ciclo_faturamento|billing_period_override|exclude_from_billing|does not exist/i.test(missRes.error)) {
    const retry = await loadAll<MissaoPainel>(
      sb,
      'missions',
      'id, client, status, start_time, billing_approved, invoice_number, revenue_value',
      (q) => q.neq('status', 'Recusada').gte('start_time', lookbackTs),
    );
    missions = retry.rows;
    if (retry.error) errors.push(retry.error);
  }

  let clients = cliRes.rows;
  if (cliRes.error && /ciclo_faturamento/i.test(cliRes.error)) {
    const retry = await loadAll<ClientePainel>(sb, 'clients', 'id, name, trading_name, status');
    clients = retry.rows;
    if (retry.error) errors.push(retry.error);
  }

  return montarPainelFaturamento({
    todayIso: today,
    lookbackStart,
    clients,
    missions,
    invoices,
    vinculos: vincRes.rows,
    receber: rxRes.rows,
    consultaIncompleta: !complete || errors.length > 0,
    error: errors[0],
  });
}
