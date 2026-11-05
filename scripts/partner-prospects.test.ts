import test from 'node:test';
import assert from 'node:assert/strict';
import { digitosCnpj, cnpjValido14, formatarCnpj } from '../lib/partnerProspects/cnpj.ts';
import { checarDuplicataCnpj, avisoNomeParecido } from '../lib/partnerProspects/dedupe.ts';
import { podeTransicionar, rotuloStatus } from '../lib/partnerProspects/status.ts';
import { parseProspectCsv } from '../lib/partnerProspects/csvImport.ts';
import {
  montarAssuntoApresentacao,
  montarCorpoApresentacao,
} from '../lib/partnerProspects/emailTemplate.ts';
import { payloadFornecedorBloqueado } from '../lib/partnerProspects/homologar.ts';

test('CNPJ: digitos e validação de 14', () => {
  assert.equal(digitosCnpj('12.345.678/0001-90'), '12345678000190');
  assert.equal(cnpjValido14('12.345.678/0001-90'), true);
  assert.equal(cnpjValido14('123'), false);
  assert.equal(formatarCnpj('12345678000190'), '12.345.678/0001-90');
});

test('dedupe bloqueia CNPJ já em providers', () => {
  const r = checarDuplicataCnpj(
    '12.345.678/0001-90',
    [{ id: '1', cnpj: '12345678000190', name: 'FOO' }],
    [],
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.motivo, 'duplicado_fornecedor');
});

test('dedupe bloqueia CNPJ já na fila', () => {
  const r = checarDuplicataCnpj(
    '12345678000190',
    [],
    [{ id: 'p1', cnpj: '12345678000190' }],
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.motivo, 'duplicado_prospecto');
});

test('dedupe aceita CNPJ novo', () => {
  const r = checarDuplicataCnpj('12345678000190', [], []);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.cnpj, '12345678000190');
});

test('aviso de nome parecido não bloqueia', () => {
  const m = avisoNomeParecido('SEGURANCA ABC LTDA', [
    { id: '1', cnpj: '999', name: 'SEGURANCA ABC LTDA' },
  ]);
  assert.ok(m);
  assert.equal(m?.name, 'SEGURANCA ABC LTDA');
});

test('transições do funil', () => {
  assert.equal(podeTransicionar('radar', 'email_enviado'), true);
  assert.equal(podeTransicionar('radar', 'ativo'), false);
  assert.equal(podeTransicionar('homologacao', 'ativo'), true);
  assert.equal(podeTransicionar('ativo', 'radar'), false);
  assert.equal(rotuloStatus('radar'), 'Radar');
});

test('CSV importa linhas válidas e marca inválidas', () => {
  const csv = [
    'cnpj;razao_social;uf;cidade;email',
    '12.345.678/0001-90;EMPRESA A;SP;Santos;a@x.com',
    '123;SEM CNPJ;RJ;Rio;b@x.com',
    '98.765.432/0001-10;;MG;BH;c@x.com',
  ].join('\n');
  const rows = parseProspectCsv(csv);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].erro, undefined);
  assert.equal(rows[0].cnpj, '12345678000190');
  assert.equal(rows[0].state_uf, 'SP');
  assert.equal(rows[0].source, 'csv');
  assert.match(rows[1].erro || '', /CNPJ/);
  assert.match(rows[2].erro || '', /Razão/);
});

test('template de e-mail preenche variáveis', () => {
  const assunto = montarAssuntoApresentacao({
    companyName: 'ABC SEG',
    city: 'Santos',
    stateUf: 'SP',
  });
  assert.match(assunto, /Santos\/SP/);
  const { text, html } = montarCorpoApresentacao({
    companyName: 'ABC SEGURANCA',
    tradeName: 'ABC',
    contactName: 'João',
    city: 'Santos',
    stateUf: 'SP',
    senderName: 'Thiago',
  });
  assert.match(text, /João/);
  assert.match(text, /ABC/);
  assert.match(text, /Santos\/SP/);
  assert.match(html, /Grupo TM SEG/);
  assert.doesNotMatch(html, /<script/);
});

test('homologação cria fornecedor Bloqueado sem tabela de custo', () => {
  const payload = payloadFornecedorBloqueado(
    {
      cnpj: '12345678000190',
      company_name: 'Parceiro Teste',
      trade_name: 'Parceiro',
      city: 'Santos',
      state_uf: 'SP',
      email: 'x@y.com',
      phone: '13999999999',
      contact_name: 'Maria',
      document_url: 'https://example.com/alvara.pdf',
      alvara_validity: '2027-12-31',
    },
    'THIAGO',
  );
  assert.equal(payload.status, 'Bloqueado');
  assert.equal(payload.type, 'Escolta Caracterizada');
  assert.equal(payload.cnpj, '12.345.678/0001-90');
  assert.equal(payload.name, 'PARCEIRO TESTE');
  assert.ok(!('activation_cost' in payload));
  assert.ok(!('cost_per_extra_km' in payload));
});
