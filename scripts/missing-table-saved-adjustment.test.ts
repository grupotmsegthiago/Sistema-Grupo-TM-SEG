import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import { calculateMissionFinancials } from '../lib/financialUtils';
import { computeMissingTableRows } from '../components/MissingTableDialog';
import { MissionStatus } from '../types';
import type { BillingAdjustmentRecord } from '../lib/missionBillingAudit';

const CESLOG = 'CESLOG - CESARI LOGISTICA LTDA';

const nivelBrasil = {
  id: '6df6d99b-872a-4b64-a55f-4d17949c9aff',
  client: CESLOG,
  operation_type: 'NÍVEL BRASIL - PRONTA RESPOSTA - NIVEL BRASIL - 02 AGENTES',
  franchise_km: 50,
  franchise_hours: 3,
  activation_fee: 1399.68,
  price_per_extra_km: 3,
  price_per_extra_hour: 0,
};

const norteManaus = {
  id: '3369fc7d-0b6b-4dec-8efa-e27e1b800338',
  client: CESLOG,
  operation_type: 'NORTE - MANAUS (CARACTERIZADA) X MANAUS (CARACTERIZADA)',
  franchise_km: 100,
  franchise_hours: 3,
  activation_fee: 1458,
  price_per_extra_km: 7,
  price_per_extra_hour: 0,
};

const sudesteSantos = {
  id: '0e739321-a690-4cd5-bc88-9334e09835e0',
  client: CESLOG,
  operation_type: 'SUDESTE - CUBATÃO X SANTOS',
  franchise_km: 50,
  franchise_hours: 3,
  activation_fee: 699.84,
  price_per_extra_km: 7,
  price_per_extra_hour: 0,
};

const clientTables = [nivelBrasil, norteManaus, sudesteSantos] as any[];

function maeDoRioMission() {
  return {
    id: 'GTM-7714',
    client: CESLOG,
    provider: 'ATIVA SERVICOS',
    status: MissionStatus.ORIGIN,
    origin: '3F9G+JMW, Mãe do Rio - PA, 68675-000',
    destination: '3F9G+JMW, Mãe do Rio - PA, 68675-000',
    startKm: 69229,
    endKm: null,
    totalDistance: 0,
    startTime: '2026-09-09T13:16:00.000Z',
    endTime: null,
    billing_approved: false,
    billing_verified_by: null,
    revenue_value: 1399.68,
    cost_value: 860,
    is_same_os: false,
    agent1: 'Leandro Aguiar de Oliveira',
    agent2: 'Samuelson Nunes da Silva',
  } as any;
}

describe('OS sem tabela — tabela salva na auditoria', () => {
  it('motor automático não encontra tabela para CESLOG Mãe do Rio/PA', () => {
    const fin = calculateMissionFinancials(maeDoRioMission(), clientTables, [], undefined, new Date());
    assert.equal(fin.hasClientTable, false);
  });

  it('seleção manual aplica a tabela mesmo com região diferente da origem', () => {
    const fin = calculateMissionFinancials(
      maeDoRioMission(),
      clientTables,
      [],
      undefined,
      new Date(),
      { clientTableId: String(sudesteSantos.id) },
    );
    assert.equal(fin.hasClientTable, true);
    assert.equal(fin.client.tableId, String(sudesteSantos.id));
    assert.match(String(fin.client.tableName), /SUDESTE/i);
  });

  it('alerta OS SEM TABELA some quando BillingAdjustment tem a tabela escolhida', () => {
    const missions = [maeDoRioMission()];
    const withoutAdj = computeMissingTableRows(missions, clientTables, [], [], 'ALL', undefined, undefined, true);
    assert.equal(withoutAdj.length, 1);
    assert.equal(withoutAdj[0].missingClient, true);

    const adj = new Map<string, BillingAdjustmentRecord>([
      ['GTM-7714', { clientTableId: String(nivelBrasil.id), providerTableId: 'prov-1' }],
    ]);
    const withAdj = computeMissingTableRows(missions, clientTables, [], [], 'ALL', undefined, undefined, true, adj);
    assert.equal(withAdj.some((r) => r.missingClient), false);
  });

  it('alerta some mesmo quando o catálogo em memória não contém a tabela salva', () => {
    const missions = [maeDoRioMission()];
    const incompleteCatalog = [norteManaus, sudesteSantos] as any[];
    const adj = new Map<string, BillingAdjustmentRecord>([
      ['GTM-7714', { clientTableId: String(nivelBrasil.id) }],
    ]);
    const rows = computeMissingTableRows(missions, incompleteCatalog, [], [], 'ALL', undefined, undefined, true, adj);
    assert.equal(rows.some((r) => r.missingClient), false);
  });

  it('MissionTable pagina o catálogo de tabelas (não corta em 1000)', () => {
    const source = fs.readFileSync('components/MissionTable.tsx', 'utf8');
    assert.match(source, /fetchAllPagesOf\(supabase\.from\('client_price_tables'\)\.select\('\*'\)\)/);
    assert.match(source, /fetchAllPagesOf\(supabase\.from\('provider_cost_tables'\)\.select\('\*'\)\)/);
    assert.doesNotMatch(source, /supabase\.from\('client_price_tables'\)\.select\('\*'\)\s*,/);
  });
});
