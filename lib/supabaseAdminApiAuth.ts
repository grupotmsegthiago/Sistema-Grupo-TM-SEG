/**
 * Autorização serverless equivalente ao requireAuth + requireRole do Express
 * para as seis rotas administrativas /api/supabase/*.
 */
import { extractAuthToken } from './asaasApiAuth.js';
import {
  resolvePrincipalFromToken,
  type ResolvedPrincipal,
} from './auth/resolvePrincipal.js';

type Headers = Record<string, string | string[] | undefined>;
type RequestLike = { headers?: Headers };
type PrincipalResolver = (token: string) => Promise<ResolvedPrincipal | null>;

export const SUPABASE_DIAGNOSTIC_ROLES = [
  'diretoria',
  'administrador',
  'ceo',
] as const;

export const SUPABASE_INIT_INVOICES_ROLES = [
  'diretoria',
  'administrador',
  'ceo',
  'financeiro',
  'controller',
] as const;

export type SupabaseAdminAuthResult =
  | { ok: true; principal: ResolvedPrincipal }
  | { ok: false; status: 401 | 403; error: string };

export async function authorizeSupabaseAdminRequest(
  req: RequestLike,
  allowedRoles: readonly string[],
  resolvePrincipal: PrincipalResolver = resolvePrincipalFromToken,
): Promise<SupabaseAdminAuthResult> {
  const token = extractAuthToken({ headers: req.headers || {} });
  if (!token) {
    return { ok: false, status: 401, error: 'Não autorizado' };
  }

  const principal = await resolvePrincipal(token);
  if (!principal) {
    return {
      ok: false,
      status: 403,
      error: 'Permissão negada — usuário inativo ou não encontrado',
    };
  }

  const normalized = allowedRoles.map((role) => role.toLowerCase());
  if (!normalized.includes(principal.role.toLowerCase())) {
    return {
      ok: false,
      status: 403,
      error: `Permissão negada — requer: ${allowedRoles.join(', ')}`,
    };
  }

  return { ok: true, principal };
}
