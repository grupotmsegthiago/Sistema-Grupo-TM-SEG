import { createSupabaseAdminClient } from '../supabaseAdmin.js';

export function extractUserIdFromToken(token: string): string | null {
  const match = token.match(/(?:tmseg-token|impersonation-token)-(.+)-(\d+)$/);
  return match ? match[1] : null;
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

export function roleCanAccessEmployees(role: string | null | undefined): boolean {
  const r = String(role || '').toLowerCase();
  return r === 'diretoria' || r === 'rh';
}

export async function resolveUserRoleFromToken(token: string): Promise<string | null> {
  const userId = extractUserIdFromToken(token);
  if (!userId) return null;
  const sb = createSupabaseAdminClient();
  if (!sb) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY indisponível neste ambiente');
  }
  const { data } = await sb
    .from('system_users')
    .select('status, profiles:profile_id(name)')
    .eq('id', userId)
    .maybeSingle();
  if (!data || data.status !== 'Ativo') return null;
  return String((data.profiles as { name?: string } | null)?.name || '').trim().toLowerCase() || null;
}

/** Retorna null se autorizado; mensagem de erro se negado. */
export async function assertEmployeesApiAccess(token: string): Promise<string | null> {
  if (!token) return 'Não autorizado';
  const role = await resolveUserRoleFromToken(token);
  if (!roleCanAccessEmployees(role)) return 'Permissão negada — apenas Diretoria e RH';
  return null;
}
