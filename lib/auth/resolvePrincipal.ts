import { createSupabaseAdminClient } from '../supabaseAdmin.js';
import { extractUserIdFromToken } from '../rh/apiEmployeesAuth.js';

export type ResolvedPrincipal = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  clientId: string | null;
  permissions: string[];
};

const CACHE_TTL_MS = 60_000;
const principalCache = new Map<string, { principal: ResolvedPrincipal; expiresAt: number }>();

/** Mesma lógica do Express `resolvePrincipal` — compatível com rotas serverless Vercel. */
export async function resolvePrincipalFromToken(token: string): Promise<ResolvedPrincipal | null> {
  const cached = principalCache.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached.principal;

  const userId = extractUserIdFromToken(token);
  if (!userId) return null;

  const sb = createSupabaseAdminClient();
  if (!sb) {
    console.warn('[auth] resolvePrincipalFromToken: Supabase admin indisponível');
    return null;
  }

  try {
    const { data, error } = await sb
      .from('system_users')
      .select('id, name, email, status, client_id, permissions, profiles:profile_id ( name, permissions )')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('[auth] resolvePrincipalFromToken:', error.message);
      return null;
    }
    if (!data || data.status !== 'Ativo') return null;

    const profile = data.profiles as { name?: string; permissions?: string[] } | null;
    const profilePerms = Array.isArray(profile?.permissions) ? profile.permissions : [];
    const userPerms = Array.isArray(data.permissions) ? data.permissions : [];

    const principal: ResolvedPrincipal = {
      id: data.id,
      name: data.name || null,
      email: data.email || null,
      role: String(profile?.name || '').trim().toLowerCase(),
      clientId: data.client_id || null,
      permissions: [...new Set([...profilePerms, ...userPerms])],
    };

    principalCache.set(token, { principal, expiresAt: Date.now() + CACHE_TTL_MS });
    return principal;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn('[auth] resolvePrincipalFromToken:', message);
    return null;
  }
}
