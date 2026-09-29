/**
 * Logout obrigatório após inatividade (funcionários e administradores).
 * Diretoria/CEO ficam isentos.
 * Na vigia noturna o limite é mais curto (NIGHT_FORCE_LOGOUT).
 */

import {
  isNightWatchActive,
  isNightWatchExemptRole,
  NIGHT_FORCE_LOGOUT_MINUTES,
  NIGHT_FORCE_LOGOUT_MS,
} from './nightWatch';

/** Minutos sem interação real (diurno) antes de forçar novo login. */
export const SESSION_IDLE_LOGOUT_MINUTES = 30;
export const SESSION_IDLE_LOGOUT_MS = SESSION_IDLE_LOGOUT_MINUTES * 60 * 1000;

export const LOGOUT_REASON_IDLE_KEY = 'tmseg:logout_reason';
export const LOGOUT_REASON_IDLE_30MIN = 'idle_30min';
export const LOGOUT_REASON_NIGHT_IDLE = 'night_idle';
export const LOGOUT_REASON_NIGHT_CHALLENGE = 'night_challenge_timeout';

/** true se o perfil deve ser deslogado após o limite de ociosidade. */
export function shouldEnforceSessionIdleLogout(role: string | null | undefined): boolean {
  return !isNightWatchExemptRole(role);
}

/** Limite vigente: 20 min na vigia noturna ativa; 30 min no restante do dia. */
export function getIdleLogoutThresholdMs(now: Date = new Date()): number {
  return isNightWatchActive(now) ? NIGHT_FORCE_LOGOUT_MS : SESSION_IDLE_LOGOUT_MS;
}

export function getIdleLogoutThresholdMinutes(now: Date = new Date()): number {
  return isNightWatchActive(now) ? NIGHT_FORCE_LOGOUT_MINUTES : SESSION_IDLE_LOGOUT_MINUTES;
}

export function isIdleLogoutDue(idleMs: number, now: Date = new Date()): boolean {
  return idleMs >= getIdleLogoutThresholdMs(now);
}

export function idleLogoutReasonKey(now: Date = new Date()): string {
  return isNightWatchActive(now) ? LOGOUT_REASON_NIGHT_IDLE : LOGOUT_REASON_IDLE_30MIN;
}
