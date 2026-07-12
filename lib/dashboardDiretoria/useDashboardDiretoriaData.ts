import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useRealtimeRefresh } from '../RealtimeProvider';
import type { Client, ClientPriceTable, FinancialCategory, FinancialTransaction, Mission, ProviderCostTable } from '../../types';
import { formatPeriodLabel, getPeriodRange, getRhReferenceMonth, type DashboardPeriod } from './periodUtils';
import type { DashboardDiretoriaData, DashboardRefs } from './types';

async function fetchAllPages<T>(buildQuery: (from: number, size: number) => Promise<{ data: T[] | null; error: any }>, pageSize = 1000): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery(from, pageSize);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export function useDashboardDiretoriaData(period: DashboardPeriod): DashboardDiretoriaData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [allTransactions, setAllTransactions] = useState<FinancialTransaction[]>([]);
  const [accounts, setAccounts] = useState<Array<{ id: string; initial_balance: number }>>([]);
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [quotes, setQuotes] = useState<DashboardDiretoriaData['quotes']>([]);
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
      const rangeStart = `${startIso}T00:00:00`;
      const rangeEnd = `${endIso}T23:59:59`;
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
        empsRes,
        salRes,
        commRes,
        bonRes,
      ] = await Promise.all([
        fetchAllPages((from, size) =>
          supabase.from('missions').select('*').or(rangeOr).order('created_at', { ascending: false }).range(from, from + size - 1)
        ),
        fetchAllPages((from, size) =>
          supabase.from('missions').select('*').or(openOr).order('created_at', { ascending: false }).range(from, from + size - 1)
        ),
        supabase.from('client_price_tables').select('*'),
        supabase.from('provider_cost_tables').select('*'),
        supabase.from('clients').select('*'),
        fetchAllPages((from, size) =>
          supabase.from('financial_transactions').select('*').order('due_date', { ascending: false }).range(from, from + size - 1)
        ),
        supabase.from('financial_categories').select('*'),
        supabase.from('quotes').select('id, client_name, status, total_value, created_at').order('created_at', { ascending: false }).limit(500),
        supabase.from('financial_accounts').select('id, initial_balance, status').eq('status', 'Ativo'),
        supabase.from('rh_employees').select('status').is('deleted_at', null),
        supabase.from('rh_salary_configs').select('base_salary').is('deleted_at', null),
        supabase.from('rh_commissions').select('commission_amount, paid_at').eq('reference_month', monthRef).is('deleted_at', null),
        supabase.from('rh_bonuses').select('amount').eq('reference_month', monthRef).is('deleted_at', null),
      ]);

      const byId = new Map<string, Mission>();
      for (const m of inRangeMissions as Mission[]) byId.set(m.id, m);
      for (const m of openMissions as Mission[]) if (!byId.has(m.id)) byId.set(m.id, m);

      setMissions(Array.from(byId.values()));

      const allTrans = transRes as FinancialTransaction[];
      setAllTransactions(allTrans);
      setTransactions(allTrans.filter(t => {
        const d = String(t.due_date || '').slice(0, 10);
        return d >= startIso && d <= endIso;
      }));
      setCategories((catRes.data || []) as FinancialCategory[]);
      setQuotes((quotesRes.data || []) as DashboardDiretoriaData['quotes']);
      const accs = (accountsRes.data || []).map((a: any) => ({ id: a.id, initial_balance: Number(a.initial_balance || 0) }));
      setAccounts(accs);
      setRefs({
        clientTables: (clientTablesRes.data || []) as ClientPriceTable[],
        providerTables: (providerTablesRes.data || []) as ProviderCostTable[],
        clientsData: (clientsRes.data || []) as Client[],
      });

      const emps = empsRes.data || [];
      const activeEmployees = emps.filter((e: any) => e.status === 'Ativo').length;
      const payrollPreview = (salRes.data || []).reduce((s: number, r: any) => s + Number(r.base_salary || 0), 0);
      const commissionsPending = (commRes.data || [])
        .filter((r: any) => !r.paid_at)
        .reduce((s: number, r: any) => s + Number(r.commission_amount || 0), 0);
      const bonuses = (bonRes.data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      setRhSnapshot({
        totalEmployees: emps.length,
        activeEmployees,
        payrollPreview,
        commissionsPending,
        bonuses,
      });
      setAccountBalance(0);
    } catch (e: any) {
      console.error('[DashboardDiretoria]', e);
      setError(e?.message || 'Falha ao carregar dados do cockpit.');
    } finally {
      setLoading(false);
    }
  }, [period.mode, period.year, period.month]);

  useEffect(() => { void load(); }, [load]);

  useRealtimeRefresh(
    ['missions', 'financial_transactions', 'financial_categories', 'quotes', 'rh_employees', 'rh_commissions', 'rh_salary_configs'],
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
    refs,
    accounts,
    accountBalance,
    rhSnapshot,
    refresh: load,
  };
}
