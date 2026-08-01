import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, ComposedChart, Area,
} from 'recharts';
import {
  Crown, RefreshCw, Loader2, AlertTriangle, Wallet, Users,
  Target, CheckCircle2, ChevronRight, Building2, DollarSign,
  ArrowUpCircle, ArrowDownCircle,   BarChart3,
} from 'lucide-react';
import DiretoriaSistemaTab from './DiretoriaSistemaTab';
import { useDashboardDiretoriaData } from '../../lib/dashboardDiretoria/useDashboardDiretoriaData';
import {
  buildArApByMonth,
  buildCashTitleBreakdown,
  buildClientRevenueCostBars,
  buildCriticalAlerts,
  buildDailyCashFlow,
  buildDailyRevenueMonthComparison,
  buildExpenseDonut,
  buildMarginVsGoalSeries,
  buildMissionStatusCounts,
  buildOpenCashOutlook,
  buildProvisionHorizon,
  buildParentMissionsSummary,
  buildPendingApprovals,
  buildQuotesFunnel,
  buildTopClientsByRevenue,
  computeAccountBalanceOverview,
  computeCashKpis,
  computeOperationalKpis,
  fmtBRL,
  fmtShort,
} from '../../lib/dashboardDiretoria/aggregations';
import {
  buildYearOptions,
  createDefaultPeriod,
  formatPeriodRangeHint,
  getPeriodRange,
  isCurrentCalendarMonth,
} from '../../lib/dashboardDiretoria/periodUtils';
import type { CashTitleRow, DashboardPeriod, DashboardPeriodMode, DiretoriaTab } from '../../lib/dashboardDiretoria/types';
import {
  MARGIN_GOAL_PCT,
  REVENUE_MONTH_COLOR_CURRENT,
  REVENUE_MONTH_COLOR_OTHER,
  REVENUE_MONTH_COLOR_PREVIOUS,
} from '../../lib/dashboardDiretoria/types';

const CHART_COLORS = ['#dc2626', '#16a34a', '#2563eb', '#d97706', '#7c3aed', '#0891b2'];
const GRID_STROKE = '#e5e7eb';
const AXIS_TICK = { fontSize: 10, fontWeight: 700 as const, fill: '#6b7280' };
const COLOR_INCOME = '#16a34a';
const COLOR_EXPENSE = '#dc2626';

const TABS: { id: DiretoriaTab; label: string }[] = [
  { id: 'geral', label: 'Visão Geral' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'operacao', label: 'Operação' },
  { id: 'clientes', label: 'Clientes & Fornecedores' },
  { id: 'rh', label: 'RH & Comissões' },
  { id: 'sistema', label: 'Sistema' },
];

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const FinTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const compareLabel = payload[0]?.payload?.labelCompare;
  const rows = [...payload]
    .filter((p: any) => p.value != null && !Number.isNaN(p.value))
    .sort((a: any, b: any) => {
      const rank = (color: string) => {
        if (color === REVENUE_MONTH_COLOR_CURRENT) return 0;
        if (color === REVENUE_MONTH_COLOR_PREVIOUS) return 1;
        return 2;
      };
      return rank(a.color) - rank(b.color);
    });
  return (
    <div className="bg-white border border-gray-200 text-gray-800 px-3 py-2 rounded-lg shadow-lg text-xs max-h-64 overflow-y-auto">
      <p className="font-bold mb-1 text-gray-500">{compareLabel || label}</p>
      {rows.map((p: any, i: number) => (
        <p
          key={i}
          style={{ color: p.color === REVENUE_MONTH_COLOR_OTHER ? '#9ca3af' : p.color }}
          className="font-mono font-bold"
        >
          {p.name}: {typeof p.value === 'number' && Math.abs(p.value) > 50 ? fmtBRL(p.value) : p.value}
        </p>
      ))}
    </div>
  );
};

const Card: React.FC<{ title: string; subtitle?: string; className?: string; children: React.ReactNode; testId?: string }> = ({
  title, subtitle, className = '', children, testId,
}) => (
  <div data-testid={testId} className={`bg-white border border-gray-200 rounded-xl p-4 shadow-sm ${className}`}>
    <div className="mb-3">
      <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide">{title}</h3>
      {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
    {children}
  </div>
);

const KpiTile: React.FC<{ label: string; value: string; sub?: string; accent?: string; icon?: React.ReactNode; compact?: boolean }> = ({
  label, value, sub, accent = 'text-gray-900', icon, compact = false,
}) => (
  <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
    <div className="flex justify-between items-start gap-2">
      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-black">{label}</p>
      {icon}
    </div>
    <p className={`${compact ? 'text-sm' : 'text-lg'} font-black font-mono mt-1 leading-tight ${accent}`}>{value}</p>
    {sub && <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>}
  </div>
);

function formatCashDate(iso: string): string {
  const d = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d || '—';
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

const CashTitleList: React.FC<{
  title: string;
  subtitle: string;
  rows: CashTitleRow[];
  totalCount: number;
  /** Soma de todos os títulos do grupo (não só os exibidos na lista). */
  totalAmount?: number;
  tone: 'green' | 'red';
  dateLabel: string;
}> = ({ title, subtitle, rows, totalCount, totalAmount, tone, dateLabel }) => {
  const amountClass = tone === 'green' ? 'text-green-700' : 'text-red-700';
  const badgeClass = tone === 'green' ? 'bg-green-50 text-green-800 border-green-100' : 'bg-red-50 text-red-800 border-red-100';
  const showTotal = typeof totalAmount === 'number' && Number.isFinite(totalAmount);
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm" data-testid={`cash-titles-${tone}-${dateLabel}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-black">{title}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>
          {showTotal && (
            <p className={`text-sm font-black font-mono mt-1.5 ${amountClass}`} data-testid="cash-titles-total">
              {fmtBRL(totalAmount)}
            </p>
          )}
        </div>
        <span className={`text-[10px] font-bold border rounded-md px-2 py-0.5 shrink-0 ${badgeClass}`}>
          {totalCount} título{totalCount === 1 ? '' : 's'}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">Nenhum título neste grupo.</p>
      ) : (
        <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
          {rows.map((row) => (
            <li key={row.id} className="py-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-900 truncate">{row.description}</p>
                <p className="text-[10px] text-gray-500 mt-0.5 truncate">
                  {dateLabel} {formatCashDate(row.date)}
                  {row.entity ? ` · ${row.entity}` : ''}
                  {row.category ? ` · ${row.category}` : ''}
                </p>
              </div>
              <p className={`text-xs font-black font-mono shrink-0 ${amountClass}`}>{fmtBRL(row.amount)}</p>
            </li>
          ))}
        </ul>
      )}
      {totalCount > rows.length && (
        <p className="text-[10px] text-gray-400 mt-2">Mostrando os {rows.length} maiores de {totalCount}.</p>
      )}
    </div>
  );
};

