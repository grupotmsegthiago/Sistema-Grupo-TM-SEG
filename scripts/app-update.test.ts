import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublishedVersionNewer, UPDATE_CHECK_COOLDOWN_MS } from '../lib/appUpdate.ts';

test('isPublishedVersionNewer detecta buildId diferente', () => {
  assert.equal(
    isPublishedVersionNewer(
      { version: '3.7.28', buildId: 'abc123' },
      { version: '3.7.28', buildId: 'def456' }
    ),
    true
  );
});

test('isPublishedVersionNewer detecta version diferente sem buildId', () => {
  assert.equal(
    isPublishedVersionNewer(
      { version: '3.7.28', buildId: 'same' },
      { version: '3.7.29', buildId: 'same' }
    ),
    true
  );
});

test('aba aberta confere publicação em menos de um minuto', () => {
  assert.ok(UPDATE_CHECK_COOLDOWN_MS <= 60_000);
});

test('isPublishedVersionNewer não atualiza quando igual', () => {
  assert.equal(
    isPublishedVersionNewer(
      { version: '3.7.29', buildId: 'commit-sha' },
      { version: '3.7.29', buildId: 'commit-sha' }
    ),
    false
  );
});
