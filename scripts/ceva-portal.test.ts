import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCevaSolicitacao, canUseCevaPortal, isCevaClientName, parseCevaPortalToken, readPortalToken, solicitanteDaSessao } from '../lib/cevaPortal/rules';

const session = { id: '14', name: 'Lara Borba', email: 'ext.lara.borba@cevalogistics.com' };

test('reconhece cliente CEVA e bloqueia inativo ou outro cliente', () => {
  assert.equal(isCevaClientName('CEVA LOGISTICS LTDA'), true);
  assert.equal(canUseCevaPortal({ status: 'Ativo', clientName: 'CEVA LOGISTICS LTDA' }), true);
  assert.equal(canUseCevaPortal({ status: 'Inativo', clientName: 'CEVA LOGISTICS LTDA' }), false);
  assert.equal(canUseCevaPortal({ status: 'Ativo', clientName: 'DHL' }), false);
});

test('token do portal não é o token interno', () => {
  assert.equal(parseCevaPortalToken('tmseg-token-14-1710000000000'), null);
  assert.equal(parseCevaPortalToken('ceva-portal-14-1710000000000'), '14');
  assert.equal(readPortalToken('Bearer ceva-portal-15-1710000000000'), '15');
});

test('com login desligado, o solicitante é o nome digitado no formulário', () => {
  const result = buildCevaSolicitacao(null, {
    dataInicio: '2026-09-28T18:30',
    servico: 'Escolta',
    solicitante: 'Natasha',
    filledByName: 'Falsificado',
    placa: 'okd-2e41',
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.solicitante, 'Natasha');
  assert.equal(result.value.filledByName, 'Natasha');
  assert.equal(result.value.placa, 'OKD2E41');
});

test('a regra de sessão continua pronta para quando o login voltar', () => {
  assert.equal(solicitanteDaSessao(session.name), 'Lara Borba');
});
