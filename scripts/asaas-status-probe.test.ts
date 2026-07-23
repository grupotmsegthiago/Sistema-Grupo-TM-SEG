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

  it('nf-control NÃO importa nfRetryWorker (quebra na Vercel)', () => {
    const ctl = fs.readFileSync('api/nf-control.ts', 'utf8');
    assert.doesNotMatch(ctl, /nfRetryWorker/);
    assert.doesNotMatch(ctl, /runRetryCycle/);
    const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
    const retryRewrite = (vercel.rewrites || []).find(
      (r: { source?: string }) => r.source === '/api/nf/retry-now',
    );
    assert.equal(
      retryRewrite,
      undefined,
      'retry-now deve ir ao Express (catch-all), não ao nf-control',
    );
    const fnCount = Object.keys(vercel.functions || {}).length;
    assert.ok(fnCount <= 50, `functions=${fnCount} excede limite 50`);
  });
});
