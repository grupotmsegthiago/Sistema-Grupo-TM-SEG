import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cursorDeHoje,
  moverCursor,
  serieFluxoCaixa,
  type CursorFluxo,
} from '../lib/financial/fluxoCaixaComparativo.ts';

const cursor: CursorFluxo = { ano: 2026, mes: 10, dia: 28, quinzena: 2 };

function titulo(tipo: 'INCOME' | 'EXPENSE', due: string, amount: number, status = 'PENDING') {
  return { type: tipo, status, due_date: due, amount };
}

describe('fluxo de caixa comparativo', () => {
  it('data civil 31/10 não cai em setembro', () => {
    const serie = serieFluxoCaixa(
      [titulo('INCOME', '2026-10-31', 100), titulo('EXPENSE', '2026-10-31', 40)],
      'mes',
      cursor,
    );
    const dia = serie.pontos.find((p) => p.chave === '2026-10-31');
    assert.ok(dia);
    assert.equal(dia.rotuloTooltip, '31/10/2026');
    assert.equal(dia.receber, 100);
    assert.equal(dia.pagar, 40);
    assert.equal(dia.saldo, 60);
    assert.equal(serie.pontos.length, 31);
  });

  it('quinzena separa 01 a 15 e 16 ao fim', () => {
    const linhas = [
      titulo('INCOME', '2026-10-15', 10),
      titulo('EXPENSE', '2026-10-16', 4),
    ];
    const primeira = serieFluxoCaixa(linhas, 'quinzena', { ...cursor, quinzena: 1 });
    const segunda = serieFluxoCaixa(linhas, 'quinzena', { ...cursor, quinzena: 2 });
    assert.equal(primeira.pontos.length, 15);
    assert.equal(primeira.receber, 10);
    assert.equal(primeira.pagar, 0);
    assert.equal(primeira.periodo, '01/10/2026 a 15/10/2026');
    assert.equal(segunda.pontos[0].chave, '2026-10-16');
    assert.equal(segunda.pagar, 4);
    assert.equal(segunda.receber, 0);
    assert.equal(segunda.periodo.endsWith('31/10/2026'), true);
  });

  it('semana corrente de 28/10/2026 vai de domingo a sábado', () => {
    const serie = serieFluxoCaixa(
      [titulo('INCOME', '2026-10-25', 5), titulo('EXPENSE', '2026-11-01', 9)],
      'semana',
      cursor,
    );
    assert.equal(serie.pontos.length, 7);
    assert.equal(serie.pontos[0].rotuloTooltip, '25/10/2026');
    assert.equal(serie.pontos[6].rotuloTooltip, '31/10/2026');
    assert.equal(serie.receber, 5);
    assert.equal(serie.pagar, 0);
  });

  it('ano agrupa os doze meses e ignora cancelado', () => {
    const serie = serieFluxoCaixa(
      [
        titulo('INCOME', '2026-03-02', 200),
        titulo('EXPENSE', '2026-03-02', 50),
        titulo('INCOME', '2026-03-02', 999, 'CANCELLED'),
        titulo('INCOME', '2025-03-02', 80),
      ],
      'ano',
      cursor,
    );
    assert.equal(serie.pontos.length, 12);
    const marco = serie.pontos[2];
    assert.equal(marco.rotulo, 'Mar');
    assert.equal(marco.receber, 200);
    assert.equal(marco.pagar, 50);
    assert.equal(marco.saldo, 150);
    assert.equal(serie.quantidade, 2);
  });

  it('dia sem hora fica numa coluna; com hora abre as 24', () => {
    const semHora = serieFluxoCaixa([titulo('EXPENSE', '2026-10-28', 12)], 'dia', cursor);
    assert.equal(semHora.pontos.length, 1);
    assert.equal(semHora.pontos[0].rotuloTooltip, '28/10/2026');
    assert.equal(semHora.pagar, 12);

    const comHora = serieFluxoCaixa(
      [titulo('INCOME', '2026-10-28T15:10:00-03:00', 7)],
      'dia',
      cursor,
    );
    assert.equal(comHora.pontos.length, 24);
    assert.equal(comHora.pontos[15].receber, 7);
    assert.equal(comHora.pontos[15].rotuloTooltip, '28/10/2026 15:00');
  });

  it('período vazio não inventa valor', () => {
    const serie = serieFluxoCaixa([], 'mes', cursor);
    assert.equal(serie.vazio, true);
    assert.equal(serie.saldo, 0);
    assert.equal(serie.pontos.every((p) => p.receber === 0 && p.pagar === 0), true);
  });

  it('avança o mês sem perder o ano e a quinzena segue o dia', () => {
    const janeiro = moverCursor({ ano: 2026, mes: 1, dia: 31, quinzena: 2 }, 'mes', -1);
    assert.equal(janeiro.ano, 2025);
    assert.equal(janeiro.mes, 12);
    const hoje = cursorDeHoje(new Date('2026-10-28T15:00:00-03:00'));
    assert.equal(hoje.dia, 28);
    assert.equal(hoje.quinzena, 2);
  });
});
