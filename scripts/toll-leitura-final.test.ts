import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { linhaDoBoletimCeva } from '../lib/cevaPortal/report';
import { franquiaKmBoletimAprovado, computeDhlBand } from '../lib/dhlAutoTableSelector';
import {
  DIVERGENCIA_ALTERACAO_COM_MOTIVO,
  DIVERGENCIA_ALTERACAO_INDETERMINADA,
  DIVERGENCIA_ALTERACAO_REAL,
  classificarAlteracaoPosterior,
  textoAlteracaoPosterior,
} from '../lib/missionSnapshot';

const ctx = {
  priceTables: [{
    id: '99',
    franchise_km: 99,
    franchise_hours: 9,
    activation_fee: 1,
    price_per_extra_km: 9,
    price_per_extra_hour: 9,
  }],
  providerTables: [],
  adjustment: { clientTableId: '99' },
};

function snapshotLegado() {
  return {
    tollVal: 100,
    revenueServiceOnly: 500,
    totalGeral: 600,
    franchiseKm: 200,
    franchiseHours: 4,
    unitKm: 3,
    unitHr: 80,
    activationFee: 150,
    kmExtraTotal: 30,
    hrExtraTotal: 20,
    kmExtraQtd: 10,
    hrExtraQtd: 1,
    durationHours: 5,
    kmTotal: 210,
    approved_by: 'Financeiro Ana',
  };
}

function osLegada(extra: Record<string, unknown> = {}) {
  const snap = snapshotLegado();
  return {
    id: 'GTM-620',
    status: 'Concluída',
    client: 'CLIENTE EXEMPLO',
    billing_approved: true,
    snapshot_approved_by: 'Financeiro Ana',
    revenue_value: 500,
    toll_value: 100,
    toll_value_provider: 100,
    start_km: 0,
    end_km: 210,
    snapshot_data: snap,
    ...extra,
    snapshot_data: extra.snapshot_data ?? snap,
  };
}

