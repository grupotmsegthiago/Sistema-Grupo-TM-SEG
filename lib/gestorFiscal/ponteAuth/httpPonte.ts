/**
 * Integração HTTP da ponte. A entrada da Vercel não passa do portão.
 * testeLocal existe só para a suíte exercitar o mesmo fluxo com depósito compartilhado.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { FLAG_PONTE_HTTP, INTEGRACAO_HTTP_LIBERADA, ponteAuthHabilitada, ponteHttpArmada } from './flag';
import { conferirSenhaExistente } from './formatoSenha';
import { empresasPadraoDaDiretoria, resumirGestorCanonico, type OsParaResumoHttp } from './resumoGestorHttp';
import { sessaoAtiva, type ArmazenSessaoCompartilhado } from './sessaoCompartilhada';
import { avancado, portal } from './autorizacao';
import type { UsuarioConfiavel } from './tipos';

const TTL_MS = 12 * 60 * 60 * 1000;
const LIMITE_SESSOES = 3;
const COOKIE = 'tmseg_ponte';

export type AcaoHttp = 'login' | 'sessao' | 'logout' | 'gestor';

export interface IdentidadeHttp extends UsuarioConfiavel {
  email: string;
  senhaGravada: string;
}

export interface FonteHttp {
  porEmail(email: string): Promise<IdentidadeHttp | null>;
  porId(usuarioId: string): Promise<UsuarioConfiavel | null>;
}

export interface LeitorGestorHttp {
  ler(empresas: readonly string[]): Promise<OsParaResumoHttp[]>;
}

export interface RequisicaoPonte {
  acao: AcaoHttp;
  method: string;
  cookie: string | null;
  csrf: string | null;
  authorization: string | null;
  body: Record<string, unknown>;
  consulta: Record<string, string>;
}

export interface RespostaPonte {
  status: number;
  body: Record<string, unknown>;
  cookies: string[];
  headers: Record<string, string>;
}

export interface LogHttp {
  codigo: string;
  acao: AcaoHttp;
  usuarioId: string | null;
}

export interface OpcoesPonteHttp {
  env?: Record<string, string | undefined>;
  agora?: () => number;
  armazen?: ArmazenSessaoCompartilhado;
  fonte?: FonteHttp;
  leitor?: LeitorGestorHttp;
  logs?: LogHttp[];
  testeLocal?: boolean;
}

function recusar(status: number, codigo: string, motivo: string, cookies: string[] = []): RespostaPonte {
  return {
    status,
    body: { ok: false, codigo, motivo, homologacaoReal: false },
    cookies,
    headers: { 'Cache-Control': 'no-store' },
  };
}

function ok(body: Record<string, unknown>, cookies: string[] = []): RespostaPonte {
  return {
    status: 200,
    body: { ok: true, homologacaoReal: false, ...body },
    cookies,
    headers: { 'Cache-Control': 'no-store' },
  };
}

function hashHex(valor: string): string {
  return createHash('sha256').update(valor).digest('hex');
}

function hashesIguais(esquerda: string, direita: string): boolean {
  const a = Buffer.from(esquerda);
  const b = Buffer.from(direita);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function cookieSessao(token: string, maxAgeSegundos: number): string {
  const valor = maxAgeSegundos > 0 ? token : '';
  return `${COOKIE}=${valor}; HttpOnly; Secure; SameSite=Strict; Path=/api/ponte-auth; Max-Age=${maxAgeSegundos}`;
}

function tokenDoCookie(cookie: string | null): string {
  if (!cookie) return '';
  for (const parte of cookie.split(';')) {
    const [nome, ...resto] = parte.trim().split('=');
    if (nome === COOKIE) return resto.join('=');
  }
  return '';
}

function tokenLegado(token: string): boolean {
  return token.startsWith('tmseg-token-') || token.startsWith('impersonation-token-');
}

function podeGestor(usuario: UsuarioConfiavel): boolean {
  if (usuario.status !== 'Ativo' || portal(usuario) || avancado(usuario)) return false;
  return usuario.perfil === 'Diretoria' && usuario.permissoes.includes('gestor-fiscal');
}

function empresasDoUsuario(usuario: UsuarioConfiavel): string[] {
  return usuario.empresas.length ? [...usuario.empresas] : empresasPadraoDaDiretoria();
}

export async function atenderPonteHttp(req: RequisicaoPonte, opcoes: OpcoesPonteHttp = {}): Promise<RespostaPonte> {
  const env = opcoes.env ?? (typeof process === 'undefined' ? {} : process.env);
  if (!ponteAuthHabilitada(env)) {
    return recusar(403, 'ponte_desligada', 'A ponte HTTP está desligada.');
  }
  const liberada = INTEGRACAO_HTTP_LIBERADA && ponteHttpArmada(env);
  if (!liberada && !opcoes.testeLocal) {
    return recusar(403, 'integracao_incompleta', 'A flag não arma a ponte. A integração HTTP continua fechada.');
  }
  if (!opcoes.armazen || !opcoes.fonte || !opcoes.leitor) {
    return recusar(403, 'integracao_incompleta', 'A ponte HTTP não tem depósito compartilhado nesta fase.');
  }
  const agora = opcoes.agora ?? (() => Date.now());
  const logs = opcoes.logs;
  const anotar = (codigo: string, usuarioId: string | null) => {
    logs?.push({ codigo, acao: req.acao, usuarioId });
  };
  try {
    if (req.acao === 'login') return await entrar(req, opcoes.fonte, opcoes.armazen, agora, anotar);
    return await continuar(req, opcoes.fonte, opcoes.armazen, opcoes.leitor, agora, anotar);
  } catch {
    anotar('fonte_indisponivel', null);
    return recusar(503, 'fonte_indisponivel', 'A fonte confiável não respondeu. O acesso foi negado.');
  }
}

async function entrar(
  req: RequisicaoPonte,
  fonte: FonteHttp,
  armazen: ArmazenSessaoCompartilhado,
  agora: () => number,
  anotar: (codigo: string, usuarioId: string | null) => void,
): Promise<RespostaPonte> {
  if (req.method !== 'POST') return recusar(405, 'metodo_nao_permitido', 'O login seguro aceita POST.');
  if (tokenLegado(String(req.authorization || '').replace(/^Bearer\s+/i, '').trim())) {
    anotar('sessao_invalida', null);
    return recusar(401, 'sessao_invalida', 'O token local não prova a sessão.');
  }
  const email = String(req.body.email || '').trim().toLowerCase();
  const senha = String(req.body.senha || '');
  const identidade = email ? await fonte.porEmail(email) : null;
  if (!identidade || !conferirSenhaExistente(senha, identidade.senhaGravada)) {
    anotar('credenciais_invalidas', null);
    return recusar(401, 'credenciais_invalidas', 'Credenciais não conferem.');
  }
  if (identidade.status !== 'Ativo') {
    anotar('usuario_desativado', null);
    return recusar(403, 'usuario_desativado', 'Usuário desativado. Nenhuma sessão foi aberta.');
  }
  const momento = agora();
  const id = `http-${randomBytes(8).toString('hex')}`;
  const segredo = randomBytes(32).toString('base64url');
  const token = `ponte.http.${id}.${segredo}`;
  const csrf = randomBytes(32).toString('base64url');
  await armazen.guardar({
    id,
    usuarioId: identidade.id,
    tokenHashHex: hashHex(token),
    csrfHashHex: hashHex(csrf),
    criadaEm: momento,
    expiraEm: momento + TTL_MS,
    revogadaEm: null,
    ultimaAtividade: momento,
  });
  await limitarSessoes(armazen, identidade.id, token, momento);
  anotar('ok', identidade.id);
  return ok({ codigo: 'ok', csrf }, [cookieSessao(token, TTL_MS / 1000)]);
}

async function limitarSessoes(
  armazen: ArmazenSessaoCompartilhado,
  usuarioId: string,
  tokenAtual: string,
  agora: number,
): Promise<void> {
  const ativas = (await armazen.listarDoUsuario(usuarioId))
    .filter((registro) => sessaoAtiva(registro, agora))
    .sort((a, b) => a.criadaEm - b.criadaEm);
  const excesso = ativas.length - LIMITE_SESSOES;
  if (excesso <= 0) return;
  const hashAtual = hashHex(tokenAtual);
  const antigas = ativas.filter((registro) => registro.tokenHashHex !== hashAtual);
  for (const registro of antigas.slice(0, excesso)) {
    await armazen.revogar(registro.tokenHashHex, agora);
  }
}

async function continuar(
  req: RequisicaoPonte,
  fonte: FonteHttp,
  armazen: ArmazenSessaoCompartilhado,
  leitor: LeitorGestorHttp,
  agora: () => number,
  anotar: (codigo: string, usuarioId: string | null) => void,
): Promise<RespostaPonte> {
  if ((req.acao === 'logout' && req.method !== 'POST') || (req.acao !== 'logout' && req.method !== 'GET')) {
    return recusar(405, 'metodo_nao_permitido', 'Método não aceito nesta rota.');
  }
  const token = tokenDoCookie(req.cookie);
  if (!token) {
    anotar('sem_autenticacao', null);
    return recusar(401, 'sem_autenticacao', 'A rota protegida exige sessão.');
  }
  if (tokenLegado(token) || tokenLegado(String(req.authorization || ''))) {
    anotar('sessao_invalida', null);
    return recusar(401, 'sessao_invalida', 'O token local não prova a sessão.');
  }
  const csrf = String(req.csrf || '');
  if (!csrf) {
    anotar('csrf_invalido', null);
    return recusar(403, 'csrf_invalido', 'Falta a proteção da sessão.');
  }
  const registro = await armazen.buscarPorTokenHash(hashHex(token));
  if (!registro || !hashesIguais(registro.csrfHashHex, hashHex(csrf))) {
    anotar(registro ? 'csrf_invalido' : 'sessao_invalida', registro?.usuarioId ?? null);
    return recusar(registro ? 403 : 401, registro ? 'csrf_invalido' : 'sessao_invalida', 'A sessão não confere.');
  }
  const momento = agora();
  if (registro.revogadaEm != null) {
    anotar('sessao_revogada', registro.usuarioId);
    return recusar(401, 'sessao_revogada', 'Sessão revogada.', [cookieSessao('', 0)]);
  }
  if (momento >= registro.expiraEm) {
    anotar('sessao_expirada', registro.usuarioId);
    return recusar(401, 'sessao_expirada', 'Sessão expirada.', [cookieSessao('', 0)]);
  }
  const usuario = await fonte.porId(registro.usuarioId);
  if (!usuario || usuario.status !== 'Ativo') {
    anotar('usuario_desativado', registro.usuarioId);
    return recusar(403, 'usuario_desativado', 'Usuário desativado. A permissão foi relida no servidor.');
  }
  if (req.acao === 'logout') {
    await armazen.revogar(registro.tokenHashHex, momento);
    anotar('ok', usuario.id);
    return ok({ codigo: 'ok' }, [cookieSessao('', 0)]);
  }
  await armazen.tocar(registro.tokenHashHex, momento);
  if (req.acao === 'sessao') {
    anotar('ok', usuario.id);
    return ok({ codigo: 'ok', usuarioId: usuario.id });
  }
  if (!podeGestor(usuario)) {
    anotar('sem_permissao', usuario.id);
    return recusar(403, 'sem_permissao', 'A ficha do servidor não autoriza o Gestor Fiscal.');
  }
  const empresas = empresasDoUsuario(usuario);
  const pedida = String(req.consulta.empresa || req.body.empresa || '').trim();
  if (pedida && !empresas.includes(pedida)) {
    anotar('empresa_nao_autorizada', usuario.id);
    return recusar(403, 'empresa_nao_autorizada', 'A empresa informada não está na ficha do servidor.');
  }
  const linhas = await leitor.ler(pedida ? [pedida] : empresas);
  anotar('ok', usuario.id);
  return ok({ codigo: 'ok', empresas: resumirGestorCanonico(linhas, pedida ? [pedida] : empresas) });
}

export function envComFlagHttp(ligada: boolean, httpArmada = false): Record<string, string | undefined> {
  return {
    [FLAG_PONTE_HTTP]: httpArmada ? 'true' : '',
    GESTOR_FISCAL_PONTE_AUTH_ENABLED: ligada ? 'true' : '',
  };
}
