import test from 'node:test';
import assert from 'node:assert/strict';
import { canSaveFinalizeEvidence, shouldResetFinalizeChecklist, summarizeEvidenceByOperator } from '../lib/endEvidenceGate';
import fs from 'node:fs';

test('só salva a finalização quando as duas fotos carregaram e o horário da foto foi confirmado', () => {
  assert.equal(canSaveFinalizeEvidence({
    tripUrl: 'https://foto-viagem',
    kmUrl: 'https://foto-km',
    tripUploading: false,
    kmUploading: false,
    timeConfirmed: true,
  }), true);
  assert.equal(canSaveFinalizeEvidence({
    tripUrl: 'https://foto-viagem',
    kmUrl: '',
    timeConfirmed: true,
  }), false);
  assert.equal(canSaveFinalizeEvidence({
    tripUrl: 'https://foto-viagem',
    kmUrl: 'https://foto-km',
    kmUploading: true,
    timeConfirmed: true,
  }), false);
  assert.equal(canSaveFinalizeEvidence({
    tripUrl: 'https://foto-viagem',
    kmUrl: 'https://foto-km',
    timeConfirmed: false,
  }), false);
});

test('velada ATIVA/TM SEG finaliza sem print de KM, com foto do fim e horário', () => {
  assert.equal(canSaveFinalizeEvidence({
    tripUrl: 'https://foto-viagem',
    kmUrl: '',
    timeConfirmed: true,
    requireKmPhoto: false,
  }), true);
  assert.equal(canSaveFinalizeEvidence({
    tripUrl: '',
    kmUrl: '',
    timeConfirmed: true,
    requireKmPhoto: false,
  }), false);
  assert.equal(canSaveFinalizeEvidence({
    tripUrl: 'https://foto-viagem',
    kmUrl: '',
    tripUploading: true,
    timeConfirmed: true,
    requireKmPhoto: false,
  }), false);
});

test('checklist só zera foto e horário quando abre, não quando o relógio muda a hora', () => {
  assert.equal(shouldResetFinalizeChecklist(true, false), true);
  assert.equal(shouldResetFinalizeChecklist(true, true), false);
  assert.equal(shouldResetFinalizeChecklist(false, true), false);
  assert.equal(shouldResetFinalizeChecklist(false, false), false);
  const src = fs.readFileSync('components/UpdateMissionModal.tsx', 'utf8');
  assert.match(src, /shouldResetFinalizeChecklist\(isOpen, checklistWasOpenRef\.current\)/);
  const refusal = src.slice(src.indexOf('Recusar missão — hora e evidência obrigatórios'), src.indexOf('KM rodado x KM da tabela'));
  assert.match(refusal, /input-confirm-real-time/);
  assert.doesNotMatch(refusal, /min=\{minDateTime\}/);
});

test('cockpit conta evidência e pendência por operador', () => {
  const rows = summarizeEvidenceByOperator([
    { operator: 'Lucas Silva', pending: true },
    { operator: 'lucas silva', tripUrl: 'a', kmUrl: 'b', pending: false },
    { operator: 'Ana Costa', tripUrl: 'a', kmUrl: 'b' },
  ]);
  assert.equal(rows[0].operator, 'Lucas Silva');
  assert.equal(rows[0].pending, 1);
  assert.equal(rows[0].withEvidence, 1);
  assert.equal(rows[1].withEvidence, 1);
});