describe('leitura final do portal e do boletim', () => {
  it('CEVA com carimbo humano mostra o total oficial 620 e preserva a franquia histórica', () => {
    const mission = osLegada();
    const antes = JSON.parse(JSON.stringify(mission));
    const row = linhaDoBoletimCeva(mission as any, ctx);
    assert.equal(row?.valorTotal, 620);
    assert.equal(row?.pedagio, 120);
    assert.equal(row?.franquiaKm, 200);
    assert.equal(row?.franquiaHora, '04:00');
    assert.equal(row?.tarifaKm, 3);
    assert.equal(row?.tarifaHora, 80);
    assert.equal(row?.valorAcionamento, 150);
    assert.equal(row?.origemSnapshot, 'humana');
    assert.equal(row?.divergenciaDetalhamento, null);
    assert.deepEqual(mission, antes);
  });

  it('CEVA com carimbo automático usa o mesmo total oficial', () => {
    const row = linhaDoBoletimCeva(osLegada({
      snapshot_approved_by: 'Sistema (Recalcular e Comparar)',
      snapshot_data: { ...snapshotLegado(), approved_by: 'Sistema (Recalcular e Comparar)' },
    }) as any, ctx);
    assert.equal(row?.valorTotal, 620);
    assert.equal(row?.pedagio, 120);
    assert.equal(row?.franquiaKm, 200);
    assert.equal(row?.homologadoPorPessoa, false);
    assert.equal(row?.origemSnapshot, 'automatica');
  });

  it('CEVA sem carimbo permanece indeterminado e acompanha o total oficial', () => {
    const row = linhaDoBoletimCeva(osLegada({
      snapshot_approved_by: null,
      snapshot_data: { ...snapshotLegado(), approved_by: undefined },
    }) as any, ctx);
    assert.equal(row?.origemSnapshot, 'indeterminada');
    assert.equal(row?.valorTotal, 620);
    assert.equal(row?.franquiaKm, 200);
    assert.equal(row?.tarifaHora, 80);
  });

  it('pedágio legado, manual e fornecedor ausente entram uma vez no total', () => {
    const legado = linhaDoBoletimCeva(osLegada() as any, ctx);
    assert.equal(legado?.pedagio, 120);
    assert.equal(legado?.valorTotal, 620);

    const manual = osLegada({ toll_value: 80, toll_value_provider: 50 });
    const linhaManual = linhaDoBoletimCeva(manual as any, ctx);
    assert.equal(linhaManual?.pedagio, 80);
    assert.equal(linhaManual?.valorTotal, 580);
    assert.equal(linhaManual?.franquiaKm, 200);
    assert.equal(manual.toll_value, 80);
    assert.equal(manual.toll_value_provider, 50);

    const ausente = osLegada({ toll_value_provider: null });
    const linhaAusente = linhaDoBoletimCeva(ausente as any, ctx);
    assert.equal(linhaAusente?.pedagio, 120);
    assert.equal(linhaAusente?.valorTotal, 620);
    assert.equal(ausente.toll_value_provider, null);
    assert.equal(ausente.snapshot_data.tollVal, 100);
    assert.equal(ausente.snapshot_data.totalGeral, 600);
  });

  it('DHL aprovada conserva a franquia gravada e a banda fica só informativa', () => {
    assert.equal(computeDhlBand(220), 200);
    assert.equal(franquiaKmBoletimAprovado({
      billingApproved: true,
      isDhl: true,
      kmTotal: 220,
      franquiaGravada: 100,
    }), 100);
    const mission = osLegada({
      client: 'DHL EXPRESS BRAZIL LTDA',
      toll_value: 100,
      toll_value_provider: 100,
      snapshot_data: { ...snapshotLegado(), franchiseKm: 100 },
    });
    const row = linhaDoBoletimCeva(mission as any, ctx);
    assert.equal(row?.franquiaKm, 100);
    assert.equal(row?.pedagio, 100);
    assert.equal(row?.valorTotal, 600);
    assert.equal(row?.franquiaHora, '04:00');
    assert.equal(row?.tarifaKm, 3);
    assert.equal(row?.valorAcionamento, 150);
    assert.equal(mission.snapshot_data.franchiseKm, 100);
  });

  it('DHL ainda não aprovada mantém a banda já calculada', () => {
    assert.equal(franquiaKmBoletimAprovado({
      billingApproved: false,
      isDhl: true,
      kmTotal: 53,
      franquiaGravada: 400,
    }), 100);
    assert.equal(franquiaKmBoletimAprovado({
      billingApproved: false,
      isDhl: true,
      kmTotal: 220,
      franquiaGravada: 100,
    }), 200);
    const boletim = fs.readFileSync('components/ClientBillingReport.tsx', 'utf8');
    const vivo = boletim.slice(boletim.indexOf('const tableFranchise'), boletim.indexOf('const kmExtraQtd = fin.client.excessKm'));
    assert.match(vivo, /computeDhlBand\(kmTotal\)/);
    const congelado = boletim.slice(boletim.indexOf('OS aprovada conserva a franquia gravada'), boletim.indexOf('const refCidades2'));
    assert.match(congelado, /franquiaKmBoletimAprovado\(/);
    assert.doesNotMatch(congelado, /snapFranchiseKm = computeDhlBand/);
    const planilha = boletim.slice(boletim.indexOf('const handleFillDhlSheet'), boletim.indexOf('onClick={handleFillDhlSheet}'));
    assert.match(planilha, /7\.35/);
    assert.match(planilha, /6\.90/);
  });

  it('alteração posterior separa motivo registrado, ausência de motivo e origem indeterminada', () => {
    const alterada = (extra: Record<string, unknown>) => linhaDoBoletimCeva(osLegada({
      revenue_value: 800,
      end_km: 400,
      ...extra,
    }) as any, ctx);

    const comMotivo = alterada({ revenue_edit_reason: 'Edição manual da receita' });
    assert.equal(classificarAlteracaoPosterior({ motivoReceita: 'Edição manual da receita' }), 'com_motivo');
    assert.equal(comMotivo?.divergenciaDetalhamento, DIVERGENCIA_ALTERACAO_COM_MOTIVO);
    assert.equal(comMotivo?.valorTotal, 920);
    assert.equal(comMotivo?.franquiaKm, 200);
    assert.equal(comMotivo?.franquiaHora, '04:00');
    assert.equal(comMotivo?.tarifaKm, 3);
    assert.equal(comMotivo?.tarifaHora, 80);
    assert.equal(comMotivo?.valorAcionamento, 150);
    assert.equal(comMotivo?.kmRodado, 210);

    const semMotivo = alterada({});
    assert.equal(classificarAlteracaoPosterior({}), 'sem_motivo');
    assert.equal(classificarAlteracaoPosterior({ motivoReceita: 'Recalculado pelo sistema ao reabrir' }), 'sem_motivo');
    assert.equal(semMotivo?.divergenciaDetalhamento, DIVERGENCIA_ALTERACAO_REAL);
    assert.equal(textoAlteracaoPosterior('sem_motivo'), DIVERGENCIA_ALTERACAO_REAL);

    const indeterminada = alterada({
      revenue_edit_reason: 'cliente pediu desconto',
      billing_verified_by: 'Ana',
    });
    assert.equal(classificarAlteracaoPosterior({ motivoReceita: 'cliente pediu desconto' }), 'indeterminada');
    assert.equal(classificarAlteracaoPosterior({ motivoReceita: 'divergente do motor' }), 'indeterminada');
    assert.equal(classificarAlteracaoPosterior({ motivoCusto: 'ok' }), 'indeterminada');
    assert.equal(indeterminada?.divergenciaDetalhamento, DIVERGENCIA_ALTERACAO_INDETERMINADA);
    assert.equal(indeterminada?.franquiaKm, 200);
    assert.equal(indeterminada?.valorTotal, 920);
  });

  it('nenhuma leitura grava snapshot, pedágio ou receita', () => {
    const mission = osLegada({ revenue_value: 800, revenue_edit_reason: 'texto livre' });
    const foto = JSON.parse(JSON.stringify(mission));
    linhaDoBoletimCeva(mission as any, ctx);
    assert.deepEqual(mission, foto);
    const relatorio = fs.readFileSync('lib/cevaPortal/report.ts', 'utf8');
    const bloco = relatorio.slice(relatorio.indexOf('export function linhaDoBoletimCeva'), relatorio.indexOf('export function montarRelatorioCeva') > 0 ? relatorio.indexOf('export function montarRelatorioCeva') : relatorio.length);
    assert.equal(bloco.includes('.update('), false);
    assert.equal(bloco.includes('supabase'), false);
    const seletor = fs.readFileSync('lib/dhlAutoTableSelector.ts', 'utf8');
    const funcao = seletor.slice(seletor.indexOf('export function franquiaKmBoletimAprovado'), seletor.indexOf('const VALID_REGIONS'));
    assert.equal(funcao.includes('.update('), false);
    assert.equal(funcao.includes('supabase'), false);
  });
});
