import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { hashSenha } from '../lib/cevaPortal/acesso.ts';

type Linha = Record<string, unknown> | null;

const tabelas = new Map<string, Linha>();

function consulta(tabela: string) {
  const linha = tabelas.get(tabela) ?? null;
  const cadeia: Record<string, unknown> = {
    select() { return cadeia; },
    eq() { return cadeia; },
    ilike() { return cadeia; },
    order() { return cadeia; },
    in() { return cadeia; },
    limit: async () => ({ data: linha ? [linha] : [], error: null }),
    maybeSingle: async () => ({ data: linha, error: null }),
  };
  return cadeia;
}

const podeMock = typeof mock.module === 'function';
let handleIblPortalHttp: (req: any, res: any) => Promise<void> = async () => {};
if (podeMock) {
  mock.module('../lib/supabaseAdmin.ts', {
    namedExports: {
      createSupabaseAdminClient: () => ({ from: consulta }),
    },
  });
  ({ handleIblPortalHttp } = await import('../lib/cevaPortal/httpHandler.ts'));
}

function resposta() {
  const res: {
    statusCode: number;
    body: any;
    setHeader: () => void;
    status: (code: number) => typeof res;
    json: (payload: unknown) => typeof res;
  } = {
    statusCode: 0,
    body: null,
    setHeader() {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

async function entrar(email: string, senha: string) {
  const res = resposta();
  await handleIblPortalHttp(
    { method: 'POST', url: '/api/ibl-portal/login', headers: {}, body: { email, senha } },
    res,
  );
  return res;
}

test('IBL aceita o mesmo e-mail e senha da equipe interna', { skip: podeMock ? false : 'mock de módulo indisponível neste Node' }, async () => {
  tabelas.clear();
  tabelas.set('system_users', {
    id: 24,
    name: 'Giovanna Marsili',
    email: 'giovanna@grupotmseg.com.br',
    password: 'senha-do-sistema',
    status: 'Ativo',
    user_type: 'internal',
    client_id: null,
    provider_id: null,
    permissions: ['dashboard'],
  });
  tabelas.set('ibl_portal_usuarios', null);
  const res = await entrar('giovanna@grupotmseg.com.br', '  senha-do-sistema  ');
  assert.equal(res.statusCode, 200);
  assert.match(String(res.body?.token), /^ibl-portal-interno-24-\d{10,}$/);
  assert.equal(res.body?.user?.perfil, 'administrador');
  assert.equal(res.body?.user?.trocarSenha, false);
  assert.equal(res.body?.user?.email, 'giovanna@grupotmseg.com.br');
  assert.equal('password' in (res.body?.user || {}), false);

  const eu = resposta();
  await handleIblPortalHttp(
    {
      method: 'GET',
      url: '/api/ibl-portal/me',
      headers: { authorization: `Bearer ${res.body.token}` },
      body: {},
    },
    eu,
  );
  assert.equal(eu.statusCode, 200);
  assert.equal(eu.body?.user?.name, 'Giovanna Marsili');
  assert.equal(eu.body?.user?.trocarSenha, false);

  const troca = resposta();
  await handleIblPortalHttp(
    {
      method: 'POST',
      url: '/api/ibl-portal/trocar-senha',
      headers: { authorization: `Bearer ${res.body.token}` },
      body: { senhaAtual: 'senha-do-sistema', senhaNova: 'outra-senha-12', confirmacao: 'outra-senha-12' },
    },
    troca,
  );
  assert.equal(troca.statusCode, 403);
  assert.match(String(troca.body?.error), /equipe interna/);
});

test('senha errada da equipe interna continua inválida e cliente não usa esse atalho', { skip: podeMock ? false : 'mock de módulo indisponível neste Node' }, async () => {
  tabelas.clear();
  tabelas.set('system_users', {
    id: 24,
    name: 'Giovanna Marsili',
    email: 'giovanna@grupotmseg.com.br',
    password: 'senha-do-sistema',
    status: 'Ativo',
    user_type: 'internal',
    permissions: [],
  });
  tabelas.set('ibl_portal_usuarios', null);
  const errada = await entrar('giovanna@grupotmseg.com.br', 'senha-errada');
  assert.equal(errada.statusCode, 401);
  assert.equal(errada.body?.token, undefined);

  tabelas.set('system_users', {
    id: 9,
    name: 'Lara Borba',
    email: 'ext.lara.borba@cevalogistics.com',
    password: 'senha-do-sistema',
    status: 'Ativo',
    user_type: 'client',
    client_id: 'c1',
    permissions: ['portal-only', 'portal:/ibl', 'portal-perfil:administrador'],
  });
  tabelas.set('clients', { id: 'c1', name: 'INTERMODAL BRASIL LOGISTICA S.A.' });
  tabelas.set('ibl_portal_usuarios', {
    id: 3,
    nome: 'Lara Borba',
    email: 'ext.lara.borba@cevalogistics.com',
    senha_hash: hashSenha('senha-do-portal'),
    perfil: 'administrador',
    status: 'ativo',
    trocar_senha: false,
    senha_alterada_em: new Date().toISOString(),
  });
  const cliente = await entrar('ext.lara.borba@cevalogistics.com', 'senha-do-portal');
  assert.equal(cliente.statusCode, 200);
  assert.match(String(cliente.body?.token), /^ibl-portal-3-\d{10,}$/);
  assert.doesNotMatch(String(cliente.body?.token), /interno/);

  const atalho = await entrar('ext.lara.borba@cevalogistics.com', 'senha-do-sistema');
  assert.equal(atalho.statusCode, 401);
});
