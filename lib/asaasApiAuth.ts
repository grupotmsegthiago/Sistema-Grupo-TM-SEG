/**
 * Auth leve para rotas serverless Asaas (Vercel).
 * Usa apenas dynamic import do Supabase — evita FUNCTION_INVOCATION_FAILED.
 */

const DEFAULT_SUPABASE_URL = 'https://ajhmmjuewdsukecaimik.supabase.co';
const TMSEG_REF = 'ajhmmjuewdsukecaimik';
const ASAAS_ROLES = new Set(['administrador', 'diretoria', 'financeiro', 'ceo']);

export function extractUserIdFromToken(token: string): string | null {
  const match = token.match(/(?:tmseg-token|impersonation-token)-(.+)-(\d+)$/);
  return match ? match[1] : null;
}

function cleanEnv(value: unknown): string {
  if (value == null) return '';
  return String(value).trim().replace(/^["']|["']$/g, '');
}

function authTokenFromHeader(req: {
  headers?: Record<string, string | string[] | undefined>;
}): string {
  const auth = req.headers?.authorization || req.headers?.Authorization;
  const raw = Array.isArray(auth) ? auth[0] : auth;
  const fromHeader = String(raw || '').replace(/^Bearer\s+/i, '').trim();
  if (fromHeader) return fromHeader;
  return String(req.headers?.['x-auth-token'] || '').trim();
}

export function extractAuthToken(req: {
  headers?: Record<string, string | string[] | undefined>;
}): string {
  return authTokenFromHeader(req);
}

async function adminSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  const envUrl = cleanEnv(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const url = envUrl.includes(TMSEG_REF) ? envUrl : DEFAULT_SUPABASE_URL;
  const key = cleanEnv(
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  );
  if (!key) return null;
  return createClient(url, key);
}

function canAccess(role: string, permissions: string[]): boolean {
  if (ASAAS_ROLES.has(role)) return true;
  if (permissions.includes('*')) return true;
  if (permissions.includes('fin-transactions')) return true;
  return false;
}

/** Retorna null se autorizado; mensagem de erro se negado. */
export async function assertAsaasApiAccess(token: string): Promise<string | null> {
  if (!token) return 'Não autorizado';

  const userId = extractUserIdFromToken(token);
  if (!userId) return 'Não autorizado';

  try {
    const sb = await adminSupabase();
    if (!sb) {
      console.warn('[asaasApiAuth] SUPABASE_SERVICE_ROLE_KEY indisponível');
      return 'Permissão negada';
    }

    const { data, error } = await sb
      .from('system_users')
      .select('status, permissions, profiles:profile_id ( name, permissions )')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('[asaasApiAuth] consulta system_users:', error.message);
      return 'Permissão negada';
    }
    if (!data || data.status !== 'Ativo') {
      return 'Permissão negada — usuário inativo ou não encontrado';
    }

    const profile = data.profiles as { name?: string; permissions?: string[] } | null;
    const role = String(profile?.name || '').trim().toLowerCase();
    const profilePerms = Array.isArray(profile?.permissions) ? profile.permissions : [];
    const userPerms = Array.isArray(data.permissions) ? data.permissions : [];
    const permissions = [...new Set([...profilePerms, ...userPerms])];

    if (!canAccess(role, permissions)) return 'Permissão negada';
    return null;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn('[asaasApiAuth]', message);
    return 'Permissão negada';
  }
}
