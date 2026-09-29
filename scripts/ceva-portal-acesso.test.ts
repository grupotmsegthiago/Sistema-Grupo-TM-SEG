import test from 'node:test';
import assert from 'node:assert/strict';
import { decidirPrimeiroAcesso, emailDeAcesso, gerarSenhaTemporaria, hashSenha, nomeDeAcesso, perfilDeAcesso, podeCadastrarPessoa, senhaConfere, validarSenha } from '../lib/cevaPortal/acesso';

test('só o administrador cadastra pessoa', () => {
  assert.equal(podeCadastrarPessoa('administrador'), true);
  assert.equal(podeCadastrarPessoa('analista'), false);
  assert.equal(podeCadastrarPessoa(''), false);
  assert.equal(podeCadastrarPessoa(null), false);
});

test('o primeiro acesso cria o administrador quando ainda não existe ninguém', () => {
  const decisao = decidirPrimeiroAcesso({ existeAdministrador: false });
  assert.deepEqual(decisao, { ok: true, acao: 'criar-administrador' });
});

test('com administrador, a senha não é escolhida na tela: ela vem por e-mail', () => {
  const decisao = decidirPrimeiroAcesso({ existeAdministrador: true });
  assert.equal(decisao.ok, false);
  if (!decisao.ok) assert.match(decisao.error, /e-mail/);
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

test('e-mail, nome e perfil entram normalizados', () => {
  assert.equal(emailDeAcesso('  Ana@CEVA.com '), 'ana@ceva.com');
  assert.equal(emailDeAcesso('sem-arroba'), null);
  assert.equal(nomeDeAcesso('  Ana   Lima '), 'Ana Lima');
  assert.equal(nomeDeAcesso('A'), null);
  assert.equal(perfilDeAcesso('Analista'), 'analista');
  assert.equal(perfilDeAcesso('gerente'), null);
});
