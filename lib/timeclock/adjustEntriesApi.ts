import type { TimeClockEntry, TimeClockStage } from './types';
import { adjustTimeClockEntriesDirect } from './adjustEntriesDirect';

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function adjustTimeClockEntriesApi(params: {
  userId: string;
  date: string;
  times: Partial<Record<TimeClockStage, string | null>>;
  note?: string;
}): Promise<TimeClockEntry[]> {
  try {
    const res = await fetch('/api/rh/timeclock/adjust', {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    const text = await res.text();
    let json: { ok?: boolean; error?: string; entries?: TimeClockEntry[] } | null = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(res.ok ? 'Resposta inválida do servidor' : `Erro do servidor (${res.status})`);
    }

    if (!res.ok || !json?.ok) {
      throw new Error(json?.error || `Erro ao ajustar ponto (${res.status})`);
    }

    return (json.entries || []) as TimeClockEntry[];
  } catch (apiErr) {
    try {
      return await adjustTimeClockEntriesDirect(params);
    } catch (directErr) {
      const apiMsg = apiErr instanceof Error ? apiErr.message : 'Falha na API';
      const directMsg = directErr instanceof Error ? directErr.message : 'Falha no Supabase';
      throw new Error(directMsg || apiMsg);
    }
  }
}
