import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASAAS_PIX_MIN_RESERVE_BRL,
  calcMaxPixTransfer,
  isValidPixTransferAmount,
} from '../lib/asaasPixTransfer.ts';

test('calcMaxPixTransfer reserva R$ 100', () => {
  assert.equal(calcMaxPixTransfer(500), 400);
  assert.equal(calcMaxPixTransfer(100), 0);
  assert.equal(calcMaxPixTransfer(50), 0);
  assert.equal(calcMaxPixTransfer(100.01), 0.01);
});

test('isValidPixTransferAmount rejeita acima do máximo', () => {
  const r = isValidPixTransferAmount(401, 500, ASAAS_PIX_MIN_RESERVE_BRL);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /máximo/i);
});

test('isValidPixTransferAmount aceita valor total disponível', () => {
  assert.equal(isValidPixTransferAmount(400, 500).ok, true);
  assert.equal(isValidPixTransferAmount(150, 260).ok, true);
});

test('isValidPixTransferAmount rejeita zero', () => {
  assert.equal(isValidPixTransferAmount(0, 500).ok, false);
});
