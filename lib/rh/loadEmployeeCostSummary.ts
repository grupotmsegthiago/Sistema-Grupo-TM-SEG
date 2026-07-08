import type { SupabaseClient } from '@supabase/supabase-js';
import { buildEmployeeCostBreakdown, sumCostBreakdowns } from './employeeCostSummary';
import { TMSEG_EMPLOYEE_SEED } from './seedTmsegEmployees';
import type { RhSalaryConfig, RhTaxBracket } from '../../types/rh';

const SEED_BY_MATRICULA = new Map(TMSEG_EMPLOYEE_SEED.map((r) => [r.matricula, r]));

async function loadTaxBrackets(sb: SupabaseClient) {
  let { data } = await sb.from('rh_tax_brackets').select('*').eq('active', true).eq('year', 2026);
  if (!data?.length) {
    const fallback = await sb.from('rh_tax_brackets').select('*').eq('active', true);
    data = fallback.data;
  }
  const rows = (data || []) as RhTaxBracket[];
  return {
    inss: rows.filter((r) => r.tax_type === 'INSS'),
    irrf: rows.filter((r) => r.tax_type === 'IRRF'),
  };
}

export function resolveSalaryConfig(
  employeeId: string,
  matricula: string | null | undefined,
  salaryRow: RhSalaryConfig | null,
  positionBaseSalary?: number | null,
): RhSalaryConfig | null {
  const seed = matricula ? SEED_BY_MATRICULA.get(matricula) : undefined;
  const baseFromDb = salaryRow?.base_salary || 0;
  const baseFromSeed = seed?.salary || 0;
  const baseFromPosition = positionBaseSalary || 0;
  const base = baseFromDb || baseFromSeed || baseFromPosition;
  if (base <= 0) return salaryRow;

  return {
    employee_id: employeeId,
    fgts_pct: 8,
    overtime_rate_pct: 50,
    ...(salaryRow || {}),
    base_salary: base,
  };
}

export function resolveMonthlyPremio(matricula: string | null | undefined, awardsFromDb: number): number {
  if (awardsFromDb > 0) return awardsFromDb;
  const seed = matricula ? SEED_BY_MATRICULA.get(matricula) : undefined;
  if (!seed?.premio || seed.premio === 'variável') return 0;
  return seed.premio;
}

export async function loadEmployeeCostSummary(sb: SupabaseClient, month: string) {
  const [{ data: employees }, taxBrackets] = await Promise.all([
    sb
      .from('rh_employees')
      .select('id, matricula, contract_type, position_id, rh_positions(base_salary)')
      .is('deleted_at', null)
      .neq('status', 'Desligado'),
    loadTaxBrackets(sb),
  ]);

  const employeeRows = employees || [];
  const employeeIds = employeeRows.map((e) => e.id);
  if (!employeeIds.length) {
    return { ok: true as const, referenceMonth: month, items: [], totals: sumCostBreakdowns([]) };
  }

  const [{ data: salaryRows }, { data: commissionRows }, { data: awardRows }, { data: bonusRows }] = await Promise.all([
    sb
      .from('rh_salary_configs')
      .select('*')
      .in('employee_id', employeeIds)
      .is('deleted_at', null)
      .order('effective_from', { ascending: false }),
    sb
      .from('rh_commissions')
      .select('employee_id, commission_amount')
      .in('employee_id', employeeIds)
      .eq('reference_month', month)
      .is('deleted_at', null),
    sb
      .from('rh_awards')
      .select('employee_id, amount, award_date, name')
      .in('employee_id', employeeIds)
      .is('deleted_at', null),
    sb
      .from('rh_bonuses')
      .select('employee_id, amount')
      .in('employee_id', employeeIds)
      .eq('reference_month', month)
      .is('deleted_at', null),
  ]);

  const salaryByEmployee = new Map<string, RhSalaryConfig>();
  for (const row of salaryRows || []) {
    if (!salaryByEmployee.has(row.employee_id)) {
      salaryByEmployee.set(row.employee_id, row as RhSalaryConfig);
    }
  }

  const sumByEmployee = (rows: { employee_id: string; [key: string]: unknown }[] | null, field: string) => {
    const map = new Map<string, number>();
    for (const row of rows || []) {
      const id = row.employee_id;
      map.set(id, (map.get(id) || 0) + Number(row[field] || 0));
    }
    return map;
  };

  const monthPrefix = month.slice(0, 7);
  const awardsByEmployee = new Map<string, number>();
  for (const row of awardRows || []) {
    const id = row.employee_id;
    const awardMonth = String((row as any).award_date || '').slice(0, 7);
    const isRecurringPremio = String((row as any).name || '').toLowerCase() === 'premiação'
      || String((row as any).name || '').toLowerCase() === 'premiacao';
    if (!isRecurringPremio && awardMonth && awardMonth !== monthPrefix) continue;
    awardsByEmployee.set(id, (awardsByEmployee.get(id) || 0) + Number(row.amount || 0));
  }

  const commissionsMap = sumByEmployee(commissionRows as any, 'commission_amount');
  const bonusesMap = sumByEmployee(bonusRows as any, 'amount');

  const items = employeeRows.map((emp) => {
    const positionBase = (emp as any).rh_positions?.base_salary;
    const salary = resolveSalaryConfig(
      emp.id,
      emp.matricula,
      salaryByEmployee.get(emp.id) || null,
      positionBase,
    );
    const awards = resolveMonthlyPremio(emp.matricula, awardsByEmployee.get(emp.id) || 0);
    const commissions = commissionsMap.get(emp.id) || 0;
    const bonuses = bonusesMap.get(emp.id) || 0;
    const seed = emp.matricula ? SEED_BY_MATRICULA.get(emp.matricula) : undefined;
    const contractType = (emp as { contract_type?: string }).contract_type || seed?.contract_type;

    return buildEmployeeCostBreakdown(
      emp.id,
      month,
      salary,
      taxBrackets,
      commissions,
      awards,
      bonuses,
      contractType,
    );
  });

  return {
    ok: true as const,
    referenceMonth: month,
    items,
    totals: sumCostBreakdowns(items),
  };
}
