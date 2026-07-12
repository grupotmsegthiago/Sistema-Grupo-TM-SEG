import React, { useCallback, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, ComposedChart, Area,
} from 'recharts';
import {
  Crown, RefreshCw, Loader2, AlertTriangle, Wallet, Users,
  Target, CheckCircle2, ChevronRight, Building2, DollarSign,
  ArrowUpCircle, ArrowDownCircle, BarChart3,
} from 'lucide-react';
import { useDashboardDiretoriaData } from '../../lib/dashboardDiretoria/useDashboardDiretoriaData';
import {
  buildArApByMonth,
  buildClientRevenueCostBars,
  buildCriticalAlerts,
  buildDailyCashFlow,
  buildExpenseDonut,
  buildMarginVsGoalSeries,
  buildMissionStatusCounts,
  buildParentMissionsSummary,
  buildPendingApprovals,
  buildQuotesFunnel,
  buildTopClientsByRevenue,
  computeCashKpis,
  computeOperationalKpis,
  fmtBRL,
  fmtShort,
} from '../../lib/dashboardDiretoria/aggregations';
import { buildYearOptions } from '../../lib/dashboardDiretoria/periodUtils';
import type { DiretoriaTab } from '../../lib/dashboardDiretoria/types';
import { MARGIN_GOAL_PCT } from '../../lib/dashboardDiretoria/types';

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
];

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const FinTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 text-gray-800 px-3 py-2 rounded-lg shadow-lg text-xs">
      <p className="font-bold mb-1 text-gray-500">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="font-mono font-bold">{p.name}: {typeof p.value === 'number' && Math.abs(p.value) > 50 ? fmtBRL(p.value) : p.value}</p>
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

const KpiTile: React.FC<{ label: string; value: string; sub?: string; accent?: string; icon?: React.ReactNode }> = ({
  label, value, sub, accent = 'text-gray-900', icon,
}) => (
  <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
    <div className="flex justify-between items-start gap-2">
      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-black">{label}</p>
      {icon}
    </div>
    <p className={`text-lg font-black font-mono mt-1 ${accent}`}>{value}</p>
    {sub && <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>}
  </div>
);

interface Props {
  onNavigate?: (screenId: string) => void;
}

