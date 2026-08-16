/**
 * P4-SYNC-DRE — Auditoria + regra oficial: FinancialDRE (realizado) × canônico (gerencial)
 * Somente leitura / comparação determinística. Não altera produção.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { resolveStoredClientToll, resolveStoredProviderToll } from '../lib/toll/clientTollBilling.js';
import {
  computeCanonicalRevenueCost,
  filterMissionsByPeriod,
  sumCanonical,
  type CanonicalRefs,
} from '../lib/missionFinancialsCanonical.js';
import { MissionStatus } from '../types.js';

const emptyRefs: CanonicalRefs = { clientTables: [], providerTables: [], clientsData: [] };

/** Espelha filtro SQL do FinancialDRE (end_time + status realizados). */
function filterMissionsDrePeriod(
  missions: Array<Record<string, unknown>>,
  startIso: string,
  endIso: string,
): Array<Record<string, unknown>> {
  const startMs = new Date(`${startIso}T00:00:00`).getTime();
  const endMs = new Date(`${endIso}T23:59:59`).getTime();
  return missions.filter((m) => {
    const st = String(m.status || '');
    if (st !== MissionStatus.COMPLETED && st !== 'Faturada') return false;
    const ref = m.end_time as string | undefined;
    if (!ref) return false;
    const t = new Date(ref).getTime();
    return t >= startMs && t <= endMs;
  });
}

/** Espelho exato do agregado de missões em components/FinancialDRE.tsx (linhas 104–115). */
export function aggregateFinancialDreMissionTotals(missions: Array<Record<string, unknown>>) {
  const missionRevenue = missions.reduce((acc, m) => acc + (Number(m.revenue_value) || 0), 0);
  const missionTollClient = missions.reduce(
    (acc, m) => acc + resolveStoredClientToll(m.toll_value || 0, m.toll_value_provider),
    0,
  );
  const missionDisplacementClient = missions.reduce(
    (acc, m) => acc + (Number(m.displacement_value) || 0),
    0,
  );
  const missionCost = missions
    .filter((m) => m.is_same_os !== true)
    .reduce((acc, m) => acc + (Number(m.cost_value) || 0), 0);
  const missionTollProvider = missions.reduce(
    (acc, m) =>
      acc +
      resolveStoredProviderToll(m.toll_value || 0, m.toll_value_provider, !!m.is_same_os),
    0,
  );
  const missionDisplacementProvider = missions.reduce(
    (acc, m) => acc + (m.is_same_os === true ? 0 : Number(m.displacement_value_provider) || 0),
    0,
  );
  const rev = missionRevenue + missionTollClient + missionDisplacementClient;
  const cost = missionCost + missionTollProvider + missionDisplacementProvider;
  return {
    rev,
    cost,
    profit: rev - cost,
    missionRevenue,
    missionTollClient,
    missionDisplacementClient,
    missionCost,
    missionTollProvider,
    missionDisplacementProvider,
  };
}

function compareCase(
  label: string,
  mission: Record<string, unknown>,
  expectMatch: boolean,
) {
  const dre = aggregateFinancialDreMissionTotals([mission]);
  const canon = computeCanonicalRevenueCost(mission, emptyRefs);
  const diffRev = Math.round((dre.rev - canon.rev) * 100) / 100;
  const diffCost = Math.round((dre.cost - canon.cost) * 100) / 100;
  if (expectMatch) {
    assert.equal(diffRev, 0, `${label}: receita DRE=${dre.rev} canônico=${canon.rev}`);
    assert.equal(diffCost, 0, `${label}: custo DRE=${dre.cost} canônico=${canon.cost}`);
  } else {
    assert.ok(
      diffRev !== 0 || diffCost !== 0,
      `${label}: esperava divergência mas DRE e canônico coincidiram`,
    );
  }
  return { dre, canon, diffRev, diffCost };
}

