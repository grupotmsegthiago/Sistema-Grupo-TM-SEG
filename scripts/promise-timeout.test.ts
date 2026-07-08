import test from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout, TimeoutError } from '../lib/promiseTimeout';

test('withTimeout resolve quando a promise termina a tempo', async () => {
  const result = await withTimeout(Promise.resolve(42), 200);
  assert.equal(result, 42);
});

test('withTimeout rejeita com TimeoutError quando estoura o limite', async () => {
  await assert.rejects(
    () => withTimeout(new Promise<number>(() => {}), 30, 'estourou'),
    (err: unknown) => err instanceof TimeoutError && (err as TimeoutError).message === 'estourou'
  );
});
