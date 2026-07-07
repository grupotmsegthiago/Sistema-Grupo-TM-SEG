import type { RhPayrollCalc, RhSalaryConfig, RhTaxBracket } from '../../types/rh';

export function calcProgressiveTax(base: number, brackets: RhTaxBracket[]): number {
  if (base <= 0 || !brackets.length) return 0;
  const sorted = [...brackets].sort((a, b) => a.bracket_from - b.bracket_from);
  for (let i = sorted.length - 1; i >= 0; i--) {
    const b = sorted[i];
    const to = b.bracket_to ?? Infinity;
    if (base >= b.bracket_from && base <= to) {
      return Math.max(0, (base * b.rate_pct) / 100 - (b.deduction || 0));
    }
  }
  return 0;
}

export function calcSalary(config: RhSalaryConfig, taxBrackets: { inss: RhTaxBracket[]; irrf: RhTaxBracket[] }): RhPayrollCalc {
  const base = config.base_salary || 0;
  const night = config.night_shift_bonus || 0;
  const hazard = config.hazard_pay || 0;
  const unhealthy = config.unhealthy_pay || 0;
  const overtimeRate = (config.overtime_rate_pct || 50) / 100;
  const hourlyRate = base / 220;
  const overtimeValue = (config.overtime_hours || 0) * hourlyRate * (1 + overtimeRate);

  const benefits =
    (config.transport_voucher || 0) +
    (config.meal_voucher || 0) +
    (config.food_voucher || 0) +
    (config.health_plan || 0) +
    (config.dental_plan || 0) +
    (config.other_benefits || 0);

  const grossSalary = base + night + hazard + unhealthy + overtimeValue;
  const inss = config.inss_discount && config.inss_discount > 0
    ? config.inss_discount
    : calcProgressiveTax(grossSalary, taxBrackets.inss);
  const irrfBase = grossSalary - inss;
  const irrf = config.irrf_discount && config.irrf_discount > 0
    ? config.irrf_discount
    : calcProgressiveTax(irrfBase, taxBrackets.irrf);
  const fgts = grossSalary * ((config.fgts_pct || 8) / 100);
  const otherDiscounts = (config.alimony || 0) + (config.other_discounts || 0);
  const totalDiscounts = inss + irrf + otherDiscounts;
  const netSalary = grossSalary + benefits - totalDiscounts;

  return {
    grossSalary,
    totalBenefits: benefits,
    totalDiscounts,
    inss,
    irrf,
    fgts,
    netSalary,
    overtimeValue,
  };
}

export function calcDailySalary(baseSalary: number): number {
  return baseSalary / 30;
}

export function calcAbsenceDiscount(baseSalary: number, days: number): number {
  return calcDailySalary(baseSalary) * days;
}

export function calcDelayDiscount(baseSalary: number, minutes: number): number {
  const hourly = baseSalary / 220;
  return (hourly / 60) * minutes;
}

export function monthsBetween(start: string, end = new Date().toISOString()): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.max(0, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()));
}
