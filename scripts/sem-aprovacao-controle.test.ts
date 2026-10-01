import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { SEM_APROVACAO_DESDE, SEM_APROVACAO_POR_PAGINA, canViewAprovacoesPendentes } from '../lib/aprovacoesPendentesAccess';
import { isClientValueLockedAfterFinanceApproval } from '../lib/billing/financeClientLock';

describe('Sem aprovação no Controle Diário', () => {
  it('lista só a partir de agosto e pagina de 10', () => {
    assert.equal(SEM_APROVACAO_DESDE, '2026-08-01T00:00:00-03:00');
    assert.equal(SEM_APROVACAO_POR_PAGINA, 10);
    const source = fs.readFileSync('components/ControleDiario.tsx', 'utf8');
    assert.match(source, /SEM_APROVACAO_DESDE/);
    assert.match(source, /\.gte\('start_time', SEM_APROVACAO_DESDE\)/);
    assert.match(source, /canSeePendingApproval = canViewAprovacoesPendentes\(currentUser\)/);
    assert.doesNotMatch(source, /canSeePendingApproval = canViewAprovacoesPendentes\(currentUser\) \|\| opensAudit/);
    assert.match(source, /SEM_APROVACAO_POR_PAGINA/);
    assert.match(source, /Pendências de Aprovações/);
    assert.match(source, /controle-diario-pending-list/);
    assert.match(source, /h-14 min-w-0 items-center/);
    assert.match(source, /Pendências de Aprovações/);
    assert.match(source, /controle-diario-pending-columns/);
    assert.match(source, /Data inicial/);
    assert.match(source, /Data final/);
    assert.match(source, /Fornecedor/);
    assert.match(source, /Ocorrência de auditoria/);
    assert.match(source, /Pendente de aprovação/);
    assert.match(source, /controle-diario-pending-status/);
    assert.match(source, /Status/);
    assert.match(source, /fetchGroup\(\['Cancelada', 'Recusada', 'Pendente'\], true\)/);
    assert.match(source, /recusadaZeradaForaDaPendencia/);
    assert.match(source, /aprovadaNoSistemaForaDaPendencia/);
  });

  it('botão só para Financeiro e Diretoria', () => {
    assert.equal(canViewAprovacoesPendentes({ role: 'Financeiro' }), true);
    assert.equal(canViewAprovacoesPendentes({ role: 'Diretoria' }), true);
    assert.equal(canViewAprovacoesPendentes({ role: 'Administrador', permissions: ['*'] }), false);
    assert.equal(canViewAprovacoesPendentes({ role: 'Controller', name: 'Giovanna Marsili' }), false);
  });

  it('valor do cliente trava depois do financeiro, exceto Diretoria', () => {
    assert.equal(isClientValueLockedAfterFinanceApproval(false, 'financeiro'), false);
    assert.equal(isClientValueLockedAfterFinanceApproval(true, 'financeiro'), true);
    assert.equal(isClientValueLockedAfterFinanceApproval(true, 'administrador'), true);
    assert.equal(isClientValueLockedAfterFinanceApproval(true, 'controller'), true);
    assert.equal(isClientValueLockedAfterFinanceApproval(true, 'Diretoria'), false);
    const modal = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
    assert.match(modal, /financeApprovedClientLock/);
    assert.doesNotMatch(modal, /button-open-toll-confirmation/);
    assert.doesNotMatch(modal, /CONFIRMAR PEDÁGIO/);
  });
});
