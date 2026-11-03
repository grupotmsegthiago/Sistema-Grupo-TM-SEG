import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeAsaasNfDiscrimination } from '../lib/nfDiscrimination.ts';
import { resolveAsaasNationalMonitoring } from '../lib/billing/municipalServiceOptions.ts';

const PORTAL = {
  federalServiceTaxCode: '110501',
  nbsCode: '1.1802.30.00',
  portalServiceCode: '11.05.01',
};

test('serviço 07930 vai ao portal como 11.05.01, com código nacional e NBS', () => {
  assert.deepEqual(resolveAsaasNationalMonitoring({
    optionId: 'intermediacao',
    municipalCode: '07930',
    serviceDescription: 'CONTRATAÇÃO E INTERMEDIAÇÃO DE CONTRATOS E AGENCIAMENTO DE VENDAS',
    clientName: 'CEVA LOGISTICS',
  }), PORTAL);
  assert.deepEqual(resolveAsaasNationalMonitoring({
    optionId: 'escolta',
    municipalCode: '07930',
    serviceDescription: 'Ref. aos Serviços de Intermediação de Escolta Armada',
    clientName: 'CLIENTE TESTE',
  }), PORTAL);
  assert.deepEqual(resolveAsaasNationalMonitoring({
    municipalCode: '07930',
    serviceDescription: 'Ref. aos Serviços de Intermediação de Escolta Armada',
    clientName: 'AMAZON TRANSPORTES LTDA',
  }), PORTAL);
});

test('06298 não recebe o código do monitoramento', () => {
  assert.equal(resolveAsaasNationalMonitoring({
    optionId: 'rastreamento',
    municipalCode: '06298',
    serviceDescription: 'Ref. aos Serviços de Rastreamento e Monitoramento de Carga',
    clientName: 'CLIENTE TESTE',
  }), null);
});

test('payload Asaas troca 07930 por 11.05.01 e mantém ISS 2%', () => {
  const service = fs.readFileSync('server/asaasService.ts', 'utf8');
  assert.equal((service.match(/issRate:\s*2/g) || []).length, 3);
  assert.doesNotMatch(service, /issRate:\s*5/);
  assert.match(service, /municipalServiceCode:\s*'07930'/);
  assert.match(service, /body\.municipalServiceCode = national\.portalServiceCode/);
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
