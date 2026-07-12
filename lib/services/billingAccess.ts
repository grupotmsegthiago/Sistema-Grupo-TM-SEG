import { extractAuthToken } from './systemAccess.js';
import { safeResolveUserRoleFromToken } from '../rh/apiEmployeesAuth.js';

const BILLING_ROLES = new Set(['diretoria', 'administrador', 'ceo']);

export function roleCanAccessBilling(role: string | null | undefined): boolean {
  return BILLING_ROLES.has(String(role || '').trim().toLowerCase());
}

/** Retorna null se autorizado; mensagem de erro se negado. */
export async function assertBillingAccess(token: string): Promise<string | null> {
  if (!token) return 'Não autorizado';
  const role = await safeResolveUserRoleFromToken(token);
  if (!role) return 'Não autorizado';
  if (!roleCanAccessBilling(role)) {
    return 'Permissão negada — apenas Diretoria, Administrador ou CEO';
  }
  return null;
}

export { extractAuthToken };
