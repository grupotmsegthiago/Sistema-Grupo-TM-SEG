import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceNagIsDue, EVIDENCE_NAG_MS, missionNeedsStartEvidence } from '../lib/evidenceStartAlert';

const hour = EVIDENCE_NAG_MS;
const now = Date.parse('2026-09-29T18:00:00-03:00');
const todayStart = Date.parse('2026-09-29T00:00:00-03:00');

test('a cobrança volta uma hora depois que o operador fecha', () => {
  assert.equal(evidenceNagIsDue(null, now), true);
  assert.equal(evidenceNagIsDue(String(now - hour + 1000), now), false);
  assert.equal(evidenceNagIsDue(String(now - hour), now), true);
});

test('cobra o print nas OS já iniciadas e sem evidência', () => {
  const base = { hasEvidence: false, nowMs: now, todayStartMs: todayStart };
  assert.equal(missionNeedsStartEvidence({ ...base, status: 'Em Viagem', startTime: '2026-09-21T12:00:00-03:00' }), true);
  assert.equal(missionNeedsStartEvidence({ ...base, status: 'Concluída', startTime: '2026-09-29T08:00:00-03:00' }), true);
  assert.equal(missionNeedsStartEvidence({ ...base, status: 'Concluída', startTime: '2026-09-28T08:00:00-03:00' }), false);
  assert.equal(missionNeedsStartEvidence({ ...base, status: 'Agendada', startTime: '2026-09-29T20:00:00-03:00' }), false);
  assert.equal(missionNeedsStartEvidence({ ...base, status: 'Cancelada', startTime: '2026-09-29T08:00:00-03:00' }), false);
  assert.equal(missionNeedsStartEvidence({ ...base, status: 'Em Viagem', startTime: '2026-09-29T08:00:00-03:00', hasEvidence: true }), false);
});
