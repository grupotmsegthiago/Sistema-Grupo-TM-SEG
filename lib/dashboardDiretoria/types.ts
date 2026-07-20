import type { Client, ClientPriceTable, FinancialCategory, FinancialTransaction, Mission, ProviderCostTable } from '../../types';

export type DiretoriaTab = 'geral' | 'financeiro' | 'operacao' | 'clientes' | 'rh' | 'sistema';

/** Hoje (00:00–23:59), semana (seg–dom) ou mês calendário */
export type DashboardPeriodMode = 'today' | 'week' | 'month';

export interface DashboardPeriod {
  mode: DashboardPeriodMode;
  year: number;
  month: number; // 0–11 (usado quando mode === 'month')
}

export interface CriticalAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  actionScreen?: string;
}

export interface PendingApprovalItem {
  id: string;
  label: string;
  amount: number;
  kind: 'mission' | 'quote' | 'transaction';
}

export interface DashboardRefs {
  clientTables: ClientPriceTable[];
  providerTables: ProviderCostTable[];
  clientsData: Client[];
}

export interface OperationalKpis {
  grossRevenue: number;
  variableCost: number;
  grossProfit: number;
  grossMarginPct: number;
  missionCount: number;
}

export interface CashKpis {
  incomePaid: number;
  expensePaid: number;
  pendingReceivable: number;
  pendingPayable: number;
  overduePayable: number;
  cashResult: number;
  cashMarginPct: number;
  totalCash: number;
  /** Contas a receber − contas a pagar (positivo = sobra prevista no caixa) */
  cashForecast: number;
}

/** Conta financeira com saldo atual (snapshot de investimento ou saldo inicial). */
export interface DiretoriaAccountBalance {
  id: string;
  name: string;
  bankName: string;
  balance: number;
  /** Contas operacionais do grupo (TM Gestão / Security / Segurança); demais = investimento. */
  kind: 'investment' | 'operational';
}

/** Visão de saldos para o cockpit — totais (lista detalhada só se precisar no cálculo). */
export interface AccountBalanceOverview {
  /** Soma de todas as contas ativas (investimentos + operacionais). */
  accountsTotal: number;
  investmentsTotal: number;
  operationalTotal: number;
  investmentCount: number;
  operationalCount: number;
  accounts: DiretoriaAccountBalance[];
}

/** Linha do ranking de títulos do caixa (para o diretoria conferir). */
export interface CashTitleRow {
  id: string;
  description: string;
  amount: number;
  /** Data usada no filtro: payment_date se PAID, senão due_date */
  date: string;
  category: string;
  entity: string;
  status: string;
  type: 'INCOME' | 'EXPENSE';
  bucket: 'paid' | 'pending';
}

export interface CashTitleBreakdown {
  paidIncome: CashTitleRow[];
  paidExpense: CashTitleRow[];
  pendingReceivable: CashTitleRow[];
  pendingPayable: CashTitleRow[];
  paidIncomeCount: number;
  paidExpenseCount: number;
  pendingReceivableCount: number;
  pendingPayableCount: number;
}

/** Cliente com maior volume a receber (títulos em aberto, sem teto de prazo). */
export interface OpenReceivableByEntity {
  entity: string;
  amount: number;
  count: number;
}

/**
 * Caixa em aberto — visão de futuro (não corta em 30 dias).
 * Inclui vencidos + a vencer (60/90 dias etc.), fora do filtro de mês do cockpit.
 */
export interface OpenCashOutlook {
  receivableTotal: number;
  payableTotal: number;
  /** A receber − a pagar em aberto */
  netOutlook: number;
  overdueReceivable: number;
  overduePayable: number;
  receivableCount: number;
  payableCount: number;
  topReceivable: CashTitleRow[];
  topPayable: CashTitleRow[];
  byClientReceivable: OpenReceivableByEntity[];
}

/**
 * Horizonte do provisionamento: usa a última data da receita em aberto
 * e soma as dívidas a pagar até essa mesma data (entrada + saída no período).
 */
export interface ProvisionHorizon {
  /** Última data de vencimento entre títulos a receber em aberto (ISO yyyy-mm-dd) */
  lastReceivableDate: string | null;
  receivableTotal: number;
  receivableCount: number;
  /** A pagar com vencimento até lastReceivableDate (inclui vencidos) */
  payableInHorizon: number;
  payableInHorizonCount: number;
  /** Dívidas com vencimento depois do horizonte (fora do recorte) */
  payableBeyondHorizon: number;
  payableBeyondCount: number;
  /** Receita provisionada − dívidas no horizonte */
  netInHorizon: number;
}

export interface DashboardDiretoriaData {
  loading: boolean;
  error: string | null;
  period: DashboardPeriod;
  periodLabel: string;
  missions: Mission[];
  /** Transações com vencimento no período selecionado */
  transactions: FinancialTransaction[];
  /** Todas as transações (saldo, pendências globais) */
  allTransactions: FinancialTransaction[];
  categories: FinancialCategory[];
  quotes: Array<{
    id: string;
    client_name: string;
    status: string;
    total_value: number;
    created_at: string;
  }>;
  refs: DashboardRefs;
  accounts: Array<{ id: string; initial_balance: number; name?: string; bank_name?: string }>;
  /** Último saldo registrado por conta (account_balance_snapshots); vazio se sem histórico. */
  latestAccountBalances: Record<string, number>;
  accountBalance: number;
  rhSnapshot: {
    totalEmployees: number;
    /** Colaboradores na mesma base do custo em RH → Funcionários (exclui Desligado). */
    activeEmployees: number;
    /** Custo total da equipe (= companyCost da lista de Funcionários). */
    payrollPreview: number;
    commissionsPending: number;
    /** Bonificações + premiações do mês (mesma base da lista). */
    bonuses: number;
  };
  /** Resultado do último recalculo (hora extra / faturamento) ao clicar Atualizar */
  lastRecalc: {
    updated: number;
    skipped: number;
    total: number;
    errors: number;
    message: string;
  } | null;
  refresh: () => Promise<void>;
}

/**
 * Ponto do gráfico: faturamento OS do dia D do mês atual × dia D do mês anterior.
 * Acumulados permitem ver se a evolução está acima/abaixo do mês passado.
 */
export interface DailyRevenueMonthComparePoint {
  /** Dia do mês (1–31) */
  day: number;
  /** Rótulo curto do eixo (01, 02, …) */
  label: string;
  /** Tooltip: "01/06 × 01/07" */
  labelCompare: string;
  /** Receita canônica no dia (mês atual); null = dia futuro ainda não chegou */
  current: number | null;
  /** Receita canônica no mesmo dia do mês anterior; null se o mês anterior não tem esse dia */
  previous: number | null;
  currentCum: number | null;
  previousCum: number | null;
}

export interface DailyRevenueMonthComparison {
  points: DailyRevenueMonthComparePoint[];
  currentLabel: string;
  previousLabel: string;
  /** Acumulado atual até o último dia com dados */
  currentCumTotal: number;
  /** Acumulado do mês anterior no mesmo dia de referência */
  previousCumTotal: number;
  /** (atual − anterior) / anterior · 100; null se anterior = 0 */
  deltaCumPct: number | null;
}

/** Meta de margem operacional (OS) — alinhada ao termômetro / diretoria */
export const MARGIN_GOAL_PCT = 40;
export const DEFAULT_MONTHLY_REVENUE_GOAL = 700_000;
