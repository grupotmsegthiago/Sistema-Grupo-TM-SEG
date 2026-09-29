import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OCCURRENCE_BANNER,
  missionHasOccurrence,
  normalizeOccurrenceText,
  occurrenceTextError,
} from '../lib/missionOccurrence';

test('ocorrência exige um texto que a auditoria consiga ler', () => {
  assert.equal(occurrenceTextError('  '), 'Descreva o problema para a auditoria poder verificar.');
  assert.equal(occurrenceTextError('ok'), 'Descreva o problema para a auditoria poder verificar.');
  assert.equal(occurrenceTextError('Motorista recusou o embarque'), null);
  assert.equal(normalizeOccurrenceText('  atraso   na   origem  '), 'atraso na origem');
});

test('o cartão só avisa quando a OS já tem ocorrência', () => {
  assert.equal(missionHasOccurrence(0), false);
  assert.equal(missionHasOccurrence(null), false);
  assert.equal(missionHasOccurrence(2), true);
  assert.equal(OCCURRENCE_BANNER.includes('verificar'), true);
});
