/**
 * Regras de visibilidade da lista de OS (MissionTable).
 * Isolamento por cliente é client-side — admin/liberação financeira devem ver tudo.
 *
 * Administrador vê TODAS as OS (DHL ou não, aprovadas ou não, com ou sem
 * validação do auditor/Daniel). Não depende da fila de aprovação.
 */

import { isFinanceSupervisorName, normalizePersonName } from './financeSupervisorAccess';

export type MissionAccessUser = {
  role?: string | null;
  name?: string | null;
  permissions?: string[] | null;
  clientId?: string | null;
};

function normalizeRole(role: string | null | undefined): string {
  return String(role || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Perfil Administrador / Administradora (acentos e flexão). */
export function isAdministratorRole(role: string | null | undefined): boolean {
  const r = normalizeRole(role);
  return r === 'administrador' || r === 'administradora' || r.startsWith('administrador');
}

/** Administrador (ou acesso total / supervisão financeira) — libera OS para faturamento e vê todas. */
export function hasFullMissionListAccess(user: MissionAccessUser | null | undefined): boolean {
  if (!user) return false;
  if (Array.isArray(user.permissions) && user.permissions.includes('*')) return true;
  if (isAdministratorRole(user.role)) return true;
  // Bárbara / Giovanna — independente do rótulo exato do perfil no banco.
  if (isFinanceSupervisorName(user.name)) return true;
  // Nome “Administrador” em alguns logins antigos sem role preenchido.
  const nameNorm = normalizePersonName(user.name);
  if (nameNorm.includes('administrador')) return true;
  return false;
}

/**
 * Visão restrita a cliente (portal / client_view / comercial com carteira).
 * Administrador nunca é restrito — mesmo com client_view:* no perfil.
 */
export function isMissionClientScopeRestricted(user: MissionAccessUser | null | undefined): boolean {
  if (!user) return false;
  if (hasFullMissionListAccess(user)) return false;
  if (user.clientId) return true;
  if (Array.isArray(user.permissions) && user.permissions.some((p) => String(p).startsWith('client_view:'))) {
    return true;
  }
  return false;
}
