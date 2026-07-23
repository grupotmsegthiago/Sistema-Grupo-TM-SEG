import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('NF status sync lite — limpa 401 stale', () => {
  it('lib sync e nf-control chamam syncPendingAsaasNfStatuses', () => {
    const sync = fs.readFileSync('lib/asaasNfStatusSync.ts', 'utf8');
    assert.match(sync, /nf_last_error\s*=\s*null/);
    assert.match(sync, /getInvoicesByPayment/);
    const ctl = fs.readFileSync('api/nf-control.ts', 'utf8');
    assert.match(ctl, /syncPendingAsaasNfStatuses/);
    assert.match(ctl, /op === 'sync-nf'/);
    const vercel = fs.readFileSync('vercel.json', 'utf8');
    assert.match(vercel, /\/api\/nf\/sync-status/);
    const worker = fs.readFileSync('server/nfRetryWorker.ts', 'utf8');
    assert.match(worker, /nf_last_error:\s*null,\s*\n\s*nf_retry_paused:\s*false/);
    const charge = fs.readFileSync('lib/asaasChargeApi.ts', 'utf8');
    assert.match(charge, /export async function getInvoicesByPayment/);
  });
});