interface Props {
  onNavigate?: (screenId: string) => void;
}

const PERIOD_MODES: { id: DashboardPeriodMode; label: string }[] = [
  { id: 'today', label: 'Hoje' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mês' },
];

const DashboardDiretoria: React.FC<Props> = ({ onNavigate }) => {
  const now = new Date();
  const [tab, setTab] = useState<DiretoriaTab>('geral');
  /** Abre sempre no mês civil vigente (Brasília). */
  const [period, setPeriod] = useState<DashboardPeriod>(() => createDefaultPeriod(now));
  /**
   * Enquanto true, acompanha a virada do mês (ex.: jul → ago) sem o usuário
   * precisar trocar o filtro. Desliga se o usuário escolher outro mês/ano.
   */
  const [followCurrentMonth, setFollowCurrentMonth] = useState(true);

  useEffect(() => {
    if (!followCurrentMonth) return;
    const sync = () => {
      const cur = createDefaultPeriod();
      setPeriod((p) => {
        if (p.year === cur.year && p.month === cur.month) return p;
        return { ...p, year: cur.year, month: cur.month };
      });
    };
    sync();
    const id = window.setInterval(sync, 60_000);
    const onFocus = () => sync();
    const onVis = () => {
      if (document.visibilityState === 'visible') sync();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [followCurrentMonth]);

  const data = useDashboardDiretoriaData(period);

  const operational = useMemo(
    () => computeOperationalKpis(data.missions, data.refs, period),
    [data.missions, data.refs, period],
  );

  const cash = useMemo(
    () => computeCashKpis(data.transactions, data.allTransactions, data.categories, data.accounts, period),
    [data.transactions, data.allTransactions, data.categories, data.accounts, period],
  );

  const accountBalances = useMemo(
    () => computeAccountBalanceOverview(data.accounts, data.latestAccountBalances),
    [data.accounts, data.latestAccountBalances],
  );

  const periodRangeHint = useMemo(() => formatPeriodRangeHint(period), [period]);

  const totalIncomeInPeriod = useMemo(
    () => Math.round((cash.incomePaid + cash.pendingReceivable) * 100) / 100,
    [cash.incomePaid, cash.pendingReceivable],
  );
  const totalExpenseInPeriod = useMemo(
    () => Math.round((cash.expensePaid + cash.pendingPayable) * 100) / 100,
    [cash.expensePaid, cash.pendingPayable],
  );

  const cashTitles = useMemo(
    () => buildCashTitleBreakdown(data.allTransactions, data.categories, period),
    [data.allTransactions, data.categories, period],
  );

  /** A receber/pagar em aberto — sem teto de prazo (60/90 dias etc.). */
  const openCash = useMemo(
    () => buildOpenCashOutlook(data.allTransactions, data.categories),
    [data.allTransactions, data.categories],
  );

  /** Horizonte: última data da receita em aberto × dívidas até essa data. */
  const provisionHorizon = useMemo(
    () => buildProvisionHorizon(data.allTransactions, data.categories),
    [data.allTransactions, data.categories],
  );

  const formatHorizonDate = (iso: string | null): string => {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  };

  const cashFlow = useMemo(() => buildDailyCashFlow(data.allTransactions, period, undefined, data.categories), [data.allTransactions, data.categories, period]);
  const marginSeries = useMemo(() => buildMarginVsGoalSeries(data.missions, data.refs, period), [data.missions, data.refs, period]);
  const revenueMonthCompare = useMemo(
    () => buildDailyRevenueMonthComparison(data.missions, data.refs, period),
    [data.missions, data.refs, period],
  );
  const topPayers = useMemo(() => buildTopClientsByRevenue(data.missions, data.refs, period), [data.missions, data.refs, period]);
  const clientBars = useMemo(() => buildClientRevenueCostBars(data.missions, data.refs, period), [data.missions, data.refs, period]);
  const funnel = useMemo(() => buildQuotesFunnel(data.quotes), [data.quotes]);
  /** Escopo Operação: período selecionado + OS abertas (exclui mês anterior só usado no comparativo). */
  const missionsForOperacao = useMemo(() => {
    const { startIso, endIso } = getPeriodRange(period);
    const openStatuses = new Set(['Pendente', 'Solicitada', 'Documentação', 'Agendada', 'Origem', 'Em Viagem']);
    return data.missions.filter((m: any) => {
      const ref = String(m.start_time || m.startTime || m.created_at || m.createdAt || '').slice(0, 10);
      if (ref >= startIso && ref <= endIso) return true;
      const st = String(m.status || '');
      if (openStatuses.has(st)) return true;
      if (st === 'Concluída' && !m.billing_approved) return true;
      return false;
    });
  }, [data.missions, period]);
  const statusCounts = useMemo(() => buildMissionStatusCounts(missionsForOperacao), [missionsForOperacao]);
  const parentSummary = useMemo(() => buildParentMissionsSummary(missionsForOperacao), [missionsForOperacao]);
  const arAp = useMemo(() => buildArApByMonth(data.allTransactions, data.categories), [data.allTransactions, data.categories]);
  const expenseDonut = useMemo(() => buildExpenseDonut(data.transactions, data.categories), [data.transactions, data.categories]);
  const pendingApprovals = useMemo(() => buildPendingApprovals(data.missions, data.refs), [data.missions, data.refs]);
  const openQuotes = useMemo(() => data.quotes.filter(q => q.status !== 'Aprovada').length, [data.quotes]);

  const alerts = useMemo(
    () => buildCriticalAlerts({
      operational,
      cash,
      pendingApprovals,
      missions: data.missions,
      refs: data.refs,
      openQuotes,
    }),
    [operational, cash, pendingApprovals, data.missions, data.refs, openQuotes],
  );

  const goTo = useCallback((screen?: string) => {
    if (screen && onNavigate) onNavigate(screen);
  }, [onNavigate]);

  if (data.loading && data.missions.length === 0) {
    return (
      <div className="flex items-center gap-3 p-8 text-gray-500" data-testid="dashboard-diretoria-loading">
        <Loader2 className="animate-spin text-red-700" /> Carregando cockpit da diretoria…
      </div>
    );
  }

  if (data.error && data.missions.length === 0) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-800" data-testid="dashboard-diretoria-error">
        <p className="font-bold flex items-center gap-2"><AlertTriangle size={18} /> {data.error}</p>
        <button type="button" onClick={() => { void data.refresh(); }} className="mt-3 text-sm font-bold text-red-700 underline">Tentar novamente</button>
      </div>
    );
  }

  const operationalKpiRow = (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KpiTile label="Receita OS" value={fmtBRL(operational.grossRevenue)} sub="Faturamento canônico" accent="text-green-600" icon={<ArrowUpCircle size={16} className="text-green-500" />} />
      <KpiTile label="Margem OS" value={`${operational.grossMarginPct.toFixed(1)}%`} sub={`Meta ${MARGIN_GOAL_PCT}%`} accent="text-gray-900" />
      <KpiTile label="Custos OS" value={fmtBRL(operational.variableCost)} accent="text-red-600" icon={<ArrowDownCircle size={16} className="text-red-500" />} />
      <KpiTile label="Lucro Operacional" value={fmtBRL(operational.grossProfit)} accent={operational.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'} />
    </div>
  );

  /**
   * Três cards de liquidez:
   * 1) o que ainda deve · 2) quanto tem nas contas operacionais (sem XP/investimento) · 3) o que ainda vai entrar.
   */
  const liquidezResumoSection = (
    <div className="space-y-2" data-testid="liquidez-resumo-diretoria">
      <p className="text-[11px] text-gray-500">
        Dívidas e receita em aberto sem teto de prazo (inclui 60/90 dias). Total nas contas = só operacionais (exclui XP / investimentos).
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3" data-testid="account-balances-diretoria">
        <KpiTile
          label="Dívidas em Aberto"
          value={fmtBRL(openCash.payableTotal)}
          sub={`${openCash.payableCount} título(s)${openCash.overduePayable > 0 ? ` · vencido ${fmtBRL(openCash.overduePayable)}` : ''}`}
          accent="text-red-700"
          icon={<ArrowDownCircle size={16} className="text-red-500" />}
        />
        <KpiTile
          label="Total nas contas"
          value={fmtBRL(accountBalances.operationalTotal)}
          sub={`${accountBalances.operationalCount} conta(s) · sem XP / investimentos`}
          accent="text-blue-700"
          icon={<Wallet size={16} className="text-blue-500" />}
        />
        <KpiTile
          label="Receita em Aberto"
          value={fmtBRL(openCash.receivableTotal)}
          sub={`${openCash.receivableCount} título(s)${openCash.overdueReceivable > 0 ? ` · vencido ${fmtBRL(openCash.overdueReceivable)}` : ''}`}
          accent="text-green-700"
          icon={<ArrowUpCircle size={16} className="text-green-500" />}
        />
      </div>
    </div>
  );

  /** Horizonte alinhado — abaixo de Operação (OS) e acima do Faturamento diário. */
  const provisionHorizonSection = provisionHorizon.lastReceivableDate ? (
    <div
      className="bg-slate-900 text-white rounded-xl p-4 shadow-sm border border-slate-700"
      data-testid="provision-horizon-diretoria"
    >
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
        Provisionamento alinhado
      </p>
      <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
        Última receita em aberto vence em{' '}
        <span className="font-bold text-white">{formatHorizonDate(provisionHorizon.lastReceivableDate)}</span>
        . Até essa data, o sistema confronta o que ainda entra com o que ainda sai (contas a pagar).
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
        <div className="rounded-lg bg-white/5 border border-white/10 p-3">
          <p className="text-[10px] uppercase tracking-wider text-emerald-300/80 font-black">Receita provisionada</p>
          <p className="text-lg font-black font-mono text-emerald-300 mt-1">{fmtBRL(provisionHorizon.receivableTotal)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {provisionHorizon.receivableCount} título(s) até {formatHorizonDate(provisionHorizon.lastReceivableDate)}
          </p>
        </div>
        <div className="rounded-lg bg-white/5 border border-white/10 p-3">
          <p className="text-[10px] uppercase tracking-wider text-rose-300/80 font-black">Dívidas no mesmo horizonte</p>
          <p className="text-lg font-black font-mono text-rose-300 mt-1">{fmtBRL(provisionHorizon.payableInHorizon)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {provisionHorizon.payableInHorizonCount} a pagar com venc. até {formatHorizonDate(provisionHorizon.lastReceivableDate)}
          </p>
        </div>
        <div className="rounded-lg bg-white/5 border border-white/10 p-3">
          <p className="text-[10px] uppercase tracking-wider text-sky-300/80 font-black">Saldo do provisionamento</p>
          <p className={`text-lg font-black font-mono mt-1 ${provisionHorizon.netInHorizon >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
            {fmtBRL(provisionHorizon.netInHorizon)}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Receita provisionada − dívidas no horizonte</p>
        </div>
      </div>
      {provisionHorizon.payableBeyondCount > 0 && (
        <p className="text-[10px] text-slate-400 mt-3">
          Fora deste horizonte ainda há {provisionHorizon.payableBeyondCount} dívida(s) a pagar (
          {fmtBRL(provisionHorizon.payableBeyondHorizon)}) com vencimento depois de{' '}
          {formatHorizonDate(provisionHorizon.lastReceivableDate)}.
        </p>
      )}
    </div>
  ) : null;

  const cashKpiRow = (
    <div className="space-y-3" data-testid="cash-summary-diretoria">
      {periodRangeHint && (
        <p className="text-[10px] text-gray-500 font-medium">{periodRangeHint}</p>
      )}

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-700 leading-relaxed">
        <p className="font-black uppercase tracking-wide text-slate-500 text-[10px] mb-1">Como ler o caixa</p>
        <p>
          <span className="font-bold">Realizado</span> = dinheiro que já entrou/saiu (data do pagamento).{' '}
          <span className="font-bold">Pendente</span> = títulos ainda em aberto com vencimento no período.{' '}
          Os totais somam os dois. A <span className="font-bold">previsão</span> olha só o pendente.
        </p>
        <p className="mt-1.5">
          <span className="font-bold">Transferência entre contas da empresa</span> (TM SEG ↔ TM Security ↔ TM Gestão / XP / Asaas interno){' '}
          <span className="font-bold">não conta</span> como entrada nem como saída — só mudou de conta.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <KpiTile label="Já entrou" value={fmtBRL(cash.incomePaid)} sub="Pago no período" accent="text-green-600" icon={<ArrowUpCircle size={16} className="text-green-500" />} compact />
        <KpiTile label="Já saiu" value={fmtBRL(cash.expensePaid)} sub="Pago no período" accent="text-red-600" icon={<ArrowDownCircle size={16} className="text-red-500" />} compact />
        <KpiTile label="Falta entrar" value={fmtBRL(cash.pendingReceivable)} sub="A receber (venc. no período)" accent="text-green-600" compact />
        <KpiTile label="Falta pagar" value={fmtBRL(cash.pendingPayable)} sub="A pagar (venc. no período)" accent="text-red-600" compact />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-black">Resultado realizado</p>
          <p className="text-[11px] text-gray-500 mt-0.5">Já entrou − já saiu</p>
          <p className={`text-xl font-black font-mono mt-1 ${cash.cashResult >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {fmtBRL(cash.cashResult)}
          </p>
          <p className="text-[10px] text-gray-400 mt-1 font-mono">
            {fmtBRL(cash.incomePaid)} − {fmtBRL(cash.expensePaid)}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-black">Previsão do pendente</p>
          <p className="text-[11px] text-gray-500 mt-0.5">Falta entrar − falta pagar</p>
          <p className={`text-xl font-black font-mono mt-1 ${cash.cashForecast >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {fmtBRL(cash.cashForecast)}
          </p>
          <p className="text-[10px] text-gray-400 mt-1 font-mono">
            {fmtBRL(cash.pendingReceivable)} − {fmtBRL(cash.pendingPayable)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-green-50 border border-green-100 rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-wider text-green-700 font-black">Total entradas no período</p>
          <p className="text-sm font-black font-mono text-green-800 mt-1">{fmtBRL(totalIncomeInPeriod)}</p>
          <p className="text-[10px] text-green-700 mt-0.5">Já entrou + falta entrar</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-wider text-red-700 font-black">Total saídas no período</p>
          <p className="text-sm font-black font-mono text-red-800 mt-1">{fmtBRL(totalExpenseInPeriod)}</p>
          <p className="text-[10px] text-red-700 mt-0.5">Já saiu + falta pagar</p>
        </div>
      </div>

      <div className="space-y-2" data-testid="cash-title-breakdown">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Maiores títulos do período</p>
          <button
            type="button"
            onClick={() => goTo('fin-transactions')}
            className="text-[11px] text-red-700 hover:text-red-800 font-bold flex items-center gap-1"
          >
            Abrir lançamentos <ChevronRight size={12} />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <CashTitleList
            title="Maiores entradas já recebidas"
            subtitle="Pagamentos confirmados no período"
            rows={cashTitles.paidIncome}
            totalCount={cashTitles.paidIncomeCount}
            totalAmount={cashTitles.paidIncomeTotal}
            tone="green"
            dateLabel="Pago"
          />
          <CashTitleList
            title="Maiores saídas já pagas"
            subtitle="Pagamentos confirmados no período"
            rows={cashTitles.paidExpense}
            totalCount={cashTitles.paidExpenseCount}
            totalAmount={cashTitles.paidExpenseTotal}
            tone="red"
            dateLabel="Pago"
          />
          <CashTitleList
            title="Maiores a receber"
            subtitle="Em aberto com vencimento no período"
            rows={cashTitles.pendingReceivable}
            totalCount={cashTitles.pendingReceivableCount}
            totalAmount={cashTitles.pendingReceivableTotal}
            tone="green"
            dateLabel="Venc."
          />
          <CashTitleList
            title="Maiores a pagar"
            subtitle="Em aberto com vencimento no período"
            rows={cashTitles.pendingPayable}
            totalCount={cashTitles.pendingPayableCount}
            totalAmount={cashTitles.pendingPayableTotal}
            tone="red"
            dateLabel="Venc."
          />
        </div>
      </div>
    </div>
  );

  /** Detalhe do que ainda vai entrar/sair — abaixo do Caixa do período. */
  const openCashOutlookSection = (
    <div className="space-y-3" data-testid="open-cash-outlook-diretoria">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm" data-testid="open-receivable-by-client">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-black">Receita em aberto por cliente</p>
          <p className="text-[11px] text-gray-500 mt-0.5 mb-2">
            Quem concentra o que ainda vai entrar. Se o título veio como &quot;Outros&quot;, o sistema tenta ler o cliente na descrição (ex.: DHL, CEVA).
          </p>
          {openCash.byClientReceivable.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">Nenhum título a receber em aberto.</p>
          ) : (
            <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
              {openCash.byClientReceivable.map((row) => (
                <li key={row.entity} className="py-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-900 truncate">{row.entity}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{row.count} título{row.count === 1 ? '' : 's'}</p>
                  </div>
                  <p className="text-xs font-black font-mono shrink-0 text-green-700">{fmtBRL(row.amount)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <CashTitleList
          title="Próximas dívidas"
          subtitle="A pagar — ordenadas pelo vencimento"
          rows={openCash.topPayable}
          totalCount={openCash.payableCount}
          tone="red"
          dateLabel="Venc."
        />
        <CashTitleList
          title="Próximas receitas"
          subtitle="A receber — ordenadas pelo vencimento"
          rows={openCash.topReceivable}
          totalCount={openCash.receivableCount}
          tone="green"
          dateLabel="Venc."
        />
      </div>

      <button
        type="button"
        onClick={() => goTo('fin-transactions')}
        className="text-[11px] text-red-700 hover:text-red-800 font-bold flex items-center gap-1"
      >
        Abrir Contas a Pagar / Receber <ChevronRight size={12} />
      </button>
    </div>
  );

  const alertsWidget = (
    <Card title="Alertas Críticos" subtitle="Mesmos gatilhos dos e-mails operacionais" testId="widget-alertas-criticos">
      {alerts.length === 0 ? (
        <p className="text-sm text-gray-500 flex items-center gap-2"><CheckCircle2 size={16} className="text-green-600" /> Nenhum alerta crítico no período.</p>
      ) : (
        <ul className="space-y-2">
          {alerts.map(a => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => goTo(a.actionScreen)}
                className={`w-full text-left rounded-lg px-3 py-2 border transition-colors ${
                  a.severity === 'critical' ? 'bg-red-50 border-red-200 hover:bg-red-100' :
                  a.severity === 'warning' ? 'bg-amber-50 border-amber-200 hover:bg-amber-100' :
                  'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <p className="text-xs font-bold text-gray-900">{a.title}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{a.detail}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  const approvalsWidget = (
    <Card title="Aprovações Pendentes" subtitle="OS concluídas sem faturamento liberado">
      {pendingApprovals.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhuma OS pendente de aprovação.</p>
      ) : (
        <ul className="space-y-2 max-h-48 overflow-y-auto">
          {pendingApprovals.map(item => (
            <li key={item.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
              <span className="text-gray-700 truncate pr-2">{item.label}</span>
              <span className="font-mono text-green-600 font-bold shrink-0">{fmtShort(item.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => goTo('missions')} className="mt-3 text-[11px] text-red-700 hover:text-red-800 font-bold flex items-center gap-1">
        Abrir Painel de OS <ChevronRight size={12} />
      </button>
    </Card>
  );

  /** Faturamento diário — abaixo do Provisionamento e acima do Caixa do período. */
  const revenueMonthCompareSection = (
    <Card
      title="Faturamento diário (OS)"
      subtitle={`Acumulado por dia — de junho em diante. ${revenueMonthCompare.previousLabel} (vermelho escuro) × ${revenueMonthCompare.currentLabel} (verde escuro); demais meses em cinza bem claro.`}
      testId="revenue-month-compare-diretoria"
    >
      {/* Legenda de cores + acumulados — acima do gráfico */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3 text-[11px]">
        <span className="inline-flex items-center gap-1.5 font-black" style={{ color: REVENUE_MONTH_COLOR_PREVIOUS }}>
          <span className="inline-block w-3 h-0.5 rounded-full" style={{ backgroundColor: REVENUE_MONTH_COLOR_PREVIOUS }} aria-hidden />
          Mês passado ({revenueMonthCompare.previousLabel})
        </span>
        <span className="inline-flex items-center gap-1.5 font-black" style={{ color: REVENUE_MONTH_COLOR_CURRENT }}>
          <span className="inline-block w-3 h-0.5 rounded-full" style={{ backgroundColor: REVENUE_MONTH_COLOR_CURRENT }} aria-hidden />
          Mês atual ({revenueMonthCompare.currentLabel})
        </span>
        <span className="inline-flex items-center gap-1.5 font-bold text-gray-400">
          <span className="inline-block w-3 h-0.5 rounded-full" style={{ backgroundColor: REVENUE_MONTH_COLOR_OTHER }} aria-hidden />
          Demais meses
        </span>
        <span className="text-gray-300">|</span>
        <span className="font-mono font-bold" style={{ color: REVENUE_MONTH_COLOR_CURRENT }}>
          Acumulado {revenueMonthCompare.currentLabel}: {fmtBRL(revenueMonthCompare.currentCumTotal)}
        </span>
        <span className="font-mono font-bold" style={{ color: REVENUE_MONTH_COLOR_PREVIOUS }}>
          Acumulado {revenueMonthCompare.previousLabel}: {fmtBRL(revenueMonthCompare.previousCumTotal)}
        </span>
        {revenueMonthCompare.deltaCumPct != null && (
          <span
            className={`font-black px-2 py-0.5 rounded-md ${
              revenueMonthCompare.deltaCumPct >= 0
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-rose-50 text-rose-700'
            }`}
          >
            {revenueMonthCompare.deltaCumPct >= 0 ? '▲' : '▼'}{' '}
            {Math.abs(revenueMonthCompare.deltaCumPct).toFixed(1)}% vs mês anterior
          </span>
        )}
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={revenueMonthCompare.points} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="label" tick={AXIS_TICK} interval={1} />
            <YAxis tick={AXIS_TICK} tickFormatter={(v) => fmtShort(v)} width={48} />
            <Tooltip content={<FinTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 10 }}
              formatter={(value, entry: any) => {
                const role = revenueMonthCompare.series.find((s) => s.dataKey === entry?.dataKey)?.role;
                if (role === 'other') {
                  return <span className="text-gray-300 font-medium">{value}</span>;
                }
                if (role === 'previous') {
                  return <span style={{ color: REVENUE_MONTH_COLOR_PREVIOUS, fontWeight: 800 }}>{value}</span>;
                }
                return <span style={{ color: REVENUE_MONTH_COLOR_CURRENT, fontWeight: 800 }}>{value}</span>;
              }}
            />
            {revenueMonthCompare.series.map((s) => (
              <Line
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                name={s.label}
                stroke={s.color}
                strokeWidth={s.strokeWidth}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );

  const renderGeral = () => (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-12 space-y-3">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Dívidas · Contas · Receita</p>
        {liquidezResumoSection}
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest pt-1">Operação (OS)</p>
        {operationalKpiRow}
        {provisionHorizonSection && (
          <>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest pt-1">Provisionamento alinhado</p>
            {provisionHorizonSection}
          </>
        )}
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest pt-1">Faturamento diário (OS)</p>
        {revenueMonthCompareSection}
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest pt-1">Caixa do período (liquidez)</p>
        {cashKpiRow}
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest pt-1">Detalhe do em aberto</p>
        {openCashOutlookSection}
      </div>

      <div className="lg:col-span-6">
        <Card title="Fluxo de Caixa Diário" subtitle="Entradas vs. saídas (pagas no período)">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cashFlow}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="day" tick={AXIS_TICK} />
                <YAxis tick={AXIS_TICK} tickFormatter={v => fmtShort(v)} />
                <Tooltip content={<FinTooltip />} />
                <Legend />
                <Bar dataKey="inflow" name="Entradas" fill={COLOR_INCOME} radius={[4, 4, 0, 0]} />
                <Bar dataKey="outflow" name="Saídas" fill={COLOR_EXPENSE} radius={[4, 4, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="lg:col-span-6">
        <Card title="Pipeline Comercial" subtitle="Cotações por estágio">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnel} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis type="number" tick={AXIS_TICK} tickFormatter={v => fmtShort(v)} />
                <YAxis type="category" dataKey="label" width={70} tick={AXIS_TICK} />
                <Tooltip content={<FinTooltip />} />
                <Bar dataKey="value" name="Valor" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-gray-500 mt-2">{funnel.reduce((s, f) => s + f.count, 0)} propostas no funil</p>
        </Card>
      </div>

      <div className="lg:col-span-4">
        <Card title="Top 5 Pagadores" subtitle="Receita canônica por cliente">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topPayers}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="name" tick={{ ...AXIS_TICK, fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={AXIS_TICK} tickFormatter={v => fmtShort(v)} />
                <Tooltip content={<FinTooltip />} />
                <Bar dataKey="revenue" name="Receita" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="lg:col-span-4">
        <Card title="Margem vs Meta" subtitle={`Meta ${MARGIN_GOAL_PCT}%`}>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={marginSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="label" tick={{ ...AXIS_TICK, fontSize: 9 }} />
                <YAxis tick={AXIS_TICK} unit="%" />
                <Tooltip content={<FinTooltip />} />
                <Line type="monotone" dataKey="margin" name="Margem %" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="goal" name="Meta" stroke="#f59e0b" strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="lg:col-span-4">{alertsWidget}</div>

      <div className="lg:col-span-6">{approvalsWidget}</div>
      <div className="lg:col-span-6">
        <Card title="RH — Resumo" subtitle={data.periodLabel}>
          <div className="grid grid-cols-2 gap-3">
            <KpiTile label="Colaboradores" value={String(data.rhSnapshot.activeEmployees)} sub={`${data.rhSnapshot.totalEmployees} cadastrados`} />
            <KpiTile label="Custo equipe" value={fmtShort(data.rhSnapshot.payrollPreview)} accent="text-violet-400" />
            <KpiTile label="Comissões" value={fmtShort(data.rhSnapshot.commissionsPending)} accent="text-amber-400" />
            <KpiTile label="Premiações / bônus" value={fmtShort(data.rhSnapshot.bonuses)} accent="text-pink-400" />
          </div>
          <button type="button" onClick={() => goTo('rh-dashboard')} className="mt-3 text-[11px] text-red-700 hover:text-red-800 font-bold flex items-center gap-1">
            Abrir Dashboard RH <ChevronRight size={12} />
          </button>
        </Card>
      </div>
    </div>
  );

  const renderFinanceiro = () => (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-12 space-y-3">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Dívidas · Contas · Receita</p>
        {liquidezResumoSection}
        {provisionHorizonSection && (
          <>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest pt-1">Provisionamento alinhado</p>
            {provisionHorizonSection}
          </>
        )}
      </div>
      <div className="lg:col-span-12 space-y-3">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Caixa do período (liquidez)</p>
        {cashKpiRow}
      </div>
      <div className="lg:col-span-12 space-y-3">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Detalhe do em aberto</p>
        {openCashOutlookSection}
      </div>
      <div className="lg:col-span-8">
        <Card title="Fluxo de Caixa Diário" subtitle="Transações pagas">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cashFlow}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="day" tick={AXIS_TICK} />
                <YAxis tick={AXIS_TICK} tickFormatter={v => fmtShort(v)} />
                <Tooltip content={<FinTooltip />} />
                <Area type="monotone" dataKey="inflow" name="Entradas" fill="#16a34a22" stroke={COLOR_INCOME} />
                <Area type="monotone" dataKey="outflow" name="Saídas" fill="#dc262622" stroke={COLOR_EXPENSE} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <div className="lg:col-span-4">
        <Card title="Despesas por Categoria">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={expenseDonut} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {expenseDonut.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<FinTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <div className="lg:col-span-6">
        <Card title="Contas a Receber vs Pagar" subtitle="Pendências por vencimento">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={arAp}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="month" tick={AXIS_TICK} />
                <YAxis tick={AXIS_TICK} tickFormatter={v => fmtShort(v)} />
                <Tooltip content={<FinTooltip />} />
                <Legend />
                <Bar dataKey="receber" name="A Receber" fill={COLOR_INCOME} />
                <Bar dataKey="pagar" name="A Pagar" fill={COLOR_EXPENSE} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <div className="lg:col-span-6">{alertsWidget}</div>
    </div>
  );

  const renderOperacao = () => (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-4 grid grid-cols-2 gap-3">
        <KpiTile label="OS no período" value={String(operational.missionCount)} />
        <KpiTile label="OS Mãe ativas" value={String(parentSummary.active)} sub={`${parentSummary.total} grupos`} accent="text-gray-900" />
        <KpiTile label="Propostas abertas" value={String(openQuotes)} accent="text-amber-600" />
        <KpiTile label="Margem operacional" value={`${operational.grossMarginPct.toFixed(1)}%`} accent="text-green-600" />
      </div>
      <div className="lg:col-span-8">
        <Card title="Status das Missões" subtitle="Distribuição atual (período + abertas)">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusCounts}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="status" tick={{ ...AXIS_TICK, fontSize: 9 }} interval={0} angle={-15} textAnchor="end" height={45} />
                <YAxis tick={AXIS_TICK} allowDecimals={false} />
                <Tooltip content={<FinTooltip />} />
                <Bar dataKey="count" name="Quantidade" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <div className="lg:col-span-6">
        <Card title="Funil de Vendas" subtitle="Cotações">
          <div className="space-y-3">
            {funnel.map((stage, i) => (
              <div key={stage.key}>
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>{stage.label}</span>
                  <span>{stage.count} · {fmtShort(stage.value)}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(8, 100 - i * 28)}%`, backgroundColor: CHART_COLORS[i] }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="lg:col-span-6">{approvalsWidget}</div>
    </div>
  );

  const renderClientes = () => (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-8">
        <Card title="Receita e Custos por Cliente" subtitle="Cálculo canônico do período">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={clientBars}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="name" tick={{ ...AXIS_TICK, fontSize: 9 }} />
                <YAxis tick={AXIS_TICK} tickFormatter={v => fmtShort(v)} />
                <Tooltip content={<FinTooltip />} />
                <Legend />
                <Bar dataKey="revenue" name="Receita" fill={COLOR_INCOME} />
                <Bar dataKey="cost" name="Custo" fill={COLOR_EXPENSE} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <div className="lg:col-span-4">
        <Card title="Top Faturamento">
          <ul className="space-y-2">
            {topPayers.map((c, i) => (
              <li key={c.name} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                <span className="text-gray-700"><span className="text-gray-400 mr-2">#{i + 1}</span>{c.name}</span>
                <span className="font-mono text-green-600 font-bold">{fmtShort(c.revenue)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <div className="lg:col-span-6">
        <Card title="Contas a Receber vs Pagar">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={arAp}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="month" tick={AXIS_TICK} />
                <YAxis tick={AXIS_TICK} tickFormatter={v => fmtShort(v)} />
                <Tooltip content={<FinTooltip />} />
                <Bar dataKey="receber" name="Receber" fill={COLOR_INCOME} />
                <Bar dataKey="pagar" name="Pagar" fill={COLOR_EXPENSE} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <div className="lg:col-span-6">{approvalsWidget}</div>
    </div>
  );

  const renderRh = () => (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-12 grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Na folha de custo" value={String(data.rhSnapshot.activeEmployees)} sub={`${data.rhSnapshot.totalEmployees} cadastrados`} accent="text-blue-400" />
        <KpiTile label="Custo equipe" value={fmtShort(data.rhSnapshot.payrollPreview)} accent="text-violet-400" />
        <KpiTile label="Comissões" value={fmtShort(data.rhSnapshot.commissionsPending)} accent="text-amber-400" />
        <KpiTile label="Premiações / bônus" value={fmtShort(data.rhSnapshot.bonuses)} accent="text-pink-400" />
      </div>
      <div className="lg:col-span-6">
        <Card title="Composição do custo" subtitle="Igual à lista RH → Funcionários">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: 'Custo equipe', value: data.rhSnapshot.payrollPreview },
                { name: 'Comissões', value: data.rhSnapshot.commissionsPending },
                { name: 'Prêmios/bônus', value: data.rhSnapshot.bonuses },
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="name" tick={AXIS_TICK} />
                <YAxis tick={AXIS_TICK} tickFormatter={v => fmtShort(v)} />
                <Tooltip content={<FinTooltip />} />
                <Bar dataKey="value" name="Valor" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <div className="lg:col-span-6">
        <Card title="Ações RH" subtitle="Atalhos">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { id: 'rh-dashboard', label: 'Dashboard RH', icon: Users },
              { id: 'rh-employees', label: 'Funcionários', icon: Building2 },
              { id: 'rh-timeclock', label: 'Folha de Ponto', icon: Target },
              { id: 'missions', label: 'Comissões por OS', icon: DollarSign },
            ].map(link => (
              <button
                key={link.id}
                type="button"
                onClick={() => goTo(link.id)}
                className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-3 text-left hover:bg-gray-100 transition-colors"
              >
                <link.icon size={16} className="text-red-700" />
                <span className="text-xs font-semibold text-gray-800">{link.label}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );

  const renderSistema = () => <DiretoriaSistemaTab onNavigate={goTo} />;

  const tabContent: Record<DiretoriaTab, () => React.ReactNode> = {
    geral: renderGeral,
    financeiro: renderFinanceiro,
    operacao: renderOperacao,
    clientes: renderClientes,
    rh: renderRh,
    sistema: renderSistema,
  };

  return (
    <div className="space-y-4 pb-16 bg-gray-50/50 p-2 rounded-2xl animate-fade-in" data-testid="dashboard-diretoria">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
              <div className="p-2 bg-red-700 text-white rounded-xl shadow-lg shadow-red-200"><Crown size={18} /></div>
              Cockpit Diretoria Executiva
            </h1>
            <p className="text-sm text-gray-500 mt-1 ml-12">
              {data.periodLabel} · {operational.missionCount} OS no período · margem OS {operational.grossMarginPct.toFixed(1)}%
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 bg-white p-1.5 rounded-2xl border border-gray-200">
            <div className="flex rounded-xl border border-gray-200 overflow-hidden" data-testid="filter-period-mode">
              {PERIOD_MODES.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    const cur = createDefaultPeriod();
                    setPeriod(p => ({
                      ...p,
                      mode: m.id,
                      // Em Hoje/Semana, realinha mês/ano ao vigente para o comparativo MoM.
                      ...(m.id !== 'month' || followCurrentMonth
                        ? { year: cur.year, month: cur.month }
                        : {}),
                    }));
                  }}
                  className={`px-3 py-2 text-xs font-bold transition-colors ${
                    period.mode === m.id
                      ? 'bg-red-700 text-white'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                  data-testid={`filter-mode-${m.id}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {period.mode === 'month' && (
              <>
                <select
                  value={period.month}
                  onChange={e => {
                    const month = Number(e.target.value);
                    const next = { ...period, month };
                    setFollowCurrentMonth(isCurrentCalendarMonth(next));
                    setPeriod(next);
                  }}
                  className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg px-3 py-2 font-bold"
                  data-testid="filter-month"
                >
                  {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
                <select
                  value={period.year}
                  onChange={e => {
                    const year = Number(e.target.value);
                    const next = { ...period, year };
                    setFollowCurrentMonth(isCurrentCalendarMonth(next));
                    setPeriod(next);
                  }}
                  className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg px-3 py-2 font-bold"
                  data-testid="filter-year"
                >
                  {buildYearOptions(4).map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </>
            )}
            <button
              type="button"
              onClick={() => { void data.refresh(); }}
              disabled={data.loading}
              title="Recalcula hora extra/valores nas OS em aberto (não faturadas) e atualiza os KPIs"
              className="inline-flex items-center gap-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-xl shadow-sm"
              data-testid="button-diretoria-refresh"
            >
              {data.loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Atualizar
            </button>
          </div>
          {data.lastRecalc && (
            <p
              className={`mt-2 text-xs font-medium ${data.lastRecalc.errors > 0 ? 'text-amber-700' : 'text-emerald-700'}`}
              data-testid="text-diretoria-recalc-result"
            >
              {data.lastRecalc.message}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mt-4 border-t border-gray-100 pt-4">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                tab === t.id
                  ? 'bg-red-700 text-white shadow-md'
                  : 'bg-gray-50 text-gray-500 hover:text-gray-800 hover:bg-gray-100'
              }`}
              data-testid={`tab-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl">
        {tabContent[tab]()}
      </div>
    </div>
  );
};

export default DashboardDiretoria;
