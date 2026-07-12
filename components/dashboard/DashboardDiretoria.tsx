import React, { useCallback, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, ComposedChart, Area,
} from 'recharts';
import {
  Crown, RefreshCw, Loader2, AlertTriangle, TrendingUp, Wallet, Users,
  Briefcase, Target, CheckCircle2, ChevronRight, Building2, Percent, DollarSign,
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
  computeFinancialKpis,
  fmtBRL,
  fmtShort,
} from '../../lib/dashboardDiretoria/aggregations';
import { buildYearOptions } from '../../lib/dashboardDiretoria/periodUtils';
import type { DiretoriaTab } from '../../lib/dashboardDiretoria/types';
import { MARGIN_GOAL_PCT } from '../../lib/dashboardDiretoria/types';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const TABS: { id: DiretoriaTab; label: string }[] = [
  { id: 'geral', label: 'Visão Geral' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'operacao', label: 'Operação' },
  { id: 'clientes', label: 'Clientes & Fornecedores' },
  { id: 'rh', label: 'RH & Comissões' },
];

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const DarkTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-600 text-slate-100 px-3 py-2 rounded-lg shadow-xl text-xs">
      <p className="font-bold mb-1 text-slate-300">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {typeof p.value === 'number' && Math.abs(p.value) > 50 ? fmtBRL(p.value) : p.value}</p>
      ))}
    </div>
  );
};

