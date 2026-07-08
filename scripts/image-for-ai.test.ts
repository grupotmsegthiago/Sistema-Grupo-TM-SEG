import test from 'node:test';
import assert from 'node:assert/strict';
import { computeScaledDimensions } from '../lib/imageForAI';

test('não reduz imagem menor que o teto', () => {
  const r = computeScaledDimensions(800, 600, 1600);
  assert.deepEqual(r, { width: 800, height: 600, scaled: false });
});

test('reduz mantendo proporção (paisagem)', () => {
  const r = computeScaledDimensions(3200, 2400, 1600);
  assert.equal(r.scaled, true);
  assert.equal(r.width, 1600);
  assert.equal(r.height, 1200);
});

test('reduz mantendo proporção (retrato / print de celular)', () => {
  const r = computeScaledDimensions(3000, 4000, 1600);
  assert.equal(r.scaled, true);
  assert.equal(r.height, 1600);
  assert.equal(r.width, 1200);
});

test('lida com dimensões inválidas sem quebrar', () => {
  const r = computeScaledDimensions(0, 0, 1600);
  assert.equal(r.scaled, false);
  assert.equal(r.width, 1);
  assert.equal(r.height, 1);
});

test('exatamente no teto não é reduzido', () => {
  const r = computeScaledDimensions(1600, 900, 1600);
  assert.equal(r.scaled, false);
  assert.equal(r.width, 1600);
});
