import {
  PROFILE_INCOMPLETE_MESSAGE,
  type InvestorProfile,
  type ProfileCompleteness,
} from './types';

/** Campos obrigatórios para liberar recomendações personalizadas (Fase 3+). */
export const REQUIRED_PROFILE_FIELDS: Array<{
  key: keyof InvestorProfile;
  label: string;
  validate: (p: InvestorProfile) => boolean;
}> = [
  { key: 'person_type', label: 'Pessoa física ou jurídica', validate: (p) => p.person_type === 'PF' || p.person_type === 'PJ' },
  { key: 'capital_available', label: 'Capital disponível', validate: (p) => p.capital_available != null && p.capital_available > 0 },
  { key: 'emergency_reserve', label: 'Reserva de emergência', validate: (p) => p.emergency_reserve != null && p.emergency_reserve >= 0 },
  { key: 'max_per_investment', label: 'Valor máximo por investimento', validate: (p) => p.max_per_investment != null && p.max_per_investment > 0 },
  { key: 'horizon_months', label: 'Horizonte de investimento', validate: (p) => p.horizon_months != null && p.horizon_months > 0 },
  { key: 'liquidity_need', label: 'Necessidade de liquidez', validate: (p) => !!p.liquidity_need },
  { key: 'max_loss_pct', label: 'Percentual máximo de perda tolerável', validate: (p) => p.max_loss_pct != null && p.max_loss_pct >= 0 },
  { key: 'risk_profile', label: 'Perfil de risco', validate: (p) => !!p.risk_profile },
  { key: 'exp_equity', label: 'Experiência com renda variável', validate: (p) => typeof p.exp_equity === 'boolean' },
  { key: 'exp_private_credit', label: 'Experiência com crédito privado', validate: (p) => typeof p.exp_private_credit === 'boolean' },
  { key: 'exp_fii', label: 'Experiência com fundos imobiliários', validate: (p) => typeof p.exp_fii === 'boolean' },
  { key: 'exp_crypto', label: 'Experiência com criptomoedas', validate: (p) => typeof p.exp_crypto === 'boolean' },
  { key: 'needs_monthly_income', label: 'Necessidade de renda mensal', validate: (p) => typeof p.needs_monthly_income === 'boolean' },
  { key: 'investor_category', label: 'Categoria do investidor', validate: (p) => !!p.investor_category },
];

export function evaluateProfileCompleteness(profile: InvestorProfile | null | undefined): ProfileCompleteness {
  if (!profile) {
    return {
      complete: false,
      missing: REQUIRED_PROFILE_FIELDS.map((f) => f.label),
      message: PROFILE_INCOMPLETE_MESSAGE,
    };
  }

  const missing = REQUIRED_PROFILE_FIELDS.filter((f) => !f.validate(profile)).map((f) => f.label);

  // Se precisa de renda mensal, valor deve ser informado
  if (profile.needs_monthly_income === true) {
    if (profile.monthly_income_amount == null || profile.monthly_income_amount < 0) {
      missing.push('Valor da renda mensal necessária');
    }
  }

  // Cripto autorizada exige experiência declarada (mesmo que "não")
  if (profile.allows_crypto === true && typeof profile.exp_crypto !== 'boolean') {
    missing.push('Experiência com criptomoedas (obrigatória se cripto autorizada)');
  }

  const unique = [...new Set(missing)];
  return {
    complete: unique.length === 0,
    missing: unique,
    message: unique.length === 0 ? null : PROFILE_INCOMPLETE_MESSAGE,
  };
}

/** Defaults iniciais alinhados ao que o investidor já informou (XP, R$ 100 mil). */
export function createDraftInvestorProfile(partial?: Partial<InvestorProfile>): InvestorProfile {
  return {
    person_type: null,
    capital_available: 100_000,
    emergency_reserve: null,
    max_per_investment: null,
    horizon_months: null,
    liquidity_need: null,
    max_loss_pct: null,
    risk_profile: null,
    exp_equity: null,
    exp_private_credit: null,
    exp_fii: null,
    exp_crypto: null,
    needs_monthly_income: null,
    monthly_income_amount: null,
    restricted_sectors: '',
    restricted_institutions: '',
    investor_category: null,
    allows_crypto: false,
    allows_international: false,
    monthly_target_pct_min: 1.5,
    monthly_target_pct_max: 2.0,
    broker_default: 'XP',
    trading_sleeve_pct: 20,
    notes: '',
    ...partial,
  };
}
