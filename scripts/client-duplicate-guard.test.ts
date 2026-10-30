import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  acharClienteMesmoDocumento,
  acharConflitoRaizCnpj,
  cadastroExigeTravaRaiz,
  carregarLinhasDocumentoCliente,
  clienteNaCarteiraComercial,
  clienteStatusAtivo,
  comercialIdDoUsuarioLogado,
  deduparClientesPorDocumento,
  digitosDocumentoCliente,
  documentoCorrespondeBusca,
  mensagemTitularidadeRaizCnpj,
  montarFiltroOrCarteiraComercial,
  perfilEhComercialRole,
  raizCnpj,
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

test('raiz do CNPJ são os 8 primeiros dígitos; CPF não tem raiz', () => {
  assert.equal(raizCnpj('03.020.839/0001-80'), '03020839');
  assert.equal(raizCnpj('03020839000261'), '03020839');
  assert.equal(raizCnpj('190.792.598-88'), null);
  assert.equal(raizCnpj('03020839'), null);
});

test('filial de outro comercial bloqueia; a mesma carteira e o próprio id passam', () => {
  const rows = [
    { id: 10, name: 'MATRIZ', cnpj: '03.020.839/0001-80', status: 'Ativo', responsavel_comercial_id: 'comercial-a' },
    { id: 11, name: 'FILIAL INATIVA', cnpj: '03020839000261', status: 'Inativo', responsavel_comercial_id: 'comercial-b' },
    { id: 12, name: 'SEM DONO', cnpj: '03.020.839/0003-42', status: 'Ativo', responsavel_comercial_id: null },
  ];
  const conflito = acharConflitoRaizCnpj(rows, '03.020.839/0004-23', 'comercial-c', null);
  assert.equal(conflito?.id, 10);
  assert.match(mensagemTitularidadeRaizCnpj(conflito!, 'Miguel Mota'), /carteira do comercial Miguel Mota/);
  assert.match(mensagemTitularidadeRaizCnpj(conflito!, 'Miguel Mota'), /Solicite transferência à diretoria/);
  assert.equal(acharConflitoRaizCnpj(rows, '03.020.839/0004-23', 'comercial-a', null)?.id, 11);
  const mesmaCarteira = [
    { id: 10, name: 'MATRIZ', cnpj: '03.020.839/0001-80', status: 'Ativo', responsavel_comercial_id: 'comercial-a' },
    { id: 12, name: 'SEM DONO', cnpj: '03.020.839/0003-42', status: 'Ativo', responsavel_comercial_id: null },
  ];
  assert.equal(acharConflitoRaizCnpj(mesmaCarteira, '03.020.839/0004-23', 'comercial-a', null), null);
  assert.equal(cadastroExigeTravaRaiz(rows, '03.020.839/0001-80', 10), false);
  assert.equal(cadastroExigeTravaRaiz(rows, '03.020.839/0004-23', 10), true);
  assert.equal(cadastroExigeTravaRaiz(rows, '03.020.839/0004-23', null), true);
  assert.equal(acharConflitoRaizCnpj(rows, '03.020.839/0001-80', 'comercial-c', 10)?.id, 11);
  assert.equal(acharConflitoRaizCnpj(rows, '190.792.598-88', 'comercial-c', null), null);
  assert.match(mensagemTitularidadeRaizCnpj({ id: 12, name: '' }, ''), /carteira de outro comercial/);
});

test('leitura do documento falha fechada se a página repetir', async () => {
  const pagina = Array.from({ length: 1000 }, () => ({
    id: 1,
    name: 'A',
    cnpj: '03020839000180',
    status: 'Ativo' as const,
    responsavel_comercial_id: 'a',
  }));
  const travado = await carregarLinhasDocumentoCliente(async () => ({ rows: pagina }));
  assert.equal(travado.error, 'CONSULTA INCOMPLETA');
  assert.equal(travado.rows.length, 0);
  const uma = [{ id: 2, name: 'B', cnpj: '03020839000180', status: 'Ativo', responsavel_comercial_id: 'a' }];
  const ok = await carregarLinhasDocumentoCliente(async (from) => (
    from === 0 ? { rows: uma } : { rows: [] }
  ));
  assert.equal(ok.error, undefined);
  assert.equal(ok.rows.length, 1);
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
  assert.match(form, /acharConflitoRaizCnpj/);
  assert.match(form, /cadastroExigeTravaRaiz/);
  assert.match(form, /carregarLinhasDocumentoCliente/);
  assert.match(form, /mensagemTitularidadeRaizCnpj/);
  assert.match(form, /comercialIdDoUsuarioLogado/);
  assert.match(form, /Salvo no sistema/);
  assert.match(form, /TM SEG/);
});

test('ClientList carteira comercial oculta inativos e dedupa', () => {
  const clientList = readFileSync('components/ClientList.tsx', 'utf8');
  assert.match(clientList, /status',\s*'Ativo'|eq\('status',\s*'Ativo'\)/);
  assert.match(clientList, /eq\('responsavel_comercial_id', comercialId\)/);
  assert.doesNotMatch(clientList, /montarFiltroOrCarteiraComercial/);
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
