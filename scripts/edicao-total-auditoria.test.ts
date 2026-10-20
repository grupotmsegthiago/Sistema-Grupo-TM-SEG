import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';

const modal = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');

function trecho(inicio: string, fim: string): string {
  const a = modal.indexOf(inicio);
  const b = modal.indexOf(fim, a + inicio.length);
  assert.ok(a >= 0 && b > a, `trecho ausente: ${inicio}`);
  return modal.slice(a, b);
}

describe('Edição Total na auditoria de faturamento', () => {
  it('o perfil financeiro enxerga o botão e o prejuízo analisado continua sem o botão', () => {
    const bloco = trecho('const canActivateFullEdit', 'const canOverrideAutoProvider');
    assert.match(bloco, /isFinanceProfileRole\(userRoleLower\)/);
    assert.match(bloco, /isOsNegativeMarginLocked\(mission\)/);
    assert.match(bloco, /isProviderOnlyUser\) return false/);
  });

  it('o clique libera cliente, pedágio e a gravação depois da aprovação do financeiro', () => {
    assert.match(
      modal,
      /const canEditClientData = !isProviderOnlyUser && \(!financeApprovedClientLock \|\| fullEditMode\) && \(\(canEditOpsData && !isController\) \|\| fullEditMode\)/,
    );
    assert.match(
      modal,
      /const clientFinanceInputLocked = \(financeApprovedClientLock && !fullEditMode\) \|\| isController \|\| isEffectivelyLocked \|\| !canEditClientData \|\| isPaidInvoiceEffectivelyLocked/,
    );
    assert.match(modal, /if \(\(financeApprovedClientLock && !fullEditMode\) \|\| !canEditClientData\) return;/);
    assert.match(
      modal,
      /const displacement = \(!fullEditMode && \(reeditandoPedagio \|\| isController \|\| financeApprovedClientLock\)\)/,
    );
    assert.match(
      modal,
      /const keepSavedClient = !fullEditMode && \(isController \|\| financeApprovedClientLock\) && !reeditandoPedagio/,
    );
    assert.match(
      modal,
      /financeApprovedClientLock && !fullEditMode && perfilFinanceiro && !reeditandoPedagio && !corrigirPedagio\.fornecedor/,
    );
  });

  it('Salvar deixa de ficar Bloqueado e a fatura paga segue travada', () => {
    assert.match(modal, /lockedByDiretoria && !isBarbaraFinance && !fullEditMode/);
    assert.match(modal, /if \(!lockingNegative && currentApprovalStatus\.lockedByDiretoria && !isBarbaraFinance && !fullEditMode && !isProviderOnlyUser\)/);
    assert.match(modal, /if \(!isPrivileged && !fullEditMode\)/);
    assert.match(modal, /isPaidInvoiceEffectivelyLocked/);
    assert.match(modal, /A fatura paga continua travada/);
    const aprovarInicio = modal.indexOf('data-testid="button-approve-billing"');
    const botaoAprovar = modal.lastIndexOf('<button', aprovarInicio);
    assert.ok(aprovarInicio > botaoAprovar && botaoAprovar > 0);
    const aprovar = modal.slice(botaoAprovar, aprovarInicio);
    assert.match(aprovar, /lockedByDiretoria/);
    assert.doesNotMatch(aprovar, /fullEditMode/);
  });
});
