import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getNextTimeClockStage,
  isTimeClockJourneyComplete,
  TIME_CLOCK_STAGE_LABELS,
} from '../lib/timeclock/stages.ts';

test('próximo estágio segue sequência CLT', () => {
  assert.equal(getNextTimeClockStage([]), 'IN');
  assert.equal(getNextTimeClockStage([{ type: 'IN' }]), 'BREAK_START');
  assert.equal(
    getNextTimeClockStage([{ type: 'IN' }, { type: 'BREAK_START' }]),
    'BREAK_END'
  );
  assert.equal(
    getNextTimeClockStage([
      { type: 'IN' },
      { type: 'BREAK_START' },
      { type: 'BREAK_END' },
    ]),
    'OUT'
  );
  assert.equal(
    getNextTimeClockStage([
      { type: 'IN' },
      { type: 'BREAK_START' },
      { type: 'BREAK_END' },
      { type: 'OUT' },
    ]),
    'DONE'
  );
});

test('jornada completa após 4 batidas', () => {
  assert.equal(
    isTimeClockJourneyComplete([
      { type: 'IN' },
      { type: 'BREAK_START' },
      { type: 'BREAK_END' },
      { type: 'OUT' },
    ]),
    true
  );
});

test('labels padrão folha de ponto', () => {
  assert.equal(TIME_CLOCK_STAGE_LABELS.IN, 'Entrada');
  assert.equal(TIME_CLOCK_STAGE_LABELS.BREAK_START, 'Saída almoço');
  assert.equal(TIME_CLOCK_STAGE_LABELS.BREAK_END, 'Retorno almoço');
  assert.equal(TIME_CLOCK_STAGE_LABELS.OUT, 'Fim do expediente');
});
