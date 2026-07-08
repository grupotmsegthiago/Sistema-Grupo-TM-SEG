import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('finalização de OS não bloqueia no e-mail mission-end', () => {
  const src = fs.readFileSync('components/UpdateMissionModal.tsx', 'utf8');
  assert.match(src, /void authFetch\('\/api\/email\/mission-end'/);
  assert.doesNotMatch(src, /await authFetch\('\/api\/email\/mission-end'/);
});

test('finalização pré-carimba evidência do checklist em paralelo', () => {
  const src = fs.readFileSync('components/UpdateMissionModal.tsx', 'utf8');
  assert.match(src, /prefetchConfirmedPrintBlob/);
  assert.match(src, /confirmedPrintBlobPromiseRef/);
  assert.match(src, /stampBrandOnImageBlob/);
});

test('estimativa de pedágio na conclusão tem timeout de 5s', () => {
  const src = fs.readFileSync('components/UpdateMissionModal.tsx', 'utf8');
  assert.match(src, /withTimeout\([\s\S]*\/api\/toll\/gemini-estimate/);
  assert.match(src, /5000/);
});
