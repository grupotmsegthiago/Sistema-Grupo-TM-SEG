import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { linhaDoBoletimCeva, osMudouDepoisDoSnapshot } from '../lib/cevaPortal/report';
import {
  CARIMBO_RECALCULO_AUTOMATICO,
  DIVERGENCIA_ALTERACAO_REAL,
  DIVERGENCIA_DETALHAMENTO_INCOMPLETO,
  DIVERGENCIA_SNAPSHOT_INVALIDO,
  devePreservarDetalhamentoRegistrado,
  estadoDetalhamentoSnapshot,
  origemSnapshotFinanceiro,
  podePromoverLogSnapshot,
  primeiroLogDepoisDoAutomatico,
  ressincronizadoPorHumano,
} from '../lib/missionSnapshot';

const SISTEMA = CARIMBO_RECALCULO_AUTOMATICO;
const tabelas = [{
  id: '99',
  franchise_km: 99,
  franchise_hours: 9,
  activation_fee: 1,
  price_per_extra_km: 9,
  price_per_extra_hour: 9,
}];
const ctx = { priceTables: tabelas, providerTables: [], adjustment: { clientTableId: '99' } };
const snap = {
  tollVal: 100,
  revenueServiceOnly: 500,
  totalGeral: 600,
  franchiseKm: 12,
  franchiseHours: 4,
  unitKm: 3,
  unitHr: 80,
  activationFee: 200,
  kmExtraTotal: 10,
  hrExtraTotal: 20,
  kmExtraQtd: 0,
  hrExtraQtd: 0,
  kmTotal: 10,
  approved_by: SISTEMA,
};
const base = {
  id: 'GTM-10',
  status: 'Concluída',
  client: 'CLIENTE EXEMPLO',
  revenue_value: 500,
  cost_value: 400,
  toll_value: 100,
  toll_value_provider: 100,
  start_km: 0,
  end_km: 10,
  snapshot_data: snap,
};

function linha(extra: Record<string, unknown>) {
  return linhaDoBoletimCeva({ ...base, ...extra } as any, ctx);
}

