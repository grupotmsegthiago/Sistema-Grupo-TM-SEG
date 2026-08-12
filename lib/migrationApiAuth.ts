/** Auth mínima para handlers serverless de migration (espelha requireRole diretoria/administrador). */
import { hasRole, readBearer, resolveLitePrincipal } from './tmsegAuth.js';

export async function assertMigrationAdminAccess(
  req: { headers?: Record<string, string | string[] | undefined> },
): Promise<string | null> {
  const token = readBearer(req);
  if (!token) return 'Não autorizado';

  const principal = await resolveLitePrincipal(token, req);
  if (!principal) return 'Permissão negada — usuário inativo ou não encontrado';
  if (!hasRole(principal, 'diretoria', 'administrador')) {
    return 'Permissão negada — requer: diretoria, administrador';
  }
  return null;
}
