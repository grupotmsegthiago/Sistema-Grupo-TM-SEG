import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useRealtimeRefresh } from '../RealtimeProvider';
import { listBalanceSnapshots } from '../investment/snapshotClient';
import { fetchAllPages } from '../supabasePaging';
import { fetchEmployeeCostSummary } from '../rh/fetchEmployeeCostSummary';
import type { Client, ClientPriceTable, FinancialCategory, FinancialTransaction, Mission, ProviderCostTable } from '../../types';
import {
  formatPeriodLabel,
  getCashMovementDate,
  getPeriodRange,
  getRevenueCompareFetchRange,
  getRhReferenceMonth,
} from './periodUtils';
import type { DashboardDiretoriaData, DashboardPeriod, DashboardRefs } from './types';
import { checkAndExpireQuotations } from '../precificacao/expirarCotacoes';
import { cotacaoVencida } from '../precificacao/tabela2027';

/** Extrai o saldo mais recente por conta a partir da lista de snapshots. */
function latestBalanceByAccount(
  snapshots: Array<{ account_id: string; balance: number; recorded_at: string }>,
): Record<string, number> {
  const latest: Record<string, { balance: number; at: number }> = {};
  for (const s of snapshots) {
    const id = String(s.account_id || '');
    if (!id) continue;
    const at = new Date(s.recorded_at).getTime();
    if (!Number.isFinite(at)) continue;
    const prev = latest[id];
    if (!prev || at >= prev.at) {
      latest[id] = { balance: Number(s.balance) || 0, at };
    }
  }
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(latest)) out[id] = v.balance;
  return out;
}

async function fetchAllPagesLegacy<T>(buildQuery: (from: number, size: number) => Promise<{ data: T[] | null; error: any }>, pageSize = 1000): Promise<T[]> {
  const { rows } = await fetchAllPages(buildQuery, pageSize);
  return rows;
}

