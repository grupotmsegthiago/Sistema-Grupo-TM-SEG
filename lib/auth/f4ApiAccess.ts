import type { ResolvedPrincipal } from './resolvePrincipal.js';

type HeaderValue = string | string[] | undefined;
type RequestLike = {
  headers?: Record<string, HeaderValue>;
};

type PrincipalResolver = (token: string) => Promise<ResolvedPrincipal | null>;

export type F4ApiAccessResult =
  | { ok: true; principal: ResolvedPrincipal }
  | { ok: false; status: 401 | 403; error: string };

export const F4_ADMIN_ROLES = ['diretoria', 'administrador', 'ceo'] as const;

export const F4_OPERATIONAL_REPORT_WRITE_ROLES = [
  'diretoria',
  'administrador',
  'ceo',
  'controller',
  'avançado',
  'avancado',
  'operador',
  'financeiro',
  'comercial',
] as const;

export const F4_CLIENT_DATA_INTERNAL_ROLES = [
  'diretoria',
  'administrador',
  'ceo',
  'controller',
  'avançado',
  'avancado',
  'operador',
  'financeiro',
  'comercial',
] as const;

export function extractF4AuthToken(req: RequestLike): string {
  const raw =
    req.headers?.authorization
    || req.headers?.Authorization
    || req.headers?.['x-auth-token'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return String(value || '').replace(/^Bearer\s+/i, '').trim();
}

/**
 * Adaptador F4-P0 sobre o resolver de principal já homologado.
 * Não aceita apenas a presença do token: token inválido/inativo falha antes do handler.
 */
export async function authorizeF4ApiRequest(
  req: RequestLike,
  allowedRoles: readonly string[],
  resolvePrincipal: PrincipalResolver,
): Promise<F4ApiAccessResult> {
  const token = extractF4AuthToken(req);
  if (!token) return { ok: false, status: 401, error: 'Não autorizado' };

  const principal = await resolvePrincipal(token);
  if (!principal) return { ok: false, status: 401, error: 'Não autorizado' };

  const normalized = allowedRoles.map((role) => role.toLowerCase());
  const hasGlobalPermission = principal.permissions.includes('*');
  const roleAllowed =
    normalized.includes('*')
    || normalized.includes(principal.role.toLowerCase())
    || hasGlobalPermission;

  if (!roleAllowed) {
    return {
      ok: false,
      status: 403,
      error: `Permissão negada — requer: ${allowedRoles.join(', ')}`,
    };
  }

  return { ok: true, principal };
}

export function canAccessF4ClientScope(
  principal: ResolvedPrincipal,
  requestedClientId: unknown,
): boolean {
  const requested = String(requestedClientId || '').trim();
  if (!requested) return false;
  if (principal.permissions.includes('*')) return true;
  if (F4_CLIENT_DATA_INTERNAL_ROLES.includes(principal.role as (typeof F4_CLIENT_DATA_INTERNAL_ROLES)[number])) {
    return true;
  }
  if (String(principal.clientId || '').trim() === requested) return true;
  return principal.permissions.some(
    (permission) => permission === `client_view:${requested}`,
  );
}

export function isF4InternalClientDataPrincipal(principal: ResolvedPrincipal): boolean {
  return (
    principal.permissions.includes('*')
    || F4_CLIENT_DATA_INTERNAL_ROLES.includes(
      principal.role as (typeof F4_CLIENT_DATA_INTERNAL_ROLES)[number],
    )
  );
}
