import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('TimeClockGate esconde overlay quando modal de ponto está aberto', () => {
  const src = fs.readFileSync('components/TimeClockGate.tsx', 'utf8');
  assert.match(src, /!shiftBlocked && !modalOpen/);
});

test('TimeClockModal forced usa z-index acima do gate', () => {
  const src = fs.readFileSync('components/TimeClockModal.tsx', 'utf8');
  assert.match(src, /forced \? 'z-\[210\]' : 'z-\[120\]'/);
});
