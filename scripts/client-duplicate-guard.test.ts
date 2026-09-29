import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  acharClienteMesmoDocumento,
  comercialIdDoUsuarioLogado,
  digitosDocumentoCliente,
  documentoCorrespondeBusca,
  perfilEhComercialRole,
} from '../lib/clientDuplicateGuard.ts';

test('normaliza CNPJ/CPF só com dígitos', () => {
  assert.equal(digitosDocumentoCliente('03.020.839/0001-80'), '03020839000180');
  assert.equal(digitosDocumentoCliente('190.792.598-88'), '19079259888');
});

test('detecta duplicata ignorando formatação e o próprio id', () => {
  const rows = [
    { id: 117, name: 'PARANA', cnpj: '03.020.839/0001-80', status: 'Ativo' },
    { id: 118, name: 'PARANA 2', cnpj: '03020839000180', status: 'Ativo' },
  ];
  assert.equal(acharClienteMesmoDocumento(rows, '03.020.839/0001-80', 118)?.id, 117);
  assert.equal(acharClienteMesmoDocumento(rows, '03.020.839/0001-80', 117)?.id, 118);
  assert.equal(acharClienteMesmoDocumento(rows, '00.000.000/0001-00', null), null);
});

test('comercial logado resolve id da carteira', () => {
  assert.equal(
    comercialIdDoUsuarioLogado(
      [{ id: 'e2fe', usuario_id: 27 }, { id: 'outro', usuario_id: 9 }],
      27,
    ),
    'e2fe',
  );
  assert.equal(comercialIdDoUsuarioLogado([{ id: 'e2fe', usuario_id: 27 }], 99), null);
  assert.equal(perfilEhComercialRole('Comercial'), true);
  assert.equal(perfilEhComercialRole('Diretoria'), false);
});

test('consulta por CNPJ ignora formatação e aceita parcial', () => {
  assert.equal(documentoCorrespondeBusca('03.020.839/0001-80', '03020839000180'), true);
  assert.equal(documentoCorrespondeBusca('03.020.839/0001-80', '03.020.839'), true);
  assert.equal(documentoCorrespondeBusca('03.020.839/0001-80', '03020839'), true);
  assert.equal(documentoCorrespondeBusca('03.020.839/0001-80', '99999999'), false);
  assert.equal(documentoCorrespondeBusca('03.020.839/0001-80', '12'), false); // < 3 dígitos
});

test('ClientForm: após insert guarda id e não duplica no retry; comercial auto-vincula', () => {
  const form = readFileSync('components/ClientForm.tsx', 'utf8');
  assert.match(form, /persistedId|setPersistedId/);
  assert.match(form, /acharClienteMesmoDocumento|clientDuplicateGuard/);
  assert.match(form, /comercialIdDoUsuarioLogado/);
  assert.match(form, /Salvo no sistema/);
  assert.match(form, /TM SEG/);
});

test('ClientList e ProviderList usam consulta por dígitos de CNPJ', () => {
  const clientList = readFileSync('components/ClientList.tsx', 'utf8');
  const providerList = readFileSync('components/ProviderList.tsx', 'utf8');
  const providerForm = readFileSync('components/ProviderForm.tsx', 'utf8');
  assert.match(clientList, /documentoCorrespondeBusca/);
  assert.match(providerList, /documentoCorrespondeBusca/);
  assert.match(providerForm, /verificarCnpjDuplicado/);
  assert.match(providerForm, /acharClienteMesmoDocumento/);
});
