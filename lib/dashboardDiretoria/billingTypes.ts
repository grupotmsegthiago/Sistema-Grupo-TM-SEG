export type BillingSource = 'cursor_stripe' | 'gemini' | 'agent_token' | 'manual' | 'sync';

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
}

export interface TokenEfficiencyReport {
  topCostDrivers: Array<{ summary: string; totalBrl: number; count: number }>;
  recommendations: string[];
  agentsMdSnippets: string[];
}
