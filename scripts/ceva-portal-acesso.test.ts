import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { caminhoPortalDasPermissoes, decidirPrimeiroAcesso, deveTrocarSenhaPortal, DIAS_TROCA_SENHA_PORTAL, emailDeAcesso, gerarSenhaTemporaria, hashSenha, mensagemAcessoPortal, nomeDeAcesso, perfilDeAcesso, perfilPortalDasPermissoes, permissoesDoPortal, podeCadastrarPessoa, preservarSenhaPortal, senhaConfere, senhaPortalVencida, usuarioSoPortal, validarSenha } from '../lib/cevaPortal/acesso';
import { ehEquipeInterna, origemDoTokenPortal, senhaEquipeConfere, tokenDaEquipeInterna } from '../lib/cevaPortal/equipeInterna';
import { sincronizarAcessoPortal } from '../lib/cevaPortal/cadastroSistema';
import { portalPorNomeCliente } from '../lib/cevaPortal/portalServidor';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('só o administrador cadastra pessoa', () => {
  assert.equal(podeCadastrarPessoa('administrador'), true);
  assert.equal(podeCadastrarPessoa('analista'), false);
  assert.equal(podeCadastrarPessoa(''), false);
  assert.equal(podeCadastrarPessoa(null), false);
});

test('o primeiro acesso público não cria administrador', () => {
  const semAdmin = decidirPrimeiroAcesso({ existeAdministrador: false });
  const comAdmin = decidirPrimeiroAcesso({ existeAdministrador: true });
  assert.equal(semAdmin.ok, false);
  assert.equal(comAdmin.ok, false);
  assert.match(semAdmin.error, /Cadastro de Usuários/);
});

test('a senha temporária cabe na regra e não repete o gerador à toa', () => {
  const senha = gerarSenhaTemporaria();
  assert.equal(validarSenha(senha), null);
  assert.equal(senha.length, 12);
  assert.notEqual(gerarSenhaTemporaria(), senha);
});

test('senha curta é recusada e a senha gravada confere', () => {
  assert.match(validarSenha('1234567') || '', /8/);
  assert.equal(validarSenha('12345678'), null);
  const hash = hashSenha('segredo12');
  assert.equal(senhaConfere('segredo12', hash), true);
  assert.equal(senhaConfere('outra-senha', hash), false);
  assert.equal(senhaConfere('segredo12', null), false);
});

