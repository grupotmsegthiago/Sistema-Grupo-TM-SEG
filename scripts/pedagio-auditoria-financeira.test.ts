import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  frasePedagioAuditadoPeloFinanceiro,
  nomeAuditorFinanceiroDoPedagio,
  ultimoQueAlterouPedagio,
} from '../lib/pedagioAuditoriaFinanceira';

describe('pedágio auditado pelo financeiro', () => {
  it('nomeia quem alterou cada lado e ignora quem não mexeu no pedágio', () => {
    const registros = [
      {
        user: 'Ana Operação',
        role: 'operador',
        date: '2026-10-06T12:00:00.000Z',
        changes: ['Pedágio Cliente: de R$ 10,00 para R$ 20,00'],
      },
      {
        user: 'Bárbara Sgarlata',
        role: 'administrador',
        stage: 'financeiro',
        date: '2026-10-06T15:00:00.000Z',
        changes: ['Pedágio Cliente: de R$ 20,00 para R$ 35,00'],
      },
      {
        user: 'Giovanna Marsili',
        role: 'financeiro',
        date: '2026-10-06T16:00:00.000Z',
        changes: ['Pedágio Fornecedor: de R$ 20,00 para R$ 18,00'],
      },
      {
        user: 'Carlos Financeiro',
        role: 'financeiro',
        date: '2026-10-06T14:00:00.000Z',
        changes: ['Serviço Cliente: de R$ 100,00 para R$ 110,00'],
      },
    ];
    assert.equal(nomeAuditorFinanceiroDoPedagio(registros, 'cliente'), 'Bárbara Sgarlata');
    assert.equal(nomeAuditorFinanceiroDoPedagio(registros, 'fornecedor'), 'Giovanna Marsili');
    assert.equal(
      frasePedagioAuditadoPeloFinanceiro('Bárbara Sgarlata'),
      'Esse pedagio ja foi auditado pela: Bárbara Sgarlata',
    );
  });

  it('pedágio sem lado trava os dois, e aprovação sem mudança não trava', () => {
    const generico = [{
      user: 'Equipe Financeiro',
      role: 'financeiro',
      date: '2026-10-06T18:00:00.000Z',
      changes: ['Pedágio ajustado na auditoria'],
    }];
    assert.equal(nomeAuditorFinanceiroDoPedagio(generico, 'cliente'), 'Equipe Financeiro');
    assert.equal(nomeAuditorFinanceiroDoPedagio(generico, 'fornecedor'), 'Equipe Financeiro');
    assert.equal(nomeAuditorFinanceiroDoPedagio([
      { user: 'Bárbara Sgarlata', stage: 'financeiro', date: '2026-10-06T18:00:00.000Z', changes: ['Serviço Cliente: de R$ 1,00 para R$ 2,00'] },
    ], 'cliente'), null);
  });

  it('o reporte vai para quem alterou o pedágio por último, mesmo sem ser financeiro', () => {
    const registros = [
      {
        user: 'Ana Operação',
        role: 'operador',
        date: '2026-10-06T12:00:00.000Z',
        changes: ['Pedágio Cliente: de R$ 10,00 para R$ 20,00'],
      },
      {
        user: 'Bárbara Sgarlata',
        role: 'administrador',
        stage: 'financeiro',
        date: '2026-10-06T15:00:00.000Z',
        changes: ['Pedágio Cliente: de R$ 20,00 para R$ 35,00'],
      },
      {
        user: 'Giovanna Marsili',
        role: 'financeiro',
        date: '2026-10-06T16:00:00.000Z',
        changes: ['Pedágio Fornecedor: de R$ 20,00 para R$ 18,00'],
      },
    ];
    assert.equal(ultimoQueAlterouPedagio(registros, 'cliente'), 'Bárbara Sgarlata');
    assert.equal(ultimoQueAlterouPedagio(registros, 'fornecedor'), 'Giovanna Marsili');
    assert.equal(ultimoQueAlterouPedagio([
      { user: 'Ana Operação', role: 'operador', date: '2026-10-06T12:00:00.000Z', changes: ['Pedágio Cliente: de R$ 10,00 para R$ 20,00'] },
    ], 'cliente'), 'Ana Operação');
  });
});
