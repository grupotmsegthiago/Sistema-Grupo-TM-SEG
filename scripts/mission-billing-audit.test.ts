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

  it('recupera tabela órfã do snapshot via fallback (fornecedor)', () => {
    clearMissionBillingAuditCache();
    const mission = makeMission({
      billing_approved: true,
      snapshot_approved_by: 'Auditor',
      provider: 'FORNECEDOR TESTE',
      snapshot_data: {
        clientTableId: '1',
        providerTableId: 'id-orfao-nao-existe',
        tableName: 'FAIXA 100KM',
        franchiseKm: 100,
        activationFee: 690,
      },
    } as any);
    const fin = calculateMissionFinancials(
      mission,
      baseTables.client as any,
      baseTables.provider as any,
      undefined,
      new Date(),
      { clientTableId: '1' },
    );

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
    assert.ok(Math.abs(audit.provider.diferenca) < 0.01);
  });

  it('prioriza tableName do snapshot quando clientTableId aponta para tabela errada', () => {
    clearMissionBillingAuditCache();
    const itajaiTable = {
      id: 'itajai-bh',
      client: 'PRESTEX ENCOMENDAS EXPRESSAS LTDA',
      operation_type: 'SUL - ITAJAI X BELO HORIZONTE',
      activation_fee: 12200,
      franchise_km: 1600,
      franchise_hours: 100,
      price_per_extra_km: 7.45,
      price_per_extra_hour: 175,
    };
    const saoJoseTable = {
      id: 'sao-jose-wrong',
      client: 'PRESTEX ENCOMENDAS EXPRESSAS LTDA',
      operation_type: 'SUL - SÃO JOSÉ SC X SP X MT',
      activation_fee: 35000,
      franchise_km: 4300,
      franchise_hours: 100,
      price_per_extra_km: 7.45,
      price_per_extra_hour: 175,
    };
    const clientTables = [itajaiTable, saoJoseTable];
    const mission = makeMission({
      client: 'PRESTEX ENCOMENDAS EXPRESSAS LTDA',
      origin: 'R. FRANCISCO REIS, ITAJAÍ - SC',
      destination: 'BELO HORIZONTE, MG',
      start_km: 28283,
      end_km: null,
      total_distance: 1192.3,
      billing_approved: true,
      snapshot_approved_by: 'Auditor',
      snapshot_data: {
        clientTableId: 'sao-jose-wrong',
        providerTableId: '1',
        tableName: 'SUL - ITAJAI X BELO HORIZONTE',
        activationFee: 12200,
        franchiseKm: 1600,
        revenueServiceOnly: 12200,
      },
    } as any);

    const fin = calculateMissionFinancials(
      mission,
      clientTables as any,
      baseTables.provider as any,
      undefined,
      new Date(),
      { clientTableId: 'itajai-bh', providerTableId: '1' },
    );

    const audit = computeMissionBillingAudit(
      {
        ...mission,
        revenue_value: 12200,
        cost_value: fin.provider.serviceTotal,
      } as Mission,
      clientTables as any,
      baseTables.provider as any,
    );

    assert.equal(audit.overallStatus, 'validado');
    assert.equal(audit.client.esperado, 12200);
    assert.ok(audit.client.tableName?.includes('ITAJAI'));
  });

  it('valida fornecedor quando valor lançado bate com tabela real (motor auto divergente)', () => {
    clearMissionBillingAuditCache();
    const g8Name = 'COMANDO G8 - SEGURANCA PATRIMONIAL E TRANSPORTE DE VALORES LTDA';
    const providerTables = [
      {
        id: '100km-real',
        provider: g8Name,
        operation_type: '100KM',
        activation_cost: 480,
        franchise_km: 100,
        franchise_hours: 3,
        cost_per_extra_km: 4,
        cost_per_extra_hour: 60,
      },
      {
        id: '200km-real',
        provider: g8Name,
        operation_type: '200KM',
        activation_cost: 960,
        franchise_km: 200,
        franchise_hours: 6,
        cost_per_extra_km: 4,
        cost_per_extra_hour: 60,
      },
    ];
    const providersList = [
      {
        name: g8Name,
        auto_calc_enabled: true,
        auto_base_value: 6200,
        auto_base_km: 100,
        auto_base_hr: 3,
        auto_extra_km: 4,
        auto_extra_hr: 90,
      },
    ];
    const mission = makeMission({
      provider: g8Name,
      start_km: 62065,
      end_km: 62171,
      start_time: '2026-07-07T01:30:00+00:00',
      end_time: '2026-07-07T05:16:07+00:00',
    } as any);

    const finAuto = calculateMissionFinancials(
      mission,
      baseTables.client as any,
      providerTables as any,
      undefined,
      new Date(),
      undefined,
      providersList,
    );
    const finReal100 = calculateMissionFinancials(
      mission,
      baseTables.client as any,
      providerTables as any,
      undefined,
      new Date(),
      { providerTableId: '100km-real' },
      providersList,
    );

    assert.ok(finAuto.provider.serviceTotal > finReal100.provider.serviceTotal + 100, 'motor auto deve divergir da tabela real');

    const audit = computeMissionBillingAudit(
      {
        ...mission,
        revenue_value: finAuto.client.serviceTotal,
        cost_value: finReal100.provider.serviceTotal,
      } as Mission,
      baseTables.client as any,
      providerTables as any,
      undefined,
      providersList,
    );

    assert.equal(audit.overallStatus, 'validado');
    assert.ok(Math.abs(audit.provider.diferenca) < 0.01);
    assert.equal(audit.provider.tableName, '100KM');
    assert.equal(audit.provider.esperado, finReal100.provider.serviceTotal);
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
