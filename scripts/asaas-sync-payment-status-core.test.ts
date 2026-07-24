import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('handler leve asaas-sync-payment-status existe e usa core', () => {
  const handler = readFileSync(join(process.cwd(), 'api/asaas-sync-payment-status.ts'), 'utf8');
  assert.match(handler, /runAsaasSyncPaymentStatus/);
  assert.match(handler, /assertAsaasApiAccess/);
  const core = readFileSync(join(process.cwd(), 'lib/asaasSyncPaymentStatusCore.ts'), 'utf8');
  assert.match(core, /statusDescription/);
  assert.match(core, /getPayment/);
  assert.match(core, /liteHandler/);
});

test('vercel rewrite sync-payment-status aponta para handler leve', () => {
  const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'));
  const hit = (vercel.rewrites || []).find(
    (r: { source?: string }) => r.source === '/api/asaas/sync-payment-status',
  );
  assert.ok(hit);
  assert.equal(hit.destination, '/api/asaas-sync-payment-status');
  assert.ok(Object.keys(vercel.functions || {}).length <= 50);
});
