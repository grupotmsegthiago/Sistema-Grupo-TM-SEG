/**
 * Login real do sistema. A senha é conferida no servidor e a resposta não a devolve.
 * Não há fallback para o token antigo.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { conferirSenhaExistente } from '../gestorFiscal/ponteAuth/formatoSenha';
import { usuarioSoPortal } from '../cevaPortal/regrasAcesso';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from '../supabaseAdmin';
import { gravarSenhaNoServidor } from './gravarSenha';
import { abrirSessao, emitirSessao, segredoDaSessao, tokenLegado, TTL_SESSAO_MS } from './token';

export interface RespostaLogin {
  status: number;
  body: Record<string, unknown>;
  cookies: string[];
}

export interface PedidoLogin {
  method: string;
  acao: 'login' | 'sessao' | 'logout' | 'senha' | 'confirmar' | 'personificar';
  authorization: string | null;
  body: Record<string, unknown>;
}

interface Ficha {
  id: string;
  name: string;
  email: string;
  status: string;
  password: string | null;
  client_id: string | null;
  provider_id: string | null;
  force_password_change: boolean | null;
  permissions: string[] | null;
  training_required: boolean | null;
  training_passed_at: string | null;
  training_modules: unknown;
  training_score: number | null;
  profiles: { name?: string; permissions?: string[] } | { name?: string; permissions?: string[] }[] | null;
}

function recusar(status: number, codigo: string, motivo: string, cookies: string[] = []): RespostaLogin {
  return { status, body: { ok: false, codigo, motivo }, cookies };
}

function cookieSessao(token: string, maxAge: number): string {
  const valor = maxAge > 0 ? token : '';
  return `tmseg_ponte=${valor}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

function perfilDe(ficha: Ficha): { nome: string; permissoes: string[] } {
  const bruto = ficha.profiles;
  const perfil = Array.isArray(bruto) ? bruto[0] : bruto;
  const doPerfil = Array.isArray(perfil?.permissions) ? perfil.permissions : [];
  const doUsuario = Array.isArray(ficha.permissions) ? ficha.permissions : [];
  return {
    nome: perfil?.name || 'Usuário',
    permissoes: [...new Set([...doPerfil, ...doUsuario])],
  };
}

function publico(ficha: Ficha) {
  const perfil = perfilDe(ficha);
  return {
    id: ficha.id,
    name: ficha.name,
    email: ficha.email,
    role: perfil.nome,
    permissions: perfil.permissoes,
    clientId: ficha.client_id,
    providerId: ficha.provider_id,
    force_password_change: Boolean(ficha.force_password_change),
    trainingRequired: Boolean(ficha.training_required),
    trainingPassedAt: ficha.training_passed_at || null,
    trainingModules: ficha.training_modules ?? null,
    trainingScore: ficha.training_score ?? null,
  };
}

function clienteAdmin(): SupabaseClient | null {
  const chave = getSupabaseServiceRoleKey();
  if (!chave) return null;
  return createClient(getSupabaseUrl(), chave);
}

const COLUNAS = `
  id, name, email, password, status, client_id, provider_id, force_password_change,
  permissions, training_required, training_passed_at, training_modules, training_score,
  profiles:profile_id ( name, permissions )
`;

async function porEmail(cliente: SupabaseClient, email: string): Promise<Ficha | null | 'erro'> {
  const { data, error } = await cliente.from('system_users').select(COLUNAS).ilike('email', email).maybeSingle();
  if (error) return 'erro';
  return (data as Ficha | null) ?? null;
}

async function porId(cliente: SupabaseClient, id: string): Promise<Ficha | null | 'erro'> {
  const { data, error } = await cliente.from('system_users').select(COLUNAS).eq('id', id).maybeSingle();
  if (error) return 'erro';
  return (data as Ficha | null) ?? null;
}

function sessaoDoPedido(pedido: PedidoLogin, segredo: string, agora: number) {
  const bruto = String(pedido.authorization || '');
  if (tokenLegado(bruto)) return null;
  return abrirSessao(segredo, bruto, agora);
}

export async function atenderLoginProducao(
  pedido: PedidoLogin,
  opcoes: { env?: Record<string, string | undefined>; agora?: () => number } = {},
): Promise<RespostaLogin> {
  const env = opcoes.env ?? process.env;
  const agora = opcoes.agora ?? (() => Date.now());
  const segredo = segredoDaSessao(env);
  if (!segredo) return recusar(503, 'sessao_indisponivel', 'O segredo da sessão não está configurado.');
  const cliente = clienteAdmin();
  if (!cliente) return recusar(503, 'fonte_indisponivel', 'A fonte confiável não está disponível. O acesso foi negado.');

  try {
    if (pedido.acao === 'login') return await entrar(pedido, cliente, segredo, agora());
    const aberta = sessaoDoPedido(pedido, segredo, agora());
    if (!aberta) return recusar(401, 'sessao_invalida', 'O token local não prova a sessão.');
    const ficha = await porId(cliente, aberta.usuarioId);
    if (ficha === 'erro') return recusar(503, 'fonte_indisponivel', 'A fonte confiável não respondeu. O acesso foi negado.');
    if (!ficha || ficha.status !== 'Ativo') {
      return recusar(403, 'usuario_desativado', 'Usuário desativado.', [cookieSessao('', 0)]);
    }
    if (pedido.acao === 'logout') {
      return { status: 200, body: { ok: true, codigo: 'ok' }, cookies: [cookieSessao('', 0)] };
    }
    if (pedido.acao === 'sessao') {
      return { status: 200, body: { ok: true, codigo: 'ok', usuario: publico(ficha) }, cookies: [] };
    }
    if (pedido.acao === 'confirmar') return confirmar(pedido, ficha);
    if (pedido.acao === 'senha') return trocar(pedido, cliente, ficha);
    if (pedido.acao === 'personificar') return personificar(pedido, cliente, ficha, segredo, agora());
    return recusar(405, 'metodo_nao_permitido', 'Ação não aceita.');
  } catch {
    return recusar(503, 'fonte_indisponivel', 'A fonte confiável não respondeu. O acesso foi negado.');
  }
}

async function entrar(
  pedido: PedidoLogin,
  cliente: SupabaseClient,
  segredo: string,
  agora: number,
): Promise<RespostaLogin> {
  if (pedido.method !== 'POST') return recusar(405, 'metodo_nao_permitido', 'O login seguro aceita POST.');
  if (tokenLegado(String(pedido.authorization || ''))) {
    return recusar(401, 'sessao_invalida', 'O token local não prova a sessão.');
  }
  const email = String(pedido.body.email || '').trim().toLowerCase();
  const senha = String(pedido.body.senha || '');
  if (!email || !senha.trim()) return recusar(401, 'credenciais_invalidas', 'Credenciais não conferem.');
  const ficha = await porEmail(cliente, email);
  if (ficha === 'erro') return recusar(503, 'fonte_indisponivel', 'A fonte confiável não respondeu. O acesso foi negado.');
  if (!ficha || !conferirSenhaExistente(senha, ficha.password)) {
    return recusar(401, 'credenciais_invalidas', 'Credenciais não conferem.');
  }
  if (ficha.status !== 'Ativo') return recusar(403, 'usuario_desativado', 'Usuário desativado. Nenhuma sessão foi aberta.');
  const perfil = perfilDe(ficha);
  if (usuarioSoPortal(perfil.permissoes)) {
    return recusar(403, 'portal_only', 'Este acesso é somente o portal do cliente.');
  }
  const emitida = emitirSessao(segredo, String(ficha.id), agora, TTL_SESSAO_MS);
  return {
    status: 200,
    body: { ok: true, codigo: 'ok', csrf: emitida.csrf, token: emitida.token, usuario: publico(ficha) },
    cookies: [cookieSessao(emitida.token, Math.floor(TTL_SESSAO_MS / 1000))],
  };
}

function confirmar(pedido: PedidoLogin, ficha: Ficha): RespostaLogin {
  const senha = String(pedido.body.senha || '');
  const pedidoId = String(pedido.body.usuarioId || '');
  if (pedidoId && pedidoId !== String(ficha.id)) {
    return recusar(403, 'sem_permissao', 'A confirmação exige a senha de quem está na sessão.');
  }
  const ok = conferirSenhaExistente(senha, ficha.password);
  return { status: 200, body: { ok, codigo: ok ? 'ok' : 'credenciais_invalidas' }, cookies: [] };
}

async function trocar(pedido: PedidoLogin, cliente: SupabaseClient, ficha: Ficha): Promise<RespostaLogin> {
  if (pedido.method !== 'POST') return recusar(405, 'metodo_nao_permitido', 'A troca de senha aceita POST.');
  const nova = String(pedido.body.senhaNova || '');
  const atual = String(pedido.body.senhaAtual || '');
  if (nova.trim().length < 6) return recusar(400, 'senha_curta', 'A nova senha deve ter no mínimo 6 caracteres.');
  if (atual && !conferirSenhaExistente(atual, ficha.password)) {
    return recusar(401, 'credenciais_invalidas', 'A senha atual não confere.');
  }
  await gravarSenhaNoServidor(cliente, String(ficha.id), nova.trim(), { force_password_change: false });
  return { status: 200, body: { ok: true, codigo: 'ok' }, cookies: [] };
}

async function personificar(
  pedido: PedidoLogin,
  cliente: SupabaseClient,
  ficha: Ficha,
  segredo: string,
  agora: number,
): Promise<RespostaLogin> {
  if (pedido.method !== 'POST') return recusar(405, 'metodo_nao_permitido', 'A personificação aceita POST.');
  const perfil = dobrar(perfilDe(ficha).nome);
  if (perfil !== 'diretoria' && perfil !== 'administrador' && perfil !== 'ceo') {
    return recusar(403, 'sem_permissao', 'A ficha do servidor não autoriza a auditoria de outro usuário.');
  }
  const alvoId = String(pedido.body.usuarioId || '');
  const alvo = await porId(cliente, alvoId);
  if (alvo === 'erro') return recusar(503, 'fonte_indisponivel', 'A fonte confiável não respondeu. O acesso foi negado.');
  if (!alvo || alvo.status !== 'Ativo') return recusar(403, 'usuario_desativado', 'Usuário desativado.');
  const emitida = emitirSessao(segredo, String(alvo.id), agora, TTL_SESSAO_MS);
  return {
    status: 200,
    body: { ok: true, codigo: 'ok', token: emitida.token, csrf: emitida.csrf, usuario: publico(alvo) },
    cookies: [cookieSessao(emitida.token, Math.floor(TTL_SESSAO_MS / 1000))],
  };
}

function dobrar(valor: string): string {
  return valor.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
