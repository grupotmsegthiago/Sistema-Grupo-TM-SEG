import { calcSalary } from './payroll';
import type { RhPayrollCalc, RhSalaryConfig, RhTaxBracket } from '../../types/rh';

export interface RhEmployeeCostBreakdown {
  employeeId: string;
  referenceMonth: string;
  hasSalaryConfig: boolean;
  baseSalary: number;
  nightShiftBonus: number;
  hazardPay: number;
  unhealthyPay: number;
  overtimeValue: number;
  grossSalary: number;
  benefits: number;
  fgts: number;
  commissions: number;
  awards: number;
  bonuses: number;
  variablePay: number;
  /** Custo mensal total para a empresa (bruto + FGTS + benefícios + variáveis). */
  companyCost: number;
  calc: RhPayrollCalc | null;
}

export function buildEmployeeCostBreakdown(
  employeeId: string,
  referenceMonth: string,
  salary: RhSalaryConfig | null,
  taxBrackets: { inss: RhTaxBracket[]; irrf: RhTaxBracket[] },
  commissions: number,
  awards: number,
  bonuses: number,
): RhEmployeeCostBreakdown {
  if (!salary) {
    return {
      employeeId,
      referenceMonth,
      hasSalaryConfig: false,
      baseSalary: 0,
      nightShiftBonus: 0,
      hazardPay: 0,
      unhealthyPay: 0,
      overtimeValue: 0,
      grossSalary: 0,
      benefits: 0,
      fgts: 0,
      commissions,
      awards,
      bonuses,
      variablePay: commissions + awards + bonuses,
      companyCost: commissions + awards + bonuses,
      calc: null,
    };
  }

  const calc = calcSalary(salary, taxBrackets);
  const variablePay = commissions + awards + bonuses;
  const companyCost = calc.grossSalary + calc.fgts + calc.totalBenefits + variablePay;

  return {
    employeeId,
    referenceMonth,
    hasSalaryConfig: true,
    baseSalary: salary.base_salary || 0,
    nightShiftBonus: salary.night_shift_bonus || 0,
    hazardPay: salary.hazard_pay || 0,
    unhealthyPay: salary.unhealthy_pay || 0,
    overtimeValue: calc.overtimeValue,
    grossSalary: calc.grossSalary,
    benefits: calc.totalBenefits,
    fgts: calc.fgts,
    commissions,
    awards,
    bonuses,
    variablePay,
    companyCost,
    calc,
  };
}

export function sumCostBreakdowns(rows: RhEmployeeCostBreakdown[]) {
  return rows.reduce(
    (acc, row) => ({
      baseSalary: acc.baseSalary + row.baseSalary,
      nightShiftBonus: acc.nightShiftBonus + row.nightShiftBonus,
      hazardPay: acc.hazardPay + row.hazardPay,
      unhealthyPay: acc.unhealthyPay + row.unhealthyPay,
      overtimeValue: acc.overtimeValue + row.overtimeValue,
      grossSalary: acc.grossSalary + row.grossSalary,
      benefits: acc.benefits + row.benefits,
      fgts: acc.fgts + row.fgts,
      commissions: acc.commissions + row.commissions,
      awards: acc.awards + row.awards,
      bonuses: acc.bonuses + row.bonuses,
      variablePay: acc.variablePay + row.variablePay,
      companyCost: acc.companyCost + row.companyCost,
      withConfig: acc.withConfig + (row.hasSalaryConfig ? 1 : 0),
    }),
    {
      baseSalary: 0,
      nightShiftBonus: 0,
      hazardPay: 0,
      unhealthyPay: 0,
      overtimeValue: 0,
      grossSalary: 0,
      benefits: 0,
      fgts: 0,
      commissions: 0,
      awards: 0,
      bonuses: 0,
      variablePay: 0,
      companyCost: 0,
      withConfig: 0,
    },
  );
}
