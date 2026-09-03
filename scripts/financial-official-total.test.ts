/**
 * FINANCEIRO Fase 1B.2 — resolveOfficialMissionTotal (T01–T12)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  resolveOfficialMissionTotal,
  sumOfficialMissionTotals,
  hasManualEditOverride,
} from '../lib/billing/resolveOfficialMissionTotal';
import { MissionStatus } from '../types';
import type { ClientPriceTable } from '../types';

const emptyRefs = { clientTables: [] as ClientPriceTable[], providerTables: [], clientsData: [] };

const snap150 = {
  revenueServiceOnly: 100,
  totalGeral: 150,
  activationFee: 100,
  kmExtraTotal: 0,
  hrExtraTotal: 0,
  tollVal: 25,
  displacementVal: 25,
};

describe('Fase 1B.2 — resolveOfficialMissionTotal', () => {
  it('T01 — soma simples revBase 150 = total 150', () => {
    const r = resolveOfficialMissionTotal(
      { id: 'GTM-1', status: MissionStatus.COMPLETED, revenue_value: 150, toll_value: 0, toll_value_provider: 0 },
      emptyRefs,
    );
    assert.equal(r.revBase, 150);
    assert.equal(r.total, 150);
    assert.equal(r.source, 'saved');
  });

  it('T02 — snapshot 150 / revenue 100 => total 150 (revBase snapshot)', () => {
    const m = {
      id: 'GTM-2',
      status: MissionStatus.COMPLETED,
      revenue_value: 100,
      toll_value: 25,
      toll_value_provider: 20,
      displacement_value: 25,
      snapshot_approved_by: 'Operador',
      snapshot_data: snap150,
    };
    const r = resolveOfficialMissionTotal(m, emptyRefs);
    assert.equal(r.revBase, 100);
    assert.equal(r.toll, 25);
    assert.equal(r.disp, 25);
    assert.equal(r.total, 150);
    assert.equal(r.source, 'snapshot');
  });

  it('T03 — snapshot revBase 100 + ped 50 + DESL persistido 40 => 190', () => {
    const m = {
      id: 'GTM-3',
      status: MissionStatus.COMPLETED,
      revenue_value: 100,
      toll_value: 50,
      toll_value_provider: 40,
      displacement_value: 40,
      dhl_deslocamento_km: 0,
      snapshot_approved_by: 'Operador',
      snapshot_approved_at: '2026-01-01T00:00:00Z',
      snapshot_data: {
        ...snap150,
        totalGeral: 150,
        tollVal: 50,
        displacementVal: 0,
      },
    };
    const r = resolveOfficialMissionTotal(m, emptyRefs);
    assert.equal(r.total, 190);
    assert.equal(r.disp, 40);
  });

  it('T04 — pedágio markup base 20 => cliente 24, total 124', () => {
    const r = resolveOfficialMissionTotal(
      {
        id: 'GTM-4',
        status: MissionStatus.COMPLETED,
        revenue_value: 100,
        toll_value: 24,
        toll_value_provider: 20,
      },
      emptyRefs,
    );
    assert.equal(r.toll, 24);
    assert.equal(r.total, 124);
  });

  it('T05 — full stack revBase 150 + ped 25 + desl 40 => 215', () => {
    const r = resolveOfficialMissionTotal(
      {
        id: 'GTM-5',
        status: MissionStatus.COMPLETED,
        revenue_value: 150,
        toll_value: 25,
        toll_value_provider: 20,
        displacement_value: 40,
      },
      emptyRefs,
    );
    assert.equal(r.total, 215);
    assert.equal(r.revBase + r.toll + r.disp, 215);
  });

  it('T06a — cancelada antes com revenue mínimo persistido', () => {
    const r = resolveOfficialMissionTotal(
      {
        id: 'GTM-6a',
        status: MissionStatus.CANCELLED,
        revenue_value: 690,
        toll_value: 0,
        toll_value_provider: 0,
        billing_approved: true,
      },
      emptyRefs,
    );
    assert.equal(r.revBase, 690);
    assert.equal(r.total, 690);
  });

  it('T06b — cancelada executada mantém revBase persistido + aditivos', () => {
    const r = resolveOfficialMissionTotal(
      {
        id: 'GTM-6b',
        status: MissionStatus.CANCELLED,
        revenue_value: 850,
        toll_value: 30,
        toll_value_provider: 25,
        displacement_value: 15,
        start_km: 100,
        end_km: 250,
      },
      emptyRefs,
    );
    assert.equal(r.total, 850 + 30 + 15);
  });

  it('T07 — edição manual vence snapshot', () => {
    const m = {
      id: 'GTM-7',
      status: MissionStatus.COMPLETED,
      revenue_value: 120,
      revenue_edit_reason: '[Op - 01/01/2026] Edição manual — receita salva: R$ 120,00 | sistema sugeria: R$ 150,00',
      toll_value: 0,
      toll_value_provider: 0,
      snapshot_approved_by: 'Operador',
      snapshot_data: snap150,
    };
    assert.equal(hasManualEditOverride(m, snap150 as any), true);
    const r = resolveOfficialMissionTotal(m, emptyRefs);
    assert.equal(r.revBase, 120);
    assert.equal(r.source, 'manual');
    assert.equal(r.total, 120);
  });

  it('T08 — billing_period_override não altera total (campo de inclusão 1A)', () => {
    const base = {
      id: 'GTM-8',
      status: MissionStatus.COMPLETED,
      revenue_value: 200,
      toll_value: 10,
      toll_value_provider: 10,
      billing_period_override: '2026-02-15',
    };
    const r1 = resolveOfficialMissionTotal(base, emptyRefs);
    const r2 = resolveOfficialMissionTotal({ ...base, billing_period_override: null }, emptyRefs);
    assert.equal(r1.total, r2.total);
  });

  it('T09 — resolvedor = soma linhas (paridade comparador/boletim)', () => {
    const missions = [
      { id: 'GTM-9a', status: MissionStatus.COMPLETED, revenue_value: 100, toll_value: 0, toll_value_provider: 0 },
      {
        id: 'GTM-9b',
        status: MissionStatus.COMPLETED,
        revenue_value: 100,
        toll_value: 25,
        toll_value_provider: 20,
        displacement_value: 25,
        snapshot_approved_by: 'X',
        snapshot_data: snap150,
      },
    ];
    let lineSum = 0;
    for (const m of missions) {
      lineSum += resolveOfficialMissionTotal(m, emptyRefs).total;
    }
    const grand = sumOfficialMissionTotals(missions, emptyRefs);
    assert.equal(lineSum, grand);
    assert.equal(grand, 100 + 150);
  });

  it('T10 — billingAdjustment pós-snapshot não altera total (simulação)', () => {
    const m = {
      id: 'GTM-10',
      status: MissionStatus.COMPLETED,
      revenue_value: 100,
      toll_value: 25,
      toll_value_provider: 20,
      displacement_value: 25,
      snapshot_approved_by: 'Operador',
      snapshot_approved_at: '2026-01-01T00:00:00Z',
      snapshot_data: snap150,
    };
    const withoutAdj = resolveOfficialMissionTotal(m, emptyRefs, {
      billingAdjustment: null,
      snapshotAt: new Date('2026-01-01').getTime(),
    });
    const withAdj = resolveOfficialMissionTotal(m, emptyRefs, {
      billingAdjustment: { customClientBase: 9999, customClientKm: 99 },
      billingAdjustmentAt: new Date('2026-02-01').getTime(),
      snapshotAt: new Date('2026-01-01').getTime(),
    });
    assert.equal(withoutAdj.total, 150);
    assert.equal(withAdj.total, 150);
    assert.equal(withAdj.isSimulation, true);
    assert.equal(withAdj.valueStatus, 'simulation');
  });

  it('T11 — 999+ OS: soma individual = grandTotal', () => {
    const missions = Array.from({ length: 1001 }, (_, i) => ({
      id: `GTM-${i}`,
      status: MissionStatus.COMPLETED,
      revenue_value: 100 + (i % 3),
      toll_value: 0,
      toll_value_provider: 0,
    }));
    const grand = sumOfficialMissionTotals(missions, emptyRefs);
    let manual = 0;
    for (const m of missions) manual += resolveOfficialMissionTotal(m, emptyRefs).total;
    assert.equal(grand, manual);
  });

  it('T12 — IBL 12% entra no revBase via forceIblFee no adjustment', () => {
    const table: ClientPriceTable = {
      id: 'tbl-ibl',
      client: 'TEST',
      operation_type: 'TEST IBL',
      activation_fee: 100,
      franchise_km: 100,
      franchise_hours: 2,
      price_per_extra_km: 1,
      price_per_extra_hour: 1,
      route_name: 'R',
      region: 'SP',
    } as ClientPriceTable;
    const refs = { ...emptyRefs, clientTables: [table] };
    const m = {
      id: 'GTM-12',
      status: MissionStatus.COMPLETED,
      client: 'TEST',
      revenue_value: 168,
      toll_value: 0,
      toll_value_provider: 0,
      start_km: 0,
      end_km: 0,
      total_distance: 150,
      start_time: '2026-01-01T08:00:00',
      end_time: '2026-01-01T10:00:00',
    };
    const r = resolveOfficialMissionTotal(m, refs, {
      billingAdjustment: { forceIblFee: true, clientTableId: 'tbl-ibl' },
    });
    assert.equal(r.revBase, 168);
    assert.equal(r.total, 168);
  });

  it('ClientBillingReport usa resolveOfficialMissionTotal e grandTotal = soma linhas', () => {
    const src = fs.readFileSync('components/ClientBillingReport.tsx', 'utf8');
    assert.match(src, /resolveOfficialMissionTotal/);
    assert.match(src, /rowsData\.reduce\(\(s, r\) => s \+ \(Number\(r\.totalGeral\)/);
    assert.doesNotMatch(src, /snapTotalWithDisp/);
    assert.doesNotMatch(src, /dbTotal: hasDbValue/);
  });
});

describe('Fase 1B.2 — exemplo 150 vs 100 corrigido', () => {
  it('linha e grandTotal convergem em 150 quando snapshot congela total', () => {
    const m = {
      id: 'GTM-EX',
      status: MissionStatus.COMPLETED,
      revenue_value: 100,
      toll_value: 25,
      toll_value_provider: 20,
      displacement_value: 25,
      snapshot_approved_by: 'Financeiro',
      snapshot_data: snap150,
    };
    const official = resolveOfficialMissionTotal(m, emptyRefs);
    assert.equal(official.total, 150);
    assert.notEqual(m.revenue_value + 0 + 0, 150);
    assert.equal(official.revBase + official.toll + official.disp, 150);
  });
});
