/**
 * Rotas HTTP reais da ponte, exercitadas sem depósito de produção.
 * A entrada da Vercel continua recusando.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import loginHttp from '../api/ponte-auth/login';
import gestorHttp from '../api/ponte-auth/gestor-fiscal';
import { INTEGRACAO_HTTP_LIBERADA } from '../lib/gestorFiscal/ponteAuth/flag';
import { gerarHashScryptCompativel } from '../lib/gestorFiscal/ponteAuth/formatoSenha';
import { gerarHashSenha } from '../lib/gestorFiscal/ponteAuth/senha';
import {
  atenderPonteHttp,
  cookieSessao,
  envComFlagHttp,
  type FonteHttp,
  type IdentidadeHttp,
  type LogHttp,
  type RequisicaoPonte,
} from '../lib/gestorFiscal/ponteAuth/httpPonte';
import { empresasPadraoDaDiretoria, type OsParaResumoHttp } from '../lib/gestorFiscal/ponteAuth/resumoGestorHttp';
import {
  sessaoAtiva,
  type ArmazenSessaoCompartilhado,
  type RegistroSessaoCompartilhada,
} from '../lib/gestorFiscal/ponteAuth/sessaoCompartilhada';
import { MissionStatus } from '../types';

class ArmazenTabelaTeste implements ArmazenSessaoCompartilhado {
  private linhas: RegistroSessaoCompartilhada[] = [];
  falhar = false;

  private checar(): void {
    if (this.falhar) throw new Error('tabela indisponivel');
  }

  async guardar(registro: RegistroSessaoCompartilhada): Promise<void> {
    this.checar();
    this.linhas.push({ ...registro });
  }

  async buscarPorTokenHash(tokenHashHex: string): Promise<RegistroSessaoCompartilhada | null> {
    this.checar();
    const achado = this.linhas.find((linha) => linha.tokenHashHex === tokenHashHex);
    return achado ? { ...achado } : null;
  }

  async revogar(tokenHashHex: string, quando: number): Promise<boolean> {
    this.checar();
    const achado = this.linhas.find((linha) => linha.tokenHashHex === tokenHashHex);
    if (!achado || achado.revogadaEm != null) return false;
    achado.revogadaEm = quando;
    return true;
  }

  async tocar(tokenHashHex: string, quando: number): Promise<void> {
    this.checar();
    const achado = this.linhas.find((linha) => linha.tokenHashHex === tokenHashHex);
    if (achado) achado.ultimaAtividade = quando;
  }

  async listarDoUsuario(usuarioId: string): Promise<RegistroSessaoCompartilhada[]> {
    this.checar();
    return this.linhas.filter((linha) => linha.usuarioId === usuarioId).map((linha) => ({ ...linha }));
  }

  ativas(usuarioId: string, agora: number): RegistroSessaoCompartilhada[] {
    return this.linhas.filter((linha) => linha.usuarioId === usuarioId && sessaoAtiva(linha, agora));
  }
}

function os(
  id: string,
  empresa: string | null,
  receita: number,
  custo: number,
  status = 'Concluída',
  contaPagadora: string | null = null,
): OsParaResumoHttp {
  return {
    id,
    status,
    empresaEmissora: empresa,
    revenue_value: receita,
    cost_value: custo,
    billing_approved: true,
    contaPagadora,
  };
}

const LINHAS: OsParaResumoHttp[] = [
  os('os-gestao', 'TM GESTÃO', 10, 4),
  os('os-seg', 'TM SEGURANÇA', 7, 1),
  os('os-sem', null, 99, 99, 'Concluída', 'TM SEGURANÇA'),
  os('os-recusada', 'TM GESTÃO', 50, 50, MissionStatus.REFUSED),
];

function leitorDe(linhas = LINHAS) {
  const chamadas: string[][] = [];
  return {
    chamadas,
    async ler(empresas: readonly string[]) {
      chamadas.push([...empresas]);
      return linhas;
    },
  };
}

function fonteDe(usuarios: IdentidadeHttp[]): FonteHttp & { falhar: boolean } {
  return {
    falhar: false,
    async porEmail(email: string) {
      if (this.falhar) throw new Error('banco');
      return usuarios.find((usuario) => usuario.email === email) ?? null;
    },
    async porId(usuarioId: string) {
      if (this.falhar) throw new Error('banco');
      const usuario = usuarios.find((item) => item.id === usuarioId);
      if (!usuario) return null;
      return {
        id: usuario.id,
        status: usuario.status,
        perfil: usuario.perfil,
        permissoes: [...usuario.permissoes],
        empresas: [...usuario.empresas],
        clienteId: usuario.clienteId,
      };
    },
  };
}

function pedido(acao: RequisicaoPonte['acao'], extra: Partial<RequisicaoPonte> = {}): RequisicaoPonte {
  return {
    acao,
    method: acao === 'login' || acao === 'logout' ? 'POST' : 'GET',
    cookie: null,
    csrf: null,
    authorization: null,
    body: {},
    consulta: {},
    ...extra,
  };
}

function tokenDoCookie(cookie: string): string {
  return cookie.split(';')[0].slice('tmseg_ponte='.length);
}

async function usuarios(): Promise<IdentidadeHttp[]> {
  return [
    { id: 'usr-diretoria', email: 'diretoria@isolado.invalid', senhaGravada: 'senha-plana-diretoria', status: 'Ativo', perfil: 'Diretoria', permissoes: ['gestor-fiscal'], empresas: [], clienteId: null },
    { id: 'usr-limitada', email: 'limitada@isolado.invalid', senhaGravada: 'senha-plana-limitada', status: 'Ativo', perfil: 'Diretoria', permissoes: ['gestor-fiscal'], empresas: ['TM GESTAO'], clienteId: null },
    { id: 'usr-scrypt', email: 'scrypt@isolado.invalid', senhaGravada: gerarHashScryptCompativel('senha-scrypt-diretoria'), status: 'Ativo', perfil: 'Diretoria', permissoes: ['gestor-fiscal'], empresas: ['TM GESTAO'], clienteId: null },
    { id: 'usr-financeiro', email: 'financeiro@isolado.invalid', senhaGravada: 'senha-plana-financeiro', status: 'Ativo', perfil: 'Financeiro', permissoes: ['fin-dashboard'], empresas: ['TM GESTAO'], clienteId: null },
    { id: 'usr-portal', email: 'portal@isolado.invalid', senhaGravada: 'senha-plana-portal', status: 'Ativo', perfil: 'Cliente', permissoes: ['portal-only'], empresas: [], clienteId: 'cli-a' },
    { id: 'usr-avancado', email: 'avancado@isolado.invalid', senhaGravada: 'senha-plana-avancado', status: 'Ativo', perfil: 'Avançado', permissoes: ['*'], empresas: [], clienteId: null },
    { id: 'usr-inativo', email: 'inativo@isolado.invalid', senhaGravada: 'senha-plana-inativo', status: 'Inativo', perfil: 'Diretoria', permissoes: ['gestor-fiscal'], empresas: [], clienteId: null },
    { id: 'usr-bcrypt', email: 'bcrypt@isolado.invalid', senhaGravada: '$2b$10$isto-nao-e-texto', status: 'Ativo', perfil: 'Diretoria', permissoes: ['gestor-fiscal'], empresas: [], clienteId: null },
    { id: 'usr-fase2', email: 'fase2@isolado.invalid', senhaGravada: await gerarHashSenha('senha-fase2'), status: 'Ativo', perfil: 'Diretoria', permissoes: ['gestor-fiscal'], empresas: [], clienteId: null },
  ];
}

test('a rota HTTP recusa com a flag desligada e também com as flags ligadas', async () => {
  assert.equal(INTEGRACAO_HTTP_LIBERADA, false);
  const armazen = new ArmazenTabelaTeste();
  const fonte = fonteDe(await usuarios());
  const leitor = leitorDe();
  const desligada = await atenderPonteHttp(pedido('login', { body: { email: 'diretoria@isolado.invalid', senha: 'senha-plana-diretoria' } }), {
    env: envComFlagHttp(false, true),
    armazen,
    fonte,
    leitor,
    testeLocal: true,
  });
  assert.equal(desligada.body.codigo, 'ponte_desligada');
  assert.equal(armazen.ativas('usr-diretoria', Date.now()).length, 0);
  assert.equal(leitor.chamadas.length, 0);

  const incompleta = await atenderPonteHttp(pedido('gestor'), {
    env: envComFlagHttp(true, true),
    armazen,
    fonte,
    leitor,
    testeLocal: false,
  });
  assert.equal(incompleta.body.codigo, 'integracao_incompleta');
  assert.equal(leitor.chamadas.length, 0);

  const anteriorAuth = process.env.GESTOR_FISCAL_PONTE_AUTH_ENABLED;
  const anteriorHttp = process.env.GESTOR_FISCAL_PONTE_HTTP_ARMADA;
  try {
    delete process.env.GESTOR_FISCAL_PONTE_AUTH_ENABLED;
    delete process.env.GESTOR_FISCAL_PONTE_HTTP_ARMADA;
    const capturado = await chamar(loginHttp, { method: 'POST', body: { email: 'a', senha: 'b', perfil: 'Diretoria' } });
    assert.equal(capturado.status, 403);
    assert.equal((capturado.body as { codigo: string }).codigo, 'ponte_desligada');
    process.env.GESTOR_FISCAL_PONTE_AUTH_ENABLED = 'true';
    process.env.GESTOR_FISCAL_PONTE_HTTP_ARMADA = 'true';
    const armada = await chamar(gestorHttp, { method: 'GET', query: { cnpj: '99999999000199', perfil: 'Diretoria' } });
    assert.equal(armada.status, 403);
    assert.equal((armada.body as { codigo: string }).codigo, 'integracao_incompleta');
    assert.equal(JSON.stringify(armada.body).includes('empresaKey'), false);
  } finally {
    restaurar('GESTOR_FISCAL_PONTE_AUTH_ENABLED', anteriorAuth);
    restaurar('GESTOR_FISCAL_PONTE_HTTP_ARMADA', anteriorHttp);
  }
});

test('login nos formatos existentes, cookie, CSRF e sessão entre instâncias', async () => {
  let agora = 20_000;
  const armazen = new ArmazenTabelaTeste();
  const fonte = fonteDe(await usuarios());
  const leitor = leitorDe();
  const logs: LogHttp[] = [];
  const base = { env: envComFlagHttp(true), agora: () => agora, armazen, fonte, leitor, logs, testeLocal: true as const };

  const plana = await atenderPonteHttp(pedido('login', {
    body: { email: 'diretoria@isolado.invalid', senha: 'senha-plana-diretoria', perfil: 'Diretoria', permissoes: ['*'], cnpj: '99999999000199' },
    authorization: 'Bearer tmseg-token-usr-diretoria-1',
  }), base);
  assert.equal(plana.body.codigo, 'sessao_invalida');

  const login = await atenderPonteHttp(pedido('login', {
    body: { email: 'diretoria@isolado.invalid', senha: 'senha-plana-diretoria', perfil: 'Financeiro', cnpj: '99999999000199' },
  }), base);
  assert.equal(login.status, 200);
  const cookie = login.cookies[0];
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  const token = tokenDoCookie(cookie);
  assert.equal(JSON.stringify(login.body).includes(token), false);
  assert.equal(JSON.stringify(login.body).includes('senha-plana-diretoria'), false);
  const csrf = String(login.body.csrf);
  assert.equal(csrf.length > 20, true);

  const scrypt = await atenderPonteHttp(pedido('login', {
    body: { email: 'scrypt@isolado.invalid', senha: 'senha-scrypt-diretoria' },
  }), base);
  assert.equal(scrypt.status, 200);
  assert.equal((await atenderPonteHttp(pedido('login', { body: { email: 'bcrypt@isolado.invalid', senha: '$2b$10$isto-nao-e-texto' } }), base)).body.codigo, 'credenciais_invalidas');
  assert.equal((await atenderPonteHttp(pedido('login', { body: { email: 'fase2@isolado.invalid', senha: 'senha-fase2' } }), base)).body.codigo, 'credenciais_invalidas');
  assert.equal((await atenderPonteHttp(pedido('login', { body: { email: 'ninguem@isolado.invalid', senha: 'senha-plana-diretoria' } }), base)).body.codigo, 'credenciais_invalidas');
  assert.equal((await atenderPonteHttp(pedido('login', { body: { email: 'inativo@isolado.invalid', senha: 'senha-plana-inativo' } }), base)).body.codigo, 'usuario_desativado');

  const semCsrf = await atenderPonteHttp(pedido('sessao', { cookie: `tmseg_ponte=${token}` }), base);
  assert.equal(semCsrf.body.codigo, 'csrf_invalido');
  const csrfErrado = await atenderPonteHttp(pedido('sessao', { cookie: `tmseg_ponte=${token}`, csrf: `${csrf}x` }), base);
  assert.equal(csrfErrado.body.codigo, 'csrf_invalido');
  const legado = await atenderPonteHttp(pedido('sessao', { cookie: 'tmseg_ponte=tmseg-token-usr-diretoria-1', csrf }), base);
  assert.equal(legado.body.codigo, 'sessao_invalida');

  agora += 5_000;
  const sessao = await atenderPonteHttp(pedido('sessao', {
    cookie: `outro=1; tmseg_ponte=${token}`,
    csrf,
    consulta: { perfil: 'Financeiro', cnpj: '99999999000199' },
  }), base);
  assert.equal(sessao.status, 200);
  assert.equal(sessao.body.usuarioId, 'usr-diretoria');
  assert.equal(JSON.stringify(sessao.body).includes('gestor-fiscal'), false);
  const atividade = (await armazen.listarDoUsuario('usr-diretoria')).find((linha) => linha.ultimaAtividade === agora);
  assert.ok(atividade);

  const gestor = await atenderPonteHttp(pedido('gestor', {
    cookie: `tmseg_ponte=${token}`,
    csrf,
    consulta: { cnpj: '99999999000199', perfil: 'Financeiro' },
  }), base);
  assert.equal(gestor.status, 200);
  assert.equal(gestor.body.homologacaoReal, false);
  const empresas = gestor.body.empresas as { empresaKey: string; quantidadeOs: number; receita: number; custo: number }[];
  assert.deepEqual(empresas.map((linha) => linha.empresaKey).sort(), ['TM GESTAO', 'TM SEGURANCA']);
  assert.deepEqual(empresas.find((linha) => linha.empresaKey === 'TM GESTAO'), { empresaKey: 'TM GESTAO', quantidadeOs: 1, receita: 10, custo: 4 });
  assert.deepEqual(empresas.find((linha) => linha.empresaKey === 'TM SEGURANCA'), { empresaKey: 'TM SEGURANCA', quantidadeOs: 1, receita: 7, custo: 1 });
  assert.deepEqual(leitor.chamadas[0], empresasPadraoDaDiretoria());
  assert.equal(JSON.stringify(gestor.body).includes('os-sem'), false);
  assert.equal(JSON.stringify(gestor.body).includes('contaPagadora'), false);

  agora = 20_000 + 12 * 60 * 60 * 1000;
  assert.equal((await atenderPonteHttp(pedido('gestor', { cookie: `tmseg_ponte=${token}`, csrf }), base)).body.codigo, 'sessao_expirada');
  agora = 30_000;
  const novo = await atenderPonteHttp(pedido('login', { body: { email: 'diretoria@isolado.invalid', senha: 'senha-plana-diretoria' } }), base);
  const tokenNovo = tokenDoCookie(novo.cookies[0]);
  const csrfNovo = String(novo.body.csrf);
  const saiu = await atenderPonteHttp(pedido('logout', { cookie: `tmseg_ponte=${tokenNovo}`, csrf: csrfNovo }), base);
  assert.equal(saiu.status, 200);
  assert.match(saiu.cookies[0], /Max-Age=0/);
  assert.equal((await atenderPonteHttp(pedido('sessao', { cookie: `tmseg_ponte=${tokenNovo}`, csrf: csrfNovo }), base)).body.codigo, 'sessao_revogada');

  const texto = JSON.stringify(logs);
  assert.equal(texto.includes('senha-plana-diretoria'), false);
  assert.equal(texto.includes(token), false);
  assert.equal(texto.includes(csrf), false);
  assert.equal(cookieSessao('abc', 10).includes('HttpOnly'), true);
});

test('escopo, perfis recusados, falha de banco, concorrência e rotas antigas', async () => {
  let agora = 40_000;
  const armazen = new ArmazenTabelaTeste();
  const fonte = fonteDe(await usuarios());
  const leitor = leitorDe();
  const logs: LogHttp[] = [];
  const base = { env: envComFlagHttp(true), agora: () => agora, armazen, fonte, leitor, logs, testeLocal: true as const };
  const limitada = await atenderPonteHttp(pedido('login', { body: { email: 'limitada@isolado.invalid', senha: 'senha-plana-limitada' } }), base);
  const token = tokenDoCookie(limitada.cookies[0]);
  const csrf = String(limitada.body.csrf);
  const troca = await atenderPonteHttp(pedido('gestor', {
    cookie: `tmseg_ponte=${token}`,
    csrf,
    consulta: { empresa: 'TM SEGURANCA', cnpj: '99999999000199', perfil: 'Diretoria' },
    body: { permissoes: ['*'] },
  }), base);
  assert.equal(troca.body.codigo, 'empresa_nao_autorizada');
  assert.equal(leitor.chamadas.length, 0);
  const sua = await atenderPonteHttp(pedido('gestor', {
    cookie: `tmseg_ponte=${token}`,
    csrf,
    consulta: { cnpj: '99999999000199' },
  }), base);
  assert.equal(sua.status, 200);
  assert.deepEqual((sua.body.empresas as { empresaKey: string }[]).map((linha) => linha.empresaKey), ['TM GESTAO']);
  assert.deepEqual(leitor.chamadas[0], ['TM GESTAO']);

  for (const email of ['financeiro@isolado.invalid', 'portal@isolado.invalid', 'avancado@isolado.invalid']) {
    const senha = email.startsWith('financeiro') ? 'senha-plana-financeiro' : email.startsWith('portal') ? 'senha-plana-portal' : 'senha-plana-avancado';
    const entrou = await atenderPonteHttp(pedido('login', { body: { email, senha } }), base);
    const visto = await atenderPonteHttp(pedido('gestor', {
      cookie: `tmseg_ponte=${tokenDoCookie(entrou.cookies[0])}`,
      csrf: String(entrou.body.csrf),
      consulta: { perfil: 'Diretoria', cnpj: '99999999000199' },
    }), base);
    assert.equal(visto.body.codigo, 'sem_permissao');
  }
  assert.equal(leitor.chamadas.length, 1);

  fonte.falhar = true;
  const queda = await atenderPonteHttp(pedido('gestor', { cookie: `tmseg_ponte=${token}`, csrf }), base);
  assert.equal(queda.body.codigo, 'fonte_indisponivel');
  assert.equal(leitor.chamadas.length, 1);
  fonte.falhar = false;
  armazen.falhar = true;
  assert.equal((await atenderPonteHttp(pedido('sessao', { cookie: `tmseg_ponte=${token}`, csrf }), base)).body.codigo, 'fonte_indisponivel');
  armazen.falhar = false;

  const segundaInstancia = armazen;
  const sessoes: { token: string; csrf: string }[] = [];
  for (let i = 0; i < 4; i += 1) {
    agora += 1;
    const entrou = await atenderPonteHttp(pedido('login', { body: { email: 'diretoria@isolado.invalid', senha: 'senha-plana-diretoria' } }), {
      ...base,
      armazen: segundaInstancia,
    });
    sessoes.push({ token: tokenDoCookie(entrou.cookies[0]), csrf: String(entrou.body.csrf) });
  }
  assert.equal(segundaInstancia.ativas('usr-diretoria', agora).length, 3);
  const antiga = await atenderPonteHttp(pedido('sessao', {
    cookie: `tmseg_ponte=${sessoes[0].token}`,
    csrf: sessoes[0].csrf,
  }), { ...base, armazen: segundaInstancia });
  assert.equal(antiga.body.codigo, 'sessao_revogada');
  const vigente = await atenderPonteHttp(pedido('sessao', {
    cookie: `tmseg_ponte=${sessoes[3].token}`,
    csrf: sessoes[3].csrf,
  }), { ...base, armazen: segundaInstancia });
  assert.equal(vigente.status, 200);

  const loginAtual = fs.readFileSync('components/Login.tsx', 'utf8');
  assert.equal(loginAtual.includes('userCheck.password !== cleanPassword'), true);
  assert.equal(loginAtual.includes('ponteAuth'), false);
  const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8')) as { functions: Record<string, unknown> };
  assert.equal(Object.keys(vercel.functions).length, 50);
  assert.equal(vercel.functions['api/ponte-auth/login.ts'], undefined);
  for (const nome of ['login.ts', 'sessao.ts', 'logout.ts', 'gestor-fiscal.ts']) {
    const texto = fs.readFileSync(`api/ponte-auth/${nome}`, 'utf8');
    assert.equal(texto.includes('testeLocal'), false);
  }
  const sql = fs.readFileSync('docs/gestorFiscal/sql/2026_10_19_ponte_sessoes.NAO_EXECUTAR.sql', 'utf8');
  assert.match(sql, /NÃO EXECUTAR/);
  assert.equal(sql.includes('ALTER TABLE public.system_users'), false);
  assert.equal(fs.readFileSync('lib/gestorFiscal/homologacaoReal/flag.ts', 'utf8').includes("=== 'true'"), true);
});

function restaurar(nome: string, valor: string | undefined): void {
  if (valor === undefined) delete process.env[nome];
  else process.env[nome] = valor;
}

async function chamar(
  handler: (req: { method?: string; headers?: Record<string, string>; body?: unknown; query?: Record<string, string> }, res: { setHeader: (nome: string, valor: string | string[]) => void; status: (codigo: number) => { json: (corpo: unknown) => void } }) => Promise<void>,
  req: { method?: string; headers?: Record<string, string>; body?: unknown; query?: Record<string, string> },
): Promise<{ status: number; body: unknown }> {
  let status = 0;
  let body: unknown = null;
  await handler(req, {
    setHeader() {},
    status(codigo: number) {
      status = codigo;
      return { json(corpo: unknown) { body = corpo; } };
    },
  });
  return { status, body };
}
