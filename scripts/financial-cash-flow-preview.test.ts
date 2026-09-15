import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  cashFlowCoverRange,
  dueInHorizon,
  isCashAvailableAccountName,
  listCashAvailableAccounts,
  periodoCompetencia,
  splitCashFlowTitles,
  statusLabelFinanceiro,
} from '../lib/financial/cashFlowPreview';
import type { FinancialTransaction } from '../types';

describe('cashFlowPreview', () => {
  it('inclui as contas do anexo e exclui XP Investimentos', () => {
    assert.equal(isCashAvailableAccountName('TM SEGURANÇA'), true);
    assert.equal(isCashAvailableAccountName('XP CONTA DIGIAL'), true);
    assert.equal(isCashAvailableAccountName('XP CONTA DIGITAL'), true);
    assert.equal(isCashAvailableAccountName('XP COMPROMISSADA'), true);
    assert.equal(isCashAvailableAccountName('XP INVESTIMENTOS'), false);
    assert.equal(isCashAvailableAccountName('JOÃO - INVESTIDO'), false);

    const listed = listCashAvailableAccounts(
      [
        { id: '1', name: 'TM SEGURANÇA', bank_name: 'ITAU', status: 'Ativo', initial_balance: 83814.65 },
        { id: '2', name: 'XP CONTA DIGIAL', bank_name: 'XP', status: 'Ativo', initial_balance: 71535.76 },
        { id: '3', name: 'XP INVESTIMENTOS', bank_name: 'XP', status: 'Ativo', initial_balance: 1600 },
        { id: '4', name: 'TM GESTÃO', bank_name: 'ITAU', status: 'Ativo', initial_balance: 0 },
      ],
      { '2': 71535.76 },
    );
    assert.equal(listed.accounts.length, 3);
    assert.equal(listed.total, 155350.41);
  });

  it('separa pagar e receber abertos no horizonte', () => {
    const today = '2026-09-15';
    const txs = [
      { id: 'p1', type: 'EXPENSE', status: 'PENDING', due_date: '2026-09-15', amount: 100, description: 'Aluguel' },
      { id: 'r1', type: 'INCOME', status: 'PENDING', due_date: '2026-09-20', amount: 500, entity_name: 'Cliente A' },
      { id: 'paid', type: 'EXPENSE', status: 'PAID', due_date: '2026-09-15', amount: 50, description: 'Já pago' },
      { id: 'out', type: 'INCOME', status: 'PENDING', due_date: '2026-10-02', amount: 900, entity_name: 'Fora' },
    ] as FinancialTransaction[];
    const day = splitCashFlowTitles(txs, 'DAY', today);
    assert.equal(day.pagar.length, 1);
    assert.equal(day.receber.length, 0);
    const month = splitCashFlowTitles(txs, 'MONTH', today);
    assert.equal(month.pagar.length, 1);
    assert.equal(month.receber.length, 1);
    assert.equal(dueInHorizon('2026-10-02', 'MONTH', today), false);
    assert.equal(periodoCompetencia('2026-09-20'), '09/2026');
    assert.equal(statusLabelFinanceiro('PENDING'), 'Pendente');
    const cover = cashFlowCoverRange(today);
    assert.ok(cover.start <= today && cover.end >= today);
  });

  it('FinancialTransactionList e Cockpit compartilham o botão de resumo', () => {
    const list = readFileSync('components/FinancialTransactionList.tsx', 'utf8');
    const cockpit = readFileSync('components/dashboard/DashboardDiretoria.tsx', 'utf8');
    const btn = readFileSync('components/CashFlowPreviewButton.tsx', 'utf8');
    const modal = readFileSync('components/FinancialCashFlowPreviewModal.tsx', 'utf8');
    assert.match(list, /from 'react'/);
    assert.match(list, /CashFlowPreviewButton/);
    assert.match(cockpit, /from 'react'/);
    assert.match(cockpit, /CashFlowPreviewButton/);
    assert.match(cockpit, /btn-resumo-caixa-diretoria/);
    assert.match(btn, /from 'react'/);
    assert.match(btn, /btn-resumo-caixa/);
    assert.match(modal, /cash-flow-pagar-scroll/);
    assert.match(modal, /overflow-y-auto/);
  });
});