const DashboardDiretoria: React.FC<Props> = ({ onNavigate }) => {
  const now = new Date();
  const [tab, setTab] = useState<DiretoriaTab>('geral');
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() });

  const data = useDashboardDiretoriaData(period);

  const operational = useMemo(
    () => computeOperationalKpis(data.missions, data.refs, period),
    [data.missions, data.refs, period],
  );

  const cash = useMemo(
    () => computeCashKpis(data.transactions, data.allTransactions, data.categories, data.accounts, period),
    [data.transactions, data.allTransactions, data.categories, data.accounts, period],
  );

  const cashFlow = useMemo(() => buildDailyCashFlow(data.transactions), [data.transactions]);
  const marginSeries = useMemo(() => buildMarginVsGoalSeries(data.missions, data.refs, period), [data.missions, data.refs, period]);
  const topPayers = useMemo(() => buildTopClientsByRevenue(data.missions, data.refs, period), [data.missions, data.refs, period]);
  const clientBars = useMemo(() => buildClientRevenueCostBars(data.missions, data.refs, period), [data.missions, data.refs, period]);
  const funnel = useMemo(() => buildQuotesFunnel(data.quotes), [data.quotes]);
  const statusCounts = useMemo(() => buildMissionStatusCounts(data.missions), [data.missions]);
  const parentSummary = useMemo(() => buildParentMissionsSummary(data.missions), [data.missions]);
  const arAp = useMemo(() => buildArApByMonth(data.allTransactions), [data.allTransactions]);
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
        <button type="button" onClick={data.refresh} className="mt-3 text-sm font-bold text-red-700 underline">Tentar novamente</button>
      </div>
    );
  }

  const operationalKpiRow = (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KpiTile label="Receita OS" value={fmtShort(operational.grossRevenue)} sub="Faturamento canônico" accent="text-green-600" icon={<ArrowUpCircle size={16} className="text-green-500" />} />
      <KpiTile label="Margem OS" value={`${operational.grossMarginPct.toFixed(1)}%`} sub={`Meta ${MARGIN_GOAL_PCT}%`} accent="text-gray-900" />
      <KpiTile label="Custos OS" value={fmtShort(operational.variableCost)} accent="text-red-600" icon={<ArrowDownCircle size={16} className="text-red-500" />} />
      <KpiTile label="Lucro Operacional" value={fmtShort(operational.grossProfit)} accent={operational.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'} />
    </div>
  );

  const cashKpiRow = (
    <div className="space-y-3" data-testid="cash-summary-diretoria">
      <div className="grid grid-cols-2 gap-3">
        <KpiTile label="Entrou" value={fmtShort(cash.incomePaid)} sub="Pagos no período" accent="text-green-600" icon={<ArrowUpCircle size={16} className="text-green-500" />} />
        <KpiTile label="Saiu" value={fmtShort(cash.expensePaid)} sub="Pagos no período" accent="text-red-600" icon={<ArrowDownCircle size={16} className="text-red-500" />} />
        <KpiTile label="Falta entrar" value={fmtShort(cash.pendingReceivable)} sub="Contas a receber" accent="text-green-600" />
        <KpiTile label="Falta pagar" value={fmtShort(cash.pendingPayable)} sub="Contas a pagar" accent="text-red-600" />
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-black">Previsão do caixa</p>
        <p className="text-[11px] text-gray-500 mt-0.5">Contas a pagar − Contas a receber</p>
        <p className={`text-2xl font-black font-mono mt-2 ${cash.cashForecast <= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {fmtBRL(cash.cashForecast)}
        </p>
        <p className="text-[10px] text-gray-400 mt-1 font-mono">
          {fmtShort(cash.pendingPayable)} − {fmtShort(cash.pendingReceivable)}
        </p>
      </div>
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

  const renderGeral = () => (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-12 space-y-3">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Operação (OS)</p>
        {operationalKpiRow}
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest pt-1">Caixa (Contas a Pagar/Receber)</p>
        {cashKpiRow}
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
            <KpiTile label="Folha (base)" value={fmtShort(data.rhSnapshot.payrollPreview)} accent="text-violet-400" />
            <KpiTile label="Comissões pendentes" value={fmtShort(data.rhSnapshot.commissionsPending)} accent="text-amber-400" />
            <KpiTile label="Bonificações" value={fmtShort(data.rhSnapshot.bonuses)} accent="text-pink-400" />
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
      <div className="lg:col-span-12">{cashKpiRow}</div>
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
        <KpiTile label="Colaboradores ativos" value={String(data.rhSnapshot.activeEmployees)} sub={`${data.rhSnapshot.totalEmployees} total`} accent="text-blue-400" />
        <KpiTile label="Folha (salário base)" value={fmtShort(data.rhSnapshot.payrollPreview)} accent="text-violet-400" />
        <KpiTile label="Comissões pendentes" value={fmtShort(data.rhSnapshot.commissionsPending)} accent="text-amber-400" />
        <KpiTile label="Bonificações do mês" value={fmtShort(data.rhSnapshot.bonuses)} accent="text-pink-400" />
      </div>
      <div className="lg:col-span-6">
        <Card title="Composição da Folha" subtitle="Estimativa mensal">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: 'Salários', value: data.rhSnapshot.payrollPreview },
                { name: 'Comissões', value: data.rhSnapshot.commissionsPending },
                { name: 'Bonificações', value: data.rhSnapshot.bonuses },
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

  const tabContent: Record<DiretoriaTab, () => React.ReactNode> = {
    geral: renderGeral,
    financeiro: renderFinanceiro,
    operacao: renderOperacao,
    clientes: renderClientes,
    rh: renderRh,
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
            <select
              value={period.month}
              onChange={e => setPeriod(p => ({ ...p, month: Number(e.target.value) }))}
              className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg px-3 py-2 font-bold"
              data-testid="filter-month"
            >
              {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select
              value={period.year}
              onChange={e => setPeriod(p => ({ ...p, year: Number(e.target.value) }))}
              className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg px-3 py-2 font-bold"
              data-testid="filter-year"
            >
              {buildYearOptions(4).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button
              type="button"
              onClick={data.refresh}
              disabled={data.loading}
              className="inline-flex items-center gap-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-xl shadow-sm"
            >
              {data.loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Atualizar
            </button>
          </div>
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
