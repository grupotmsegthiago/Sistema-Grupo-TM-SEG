import {
  assertEmployeesApiAccess,
  extractUserIdFromToken,
  resolveUserRoleFromToken,
  roleCanAccessEmployees,
} from './apiEmployeesAuth.js';

export { extractUserIdFromToken };

/** Retorna null se autorizado; mensagem de erro se negado. */
export async function assertTimeclockReadAccess(
  token: string,
  requestedUserId?: string
): Promise<string | null> {
  if (!token) return 'Não autorizado';

  const callerId = extractUserIdFromToken(token);
  if (!callerId) return 'Não autorizado';

  const role = await resolveUserRoleFromToken(token);
  if (roleCanAccessEmployees(role)) return null;

  if (requestedUserId && requestedUserId !== callerId) {
    return 'Permissão negada — você só pode ver seu próprio ponto';
  }

  return null;
}

/** Diretoria/RH para telas administrativas da folha. */
export async function assertRhTimeclockAdminAccess(token: string): Promise<string | null> {
  return assertEmployeesApiAccess(token);
}
