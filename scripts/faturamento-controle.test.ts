import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  addDaysIso,
  lastDayOfMonth,
  parseCicloFaturamento,
  periodoEstaFechado,
  periodoQueContemData,
  periodosFechadosNoIntervalo,
  periodoVigente,
  ultimoPeriodoFechado,
} from '../lib/faturamento/cicloFaturamento';
import { montarPainelFaturamento } from '../lib/faturamento/painelFaturamento';
import { canAccessFaturamentoDiretoria } from '../lib/diretoriaAccess';

describe('ciclo de faturamento', () => {
  it('interpreta diario / quinzenal / mensal e rejeita vazio', () => {
    assert.equal(parseCicloFaturamento('Quinzenal'), 'quinzenal');
    assert.equal(parseCicloFaturamento('MENSAL'), 'mensal');
    assert.equal(parseCicloFaturamento('diário'), 'diario');
    assert.equal(parseCicloFaturamento(''), null);
    assert.equal(parseCicloFaturamento(null), null);
  });

  it('quinzenal: 1–15 e 16–último dia (inclui mês 31)', () => {
    const q1 = periodoQueContemData('quinzenal', '2026-09-10');
    assert.equal(q1?.start, '2026-09-01');
    assert.equal(q1?.end, '2026-09-15');
    const q2 = periodoQueContemData('quinzenal', '2026-09-16');
    assert.equal(q2?.start, '2026-09-16');
    assert.equal(q2?.end, '2026-09-30');
    const ago = periodoQueContemData('quinzenal', '2026-08-31');
    assert.equal(ago?.start, '2026-08-16');
    assert.equal(ago?.end, '2026-08-31');
    assert.equal(lastDayOfMonth(2026, 2), 28);
  });

  it('mensal cobre o mês cheio e diário o próprio dia', () => {
    const m = periodoQueContemData('mensal', '2026-09-10');
    assert.equal(m?.start, '2026-09-01');
    assert.equal(m?.end, '2026-09-30');
    const d = periodoQueContemData('diario', '2026-09-10');
    assert.equal(d?.start, '2026-09-10');
    assert.equal(d?.end, '2026-09-10');
  });

  it('ciclo fechado só depois do último dia', () => {
    const q1 = periodoQueContemData('quinzenal', '2026-09-10')!;
    assert.equal(periodoEstaFechado(q1, '2026-09-15'), false);
    assert.equal(periodoEstaFechado(q1, '2026-09-16'), true);
    const fechado = ultimoPeriodoFechado('quinzenal', '2026-09-16');
    assert.equal(fechado?.chave, 'Q1:2026-09');
  });

  it('lista quinzenas fechadas no intervalo sem pular o dia 31', () => {
    const list = periodosFechadosNoIntervalo('quinzenal', '2026-08-01', '2026-09-10', '2026-09-10');
    const chaves = list.map((p) => p.chave);
    assert.ok(chaves.includes('Q1:2026-08'));
    assert.ok(chaves.includes('Q2:2026-08'));
    assert.equal(chaves.includes('Q1:2026-09'), false);
    assert.equal(addDaysIso('2026-08-31', 1), '2026-09-01');
  });
});

