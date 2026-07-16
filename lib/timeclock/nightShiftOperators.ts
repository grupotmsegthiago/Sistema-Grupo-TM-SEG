import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeShiftType, type ShiftType } from './shiftRules';

/** Operadores de plantão noturno (monitoramento) — turno deve ser noturno, não diurno. */
export function isNightShiftOperatorName(fullName: string | null | undefined): boolean {
  const n = String(fullName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  if (!n) return false;
  if (n.includes('moacir')) return true;
  // Cris = Cristiane Aurora (plantão). Não confundir com Michelle Cristiane (diurno).
  if (n.includes('michelle')) return false;
  if (n.includes('cristiane aurora') || n.includes('aurora da silva')) return true;
  if (/\bcris\b/.test(n)) return true;
  return false;
}

/** Turno efetivo em memória (sem depender de UPDATE no RH). */
export function resolveShiftTypeForEmployee(
  employee: { full_name?: string | null; shift_type?: string | null } | null | undefined,
): ShiftType {
  if (!employee) return 'diurno';
  if (isNightShiftOperatorName(employee.full_name)) return 'noturno';
  return normalizeShiftType(employee.shift_type);
}

/**
 * Garante shift_type noturno no RH para operadores de plantão.
 * Corrige cadastro legado com default diurno da migration inicial.
 * Sempre retorna noturno para esses nomes, mesmo se o UPDATE falhar (ex.: RLS no client).
 */
export async function ensureNightShiftOperatorRecord(
  sb: SupabaseClient,
  employee: { id: string; full_name?: string | null; shift_type?: string | null },
): Promise<'noturno' | 'diurno'> {
  if (!isNightShiftOperatorName(employee.full_name)) {
    return normalizeShiftType(employee.shift_type);
  }
  if (normalizeShiftType(employee.shift_type) === 'noturno') return 'noturno';

  const { error } = await sb
    .from('rh_employees')
    .update({
      shift_type: 'noturno',
      requires_timeclock: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', employee.id);

  if (error) {
    console.warn('[nightShiftOperators] Falha ao atualizar turno:', error.message);
  }

  return 'noturno';
}
