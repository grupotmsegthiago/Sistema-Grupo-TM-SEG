import assert from 'node:assert/strict';
import test from 'node:test';
import { autorizarTabela, type FichaServidor } from '../lib/dadosProtegidos/tabelas';
import { atenderDadosProtegidos, tabelaDaUrl } from '../lib/dadosProtegidos/proxy';
import { gravarSenhaNoServidor } from '../lib/sessao/gravarSenha';
import { atenderLoginProducao } from '../lib/sessao/loginProducao';
import { abrirSessao, emitirSessao, tokenLegado, usuarioIdDoToken } from '../lib/sessao/token';
import { gerarHashVersionado } from '../lib/gestorFiscal/ponteAuth/hashSenha';

const SEGREDO = 'segredo-de-teste-p0';

function ficha(parcial: Partial<FichaServidor> = {}): FichaServidor {
  return {
    id: 'fun',
    status: 'Ativo',
    perfil: 'Operacional',
    permissoes: ['missions'],
    clienteId: null,
    ...parcial,
  };
}

test('token antigo não abre sessão e o assinado não vaza a senha', () => {
  assert.equal(tokenLegado('tmseg-token-fun-1'), true);
  assert.equal(tokenLegado('impersonation-token-fun-1'), true);
  assert.equal(usuarioIdDoToken('tmseg-token-fun-1', { SESSION_SECRET: SEGREDO }), null);
  const emitido = emitirSessao(SEGREDO, 'fun-1');
  assert.equal(abrirSessao(SEGREDO, emitido.token)?.usuarioId, 'fun-1');
  assert.equal(abrirSessao(SEGREDO, `${emitido.token}x`), null);
  assert.equal(usuarioIdDoToken(emitido.token, { SESSION_SECRET: SEGREDO }), 'fun-1');
});

test('a autorização separa anônimo, portal, avançado e financeiro', () => {
  assert.equal(autorizarTabela(null, 'missions', 'GET'), 'sem_autenticacao');
  assert.equal(autorizarTabela(ficha({ status: 'Inativo' }), 'missions', 'GET'), 'sem_autenticacao');
  assert.equal(autorizarTabela(ficha(), 'missions', 'PATCH'), 'ok');
  assert.equal(autorizarTabela(ficha(), 'financial_invoices', 'GET'), 'ok');
  assert.equal(autorizarTabela(ficha(), 'financial_invoices', 'POST'), 'sem_permissao');
  assert.equal(autorizarTabela(ficha({ perfil: 'Financeiro' }), 'financial_invoices', 'POST'), 'ok');
  assert.equal(autorizarTabela(ficha({ perfil: 'Avançado', permissoes: ['*'] }), 'financial_invoices', 'GET'), 'sem_permissao');
  assert.equal(autorizarTabela(ficha({ permissoes: ['portal-only'], clienteId: 'c-a' }), 'financial_invoices', 'GET'), 'sem_permissao');
  assert.equal(autorizarTabela(ficha({ permissoes: ['portal-only'], clienteId: 'c-a' }), 'missions', 'GET'), 'ok');
  assert.equal(autorizarTabela(ficha({ permissoes: ['portal-only'], clienteId: 'c-a' }), 'missions', 'PATCH'), 'sem_permissao');
});

test('o proxy recusa token antigo e não encaminha fora das dez tabelas', async () => {
  let chamadas = 0;
  const resposta = await atenderDadosProtegidos({
    method: 'GET',
    url: 'https://ajhmmjuewdsukecaimik.supabase.co/rest/v1/financial_invoices?select=*',
    headers: {},
    body: null,
    authorization: 'Bearer tmseg-token-fun-1',
  }, {
    env: { SESSION_SECRET: SEGREDO },
    encaminhar: async () => {
      chamadas += 1;
      return new Response('nao', { status: 200 });
    },
  });
  assert.equal(resposta.status, 401);
  assert.equal(chamadas, 0);
  assert.equal(tabelaDaUrl('https://outro.supabase.co/rest/v1/missions', 'https://ajhmmjuewdsukecaimik.supabase.co'), null);
  assert.equal(tabelaDaUrl('https://ajhmmjuewdsukecaimik.supabase.co/rest/v1/system_users?select=password', 'https://ajhmmjuewdsukecaimik.supabase.co'), null);
});