describe('painel de faturamento — cobertura fail-closed', () => {
  const clients = [
    { id: 1, name: 'DHL', trading_name: 'DHL', status: 'Ativo', ciclo_faturamento: 'quinzenal' },
    { id: 2, name: 'CEVA', trading_name: 'CEVA', status: 'Ativo', ciclo_faturamento: 'mensal' },
    { id: 3, name: 'SEM CICLO', trading_name: 'SEM CICLO', status: 'Ativo', ciclo_faturamento: null },
  ];

  it('OS do ciclo fechado sem fatura e sem APROVADA acende crítico', () => {
    const painel = montarPainelFaturamento({
      todayIso: '2026-09-16',
      lookbackStart: '2026-08-01',
      clients,
      missions: [
        {
          id: 'GTM-1',
          client: 'DHL',
          status: 'Concluída',
          start_time: '2026-09-10T12:00:00',
          billing_approved: true,
          invoice_number: null,
        },
        {
          id: 'GTM-2',
          client: 'DHL',
          status: 'Concluída',
          start_time: '2026-09-12T12:00:00',
          billing_approved: null,
          invoice_number: 'NF-1',
        },
      ],
      invoices: [],
      vinculos: [],
      receber: [],
    });
    assert.equal(painel.kpis.semaforo, 'critico');
    assert.equal(painel.kpis.osSemFaturaFechado, 1);
    assert.equal(painel.kpis.osSemAprovacaoFechado, 1);
    assert.ok(painel.fila.some((f) => f.osSemFatura === 1));
  });

  it('billing_approved ausente não conta como aprovada', () => {
    const painel = montarPainelFaturamento({
      todayIso: '2026-09-16',
      lookbackStart: '2026-08-01',
      clients,
      missions: [{
        id: 'GTM-3',
        client: 'DHL',
        status: 'Concluída',
        start_time: '2026-09-02T12:00:00',
        billing_approved: false,
        invoice_number: 'X',
      }],
      invoices: [],
      vinculos: [{ invoice_id: 'inv', mission_id: 'GTM-3' }],
      receber: [],
    });
    assert.equal(painel.kpis.osSemAprovacaoFechado, 1);
    assert.equal(painel.kpis.osSemFaturaFechado, 0);
  });

  it('vínculo na fatura conta OS como faturada mesmo sem invoice_number', () => {
    const painel = montarPainelFaturamento({
      todayIso: '2026-09-16',
      lookbackStart: '2026-08-01',
      clients,
      missions: [{
        id: 'GTM-4',
        client: 'DHL',
        status: 'Concluída',
        start_time: '2026-09-03T12:00:00',
        billing_approved: true,
      }],
      invoices: [{
        id: 'inv-1',
        client: 'DHL',
        number: 'TMSEG-1',
        amount: 100,
        date: '2026-09-16',
        status: 'EMITIDA',
        boleto_due_date: '2026-10-16',
        period_start: '2026-09-01',
        period_end: '2026-09-15',
      }],
      vinculos: [{ invoice_id: 'inv-1', mission_id: 'GTM-4' }],
      receber: [],
    });
    assert.equal(painel.kpis.osSemFaturaFechado, 0);
    assert.equal(painel.relatorio[0].statusPagamento, 'EM ABERTO');
    assert.equal(painel.relatorio[0].coberturaOk, true);
  });

  it('fatura vencida sem pagamento gera dias de atraso', () => {
    const painel = montarPainelFaturamento({
      todayIso: '2026-09-20',
      lookbackStart: '2026-08-01',
      clients,
      missions: [],
      invoices: [{
        id: 'inv-atraso',
        client: 'CEVA',
        number: 'NF-CEVA',
        amount: 500,
        date: '2026-08-10',
        status: 'EMITIDA',
        boleto_due_date: '2026-09-10',
        period_start: '2026-08-01',
        period_end: '2026-08-31',
      }],
      vinculos: [],
      receber: [],
    });
    assert.equal(painel.kpis.faturasAtrasadas, 1);
    assert.equal(painel.relatorio[0].diasAtraso, 10);
    assert.equal(painel.relatorio[0].statusPagamento, 'ATRASADO');
  });

  it('pagamento após vencimento registra dias no relatório', () => {
    const painel = montarPainelFaturamento({
      todayIso: '2026-09-20',
      lookbackStart: '2026-08-01',
      clients,
      missions: [],
      invoices: [{
        id: 'inv-pago',
        client: 'CEVA',
        number: 'NF-PAGO',
        amount: 200,
        date: '2026-08-05',
        status: 'PAGA',
        boleto_due_date: '2026-08-20',
        period_start: '2026-08-01',
        period_end: '2026-08-31',
      }],
      vinculos: [],
      receber: [{
        description: 'NF-PAGO CEVA',
        notes: 'Fatura NF-PAGO',
        status: 'PAID',
        payment_date: '2026-08-25',
      }],
    });
    assert.equal(painel.relatorio[0].statusPagamento, 'PAGO');
    assert.equal(painel.relatorio[0].diasAtraso, 5);
    assert.equal(painel.relatorio[0].dataPagamento, '2026-08-25');
  });

  it('OS da quinzena em curso (09/09 em 01–15) não entra na fila', () => {
    const painel = montarPainelFaturamento({
      todayIso: '2026-09-10',
      lookbackStart: '2026-08-01',
      clients,
      missions: [{
        id: 'GTM-Q',
        client: 'DHL',
        status: 'Concluída',
        start_time: '2026-09-09T12:00:00',
        billing_approved: false,
        invoice_number: null,
      }],
      invoices: [],
      vinculos: [],
      receber: [],
    });
    assert.equal(painel.kpis.osSemFaturaFechado, 0);
    assert.equal(painel.kpis.osSemAprovacaoFechado, 0);
    assert.equal(painel.fila.length, 0);
    assert.equal(painel.alertas.length, 0);
    assert.ok(painel.kpis.osPendentesAberto >= 1);
  });

  it('no dia 16 a mesma OS da 1ª quinzena passa a aparecer', () => {
    const painel = montarPainelFaturamento({
      todayIso: '2026-09-16',
      lookbackStart: '2026-08-01',
      clients,
      missions: [{
        id: 'GTM-Q',
        client: 'DHL',
        status: 'Concluída',
        start_time: '2026-09-09T12:00:00',
        billing_approved: false,
        invoice_number: null,
      }],
      invoices: [],
      vinculos: [],
      receber: [],
    });
    assert.equal(painel.kpis.osSemFaturaFechado, 1);
    assert.ok(painel.fila.some((f) => f.osSemFatura === 1));
    assert.ok(painel.relatorio.some((r) => r.statusPagamento === 'A COBRAR' && r.osPeriodo === 1));
  });

  it('cliente sem ciclo não joga OS do mês corrente na fila', () => {
    const painel = montarPainelFaturamento({
      todayIso: '2026-09-10',
      lookbackStart: '2026-08-01',
      clients,
      missions: [{
        id: 'GTM-5',
        client: 'SEM CICLO',
        status: 'Concluída',
        start_time: '2026-09-01T12:00:00',
        billing_approved: true,
      }],
      invoices: [],
      vinculos: [],
      receber: [],
    });
    assert.ok(painel.kpis.clientesSemCiclo >= 1);
    assert.equal(painel.fila.length, 0);
    assert.equal(painel.alertas.length, 0);
  });

  it('OS de mês já fechado sem fatura aparece como A COBRAR mesmo sem ciclo cadastrado', () => {
    const painel = montarPainelFaturamento({
      todayIso: '2026-09-10',
      lookbackStart: '2026-08-01',
      clients,
      missions: [{
        id: 'GTM-AGO',
        client: 'SEM CICLO',
        status: 'Concluída',
        start_time: '2026-08-20T12:00:00',
        billing_approved: true,
      }],
      invoices: [],
      vinculos: [],
      receber: [],
    });
    assert.equal(painel.kpis.osSemFaturaFechado, 1);
    assert.ok(painel.fila.some((f) => f.osSemFatura === 1));
    assert.ok(painel.relatorio.some((r) => r.statusPagamento === 'A COBRAR'));
  });

  it('OS anterior a agosto/2026 fica de fora do painel', () => {
    const painel = montarPainelFaturamento({
      todayIso: '2026-09-10',
      lookbackStart: '2026-08-01',
      clients,
      missions: [{
        id: 'GTM-JUL',
        client: 'DHL',
        status: 'Concluída',
        start_time: '2026-07-20T12:00:00',
        billing_approved: false,
        invoice_number: null,
      }],
      invoices: [{
        id: 'inv-jul',
        client: 'DHL',
        number: 'NF-JUL',
        amount: 10,
        date: '2026-07-31',
        status: 'EMITIDA',
        period_end: '2026-07-31',
      }],
      vinculos: [],
      receber: [],
    });
    assert.equal(painel.kpis.osCicloFechado, 0);
    assert.equal(painel.fila.length, 0);
    assert.equal(painel.relatorio.length, 0);
  });

  it('Recusada e exclude_from_billing ficam de fora do universo', () => {
    const painel = montarPainelFaturamento({
      todayIso: '2026-09-16',
      lookbackStart: '2026-08-01',
      clients,
      missions: [
        { id: 'GTM-R', client: 'DHL', status: 'Recusada', start_time: '2026-09-02T12:00:00', billing_approved: true },
        { id: 'GTM-E', client: 'DHL', status: 'Concluída', start_time: '2026-09-02T12:00:00', exclude_from_billing: true, billing_approved: true },
      ],
      invoices: [],
      vinculos: [],
      receber: [],
    });
    assert.equal(painel.kpis.osCicloFechado, 0);
    assert.equal(painel.kpis.osSemFaturaFechado, 0);
  });
});

