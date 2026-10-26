import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { podeRemoverPessoa } from '../lib/cevaPortal/regrasAcesso';

test('administrador não remove administrador', () => {
  assert.equal(podeRemoverPessoa('administrador'), false);
  assert.equal(podeRemoverPessoa('analista'), true);
  assert.equal(podeRemoverPessoa(''), false);
  assert.equal(podeRemoverPessoa(null), false);
});

test('a lista tem editar e remover, e o servidor recusa o administrador', () => {
  const tela = readFileSync('components/ceva/PessoasCeva.tsx', 'utf8');
  const http = readFileSync('lib/cevaPortal/httpHandler.ts', 'utf8');
  const ceva = readFileSync('server/cevaPortal.ts', 'utf8');
  const ibl = readFileSync('server/iblPortal.ts', 'utf8');
  assert.match(tela, /button-editar-pessoa/);
  assert.match(tela, /button-remover-pessoa/);
  assert.match(tela, /podeRemoverPessoa\(pessoa\.perfil\)/);
  assert.match(tela, /method: 'DELETE'/);
  assert.match(tela, /Salvar alterações/);
  assert.match(tela, /import React/);
  assert.match(http, /Administrador não remove administrador/);
  assert.match(http, /method === 'DELETE'/);
  assert.match(http, /podeRemoverPessoa\(atual\.perfil\)/);
  assert.match(ceva, /app\.delete\('\/api\/ceva-portal\/pessoas\/:id'/);
  assert.match(ibl, /app\.delete\('\/api\/ibl-portal\/pessoas\/:id'/);
  assert.match(ibl, /app\.delete\('\/api\/cliente-portal\/pessoas\/:id'/);
});
