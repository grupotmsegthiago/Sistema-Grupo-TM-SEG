/**
 * Acesso à API do quadro de comissões: Diretoria (todos) ou Comercial (só o próprio).
 * Não usa RLS anon; o handler chama o banco com service_role.
 */
import { extractAuthToken, extractUserIdFromToken } from '../billingApiAuth.js';
import {
  canAccessComissoesComerciais,
  comissaoSomentePropria,
} from '../diretoriaAccess.js';
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

export type ComissaoQuadroAccess =
  | { ok: true; podeEscrever: boolean; comercialId: string | null; somenteProprio: boolean }
  | { ok: false; status: number; error: string };

async function resolverComercialId(sb: ReturnType<typeof createSupabaseAdminClient>, usuarioId: string): Promise<string | null> {
  if (!sb) return null;
  const idNum = Number(usuarioId);
  if (!Number.isFinite(idNum) || idNum <= 0) return null;
  const { data } = await sb.from('comerciais').select('id').eq('usuario_id', idNum).maybeSingle();
  return data?.id ? String(data.id) : null;
}

export async function assertComissoesQuadroAccess(
  req: { headers?: ReqHeaders },
): Promise<ComissaoQuadroAccess> {
  const token = extractAuthToken(req);
  const userId = extractUserIdFromToken(token);
  if (!token || !userId) return { ok: false, status: 401, error: 'Não autorizado' };

  const sb = createSupabaseAdminClient();
  if (sb) {
    const { data } = await sb
      .from('system_users')
      .select('id, name, status, profiles:profile_id ( name )')
      .eq('id', userId)
      .maybeSingle();
    if (data && data.status === 'Ativo') {
      const profile = readProfile((data as { profiles?: ProfileRow | ProfileRow[] | null }).profiles);
      const user = { name: data.name, role: profile?.name };
      if (!canAccessComissoesComerciais(user)) {
        return { ok: false, status: 403, error: 'Permissão negada' };
      }
      const soProprio = comissaoSomentePropria(user);
      return {
        ok: true,
        podeEscrever: !soProprio,
        somenteProprio: soProprio,
        comercialId: soProprio ? await resolverComercialId(sb, String(data.id || userId)) : null,
      };
    }
  }

  const headerUserId = headerValue(req, 'x-tmseg-user-id');
  if (userId && headerUserId && userId === headerUserId) {
    const user = {
      name: headerValue(req, 'x-tmseg-user-name'),
      role: headerValue(req, 'x-tmseg-role'),
    };
    if (canAccessComissoesComerciais(user)) {
      const soProprio = comissaoSomentePropria(user);
      return {
        ok: true,
        podeEscrever: !soProprio,
        somenteProprio: soProprio,
        comercialId: soProprio && sb ? await resolverComercialId(sb, headerUserId) : null,
      };
    }
  }
  return { ok: false, status: 403, error: 'Permissão negada' };
}
