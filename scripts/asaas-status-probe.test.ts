import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('asaas-status probe e nf-control leve', () => {
  it('asaas-status expõe probe sem revelar a chave', () => {
    const src = fs.readFileSync('api/asaas-status.ts', 'utf8');
    assert.match(src, /summarizeAsaasTransferEnv/);
    assert.match(src, /probe/);
    assert.doesNotMatch(src, /access_token:\s*getAsaas/);
    assert.match(src, /ASAAS_TMGESTAO_API/);
  });

  it('retry-now usa bundle _nf-retry-core.cjs (não import server/)', () => {
    const ctl = fs.readFileSync('api/nf-control.ts', 'utf8');
    assert.match(ctl, /_nf-retry-core\.cjs/);
    assert.doesNotMatch(ctl, /import\(['"].*server\/nfRetryWorker/);
    assert.doesNotMatch(ctl, /from ['"].*server\/nfRetryWorker/);
    assert.match(ctl, /require\('\.\/_nf-retry-core\.cjs'\)/);
    const build = fs.readFileSync('build-server.mjs', 'utf8');
    assert.match(build, /_nf-retry-core\.cjs/);
    const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
    const retryRewrite = (vercel.rewrites || []).find(
      (r: { source?: string }) => r.source === '/api/nf/retry-now',
    );
    assert.equal(retryRewrite?.destination, '/api/nf-control?op=retry-now');
    assert.ok(fs.existsSync('api/_nf-retry-core.cjs'), 'bundle api/_nf-retry-core.cjs deve existir após build');
    const fnCount = Object.keys(vercel.functions || {}).length;
    assert.ok(fnCount <= 50, `functions=${fnCount} excede limite 50`);
  });
});
