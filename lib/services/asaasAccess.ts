import { extractUserIdFromToken } from '../rh/apiEmployeesAuth.js';
import {
  resolvePrincipalFromToken,
  type ResolvedPrincipal,
} from '../auth/resolvePrincipal.js';

const ASAAS_ROLES = new Set(['administrador', 'diretoria', 'financeiro', 'ceo']);

export function roleCanAccessAsaasApi(role: string | null | undefined): boolean {
  return ASAAS_ROLES.has(String(role || '').trim().toLowerCase());
}

export function principalCanAccessAsaasApi(principal: ResolvedPrincipal): boolean {
  if (roleCanAccessAsaasApi(principal.role)) return true;
  if (principal.permissions.includes('*')) return true;
  if (principal.permissions.includes('fin-transactions')) return true;
  return false;
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

/** Retorna null se autorizado; mensagem de erro se negado. */
export async function assertAsaasApiAccess(token: string): Promise<string | null> {
  if (!token) return 'Não autorizado';

  const userId = extractUserIdFromToken(token);
  if (!userId) return 'Não autorizado';

  const principal = await resolvePrincipalFromToken(token);
  if (!principal) {
    return 'Permissão negada — usuário inativo ou não encontrado';
  }

  if (!principalCanAccessAsaasApi(principal)) {
    return 'Permissão negada';
  }

  return null;
}

export function extractAuthToken(req: {
  headers?: Record<string, string | string[] | undefined>;
}): string {
  return authTokenFromHeader(req);
}
