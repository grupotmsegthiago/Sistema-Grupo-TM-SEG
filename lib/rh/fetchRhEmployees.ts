import { authFetch } from '../authFetch';
import { supabase } from '../supabase';
import type { RhEmployee } from '../../types/rh';

const RLS_HINT =
  'Nenhum funcionário no banco. Use o botão "Importar planilha TM SEG (12)" ou execute scripts/seed-rh-employees.sql no Supabase.';

export async function fetchRhEmployees(): Promise<{ rows: RhEmployee[]; error?: string }> {
  try {
    const res = await authFetch('/api/rh/employees');
    const json = await res.json().catch(() => ({}));
    if (res.ok && json?.ok !== false && Array.isArray(json?.employees)) {
      return { rows: json.employees as RhEmployee[] };
    }
  } catch {
    /* fallback direto no Supabase */
  }

  const { data, error } = await supabase
    .from('rh_employees')
    .select('*, rh_positions(name), rh_departments(name)')
    .is('deleted_at', null)
    .order('full_name');

  if (error) {
    return { rows: [], error: error.message };
  }

  const rows = (data as RhEmployee[]) || [];
  if (rows.length === 0) {
    return { rows: [], error: RLS_HINT };
  }

  return { rows };
}
