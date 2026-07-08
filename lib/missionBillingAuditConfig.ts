import type { Mission } from '../types';

/** Início do período de auditoria financeira (jun/2026). OS anteriores ficam fora do escopo. */
export const BILLING_AUDIT_MIN_START = '2026-06-01';

const endOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

export function getBillingAuditMinStart(): Date {
  return new Date(`${BILLING_AUDIT_MIN_START}T00:00:00-03:00`);
}

/** Janela padrão do batch: 01/06/2026 até hoje (horário local). */
export function getBillingAuditBatchDateRange(asOf: Date = new Date()): [Date, Date] {
  return [getBillingAuditMinStart(), endOfDay(asOf)];
}

function missionReferenceDate(mission: Mission | Record<string, unknown>): Date | null {
  const ref =
    (mission as any).startTime ??
    (mission as any).start_time ??
    (mission as any).createdAt ??
    (mission as any).created_at;
  if (!ref) return null;
  const d = new Date(ref);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Missão entra na auditoria se start_time (ou created_at) >= 01/06/2026.
 * `untilInclusive` limita o fim (batch/script); omitido = sem teto (novas OS futuras).
 */
export function missionEligibleForBillingAudit(
  mission: Mission | Record<string, unknown>,
  untilInclusive?: Date,
): boolean {
  const refDate = missionReferenceDate(mission);
  if (!refDate) return false;
  const t = refDate.getTime();
  if (t < getBillingAuditMinStart().getTime()) return false;
  if (untilInclusive && t > endOfDay(untilInclusive).getTime()) return false;
  return true;
}

export function filterMissionsForBillingAudit<T extends Mission | Record<string, unknown>>(
  missions: T[],
  untilInclusive?: Date,
): T[] {
  return missions.filter((m) => missionEligibleForBillingAudit(m, untilInclusive));
}

/** Status em que a auditoria financeira deve rodar (OS encerrada). */
export function isTerminalMissionStatusForAudit(status: string | undefined | null): boolean {
  const s = String(status || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return s.includes('CONCLU') || s.includes('RECUS') || s.includes('CANCEL');
}

/** OS ainda em operação (viagem, origem, documentação, agendada, etc.). */
export function isInProgressMissionStatus(status: string | undefined | null): boolean {
  return !isTerminalMissionStatusForAudit(status);
}