test('o proxy encaminha a OS de quem tem sessão e esconde a chave', async () => {
  const emitido = emitirSessao(SEGREDO, 'fun');
  let destino = '';
  let autorizacao = '';
  const resposta = await atenderDadosProtegidos({
    method: 'GET',
    url: 'https://ajhmmjuewdsukecaimik.supabase.co/rest/v1/missions?select=id',
    headers: { accept: 'application/json' },
    body: null,
    authorization: `Bearer ${emitido.token}`,
  }, {
    env: { SESSION_SECRET: SEGREDO },
    chave: 'chave-de-teste',
    buscar: async () => ficha(),
    encaminhar: async (url, init) => {
      destino = url;
      autorizacao = String((init.headers as Headers).get('authorization'));
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  assert.equal(resposta.status, 200);
  assert.match(destino, /\/rest\/v1\/missions\?select=id$/);
  assert.equal(resposta.body.includes(autorizacao), false);
  assert.match(autorizacao, /^Bearer /);
});

test('login de produção não devolve senha e exige segredo', async () => {
  const semSegredo = await atenderLoginProducao({
    method: 'POST',
    acao: 'login',
    authorization: null,
    body: { email: 'a@isolado.invalid', senha: 'senha-ficticia' },
  }, { env: {} });
  assert.equal(semSegredo.body.codigo, 'sessao_indisponivel');
  assert.equal(JSON.stringify(semSegredo.body).includes('senha-ficticia'), false);
});

test('grava hash e, se a coluna não existe, preserva o texto', async () => {
  const chamadas: Record<string, unknown>[] = [];
  const cliente = {
    from() {
      return {
        update(valores: Record<string, unknown>) {
          chamadas.push(valores);
          return {
            eq: async () => ({ error: chamadas.length === 1 ? { message: 'column password_hash does not exist' } : null }),
          };
        },
      };
    },
  };
  const modo = await gravarSenhaNoServidor(cliente, 'fun', 'senha-ficticia-nova', { force_password_change: true, session_epoch: 1 });
  assert.equal(modo, 'texto');
  assert.equal(String(chamadas[0].password_hash).startsWith('scrypt$v1$'), true);
  assert.equal(chamadas[0].password, null);
  assert.equal(chamadas[1].password, 'senha-ficticia-nova');
  assert.equal(chamadas[1].force_password_change, undefined);
  assert.equal(chamadas[1].session_epoch, undefined);
  assert.equal(JSON.stringify(chamadas).includes('senha-ficticia-nova') && chamadas[0].password === null, true);
});

test('erro diferente de coluna ausente não grava a senha em texto', async () => {
  const cliente = {
    from() {
      return {
        update() {
          return { eq: async () => ({ error: { message: 'permissão recusada' } }) };
        },
      };
    },
  };
  await assert.rejects(() => gravarSenhaNoServidor(cliente, 'fun', 'senha-ficticia-nova'));
});

test('sessão expirada não autentica', async () => {
  const emitido = emitirSessao(SEGREDO, 'fun', 1_000, 10);
  const resposta = await atenderLoginProducao({
    method: 'GET',
    acao: 'sessao',
    authorization: `Bearer ${emitido.token}`,
    body: {},
  }, {
    env: { SESSION_SECRET: SEGREDO },
    agora: () => 2_000,
    cliente: { from() { return {}; } } as never,
  });
  assert.equal(resposta.status, 401);
  assert.equal(JSON.stringify(resposta.body).includes('password'), false);
});

function clienteComFicha(ficha: Record<string, unknown> | null) {
  const updates: Record<string, unknown>[] = [];
  const cliente = {
    from() {
      return {
        select() {
          return {
            ilike() {
              return { maybeSingle: async () => ({ data: ficha, error: null }) };
            },
            eq() {
              return { maybeSingle: async () => ({ data: ficha, error: null }) };
            },
          };
        },
        update(valores: Record<string, unknown>) {
          updates.push(valores);
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };
  return { cliente, updates };
}

const FICHA_BASE = {
  id: '7',
  name: 'Operador',
  email: 'op@isolado.invalid',
  status: 'Ativo',
  client_id: null,
  provider_id: null,
  force_password_change: false,
  permissions: ['missions'],
  training_required: false,
  training_passed_at: null,
  training_modules: [],
  training_score: null,
  profiles: { name: 'Operacional', permissions: ['missions'] },
  session_epoch: 0,
};

test('login com hash não devolve senha e o texto antigo migra para hash', async () => {
  const hash = gerarHashVersionado('senha-ficticia');
  const comHash = clienteComFicha({ ...FICHA_BASE, password: null, password_hash: hash });
  const loginHash = await atenderLoginProducao({
    method: 'POST',
    acao: 'login',
    authorization: null,
    body: { email: 'op@isolado.invalid', senha: 'senha-ficticia' },
  }, { env: { SESSION_SECRET: SEGREDO }, cliente: comHash.cliente as never });
  assert.equal(loginHash.status, 200);
  assert.equal(comHash.updates.length, 0);
  assert.equal(JSON.stringify(loginHash.body).includes('senha-ficticia'), false);
  assert.equal(JSON.stringify(loginHash.body).includes(hash), false);

  const comTexto = clienteComFicha({ ...FICHA_BASE, password: 'senha-ficticia', password_hash: null });
  const loginTexto = await atenderLoginProducao({
    method: 'POST',
    acao: 'login',
    authorization: null,
    body: { email: 'op@isolado.invalid', senha: 'senha-ficticia' },
  }, { env: { SESSION_SECRET: SEGREDO }, cliente: comTexto.cliente as never });
  assert.equal(loginTexto.status, 200);
  const usuario = loginTexto.body.usuario as { force_password_change?: boolean };
  assert.equal(usuario.force_password_change, true);
  assert.equal(comTexto.updates[0].password, null);
  assert.equal(String(comTexto.updates[0].password_hash).startsWith('scrypt$v1$'), true);
  assert.equal(JSON.stringify(loginTexto.body).includes('senha-ficticia'), false);
});

test('troca de senha encerra a sessão anterior e a diretoria grava hash de outro usuário', async () => {
  const operacional = clienteComFicha(FICHA_BASE);
  const tokenOperacional = emitirSessao(SEGREDO, '7', Date.now(), 60_000, 0);
  const negado = await atenderLoginProducao({
    method: 'POST',
    acao: 'senha',
    authorization: `Bearer ${tokenOperacional.token}`,
    body: { usuarioId: '8', senhaNova: 'senha-nova-ficticia' },
  }, { env: { SESSION_SECRET: SEGREDO }, cliente: operacional.cliente as never });
  assert.equal(negado.status, 403);
  assert.equal(operacional.updates.length, 0);

  const diretoria = clienteComFicha({
    ...FICHA_BASE,
    profiles: { name: 'Diretoria', permissions: ['*'] },
  });
  const tokenDiretoria = emitirSessao(SEGREDO, '7', Date.now(), 60_000, 0);
  const gravou = await atenderLoginProducao({
    method: 'POST',
    acao: 'senha',
    authorization: `Bearer ${tokenDiretoria.token}`,
    body: { usuarioId: '8', senhaNova: 'senha-nova-ficticia' },
  }, { env: { SESSION_SECRET: SEGREDO }, cliente: diretoria.cliente as never });
  assert.equal(gravou.status, 200);
  assert.equal(diretoria.updates[0].password, null);
  assert.equal(String(diretoria.updates[0].password_hash).startsWith('scrypt$v1$'), true);
  assert.equal(JSON.stringify(gravou.body).includes('senha-nova-ficticia'), false);

  const propria = clienteComFicha({ ...FICHA_BASE, password_hash: gerarHashVersionado('senha-ficticia') });
  const tokenAtual = emitirSessao(SEGREDO, '7', Date.now(), 60_000, 0);
  const trocou = await atenderLoginProducao({
    method: 'POST',
    acao: 'senha',
    authorization: `Bearer ${tokenAtual.token}`,
    body: { senhaAtual: 'senha-ficticia', senhaNova: 'senha-seguinte' },
  }, { env: { SESSION_SECRET: SEGREDO }, cliente: propria.cliente as never });
  assert.equal(trocou.status, 200);
  assert.equal(propria.updates[0].session_epoch, 1);
  const antiga = await atenderLoginProducao({
    method: 'GET',
    acao: 'sessao',
    authorization: `Bearer ${tokenAtual.token}`,
    body: {},
  }, {
    env: { SESSION_SECRET: SEGREDO },
    cliente: clienteComFicha({ ...FICHA_BASE, session_epoch: 1 }).cliente as never,
  });
  assert.equal(antiga.status, 401);
  const nova = abrirSessao(SEGREDO, String(trocou.body.token));
  assert.equal(nova?.epoch, 1);
});