describe('leitura do congelamento financeiro', () => {
  it('aprovada com carimbo humano mantém o detalhamento e a homologação', () => {
    const row = linha({ billing_approved: true, billing_verified_by: 'Ana', snapshot_approved_by: 'Financeiro Ana', snapshot_data: { ...snap, approved_by: 'Financeiro Ana' } });
    assert.equal(row?.franquiaKm, 12);
    assert.equal(row?.franquiaHora, '04:00');
    assert.equal(row?.tarifaKm, 3);
    assert.equal(row?.tarifaHora, 80);
    assert.equal(row?.valorAcionamento, 200);
    assert.equal(row?.origemSnapshot, 'humana');
    assert.equal(row?.homologadoPorPessoa, true);
    assert.equal(row?.valores, 'APROVADO');
    assert.equal(row?.pedagio, 120);
  });

  it('aprovada com carimbo automático preserva a franquia e não chama o recálculo de pessoa', () => {
    const row = linha({ billing_approved: true, billing_verified_by: 'Ana', snapshot_approved_by: SISTEMA });
    assert.equal(origemSnapshotFinanceiro(SISTEMA, snap), 'automatica');
    assert.equal(row?.franquiaKm, 12);
    assert.equal(row?.franquiaHora, '04:00');
    assert.equal(row?.tarifaKm, 3);
    assert.equal(row?.valorAcionamento, 200);
    assert.equal(row?.homologadoPorPessoa, false);
    assert.equal(row?.origemSnapshot, 'automatica');
    assert.equal(row?.divergenciaDetalhamento, null);
    assert.equal(row?.pedagio, 120);
    assert.equal(row?.valorTotal, 620);
    assert.equal(row?.franquiaKm === 99, false);
  });

  it('aprovada com carimbo automático e sem conferente também preserva o detalhamento', () => {
    const row = linha({ billing_approved: true, billing_verified_by: null, snapshot_approved_by: SISTEMA });
    assert.equal(row?.franquiaKm, 12);
    assert.equal(row?.homologadoPorPessoa, false);
    assert.equal(row?.valores, 'APROVADO');
    assert.equal(row?.valorTotal, 620);
  });

  it('não aprovada com carimbo automático continua simulação da tabela atual', () => {
    const row = linha({ billing_approved: false, billing_verified_by: null, snapshot_approved_by: SISTEMA });
    assert.equal(devePreservarDetalhamentoRegistrado({ billingApproved: false, carimbo: SISTEMA, snapshot: snap }), false);
    assert.equal(row?.franquiaKm, 99);
    assert.equal(row?.franquiaHora, '09:00');
    assert.equal(row?.tarifaKm, null);
    assert.equal(row?.valorAcionamento, null);
    assert.equal(row?.homologadoPorPessoa, false);
    assert.equal(row?.valores, 'AGUARDANDO');
    assert.equal(row?.valorTotal, null);
  });

  it('aprovada sem carimbo usa o detalhamento gravado e marca origem indeterminada', () => {
    const gravado = { ...snap, approved_by: undefined };
    const row = linha({ billing_approved: true, billing_verified_by: 'Ana', snapshot_approved_by: null, snapshot_data: gravado });
    assert.equal(origemSnapshotFinanceiro(null, gravado), 'indeterminada');
    assert.equal(row?.franquiaKm, 12);
    assert.equal(row?.homologadoPorPessoa, false);
    assert.equal(row?.origemSnapshot, 'indeterminada');
  });

  it('carimbo em branco não vira aprovação humana', () => {
    const row = linha({ billing_approved: true, billing_verified_by: 'Ana', snapshot_approved_by: '   ' });
    assert.equal(origemSnapshotFinanceiro('   ', snap), 'automatica');
    assert.equal(row?.franquiaKm, 12);
    assert.equal(row?.homologadoPorPessoa, false);
  });

  it('snapshot ressincronizado por humano não homologa o carimbo automático', () => {
    const ajustado = { ...snap, snapshot_resynced_by: 'Ana' };
    assert.equal(ressincronizadoPorHumano(ajustado), 'Ana');
    assert.equal(origemSnapshotFinanceiro(SISTEMA, ajustado), 'automatica');
    const row = linha({ billing_approved: true, snapshot_approved_by: SISTEMA, snapshot_data: ajustado });
    assert.equal(row?.franquiaKm, 12);
    assert.equal(row?.homologadoPorPessoa, false);
  });

  it('log automático posterior não esconde o log humano nem é promovido', () => {
    const logs = [
      { approved_by: SISTEMA, franchiseKm: 99 },
      { approved_by: 'Financeiro Ana', franchiseKm: 12 },
    ];
    assert.equal(primeiroLogDepoisDoAutomatico(logs)?.franchiseKm, 12);
    assert.equal(podePromoverLogSnapshot('Financeiro Ana', SISTEMA), false);
    assert.equal(podePromoverLogSnapshot(SISTEMA, 'Financeiro Ana'), false);
    assert.equal(podePromoverLogSnapshot(null, SISTEMA), false);
    assert.equal(podePromoverLogSnapshot(null, 'Financeiro Ana'), true);
    const boletim = fs.readFileSync('components/ClientBillingReport.tsx', 'utf8');
    assert.match(boletim, /primeiroLogDepoisDoAutomatico\(\[d\]\)/);
    const ceva = fs.readFileSync('lib/cevaPortal/httpHandler.ts', 'utf8');
    assert.match(ceva, /carimboRecalculoAutomatico\(logSnapshot\.approved_by\)/);
  });

  it('snapshot ausente ou inválido não copia a tabela e mantém o total oficial', () => {
    const ausente = linha({ billing_approved: true, billing_verified_by: 'Ana', snapshot_approved_by: null, snapshot_data: null });
    assert.equal(estadoDetalhamentoSnapshot(null), 'invalido');
    assert.equal(ausente?.franquiaKm, null);
    assert.equal(ausente?.tarifaKm, null);
    assert.equal(ausente?.valorAcionamento, null);
    assert.equal(ausente?.valorTotal, 620);
    assert.equal(ausente?.pedagio, 120);
    assert.equal(ausente?.divergenciaDetalhamento, DIVERGENCIA_SNAPSHOT_INVALIDO);

    const invalido = linha({ billing_approved: true, snapshot_approved_by: SISTEMA, snapshot_data: [] as any });
    assert.equal(invalido?.franquiaKm, null);
    assert.equal(invalido?.franquiaKm === 99, false);
  });

  it('snapshot incompleto não é completado pela tabela atual', () => {
    const minimo = { tollVal: 100, revenueServiceOnly: 500, totalGeral: 600 };
    assert.equal(estadoDetalhamentoSnapshot(minimo), 'incompleto');
    const row = linha({ billing_approved: true, billing_verified_by: 'Ana', snapshot_approved_by: SISTEMA, snapshot_data: minimo });
    assert.equal(row?.franquiaKm, null);
    assert.equal(row?.tarifaHora, null);
    assert.equal(row?.divergenciaDetalhamento, DIVERGENCIA_DETALHAMENTO_INCOMPLETO);
    assert.equal(row?.valorTotal, 620);
  });

  it('alteração real de receita continua sendo detectada', () => {
    const mission = { ...base, billing_approved: true, snapshot_approved_by: 'Financeiro Ana', revenue_value: 800, snapshot_data: { ...snap, approved_by: 'Financeiro Ana' } };
    assert.equal(osMudouDepoisDoSnapshot(mission, snap), true);
    const row = linhaDoBoletimCeva(mission as any, ctx);
    assert.equal(row?.divergenciaDetalhamento, DIVERGENCIA_ALTERACAO_REAL);
    assert.equal(row?.valorTotal, 920);
    assert.equal(row?.pedagio, 120);
    assert.equal(row?.franquiaKm, 12);
  });

  it('faixa legada de pedágio não troca a franquia nem aplica o acréscimo duas vezes', () => {
    const mission = { ...base, billing_approved: true, snapshot_approved_by: SISTEMA };
    assert.equal(osMudouDepoisDoSnapshot(mission, snap), false);
    const row = linhaDoBoletimCeva(mission, ctx);
    assert.equal(row?.franquiaKm, 12);
    assert.equal(row?.pedagio, 120);
    assert.equal(row?.valorTotal, 620);
  });

  it('boletim e portal usam a mesma decisão de preservação', () => {
    const boletim = fs.readFileSync('components/ClientBillingReport.tsx', 'utf8');
    assert.match(boletim, /devePreservarDetalhamentoRegistrado\(/);
    assert.match(boletim, /carimboAprovacaoHumana\(m\.snapshot_approved_by\)/);
    assert.match(boletim, /!carimboRecalculoAutomatico\(snap\.approved_by\)/);
    assert.equal(boletim.includes('tblFallback.franchise_hours'), false);
    const portal = fs.readFileSync('lib/cevaPortal/report.ts', 'utf8');
    assert.match(portal, /devePreservarDetalhamentoRegistrado\(/);
    assert.equal(portal.includes('tblFallback.franchise_hours'), false);
  });
});
