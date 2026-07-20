import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getMissionOpsMissingFields,
  getMissionOpsDisplayStatus,
  isMissionOpsIncomplete,
  isOpsAlertRecipient,
} from '../lib/missionOpsIncomplete.ts';

test('isOpsAlertRecipient reconhece Michelle, Barbara, Giovanna e Daniel', () => {
  assert.equal(isOpsAlertRecipient({ name: 'Michelle Silva' }), true);
  assert.equal(isOpsAlertRecipient({ name: 'Bárbara Costa' }), true);
  assert.equal(isOpsAlertRecipient({ name: 'Giovanna Marsili' }), true);
  assert.equal(isOpsAlertRecipient({ name: 'Daniel' }), true);
  assert.equal(isOpsAlertRecipient({ name: 'Thiago' }), false);
});

test('OS concluída sem KM final e hora final é incompleta', () => {
  const missing = getMissionOpsMissingFields({
    status: 'Concluída',
    startKm: 100,
    startTime: '2024-07-12T01:31:00Z',
    endKm: 0,
    endTime: null,
  });
  assert.deepEqual(missing, ['HORA FINAL', 'KM FINAL']);
  assert.equal(isMissionOpsIncomplete({ status: 'Concluída', endKm: 0 }), true);
  assert.equal(getMissionOpsDisplayStatus({ status: 'Concluída', endKm: 0 }), 'PENDENTE');
});

test('OS concluída com todos os dados está completa', () => {
  const m = {
    status: 'Concluída',
    startKm: 100,
    endKm: 150,
    startTime: '2024-07-12T01:31:00Z',
    endTime: '2024-07-12T08:00:00Z',
  };
  assert.deepEqual(getMissionOpsMissingFields(m), []);
  assert.equal(getMissionOpsDisplayStatus(m), 'Concluída');
});
