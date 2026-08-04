import {
  TARGET_RETURN_DISCLAIMER,
  type MonthlyTargetAnnualized,
  type Provision30dEstimate,
} from './types';

/** Converte meta mensal (%) em anual composto: (1 + r)^12 - 1. */
export function monthlyPctToAnnualCompoundPct(monthlyPct: number): number {
  const r = monthlyPct / 100;
  return (Math.pow(1 + r, 12) - 1) * 100;
}

export function describeMonthlyTargetBand(
  monthlyMinPct = 1.5,
  monthlyMaxPct = 2.0,
): MonthlyTargetAnnualized {
  const min = Number(monthlyMinPct);
  const max = Number(monthlyMaxPct);
  return {
    monthlyMinPct: min,
    monthlyMaxPct: max,
    annualMinPct: round4(monthlyPctToAnnualCompoundPct(min)),
    annualMaxPct: round4(monthlyPctToAnnualCompoundPct(max)),
    disclaimer: TARGET_RETURN_DISCLAIMER,
  };
}

/**
 * Provisão de 30 dias — cenários-objetivo a partir da meta cadastrada.
 * NÃO é previsão estatística de mercado nem garantia de ganho.
 */
export function buildProvision30dEstimate(
  capitalBase: number,
  monthlyMinPct = 1.5,
  monthlyMaxPct = 2.0,
): Provision30dEstimate {
  const capital = Math.max(0, Number(capitalBase) || 0);
  const min = Number(monthlyMinPct);
  const max = Number(monthlyMaxPct);
  const mid = (min + max) / 2;

  // Pessimista: 30% da meta mínima (estresse); base = média; otimista = meta máxima.
  const pessimisticPct = round4(min * 0.3);
  const basePct = round4(mid);
  const optimisticPct = round4(max);

  return {
    capitalBase: capital,
    days: 30,
    pessimisticBrl: round2(capital * (pessimisticPct / 100)),
    baseBrl: round2(capital * (basePct / 100)),
    optimisticBrl: round2(capital * (optimisticPct / 100)),
    pessimisticPct,
    basePct,
    optimisticPct,
    kind: 'cenario_objetivo',
    disclaimer:
      'Provisão de 30 dias em cenários-objetivo com base na meta cadastrada. Não constitui garantia, promessa nem projeção de mercado. Rentabilidade pode ser zero ou negativa.',
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
