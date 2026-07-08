import { supabase } from '../supabase';
import { calcSalary } from './payroll';
import type { RhSalaryConfig, RhTaxBracket } from '../../types/rh';

export async function generatePayrollClient(referenceMonth: string) {
  const { data: taxes } = await supabase.from('rh_tax_brackets').select('*').eq('active', true);
  const rows = (taxes || []) as RhTaxBracket[];
  const taxBrackets = {
    inss: rows.filter((r) => r.tax_type === 'INSS'),
    irrf: rows.filter((r) => r.tax_type === 'IRRF'),
  };

  const { data: employees } = await supabase.from('rh_employees')
    .select('id, full_name, position_id, rh_positions(name)')
    .eq('status', 'Ativo').is('deleted_at', null);

  const { data: run, error: runErr } = await supabase.from('rh_payroll_runs').insert([{
    reference_month: referenceMonth,
    status: 'Gerada',
  }]).select().single();
  if (runErr) throw runErr;

  const items: any[] = [];
  let totalGross = 0;
  let totalNet = 0;

  for (const emp of employees || []) {
    const { data: salary } = await supabase.from('rh_salary_configs')
      .select('*').eq('employee_id', emp.id).is('deleted_at', null)
      .order('effective_from', { ascending: false }).limit(1).maybeSingle();
    if (!salary) continue;

    const calc = calcSalary(salary as RhSalaryConfig, taxBrackets);
    const [{ data: commissions }, { data: awards }, { data: bonuses }] = await Promise.all([
      supabase.from('rh_commissions').select('commission_amount').eq('employee_id', emp.id).eq('reference_month', referenceMonth).is('deleted_at', null),
      supabase.from('rh_awards').select('amount').eq('employee_id', emp.id).is('deleted_at', null),
      supabase.from('rh_bonuses').select('amount').eq('employee_id', emp.id).eq('reference_month', referenceMonth).is('deleted_at', null),
    ]);

    const commission = (commissions || []).reduce((s, c) => s + Number(c.commission_amount || 0), 0);
    const awardsSum = (awards || []).reduce((s, a) => s + Number(a.amount || 0), 0);
    const bonusesSum = (bonuses || []).reduce((s, b) => s + Number(b.amount || 0), 0);
    const totalPay = calc.netSalary + commission + awardsSum + bonusesSum;

    items.push({
      payroll_run_id: run.id,
      employee_id: emp.id,
      base_salary: salary.base_salary,
      commission,
      awards: awardsSum,
      bonuses: bonusesSum,
      overtime: calc.overtimeValue,
      additions: (salary.night_shift_bonus || 0) + (salary.hazard_pay || 0) + (salary.unhealthy_pay || 0),
      benefits: calc.totalBenefits,
      discounts: calc.totalDiscounts,
      inss: calc.inss,
      irrf: calc.irrf,
      fgts: calc.fgts,
      net_salary: calc.netSalary,
      total_pay: totalPay,
      details_json: { employee_name: emp.full_name, position: (emp as any).rh_positions?.name },
    });

    totalGross += calc.grossSalary + commission + awardsSum + bonusesSum;
    totalNet += totalPay;
  }

  if (items.length) await supabase.from('rh_payroll_items').insert(items);
  await supabase.from('rh_payroll_runs').update({ total_gross: totalGross, total_net: totalNet }).eq('id', run.id);

  return { runId: run.id, items: items.length, totalGross, totalNet };
}
