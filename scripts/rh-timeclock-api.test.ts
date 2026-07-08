import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertTimeclockReadAccess,
} from '../lib/rh/apiTimeclockAuth.ts';

describe('apiTimeclockAuth', () => {
  it('nega token vazio', async () => {
    assert.equal(await assertTimeclockReadAccess(''), 'Não autorizado');
  });

  it('nega token inválido', async () => {
    assert.equal(await assertTimeclockReadAccess('invalid'), 'Não autorizado');
  });
});

describe('fetchEntriesApi', () => {
  it('monta query string com datas', async () => {
    const src = await import('node:fs/promises').then((fs) =>
      fs.readFile('lib/timeclock/fetchEntriesApi.ts', 'utf8')
    );
    assert.match(src, /start:/);
    assert.match(src, /end:/);
    assert.match(src, /\/api\/rh\/timeclock\/entries/);
  });
});
