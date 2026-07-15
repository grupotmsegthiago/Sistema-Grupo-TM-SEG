export type BillingSource = 'cursor_stripe' | 'cursor_dashboard' | 'gemini' | 'agent_token' | 'manual' | 'sync';
export type BillingDataSource = 'cursor' | 'stripe' | 'env_defaults' | 'mixed';

export interface BillingUsageRow {
  id: string;
  recorded_at: string;
  reference_month: string;
  source: BillingSource;
  external_id: string | null;
  token_id: string | null;
  summary: string;
  amount_usd: number;
  exchange_rate: number;
  iof_pct: number;
  amount_brl: number;
  plan_balance_brl: number | null;
  metadata: Record<string, unknown> | null;
}

export interface BillingMonthSummary {
  referenceMonth: string;
  planName: string;
  planLimitBrl: number;
  planLimitUsd: number;
  spentBrl: number;
  spentUsd: number;
  extraBrl: number;
  usagePct: number;
  planBalanceBrl: number;
  operationalSavingsBrl: number;
  exchangeRate: number;
  iofPct: number;
  entryCount: number;
  thermometer: 'ok' | 'warning' | 'critical';
  /** Origem dos números exibidos */
  dataSource: BillingDataSource;
  /** true quando ainda não houve sync Cursor/Stripe */
  isPlaceholder: boolean;
  billingCycleStart?: string | null;
  billingCycleEnd?: string | null;
  lastSyncedAt?: string | null;
  onDemandSpentUsd?: number;
  planIncludedPercentUsed?: number | null;
  /** Dias restantes até a virada do plano (barra volta a 0%). */
  daysUntilCycleReset?: number | null;
  /** Fração do tempo decorrido no ciclo (0–100), só calendário. */
  cycleTimeElapsedPct?: number | null;
}

export interface BillingDashboardMeta {
  cursorConfigured: boolean;
  stripeConfigured: boolean;
}

export interface TokenEfficiencyReport {
  topCostDrivers: Array<{ summary: string; totalBrl: number; count: number }>;
  recommendations: string[];
  agentsMdSnippets: string[];
}
