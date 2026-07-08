import { formatIsoDateBR } from '../dateUtils';
import type { TimeClockEntry } from './types';

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchTimeClockEntriesFromApi(params: {
  startDate: string;
  endDate: string;
  userId?: string;
}): Promise<TimeClockEntry[]> {
  const qs = new URLSearchParams({
    start: params.startDate,
    end: params.endDate,
  });
  if (params.userId) qs.set('userId', params.userId);

  const res = await fetch(`/api/rh/timeclock/entries?${qs.toString()}`, {
    headers: authHeaders(),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(res.ok ? 'Resposta inválida do servidor' : `Erro do servidor (${res.status})`);
  }

  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `Erro ao carregar ponto (${res.status})`);
  }

  return (json.entries || []) as TimeClockEntry[];
}

export async function fetchTodayTimeClockEntriesFromApi(userId: string): Promise<TimeClockEntry[]> {
  const today = formatIsoDateBR();
  const entries = await fetchTimeClockEntriesFromApi({
    startDate: today,
    endDate: today,
    userId,
  });
  return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
