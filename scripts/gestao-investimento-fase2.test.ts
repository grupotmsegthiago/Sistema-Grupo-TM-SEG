import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PROFILE_INCOMPLETE_MESSAGE,
  buildProvision30dEstimate,
  createDraftInvestorProfile,
  describeMonthlyTargetBand,
  evaluateProfileCompleteness,
  monthlyPctToAnnualCompoundPct,
} from '../lib/investimentos';

describe('gestao investimento — fase 2 fundação', () => {
  it('meta 1,5%–2% a.m. corresponde a ~19,6%–26,8% a.a. compostos', () => {
    assert.ok(Math.abs(monthlyPctToAnnualCompoundPct(1.5) - 19.5618) < 0.01);
    assert.ok(Math.abs(monthlyPctToAnnualCompoundPct(2.0) - 26.8242) < 0.01);
    const band = describeMonthlyTargetBand(1.5, 2.0);
    assert.ok(band.annualMinPct > 19.5 && band.annualMinPct < 19.7);
    assert.ok(band.annualMaxPct > 26.7 && band.annualMaxPct < 26.9);
    assert.match(band.disclaimer, /não é garantia|não compra/i);
  });

  it('perfil draft com XP e 100 mil ainda é incompleto (bloqueia recomendação)', () => {
    const draft = createDraftInvestorProfile();
    assert.equal(draft.capital_available, 100_000);
    assert.equal(draft.broker_default, 'XP');
    const c = evaluateProfileCompleteness(draft);
    assert.equal(c.complete, false);
    assert.equal(c.message, PROFILE_INCOMPLETE_MESSAGE);
    assert.ok(c.missing.length >= 5);
  });

  it('perfil completo libera canRecommend lógico', () => {
    const full = createDraftInvestorProfile({
      person_type: 'PF',
      capital_available: 100_000,
      emergency_reserve: 30_000,
      max_per_investment: 20_000,
      horizon_months: 24,
      liquidity_need: 'D30',
      max_loss_pct: 10,
      risk_profile: 'moderado',
      exp_equity: true,
      exp_private_credit: false,
      exp_fii: true,
      exp_crypto: false,
      needs_monthly_income: false,
      investor_category: 'geral',
    });
    const c = evaluateProfileCompleteness(full);
    assert.equal(c.complete, true);
    assert.equal(c.message, null);
  });

  it('provisão 30 dias usa cenários-objetivo sem prometer retorno', () => {
    const p = buildProvision30dEstimate(100_000, 1.5, 2.0);
    assert.equal(p.days, 30);
    assert.equal(p.kind, 'cenario_objetivo');
    assert.equal(p.baseBrl, 1750); // média 1,75% de 100k
    assert.ok(p.pessimisticBrl < p.baseBrl && p.baseBrl < p.optimisticBrl);
    assert.match(p.disclaimer, /não constitui garantia/i);
  });

  it('menu Diretoria expõe Gestão Investimento e App faz gate', async () => {
    const constants = await readFile('constants.ts', 'utf8');
    const access = await readFile('lib/diretoriaAccess.ts', 'utf8');
    const app = await readFile('App.tsx', 'utf8');
    const ui = await readFile('components/investimentos/GestaoInvestimento.tsx', 'utf8');
    const routes = await readFile('server/routes.ts', 'utf8');
    assert.match(constants, /Gestão Investimento/);
    assert.match(constants, /gestao-investimento/);
    assert.match(access, /gestao-investimento/);
    assert.match(app, /case 'gestao-investimento'/);
    assert.match(app, /GestaoInvestimento/);
    assert.match(app, /canAccessDiretoriaMenu/);
    assert.match(ui, /from 'react'/);
    assert.match(ui, /useState/);
    assert.match(ui, /PROFILE_INCOMPLETE_MESSAGE|Perfil incompleto/);
    assert.match(ui, /Provisão 30 dias/);
    assert.match(routes, /registerGestaoInvestimentoRoutes/);
  });

  it('migration de fundação existe e não autoriza trading automático no comentário', async () => {
    const sql = await readFile('migrations/2026_08_04_gestao_investimento_fundacao.sql', 'utf8');
    assert.match(sql, /investor_profiles/);
    assert.match(sql, /investment_positions/);
    assert.match(sql, /investment_watchlists/);
    assert.match(sql, /investment_audit_log/);
    assert.match(sql, /NÃO aplicar em produção sem autorização/i);
    assert.match(sql, /NÃO está autorizada a comprar/i);
  });

  it('ensure-schema e SQL embutido estão disponíveis para runtime Vercel', async () => {
    const routes = await readFile('server/gestaoInvestimentoRoutes.ts', 'utf8');
    const cron = await readFile('server/registerCronRoutes.ts', 'utf8');
    const emb = await readFile('lib/investimentos/fundacaoSql.ts', 'utf8');
    const ui = await readFile('components/investimentos/GestaoInvestimento.tsx', 'utf8');
    assert.match(routes, /ensure-schema/);
    assert.match(routes, /runGestaoInvestimentoMigrations/);
    assert.match(cron, /runGestaoInvestimentoMigrations/);
    assert.match(emb, /GESTAO_INVESTIMENTO_FUNDACAO_SQL/);
    assert.match(emb, /investor_profiles/);
    assert.match(ui, /gestao-investimento-ensure-schema/);
  });

  it('handler leve na Vercel evita Express e tem rewrites', async () => {
    const api = await readFile('api/gestao-investimento-api.ts', 'utf8');
    const lib = await readFile('lib/investimentos/gestaoInvestimentoApi.ts', 'utf8');
    const vercel = await readFile('vercel.json', 'utf8');
    const ui = await readFile('components/investimentos/GestaoInvestimento.tsx', 'utf8');
    const cron = await readFile('server/registerCronRoutes.ts', 'utf8');
    assert.match(api, /handleGestaoInvestimentoOp/);
    assert.match(lib, /op === 'summary'/);
    assert.match(vercel, /gestao-investimento-api\?op=summary/);
    assert.match(vercel, /gestao-investimento-api\?op=health/);
    assert.match(vercel, /gestao-investimento-api\?op=ensure-schema/);
    assert.match(lib, /CRON_SECRET/);
    assert.match(ui, /AbortController/);
    assert.match(cron, /NÃO await/);
    const vercelJson = JSON.parse(vercel);
    assert.ok(
      (vercelJson.crons || []).some((c: { path?: string }) =>
        String(c.path || '').includes('gestao-investimento/ensure-schema'),
      ),
      'cron ensure-schema deve existir',
    );
  });
});

