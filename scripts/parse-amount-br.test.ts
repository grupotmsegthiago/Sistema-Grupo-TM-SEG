import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmountBR } from '../lib/utils';

test('parseAmountBR aceita formato brasileiro com milhar', () => {
  assert.equal(parseAmountBR('1.234,56'), 1234.56);
});

test('parseAmountBR aceita decimal com ponto', () => {
  assert.equal(parseAmountBR('1234.56'), 1234.56);
});

test('parseAmountBR aceita prefixo R$', () => {
  assert.equal(parseAmountBR('R$ 10.500,00'), 10500);
});

test('parseAmountBR retorna NaN para texto inválido', () => {
  assert.ok(Number.isNaN(parseAmountBR('abc')));
});
