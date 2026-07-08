import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('TimeClockGate esconde overlay quando modal de ponto está aberto', () => {
  const src = fs.readFileSync('components/TimeClockGate.tsx', 'utf8');
  assert.match(src, /!shiftBlocked && !modalOpen/);
});

test('TimeClockGate reavalia presença após bater ponto', () => {
  const gateSrc = fs.readFileSync('components/TimeClockGate.tsx', 'utf8');
  assert.match(gateSrc, /handleRegistered[\s\S]*evaluate\(false\)/);
});

test('TimeClockModal forced usa z-index acima do gate', () => {
  const src = fs.readFileSync('components/TimeClockModal.tsx', 'utf8');
  assert.match(src, /forced \? 'z-\[210\]' : 'z-\[120\]'/);
});

test('TimeClockModal não exige GPS para bater ponto', () => {
  const src = fs.readFileSync('components/TimeClockModal.tsx', 'utf8');
  assert.doesNotMatch(src, /geolocation/);
  assert.doesNotMatch(src, /getCurrentPosition/);
  assert.doesNotMatch(src, /latitude:\s*location/);
});
