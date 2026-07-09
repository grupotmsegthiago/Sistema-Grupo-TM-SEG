import { supabase } from '../supabase';
import { getBrazilDayBounds } from '../dateUtils';
import type { TimeClockEntry } from './types';

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchFromSupabase(params: {
  startDate: string;
  endDate: string;
  userId?: string;
}): Promise<TimeClockEntry[]> {
  const sameDay = params.startDate === params.endDate;
  let query = supabase.from('time_clock').select('*');

  if (sameDay) {
    const { start, end } = getBrazilDayBounds(params.startDate);
    query = query.gte('timestamp', start).lte('timestamp', end);
  } else {
    const startBounds = getBrazilDayBounds(params.startDate);
    const endBounds = getBrazilDayBounds(params.endDate);
    query = query.gte('timestamp', startBounds.start).lte('timestamp', endBounds.end);
  }

  if (params.userId) {
    query = query.eq('user_id', params.userId);
  }

  const { data, error } = await query.order('timestamp', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as TimeClockEntry[];
}

export async function fetchTimeClockEntriesFromApi(params: {
  startDate: string;
  endDate: string;
  userId?: string;
}): Promise<TimeClockEntry[]> {
  try {
    const qs = new URLSearchParams({
      start: params.startDate,
      end: params.endDate,
    });
    if (params.userId) qs.set('userId', params.userId);

    const res = await fetch(`/api/rh/timeclock/entries?${qs.toString()}`, {
      headers: authHeaders(),
    });

    const text = await res.text();
    let json: { ok?: boolean; error?: string; entries?: TimeClockEntry[] } | null = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(res.ok ? 'Resposta inválida do servidor' : `Erro do servidor (${res.status})`);
    }

    if (!res.ok || !json?.ok) {
      throw new Error(json?.error || `Erro ao carregar ponto (${res.status})`);
    }

    return (json.entries || []) as TimeClockEntry[];
  } catch (apiErr) {
    try {
      return await fetchFromSupabase(params);
    } catch (supabaseErr) {
      const apiMsg = apiErr instanceof Error ? apiErr.message : 'Falha na API';
      const sbMsg = supabaseErr instanceof Error ? supabaseErr.message : 'Falha no Supabase';
      throw new Error(sbMsg || apiMsg);
    }
  }
}

export async function fetchTodayTimeClockEntriesFromApi(
  userId: string,
  options?: { shiftType?: string | null },
): Promise<TimeClockEntry[]> {
  const { formatIsoDateBR } = await import('../dateUtils');
  const { fetchActiveShiftEntries } = await import('./shiftEntries');

  const fetchDay = async (uid: string, isoDate: string) => {
    const entries = await fetchTimeClockEntriesFromApi({
      startDate: isoDate,
      endDate: isoDate,
      userId: uid,
    });
    return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  };

  return fetchActiveShiftEntries(userId, fetchDay, options?.shiftType);
}
