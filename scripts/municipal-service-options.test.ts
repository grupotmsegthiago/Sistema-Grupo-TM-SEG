import test from 'node:test';
import assert from 'node:assert/strict';
import {
  amazonClientNfFields,
  defaultMunicipalServiceForClient,
  findMunicipalServiceOption,
  isAmazonBillingClient,
  MUNICIPAL_SERVICE_OPTIONS,
  resolveMunicipalServiceForClient,
} from '../lib/billing/municipalServiceOptions.ts';

test('presets incluem 06298 e 07930', () => {
  const codes = MUNICIPAL_SERVICE_OPTIONS.map((o) => o.code);
  assert.ok(codes.includes('06298'));
  assert.ok(codes.includes('07930'));
});

test('Amazon sugere intermediação 07930', () => {
  const opt = defaultMunicipalServiceForClient('AMAZON TRANSPORTES LTDA');
  assert.equal(opt.id, 'intermediacao');
  assert.equal(opt.code, '07930');
});

test('Amazon resolve sempre intermediação mesmo com nf_* incompleto', () => {
  assert.equal(isAmazonBillingClient('AMAZON', null), true);
  const opt = resolveMunicipalServiceForClient({
    name: 'AMAZON TRANSPORTES LTDA',
    nf_municipal_service_code: '07930',
    nf_municipal_service_name: null,
  });
  assert.equal(opt.id, 'intermediacao');
  assert.match(opt.name, /Agenciamento/i);
  assert.doesNotMatch(opt.name, /^07930\s*-/);
  const fields = amazonClientNfFields();
  assert.equal(fields.nf_municipal_service_code, '07930');
  assert.match(fields.nf_municipal_service_name, /Agenciamento/i);
  assert.match(fields.nf_service_description, /CONTRATAÇÃO E INTERMEDIAÇÃO/i);
});

test('CEVA sugere intermediação', () => {
  assert.equal(defaultMunicipalServiceForClient('CEVA LOGISTICS').id, 'intermediacao');
});

test('findMunicipalServiceOption por id e código', () => {
  assert.equal(findMunicipalServiceOption('rastreamento').code, '06298');
  assert.equal(findMunicipalServiceOption('06298').id, 'rastreamento');
});
