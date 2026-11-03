import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { linhaDoBoletimCeva, osMudouDepoisDoSnapshot } from '../lib/cevaPortal/report';
import {
  CARIMBO_RECALCULO_AUTOMATICO,
  carimboAprovacaoHumana,
  carimboRecalculoAutomatico,
  shouldWriteBillingSnapshot,
} from '../lib/missionSnapshot';
import {
  fornecedorPedagioMudou,
  impactoTrocaFornecedorAusentePorZero,
  montarAtualizacaoPedagio,
} from '../lib/toll/aprovacaoPedagio';
import { textoOcorrenciaFornecedorAusenteParaZero } from '../lib/toll/pedagioDaOs';

describe('fase 1 — recálculo não é aprovação', () => {
  it('distingue o carimbo automático de um aprovador humano', () => {
    assert.equal(carimboRecalculoAutomatico(CARIMBO_RECALCULO_AUTOMATICO), true);
    assert.equal(carimboRecalculoAutomatico('Giovanna Marsili'), false);
    assert.equal(carimboAprovacaoHumana(CARIMBO_RECALCULO_AUTOMATICO), null);
    assert.equal(carimboAprovacaoHumana('Giovanna Marsili'), 'Giovanna Marsili');
    assert.equal(carimboAprovacaoHumana(''), null);
  });

  it('aprovação posterior cria o primeiro snapshot quando o carimbo é só o recálculo', () => {
    const simulacao = { tollVal: 100, totalGeral: 600, approved_by: CARIMBO_RECALCULO_AUTOMATICO };
    const bloqueadoPorHumano = shouldWriteBillingSnapshot({
      approve: true,
      billingApproved: true,
      existingSnapshot: simulacao,
    });
    assert.equal(bloqueadoPorHumano, false);
    const liberado = carimboRecalculoAutomatico(CARIMBO_RECALCULO_AUTOMATICO) && true;
    const snapshotParaDecisao = liberado ? null : simulacao;
    assert.equal(shouldWriteBillingSnapshot({
      approve: true,
      billingApproved: true,
      existingSnapshot: snapshotParaDecisao,
    }), true);
  });

  it('o botão não grava carimbo nem log de snapshot e mantém as travas', () => {
    const routes = fs.readFileSync('server/routes.ts', 'utf8');
    const inicio = routes.indexOf('app.post("/api/billing/recalculate-client"');
    const fim = routes.indexOf('app.post("/api/billing/repair-snapshots"', inicio);
    const bloco = routes.slice(inicio, fim);
    assert.equal(bloco.includes('snapshot_approved_by:'), false);
    assert.equal(bloco.includes("entity: 'BillingSnapshot'"), false);
    assert.match(bloco, /if \(raw\.billing_approved \|\| raw\.negative_margin_locked\)/);
    assert.match(bloco, /if \(raw\.revenue_edit_reason \|\| raw\.cost_edit_reason\)/);
    assert.match(bloco, /action_type: 'FINANCIAL_RECALC'/);

    const painel = fs.readFileSync('components/ExecutiveDashboard.tsx', 'utf8');
    assert.match(painel, /canSnapshot = \(stage === 'financeiro' \|\| stage === 'diretoria'\) && !mission\.snapshot_approved_by/);
    assert.match(painel, /carimboRecalculoAutomatico\(mission\.snapshot_approved_by\) && !missionAlreadyApproved/);

    const boletim = fs.readFileSync('components/ClientBillingReport.tsx', 'utf8');
    assert.match(boletim, /carimboAprovacaoHumana\(m\.snapshot_approved_by\)/);
    assert.match(boletim, /!carimboRecalculoAutomatico\(snap\.approved_by\)/);
    const ceva = fs.readFileSync('lib/cevaPortal/httpHandler.ts', 'utf8');
    assert.match(ceva, /carimboRecalculoAutomatico\(logSnapshot\.approved_by\)/);
  });
});

