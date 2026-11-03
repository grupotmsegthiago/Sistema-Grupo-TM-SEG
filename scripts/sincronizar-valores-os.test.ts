import test from 'node:test';
import assert from 'node:assert/strict';
import {
  colunasDoMotor,
  janelaZeradaNaCriacao,
  motivoBloqueiaSincronia,
  operacaoDoFormularioMudou,
  osImpedeSincronia,
} from '../lib/billing/sincronizarValoresOs.ts';

const foto = {
  provider: 'TORRES',
  startKm: '10',
  endKm: '80',
  startDate: '30/10/2026',
  endDate: '30/10/2026',
  startTime: '08:00',
  endTime: '12:00',
  tollValue: '35',
};

test('ajuste manual trava a sincronia e motivo de sistema não trava', () => {
  assert.equal(motivoBloqueiaSincronia(''), false);
  assert.equal(motivoBloqueiaSincronia('AGUARDANDO DEFINIÇÃO'), false);
  assert.equal(motivoBloqueiaSincronia('MESMA OS'), false);
  assert.equal(motivoBloqueiaSincronia('Recalculado pelo sistema ao abrir'), false);
  assert.equal(motivoBloqueiaSincronia('Desconto comercial autorizado'), true);
  assert.equal(osImpedeSincronia({ status: 'Concluída', billing_approved: true }), 'OS aprovada para faturamento.');
  assert.equal(osImpedeSincronia({ status: 'Concluída', billing_verified_by: 'Giovanna' }), 'OS conferida.');
  assert.equal(osImpedeSincronia({ status: 'Concluída', revenue_edit_reason: 'AGUARDANDO DEFINIÇÃO' }), null);
  assert.equal(osImpedeSincronia({ status: 'Concluída', cost_edit_reason: 'valor negociado' }), 'Custo com ajuste manual.');
  assert.equal(osImpedeSincronia({ status: 'Concluída', negative_margin_locked: true }), null);
  assert.equal(
    osImpedeSincronia({ status: 'Concluída', negative_margin_locked: true }, { incluirTravaPrejuizo: true }),
    'Prejuízo já analisado e travado.',
  );
  assert.equal(osImpedeSincronia({ status: 'Em Viagem' }, { statusDestino: 'Cancelada' }), 'OS cancelada segue o recálculo do cancelamento.');
});

test('mudança de km, hora, pedágio ou fornecedor dispara a gravação', () => {
  assert.equal(operacaoDoFormularioMudou(foto, foto), false);
  assert.equal(operacaoDoFormularioMudou(null, foto), false);
  assert.equal(operacaoDoFormularioMudou(foto, { ...foto, endKm: '120' }), true);
  assert.equal(operacaoDoFormularioMudou(foto, { ...foto, provider: 'ATIVA' }), true);
  assert.equal(operacaoDoFormularioMudou(foto, { ...foto, tollValue: '0' }), true);
  assert.equal(operacaoDoFormularioMudou(foto, { ...foto, endTime: '18:00' }), true);
});

test('o motor não zera valor já gravado e a mesma OS zera o custo', () => {
  assert.equal(colunasDoMotor({ revenue: 800, cost: 900 }, {
    receitaServico: 0,
    custoServico: 0,
    tabelaCliente: '',
    tabelaFornecedor: '',
  }, false), null);
  assert.deepEqual(colunasDoMotor({ revenue: 800, cost: 1200 }, {
    receitaServico: 1500,
    custoServico: 1200,
    tabelaCliente: 'SUDESTE',
    tabelaFornecedor: 'SUDESTE',
  }, false), { revenue_value: 1500 });
  assert.deepEqual(colunasDoMotor({ revenue: 800, cost: 400 }, {
    receitaServico: 800,
    custoServico: 400,
    tabelaCliente: 'SUDESTE',
    tabelaFornecedor: 'SUDESTE',
  }, true), { cost_value: 0 });
});

test('criação não usa o relógio de agora como hora final', () => {
  const janela = janelaZeradaNaCriacao('2026-10-30T11:00:00.000Z');
  assert.equal(janela.startTime, janela.endTime);
});
