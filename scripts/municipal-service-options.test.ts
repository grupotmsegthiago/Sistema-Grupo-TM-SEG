import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultMunicipalServiceForClient,
  findMunicipalServiceOption,
  MUNICIPAL_SERVICE_OPTIONS,
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

test('CEVA sugere intermediação', () => {
  assert.equal(defaultMunicipalServiceForClient('CEVA LOGISTICS').id, 'intermediacao');
});

test('findMunicipalServiceOption por id e código', () => {
  assert.equal(findMunicipalServiceOption('rastreamento').code, '06298');
  assert.equal(findMunicipalServiceOption('06298').id, 'rastreamento');
});
