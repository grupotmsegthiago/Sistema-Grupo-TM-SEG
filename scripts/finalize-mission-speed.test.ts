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

test('conclusão não grava pedágio estimado por IA', () => {
  const src = fs.readFileSync('components/UpdateMissionModal.tsx', 'utf8');
  const form = fs.readFileSync('components/MissionForm.tsx', 'utf8');
  assert.doesNotMatch(src, /\/api\/toll\/gemini-estimate/);
  assert.doesNotMatch(src, /Estimativa IA/);
  assert.doesNotMatch(form, /\/api\/toll\/gemini-estimate/);
  assert.match(form, /tollPersistencePair/);
});

test('Salvar em fase inicial não prende operador em finalização acidental', () => {
  const src = fs.readFileSync('components/UpdateMissionModal.tsx', 'utf8');
  assert.match(src, /resolveStatusForSaveSubmit/);
  assert.match(src, /statusToRestoreOnFinalizeCancel/);
});

test('Colar Print aplica só o logotipo — sem limpeza IA de overlays', () => {
  const src = fs.readFileSync('components/UpdateMissionModal.tsx', 'utf8');
  assert.doesNotMatch(src, /\/api\/gemini\/clean-print/);
  assert.doesNotMatch(src, /Detectando overlays/);
  assert.match(src, /stampBrandOverlays/);
  assert.match(src, /Aplicando logotipo TM SEG/);
});
