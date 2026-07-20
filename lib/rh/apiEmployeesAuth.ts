import { createSupabaseAdminClient } from '../supabaseAdmin.js';

type ReqHeaders = Record<string, unknown> | undefined;

export function extractUserIdFromToken(token: string): string | null {
  const match = token.match(/(?:tmseg-token|impersonation-token)-(.+)-(\d+)$/);
  return match ? match[1] : null;
}

export function extractAuthToken(req: { headers?: ReqHeaders }): string {
  const h = req.headers || {};
  const auth = String(h.authorization || h.Authorization || '');
  const bearer = auth.replace(/^Bearer\s+/i, '').trim();
  if (bearer) return bearer;
  return String(h['x-auth-token'] || h['X-Auth-Token'] || '').trim();
}

function headerValue(req: { headers?: EnvHeaders } | undefined, name: string): string {
  if (!req?.headers) return '';
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(req.headers)) {
    if (String(k).toLowerCase() === lower) return String(v || '').trim();
  }
  return '';
}

function normalizeRole(role: string): string {
  return role
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function roleCanAccessEmployees(role: string | null | undefined): boolean {
  const r = normalizeRole(String(role || ''));
  return r === 'diretoria' || r === 'rh';
}

/** Não propaga exceção — evita 500 em rotas serverless quando o admin Supabase falha. */
export async function safeResolveUserRoleFromToken(token: string): Promise<string | null> {
  try {
    return await resolveUserRoleFromToken(token);
  } catch (e: any) {
    console.warn('[auth] safeResolveUserRoleFromToken:', e?.message || e);
    return null;
  }
}

export async function resolveUserRoleFromToken(token: string): Promise<string | null> {
  const userId = extractUserIdFromToken(token);
  if (!userId) return null;
  const sb = createSupabaseAdminClient();
  if (!sb) throw new Error('SUPABASE_SERVICE_ROLE_KEY indisponível neste ambiente');
  const { data } = await sb
    .from('system_users')
    .select('status, profiles:profile_id(name)')
    .eq('id', userId)
    .maybeSingle();
  if (!data || data.status !== 'Ativo') return null;
  return String((data.profiles as { name?: string } | null)?.name || '').trim().toLowerCase() || null;
}

/**
 * Retorna null se autorizado; mensagem de erro se negado.
 * Fallback: headers x-tmseg-user-id / x-tmseg-role (authFetch) quando o service_role falha.
 */
export async function assertEmployeesApiAccess(
  token: string,
  req?: { headers?: EnvHeaders },
): Promise<string | null> {
  if (!token) return 'Não autorizado';
  if (!extractUserIdFromToken(token)) return 'Não autorizado';

  const roleFromDb = await safeResolveUserRoleFromToken(token);
  if (roleCanAccessEmployees(roleFromDb)) return null;

  const headerRole = normalizeRole(headerValue(req, 'x-tmseg-role'));
  const headerUserId = headerValue(req, 'x-tmseg-user-id');
  const tokenUserId = extractUserIdFromToken(token);
  if (
    headerUserId
    && tokenUserId
    && headerUserId === tokenUserId
    && roleCanAccessEmployees(headerRole)
  ) {
    console.warn('[rh-auth] acesso via headers x-tmseg-* (service_role/DB indisponível)');
    return null;
  }

  if (roleFromDb) return 'Permissão negada — apenas Diretoria e RH';
  return 'Permissão negada — apenas Diretoria e RH';
}
