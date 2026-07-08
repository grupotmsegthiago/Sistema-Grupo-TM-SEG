import { supabase } from '../supabase';
import { buildBrazilTimestampFromHm, getBrazilDayBounds } from '../dateUtils';
import { extractUserIdFromToken } from '../rh/apiEmployeesAuth';
import { TIME_CLOCK_STAGE_LABELS, TIME_CLOCK_STAGE_ORDER } from './stages';
import type { TimeClockEntry, TimeClockStage } from './types';

function parseHmMinutes(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || '').trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function validateStageOrder(times: Partial<Record<TimeClockStage, string | null>>): void {
  let prev = -1;
  for (const stage of TIME_CLOCK_STAGE_ORDER) {
    const raw = times[stage];
    if (raw == null || !String(raw).trim()) continue;
    const mins = parseHmMinutes(String(raw));
    if (mins === null) {
      throw new Error(`Horário inválido em ${TIME_CLOCK_STAGE_LABELS[stage]} — use HH:MM`);
    }
    if (mins <= prev) {
      throw new Error('Horários devem seguir a ordem: entrada → saída almoço → retorno almoço → fim do expediente.');
    }
    prev = mins;
  }
}

export async function adjustTimeClockEntriesDirect(params: {
  userId: string;
  date: string;
  times: Partial<Record<TimeClockStage, string | null>>;
  note?: string;
}): Promise<TimeClockEntry[]> {
  const { userId, date, times, note } = params;
  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Informe colaborador e data válidos.');
  }

  validateStageOrder(times);

  const token = localStorage.getItem('authToken') || '';
  const callerId = extractUserIdFromToken(token);

  const { data: employee, error: empErr } = await supabase
    .from('rh_employees')
    .select('id, user_id, full_name')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (empErr) throw new Error(empErr.message);
  if (!employee) throw new Error('Colaborador CLT não encontrado ou sem login vinculado.');

  const { data: userRow } = await supabase.from('system_users').select('name').eq('id', userId).maybeSingle();
  const { data: callerRow } = callerId
    ? await supabase.from('system_users').select('name').eq('id', callerId).maybeSingle()
    : { data: null };

  const { start, end } = getBrazilDayBounds(date);
  const { data: existing, error: loadErr } = await supabase
    .from('time_clock')
    .select('*')
    .eq('user_id', userId)
    .gte('timestamp', start)
    .lte('timestamp', end);

  if (loadErr) throw new Error(loadErr.message);

  for (const stage of TIME_CLOCK_STAGE_ORDER) {
    const rawTime = times[stage];
    const hasTime = rawTime != null && String(rawTime).trim() !== '';
    const existingEntry = (existing || []).find((e) => e.type === stage);

    if (!hasTime) {
      if (existingEntry?.id) {
        const { error: delErr } = await supabase.from('time_clock').delete().eq('id', existingEntry.id);
        if (delErr) throw new Error(delErr.message);
      }
      continue;
    }

    const timestamp = buildBrazilTimestampFromHm(date, String(rawTime).trim());
    const metadata = {
      ...(typeof existingEntry?.metadata === 'object' && existingEntry?.metadata ? existingEntry.metadata : {}),
      adjusted: true,
      adjusted_at: new Date().toISOString(),
      adjusted_by: callerId,
      adjusted_by_name: callerRow?.name || 'RH',
      adjust_note: note?.trim() || null,
      source: 'rh-adjust-direct',
    };

    if (existingEntry?.id) {
      const { error: updErr } = await supabase
        .from('time_clock')
        .update({ timestamp, metadata })
        .eq('id', existingEntry.id);
      if (updErr) throw new Error(updErr.message);
    } else {
      const { error: insErr } = await supabase.from('time_clock').insert([
        {
          user_id: userId,
          employee_id: employee.id,
          user_name: userRow?.name || employee.full_name || 'Colaborador',
          type: stage,
          timestamp,
          latitude: null,
          longitude: null,
          photo_url: null,
          signature_url: null,
          ai_verification: false,
          metadata,
        },
      ]);
      if (insErr) throw new Error(insErr.message);
    }
  }

  const { data: refreshed, error: refreshErr } = await supabase
    .from('time_clock')
    .select('*')
    .eq('user_id', userId)
    .gte('timestamp', start)
    .lte('timestamp', end)
    .order('timestamp', { ascending: true });

  if (refreshErr) throw new Error(refreshErr.message);
  return (refreshed || []) as TimeClockEntry[];
}
