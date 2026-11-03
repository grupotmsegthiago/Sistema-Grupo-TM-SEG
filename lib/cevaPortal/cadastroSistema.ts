import { hashSenha, validarSenha, type PerfilCeva } from './acesso.js';
import { permissoesDoPortal, preservarSenhaPortal, semMarcasDePortal, usuarioSoPortal } from './regrasAcesso.js';
import { gravarSenhaNoServidor } from '../sessao/gravarSenha.js';

type Consulta = { from: (tabela: string) => any };

export function colunaSenhaAlteradaAusente(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const message = String(error.message || '').toLowerCase();
  return error.code === '42703' || error.code === 'PGRST204' || message.includes('senha_alterada_em');
}

async function gravarLinha(
  sb: Consulta,
  tabela: string,
  id: number | string | null,
  campos: Record<string, unknown>,
) {
  const tentar = async (dados: Record<string, unknown>) => {
    if (id == null) return sb.from(tabela).insert(dados).select('id').single();
    return sb.from(tabela).update(dados).eq('id', id).select('id').single();
  };
  let resultado = await tentar(campos);
  if (colunaSenhaAlteradaAusente(resultado.error) && Object.prototype.hasOwnProperty.call(campos, 'senha_alterada_em')) {
    const resto = { ...campos };
    delete resto.senha_alterada_em;
    resultado = await tentar(resto);
  }
  return resultado;
}

/** Pessoa liberada pelo administrador do portal também entra no Cadastro de Usuários. */
export async function vincularCadastroCliente(
  sb: Consulta,
  input: {
    nome: string;
    email: string;
    senhaTemporaria: string | null;
    clientId: string | number;
    caminho: string;
    perfil: PerfilCeva;
    ativo: boolean;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data: existente, error: leitura } = await sb
    .from('system_users')
    .select('id, client_id, user_type, provider_id')
    .ilike('email', input.email)
    .maybeSingle();
  if (leitura) return { ok: false, error: 'Não foi possível consultar o cadastro de usuários.' };
  const permissoes = permissoesDoPortal(input.caminho, input.perfil);
  const status = input.ativo ? 'Ativo' : 'Inativo';
  if (existente) {
    const tipo = String(existente.user_type || '');
    if (tipo && tipo !== 'client') {
      return { ok: false, error: 'Este e-mail já pertence a um usuário interno. Use outro e-mail no portal.' };
    }
    if (existente.provider_id) {
      return { ok: false, error: 'Este e-mail já pertence a um fornecedor. Use outro e-mail no portal.' };
    }
    if (existente.client_id && String(existente.client_id) !== String(input.clientId)) {
      return { ok: false, error: 'Este e-mail já está vinculado a outro cliente.' };
    }
    const { error } = await sb.from('system_users').update({
      name: input.nome,
      client_id: input.clientId,
      user_type: 'client',
      status,
      permissions: permissoes,
      force_password_change: false,
    }).eq('id', existente.id);
    if (error) return { ok: false, error: 'Não foi possível atualizar o cadastro de usuários.' };
    return { ok: true, id: String(existente.id) };
  }
  const payload: Record<string, unknown> = {
    name: input.nome,
    email: input.email,
    client_id: input.clientId,
    user_type: 'client',
    status,
    force_password_change: false,
    permissions: permissoes,
  };
  const { data, error } = await sb.from('system_users').insert(payload).select('id').single();
  if (error || !data?.id) return { ok: false, error: 'Não foi possível criar o usuário no cadastro do cliente.' };
  if (input.senhaTemporaria) {
    await gravarSenhaNoServidor(sb, String(data.id), input.senhaTemporaria, { force_password_change: false });
  }
  return { ok: true, id: String(data.id) };
}

export async function alinharStatusCadastroPortal(
  sb: Consulta,
  email: string,
  ativo: boolean,
): Promise<void> {
  const { data } = await sb
    .from('system_users')
    .select('id, permissions, user_type')
    .ilike('email', email)
    .maybeSingle();
  if (!data || String(data.user_type || '') !== 'client' || !usuarioSoPortal(data.permissions)) return;
  await sb.from('system_users').update({ status: ativo ? 'Ativo' : 'Inativo' }).eq('id', data.id);
}

/**
 * Liga o usuário do Cadastro de Clientes à tabela do portal dele.
 * Hash já existente (Lara) não é substituído.
 */
