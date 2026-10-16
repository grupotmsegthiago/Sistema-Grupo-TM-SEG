import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';

describe('P3 — replit_integrations removido (código morto)', () => {
  it('diretório ausente e rotas vivas preservadas em geminiClient/routes', () => {
    assert.equal(fs.existsSync('server/replit_integrations'), false);
    const routes = fs.readFileSync('server/routes.ts', 'utf8');
    assert.match(routes, /\/api\/gemini\/generate/);
    assert.match(routes, /\/api\/chat/);
    assert.doesNotMatch(routes, /replit_integrations/);
  });
});

describe('P3 — billing-override exige auth', () => {
  it('PATCH /api/missions/:id/billing-override usa requireAuth', () => {
    const routes = fs.readFileSync('server/routes.ts', 'utf8');
    assert.match(routes, /app\.patch\("\/api\/missions\/:id\/billing-override", requireAuth/);
  });
});

describe('P3 — Plinio somente fornecedor', () => {
  it('MissionFinancialModal bloqueia cliente para Plinio', () => {
    const src = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
    const plinio = fs.readFileSync('lib/plinioMissionRestrictions.ts', 'utf8');
    assert.match(plinio, /export function isRestrictedPlinioUser/);
    assert.match(src, /isProviderOnlyControllerUser\(\{ \.\.\.currentUserIdentity, role: userRoleLower \}\)/);
    assert.match(src, /const canEditClientData = !isProviderOnlyUser && !financeApprovedClientLock && \(\(canEditOpsData && !isController\) \|\| fullEditMode\)/);
    assert.match(src, /const canEditClientTablesEvenIfLocked = canOverrideAutoProvider && !isProviderOnlyUser && !financeApprovedClientLock/);
    assert.match(src, /const canEditProviderTablesEvenIfLocked = canOverrideAutoProvider \|\| isProviderOnlyUser/);
    assert.match(src, /const isAdminFullAccess = \(userRoleLower === 'administrador' \|\| fullEditMode \|\| isBarbaraFinance\) && !isProviderOnlyUser/);
    assert.doesNotMatch(src, /canEditClientData = !isPlinio/);
    assert.doesNotMatch(src, /isAdminFullAccess = userRoleLower === 'administrador' \|\| fullEditMode \|\| isPlinio/);
  });

  it('Plinio + OS destravada: campos financeiros cliente usam clientFinanceInputLocked', () => {
    const src = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
    assert.match(src, /const clientFinanceInputLocked = financeApprovedClientLock \|\| isController \|\| isEffectivelyLocked \|\| !canEditClientData \|\| isPaidInvoiceEffectivelyLocked/);
    assert.match(src, /const clientTollInputLocked = isPaidInvoiceEffectivelyLocked/);
    assert.match(src, /travaPedagioClienteFinanceiro && !corrigirPedagio\.cliente/);
    assert.doesNotMatch(src, /clientTollInputLocked = isPaidInvoiceEffectivelyLocked \|\| isProviderOnlyUser \|\| isControllerRole/);

    const clientFields = [
      'input-displacement-client',
      'input-custom-client-base',
      'input-custom-client-km',
      'input-custom-client-hour',
    ];
    for (const testId of clientFields) {
      const idx = src.indexOf(`data-testid="${testId}"`);
      assert.ok(idx > 0, `campo ${testId} deve existir`);
      const slice = src.slice(Math.max(0, idx - 700), idx + 80);
      assert.match(slice, /clientFinanceInputLocked/, `${testId} deve respeitar clientFinanceInputLocked`);
      assert.match(slice, /readOnly=\{clientFinanceInputLocked\}/, `${testId} deve ter readOnly ligado ao gate`);
    }

    const tollIdx = src.indexOf('data-testid="input-toll-client"');
    assert.ok(tollIdx > 0);
    const tollSlice = src.slice(Math.max(0, tollIdx - 700), tollIdx + 40);
    assert.match(tollSlice, /readOnly=\{clientTollInputLocked\}/);

    const provIdx = src.indexOf('data-testid="input-toll-provider"');
    assert.ok(provIdx > 0);
    const provSlice = src.slice(Math.max(0, provIdx - 600), provIdx + 120);
    assert.doesNotMatch(provSlice, /clientFinanceInputLocked/);

    assert.match(src, /canSaveProviderAdjustments = isProviderOnlyUser/);
    assert.match(src, /if \(!canEditClientData\) return;/);
  });
});

describe('P3 — PDF proposta/tabela com KM e Hora Extra', () => {
  it('CommercialProposalModal — tabela proposta inclui colunas KM/Hora Extra', () => {
    const src = fs.readFileSync('components/CommercialProposalModal.tsx', 'utf8');
    assert.match(src, /PAGE 5: ESCOPO FINANCEIRO/);
    assert.match(src, /KM Extra/);
    assert.match(src, /Hora Extra/);
    assert.match(src, /price_per_extra_km/);
    assert.match(src, /price_per_extra_hour/);
  });

  it('QuotePrintModal — tabela PDF inclui KM/Hora Extra', () => {
    const src = fs.readFileSync('components/QuotePrintModal.tsx', 'utf8');
    assert.match(src, /KM Extra \(R\$\/km\)/);
    assert.match(src, /Hora Extra \(R\$\/h\)/);
    assert.match(src, /getExtraKmValue\(\)/);
    assert.match(src, /getExtraHourValue\(\)/);
  });
});
