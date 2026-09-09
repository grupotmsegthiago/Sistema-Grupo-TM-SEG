/**
 * Acesso à API do quadro de comissões: Thiagos + Diretoria/Administrador.
 * Não usa RLS anon; o handler chama o banco com service_role.
 */
import { extractAuthToken, extractUserIdFromToken } from '../billingApiAuth.js';
import { canAccessComissoesComerciais } from '../diretoriaAccess.js';
import { createSupabaseAdminClient } from '../supabaseAdmin.js';

type ReqHeaders = Record<string, string | string[] | undefined>;

function headerValue(req: { headers?: ReqHeaders } | undefined, name: string): string {
  const raw = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()];
  if (Array.isArray(raw)) return String(raw[0] || '').trim();
  return String(raw || '').trim();
}

type ProfileRow = { name?: string | null };

function readProfile(raw: ProfileRow | ProfileRow[] | null | undefined): ProfileRow | null {
  if (Array.isArray(raw)) return raw[0] || null;
  return raw || null;
}

export async function assertComissoesQuadroAccess(
  req: { headers?: ReqHeaders },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const token = extractAuthToken(req);
  const userId = extractUserIdFromToken(token);
  if (!token || !userId) return { ok: false, status: 401, error: 'Não autorizado' };

  const sb = createSupabaseAdminClient();
  if (sb) {
    const { data } = await sb
      .from('system_users')
      .select('name, status, profiles:profile_id ( name )')
      .eq('id', userId)
      .maybeSingle();
    if (data && data.status === 'Ativo') {
      const profile = readProfile((data as { profiles?: ProfileRow | ProfileRow[] | null }).profiles);
      if (canAccessComissoesComerciais({ name: data.name, role: profile?.name })) {
        return { ok: true };
      }
      return { ok: false, status: 403, error: 'Permissão negada' };
    }
  }

  const headerUserId = headerValue(req, 'x-tmseg-user-id');
  if (userId && headerUserId && userId === headerUserId) {
    if (canAccessComissoesComerciais({
      name: headerValue(req, 'x-tmseg-user-name'),
      role: headerValue(req, 'x-tmseg-role'),
    })) {
      return { ok: true };
    }
  }
  return { ok: false, status: 403, error: 'Permissão negada' };
}
