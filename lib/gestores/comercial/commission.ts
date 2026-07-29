import type { GcCommissionPlan, GcCommissionTier } from './types';

export interface CommissionResult {
  percent: number;
  amount: number;
  tierLabel: string | null;
  bonus: number;
  total: number;
}

/**
 * Calcula comissão por faixas parametrizáveis.
 * Ex.: até 100k → X%; até 300k → Y%; acima → Z%.
 * Usa a faixa cujo min_amount <= revenue (maior min aplicável).
 */
export function calculateTieredCommission(
  revenue: number,
  plan?: Pick<GcCommissionPlan, 'base_percent' | 'tiers'> | null,
  fallbackPercent = 0,
): CommissionResult {
  const rev = Math.max(0, Number(revenue) || 0);
  const tiers = [...(plan?.tiers || [])].sort(
    (a, b) => Number(a.min_amount) - Number(b.min_amount),
  );

  let matched: GcCommissionTier | null = null;
  for (const tier of tiers) {
    const min = Number(tier.min_amount) || 0;
    const max = tier.max_amount == null ? Infinity : Number(tier.max_amount);
    if (rev >= min && rev <= max) {
      matched = tier;
      // continua para pegar a faixa mais alta que ainda cabe (ou a que contém)
    }
  }

  // Preferir a faixa com maior min_amount que ainda contém o valor
  if (tiers.length) {
    const containing = tiers.filter((t) => {
      const min = Number(t.min_amount) || 0;
      const max = t.max_amount == null ? Infinity : Number(t.max_amount);
      return rev >= min && rev <= max;
    });
    if (containing.length) {
      matched = containing[containing.length - 1];
    } else {
      // acima da última faixa sem teto
      const openEnded = [...tiers].reverse().find((t) => t.max_amount == null);
      if (openEnded && rev >= Number(openEnded.min_amount)) matched = openEnded;
    }
  }

  const percent = matched
    ? Number(matched.percent) || 0
    : Number(plan?.base_percent ?? fallbackPercent) || 0;
  const bonus = matched ? Number(matched.bonus_amount) || 0 : 0;
  const amount = Math.round(((rev * percent) / 100) * 100) / 100;
  return {
    percent,
    amount,
    tierLabel: matched?.label || null,
    bonus,
    total: Math.round((amount + bonus) * 100) / 100,
  };
}
