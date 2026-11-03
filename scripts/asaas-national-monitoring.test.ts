import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeAsaasNfDiscrimination } from '../lib/nfDiscrimination.ts';
import { resolveAsaasNationalMonitoring } from '../lib/billing/municipalServiceOptions.ts';

test('monitoramento 07930 recebe código nacional e NBS', () => {
  const fiscal = resolveAsaasNationalMonitoring({
    optionId: 'intermediacao',
    municipalCode: '07930',
    serviceDescription: 'CONTRATAÇÃO E INTERMEDIAÇÃO DE CONTRATOS E AGENCIAMENTO DE VENDAS',
    clientName: 'CEVA LOGISTICS',
  });
  assert.deepEqual(fiscal, {
    federalServiceTaxCode: '110501',
    nbsCode: '1.1802.30.00',
  });
});

test('escolta, 06298 e Amazon não recebem a trinca nacional', () => {
  assert.equal(resolveAsaasNationalMonitoring({
    optionId: 'escolta',
    municipalCode: '07930',
    serviceDescription: 'Ref. aos Serviços de Intermediação de Escolta Armada',
    clientName: 'CLIENTE TESTE',
  }), null);
  assert.equal(resolveAsaasNationalMonitoring({
    optionId: 'rastreamento',
    municipalCode: '06298',
    serviceDescription: 'Ref. aos Serviços de Rastreamento e Monitoramento de Carga',
    clientName: 'CLIENTE TESTE',
  }), null);
  assert.equal(resolveAsaasNationalMonitoring({
    optionId: 'intermediacao',
    municipalCode: '07930',
    serviceDescription: 'CONTRATAÇÃO E INTERMEDIAÇÃO DE CONTRATOS E AGENCIAMENTO DE VENDAS',
    clientName: 'AMAZON TRANSPORTES LTDA',
  }), null);
});

test('sem opção gravada, descrição de escolta no 07930 fica de fora', () => {
  assert.equal(resolveAsaasNationalMonitoring({
    municipalCode: '07930',
    serviceDescription: 'Ref. aos Serviços de Intermediação de Escolta Armada',
    clientName: 'CLIENTE TESTE',
  }), null);
  assert.deepEqual(resolveAsaasNationalMonitoring({
    municipalCode: '07930',
    serviceDescription: 'CONTRATAÇÃO E INTERMEDIAÇÃO DE CONTRATOS E AGENCIAMENTO DE VENDAS',
    clientName: 'CLIENTE TESTE',
  }), {
    federalServiceTaxCode: '110501',
    nbsCode: '1.1802.30.00',
  });
});

test('payload Asaas mantém 07930, ISS 2% e os campos nacionais só no monitoramento', () => {
  const service = fs.readFileSync('server/asaasService.ts', 'utf8');
  assert.equal((service.match(/issRate:\s*2/g) || []).length, 3);
  assert.doesNotMatch(service, /issRate:\s*5/);
  assert.match(service, /municipalServiceCode:\s*'07930'/);
  assert.match(service, /resolveAsaasNationalMonitoring\(/);
  assert.match(service, /taxes\.federalServiceTaxCode = national\.federalServiceTaxCode/);
  assert.match(service, /taxes\.nbsCode = national\.nbsCode/);
  assert.match(service, /body\.municipalServiceCode = AMAZON_NF_DEFAULTS\.municipalServiceCode/);
});

test('opção interna de serviço não entra no texto da nota', () => {
  const result = normalizeAsaasNfDiscrimination({
    serviceDescription: 'CONTRATAÇÃO E INTERMEDIAÇÃO DE CONTRATOS E AGENCIAMENTO DE VENDAS',
    observations: 'Ref. rastreio: TMSEG-TESTE\nOpção serviço NF: intermediacao\nCNAE/Serviço municipal: 07930',
  });
  assert.doesNotMatch(result.serviceDescription, /Opção serviço NF|CNAE\/Serviço municipal/);
  assert.match(result.serviceDescription, /CONTRATAÇÃO E INTERMEDIAÇÃO/);
});
