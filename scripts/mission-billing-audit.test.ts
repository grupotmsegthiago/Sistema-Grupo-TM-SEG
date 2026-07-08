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

  it('respeita medição editada do fornecedor (provider_ops_edited)', () => {
    clearMissionBillingAuditCache();
    const mission = makeMission({
      provider_ops_edited: true,
      provider_start_km: 48228,
      provider_end_km: 48269,
      provider_start_time: '2026-07-01T08:00:00.000Z',
      provider_end_time: '2026-07-01T12:06:00.000Z',
      start_km: 48228,
      end_km: 48247,
      start_time: '2026-07-01T08:00:00.000Z',
      end_time: '2026-07-01T10:05:00.000Z',
    } as any);
    const fin = calculateMissionFinancials(
      mission,
      baseTables.client as any,
      baseTables.provider as any,
      undefined,
      new Date(),
      { providerOpsOverride: { distanceKm: 41, durationHours: 4.1 } },
    );
    assert.ok(fin.provider.extraHrVal > 0);
    assert.ok(fin.client.serviceTotal !== fin.provider.serviceTotal || fin.client.excessHours !== fin.provider.excessHours);

    const audit = computeMissionBillingAudit(
      {
        ...mission,
        revenue_value: fin.client.serviceTotal,
        cost_value: fin.provider.serviceTotal,
      } as Mission,
      baseTables.client as any,
      baseTables.provider as any,
    );
    assert.equal(audit.overallStatus, 'validado');
    assert.ok(audit.provider.subtotalHora > 0);
    assert.equal(audit.provider.kmRodado, 41);
  });

  it('usa tabelas do snapshot quando OS foi aprovada com conferência', () => {
    clearMissionBillingAuditCache();
    const mission = makeMission({
      client: 'TESTE',
      provider: 'FORNECEDOR TESTE',
      origin: 'GUARUJÁ, SP',
      destination: 'SANTANA DE PARNAÍBA, SP',
      start_km: 32712,
      end_km: 32849,
      start_time: '2026-07-06T11:00:00+00:00',
      end_time: '2026-07-06T15:34:00+00:00',
      billing_approved: true,
      snapshot_approved_by: 'Auditor',
      snapshot_data: {
        clientTableId: '1',
        providerTableId: '1',
      },
    } as any);

    const clientTables = [
      ...baseTables.client,
      {
        id: 'rota-nomeada',
        client: 'TESTE',
        operation_type: 'ROTA NOMEADA CARA',
        activation_fee: 944.72,
        franchise_km: 143,
        franchise_hours: 3,
        price_per_extra_km: 6.6,
        price_per_extra_hour: 160,
      },
    ];

    const finAuto = calculateMissionFinancials(mission, clientTables as any, baseTables.provider as any);
    const finSnap = calculateMissionFinancials(
      mission,
      clientTables as any,
      baseTables.provider as any,
      undefined,
      new Date(),
      { clientTableId: '1', providerTableId: '1' },
    );

    const audit = computeMissionBillingAudit(
      {
        ...mission,
        revenue_value: finSnap.client.serviceTotal,
        cost_value: finSnap.provider.serviceTotal,
      } as Mission,
      clientTables as any,
      baseTables.provider as any,
    );

    assert.ok(finAuto.client.serviceTotal > finSnap.client.serviceTotal + 10, 'auto seria mais caro');
    assert.equal(audit.overallStatus, 'validado');
    assert.ok(Math.abs(audit.client.diferenca) < 0.01);
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
