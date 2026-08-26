import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from '../supabaseAdmin.js';
import {
  resolvePrincipalFromToken,
  type ResolvedPrincipal,
} from '../auth/resolvePrincipal.js';
import {
  extractAuthToken,
  extractUserIdFromToken,
  roleCanAccessEmployees,
} from './apiEmployeesAuth.js';

export type RhApiAccessAllowed = {
  ok: true;
  principal: ResolvedPrincipal;
};

export type RhApiAccessDenied = {
  ok: false;
  status: 401 | 403 | 503;
  error: string;
};

export type RhApiAccessResult = RhApiAccessAllowed | RhApiAccessDenied;

export type RhApiAccessDeps = {
  hasServiceRole?: () => boolean;
  resolvePrincipal?: (token: string) => Promise<ResolvedPrincipal | null>;
};

/** Cliente estrito do domínio RH: nunca aceita chave anon como contingência. */
export function createRhServiceRoleClient(): SupabaseClient | null {
  const key = getSupabaseServiceRoleKey();
  if (!key) return null;
  return createClient(getSupabaseUrl(), key);
}

/**
 * Fundação de auth das APIs RH sensíveis.
 * O login continua sendo TM SEG customizado; a autorização vem do cadastro
 * ativo em system_users e nunca confia em role/permissões enviadas pelo browser.
 */
export async function authorizeRhApiRequest(
  req: { headers?: Record<string, unknown> },
  deps: RhApiAccessDeps = {},
): Promise<RhApiAccessResult> {
  const token = extractAuthToken(req);
  if (!token || !extractUserIdFromToken(token)) {
    return { ok: false, status: 401, error: 'Não autorizado' };
  }

  const hasServiceRole = deps.hasServiceRole || (() => Boolean(getSupabaseServiceRoleKey()));
  if (!hasServiceRole()) {
    return { ok: false, status: 503, error: 'Supabase admin indisponível' };
  }

  const resolvePrincipal = deps.resolvePrincipal || resolvePrincipalFromToken;
  const principal = await resolvePrincipal(token);
  if (!principal) {
    return { ok: false, status: 401, error: 'Não autorizado' };
  }

  if (!roleCanAccessEmployees(principal.role)) {
    return {
      ok: false,
      status: 403,
      error: 'Permissão negada — apenas Diretoria e RH',
    };
  }

  return { ok: true, principal };
}
