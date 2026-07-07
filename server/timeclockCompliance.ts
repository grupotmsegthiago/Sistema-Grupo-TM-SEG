import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluateTimeclockGate, type TimeClockEntry } from '../lib/timeclockGate';

export interface TimeclockUser {
  id: string;
  role?: string;
  user_type?: string | null;
  client_id?: string | null;
}

async function columnExists(sb: SupabaseClient, table: string, column: string): Promise<boolean> {
  const { error } = await sb.from(table).select(column, { head: true }).limit(1);
  return !error || !String(error.message).includes('does not exist');
}

export async function userRequiresTimeClock(sb: SupabaseClient, user: TimeclockUser): Promise<boolean> {
  if (user.user_type && user.user_type !== 'internal') return false;
  if (user.client_id) return false;

  if (await columnExists(sb, 'system_users', 'requires_time_clock')) {
    const { data } = await sb.from('system_users').select('requires_time_clock').eq('id', user.id).maybeSingle();
    if (data?.requires_time_clock === true) return true;
  }

  if (await columnExists(sb, 'rh_employees', 'requires_time_clock')) {
    const { data } = await sb
      .from('rh_employees')
      .select('requires_time_clock, status')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (data?.requires_time_clock === true && data.status === 'Ativo') return true;
  }

  return false;
}

function todayStartIso(): string {
  const now = new Date();
  const brDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
  return `${brDate}T00:00:00`;
}

export async function getTimeclockCompliance(sb: SupabaseClient, user: TimeclockUser) {
  const requiresClock = await userRequiresTimeClock(sb, user);
  if (!requiresClock) {
    return {
      required: false,
      requires_clock: false,
      mode: 'skip' as const,
      currentStage: 'IN' as const,
      message: '',
      title: '',
      dayComplete: false,
      history: [] as TimeClockEntry[],
    };
  }

  const { data: rows } = await sb
    .from('time_clock')
    .select('type, timestamp')
    .eq('user_id', user.id)
    .gte('timestamp', todayStartIso())
    .order('timestamp', { ascending: true });

  const history: TimeClockEntry[] = (rows || []).map((r) => ({
    type: r.type,
    timestamp: r.timestamp,
  }));

  const state = evaluateTimeclockGate(true, history);

  return {
    required: state.required,
    requires_clock: true,
    mode: state.mode,
    currentStage: state.currentStage,
    message: state.message,
    title: state.title,
    dayComplete: state.dayComplete,
    history,
  };
}
