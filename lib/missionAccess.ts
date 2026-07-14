/**
 * Regras de visibilidade da lista de OS (MissionTable).
 * Isolamento por cliente é client-side — admin/liberação financeira devem ver tudo.
 */

export type MissionAccessUser = {
  role?: string | null;
  name?: string | null;
  permissions?: string[] | null;
  clientId?: string | null;
};

/** Administrador (ou acesso total / Bárbara) — libera OS para faturamento e vê todas. */
export function hasFullMissionListAccess(user: MissionAccessUser | null | undefined): boolean {
  if (!user) return false;
  if (Array.isArray(user.permissions) && user.permissions.includes('*')) return true;
  const roleLower = String(user.role || '').toLowerCase().trim();
  if (roleLower === 'administrador') return true;
  const nameLower = String(user.name || '').toLowerCase();
  // Bárbara (financeiro) — independente do rótulo exato do perfil no banco.
  if (nameLower.includes('barbara') || nameLower.includes('bárbara')) return true;
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
