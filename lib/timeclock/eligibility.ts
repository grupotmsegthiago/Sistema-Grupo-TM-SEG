import type { TimeClockEntry, TimeClockUserContext } from './types';
import { getNextTimeClockStage } from './stages';
import { isCltContractType, isEmployeeEligibleForTimeClock } from './cltEmployee';

const DIRETORIA_ROLES = new Set(['diretoria', 'diretor', 'diretor(a)']);

export function isDiretoriaRole(role: string | null | undefined): boolean {
  return DIRETORIA_ROLES.has(String(role || '').trim().toLowerCase());
}

/** Funcionário RH deve bater ponto (CLT elegível, PJ marcado, ou flag explícita). */
export function employeeRequiresTimeclock(employee: {
  contract_type?: string | null;
  status?: string | null;
  requires_timeclock?: boolean | null;
} | null | undefined): boolean {
  if (!employee) return false;
  if (employee.requires_timeclock === true) return true;
  return (
    isCltContractType(employee.contract_type) &&
    isEmployeeEligibleForTimeClock(employee.status)
  );
}

/** Usuário logado deve passar pelo fluxo de ponto. */
export function requiresTimeclockUser(user: TimeClockUserContext | null | undefined): boolean {
  if (!user?.id) return false;
  if (isDiretoriaRole((user as any).role)) return false;
  if (user.requiresTimeclock === true) return true;
  if (user.isClt === true) return true;
  return false;
}

export function hasFaceRegistered(user: TimeClockUserContext | null | undefined): boolean {
  return !!String(user?.facePhotoUrl || '').trim();
}

/** Ainda não bateu entrada (IN) hoje. */
export function needsEntryPunchToday(entries: Pick<TimeClockEntry, 'type'>[]): boolean {
  return getNextTimeClockStage(entries) === 'IN';
}

/** Jornada do dia já encerrada. */
export function isJourneyDoneToday(entries: Pick<TimeClockEntry, 'type'>[]): boolean {
  return getNextTimeClockStage(entries) === 'DONE';
}
