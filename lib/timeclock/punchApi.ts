import type { TimeClockEntry, TimeClockStage, TimeClockUserContext } from './types';

export interface PunchApiPayload {
  stage: TimeClockStage;
  photoBase64: string;
  signatureUrl: string;
  latitude?: number | null;
  longitude?: number | null;
}

export async function registerTimeClockPunchViaApi(
  input: PunchApiPayload,
): Promise<TimeClockEntry> {
  const token = localStorage.getItem('authToken') || '';
  const res = await fetch('/api/rh/timeclock/punch', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || `Falha ao registrar ponto (${res.status})`);
  }
  return json.entry as TimeClockEntry;
}
