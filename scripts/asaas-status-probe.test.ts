import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('asaas-status probe e retry-now leve', () => {
  it('asaas-status expõe probe sem revelar a chave', () => {
    const src = fs.readFileSync('api/asaas-status.ts', 'utf8');
    assert.match(src, /summarizeAsaasTransferEnv/);
    assert.match(src, /probe/);
    assert.doesNotMatch(src, /access_token:\s*getAsaas/);
    assert.match(src, /ASAAS_TMGESTAO_API/);
  });

  it('nf-control tem op retry-now e rewrite no vercel.json', () => {
    const ctl = fs.readFileSync('api/nf-control.ts', 'utf8');
    assert.match(ctl, /op === 'retry-now'/);
    assert.match(ctl, /runRetryCycle/);
    const vercel = fs.readFileSync('vercel.json', 'utf8');
    assert.match(vercel, /\/api\/nf\/retry-now/);
    assert.match(vercel, /nf-control\?op=retry-now/);
    const fnCount = Object.keys(JSON.parse(vercel).functions || {}).length;
    assert.ok(fnCount <= 50, `functions=${fnCount} excede limite 50`);
  });
});
