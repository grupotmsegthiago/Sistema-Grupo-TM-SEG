/**
 * P4-LIMPEZA — auditoria de órfãos, legado e funcionalidades inativas.
 * Somente asserts estáticos; não remove arquivos.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';

const appSrc = fs.readFileSync('App.tsx', 'utf8');
const constantsSrc = fs.readFileSync('constants.ts', 'utf8');
const sidebarSrc = fs.readFileSync('components/Sidebar.tsx', 'utf8');

/** Componentes raiz com zero importadores no app principal (grep P4-LIMPEZA). */
const ORPHAN_COMPONENTS = [
  'AIImageGenerator',
  'ApiStatusOverlay',
  'BillingAuditor',
  'BillingControlCenter',
  'BiometricLogin',
  'BrandGenerator',
  'ClientPriceList',
  'CloudCostManager',
  'CltTimeClockBar',
  'FinancialAuditor',
  'ProviderCostList',
  'UniversalDataImporter',
] as const;

function productionImporters(componentName: string): string[] {
  const hits: string[] = [];
  const importRe = new RegExp(
    `from ['"][^'"]*\\/${componentName}['"]|import\\s+${componentName}\\s+from`,
  );
  const scanFiles = [
    'App.tsx',
    ...fs.readdirSync('components').filter((f) => f.endsWith('.tsx')).map((f) => `components/${f}`),
    ...fs.readdirSync('lib').filter((f) => f.endsWith('.ts') || f.endsWith('.tsx')).map((f) => `lib/${f}`),
  ];
  for (const path of scanFiles) {
    if (path === `components/${componentName}.tsx`) continue;
    const src = fs.readFileSync(path, 'utf8');
    if (importRe.test(src)) hits.push(path);
  }
  return hits;
}

describe('P4-LIMPEZA — BillingControlCenter (D órfão comprovado)', () => {
  it('sem rota/menu; substituído por ClientBillingReport', () => {
    assert.doesNotMatch(appSrc, /BillingControlCenter/);
    assert.doesNotMatch(appSrc, /fin-billing-control/);
    assert.doesNotMatch(constantsSrc, /fin-billing-control/);
    assert.match(appSrc, /ClientBillingReport/);
    assert.match(appSrc, /case 'fin-billing'/);
    const billing = fs.readFileSync('components/BillingControlCenter.tsx', 'utf8');
    assert.match(billing, /ÓRFÃO CONFIRMADO/);
  });
});

describe('P4-LIMPEZA — AI Chat / ai-support (C inativo intencional)', () => {
  it('rota usa FeatureInactivePanel; AIChatbot preservado para reativação', () => {
    assert.match(appSrc, /case 'ai-support'/);
    assert.match(appSrc, /FeatureInactivePanel/);
    assert.match(appSrc, /import AIChatbot/);
    assert.match(appSrc, /void AIChatbot/);
    assert.doesNotMatch(constantsSrc, /ai-support/);
    assert.doesNotMatch(sidebarSrc, /ai-support/);
  });

  it('/api/chat permanece ativo — FinancialAccountManager consome', () => {
    const inv = fs.readFileSync('components/FinancialAccountManager.tsx', 'utf8');
    assert.match(inv, /\/api\/chat/);
    const routes = fs.readFileSync('server/routes.ts', 'utf8');
    assert.match(routes, /app\.post\("\/api\/chat", requireAuth/);
  });
});

describe('P4-LIMPEZA — CostOptimizationDashboard (B ativo incompleto)', () => {
  it('rota e menu ativos em produção', () => {
    assert.match(appSrc, /case 'cost-optimization'/);
    assert.match(appSrc, /CostOptimizationDashboard/);
    assert.match(constantsSrc, /cost-optimization/);
    assert.match(sidebarSrc, /cost-optimization/);
  });
});

describe('P4-LIMPEZA — ExecutiveDashboard (A ativo funcional)', () => {
  it('consumido por MissionTable com realtime', () => {
    const mt = fs.readFileSync('components/MissionTable.tsx', 'utf8');
    assert.match(mt, /ExecutiveDashboard/);
    const exec = fs.readFileSync('components/ExecutiveDashboard.tsx', 'utf8');
    assert.match(exec, /useRealtimeRefresh/);
  });
});

describe('P4-LIMPEZA — componentes raiz órfãos (D — 12 itens)', () => {
  for (const name of ORPHAN_COMPONENTS) {
    it(`${name}: zero importador no app principal`, () => {
      assert.ok(fs.existsSync(`components/${name}.tsx`), `${name}.tsx existe`);
      const importers = productionImporters(name);
      assert.deepEqual(
        importers,
        [],
        `${name} não deve ter importadores fora de attached_assets (achado: ${importers.join(', ')})`,
      );
    });
  }
});

describe('P4-LIMPEZA — snapshots Replit (G — fora do build)', () => {
  it('attached_assets/extracted* não referenciados pelo app principal', () => {
    const vite = fs.readFileSync('vite.config.ts', 'utf8');
    assert.doesNotMatch(vite, /attached_assets\/extracted/);
    assert.doesNotMatch(appSrc, /attached_assets\/extracted/);
    assert.ok(fs.existsSync('attached_assets/extracted/grupo-tmseg/App.tsx'));
    assert.ok(fs.existsSync('attached_assets/extracted2/App.tsx'));
  });
});

describe('P4-LIMPEZA — replit_integrations removido (P3 preservado)', () => {
  it('pasta server/replit_integrations ausente', () => {
    assert.equal(fs.existsSync('server/replit_integrations'), false);
  });
});
