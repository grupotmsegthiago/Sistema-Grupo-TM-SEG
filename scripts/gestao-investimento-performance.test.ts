import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAllocationScenario,
  buildAssetPerformanceOutlook,
  buildPortfolioPerformanceOutlook,
  compoundValue,
  createDraftInvestorProfile,
  isScenarioStale,
} from '../lib/investimentos';

const RATES = {
  selicPct: 14.25,
  cdiPct: 14.15,
  ipcaPct: 4.5,
  fetchedAt: '2026-08-12T00:00:00.000Z',
  source: 'test',
};

describe('gestao investimento — projeção de performance', () => {
  it('compoundValue aplica juros compostos por dias', () => {
    const y1 = compoundValue(10_000, 14.25, 365);
    assert.ok(Math.abs(y1 - 11_425) < 1);
    const d30 = compoundValue(10_000, 14.25, 30);
    assert.ok(d30 > 10_000 && d30 < 10_200);
  });

  it('Tesouro Selic usa Selic e tem 5 horizontes RF', () => {
    const out = buildAssetPerformanceOutlook(
      20_000,
      { instrumentType: 'tesouro', ticker: 'Tesouro Selic', subtype: 'LFT — pós-fixado à Selic' },
      RATES,
    );
    assert.equal(out.kind, 'rf_rate');
    assert.equal(out.annualBasePct, 14.25);
    assert.equal(out.horizons.length, 5);
    assert.deepEqual(
      out.horizons.map((h) => h.label),
      ['30d', '60d', '90d', '6m', '1a'],
    );
    const y1 = out.horizons.find((h) => h.key === 'y1')!;
    assert.ok(y1.profitBrl > 2_000);
    assert.equal(y1.bearReturnPct, undefined);
  });

  it('ação/ETF usam cenários bear/base/bull', () => {
    const acao = buildAssetPerformanceOutlook(
      10_000,
      { instrumentType: 'acao', ticker: 'PETR4' },
      RATES,
    );
    assert.equal(acao.kind, 'rv_scenario');
    assert.ok(acao.annualBearPct! < acao.annualBasePct);
    assert.ok(acao.annualBullPct! > acao.annualBasePct);
    const d90 = acao.horizons.find((h) => h.key === 'd90')!;
    assert.ok(d90.bearValueBrl! < d90.valueBrl);
    assert.ok(d90.bullValueBrl! > d90.valueBrl);
  });

  it('cenário rules_v6 inclui outlook por linha e total da carteira', () => {
    const profile = createDraftInvestorProfile({
      person_type: 'PF',
      capital_available: 100_000,
      emergency_reserve: 20_000,
      max_per_investment: 25_000,
      horizon_months: 36,
      liquidity_need: 'D30',
      max_loss_pct: 15,
      risk_profile: 'moderado',
      exp_equity: true,
      exp_private_credit: false,
      exp_fii: true,
      exp_crypto: false,
      needs_monthly_income: false,
      investor_category: 'geral',
      allows_crypto: false,
      allows_international: true,
    });
    const scenario = buildAllocationScenario(profile, [], RATES);
    assert.ok(scenario);
    assert.equal(scenario!.source, 'rules_v6');
    assert.equal(isScenarioStale(scenario), false);
    assert.ok(scenario!.lines.every((l) => l.performanceOutlook?.horizons?.length === 5));
    assert.ok(scenario!.topActions.every((a) => a.performanceOutlook?.horizons?.length === 5));
    assert.ok(scenario!.portfolioOutlook);
    assert.equal(scenario!.portfolioOutlook!.principalBrl, 100_000);
    assert.equal(scenario!.portfolioOutlook!.horizons.length, 5);
    const y1 = scenario!.portfolioOutlook!.horizons.find((h) => h.key === 'y1')!;
    assert.ok(y1.valueBrl > 100_000);
    assert.ok(y1.profitBrl > 0);
    // Soma das linhas no horizonte = total da carteira
    const sumY1 = scenario!.lines.reduce((s, l) => {
      const h = l.performanceOutlook.horizons.find((x) => x.key === 'y1')!;
      return s + h.valueBrl;
    }, 0);
    assert.ok(Math.abs(sumY1 - y1.valueBrl) < 0.5);
    assert.equal(isScenarioStale({ ...scenario!, source: 'rules_v5' as any }), true);
  });

  it('buildPortfolioPerformanceOutlook agrega R$ 100 mil em 5 horizontes', () => {
    const a = buildAssetPerformanceOutlook(
      60_000,
      { instrumentType: 'tesouro', ticker: 'Tesouro Selic', subtype: 'LFT' },
      RATES,
    );
    const b = buildAssetPerformanceOutlook(
      40_000,
      { instrumentType: 'etf', ticker: 'BOVA11' },
      RATES,
    );
    const port = buildPortfolioPerformanceOutlook([
      { amountBrl: 60_000, performanceOutlook: a },
      { amountBrl: 40_000, performanceOutlook: b },
    ]);
    assert.ok(port);
    assert.equal(port!.principalBrl, 100_000);
    assert.equal(port!.horizons.length, 5);
    const d30 = port!.horizons.find((h) => h.key === 'd30')!;
    assert.ok(d30.valueBrl > 100_000);
    assert.ok(d30.bearValueBrl != null && d30.bullValueBrl != null);
    assert.ok(d30.bearValueBrl! < d30.valueBrl);
    assert.ok(d30.bullValueBrl! > d30.valueBrl);
  });
});
