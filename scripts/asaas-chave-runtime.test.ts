import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('Asaas — chave lida em runtime (anti-401 NF)', () => {
  it('asaasService não congela apiKey no load do módulo', () => {
    const svc = fs.readFileSync('server/asaasService.ts', 'utf8');
    assert.match(svc, /function asaasCompanies\(\)/);
    assert.doesNotMatch(svc, /const ASAAS_COMPANIES:\s*Record/);
    assert.match(svc, /getAsaasApiKeyTmGestao\(\)/);
    assert.match(svc, /chave inválida|Asaas_TMSEGESTÃO_API/);
  });

  it('balances e chargeApi também leem chave em função', () => {
    const bal = fs.readFileSync('lib/asaasBalancesCore.ts', 'utf8');
    assert.match(bal, /function companyConfigs\(\)/);
    const charge = fs.readFileSync('lib/asaasChargeApi.ts', 'utf8');
    assert.match(charge, /function companies\(\)/);
  });
});
