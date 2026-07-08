import {
  extractUserIdFromToken,
  resolveUserRoleFromToken,
} from '../rh/apiEmployeesAuth';

const SYSTEM_ADMIN_ROLES = new Set(['diretoria', 'administrador', 'rh', 'ceo']);

export function roleCanAccessSystemDiagnostics(role: string | null | undefined): boolean {
  return SYSTEM_ADMIN_ROLES.has(String(role || '').trim().toLowerCase());
}

function authTokenFromHeader(req: {
  headers?: Record<string, string | string[] | undefined>;
}): string {
  const auth = req.headers?.authorization || req.headers?.Authorization;
  const raw = Array.isArray(auth) ? auth[0] : auth;
  return String(raw || '').replace(/^Bearer\s+/i, '').trim();
}

/** Retorna null se autorizado; mensagem de erro se negado. */
export async function assertSystemDiagnosticsAccess(token: string): Promise<string | null> {
  if (!token) return 'Não autorizado';

  const userId = extractUserIdFromToken(token);
  if (!userId) return 'Não autorizado';

  const role = await resolveUserRoleFromToken(token);
  if (!roleCanAccessSystemDiagnostics(role)) {
    return 'Permissão negada — apenas Diretoria, Administrador e RH';
  }

  return null;
}

export function extractAuthToken(req: {
  headers?: Record<string, string | string[] | undefined>;
}): string {
  return authTokenFromHeader(req);
}
