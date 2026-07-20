/**
 * Supervisão financeira — privilégios por nome (além do perfil Administrador).
 * Bárbara Sgarlata e Giovanna Marsili compartilham o mesmo nível operacional.
 */

export function normalizePersonName(name: string | null | undefined): string {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** True para Bárbara Sgarlata / Giovanna Marsili (e variantes sem acento). */
export function isFinanceSupervisorName(name: string | null | undefined): boolean {
  const n = normalizePersonName(name);
  if (!n) return false;
  if (n.includes('barbara')) return true;
  // Única Giovanna no sistema (Giovanna Marsili) — mesmo acesso da Bárbara.
  if (n.includes('giovanna')) return true;
  return false;
}

export type OsLossCardUser = {
  name?: string | null;
  role?: string | null;
  permissions?: string[] | null;
};

/**
 * Card/dialog "OS com Prejuízo" na lista de missões.
 * Obrigatório para Bárbara, Daniel e Giovanna; mantém Michelle / Thiago Moreira / Controller.
 * Perfil Administrador também libera (os três usam esse perfil no banco).
 */
export function canSeeOsComPrejuizo(user: OsLossCardUser | null | undefined): boolean {
  if (!user) return false;
  const nameLower = normalizePersonName(user.name);
  const roleLower = String(user.role || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (roleLower === 'comercial') return false;
  if (Array.isArray(user.permissions) && user.permissions.includes('*')) return true;
  if (isFinanceSupervisorName(user.name)) return true; // Bárbara / Giovanna
  if (nameLower.includes('daniel')) return true;
  if (nameLower.includes('michelle')) return true;
  if (nameLower.includes('thiago moreira')) return true;
  if (roleLower === 'controller') return true;
  if (roleLower === 'administrador') return true;
  if (roleLower === 'diretoria') return true;
  return false;
}
