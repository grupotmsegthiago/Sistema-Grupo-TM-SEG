import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublishedVersionNewer } from '../lib/appUpdate.ts';

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

test('isPublishedVersionNewer não atualiza quando igual', () => {
  assert.equal(
    isPublishedVersionNewer(
      { version: '3.7.29', buildId: 'commit-sha' },
      { version: '3.7.29', buildId: 'commit-sha' }
    ),
    false
  );
});
