import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  acharClienteMesmoDocumento,
  clienteNaCarteiraComercial,
  clienteStatusAtivo,
  comercialIdDoUsuarioLogado,
  deduparClientesPorDocumento,
  digitosDocumentoCliente,
  documentoCorrespondeBusca,
  montarFiltroOrCarteiraComercial,
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

test('carteira comercial: responsável ou quem cadastrou; oculta demais', () => {
  const COM = 'e2fe3779-0b03-47cf-95a2-0c01a35e3e32';
  assert.equal(
    clienteNaCarteiraComercial(
      { id: 110, created_by: 'MIGUEL MOTA', responsavel_comercial_id: COM },
      { userName: 'Miguel Mota', comercialId: COM },
    ),
    true,
  );
  assert.equal(
    clienteNaCarteiraComercial(
      { id: 50, created_by: 'OUTRO', responsavel_comercial_id: COM },
      { userName: 'MIGUEL MOTA', comercialId: COM },
    ),
    true,
  );
  assert.equal(
    clienteNaCarteiraComercial(
      { id: 51, created_by: 'OUTRO', responsavel_comercial_id: 'aaaa' },
      { userName: 'MIGUEL MOTA', comercialId: COM },
    ),
    false,
  );
  assert.equal(clienteStatusAtivo('Ativo'), true);
  assert.equal(clienteStatusAtivo('Inativo'), false);
});

test('dedupa por documento prioriza Ativo e maior id', () => {
  const rows = [
    { id: 104, cnpj: '19079259888', status: 'Inativo', trading_name: 'BERIN' },
    { id: 110, cnpj: '19079259888', status: 'Ativo', trading_name: 'BERIN' },
    { id: 117, cnpj: '03.020.839/0001-80', status: 'Inativo', trading_name: 'PARANA' },
    { id: 118, cnpj: '03020839000180', status: 'Ativo', trading_name: 'PARANA' },
  ];
  const out = deduparClientesPorDocumento(rows);
  const ids = out.map((r) => Number(r.id)).sort((a, b) => a - b);
  assert.deepEqual(ids, [110, 118]);
});

test('filtro or da carteira inclui created_by e responsavel', () => {
  const or = montarFiltroOrCarteiraComercial({
    userName: 'MIGUEL MOTA',
    comercialId: 'e2fe3779-0b03-47cf-95a2-0c01a35e3e32',
  });
  assert.match(or || '', /created_by\.ilike\."MIGUEL MOTA"/);
  assert.match(or || '', /responsavel_comercial_id\.eq\.e2fe3779/);
});

test('ClientForm: após insert guarda id e não duplica no retry; comercial auto-vincula', () => {
  const form = readFileSync('components/ClientForm.tsx', 'utf8');
  assert.match(form, /persistedId|setPersistedId/);
  assert.match(form, /acharClienteMesmoDocumento|clientDuplicateGuard/);
  assert.match(form, /comercialIdDoUsuarioLogado/);
  assert.match(form, /Salvo no sistema/);
  assert.match(form, /TM SEG/);
});

test('ClientList carteira comercial oculta inativos e dedupa', () => {
  const clientList = readFileSync('components/ClientList.tsx', 'utf8');
  assert.match(clientList, /status',\s*'Ativo'|eq\('status',\s*'Ativo'\)/);
  assert.match(clientList, /montarFiltroOrCarteiraComercial/);
  assert.match(clientList, /deduparClientesPorDocumento/);
  assert.match(clientList, /responsavel_comercial_id/);
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
