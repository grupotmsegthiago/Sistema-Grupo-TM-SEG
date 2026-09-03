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
    assert.match(src, /isRestrictedPlinioUser\(currentUserIdentity\)/);
    assert.match(src, /canEditClientData = !isPlinio/);
    assert.match(src, /canEditClientTablesEvenIfLocked = canOverrideAutoProvider && !isPlinio/);
    assert.match(src, /canEditProviderTablesEvenIfLocked = !plinioProviderEditBlocked/);
    assert.doesNotMatch(src, /isAdminFullAccess = userRoleLower === 'administrador' \|\| fullEditMode \|\| isPlinio/);
  });

  it('Plinio + OS destravada: campos financeiros cliente usam clientFinanceInputLocked', () => {
    const src = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
    assert.match(src, /const clientFinanceInputLocked = isController \|\| isEffectivelyLocked \|\| !canEditClientData/);

    const clientFields = [
      'input-toll-client',
      'input-displacement-client',
      'input-custom-client-base',
      'input-custom-client-km',
      'input-custom-client-hour',
    ];
    for (const testId of clientFields) {
      const idx = src.indexOf(`data-testid="${testId}"`);
      assert.ok(idx > 0, `campo ${testId} deve existir`);
      const slice = src.slice(Math.max(0, idx - 600), idx + 80);
      assert.match(slice, /clientFinanceInputLocked/, `${testId} deve respeitar clientFinanceInputLocked`);
      assert.match(slice, /readOnly=\{clientFinanceInputLocked\}/, `${testId} deve ter readOnly ligado ao gate`);
    }

    // Fornecedor não usa o gate do cliente, mas aguarda aprovação Diretoria/Admin.
    const provIdx = src.indexOf('data-testid="input-toll-provider"');
    assert.ok(provIdx > 0);
    const provSlice = src.slice(Math.max(0, provIdx - 600), provIdx + 120);
    assert.doesNotMatch(provSlice, /clientFinanceInputLocked/);
    assert.match(provSlice, /readOnly=\{plinioProviderEditBlocked\}/);

    // Destravar billing não contorna: gate inclui !canEditClientData (false para Plinio)
    assert.match(src, /canUnlockBilling[\s\S]{0,200}isPlinio/);
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