export function useDashboardDiretoriaData(period: DashboardPeriod): DashboardDiretoriaData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRecalc] = useState<DashboardDiretoriaData['lastRecalc']>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [allTransactions, setAllTransactions] = useState<FinancialTransaction[]>([]);
  const [accounts, setAccounts] = useState<DashboardDiretoriaData['accounts']>([]);
  const [latestAccountBalances, setLatestAccountBalances] = useState<Record<string, number>>({});
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [quotes, setQuotes] = useState<DashboardDiretoriaData['quotes']>([]);
  const [quotesTruncated, setQuotesTruncated] = useState(false);
  const [accountBalance, setAccountBalance] = useState(0);
  const [rhSnapshot, setRhSnapshot] = useState<DashboardDiretoriaData['rhSnapshot']>({
    totalEmployees: 0,
    activeEmployees: 0,
    payrollPreview: 0,
    commissionsPending: 0,
    bonuses: 0,
  });
  const [refs, setRefs] = useState<DashboardRefs>({
    clientTables: [],
    providerTables: [],
    clientsData: [],
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { startIso, endIso } = getPeriodRange(period);
      // Inclui meses de junho → âncora no comparativo de faturamento diário (multi-série).
      // KPIs de período continuam filtrando via getPeriodRange / filterMissionsByPeriod.
      const compareFetch = getRevenueCompareFetchRange(period);
      const fetchStartIso = compareFetch.startIso < startIso ? compareFetch.startIso : startIso;
      const fetchEndIso = compareFetch.endIso > endIso ? compareFetch.endIso : endIso;
      const rangeStart = `${fetchStartIso}T00:00:00`;
      const rangeEnd = `${fetchEndIso}T23:59:59`;
      const rangeOr = `and(start_time.gte.${rangeStart},start_time.lte.${rangeEnd}),and(start_time.is.null,created_at.gte.${rangeStart},created_at.lte.${rangeEnd})`;
      const openOr = 'status.in.("Pendente","Solicitada","Documentação","Agendada","Origem","Em Viagem"),and(status.eq."Concluída",billing_approved.not.is.true)';

      const monthRef = getRhReferenceMonth(period);

      const [
        inRangeMissions,
        openMissions,
        clientTablesRes,
        providerTablesRes,
        clientsRes,
        transRes,
        catRes,
        quotesRes,
        accountsRes,
        snapshotsRes,
        empsRes,
        costSummaryRes,
      ] = await Promise.all([
        fetchAllPagesLegacy((from, size) =>
          supabase.from('missions').select('*').or(rangeOr).order('created_at', { ascending: false }).range(from, from + size - 1)
        ),
        fetchAllPagesLegacy((from, size) =>
          supabase.from('missions').select('*').or(openOr).order('created_at', { ascending: false }).range(from, from + size - 1)
        ),
        supabase.from('client_price_tables').select('*'),
        supabase.from('provider_cost_tables').select('*'),
        supabase.from('clients').select('*'),
        fetchAllPagesLegacy((from, size) =>
          supabase.from('financial_transactions').select('*').order('due_date', { ascending: false }).range(from, from + size - 1)
        ),
        supabase.from('financial_categories').select('*'),
        fetchAllPages((from, size) =>
          supabase.from('quotes').select('id, client_name, status, total_value, created_at').order('created_at', { ascending: false }).range(from, from + size - 1),
          500,
          10_000,
        ).then((r) => ({ data: r.rows, truncated: r.truncated, error: null })),
        supabase.from('financial_accounts').select('id, name, bank_name, initial_balance, status').eq('status', 'Ativo'),
        listBalanceSnapshots(3650).catch((e) => {
          console.warn('[DashboardDiretoria] snapshots de saldo indisponíveis:', e);
          return [] as Awaited<ReturnType<typeof listBalanceSnapshots>>;
        }),
        supabase.from('rh_employees').select('status').is('deleted_at', null),
        fetchEmployeeCostSummary(monthRef),
      ]);

      const byId = new Map<string, Mission>();
      for (const m of inRangeMissions as Mission[]) byId.set(m.id, m);
      for (const m of openMissions as Mission[]) if (!byId.has(m.id)) byId.set(m.id, m);

      setMissions(Array.from(byId.values()));

      const allTrans = transRes as FinancialTransaction[];
      setAllTransactions(allTrans);
      setTransactions(allTrans.filter(t => {
        const d = getCashMovementDate(t);
        return d >= startIso && d <= endIso;
      }));
      setCategories((catRes.data || []) as FinancialCategory[]);
      try {
        await checkAndExpireQuotations(supabase as never);
      } catch (erroExpiracao) {
        console.warn('[DashboardDiretoria] expiração de cotação:', erroExpiracao);
      }
      const agoraCotacao = new Date();
      setQuotes(((quotesRes.data || []) as DashboardDiretoriaData['quotes']).map((cotacao) => (
        cotacaoVencida(cotacao, agoraCotacao) ? { ...cotacao, status: 'expirada' } : cotacao
      )));
      setQuotesTruncated(!!quotesRes.truncated);
      const accs = (accountsRes.data || []).map((a: any) => ({
        id: String(a.id),
        name: String(a.name || ''),
        bank_name: String(a.bank_name || ''),
        initial_balance: Number(a.initial_balance || 0),
      }));
      setAccounts(accs);
      setLatestAccountBalances(latestBalanceByAccount(snapshotsRes || []));
      setRefs({
        clientTables: (clientTablesRes.data || []) as ClientPriceTable[],
        providerTables: (providerTablesRes.data || []) as ProviderCostTable[],
        clientsData: (clientsRes.data || []) as Client[],
      });

      const emps = empsRes.data || [];
      // Mesma fonte de RH → Funcionários (custo total da equipe / variáveis do mês).
      const cost = costSummaryRes;
      setRhSnapshot({
        totalEmployees: emps.length,
        activeEmployees: cost.items.length,
        payrollPreview: Number(cost.totals?.companyCost || 0),
        commissionsPending: Number(cost.totals?.commissions || 0),
        bonuses: Number(cost.totals?.bonuses || 0) + Number(cost.totals?.awards || 0),
      });
      setAccountBalance(0);
    } catch (e: any) {
      console.error('[DashboardDiretoria]', e);
      setError(e?.message || 'Falha ao carregar dados do cockpit.');
    } finally {
      setLoading(false);
    }
  }, [period.mode, period.year, period.month]);

  /** Atualizar só relê o banco. Não grava OS, hora extra nem recálculo. */
  const refresh = useCallback(async () => {
    setError(null);
    await load();
  }, [load]);

  useEffect(() => { void load(); }, [load]);

  useRealtimeRefresh(
    ['missions', 'financial_transactions', 'financial_categories', 'quotes', 'rh_employees', 'rh_commissions', 'rh_salary_configs', 'rh_awards', 'rh_bonuses', 'financial_accounts'],
    () => { void load(); },
  );

  return {
    loading,
    error,
    period,
    periodLabel: formatPeriodLabel(period),
    missions,
    transactions,
    allTransactions,
    categories,
    quotes,
    quotesTruncated,
    refs,
    accounts,
    latestAccountBalances,
    accountBalance,
    rhSnapshot,
    lastRecalc,
    refresh,
  };
}
