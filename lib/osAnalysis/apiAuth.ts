/**
 * Auth leve para /api/os-analysis (handler serverless — evita Express).
 * Diretoria / Thiagos (canRequestOsAnalysis).
 */

import { canRequestOsAnalysis } from '../osAnalysisAccess';

type ReqHeaders = Record<string, string | string[] | undefined>;

export type OsAnalysisPrincipal = {
  id: string;
  name: string;
  role: string;
  email: string | null;
};

export function extractUserIdFromToken(token: string): string | null {
  const match = token.match(/(?:tmseg-token|impersonation-token)-(.+)-(\d+)$/);
  return match ? match[1] : null;
}

function headerValue(req: { headers?: ReqHeaders } | undefined, name: string): string {
  const raw = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()];
  if (Array.isArray(raw)) return String(raw[0] || '').trim();
  return String(raw || '').trim();
}

export function extractAuthToken(req: { headers?: ReqHeaders }): string {
  const auth = req.headers?.authorization || req.headers?.Authorization;
  const raw = Array.isArray(auth) ? auth[0] : auth;
  const fromHeader = String(raw || '').replace(/^Bearer\s+/i, '').trim();
  if (fromHeader) return fromHeader;
  return headerValue(req, 'x-auth-token');
}

function normalizeRole(role: string): string {
  return String(role || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parsePermissions(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return raw.split(',').map((p) => p.trim()).filter(Boolean);
  }
}

/** Mesmo client admin do restante do servidor (service_role TM SEG). */
export async function adminSupabase() {
  const { createSupabaseAdminClient } = await import('../supabaseAdmin.js');
  return createSupabaseAdminClient();
}

type ProfileRow = { name?: string; permissions?: string[] };

function readProfile(data: { profiles?: ProfileRow | ProfileRow[] | null }): ProfileRow | null {
  const raw = data.profiles;
  if (Array.isArray(raw)) return raw[0] || null;
  return raw || null;
}

/** Resolve usuário autenticado; null se token inválido. */
export async function resolveOsAnalysisPrincipal(
  token: string,
  req?: { headers?: ReqHeaders },
): Promise<OsAnalysisPrincipal | null> {
  if (!token) return null;
  const userId = extractUserIdFromToken(token);
  if (!userId) return null;

  const sb = await adminSupabase();
  if (sb) {
    const { data } = await sb
      .from('system_users')
      .select('id, name, email, status, permissions, profiles:profile_id ( name, permissions )')
      .eq('id', userId)
      .maybeSingle();
    if (data && data.status === 'Ativo') {
      const profile = readProfile(data as { profiles?: ProfileRow | ProfileRow[] | null });
      return {
        id: String(data.id),
        name: String(data.name || 'Sistema'),
        role: normalizeRole(profile?.name || ''),
        email: data.email ? String(data.email) : null,
      };
    }
  }

  // Fallback headers (authFetch envia x-tmseg-*)
  const headerUserId = headerValue(req, 'x-tmseg-user-id');
  if (!headerUserId || headerUserId !== userId) return null;
  return {
    id: userId,
    name: headerValue(req, 'x-tmseg-user-name') || 'Sistema',
    role: normalizeRole(headerValue(req, 'x-tmseg-role')),
    email: headerValue(req, 'x-tmseg-email') || null,
  };
}

export function principalCanRequestAnalysis(principal: OsAnalysisPrincipal): boolean {
  return canRequestOsAnalysis({
    name: principal.name,
    role: principal.role,
    permissions: parsePermissions(''),
  });
}
