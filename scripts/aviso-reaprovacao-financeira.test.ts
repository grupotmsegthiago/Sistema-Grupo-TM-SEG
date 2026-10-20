import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { usuarioRecebeAvisoReaprovacao } from '../lib/billing/avisoReaprovacaoFinanceira';
import { isClientValueLockedAfterFinanceApproval } from '../lib/billing/financeClientLock';

describe('reaprovação do perfil financeiro', () => {
  it('libera a edição do financeiro e mantém os outros perfis travados', () => {
    assert.equal(isClientValueLockedAfterFinanceApproval(true, 'financeiro'), false);
    assert.equal(isClientValueLockedAfterFinanceApproval(true, 'diretoria'), false);
    assert.equal(isClientValueLockedAfterFinanceApproval(true, 'operacional'), true);
  });

  it('avisa Thiago Moreira e quem tem perfil Diretoria', () => {
    assert.equal(usuarioRecebeAvisoReaprovacao({ name: 'Thiago Moreira', role: 'Diretoria' }), true);
    assert.equal(usuarioRecebeAvisoReaprovacao({ name: 'Ana', role: 'Diretoria' }), true);
    assert.equal(usuarioRecebeAvisoReaprovacao({ name: 'Thiago Arruda', role: 'Comercial' }), false);
    assert.equal(usuarioRecebeAvisoReaprovacao({ name: 'Bárbara Sgarlata', role: 'Administrador' }), false);
  });

  it('a tela exige motivo e chama um único aviso', () => {
    const modal = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
    assert.match(modal, /Motivo obrigatório/);
    assert.match(modal, /op=finance-reapproval/);
    assert.match(modal, /isFinanceProfileRole\(userRoleLower\)/);
    const aviso = fs.readFileSync('lib/osAnalysis/osAnalysisService.ts', 'utf8');
    assert.match(aviso, /source: 'finance_reapproval'/);
    assert.match(aviso, /Financeiro reaprovou a OS/);
  });
});
