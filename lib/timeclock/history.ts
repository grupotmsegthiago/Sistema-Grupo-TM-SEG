import { supabase } from '../supabase';
import type { TimeClockEntry } from './types';

export interface CltEmployeeOption {
  id: string;
  user_id: string | null;
  full_name: string;
  matricula: string | null;
}

export async function fetchCltEmployeesForHistory(): Promise<CltEmployeeOption[]> {
  const { data, error } = await supabase
    .from('rh_employees')
    .select('id, user_id, full_name, matricula')
    .eq('contract_type', 'CLT')
    .eq('status', 'Ativo')
    .is('deleted_at', null)
    .order('full_name');

  if (error) throw error;
  return (data || []) as CltEmployeeOption[];
}

export async function fetchTimeClockHistory(params: {
  startDate: string;
  endDate: string;
  userId?: string;
}): Promise<TimeClockEntry[]> {
  let query = supabase
    .from('time_clock')
    .select('*')
    .gte('timestamp', `${params.startDate}T00:00:00`)
    .lte('timestamp', `${params.endDate}T23:59:59`);

  if (params.userId) {
    query = query.eq('user_id', params.userId);
  }

  const { data, error } = await query.order('timestamp', { ascending: false });
  if (error) throw error;
  return (data || []) as TimeClockEntry[];
}

export function groupHistoryByEmployee(
  logs: TimeClockEntry[]
): { userId: string; userName: string; entries: TimeClockEntry[] }[] {
  const map = new Map<string, { userId: string; userName: string; entries: TimeClockEntry[] }>();
  for (const log of logs) {
    const existing = map.get(log.user_id);
    if (existing) {
      existing.entries.push(log);
    } else {
      map.set(log.user_id, {
        userId: log.user_id,
        userName: log.user_name,
        entries: [log],
      });
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.userName.localeCompare(b.userName, 'pt-BR')
  );
}
