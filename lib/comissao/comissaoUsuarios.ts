/**
 * Vincula usuário interno (perfil COMERCIAL) à tabela comerciais + escala padrão.
 */
import type { ComissaoDbClient } from './comissaoCore';
import { CODIGO_TABELA_COMISSAO_PADRAO, perfilEhComercial } from './tabelaComissaoPadrao';

export type UsuarioComercialInput = {
  id: number | string;
  name: string;
  email?: string | null;
};

export async function upsertComercialDoUsuario(
  sb: ComissaoDbClient,
  user: UsuarioComercialInput,
): Promise<{ ok: boolean; comercialId?: string; error?: string }> {
  const usuarioId = Number(user.id);
  const nome = String(user.name || '').trim();
  const email = String(user.email || '').trim() || null;
  if (!Number.isFinite(usuarioId) || usuarioId <= 0 || !nome) {
    return { ok: false, error: 'Usuário inválido para vínculo comercial.' };
  }

  const { data: byUser } = await sb
    .from('comerciais')
    .select('id')
    .eq('usuario_id', usuarioId)
    .maybeSingle();
  if (byUser?.id) {
    const { error } = await sb.from('comerciais').update({
      nome,
      email,
      ativo: true,
      tabela_comissao_codigo: CODIGO_TABELA_COMISSAO_PADRAO,
    }).eq('id', byUser.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, comercialId: String(byUser.id) };
  }

  if (email) {
    const { data: byEmail } = await sb
      .from('comerciais')
      .select('id')
      .ilike('email', email)
      .limit(1);
    const hit = byEmail?.[0];
    if (hit?.id) {
      const { error } = await sb.from('comerciais').update({
        usuario_id: usuarioId,
        nome,
        email,
        ativo: true,
        tabela_comissao_codigo: CODIGO_TABELA_COMISSAO_PADRAO,
      }).eq('id', hit.id);
      if (error) return { ok: false, error: error.message };
      return { ok: true, comercialId: String(hit.id) };
    }
  }

  const { data: byName } = await sb
    .from('comerciais')
    .select('id, usuario_id')
    .ilike('nome', nome)
    .limit(1);
  const named = byName?.[0];
  if (named?.id && !named.usuario_id) {
    const { error } = await sb.from('comerciais').update({
      usuario_id: usuarioId,
      nome,
      email,
      ativo: true,
      tabela_comissao_codigo: CODIGO_TABELA_COMISSAO_PADRAO,
    }).eq('id', named.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, comercialId: String(named.id) };
  }

  const { data, error } = await sb.from('comerciais').insert({
    nome,
    email,
    usuario_id: usuarioId,
    ativo: true,
    tabela_comissao_codigo: CODIGO_TABELA_COMISSAO_PADRAO,
    valor_fixo: 0,
  }).select('id').single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, comercialId: data?.id ? String(data.id) : undefined };
}

export async function sincronizarComerciaisDeUsuarios(sb: ComissaoDbClient): Promise<{ ok: boolean; linked: number; error?: string }> {
  const { data: profiles, error: pErr } = await sb.from('profiles').select('id, name');
  if (pErr) return { ok: false, linked: 0, error: pErr.message };
  const comercialIds = (profiles || [])
    .filter((p: { name?: string }) => perfilEhComercial(p.name))
    .map((p: { id: number | string }) => p.id);
  if (comercialIds.length === 0) return { ok: true, linked: 0 };

  const { data: users, error: uErr } = await sb
    .from('system_users')
    .select('id, name, email, status, user_type, profile_id')
    .in('profile_id', comercialIds)
    .eq('user_type', 'internal');
  if (uErr) return { ok: false, linked: 0, error: uErr.message };

  let linked = 0;
  for (const u of users || []) {
    if (String(u.status || '').toLowerCase() === 'inativo') continue;
    const res = await upsertComercialDoUsuario(sb, { id: u.id, name: u.name, email: u.email });
    if (!res.ok) return { ok: false, linked, error: res.error };
    linked += 1;
  }
  return { ok: true, linked };
}
