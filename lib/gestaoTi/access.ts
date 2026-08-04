/**
 * Acesso ao Gestor de Desenvolvimento — por perfil/permissões (não por nome).
 * Alinhado ao padrão de Configurações: diretoria | administrador | permissão explícita | '*'.
 */

export type GestaoTiAccessUser = {
  role?: string | null;
  permissions?: string[] | null;
};

export const GESTOR_DESENVOLVIMENTO_SCREEN_ID = 'gestor-desenvolvimento';

export function canAccessGestorDesenvolvimento(user: GestaoTiAccessUser | null | undefined): boolean {
  if (!user) return false;
  const role = String(user.role || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  if (role === 'diretoria' || role === 'administrador') return true;

  const perms = Array.isArray(user.permissions) ? user.permissions.map(String) : [];
  if (perms.includes('*')) return true;
  if (perms.includes(GESTOR_DESENVOLVIMENTO_SCREEN_ID)) return true;
  return false;
}
