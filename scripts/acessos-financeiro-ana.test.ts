import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canAccessScreen, fallbackScreenForUser } from '../lib/screenAccess';
import { hasFullMissionListAccess } from '../lib/missionAccess';
import {
  canSeeMissionBillingSummary,
  canSeeOsComPrejuizo,
  isFinanceSupervisorName,
} from '../lib/financeSupervisorAccess';
import { canAccessMissionReport } from '../lib/missionReportAccess';
import { canApproveNegativeMarginLock } from '../lib/osNegativeMarginLock';
import { canAccessDiretoriaMenu } from '../lib/diretoriaAccess';

const ana = {
  name: 'ANA.FERNANDES',
  role: 'Financeiro',
  permissions: ['missions', 'clients', 'providers', 'fin-billing', 'fin-invoices', 'mission-report', 'quotes'],
};
const giovanna = {
  name: 'Giovanna Marsili',
  role: 'Financeiro',
  permissions: ['missions', 'clients', 'providers', 'fin-billing', 'fin-invoices', 'mission-report', 'client-prices', 'provider-costs'],
};
const operadorOrcamento = { name: 'Operador', role: 'Operador', permissions: ['quotes'] };

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
  });
});

describe('operador só com orçamentos', () => {
  it('abre em orçamentos e não ganha financeiro nem diretoria', () => {
    assert.equal(fallbackScreenForUser(operadorOrcamento), 'quotes');
    assert.equal(canAccessScreen(operadorOrcamento, 'quotes'), true);
    assert.equal(canAccessScreen(operadorOrcamento, 'fin-invoices'), false);
    assert.equal(canAccessScreen(operadorOrcamento, 'fin-billing'), false);
    assert.equal(canAccessScreen(operadorOrcamento, 'clients'), false);
    assert.equal(canAccessScreen(operadorOrcamento, 'diretoria-cockpit'), false);
    assert.equal(hasFullMissionListAccess(operadorOrcamento), false);
    assert.equal(canSeeOsComPrejuizo(operadorOrcamento), false);
  });
});

describe('OS aprovada não muda em silêncio', () => {
  it('salvar pede justificativa, pedágio aprovado pede senha e a reaprovação fica no histórico', () => {
    const modal = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
    assert.match(modal, /requiresPostApprovalNote && !providerSaveObservation\.ok/);
    assert.match(modal, /OS já aprovada\. Descreva brevemente o motivo da alteração/);
    assert.match(modal, /mudouPedagioAprovado && !senhaPedagioOkRef\.current/);
    assert.match(modal, /action_type: `\$\{stage\}_reapproval`/);
    assert.match(modal, /allowReapprove = isFinanceSupervisorName\(userName\)/);
    assert.match(modal, /Salvar \(rascunho\) NÃO trava|Salvar = rascunho/);
  });
});
