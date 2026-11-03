import { createSupabaseAdminClient } from '../supabaseAdmin.js';
import { usuarioIdDoToken } from '../sessao/token.js';

type ReqHeaders = Record<string, unknown> | undefined;

export function extractUserIdFromToken(token: string): string | null {
  return usuarioIdDoToken(token);
}

export function extractAuthToken(req: { headers?: ReqHeaders }): string {
  const h = req.headers || {};
  const auth = String(h.authorization || h.Authorization || '');
  const bearer = auth.replace(/^Bearer\s+/i, '').trim();
  if (bearer) return bearer;
  return String(h['x-auth-token'] || h['X-Auth-Token'] || '').trim();
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
  _req?: { headers?: ReqHeaders },
): Promise<string | null> {
  if (!token) return 'Não autorizado';
  if (!extractUserIdFromToken(token)) return 'Não autorizado';

  const roleFromDb = await safeResolveUserRoleFromToken(token);
  if (roleCanAccessEmployees(roleFromDb)) return null;
  return 'Permissão negada — apenas Diretoria e RH';
}
