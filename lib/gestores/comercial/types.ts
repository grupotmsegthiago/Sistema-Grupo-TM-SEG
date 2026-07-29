export type GcPipelineStage =
  | 'lead'
  | 'contato'
  | 'qualificacao'
  | 'reuniao'
  | 'proposta'
  | 'negociacao'
  | 'contrato'
  | 'cliente_ativo';

export interface GcCommissionTier {
  id?: string;
  plan_id?: string;
  min_amount: number;
  max_amount: number | null;
  percent: number;
  bonus_amount: number;
  label?: string | null;
  sort_order?: number;
}

export interface GcCommissionPlan {
  id: string;
  name: string;
  description?: string | null;
  base_percent: number;
  active: boolean;
  notes?: string | null;
  tiers?: GcCommissionTier[];
}

export interface GcRep {
  id: string;
  user_id?: string | null;
  full_name: string;
  job_title?: string | null;
  portfolio_label?: string | null;
  supervisor_rep_id?: string | null;
  admission_date?: string | null;
  monthly_goal: number;
  quarterly_goal: number;
  yearly_goal: number;
  commission_plan_id?: string | null;
  award_plan_id?: string | null;
  commission_percent: number;
  status: string;
  notes?: string | null;
}

export interface GcGoal {
  id: string;
  rep_id?: string | null;
  period_type: string;
  period_year: number;
  period_month?: number | null;
  period_quarter?: number | null;
  revenue_goal: number;
  margin_goal_pct?: number | null;
  operations_goal?: number | null;
  notes?: string | null;
}

export interface GcOpportunity {
  id: string;
  title: string;
  client_id?: string | null;
  client_name?: string | null;
  rep_id?: string | null;
  quote_id?: string | null;
  stage: GcPipelineStage | string;
  probability_pct: number;
  expected_value: number;
  expected_close_date?: string | null;
  status: string;
  priority: string;
  notes?: string | null;
  ai_probability_pct?: number | null;
}

export interface GcAgendaItem {
  id: string;
  opportunity_id?: string | null;
  client_id?: string | null;
  client_name?: string | null;
  rep_id?: string | null;
  responsible_name?: string | null;
  title: string;
  item_type: string;
  due_at: string;
  priority: string;
  status: string;
  outcome?: string | null;
  notes?: string | null;
}

export interface GcMeeting {
  id: string;
  opportunity_id?: string | null;
  client_id?: string | null;
  client_name?: string | null;
  rep_id?: string | null;
  title: string;
  meeting_at: string;
  notes_text?: string | null;
  transcript?: string | null;
  ai_summary?: string | null;
  ai_decisions?: string[] | null;
  ai_tasks?: string[] | null;
  negotiation_score?: number | null;
}

export interface GcInsight {
  id?: string;
  scope: string;
  rep_id?: string | null;
  client_id?: string | null;
  severity: 'critical' | 'warning' | 'info' | 'positive';
  title: string;
  detail: string;
  suggested_actions: string[];
  source: 'rules' | 'ai';
}

export interface GcClientHealth {
  clientId: string;
  clientName: string;
  status: string;
  monthlyRevenue: number;
  yearlyRevenue: number;
  cost: number;
  grossProfit: number;
  taxAmount: number;
  netProfit: number;
  marginPct: number;
  operations: number;
  escoltas: number;
  prontasRespostas: number;
  motoAcompanhamento: number;
  tripsShort: number;
  tripsMedium: number;
  tripsLong: number;
  avgTicket: number;
  lastContactAt?: string | null;
  nextContactAt?: string | null;
  daysWithoutRevenue: number;
  trend: 'up' | 'down' | 'stable';
  trendPct: number;
  healthScore: number;
  ownedBy?: string | null;
}

export interface GcDashboardKpis {
  metaAtual: number;
  valorVendido: number;
  valorFaturado: number;
  receitaGerada: number;
  lucroGerado: number;
  margemPct: number;
  comissaoEstimada: number;
  comissaoConfirmada: number;
  previsaoComissao: number;
  projecaoMes: number;
  metaPct: number;
  performanceScore: number;
  crescimentoPct: number;
  rentabilidadePct: number;
  carteiraScore: number;
  conversaoPct: number;
  operations: number;
}

export interface GcSettingsMap {
  tax_rate_pct: number;
  min_margin_pct: number;
  days_without_contact: number;
  days_followup_overdue: number;
  days_supervisor_alert: number;
  days_diretoria_alert: number;
  days_without_revenue: number;
  pipeline_probabilities: Record<string, number>;
  default_monthly_goal: number;
  alert_emails_diretoria: string[];
}
