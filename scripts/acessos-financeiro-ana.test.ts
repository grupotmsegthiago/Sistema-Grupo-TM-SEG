import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canAccessScreen } from '../lib/screenAccess';
import { hasFullMissionListAccess } from '../lib/missionAccess';
import {
  canSeeMissionBillingSummary,
  canSeeOsComPrejuizo,
  isFinanceSupervisorName,
} from '../lib/financeSupervisorAccess';
import { canAccessMissionReport } from '../lib/missionReportAccess';
import { canApproveNegativeMarginLock } from '../lib/osNegativeMarginLock';
import { canAccessDiretoriaMenu } from '../lib/diretoriaAccess';
import { controleDiarioOpensAudit } from '../lib/controleDiario';

const ana = {
  name: 'ANA.FERNANDES',
  role: 'Financeiro',
  permissions: ['missions', 'clients', 'providers', 'fin-billing', 'fin-invoices', 'mission-report'],
};
const giovanna = {
  name: 'Giovanna Marsili',
  role: 'Financeiro',
  permissions: ['missions', 'clients', 'providers', 'fin-billing', 'fin-invoices', 'mission-report', 'client-prices', 'provider-costs'],
};

describe('equivalência Ana Fernandes e Giovanna', () => {
  it('as duas supervisoras veem OS, tabelas, boletim e relatório', () => {
    for (const user of [ana, giovanna]) {
      assert.equal(isFinanceSupervisorName(user.name), true);
      assert.equal(hasFullMissionListAccess(user), true);
      assert.equal(canSeeOsComPrejuizo(user), true);
      assert.equal(canSeeMissionBillingSummary(user), true);
      assert.equal(canAccessMissionReport(user), true);
      assert.equal(canAccessScreen(user, 'missions'), true);
      assert.equal(canAccessScreen(user, 'clients'), true);
      assert.equal(canAccessScreen(user, 'providers'), true);
      assert.equal(canAccessScreen(user, 'fin-billing'), true);
      assert.equal(canAccessScreen(user, 'fin-invoices'), true);
      assert.equal(controleDiarioOpensAudit(user.name), true);
      assert.equal(canAccessScreen({
        ...user,
        permissions: [...user.permissions, 'diretoria-faturamento'],
      }, 'diretoria-faturamento'), false);
    }
  });

  it('Ana não recebe diretoria, trava de prejuízo nem acesso por nome parcial', () => {
    assert.equal(canAccessScreen(ana, 'diretoria-cockpit'), false);
    assert.equal(canAccessDiretoriaMenu(ana), false);
    assert.equal(canApproveNegativeMarginLock(ana), false);
    assert.equal(canApproveNegativeMarginLock({ name: 'Giovanna Marsili', role: 'Financeiro' }), true);
    assert.equal(isFinanceSupervisorName('Ana'), false);
    assert.equal(isFinanceSupervisorName('Lilian Raquel Viana'), false);
    assert.equal(hasFullMissionListAccess({ name: 'Ana', role: 'Financeiro' }), false);
    assert.equal(controleDiarioOpensAudit('Ana'), false);
  });
});
