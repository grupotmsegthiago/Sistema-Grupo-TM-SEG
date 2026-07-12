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
  /** Assinatura mensal fixa (ex.: Ultra US$ 200) em BRL */
  planLimitBrl: number;
  planLimitUsd: number;
  /** Cobrança extra / on-demand no ciclo (além da assinatura) */
  spentBrl: number;
  spentUsd: number;
  extraBrl: number;
  /** % do pacote incluído consumido (fonte: dashboard Cursor) */
  usagePct: number;
  /** @deprecated use extraBrl — mantido por compatibilidade (= assinatura - 0 extra conceptual) */
  planBalanceBrl: number;
  operationalSavingsBrl: number;
  exchangeRate: number;
  iofPct: number;
  entryCount: number;
  thermometer: 'ok' | 'warning' | 'critical';
  dataSource: BillingDataSource;
  isPlaceholder: boolean;
  billingCycleStart?: string | null;
  billingCycleEnd?: string | null;
  lastSyncedAt?: string | null;
  onDemandSpentUsd?: number;
  planIncludedPercentUsed?: number | null;
  /** Valor contábil do uso dentro do pacote (informativo — já pago na assinatura) */
  includedUsageValueBrl?: number;
  /** Assinatura mensal em BRL (= planLimitBrl) */
  subscriptionBrl?: number;
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
