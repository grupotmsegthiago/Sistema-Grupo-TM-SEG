/**
 * Menu Diretoria / Cockpit Executivo — acesso exclusivo por nome.
 * Perfil "Diretoria" ou "Administrador" sozinhos NÃO liberam o menu.
 */

export type DiretoriaAccessUser = {
  name?: string | null;
  role?: string | null;
};

function normalizePersonName(name: string): string {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Somente Thiago Moreira ou Thiago Santos (pelo nome completo). */
export function canAccessDiretoriaMenu(user: DiretoriaAccessUser | null | undefined): boolean {
  const n = normalizePersonName(String(user?.name || ''));
  if (!n) return false;
  return n.includes('thiago moreira') || n.includes('thiago santos');
}

/** Cockpit continua exclusivo dos Thiagos.
 *  O grupo `diretoria-group` e telas como Pendências de OS têm regra própria no Sidebar. */
export const DIRETORIA_MENU_SCREEN_IDS = new Set([
  'diretoria-cockpit',
  'gestao-investimento',
]);

/** Comissões comerciais: Thiagos + Diretoria/Administrador. */
export function canAccessComissoesComerciais(user: DiretoriaAccessUser | null | undefined): boolean {
  if (canAccessDiretoriaMenu(user)) return true;
  const role = String(user?.role || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return role === 'diretoria' || role === 'administrador';
}
