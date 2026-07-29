import type { GestorUserContext } from '../types';
import { canAccessGcFull, isGcScopedCommercial } from './access';

/**
 * Isolamento de carteira — mesmo padrão do sistema (sem RLS):
 * comercial vê created_by === nome OU client_view:<id>.
 * Diretoria vê tudo.
 */
export function getClientViewIds(user: GestorUserContext): string[] {
  const perms = user.permissions || [];
  return perms
    .filter((p) => typeof p === 'string' && p.startsWith('client_view:'))
    .map((p) => p.replace('client_view:', ''))
    .filter(Boolean);
}

export function isOwnerScoped(user: GestorUserContext): boolean {
  return isGcScopedCommercial(user) && !canAccessGcFull(user);
}

/** Nomes de comercial (created_by) permitidos no escopo atual */
export function getScopedOwnerNames(user: GestorUserContext): string[] | null {
  if (!isOwnerScoped(user)) return null;
  const name = String(user.name || '').trim();
  return name ? [name] : [];
}

export function filterClientsByScope<T extends { id?: string; created_by?: string | null }>(
  clients: T[],
  user: GestorUserContext,
): T[] {
  if (!isOwnerScoped(user)) return clients;
  const name = String(user.name || '').trim();
  const viewIds = new Set(getClientViewIds(user));
  return clients.filter(
    (c) => c.created_by === name || (c.id != null && viewIds.has(String(c.id))),
  );
}

export function filterMissionsByClientNames<T extends { client?: string | null }>(
  missions: T[],
  allowedClientNames: Set<string> | null,
): T[] {
  if (!allowedClientNames) return missions;
  if (allowedClientNames.size === 0) return [];
  return missions.filter((m) => allowedClientNames.has(String(m.client || '').trim()));
}

export function buildAllowedClientNameSet(
  clients: Array<{ id?: string; name?: string; trading_name?: string | null; created_by?: string | null }>,
  user: GestorUserContext,
): Set<string> | null {
  if (!isOwnerScoped(user)) return null;
  const scoped = filterClientsByScope(clients, user);
  const names = new Set<string>();
  for (const c of scoped) {
    if (c.name) names.add(String(c.name).trim());
    if (c.trading_name) names.add(String(c.trading_name).trim());
  }
  return names;
}
