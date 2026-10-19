import assert from 'node:assert/strict';
import test from 'node:test';
import { autorizarTabela, type FichaServidor } from '../lib/dadosProtegidos/tabelas';
import { atenderDadosProtegidos, tabelaDaUrl } from '../lib/dadosProtegidos/proxy';
import { gravarSenhaNoServidor } from '../lib/sessao/gravarSenha';
import { atenderLoginProducao } from '../lib/sessao/loginProducao';
import { abrirSessao, emitirSessao, tokenLegado, usuarioIdDoToken } from '../lib/sessao/token';

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
  const modo = await gravarSenhaNoServidor(cliente, 'fun', 'senha-ficticia-nova');
  assert.equal(modo, 'texto');
  assert.equal(String(chamadas[0].password_hash).startsWith('scrypt$v1$'), true);
  assert.equal(chamadas[0].password, null);
  assert.equal(chamadas[1].password, 'senha-ficticia-nova');
  assert.equal(JSON.stringify(chamadas).includes('senha-ficticia-nova') && chamadas[0].password === null, true);
});
