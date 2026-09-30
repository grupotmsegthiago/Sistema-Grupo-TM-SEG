import test from 'node:test';
import assert from 'node:assert/strict';
import { pickLiveMissionUpdate } from '../lib/missionLiveUpdate.ts';

test('atualização mais nova da OS aparece no lugar do log antigo', () => {
  const picked = pickLiveMissionUpdate(
    { created_at: '2026-09-30T14:09:00.000Z', description: 'SEM NOVIDADES' },
    { lastUpdate: '2026-09-30T17:40:00.000Z', currentLocation: 'CHEGUEI NO DESTINO | lat -23' },
  );
  assert.equal(picked.text, 'CHEGUEI NO DESTINO');
  assert.equal(picked.at, '2026-09-30T17:40:00.000Z');
});

test('log mais novo que a OS continua valendo', () => {
  const picked = pickLiveMissionUpdate(
    { created_at: '2026-09-30T18:00:00.000Z', description: 'ORIGEM CHEGUEI' },
    { lastUpdate: '2026-09-30T17:40:00.000Z', currentLocation: 'SEM NOVIDADES' },
  );
  assert.equal(picked.text, 'ORIGEM CHEGUEI');
  assert.equal(picked.at, '2026-09-30T18:00:00.000Z');
});

test('sem log usa a localização atual da OS', () => {
  const picked = pickLiveMissionUpdate(null, {
    lastUpdate: '2026-09-30T17:40:00.000Z',
    currentLocation: 'EM VIAGEM',
  });
  assert.equal(picked.text, 'EM VIAGEM');
  assert.equal(picked.at, '2026-09-30T17:40:00.000Z');
});
