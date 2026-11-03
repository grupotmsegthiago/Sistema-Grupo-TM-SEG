import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('TimeClockGate esconde overlay quando modal de ponto está aberto', () => {
  const src = fs.readFileSync('components/TimeClockGate.tsx', 'utf8');
  assert.match(src, /\{!modalOpen && \(/);
  assert.doesNotMatch(src, /ShiftWaitScreen|shiftBlocked|canPunchEntryNow/);
});

test('TimeClockModal forced usa z-index acima do gate', () => {
  const src = fs.readFileSync('components/TimeClockModal.tsx', 'utf8');
  assert.match(src, /forced \? 'z-\[210\]' : 'z-\[120\]'/);
});

test('ponto obrigatório ainda tem Fechar e Voltar', () => {
  const modal = fs.readFileSync('components/TimeClockModal.tsx', 'utf8');
  const gate = fs.readFileSync('components/TimeClockGate.tsx', 'utf8');
  assert.match(modal, /data-testid="button-fechar-ponto"/);
  assert.match(modal, /data-testid="button-voltar-ponto"/);
  assert.doesNotMatch(modal, /\{!forced && \([\s\S]*button-fechar-ponto/);
  assert.match(gate, /onClose=\{\(\) => setModalOpen\(false\)\}/);
});

test('TimeClockModal não exige GPS para bater ponto', () => {
  const src = fs.readFileSync('components/TimeClockModal.tsx', 'utf8');
  assert.doesNotMatch(src, /geolocation/);
  assert.doesNotMatch(src, /getCurrentPosition/);
  assert.doesNotMatch(src, /latitude:\s*location/);
});