describe('fase 2 — zero explícito pede confirmação', () => {
  it('null intocado não é impacto e zero já gravado não pede de novo', () => {
    assert.equal(impactoTrocaFornecedorAusentePorZero({
      tollValue: 100,
      tollValueProvider: 0,
      clientName: 'CLIENTE',
      informado: 0,
    }), null);
    assert.equal(fornecedorPedagioMudou(null, 0, false), false);
    assert.equal(fornecedorPedagioMudou(0, 0, true), false);
    assert.equal(fornecedorPedagioMudou(null, 0, true), true);
  });

  it('mostra cobrável, custo e lucro antes de gravar zero', () => {
    const impacto = impactoTrocaFornecedorAusentePorZero({
      tollValue: 100,
      tollValueProvider: null,
      clientName: 'CLIENTE EXEMPLO',
      informado: 0,
    });
    assert.ok(impacto);
    assert.equal(impacto.clienteAntes, 120);
    assert.equal(impacto.clienteDepois, 100);
    assert.equal(impacto.fornecedorAntes, 100);
    assert.equal(impacto.fornecedorDepois, 0);
    assert.equal(impacto.lucroAntes, 20);
    assert.equal(impacto.lucroDepois, 100);
    const texto = textoOcorrenciaFornecedorAusenteParaZero({ quem: 'Ana', ...impacto });
    assert.match(texto, /Ana/);
    assert.match(texto, /ausente/);
    assert.match(texto, /0,00/);
    assert.match(texto, /120,00/);
    assert.match(texto, /100,00/);
  });

  it('a confirmação fica depois das travas e o campo intocado continua fora do payload', () => {
    const modal = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
    const inicio = modal.indexOf('const handleUpdate = async');
    const fim = modal.indexOf('const impactoZero', inicio);
    const antes = modal.slice(inicio, fim);
    assert.match(antes, /isPaidInvoiceEffectivelyLocked/);
    assert.match(antes, /isOsNegativeMarginLocked/);
    assert.match(modal, /data-testid="modal-confirmar-zero-fornecedor"/);
    assert.match(modal, /fornecedorPedagioMudou\(/);
    const gravacao = montarAtualizacaoPedagio({
      tollValueInformado: 100,
      tollProviderOriginal: null,
      tollProviderInformado: 0,
      fornecedorEditado: false,
      pedagioClienteEditado: false,
      isSameOs: false,
      clientName: 'CLIENTE EXEMPLO',
      revenueServiceOnly: 500,
      displacementOriginal: null,
      displacementInformado: 0,
      displacementProviderOriginal: null,
      displacementProviderInformado: 0,
    });
    assert.equal('toll_value_provider' in gravacao.patch, false);
  });
});

describe('fase 3 — CEVA preserva legado', () => {
  const snapLegado = {
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
    kmTotal: 10,
  };

  it('faixa legada não é alteração e edição real continua', () => {
    const base = {
      id: 'GTM-10',
      client: 'CLIENTE EXEMPLO',
      revenue_value: 500,
      toll_value: 100,
      toll_value_provider: 100,
      start_km: 0,
      end_km: 10,
    };
    assert.equal(osMudouDepoisDoSnapshot(base, snapLegado), false);
    assert.equal(osMudouDepoisDoSnapshot({ ...base, toll_value_provider: null }, snapLegado), false);
    assert.equal(osMudouDepoisDoSnapshot({ ...base, toll_value: 150, toll_value_provider: 150 }, snapLegado), true);
    assert.equal(osMudouDepoisDoSnapshot({ ...base, revenue_value: 800 }, snapLegado), true);
    assert.equal(osMudouDepoisDoSnapshot({ ...base, end_km: 40 }, snapLegado), true);
    assert.equal(osMudouDepoisDoSnapshot(base, { ...snapLegado, tollVal: 120 }), false);
    assert.equal(osMudouDepoisDoSnapshot({
      ...base,
      client: 'DHL EXPRESS',
      toll_value: 100,
      toll_value_provider: 100,
    }, snapLegado), false);
  });

  it('a linha congelada não troca franquia, km, hora nem tarifa pela tabela viva', () => {
    const row = linhaDoBoletimCeva({
      id: 'GTM-10',
      status: 'Concluída',
      client: 'CLIENTE EXEMPLO',
      billing_approved: true,
      snapshot_approved_by: 'Financeiro Ana',
      revenue_value: 500,
      toll_value: 100,
      toll_value_provider: 100,
      start_km: 0,
      end_km: 10,
      snapshot_data: snapLegado,
    }, {
      priceTables: [{
        id: '99',
        franchise_km: 99,
        franchise_hours: 9,
        activation_fee: 1,
        price_per_extra_km: 9,
        price_per_extra_hour: 9,
      }],
      providerTables: [],
    });
    assert.ok(row);
    assert.equal(row.franquiaKm, 12);
    assert.equal(row.franquiaHora, '04:00');
    assert.equal(row.tarifaKm, 3);
    assert.equal(row.tarifaHora, 80);
    assert.equal(row.valorAcionamento, 200);
    assert.equal(row.kmExcedente, 0);
  });
});
