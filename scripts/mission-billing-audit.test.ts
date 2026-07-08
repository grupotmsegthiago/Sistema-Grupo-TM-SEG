import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeMissionBillingAudit,
  clearMissionBillingAuditCache,
  computePricingTablesHash,
} from '../lib/missionBillingAudit';
import { calculateMissionFinancials } from '../lib/financialUtils';
import type { Mission } from '../types';

const baseTables = {
  client: [
    {
      id: 1,
      client: 'TESTE',
      operation_type: 'FAIXA 100KM',
      activation_fee: 690,
      franchise_km: 100,
      franchise_hours: 3,
      price_per_extra_km: 5,
      price_per_extra_hour: 80,
    },
  ],
  provider: [
    {
      id: 1,
      provider: 'FORNECEDOR TESTE',
      operation_type: 'FAIXA 100KM',
      activation_cost: 500,
      franchise_km: 100,
      franchise_hours: 3,
      cost_per_extra_km: 4,
      cost_per_extra_hour: 60,
    },
  ],
};

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'GTM-TEST-1',
    client: 'TESTE',
    provider: 'FORNECEDOR TESTE',
    status: 'Concluída',
    origin: 'SAO PAULO - SP',
    destination: 'CAMPINAS - SP',
    start_km: 1000,
    end_km: 1120,
    start_time: '2026-07-01T08:00:00.000Z',
    end_time: '2026-07-01T12:15:00.000Z',
    revenue_value: 790,
    cost_value: 590,
    mission_type: 'Caracterizada',
    ...overrides,
  } as Mission;
}

describe('missionBillingAudit', () => {
  it('marca VALIDADO quando receita e custo batem com o cálculo', () => {
    clearMissionBillingAuditCache();
    const mission = makeMission();
    const fin = calculateMissionFinancials(
      mission,
      baseTables.client as any,
      baseTables.provider as any,
    );
    const expectedRev = fin.client.serviceTotal;
    const expectedCost = fin.provider.serviceTotal;
    const audit = computeMissionBillingAudit(
      { ...mission, revenue_value: expectedRev, cost_value: expectedCost } as Mission,
      baseTables.client as any,
      baseTables.provider as any,
    );
    assert.equal(audit.overallStatus, 'validado');
    assert.equal(audit.overallIcon, '🟢');
    assert.equal(audit.resultadoFinal, 'VALIDADO');
    assert.ok(Math.abs(audit.client.diferenca) < 0.01);
    assert.ok(Math.abs(audit.provider.diferenca) < 0.01);
  });

  it('marca ERRO quando receita diverge', () => {
    clearMissionBillingAuditCache();
    const mission = makeMission();
    const fin = calculateMissionFinancials(
      mission,
      baseTables.client as any,
      baseTables.provider as any,
    );
    const audit = computeMissionBillingAudit(
      { ...mission, revenue_value: fin.client.base, cost_value: fin.provider.serviceTotal } as Mission,
      baseTables.client as any,
      baseTables.provider as any,
    );
    assert.equal(audit.overallStatus, 'erro');
    assert.equal(audit.overallIcon, '🔴');
    assert.ok(audit.client.diferenca < 0);
    assert.ok(audit.client.motivos.length > 0);
  });

  it('marca ATENÇÃO para diferença menor que R$1', () => {
    clearMissionBillingAuditCache();
    const mission = makeMission();
    const fin = calculateMissionFinancials(
      mission,
      baseTables.client as any,
      baseTables.provider as any,
    );
    const audit = computeMissionBillingAudit(
      {
        ...mission,
        revenue_value: fin.client.serviceTotal - 0.5,
        cost_value: fin.provider.serviceTotal,
      } as Mission,
      baseTables.client as any,
      baseTables.provider as any,
    );
    assert.equal(audit.overallStatus, 'atencao');
    assert.equal(audit.overallIcon, '🟡');
  });

  it('usa cache e invalida quando fingerprint muda', () => {
    clearMissionBillingAuditCache();
    const mission = makeMission({ revenue_value: 790, cost_value: 590 });
    const hash = computePricingTablesHash(baseTables.client as any, baseTables.provider as any);

    const first = computeMissionBillingAudit(
      mission,
      baseTables.client as any,
      baseTables.provider as any,
      undefined,
      null,
      hash,
    );
    const second = computeMissionBillingAudit(
      mission,
      baseTables.client as any,
      baseTables.provider as any,
      undefined,
      null,
      hash,
    );
    assert.equal(first.cacheKey, second.cacheKey);

    const changed = computeMissionBillingAudit(
      { ...mission, revenue_value: 700 } as Mission,
      baseTables.client as any,
      baseTables.provider as any,
      undefined,
      null,
      hash,
    );
    assert.notEqual(first.cacheKey, changed.cacheKey);
  });
});