test('senha do portal vence em 30 dias e a troca obrigatória entra na hora', () => {
  const agora = new Date('2026-10-07T12:00:00.000Z');
  const recente = new Date(agora.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString();
  const vencida = new Date(agora.getTime() - DIAS_TROCA_SENHA_PORTAL * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(senhaPortalVencida(recente, agora), false);
  assert.equal(senhaPortalVencida(vencida, agora), true);
  assert.equal(senhaPortalVencida(null, agora), false);
  assert.equal(deveTrocarSenhaPortal({ trocarSenha: true, senhaAlteradaEm: recente, agora }), true);
  assert.equal(deveTrocarSenhaPortal({ trocarSenha: false, senhaAlteradaEm: vencida, agora }), true);
  assert.equal(deveTrocarSenhaPortal({ trocarSenha: false, senhaAlteradaEm: recente, agora }), false);
});

test('hash existente é preservado e a mensagem da Lara não traz senha nova', () => {
  const hash = hashSenha('senha-da-lara');
  assert.equal(preservarSenhaPortal(hash), true);
  assert.equal(preservarSenhaPortal('texto-puro'), false);
  assert.equal(preservarSenhaPortal(null), false);
  const texto = mensagemAcessoPortal({
    nome: 'Lara Borba',
    email: 'ext.lara.borba@cevalogistics.com',
    senha: 'nao-usar',
    rotulo: 'CEVA',
    link: 'https://sistema.grupotmseg.com.br/ceva',
    manteveSenha: true,
  });
  assert.match(texto, /ceva/i);
  assert.match(texto, /30 dias/);
  assert.doesNotMatch(texto, /nao-usar/);
  assert.match(texto, /somente as informações deste cliente/);
});

test('portal reconhece CEVA e IBL e o acesso fica só neles', () => {
  assert.equal(portalPorNomeCliente('CEVA LOGISTICS LTDA')?.caminho, '/ceva');
  assert.equal(portalPorNomeCliente('INTERMODAL BRASIL LOGISTICA S.A.')?.caminho, '/ibl');
  assert.equal(portalPorNomeCliente('DHL') , null);
  const perms = permissoesDoPortal('/ibl', 'administrador');
  assert.equal(usuarioSoPortal(perms), true);
  assert.equal(caminhoPortalDasPermissoes(perms), '/ibl');
  assert.equal(perfilPortalDasPermissoes(perms), 'administrador');
  assert.equal(usuarioSoPortal(['dashboard', 'missions']), false);
});

test('cadastro que já tem senha no portal não troca o hash', async () => {
  const hash = hashSenha('senha-da-lara');
  const tabelas = new Map<string, Record<string, unknown>>([
    ['system_users', { id: '9', email: 'ext.lara.borba@cevalogistics.com', client_id: 'c1', user_type: 'client', permissions: [] }],
    ['ceva_portal_usuarios', { id: 14, email: 'ext.lara.borba@cevalogistics.com', senha_hash: hash }],
  ]);
  const sb = {
    from(tabela: string) {
      const linha = tabelas.get(tabela)!;
      const cadeia: Record<string, unknown> = {
        select() { return cadeia; },
        eq() { return cadeia; },
        ilike() { return cadeia; },
        maybeSingle: async () => ({ data: { ...linha }, error: null }),
        update(dados: Record<string, unknown>) {
          if (tabela === 'ceva_portal_usuarios' && 'senha_hash' in dados) throw new Error('hash da Lara foi alterado');
          Object.assign(linha, dados);
          return cadeia;
        },
        insert() { throw new Error('não deveria inserir outra Lara'); },
        single: async () => ({ data: { ...linha }, error: null }),
      };
      return cadeia;
    },
  };
  const resultado = await sincronizarAcessoPortal(sb, {
    clientId: 'c1',
    nome: 'Lara Borba',
    email: 'ext.lara.borba@cevalogistics.com',
    senha: 'senha-nova-que-nao-entra',
    perfil: 'administrador',
    ativo: true,
    systemUserId: '9',
    acesso: true,
    tabela: 'ceva_portal_usuarios',
    caminho: '/ceva',
  });
  assert.equal(resultado.ok, true);
  if (resultado.ok) assert.equal(resultado.manteveSenha, true);
  assert.equal(tabelas.get('ceva_portal_usuarios')?.senha_hash, hash);
  assert.equal(usuarioSoPortal(tabelas.get('system_users')?.permissions), true);
  assert.equal(caminhoPortalDasPermissoes(tabelas.get('system_users')?.permissions), '/ceva');
});

test('tela e login prendem o usuário ao portal do próprio cliente', () => {
  const form = readFileSync(join(root, 'components/UserForm.tsx'), 'utf8');
  const login = readFileSync(join(root, 'components/Login.tsx'), 'utf8');
  const app = readFileSync(join(root, 'App.tsx'), 'utf8');
  const http = readFileSync(join(root, 'lib/cevaPortal/httpHandler.ts'), 'utf8');
  assert.match(form, /Acesso ao portal/);
  assert.match(form, /checkbox-acesso-portal/);
  assert.match(form, /Não administrador/);
  assert.match(form, /mensagemAcessoPortal/);
  assert.match(form, /import React/);
  assert.match(login, /usuarioSoPortal/);
  assert.match(login, /import React/);
  assert.match(app, /Acesso somente ao portal do cliente/);
  assert.match(http, /deveTrocarSenhaPortal/);
  assert.match(http, /senha_alterada_em/);
  assert.match(http, /cfg\(\)\.clienteNome|carregarClienteDoPortal/);
  assert.doesNotMatch(http, /senha_hash: hashSenha\(senhaNova\), trocar_senha: false, atualizado_em/);
});

test('equipe interna entra com a senha do sistema e o token não mistura com o usuário do portal', () => {
  const interna = { id: 8, status: 'Ativo', user_type: 'internal', permissions: ['dashboard'] };
  assert.equal(ehEquipeInterna(interna), true);
  assert.equal(ehEquipeInterna({ id: 8, status: 'Ativo', user_type: 'internal', client_id: null, provider_id: null }), true);
  assert.equal(ehEquipeInterna({ id: 3, status: 'Ativo', user_type: '', client_id: null, provider_id: null }), true);
  assert.equal(ehEquipeInterna({ id: 8, status: 'Inativo', user_type: 'internal' }), false);
  assert.equal(ehEquipeInterna({ id: 8, status: 'Ativo', user_type: 'client', client_id: 'c1' }), false);
  assert.equal(ehEquipeInterna({ id: 8, status: 'Ativo', user_type: 'provider', provider_id: 'p1' }), false);
  assert.equal(ehEquipeInterna({ id: 8, status: 'Ativo', user_type: 'internal', permissions: permissoesDoPortal('/ibl', 'administrador') }), false);
  assert.equal(ehEquipeInterna(null), false);
  assert.equal(senhaEquipeConfere('  mesma-senha ', 'mesma-senha'), true);
  assert.equal(senhaEquipeConfere('outra', 'mesma-senha'), false);
  assert.equal(senhaEquipeConfere('mesma-senha', null), false);
  const token = tokenDaEquipeInterna('ibl-portal', 8, 1_700_000_000_000);
  assert.equal(token, 'ibl-portal-interno-8-1700000000000');
  assert.deepEqual(origemDoTokenPortal('ibl-portal', `Bearer ${token}`), { origem: 'equipe', id: '8' });
  assert.deepEqual(origemDoTokenPortal('ibl-portal', 'ibl-portal-8-1700000000000'), { origem: 'portal', id: '8' });
  assert.equal(origemDoTokenPortal('ceva-portal', token), null);
  const http = readFileSync(join(root, 'lib/cevaPortal/httpHandler.ts'), 'utf8');
  const tela = readFileSync(join(root, 'components/ceva/AcessoCeva.tsx'), 'utf8');
  assert.match(http, /ehEquipeInterna/);
  assert.match(http, /tokenDaEquipeInterna/);
  assert.match(http, /session\.equipeInterna/);
  assert.match(http, /A senha da equipe interna é alterada no sistema/);
  assert.match(tela, /mesmo login do sistema/);
  assert.match(tela, /import React/);
});

test('e-mail, nome e perfil entram normalizados', () => {
  assert.equal(emailDeAcesso('  Ana@CEVA.com '), 'ana@ceva.com');
  assert.equal(emailDeAcesso('sem-arroba'), null);
  assert.equal(nomeDeAcesso('  Ana   Lima '), 'Ana Lima');
  assert.equal(nomeDeAcesso('A'), null);
  assert.equal(perfilDeAcesso('Analista'), 'analista');
  assert.equal(perfilDeAcesso('gerente'), null);
});
