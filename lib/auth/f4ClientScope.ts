import type { SupabaseClient } from '@supabase/supabase-js';
import {
  canAccessF4ClientScope,
  isF4InternalClientDataPrincipal,
} from './f4ApiAccess.js';
import type { ResolvedPrincipal } from './resolvePrincipal.js';

export function f4ClientIdsForPrincipal(principal: ResolvedPrincipal): string[] {
  const ids = new Set<string>();
  if (principal.clientId) ids.add(String(principal.clientId));
  for (const permission of principal.permissions) {
    if (permission.startsWith('client_view:')) {
      const id = permission.slice('client_view:'.length).trim();
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

export async function canAccessF4MissionScope(
  client: SupabaseClient,
  principal: ResolvedPrincipal,
  missionId: unknown,
  claimedClientId?: unknown,
): Promise<boolean> {
  if (isF4InternalClientDataPrincipal(principal)) return true;
  if (claimedClientId !== undefined && !canAccessF4ClientScope(principal, claimedClientId)) {
    return false;
  }

  const clientIds = f4ClientIdsForPrincipal(principal);
  if (!clientIds.length) return false;

  const [{ data: mission }, { data: clients }] = await Promise.all([
    client
      .from('missions')
      .select('client')
      .eq('id', String(missionId || ''))
      .maybeSingle(),
    client
      .from('clients')
      .select('name')
      .in('id', clientIds),
  ]);
  if (!mission?.client || !clients?.length) return false;

  const missionClient = String(mission.client).trim().toLocaleUpperCase('pt-BR');
  return clients.some(
    (allowedClient: { name?: string | null }) =>
      String(allowedClient.name || '').trim().toLocaleUpperCase('pt-BR') === missionClient,
  );
}