describe('faturamento diretoria — acesso e menu', () => {
  it('libera somente perfil Diretoria', () => {
    assert.equal(canAccessFaturamentoDiretoria({ name: 'Daniel Pinto', role: 'Diretoria' }), true);
    assert.equal(canAccessFaturamentoDiretoria({ name: 'Thiago Moreira', role: 'Diretoria' }), true);
    assert.equal(canAccessFaturamentoDiretoria({ name: 'Thiago Moreira' }), false);
    assert.equal(canAccessFaturamentoDiretoria({ name: 'Bárbara Silva', role: 'Administrador' }), false);
    assert.equal(canAccessFaturamentoDiretoria({ name: 'João', role: 'Financeiro' }), false);
    assert.equal(canAccessFaturamentoDiretoria({ name: 'Maria', role: 'comercial' }), false);
  });

  it('menu Diretoria expõe FATURAMENTO e App faz gate', () => {
    const nav = fs.readFileSync('lib/navItems.ts', 'utf8');
    const app = fs.readFileSync('App.tsx', 'utf8');
    const sidebar = fs.readFileSync('components/Sidebar.tsx', 'utf8');
    const screenAccess = fs.readFileSync('lib/screenAccess.ts', 'utf8');
    const form = fs.readFileSync('components/ClientForm.tsx', 'utf8');
    assert.match(nav, /diretoria-faturamento/);
    assert.match(nav, /name: 'Faturamento'/);
    assert.match(app, /canAccessFaturamentoDiretoria/);
    assert.match(app, /case 'diretoria-faturamento'/);
    assert.match(app, /canAccessScreen/);
    assert.match(sidebar, /canAccessScreen/);
    assert.match(screenAccess, /canAccessFaturamentoDiretoria/);
    assert.match(form, /select-ciclo-faturamento/);
    assert.match(form, /ciclo_faturamento/);
  });
});