export async function sincronizarAcessoPortal(
  sb: Consulta,
  input: {
    clientId: string | number;
    nome: string;
    email: string;
    senha: string;
    perfil: PerfilCeva;
    ativo: boolean;
    systemUserId: string;
    acesso: boolean;
    tabela: string;
    caminho: string;
  },
): Promise<{ ok: true; manteveSenha: boolean; acesso: boolean } | { ok: false; status: number; error: string }> {
  const { data: dono, error: erroDono } = await sb
    .from('system_users')
    .select('id, email, client_id, user_type, permissions')
    .eq('id', input.systemUserId)
    .maybeSingle();
  if (erroDono || !dono) return { ok: false, status: 404, error: 'Usuário do cadastro não encontrado.' };
  if (String(dono.email || '').trim().toLowerCase() !== input.email) {
    return { ok: false, status: 400, error: 'O e-mail não confere com o cadastro.' };
  }
  if (String(dono.user_type || '') !== 'client') {
    return { ok: false, status: 400, error: 'O acesso ao portal vale só para usuário de cliente.' };
  }
  if (dono.client_id && String(dono.client_id) !== String(input.clientId)) {
    return { ok: false, status: 403, error: 'O usuário não pertence a este cliente.' };
  }

  let leituraQuery = sb.from(input.tabela).select('id, senha_hash').eq('email', input.email);
  if (input.tabela === 'portal_cliente_usuarios') leituraQuery = leituraQuery.eq('client_id', input.clientId);
  const leitura = await leituraQuery.maybeSingle();
  if (leitura.error) return { ok: false, status: 500, error: 'Não foi possível ler o acesso do portal.' };
  const atual = leitura.data as { id: number | string; senha_hash?: string | null } | null;
  const preservar = preservarSenhaPortal(atual?.senha_hash);
  const status = input.ativo && input.acesso ? 'ativo' : 'inativo';

  if (!input.acesso && !atual) {
    const limpas = semMarcasDePortal(dono.permissions);
    await sb.from('system_users').update({ permissions: limpas, force_password_change: false }).eq('id', dono.id);
    return { ok: true, manteveSenha: true, acesso: false };
  }

  if (input.acesso && !preservar) {
    const senhaInvalida = validarSenha(input.senha);
    if (senhaInvalida) return { ok: false, status: 400, error: senhaInvalida };
  }

  const campos: Record<string, unknown> = {
    nome: input.nome,
    perfil: input.perfil,
    status,
    atualizado_em: new Date().toISOString(),
  };
  if (!atual) campos.email = input.email;
  if (input.tabela === 'portal_cliente_usuarios') campos.client_id = input.clientId;
  if (input.acesso && !preservar) {
    campos.senha_hash = hashSenha(input.senha);
    campos.trocar_senha = true;
    campos.senha_alterada_em = null;
  }

  const gravado = await gravarLinha(sb, input.tabela, atual?.id ?? null, campos);
  if (gravado.error || !gravado.data) {
    return { ok: false, status: 500, error: 'Não foi possível gravar o acesso do portal.' };
  }

  const permissions = input.acesso
    ? permissoesDoPortal(input.caminho, input.perfil)
    : semMarcasDePortal(dono.permissions);
  const { error: erroPermissao } = await sb.from('system_users').update({
    permissions,
    client_id: input.clientId,
    force_password_change: false,
    user_type: 'client',
  }).eq('id', dono.id);
  if (erroPermissao) return { ok: false, status: 500, error: 'O portal foi gravado, mas o cadastro não ficou restrito ao cliente.' };
  return { ok: true, manteveSenha: preservar, acesso: input.acesso };
}

/** Lê a pessoa do portal pelo e-mail. Tabela ainda não criada conta como ausente. */
export async function lerAcessoPortal(
  sb: Consulta,
  input: { tabela: string; email: string; clientId?: string | number | null },
): Promise<{ ok: true; id: string | number | null } | { ok: false; error: string }> {
  let leitura = sb.from(input.tabela).select('id').ilike('email', input.email);
  if (input.tabela === 'portal_cliente_usuarios' && input.clientId != null && String(input.clientId) !== '') {
    leitura = leitura.eq('client_id', input.clientId);
  }
  const achou = await leitura.maybeSingle();
  if (achou.error) {
    const msg = String(achou.error.message || '');
    if (/does not exist|schema cache|Could not find|PGRST205|42P01/i.test(msg)) {
      return { ok: true, id: null };
    }
    return { ok: false, error: 'Não foi possível ler o acesso do portal.' };
  }
  return { ok: true, id: achou.data?.id ?? null };
}

/**
 * Grava a senha pedida na redefinição. Diferente do cadastro, que preserva
 * o hash de quem já entra no portal.
 */
export async function aplicarSenhaNoPortal(
  sb: Consulta,
  input: {
    tabela: string;
    email: string;
    clientId?: string | number | null;
    senha: string;
    trocarSenha: boolean;
  },
): Promise<{ ok: true; atualizado: boolean } | { ok: false; error: string }> {
  const senhaInvalida = validarSenha(input.senha);
  if (senhaInvalida) return { ok: false, error: senhaInvalida };
  const acesso = await lerAcessoPortal(sb, input);
  if (!acesso.ok) return acesso;
  if (acesso.id == null) return { ok: true, atualizado: false };
  const campos: Record<string, unknown> = {
    senha_hash: hashSenha(input.senha),
    trocar_senha: input.trocarSenha,
    senha_alterada_em: input.trocarSenha ? null : new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  };
  const gravado = await gravarLinha(sb, input.tabela, acesso.id, campos);
  if (gravado.error) return { ok: false, error: 'Não foi possível gravar a nova senha do portal.' };
  return { ok: true, atualizado: true };
}