const Card: React.FC<{ title: string; subtitle?: string; className?: string; children: React.ReactNode; testId?: string }> = ({
  title, subtitle, className = '', children, testId,
}) => (
  <div
    data-testid={testId}
    className={`bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 shadow-lg ${className}`}
  >
    <div className="mb-3">
      <h3 className="text-sm font-bold text-slate-100">{title}</h3>
      {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
    {children}
  </div>
);

const KpiTile: React.FC<{ label: string; value: string; sub?: string; accent?: string }> = ({ label, value, sub, accent = 'text-blue-400' }) => (
  <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-3">
    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{label}</p>
    <p className={`text-lg font-black mt-1 ${accent}`}>{value}</p>
    {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
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

  const kpis = useMemo(
    () => computeFinancialKpis(data.missions, data.transactions, data.categories, data.refs, period),
    [data.missions, data.transactions, data.categories, data.refs, period],
  );

  const cashFlow = useMemo(() => buildDailyCashFlow(data.transactions), [data.transactions]);
  const marginSeries = useMemo(() => buildMarginVsGoalSeries(data.missions, data.refs, period), [data.missions, data.refs, period]);
  const topPayers = useMemo(() => buildTopClientsByRevenue(data.missions, data.refs, period), [data.missions, data.refs, period]);
  const clientBars = useMemo(() => buildClientRevenueCostBars(data.missions, data.refs, period), [data.missions, data.refs, period]);
  const funnel = useMemo(() => buildQuotesFunnel(data.quotes), [data.quotes]);
  const statusCounts = useMemo(() => buildMissionStatusCounts(data.missions), [data.missions]);
  const parentSummary = useMemo(() => buildParentMissionsSummary(data.missions), [data.missions]);
  const arAp = useMemo(() => buildArApByMonth(data.transactions), [data.transactions]);
  const expenseDonut = useMemo(() => buildExpenseDonut(data.transactions, data.categories), [data.transactions, data.categories]);
  const pendingApprovals = useMemo(() => buildPendingApprovals(data.missions, data.refs), [data.missions, data.refs]);
  const openQuotes = useMemo(() => data.quotes.filter(q => q.status !== 'Aprovada').length, [data.quotes]);

  const alerts = useMemo(
    () => buildCriticalAlerts({
      kpis,
      pendingApprovals,
      missions: data.missions,
      refs: data.refs,
      accountBalance: data.accountBalance,
      openQuotes,
    }),
    [kpis, pendingApprovals, data.missions, data.refs, data.accountBalance, openQuotes],
  );

  const goTo = useCallback((screen?: string) => {
    if (screen && onNavigate) onNavigate(screen);
  }, [onNavigate]);

  if (data.loading && data.missions.length === 0) {
    return (
      <div className="flex items-center gap-3 p-8 text-slate-300" data-testid="dashboard-diretoria-loading">
        <Loader2 className="animate-spin" /> Carregando cockpit da diretoria…
      </div>
    );
  }

  if (data.error && data.missions.length === 0) {
    return (
      <div className="bg-red-950/40 border border-red-800 rounded-xl p-6 text-red-200" data-testid="dashboard-diretoria-error">
        <p className="font-bold flex items-center gap-2"><AlertTriangle size={18} /> {data.error}</p>
        <button type="button" onClick={data.refresh} className="mt-3 text-sm underline">Tentar novamente</button>
      </div>
    );
  }

  const kpiRow = (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      <KpiTile label="Receita Bruta" value={fmtShort(kpis.grossRevenue)} accent="text-emerald-400" />
      <KpiTile label="Margem Bruta" value={`${kpis.grossMarginPct.toFixed(1)}%`} sub={`Meta ${MARGIN_GOAL_PCT}%`} accent="text-blue-400" />
      <KpiTile label="Custos Variáveis" value={fmtShort(kpis.variableCost)} accent="text-amber-400" />
      <KpiTile label="Despesas Pagas" value={fmtShort(kpis.expenses)} accent="text-orange-400" />
      <KpiTile label="Lucro Líquido" value={fmtShort(kpis.netProfit)} accent={kpis.netProfit >= 0 ? 'text-emerald-300' : 'text-red-400'} />
      <KpiTile label="EBITDA Est." value={fmtShort(kpis.ebitda)} accent="text-violet-400" />
    </div>
  );

  const alertsWidget = (
    <Card title="Alertas Críticos" subtitle="Mesmos gatilhos dos e-mails operacionais" testId="widget-alertas-criticos">
      {alerts.length === 0 ? (
        <p className="text-sm text-slate-400 flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-500" /> Nenhum alerta crítico no período.</p>
      ) : (
        <ul className="space-y-2">
          {alerts.map(a => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => goTo(a.actionScreen)}
                className={`w-full text-left rounded-lg px-3 py-2 border transition-colors ${
                  a.severity === 'critical' ? 'bg-red-950/50 border-red-800 hover:bg-red-900/40' :
                  a.severity === 'warning' ? 'bg-amber-950/40 border-amber-800 hover:bg-amber-900/30' :
                  'bg-slate-900/50 border-slate-600 hover:bg-slate-800/60'
                }`}
              >
                <p className="text-xs font-bold text-slate-100">{a.title}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{a.detail}</p>
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
        <p className="text-sm text-slate-500">Nenhuma OS pendente de aprovação.</p>
      ) : (
        <ul className="space-y-2 max-h-48 overflow-y-auto">
          {pendingApprovals.map(item => (
            <li key={item.id} className="flex items-center justify-between text-xs bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700">
              <span className="text-slate-200 truncate pr-2">{item.label}</span>
              <span className="font-mono text-emerald-400 shrink-0">{fmtShort(item.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => goTo('missions')} className="mt-3 text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1">
        Abrir Painel de OS <ChevronRight size={12} />
      </button>
    </Card>
  );

  const renderGeral = () => (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-12">{kpiRow}</div>

      <div className="lg:col-span-6">
        <Card title="Fluxo de Caixa Diário" subtitle="Entradas vs. saídas (pagas no período)">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cashFlow}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="day" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => fmtShort(v)} />
                <Tooltip content={<DarkTooltip />} />
                <Legend />
                <Bar dataKey="inflow" name="Entradas" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="outflow" name="Saídas" fill="#ef4444" radius={[4, 4, 0, 0]} />
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
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => fmtShort(v)} />
                <YAxis type="category" dataKey="label" width={70} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip content={<DarkTooltip />} />
                <Bar dataKey="value" name="Valor" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">{funnel.reduce((s, f) => s + f.count, 0)} propostas no funil</p>
        </Card>
      </div>

      <div className="lg:col-span-4">
        <Card title="Top 5 Pagadores" subtitle="Receita canônica por cliente">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topPayers}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => fmtShort(v)} />
                <Tooltip content={<DarkTooltip />} />
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
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} unit="%" />
                <Tooltip content={<DarkTooltip />} />
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
          <button type="button" onClick={() => goTo('rh-dashboard')} className="mt-3 text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1">
            Abrir Dashboard RH <ChevronRight size={12} />
          </button>
        </Card>
      </div>
    </div>
  );

  const renderFinanceiro = () => (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-12">{kpiRow}</div>
      <div className="lg:col-span-8">
        <Card title="Fluxo de Caixa Diário" subtitle="Transações pagas">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cashFlow}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="day" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => fmtShort(v)} />
                <Tooltip content={<DarkTooltip />} />
                <Area type="monotone" dataKey="inflow" name="Entradas" fill="#10b98133" stroke="#10b981" />
                <Area type="monotone" dataKey="outflow" name="Saídas" fill="#ef444433" stroke="#ef4444" />
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
                <Tooltip content={<DarkTooltip />} />
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
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => fmtShort(v)} />
                <Tooltip content={<DarkTooltip />} />
                <Legend />
                <Bar dataKey="receber" name="A Receber" fill="#10b981" />
                <Bar dataKey="pagar" name="A Pagar" fill="#ef4444" />
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
        <KpiTile label="OS no período" value={String(kpis.missionCount)} />
        <KpiTile label="OS Mãe ativas" value={String(parentSummary.active)} sub={`${parentSummary.total} grupos`} accent="text-blue-400" />
        <KpiTile label="Propostas abertas" value={String(openQuotes)} accent="text-amber-400" />
        <KpiTile label="Margem operacional" value={`${kpis.grossMarginPct.toFixed(1)}%`} accent="text-emerald-400" />
      </div>
      <div className="lg:col-span-8">
        <Card title="Status das Missões" subtitle="Distribuição atual (período + abertas)">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusCounts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="status" tick={{ fill: '#94a3b8', fontSize: 9 }} interval={0} angle={-15} textAnchor="end" height={45} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} allowDecimals={false} />
                <Tooltip content={<DarkTooltip />} />
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
                <div className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>{stage.label}</span>
                  <span>{stage.count} · {fmtShort(stage.value)}</span>
                </div>
                <div className="h-2 bg-slate-900 rounded-full overflow-hidden">
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
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => fmtShort(v)} />
                <Tooltip content={<DarkTooltip />} />
                <Legend />
                <Bar dataKey="revenue" name="Receita" fill="#10b981" />
                <Bar dataKey="cost" name="Custo" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <div className="lg:col-span-4">
        <Card title="Top Faturamento">
          <ul className="space-y-2">
            {topPayers.map((c, i) => (
              <li key={c.name} className="flex items-center justify-between text-xs bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700">
                <span className="text-slate-300"><span className="text-slate-500 mr-2">#{i + 1}</span>{c.name}</span>
                <span className="font-mono text-emerald-400">{fmtShort(c.revenue)}</span>
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
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => fmtShort(v)} />
                <Tooltip content={<DarkTooltip />} />
                <Bar dataKey="receber" name="Receber" fill="#10b981" />
                <Bar dataKey="pagar" name="Pagar" fill="#ef4444" />
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
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => fmtShort(v)} />
                <Tooltip content={<DarkTooltip />} />
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
                className="flex items-center gap-2 bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-3 text-left hover:bg-slate-800 transition-colors"
              >
                <link.icon size={16} className="text-blue-400" />
                <span className="text-xs font-semibold text-slate-200">{link.label}</span>
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
    <div className="space-y-4 pb-16" data-testid="dashboard-diretoria">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-slate-50 flex items-center gap-2">
              <Crown className="text-amber-400" /> Cockpit Diretoria Executiva
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Visão consolidada — {data.periodLabel} · {kpis.missionCount} OS · margem {kpis.grossMarginPct.toFixed(1)}%
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={period.month}
              onChange={e => setPeriod(p => ({ ...p, month: Number(e.target.value) }))}
              className="bg-slate-800 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2"
              data-testid="filter-month"
            >
              {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select
              value={period.year}
              onChange={e => setPeriod(p => ({ ...p, year: Number(e.target.value) }))}
              className="bg-slate-800 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2"
              data-testid="filter-year"
            >
              {buildYearOptions(4).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button
              type="button"
              onClick={data.refresh}
              disabled={data.loading}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg"
            >
              {data.loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Atualizar
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4 border-t border-slate-700 pt-4">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                tab === t.id
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-750'
              }`}
              data-testid={`tab-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-slate-950/50 rounded-xl">
        {tabContent[tab]()}
      </div>
    </div>
  );
};

export default DashboardDiretoria;
