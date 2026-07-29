import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculateTieredCommission } from '../lib/gestores/comercial/commission';
import { canAccessGcFull, canAccessGcScreen, isGcScopedCommercial } from '../lib/gestores/comercial/access';
import { defaultProbabilityForStage, adjustProbability } from '../lib/gestores/comercial/pipeline';
import { buildRuleInsights } from '../lib/gestores/comercial/insights';
import { GC_DEFAULT_SETTINGS } from '../lib/gestores/comercial/settings';
import { listGestores, isGestorScreen } from '../lib/gestores/registry';
import type { GcClientHealth } from '../lib/gestores/comercial/types';

describe('Gestor Comercial — comissão por faixas', () => {
  const plan = {
    base_percent: 1,
    tiers: [
      { min_amount: 0, max_amount: 100000, percent: 2, bonus_amount: 0, label: 'Até 100k' },
      { min_amount: 100000.01, max_amount: 300000, percent: 3, bonus_amount: 0, label: 'Até 300k' },
      { min_amount: 300000.01, max_amount: null, percent: 4, bonus_amount: 500, label: 'Acima' },
    ],
  };

  it('aplica faixa correta', () => {
    assert.equal(calculateTieredCommission(50000, plan).percent, 2);
    assert.equal(calculateTieredCommission(200000, plan).percent, 3);
    const top = calculateTieredCommission(500000, plan);
    assert.equal(top.percent, 4);
    assert.equal(top.bonus, 500);
    assert.ok(top.total > 20000);
  });
});

describe('Gestor Comercial — RBAC', () => {
  it('Diretoria/Admin têm visão plena', () => {
    assert.equal(canAccessGcFull({ name: 'Bárbara', role: 'Diretoria' }), true);
    assert.equal(canAccessGcFull({ name: 'Admin', role: 'Administrador' }), true);
    assert.equal(canAccessGcFull({ name: 'X', permissions: ['*'] }), true);
  });

  it('Comercial escopado não vê ranking/settings', () => {
    const user = { name: 'João Comercial', role: 'comercial', permissions: ['gc-dashboard', 'clients'] };
    assert.equal(isGcScopedCommercial(user), true);
    assert.equal(canAccessGcScreen('gc-dashboard', user), true);
    assert.equal(canAccessGcScreen('gc-ranking', user), false);
    assert.equal(canAccessGcScreen('gc-settings', user), false);
    assert.equal(canAccessGcScreen('gc-permissions', user), false);
  });

  it('Thiago Moreira acessa módulo via menu Diretoria', () => {
    assert.equal(canAccessGcFull({ name: 'Thiago Moreira', role: 'Operador' }), true);
  });
});

describe('Gestor Comercial — pipeline e insights', () => {
  it('probabilidades padrão', () => {
    assert.equal(defaultProbabilityForStage('lead'), 10);
    assert.equal(defaultProbabilityForStage('proposta'), 70);
    assert.equal(defaultProbabilityForStage('contrato'), 95);
  });

  it('ajuste heurístico reduz probabilidade em estágio parado', () => {
    const high = adjustProbability({
      stage: 'proposta',
      daysInStage: 5,
      hasRecentMeeting: true,
      hasOpenQuote: true,
      revenueTrendPct: 20,
    });
    const low = adjustProbability({
      stage: 'proposta',
      daysInStage: 60,
      hasRecentMeeting: false,
      hasOpenQuote: false,
      revenueTrendPct: -30,
    });
    assert.ok(high > low);
  });

  it('insights sugerem ações reais', () => {
    const health: GcClientHealth[] = [{
      clientId: '1',
      clientName: 'Carrefour',
      status: 'Ativo',
      monthlyRevenue: 10000,
      yearlyRevenue: 120000,
      cost: 90000,
      grossProfit: 30000,
      taxAmount: 18000,
      netProfit: 12000,
      marginPct: 10,
      operations: 10,
      escoltas: 5,
      prontasRespostas: 3,
      motoAcompanhamento: 2,
      tripsShort: 2,
      tripsMedium: 4,
      tripsLong: 4,
      avgTicket: 12000,
      daysWithoutRevenue: 5,
      trend: 'down',
      trendPct: -32,
      healthScore: 40,
    }];
    const insights = buildRuleInsights({ health, settings: GC_DEFAULT_SETTINGS });
    assert.ok(insights.some((i) => i.title.includes('Carrefour')));
    assert.ok(insights.some((i) => i.suggested_actions.some((a) => /visita|escolta|pronta/i.test(a))));
  });
});

describe('Framework de Gestores', () => {
  it('registra comercial e reconhece screens', () => {
    const list = listGestores();
    assert.ok(list.some((g) => g.key === 'comercial'));
    assert.equal(isGestorScreen('gc-dashboard'), true);
    assert.equal(isGestorScreen('missions'), false);
  });

  it('NAV_ITEMS contém Gestor Comercial sob Diretoria', () => {
    const src = fs.readFileSync('constants.ts', 'utf8');
    assert.match(src, /Gestor Comercial IA/);
    assert.match(src, /gc-dashboard/);
    assert.match(src, /gc-intelligence/);
    assert.match(src, /gc-client-health/);
  });

  it('App e Sidebar integram GC com imports React', () => {
    const app = fs.readFileSync('App.tsx', 'utf8');
    const sidebar = fs.readFileSync('components/Sidebar.tsx', 'utf8');
    assert.match(app, /GcModule/);
    assert.match(app, /canAccessGcScreen/);
    assert.match(app, /from 'react'/);
    assert.match(sidebar, /canAccessGcScreen/);
    assert.match(sidebar, /from 'react'/);
    const dash = fs.readFileSync('components/gestores/comercial/GcDashboard.tsx', 'utf8');
    assert.match(dash, /from 'react'/);
  });
});
