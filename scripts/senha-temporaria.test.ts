import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateTemporaryPassword, mensagemAcessoSistema } from '../lib/senhaTemporaria';

describe('senha temporária', () => {
  it('traz os quatro tipos e não usa texto vazio', () => {
    const senha = generateTemporaryPassword(10);
    assert.equal(senha.length, 10);
    assert.match(senha, /[A-Z]/);
    assert.match(senha, /[a-z]/);
    assert.match(senha, /[2-9]/);
    assert.match(senha, /[@#%&*]/);
    assert.equal(senha.includes('$'), false);
    assert.notEqual(senha, 'undefined');
  });

  it('o modal e a mensagem copiada mostram a senha gerada', () => {
    const senha = generateTemporaryPassword(10);
    const texto = mensagemAcessoSistema({
      name: 'Usuário Teste Local',
      email: 'teste-senha-local@grupotmseg.com.br',
      password: senha,
      origem: 'http://localhost:5000',
    });
    assert.match(texto, /Senha:/);
    assert.match(texto, new RegExp(senha.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(texto.includes('undefined'), false);
    assert.match(texto, /http:\/\/localhost:5000/);
    const email = fs.readFileSync('server/emailService.ts', 'utf8');
    assert.match(email, /senha === 'undefined'/);
    assert.match(email, /textoDeEmail\(senha\)/);
  });
});
