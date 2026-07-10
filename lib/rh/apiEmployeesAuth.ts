const DEFAULT_SUPABASE_URL = 'https://ajhmmjuewdsukecaimik.supabase.co';
const TMSEG_REF = 'ajhmmjuewdsukecaimik';

export function extractUserIdFromToken(token: string): string | null {
  const match = token.match(/(?:tmseg-token|impersonation-token)-(.+)-(\d+)$/);
  return match ? match[1] : null;
}

function decodeRef(key: string): string | null {
  try {
    const payload = key.split('.')[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))?.ref || null;
  } catch {
    return null;
  }
}

async function adminSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  const envUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '');
  const url = envUrl.includes(TMSEG_REF) ? envUrl : DEFAULT_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    '';
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY indisponível neste ambiente');
  }
  const ref = decodeRef(key);
  if (ref && ref !== TMSEG_REF) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY de outro projeto Supabase');
  }
  return createClient(url, key);
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
  const sb = await adminSupabase();
  const { data } = await sb
    .from('system_users')
    .select('status, profiles:profile_id(name)')
    .eq('id', userId)
    .maybeSingle();
  if (!data || data.status !== 'Ativo') return null;
  return String((data.profiles as { name?: string } | null)?.name || '').toLowerCase() || null;
}

/** Retorna null se autorizado; mensagem de erro se negado. */
export async function assertEmployeesApiAccess(token: string): Promise<string | null> {
  if (!token) return 'Não autorizado';
  const role = await resolveUserRoleFromToken(token);
  if (!roleCanAccessEmployees(role)) return 'Permissão negada — apenas Diretoria e RH';
  return null;
}
