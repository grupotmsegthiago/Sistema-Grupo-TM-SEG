import type { SupabaseClient } from '@supabase/supabase-js';
import {
  TMSEG_COMPANY,
  TMSEG_EMPLOYEE_SEED,
  buildEmployeeNotes,
  inferStatus,
  mapContractType,
  type TmsegEmployeeSeedRow,
} from './seedTmsegEmployees';

export interface SeedEmployeesResult {
  ok: boolean;
  created: number;
  updated: number;
  salaries: number;
  awards: number;
  errors: string[];
  employees: { matricula: string; full_name: string; id: string }[];
}

async function ensureDepartment(sb: SupabaseClient): Promise<string> {
  const { data: existing } = await sb.from('rh_departments')
    .select('id')
    .eq('name', TMSEG_COMPANY)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data, error } = await sb.from('rh_departments')
    .insert([{ name: TMSEG_COMPANY, code: 'TMSEG', active: true, created_by: 'seed-rh' }])
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function ensurePosition(sb: SupabaseClient, name: string, departmentId: string): Promise<string> {
  const { data: existing } = await sb.from('rh_positions')
    .select('id')
    .eq('name', name)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data, error } = await sb.from('rh_positions')
    .insert([{ name, department_id: departmentId, active: true }])
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function upsertEmployee(
  sb: SupabaseClient,
  row: TmsegEmployeeSeedRow,
  departmentId: string,
  positionId: string,
): Promise<{ id: string; created: boolean }> {
  const payload = {
    full_name: row.full_name,
    matricula: row.matricula,
    admission_date: row.admission_date,
    probation_end_date: row.exp90,
    contract_type: mapContractType(row),
    position_id: positionId,
    department_id: departmentId,
    status: inferStatus(row.admission_date),
    notes: buildEmployeeNotes(row),
    cost_center: TMSEG_COMPANY,
    updated_by: 'seed-rh',
  };

  const { data: existing } = await sb.from('rh_employees')
    .select('id')
    .eq('matricula', row.matricula)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await sb.from('rh_employees').update(payload).eq('id', existing.id);
    if (error) throw error;
    return { id: existing.id, created: false };
  }

  const { data, error } = await sb.from('rh_employees')
    .insert([{ ...payload, created_by: 'seed-rh' }])
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id, created: true };
}

async function upsertSalary(sb: SupabaseClient, employeeId: string, baseSalary: number, effectiveFrom: string | null) {
  const { data: existing } = await sb.from('rh_salary_configs')
    .select('id')
    .eq('employee_id', employeeId)
    .is('deleted_at', null)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  const payload = {
    employee_id: employeeId,
    base_salary: baseSalary,
    effective_from: effectiveFrom || new Date().toISOString().slice(0, 10),
    created_by: 'seed-rh',
    updated_by: 'seed-rh',
  };

  if (existing?.id) {
    await sb.from('rh_salary_configs').update(payload).eq('id', existing.id);
    return;
  }
  await sb.from('rh_salary_configs').insert([payload]);
}

async function upsertPremio(sb: SupabaseClient, employeeId: string, row: TmsegEmployeeSeedRow) {
  if (row.premio === null) return;

  const amount = row.premio === 'variável' ? 0 : row.premio;
  const description = row.premio === 'variável' ? 'Premiação variável (planilha)' : 'Premiação mensal (planilha)';

  const { data: existing } = await sb.from('rh_awards')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('name', 'Premiação')
    .is('deleted_at', null)
    .maybeSingle();

  const payload = {
    employee_id: employeeId,
    name: 'Premiação',
    amount,
    description,
    award_date: row.admission_date || new Date().toISOString().slice(0, 10),
    reason: 'Importação planilha TM SEG',
    responsible: 'Sistema',
    status: 'Pendente',
  };

  if (existing?.id) {
    await sb.from('rh_awards').update(payload).eq('id', existing.id);
    return;
  }
  await sb.from('rh_awards').insert([payload]);
}

/** Importa os 12 funcionários da planilha TM SEGURANÇA. Idempotente por matrícula. */
export async function seedTmsegEmployees(sb: SupabaseClient): Promise<SeedEmployeesResult> {
  const result: SeedEmployeesResult = {
    ok: true,
    created: 0,
    updated: 0,
    salaries: 0,
    awards: 0,
    errors: [],
    employees: [],
  };

  const departmentId = await ensureDepartment(sb);
  const positionCache = new Map<string, string>();

  for (const row of TMSEG_EMPLOYEE_SEED) {
    try {
      let positionId = positionCache.get(row.position);
      if (!positionId) {
        positionId = await ensurePosition(sb, row.position, departmentId);
        positionCache.set(row.position, positionId);
      }

      const { id, created } = await upsertEmployee(sb, row, departmentId, positionId);
      if (created) result.created++;
      else result.updated++;

      await upsertSalary(sb, id, row.salary, row.admission_date);
      result.salaries++;

      await upsertPremio(sb, id, row);
      if (row.premio !== null) result.awards++;

      result.employees.push({ matricula: row.matricula, full_name: row.full_name, id });
    } catch (e: any) {
      result.ok = false;
      result.errors.push(`${row.matricula} ${row.full_name}: ${e?.message || e}`);
    }
  }

  return result;
}
