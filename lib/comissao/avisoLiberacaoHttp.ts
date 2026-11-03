/**
 * POST /api/comissoes/liberada-email
 * O browser não tem SMTP. Depois da liberação, pede ao servidor para reler a
 * comissão (já LIBERADO_PARA_PAGAMENTO) e avisar o financeiro.
 */
import { extractAuthToken, extractUserIdFromToken } from '../billingApiAuth.js';
import { createSupabaseAdminClient } from '../supabaseAdmin.js';
import { enviarLiberacaoPorIds } from './enviarAvisoComissaoLiberada.js';

type ReqHeaders = Record<string, string | string[] | undefined>;

function headerValue(req: { headers?: ReqHeaders } | undefined, name: string): string {
  const raw = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()];
  if (Array.isArray(raw)) return String(raw[0] || '').trim();
  return String(raw || '').trim();
}

function papelCliente(role: string): boolean {
  const nome = role.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return nome === 'cliente' || nome === 'client';
}

async function assertUsuarioInterno(
  req: { headers?: ReqHeaders },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const token = extractAuthToken(req);
  const userId = extractUserIdFromToken(token);
  if (!token || !userId) return { ok: false, status: 401, error: 'Não autorizado' };

  const sb = createSupabaseAdminClient();
  if (sb) {
    const { data } = await sb
      .from('system_users')
      .select('id, status, profiles:profile_id ( name )')
      .eq('id', userId)
      .maybeSingle();
    if (!data || data.status !== 'Ativo') return { ok: false, status: 403, error: 'Permissão negada' };
    const profile = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;
    if (papelCliente(String(profile?.name || ''))) return { ok: false, status: 403, error: 'Permissão negada' };
    return { ok: true };
  }

  const headerUserId = headerValue(req, 'x-tmseg-user-id');
  if (headerUserId && headerUserId === userId && !papelCliente(headerValue(req, 'x-tmseg-role'))) {
    return { ok: true };
  }
  return { ok: false, status: 401, error: 'Não autorizado' };
}

function lerIds(body: unknown): string[] {
  const parsed = typeof body === 'string'
    ? (() => {
      try { return JSON.parse(body); } catch { return {}; }
    })()
    : body;
  const raw = parsed && typeof parsed === 'object' ? (parsed as { ids?: unknown }).ids : null;
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 40);
}

export async function tratarPedidoAvisoLiberacao(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }
  const access = await assertUsuarioInterno(req);
  if (!access.ok) {
    res.status(access.status).json({ ok: false, error: access.error });
    return;
  }
  const ids = lerIds(req.body);
  if (!ids.length) {
    res.status(400).json({ ok: false, error: 'ids obrigatórios' });
    return;
  }
  const sb = createSupabaseAdminClient();
  if (!sb) {
    res.status(500).json({ ok: false, error: 'supabase_unavailable' });
    return;
  }
  try {
    const result = await enviarLiberacaoPorIds(sb, ids);
    res.status(200).json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn('[comissao] aviso de liberação:', message);
    res.status(200).json({ ok: false, enviados: 0, error: message });
  }
}
