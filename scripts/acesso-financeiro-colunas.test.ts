import assert from 'node:assert/strict';
import test from 'node:test';
import { filtrarGravacaoOs, podeLerAuditoriaOs, podeLerValoresOs, colunasProtegidasLegiveis } from '../lib/financeiro/acessoCampos';
import { reescreverSelectOs } from '../lib/financeiro/colunasProtegidas';
import { aplicarPedidoTabela, pedidoTabelaVazio } from '../lib/financeiro/filtrarTabela';

test('select estrela não pede receita nem snapshot', () => {
  const reescrito = reescreverSelectOs('*');
  assert.equal(reescrito.hidratar, true);
  assert.equal(reescrito.sql.includes('revenue_value'), false);
  assert.equal(reescrito.sql.includes('snapshot_data'), false);
  assert.equal(reescrito.sql.includes('status'), true);
});

test('Administrador lê o valor da OS e não lê o snapshot', () => {
  const admin = { role: 'Administrador', name: 'Barbara', permissions: ['*'] };
  assert.equal(podeLerValoresOs(admin), true);
  assert.equal(podeLerAuditoriaOs(admin), false);
  assert.equal(colunasProtegidasLegiveis(admin).includes('snapshot_data'), false);
  assert.equal(colunasProtegidasLegiveis(admin).includes('revenue_value'), true);
});

test('Operador e Avançado não leem snapshot; Diretoria, Controller e ANA leem', () => {
  assert.equal(podeLerAuditoriaOs({ role: 'Operador', name: 'Joao' }), false);
  assert.equal(podeLerAuditoriaOs({ role: 'Avançado', name: 'Beatriz' }), false);
  assert.equal(podeLerAuditoriaOs({ role: 'Diretoria', name: 'Thiago' }), true);
  assert.equal(podeLerAuditoriaOs({ role: 'Controller', name: 'Plinio' }), true);
  assert.equal(podeLerAuditoriaOs({ role: 'Financeiro', name: 'ANA.FERNANDES' }), true);
  assert.equal(podeLerAuditoriaOs({ role: 'Financeiro', name: 'Carlos' }), false);
});

test('Controller grava custo e pedágio, e não grava a receita', () => {
  const gravado = filtrarGravacaoOs(
    { role: 'Controller', name: 'Plinio', id: 9 },
    { status: 'Concluída', revenue_value: 999, cost_value: 80, toll_value: 12, displacement_value: 5 },
    'update',
  );
  assert.equal(gravado.status, 'Concluída');
  assert.equal(gravado.cost_value, 80);
  assert.equal(gravado.toll_value, 12);
  assert.equal('revenue_value' in gravado, false);
  assert.equal('displacement_value' in gravado, false);
});

test('Operador finaliza a OS com o valor calculado e não substitui o snapshot', () => {
  const gravado = filtrarGravacaoOs(
    { role: 'Operador', name: 'Maria' },
    { revenue_value: 150, snapshot_data: { trocado: true }, parametros_edicao_total: { franquia_km: 1 } },
    'update',
  );
  assert.equal(gravado.revenue_value, 150);
  assert.equal('snapshot_data' in gravado, false);
  assert.equal('parametros_edicao_total' in gravado, false);
});

test('recusa zera o snapshot e o cliente do portal não grava receita', () => {
  const recusa = filtrarGravacaoOs(
    { role: 'Operador', name: 'Maria' },
    { revenue_value: 0, snapshot_data: null, revenue_edit_reason: 'OS Recusada' },
    'update',
  );
  assert.equal(recusa.snapshot_data, null);
  assert.equal(recusa.revenue_edit_reason, 'OS Recusada');
  const portal = filtrarGravacaoOs(
    { role: 'Cliente', name: 'Portal' },
    { revenue_value: 500, cost_value: 400 },
    'insert',
  );
  assert.equal(portal.revenue_value, 0);
  assert.equal(portal.cost_value, 0);
});

test('filtro da tabela de preço não devolve outro cliente', () => {
  const pedido = pedidoTabelaVazio();
  pedido.filtros.push({ tipo: 'or', valor: 'client.eq.DHL,client.ilike.%DHL%' });
  const resultado = aplicarPedidoTabela([
    { client: 'DHL EXPRESS' },
    { client: 'OUTRO' },
  ], pedido);
  assert.equal(Array.isArray(resultado.data) && resultado.data.length, 1);
});
