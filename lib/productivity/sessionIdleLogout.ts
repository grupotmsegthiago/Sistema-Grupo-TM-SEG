/**
 * Logout obrigatório após inatividade (funcionários).
 * Diretoria/admin ficam isentos (mesma regra da vigia noturna).
 */

import { isNightWatchExemptRole } from './nightWatch';

/** Minutos sem interação real antes de forçar novo login. */
export const SESSION_IDLE_LOGOUT_MINUTES = 30;
export const SESSION_IDLE_LOGOUT_MS = SESSION_IDLE_LOGOUT_MINUTES * 60 * 1000;

export const LOGOUT_REASON_IDLE_KEY = 'tmseg:logout_reason';
export const LOGOUT_REASON_IDLE_30MIN = 'idle_30min';

/** true se o perfil deve ser deslogado após SESSION_IDLE_LOGOUT_MS. */
export function shouldEnforceSessionIdleLogout(role: string | null | undefined): boolean {
  return !isNightWatchExemptRole(role);
}

export function isIdleLogoutDue(idleMs: number): boolean {
  return idleMs >= SESSION_IDLE_LOGOUT_MS;
}
