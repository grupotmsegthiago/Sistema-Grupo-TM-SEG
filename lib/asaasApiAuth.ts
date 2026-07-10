/**
 * Auth leve para rotas serverless Asaas (Vercel).
 * 1) Consulta system_users com service_role (várias envs)
 * 2) Fallback: headers do authFetch (userId do token deve bater)
 */

const DEFAULT_SUPABASE_URL = 'https://ajhmmjuewdsukecaimik.supabase.co';
const TMSEG_REF = 'ajhmmjuewdsukecaimik';
const ASAAS_ROLES = new Set(['administrador', 'diretoria', 'financeiro', 'ceo']);

type ReqHeaders = Record<string, string | string[] | undefined>;

export function extractUserIdFromToken(token: string): string | null {
  const match = token.match(/(?:tmseg-token|impersonation-token)-(.+)-(\d+)$/);
  return match ? match[1] : null;
}

function cleanEnv(value: unknown): string {
  if (value == null) return '';
  return String(value).trim().replace(/^["']|["']$/g, '');
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

function canAccess(role: string, permissions: string[]): boolean {
  const normalizedRole = normalizeRole(role);
  if (ASAAS_ROLES.has(normalizedRole)) return true;
  if (permissions.includes('*')) return true;
  if (permissions.includes('fin-transactions')) return true;
  if (permissions.includes('finance-group')) return true;
  if (permissions.some((p) => p.startsWith('fin-'))) return true;
  return false;
}

function pickServiceRoleKey(): string {
  const candidates = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_KEY,
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  ];
  for (const candidate of candidates) {
    const key = cleanEnv(candidate);
    if (key) return key;
  }
  return '';
}

async function adminSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  const envUrl = cleanEnv(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const url = envUrl.includes(TMSEG_REF) ? envUrl : DEFAULT_SUPABASE_URL;
  const key = pickServiceRoleKey();
  if (!key) return null;
  return createClient(url, key);
}

type ProfileRow = { name?: string; permissions?: string[] };

function readProfile(data: { profiles?: ProfileRow | ProfileRow[] | null }): ProfileRow | null {
  const raw = data.profiles;
  if (Array.isArray(raw)) return raw[0] || null;
  return raw || null;
}

async function resolveAccessFromDatabase(userId: string): Promise<{
  found: boolean;
  ok: boolean;
  role: string;
  permissions: string[];
} | null> {
  const sb = await adminSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from('system_users')
    .select('status, permissions, profiles:profile_id ( name, permissions )')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[asaasApiAuth] consulta system_users:', error.message);
    return null;
  }
  if (!data) return null;

  const profile = readProfile(data as { profiles?: ProfileRow | ProfileRow[] | null });
  const role = normalizeRole(profile?.name || '');
  const profilePerms = Array.isArray(profile?.permissions) ? profile.permissions : [];
  const userPerms = Array.isArray(data.permissions) ? data.permissions : [];
  const permissions = [...new Set([...profilePerms, ...userPerms])];

  if (data.status !== 'Ativo') {
    return { found: true, ok: false, role, permissions };
  }

  return { found: true, ok: canAccess(role, permissions), role, permissions };
}

function resolveAccessFromHeaders(
  token: string,
  req?: { headers?: ReqHeaders },
): { ok: boolean; role: string; permissions: string[] } | null {
  if (!req?.headers) return null;

  const userId = extractUserIdFromToken(token);
  const headerUserId = headerValue(req, 'x-tmseg-user-id');
  if (!userId || !headerUserId || userId !== headerUserId) return null;

  const role = normalizeRole(headerValue(req, 'x-tmseg-role'));
  const permissions = parsePermissions(headerValue(req, 'x-tmseg-permissions'));
  return { ok: canAccess(role, permissions), role, permissions };
}

/** Retorna null se autorizado; mensagem de erro se negado. */
export async function assertAsaasApiAccess(
  token: string,
  req?: { headers?: ReqHeaders },
): Promise<string | null> {
  if (!token) return 'Não autorizado';

  const userId = extractUserIdFromToken(token);
  if (!userId) return 'Não autorizado';

  try {
    const fromDb = await resolveAccessFromDatabase(userId);
    if (fromDb?.ok) return null;
    if (fromDb?.found && !fromDb.ok) return 'Permissão negada';

    const fromHeaders = resolveAccessFromHeaders(token, req);
    if (fromHeaders?.ok) {
      console.warn('[asaasApiAuth] acesso via headers (service_role indisponível ou usuário não encontrado no DB)');
      return null;
    }

    if (!pickServiceRoleKey()) {
      console.warn('[asaasApiAuth] SUPABASE_SERVICE_ROLE_KEY indisponível');
    }
    return 'Permissão negada';
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn('[asaasApiAuth]', message);

    const fromHeaders = resolveAccessFromHeaders(token, req);
    if (fromHeaders?.ok) return null;
    return 'Permissão negada';
  }
}

export function roleCanAccessAsaasApi(role: string | null | undefined): boolean {
  return canAccess(role || '', []);
}

export function principalCanAccessAsaasApi(input: {
  role: string;
  permissions: string[];
}): boolean {
  return canAccess(input.role, input.permissions);
}
