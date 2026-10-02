import type { TimeClockEntry, TimeClockUserContext } from './types';
import { getNextTimeClockStage } from './stages';
import { isCltContractType, isEmployeeEligibleForTimeClock } from './cltEmployee';

const DIRETORIA_ROLES = new Set(['diretoria', 'diretor', 'diretor(a)']);
const ADMIN_ROLES = new Set(['administrador', 'admin']);
const AVANCADO_ROLES = new Set(['avancado']);
const OPERATIONAL_ROLES = new Set(['operador', 'operacional']);

/** E-mails de gestão/auditoria isentos de batida de ponto no login. */
const TIMECLOCK_EXEMPT_EMAILS = new Set(['daniel@grupotmseg.com.br']);

function normalizeRole(role: string | null | undefined): string {
  return String(role || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isDiretoriaRole(role: string | null | undefined): boolean {
  return DIRETORIA_ROLES.has(normalizeRole(role));
}

/** Perfil Administrador não passa pela facial nem pelo ponto na entrada. */
export function isAdministradorRole(role: string | null | undefined): boolean {
  return ADMIN_ROLES.has(normalizeRole(role));
}

/** Perfil Avançado não passa pela facial nem pelo ponto na entrada. */
export function isAvancadoRole(role: string | null | undefined): boolean {
  return AVANCADO_ROLES.has(normalizeRole(role));
}

/** Daniel (auditor/coordenador) e perfis equivalentes não batem ponto. */
export function isTimeclockExemptUser(user: TimeClockUserContext | null | undefined): boolean {
  if (!user) return false;
  const role = (user as { role?: string }).role;
  if (isDiretoriaRole(role) || isAdministradorRole(role) || isAvancadoRole(role)) return true;
  const email = String(user.email || '').trim().toLowerCase();
  if (email && TIMECLOCK_EXEMPT_EMAILS.has(email)) return true;
  return false;
}

/** Perfis de campo que devem bater ponto mesmo sem vínculo CLT explícito no RH. */
export function isOperationalRole(role: string | null | undefined): boolean {
  return OPERATIONAL_ROLES.has(String(role || '').trim().toLowerCase());
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
  if (isTimeclockExemptUser(user)) return false;
  if (user.requiresTimeclock === true) return true;
  if (user.isClt === true) return true;
  if (isOperationalRole((user as any).role)) return true;
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
