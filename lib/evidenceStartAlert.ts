/** Cobra o print de início enquanto a OS já começou e ainda não tem evidência. */
export const EVIDENCE_NAG_MS = 60 * 60 * 1000;
export const EVIDENCE_NAG_STORAGE_KEY = 'tmseg-evidence-start-nag-at';

export const EVIDENCE_NAG_OPEN_STATUSES = [
  'Solicitada',
  'Documentação',
  'Agendada',
  'Origem',
  'Em Viagem',
  'Pendente',
] as const;

export function evidenceNagIsDue(stored: string | null | undefined, now: number, interval = EVIDENCE_NAG_MS): boolean {
  if (!stored) return true;
  const at = Number(stored);
  if (!Number.isFinite(at)) return true;
  return now - at >= interval;
}

export function missionNeedsStartEvidence(input: {
  status?: string | null;
  startTime?: string | null;
  hasEvidence: boolean;
  nowMs: number;
  todayStartMs: number;
}): boolean {
  if (input.hasEvidence) return false;
  const status = String(input.status || '');
  if (status === 'Cancelada' || status === 'Recusada') return false;
  const start = input.startTime ? new Date(input.startTime).getTime() : NaN;
  if (!Number.isFinite(start) || start > input.nowMs) return false;
  if ((EVIDENCE_NAG_OPEN_STATUSES as readonly string[]).includes(status)) return true;
  if (status === 'Concluída' || status === 'Concluida') return start >= input.todayStartMs;
  return false;
}
