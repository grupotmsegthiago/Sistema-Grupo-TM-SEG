import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ehEquipeInterna } from '../lib/cevaPortal/equipeInterna';
import { emailPortalDoSite, senhaInicialDoCnpj } from '../lib/portalCliente/acessoInicial';
import { escolherPaleta, svgSemFundo } from '../lib/portalCliente/marcaSite';
import { criarAdministradorInicial } from '../lib/portalCliente/provisionarAdmin';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('o primeiro e-mail segue o site e a senha é o CNPJ', () => {
  assert.equal(emailPortalDoSite('https://www.ibllogistica.com.br/inicio'), 'portal@ibllogistica.com.br');
  assert.equal(emailPortalDoSite('cliente.com.br'), 'portal@cliente.com.br');
  assert.equal(senhaInicialDoCnpj('04.123.456/0001-10'), '04123456000110');
  assert.equal(senhaInicialDoCnpj('123.456.789-09'), null);
});

test('a paleta usa a cor escura na marca e a cor viva no botão', () => {
  const paleta = escolherPaleta(['#ffffff', '#111111', '#f7941e']);
  assert.equal(paleta?.cor, '#111111');
  assert.equal(paleta?.corAcao, '#f7941e');
});

test('o svg perde o retângulo branco de fundo', () => {
  const limpo = svgSemFundo('<svg><rect width="100%" height="100%" fill="#ffffff"/><path fill="#111"/></svg>');
  assert.doesNotMatch(limpo, /rect/);
  assert.match(limpo, /path/);
});

test('portal novo cria o administrador uma vez e a equipe interna continua entrando', async () => {
  const gravados: Record<string, unknown>[] = [];
  const sistema = {
    select() { return sistema; },
    ilike() { return sistema; },
    maybeSingle: async () => ({ data: null, error: null }),
    insert(row: Record<string, unknown>) {
      gravados.push(row);
      return { select: () => ({ single: async () => ({ data: { id: 'usr-1' }, error: null }) }) };
    },
    update: () => sistema,
    eq: () => sistema,
  };
  const portal = {
    select() { return portal; },
    eq() { return portal; },
    limit: async () => ({ data: [], error: null }),
    insert(row: Record<string, unknown>) {
      gravados.push(row);
      return { select: () => ({ single: async () => ({ data: { id: 9 }, error: null }) }) };
    },
    delete: () => ({ eq: async () => ({ error: null }) }),
  };
  const sb = { from: (tabela: string) => (tabela === 'system_users' ? sistema : portal) };
  const cliente = {
    id: 15,
    name: 'Cliente Novo LTDA',
    trading_name: 'Cliente Novo',
    cnpj: '04123456000110',
    portal_site: 'https://clientenovo.com.br',
    portal_slug: 'cliente-novo',
    portal_ativo: true,
  };
  const criado = await criarAdministradorInicial(sb, cliente);
  assert.equal(criado.ok, true);
  if (criado.ok) {
    assert.equal(criado.criado, true);
    assert.equal(criado.email, 'portal@clientenovo.com.br');
  }
  assert.equal(gravados.some((row) => row.perfil === 'administrador' && row.trocar_email === true), true);
  assert.equal(ehEquipeInterna({ id: 1, status: 'Ativo', user_type: 'internal' }), true);
  const fonte = readFileSync(join(root, 'lib/cevaPortal/httpHandler.ts'), 'utf8');
  assert.ok(fonte.indexOf('ehEquipeInterna') < fonte.indexOf('senhaConfere(senha, user.senha_hash)'));
  const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  assert.equal(Object.keys(vercel.functions || {}).length, 50);
  const regra = (vercel.rewrites as { source: string; destination: string }[]).find((item) => item.source === '/api/cliente-portal/provisionar');
  assert.match(regra?.destination || '', /op=provisionar/);
});
