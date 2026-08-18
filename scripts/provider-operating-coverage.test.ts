import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasExplicitOperatingCoverage,
  parseOperatingCoverage,
  serializeOperatingCoverage,
  setCoverageCost,
  toggleCoverageUf,
} from '../lib/providerOperatingCoverage.ts';

test('parseOperatingCoverage ignora UF inválida e duplicata', () => {
  const rows = parseOperatingCoverage([
    { uf: 'sp', city: 'São Paulo', cost100km: 430, isHq: true },
    { uf: 'SP', cost100km: 1 },
    { uf: 'XX', cost100km: 10 },
    { uf: 'RJ', cost100km: '450' },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].uf, 'SP');
  assert.equal(rows[0].cost100km, 430);
  assert.equal(rows[1].uf, 'RJ');
  assert.equal(rows[1].cost100km, 450);
});

test('serializeOperatingCoverage inclui a sede mesmo se só a filial foi marcada', () => {
  const serialized = serializeOperatingCoverage(
    [{ uf: 'RJ', city: 'Rio de Janeiro', cost100km: 380 }],
    'SP',
    'São Paulo',
  );
  assert.equal(serialized.some((row) => row.uf === 'SP' && row.isHq), true);
  assert.equal(serialized.some((row) => row.uf === 'RJ' && !row.isHq && row.cost100km === 380), true);
});

test('toggleCoverageUf não permite desmarcar a sede', () => {
  const rows = toggleCoverageUf([{ uf: 'SP', isHq: true, cost100km: 400 }], 'SP', false, 'SP', 'São Paulo');
  assert.equal(rows.some((row) => row.uf === 'SP'), true);
  const withRj = toggleCoverageUf(rows, 'RJ', true, 'SP', 'São Paulo');
  assert.equal(withRj.some((row) => row.uf === 'RJ'), true);
  const priced = setCoverageCost(withRj, 'RJ', 390);
  assert.equal(priced.find((row) => row.uf === 'RJ')?.cost100km, 390);
  assert.equal(hasExplicitOperatingCoverage(priced), true);
});
