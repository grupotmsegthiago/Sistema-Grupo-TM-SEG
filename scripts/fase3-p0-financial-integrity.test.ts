import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveStoredProviderToll } from '../lib/toll/clientTollBilling';
import { computeCanonicalRevenueCost } from '../lib/missionFinancialsCanonical';
import { canAccessMissionReport } from '../lib/missionReportAccess';
import { MissionStatus } from '../types';

const emptyRefs = { clientTables: [], providerTables: [], clientsData: [] };

/** Mesma regra aplicada em FinancialDRE após P0-01 */
function sumDreProviderToll(missions: Array<{ toll_value?: number; toll_value_provider?: number | null; is_same_os?: boolean }>): number {
  return missions.reduce(
    (acc, m) => acc + resolveStoredProviderToll(m.toll_value || 0, m.toll_value_provider, !!m.is_same_os),
    0,
  );
}

/** Mesma regra aplicada nos charts de ClientBillingReport após P0-02 */
function sumChartMissionCost(m: {
  is_same_os?: boolean;
  cost_value?: number | null;
  toll_value?: number | null;
  toll_value_provider?: number | null;
  dispProv?: number;
}): number {
  const isSameOsChild = !!m.is_same_os;
  const tollProv = resolveStoredProviderToll(m.toll_value || 0, m.toll_value_provider, isSameOsChild);
  const costBase = isSameOsChild ? 0 : (m.cost_value || 0);
  return costBase + tollProv + (m.dispProv || 0);
}

describe('P0-01 — DRE pedágio fornecedor OS filha', () => {
  it('OS normal mantém pedágio fornecedor', () => {
    const missions = [{ is_same_os: false, toll_value: 60, toll_value_provider: 50, cost_value: 500 }];
    assert.equal(sumDreProviderToll(missions), 50);
  });

  it('OS filha (mesma OS) zera pedágio fornecedor no agregado DRE', () => {
    const missions = [
      { is_same_os: false, toll_value: 60, toll_value_provider: 50, cost_value: 500 },
      { is_same_os: true, toll_value: 60, toll_value_provider: 50, cost_value: 0, revenue_value: 200 },
    ];
    assert.equal(sumDreProviderToll(missions), 50);
  });

  it('somente filhas não inflam custo de pedágio', () => {
    const missions = [
      { is_same_os: true, toll_value: 120, toll_value_provider: 100, cost_value: 0 },
      { is_same_os: true, toll_value: 60, toll_value_provider: 50, cost_value: 0 },
    ];
    assert.equal(sumDreProviderToll(missions), 0);
  });
});

describe('P0-02 — charts faturamento pedágio/custo OS filha', () => {
  it('OS normal: custo inclui base + pedágio fornecedor', () => {
    assert.equal(sumChartMissionCost({ is_same_os: false, cost_value: 400, toll_value: 60, toll_value_provider: 50 }), 450);
  });

  it('OS filha: custo base zero e pedágio fornecedor zero', () => {
    assert.equal(
      sumChartMissionCost({ is_same_os: true, cost_value: 999, toll_value: 60, toll_value_provider: 50 }),
      0,
    );
  });

  it('código ClientBillingReport usa resolveStoredProviderToll', () => {
    const src = fs.readFileSync('components/ClientBillingReport.tsx', 'utf8');
    assert.match(src, /resolveStoredProviderToll/);
    assert.match(src, /isSameOsChild \? 0 : \(m\.cost_value/);
  });
});

describe('P0-03 — computeCanonicalRevenueCost fail-closed', () => {
  it('A — OS normal com valores persistidos → official', () => {
    const r = computeCanonicalRevenueCost({
      status: MissionStatus.COMPLETED,
      revenue_value: 800,
      cost_value: 500,
      toll_value: 60,
      toll_value_provider: 50,
      billing_approved: true,
    }, emptyRefs);
    assert.equal(r.valueStatus, 'official');
    assert.equal(r.revBase, 800);
    assert.equal(r.costBase, 500);
    assert.equal(r.tollCost, 50);
  });

  it('B — OS filha: nova receita + custo/pedágio fornecedor zero', () => {
    const r = computeCanonicalRevenueCost({
      status: MissionStatus.COMPLETED,
      is_same_os: true,
      parent_mission_id: 'GTM-100',
      revenue_value: 350,
      cost_value: 0,
      toll_value: 60,
      toll_value_provider: 50,
      billing_approved: true,
    }, emptyRefs);
    assert.equal(r.valueStatus, 'official');
    assert.equal(r.revBase, 350);
    assert.equal(r.costBase, 0);
    assert.equal(r.tollCost, 0);
    assert.equal(r.cost, 0);
  });

  it('C — OS aprovada sem receita persistida → needs_validation (não estima)', () => {
    const r = computeCanonicalRevenueCost({
      status: MissionStatus.COMPLETED,
      cost_value: 400,
      billing_approved: true,
      client: 'CLIENTE TESTE',
      origin: 'SAO PAULO - SP',
      destination: 'CAMPINAS - SP',
    }, emptyRefs);
    assert.equal(r.valueStatus, 'needs_validation');
    assert.equal(r.revBase, 0);
    assert.equal(r.costBase, 400);
  });

  it('OS não aprovada sem valores pode estimar (preview operacional)', () => {
    const r = computeCanonicalRevenueCost({
      status: MissionStatus.PENDING,
      client: 'SEM TABELA',
      origin: 'SAO PAULO - SP',
      destination: 'CAMPINAS - SP',
    }, emptyRefs);
    assert.equal(r.valueStatus, 'estimated');
  });

  it('cenário contrário: aprovada com receita e sem custo (não filha) → needs_validation', () => {
    const r = computeCanonicalRevenueCost({
      status: MissionStatus.COMPLETED,
      revenue_value: 700,
      billing_verified_by: 'auditor',
      is_same_os: false,
    }, emptyRefs);
    assert.equal(r.valueStatus, 'needs_validation');
    assert.equal(r.revBase, 700);
    assert.equal(r.costBase, 0);
  });
});

describe('P0-04 — migration endpoints exigem auth', () => {
  it('add-mission-columns protegido com requireAuth + requireRole', () => {
    const src = fs.readFileSync('server/routes.ts', 'utf8');
    assert.match(src, /app\.post\('\/api\/migration\/add-mission-columns', requireAuth, requireRole\('diretoria', 'administrador'\)/);
  });

  it('provider-ops-columns protegido com requireAuth + requireRole', () => {
    const src = fs.readFileSync('server/routes.ts', 'utf8');
    assert.match(src, /app\.post\("\/api\/migrations\/provider-ops-columns", requireAuth, requireRole\('diretoria', 'administrador'\)/);
  });
});

describe('P0-05 — mission-report permissão alinhada', () => {
  it('Giovanna tem acesso (evidência Sidebar + missionAccess financeiro)', () => {
    assert.equal(canAccessMissionReport({ name: 'Giovanna Marsili André', role: 'Financeiro' }), true);
  });

  it('usuário sem permissão bloqueado', () => {
    assert.equal(canAccessMissionReport({ name: 'Operador Comum', role: 'Operador' }), false);
  });

  it('App e Sidebar usam canAccessMissionReport', () => {
    const app = fs.readFileSync('App.tsx', 'utf8');
    const sidebar = fs.readFileSync('components/Sidebar.tsx', 'utf8');
    assert.match(app, /canAccessMissionReport/);
    assert.match(sidebar, /canAccessMissionReport/);
  });
});
