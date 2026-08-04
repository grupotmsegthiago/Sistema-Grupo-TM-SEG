/** Tipos da fundação — Gestão Investimento (Fase 2). */

export type PersonType = 'PF' | 'PJ';
export type LiquidityNeed = 'D0' | 'D1' | 'D30' | 'D90' | 'ILLIQUID_OK';
export type RiskProfile = 'conservador' | 'moderado' | 'arrojado' | 'agressivo';
export type InvestorCategory = 'geral' | 'qualificado' | 'profissional';
export type WatchlistStatus = 'observar' | 'candidato' | 'evitar';

export interface InvestorProfile {
  id?: string;
  owner_user_id?: string;
  person_type: PersonType | null;
  capital_available: number | null;
  emergency_reserve: number | null;
  max_per_investment: number | null;
  horizon_months: number | null;
  liquidity_need: LiquidityNeed | null;
  max_loss_pct: number | null;
  risk_profile: RiskProfile | null;
  exp_equity: boolean | null;
  exp_private_credit: boolean | null;
  exp_fii: boolean | null;
  exp_crypto: boolean | null;
  needs_monthly_income: boolean | null;
  monthly_income_amount: number | null;
  restricted_sectors: string;
  restricted_institutions: string;
  investor_category: InvestorCategory | null;
  allows_crypto: boolean;
  allows_international: boolean;
  monthly_target_pct_min: number;
  monthly_target_pct_max: number;
  broker_default: string;
  notes: string;
  version?: number;
  updated_at?: string;
}

export interface InvestmentPosition {
  id?: string;
  owner_user_id?: string;
  portfolio_id?: string | null;
  instrument_name: string;
  instrument_code: string;
  instrument_type: string;
  quantity: number;
  avg_price: number;
  current_value: number;
  entry_date: string | null;
  broker: string;
  taxation_notes: string;
  currency: string;
  is_active: boolean;
}

export interface InvestmentWatchlistItem {
  id?: string;
  owner_user_id?: string;
  instrument_name: string;
  instrument_code: string;
  instrument_type: string;
  notes: string;
  priority: number;
  status: WatchlistStatus;
}

export interface InvestmentRiskLimits {
  id?: string;
  owner_user_id?: string;
  max_pct_per_asset: number;
  max_pct_per_issuer: number;
  max_pct_per_institution: number;
  max_pct_per_class: number;
  max_pct_illiquid: number;
  max_pct_private_credit: number;
  max_pct_fx: number;
  max_pct_crypto: number;
  min_cash_pct: number;
  emergency_reserve_untouchable: boolean;
}

export interface ProfileCompleteness {
  complete: boolean;
  missing: string[];
  message: string | null;
}

export interface MonthlyTargetAnnualized {
  monthlyMinPct: number;
  monthlyMaxPct: number;
  annualMinPct: number;
  annualMaxPct: number;
  disclaimer: string;
}

/** Provisão de 30 dias — cenários-objetivo (não garantia de rentabilidade). */
export interface Provision30dEstimate {
  capitalBase: number;
  days: 30;
  pessimisticBrl: number;
  baseBrl: number;
  optimisticBrl: number;
  pessimisticPct: number;
  basePct: number;
  optimisticPct: number;
  kind: 'cenario_objetivo';
  disclaimer: string;
}

export const PROFILE_INCOMPLETE_MESSAGE =
  'Perfil incompleto. Não é possível emitir recomendação personalizada com segurança.';

export const TARGET_RETURN_DISCLAIMER =
  'A meta de 1,5% a 2% ao mês (~19,6%–26,8% ao ano compostos) é objetivo agressivo de retorno, condicionado ao risco aceito. Rentabilidade passada ou projetada não é garantia de resultado futuro. A IA não compra, vende, resgata nem transfere recursos.';
