import test from 'node:test';
import assert from 'node:assert/strict';
import { chaveMesBrasil, minutosDeHora, montarPainel, type LinhaPainel } from '../lib/cevaPortal/painel';

function linha(parcial: Partial<LinhaPainel>): LinhaPainel {
  return {
    status: 'Concluída',
    dataInicio: '2026-03-15T15:00:00.000Z',
    servico: 'Escolta Caracterizada',
    placa: 'ABC1D23',
    motorista: 'Ana',
    local: 'Guarujá - SP x Embu das Artes - SP',
    operacao: null,
    kmRodado: 10,
    kmExcedente: 2,
    hrsTrabalhada: '08:30',
    valorHrsExcedente: 100,
    valorKmExcedente: 50,
    valorAcionamento: 200,
    valorTotal: 350,
    pedagio: 0,
    ...parcial,
  };
}

test('hora do boletim vira minutos e mês segue o fuso de São Paulo', () => {
  assert.equal(minutosDeHora('08:26'), 506);
  assert.equal(minutosDeHora(''), null);
  assert.equal(chaveMesBrasil('2026-02-01T02:30:00.000Z')?.mes, '01/2026');
  assert.equal(chaveMesBrasil('2026-02-01T03:00:00.000Z')?.mes, '02/2026');
});

test('faturamento soma o total do boletim e deixa de fora OS sem valor', () => {
  const painel = montarPainel([
    linha({ valorTotal: 1000 }),
    linha({ valorTotal: null, financeiro: 'NÃO CARREGADO', status: 'Cancelada', kmRodado: 0, kmExcedente: 0 }),
    linha({ dataInicio: '2026-01-10T15:00:00.000Z', valorTotal: 500, servico: 'Pronta Resposta', motorista: 'Bia', placa: 'XYZ9A87' }),
  ]);
  assert.equal(painel.os, 3);
  assert.equal(painel.semValor, 1);
  assert.equal(painel.faturamento, 1500);
  assert.equal(painel.ticketMedio, 750);
  assert.equal(painel.canceladas, 1);
  assert.equal(painel.meses.map((mes) => mes.mes).join(','), '01/2026,03/2026');
  assert.equal(painel.servicos.find((item) => item.nome === 'Pronta Resposta')?.valor, 500);
  assert.equal(painel.origens[0]?.nome, 'Guarujá - SP');
});