describe('P4-SYNC-DRE — mapeamento FinancialDRE', () => {
  it('FinancialDRE soma revenue_value manual + resolveStored*Toll + displacement bruto', () => {
    const src = fs.readFileSync('components/FinancialDRE.tsx', 'utf8');
    assert.match(src, /missions\.reduce\(\(acc: number, m: any\) => acc \+ \(m\.revenue_value \|\| 0\)/);
    assert.match(src, /resolveStoredClientToll/);
    assert.match(src, /resolveStoredProviderToll/);
    assert.match(src, /m\.displacement_value \|\| 0/);
    assert.doesNotMatch(src, /import.*computeCanonicalRevenueCost|computeCanonicalRevenueCost\s*\(/);
    assert.match(src, /\.in\('status', \['Concluída', 'Faturada'\]\)/);
    assert.match(src, /\.gte\('end_time'/);
  });

  it('Diretoria usa sumCanonical / computeCanonicalRevenueCost', () => {
    const agg = fs.readFileSync('lib/dashboardDiretoria/aggregations.ts', 'utf8');
    assert.match(agg, /sumCanonical/);
    assert.match(agg, /computeCanonicalRevenueCost/);
    assert.match(agg, /filterMissionsByPeriod/);
  });
});

describe('P4-SYNC-DRE — casos onde DRE e canônico COINCIDEM', () => {
  it('OS normal aprovada com valores oficiais persistidos', () => {
    compareCase(
      'normal oficial',
      {
        status: MissionStatus.COMPLETED,
        revenue_value: 800,
        cost_value: 500,
        toll_value: 72,
        toll_value_provider: 60,
        displacement_value: 40,
        displacement_value_provider: 35,
        billing_approved: true,
        is_same_os: false,
      },
      true,
    );
  });

  it('OS filha is_same_os — receita nova, custo/pedágio fornecedor zero', () => {
    const { dre, canon } = compareCase(
      'filha same_os',
      {
        status: MissionStatus.COMPLETED,
        is_same_os: true,
        parent_mission_id: 'GTM-100',
        revenue_value: 350,
        cost_value: 0,
        toll_value: 72,
        toll_value_provider: 60,
        billing_approved: true,
      },
      true,
    );
    assert.equal(canon.valueStatus, 'official');
    assert.equal(dre.missionCost, 0);
    assert.equal(canon.costBase, 0);
    assert.equal(canon.tollCost, 0);
  });

  it('OS aprovada sem receita oficial → needs_validation, ambos receita missão zero', () => {
    const { canon } = compareCase(
      'aprovada sem receita',
      {
        status: MissionStatus.COMPLETED,
        cost_value: 400,
        billing_approved: true,
        client: 'CLIENTE',
        origin: 'SAO PAULO - SP',
        destination: 'CAMPINAS - SP',
      },
      true,
    );
    assert.equal(canon.valueStatus, 'needs_validation');
  });

  it('OS recusada → canônico zero; DRE normalmente não inclui (status fora do filtro)', () => {
    const canon = computeCanonicalRevenueCost({ status: MissionStatus.REFUSED, revenue_value: 900 }, emptyRefs);
    assert.equal(canon.rev, 0);
    assert.equal(canon.cost, 0);
  });
});

describe('P4-SYNC-DRE — divergências comprovadas (sem alterar código)', () => {
  it('OS não aprovada — DRE usa só persistido; canônico marca estimated (sem tabelas: números podem coincidir em zero)', () => {
    const mission = {
      status: MissionStatus.PENDING,
      client: 'SEM TABELA',
      origin: 'SAO PAULO - SP',
      destination: 'CAMPINAS - SP',
    };
    const dre = aggregateFinancialDreMissionTotals([mission]);
    const canon = computeCanonicalRevenueCost(mission, emptyRefs);
    assert.equal(dre.rev, 0);
    assert.equal(dre.cost, 0);
    assert.equal(canon.valueStatus, 'estimated');
    // Sem tabelas de preço o motor canônico também fica em zero — divergência é semântica (estimativa vs ignorar).
  });

  it('OS não aprovada com receita parcial → DRE mostra receita bruta; canônico valueStatus estimated', () => {
    const mission = {
      status: MissionStatus.PENDING,
      revenue_value: 500,
      client: 'SEM TABELA',
      origin: 'SAO PAULO - SP',
      destination: 'CAMPINAS - SP',
    };
    const dre = aggregateFinancialDreMissionTotals([mission]);
    const canon = computeCanonicalRevenueCost(mission, emptyRefs);
    assert.equal(dre.missionRevenue, 500);
    assert.equal(canon.revBase, 500);
    assert.equal(canon.valueStatus, 'estimated');
    assert.equal(canon.source, 'mixed');
  });

  it('KM autorizado sem displacement salvo → canônico deriva, DRE ignora', () => {
    const mission = {
      status: MissionStatus.COMPLETED,
      revenue_value: 500,
      cost_value: 300,
      billing_approved: true,
      dhl_deslocamento_km: 50,
      displacement_value: 0,
      displacement_value_provider: 0,
      origin: 'SAO PAULO - SP',
      is_same_os: false,
    };
    const dre = aggregateFinancialDreMissionTotals([mission]);
    const canon = computeCanonicalRevenueCost(mission, emptyRefs);
    assert.equal(dre.missionDisplacementClient, 0);
    assert.equal(dre.missionDisplacementProvider, 0);
    assert.ok(canon.dispRev > 0 || canon.dispCost > 0, 'canônico deriva deslocamento do KM');
    assert.notEqual(dre.rev, canon.rev);
  });

  it('valueStatus official não promove estimativa silenciosa quando aprovada+salva', () => {
    const canon = computeCanonicalRevenueCost(
      {
        status: MissionStatus.COMPLETED,
        revenue_value: 700,
        cost_value: 400,
        billing_approved: true,
      },
      emptyRefs,
    );
    assert.equal(canon.valueStatus, 'official');
    assert.equal(canon.source, 'saved');
  });

  it('valueStatus needs_validation quando aprovada sem receita — não estima receita', () => {
    const canon = computeCanonicalRevenueCost(
      {
        status: MissionStatus.COMPLETED,
        cost_value: 400,
        billing_verified_by: 'auditor',
        is_same_os: false,
      },
      emptyRefs,
    );
    assert.equal(canon.valueStatus, 'needs_validation');
    assert.equal(canon.revBase, 0);
  });
});

describe('P4-SYNC-DRE — matriz semântica (documentação)', () => {
  it('registra eixos estruturais diferentes DRE × Diretoria', () => {
    const dreSrc = fs.readFileSync('components/FinancialDRE.tsx', 'utf8');
    const matrix = {
      periodAxisDre: 'end_time',
      periodAxisDiretoria: 'start_time (filterMissionsByPeriod)',
      statusFilterDre: "['Concluída','Faturada']",
      statusFilterCanonical: 'qualquer status (REFUSED→zero)',
      receitaDre: 'revenue_value bruto',
      receitaDiretoria: 'revBase + tollRev + dispRev (canônico)',
      estimativaDre: 'nunca',
      estimativaDiretoria: 'sim quando não oficial',
      deslocamentoDre: 'displacement_value/provider bruto',
      deslocamentoDiretoria: 'resolveDisplacementFromAuthorizedKm',
    };
    assert.match(dreSrc, /end_time/);
    assert.ok(matrix.periodAxisDre !== matrix.periodAxisDiretoria);
  });

  it('lote misto: totais DRE vs sumCanonical em cenário oficial', () => {
    const missions = [
      {
        status: MissionStatus.COMPLETED,
        revenue_value: 1000,
        cost_value: 600,
        toll_value: 60,
        toll_value_provider: 50,
        billing_approved: true,
      },
      {
        status: MissionStatus.COMPLETED,
        is_same_os: true,
        revenue_value: 200,
        cost_value: 0,
        toll_value: 30,
        toll_value_provider: 25,
        billing_approved: true,
      },
    ];
    const dre = aggregateFinancialDreMissionTotals(missions);
    const canon = sumCanonical(missions, emptyRefs);
    assert.equal(Math.round(dre.rev * 100) / 100, Math.round(canon.rev * 100) / 100);
    assert.equal(Math.round(dre.cost * 100) / 100, Math.round(canon.cost * 100) / 100);
  });
});

describe('P4-SYNC-DRE — regra oficial formalizada (CASO 1–6)', () => {
  it('CASO 1 — OS concluída com valores oficiais → DRE usa persistidos', () => {
    const mission = {
      status: MissionStatus.COMPLETED,
      revenue_value: 1200,
      cost_value: 700,
      toll_value: 48,
      toll_value_provider: 40,
      displacement_value: 55,
      displacement_value_provider: 50,
      billing_approved: true,
    };
    const dre = aggregateFinancialDreMissionTotals([mission]);
    assert.equal(dre.missionRevenue, 1200);
    assert.equal(dre.missionCost, 700);
    assert.equal(dre.missionDisplacementClient, 55);
    assert.doesNotMatch(
      fs.readFileSync('components/FinancialDRE.tsx', 'utf8'),
      /import.*computeCanonicalRevenueCost|computeCanonicalRevenueCost\s*\(|resolveDisplacementFromAuthorizedKm|calculateMissionFinancials/,
    );
  });

  it('CASO 2 — KM autorizado sem displacement_value → Diretoria deriva, DRE não', () => {
    const mission = {
      status: MissionStatus.COMPLETED,
      revenue_value: 500,
      cost_value: 300,
      billing_approved: true,
      dhl_deslocamento_km: 50,
      displacement_value: 0,
      displacement_value_provider: 0,
      origin: 'SAO PAULO - SP',
    };
    const dre = aggregateFinancialDreMissionTotals([mission]);
    const canon = computeCanonicalRevenueCost(mission, emptyRefs);
    assert.equal(dre.missionDisplacementClient, 0);
    assert.equal(dre.missionDisplacementProvider, 0);
    assert.ok(canon.dispRev > 0 || canon.dispCost > 0);
    assert.notEqual(dre.rev, canon.rev);
  });

  it('CASO 3 — OS estimada (Pendente) → fora do filtro DRE; canônico estimated', () => {
    const pending = {
      status: MissionStatus.PENDING,
      revenue_value: 999,
      client: 'X',
      origin: 'A',
      destination: 'B',
    };
    const inDre = filterMissionsDrePeriod([pending], '2026-06-01', '2026-06-30');
    assert.equal(inDre.length, 0);
    assert.equal(computeCanonicalRevenueCost(pending, emptyRefs).valueStatus, 'estimated');
  });

  it('CASO 4 — needs_validation → DRE receita zero se revenue não persistido', () => {
    const mission = {
      status: MissionStatus.COMPLETED,
      cost_value: 400,
      billing_approved: true,
    };
    const dre = aggregateFinancialDreMissionTotals([mission]);
    const canon = computeCanonicalRevenueCost(mission, emptyRefs);
    assert.equal(canon.valueStatus, 'needs_validation');
    assert.equal(dre.missionRevenue, 0);
    assert.equal(canon.revBase, 0);
  });

  it('CASO 5 — OS filha same_os → fornecedor custo/pedágio/deslocamento zero no DRE', () => {
    const mission = {
      status: MissionStatus.COMPLETED,
      is_same_os: true,
      revenue_value: 250,
      cost_value: 999,
      toll_value: 60,
      toll_value_provider: 50,
      displacement_value_provider: 40,
      billing_approved: true,
    };
    const dre = aggregateFinancialDreMissionTotals([mission]);
    assert.equal(dre.missionRevenue, 250);
    assert.equal(dre.missionCost, 0);
    assert.equal(dre.missionTollProvider, 0);
    assert.equal(dre.missionDisplacementProvider, 0);
  });

  it('CASO 6 — período end_time (DRE) vs start_time (Diretoria) — diferença intencional', () => {
    const mission = {
      status: MissionStatus.COMPLETED,
      revenue_value: 100,
      cost_value: 50,
      start_time: '2026-06-05T08:00:00',
      end_time: '2026-06-20T18:00:00',
    };
    const periodStart = new Date(2026, 5, 1, 0, 0, 0, 0);
    const periodEnd = new Date(2026, 5, 15, 23, 59, 59, 999);
    const inDre = filterMissionsDrePeriod([mission], '2026-06-01', '2026-06-15');
    const inDir = filterMissionsByPeriod([mission], periodStart, periodEnd);
    assert.equal(inDre.length, 0, 'end_time 20/jun fora de 1–15 jun');
    assert.equal(inDir.length, 1, 'start_time 05/jun dentro de 1–15 jun');
  });

  it('código DRE documenta regra oficial realizada vs gerencial', () => {
    const src = fs.readFileSync('components/FinancialDRE.tsx', 'utf8');
    assert.match(src, /REGRA OFICIAL \(P4-SYNC-DRE\)/);
    assert.match(src, /REALIZADA/);
    assert.match(src, /end_time/);
    assert.doesNotMatch(src, /import.*computeCanonicalRevenueCost|computeCanonicalRevenueCost\s*\(/);
  });
});
