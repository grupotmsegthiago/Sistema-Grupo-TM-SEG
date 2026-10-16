import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  conteudoDeAuditoria,
  filtrarLogDeAuditoria,
  passosPermitidos,
  podeGravarConsultaFinanceira,
  podeLerConsultaFinanceira,
} from '../lib/financeiro/consultaFinanceira';
import { sessaoConfere } from '../lib/financeiro/sessao';

const agora = Date.parse('2026-10-16T18:00:00Z');
const futura = '2026-10-23T18:00:00Z';
const passada = '2026-10-16T17:00:00Z';

describe('sessão financeira', () => {
  it('aceita sessão do usuário e recusa vencida, revogada ou de outro', () => {
    assert.equal(sessaoConfere({ user_id: '29', expires_at: futura, revoked_at: null }, '29', agora), true);
    assert.equal(sessaoConfere({ user_id: '29', expires_at: passada, revoked_at: null }, '29', agora), false);
    assert.equal(sessaoConfere({ user_id: '29', expires_at: futura, revoked_at: futura }, '29', agora), false);
    assert.equal(sessaoConfere({ user_id: '24', expires_at: futura, revoked_at: null }, '29', agora), false);
    assert.equal(sessaoConfere(null, '29', agora), false);
  });
});

describe('consulta financeira por perfil', () => {
  const diretoria = { role: 'Diretoria', name: 'THIAGO MOREIRA DOS SANTOS' };
  const controller = { role: 'Controller', name: 'Plinio Alves Prado dos Santos' };
  const ana = { role: 'Financeiro', name: 'ANA.FERNANDES' };
  const admin = { role: 'Administrador', name: 'Barbara Sgarlata', permissions: ['*'] };
  const operador = { role: 'Operador', name: 'ANTONIO CASSIANO', permissions: ['*'] };
  const comercial = { role: 'Comercial', name: 'Vendedor' };

  it('fatura fica com Diretoria, Financeiro, Controller e Administrador', () => {
    assert.equal(podeLerConsultaFinanceira(diretoria, 'financial_invoices'), true);
    assert.equal(podeLerConsultaFinanceira(ana, 'financial_transactions'), true);
    assert.equal(podeLerConsultaFinanceira(controller, 'financial_accounts'), true);
    assert.equal(podeLerConsultaFinanceira(admin, 'financial_invoices'), true);
    assert.equal(podeLerConsultaFinanceira(operador, 'financial_invoices'), false);
    assert.equal(podeLerConsultaFinanceira(comercial, 'financial_invoices'), false);
  });

  it('comissão fica com Diretoria, Financeiro e Comercial', () => {
    assert.equal(podeLerConsultaFinanceira(comercial, 'comissoes'), true);
    assert.equal(podeLerConsultaFinanceira(ana, 'regras_comissao'), true);
    assert.equal(podeLerConsultaFinanceira(operador, 'comissoes'), false);
    assert.equal(podeLerConsultaFinanceira(admin, 'comissoes'), false);
    assert.equal(podeGravarConsultaFinanceira(controller, 'comissoes', { id: '1' }), false);
  });

  it('operador lê log operacional e não lê snapshot de auditoria', () => {
    const linhas = [
      { id: '1', entity: 'Mission', details: 'status' },
      { id: '2', entity: 'BillingSnapshot', details: '{"revenue_value":100}' },
    ];
    assert.equal(podeLerConsultaFinanceira(operador, 'system_logs'), true);
    const filtrado = filtrarLogDeAuditoria(operador, linhas) as Array<{ id: string }>;
    assert.deepEqual(filtrado.map((linha) => linha.id), ['1']);
    assert.equal(podeGravarConsultaFinanceira(operador, 'system_logs', { entity: 'BillingSnapshot' }), false);
    assert.equal(podeGravarConsultaFinanceira(diretoria, 'system_logs', { entity: 'BillingSnapshot' }), true);
    assert.equal(filtrarLogDeAuditoria(diretoria, linhas), linhas);
  });

  it('recusa operação fora da lista e tabela desconhecida', () => {
    assert.equal(passosPermitidos([{ m: 'select', args: ['id, status'] }, { m: 'eq', args: ['id', '1'] }]), true);
    assert.equal(passosPermitidos([{ m: 'rpc', args: ['exec_sql'] }]), false);
    assert.equal(podeLerConsultaFinanceira(diretoria, 'missions'), false);
    assert.equal(conteudoDeAuditoria({ entity: 'Mission', details: '{"revenue_value":1}' }), true);
  });
});
