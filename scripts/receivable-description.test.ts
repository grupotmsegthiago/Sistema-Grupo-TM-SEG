import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildQuinzenaReceivableFromDate,
  buildQuinzenaReceivableFromRange,
  extractQuinzenaReceivableFromText,
  resolveClientReceivableDescription,
} from '../lib/billing/receivableDescription.ts';

describe('receivableDescription', () => {
  it('formata primeira/segunda quinzena e mês completo pelo range', () => {
    assert.equal(
      buildQuinzenaReceivableFromRange('2026-06-01', '2026-06-15'),
      'Ref. a primeira quinzena de Junho/2026',
    );
    assert.equal(
      buildQuinzenaReceivableFromRange('2026-06-16', '2026-06-30'),
      'Ref. a segunda quinzena de Junho/2026',
    );
    assert.equal(
      buildQuinzenaReceivableFromRange('2026-07-01', '2026-07-31'),
      'Ref. ao mês completo de Julho/2026',
    );
  });

  it('extrai quinzena do texto da discriminação da NF', () => {
    assert.equal(
      extractQuinzenaReceivableFromText(
        'CONTRATAÇÃO E INTERMEDIAÇÃO DE CONTRATOS - Referente ao 1ª Quinzena de Julho/2026',
      ),
      'Ref. a primeira quinzena de Julho/2026',
    );
    assert.equal(
      extractQuinzenaReceivableFromText(
        'Ref. aos Serviços de Escolta - 2ª Quinzena de Maio/2026',
      ),
      'Ref. a segunda quinzena de Maio/2026',
    );
    assert.equal(
      extractQuinzenaReceivableFromText('Mês Completo de Abril/2026'),
      'Ref. ao mês completo de Abril/2026',
    );
  });

  it('usa data de competência quando não há range/texto', () => {
    assert.equal(
      buildQuinzenaReceivableFromDate('2026-06-10'),
      'Ref. a primeira quinzena de Junho/2026',
    );
    assert.equal(
      buildQuinzenaReceivableFromDate('2026-06-20'),
      'Ref. a segunda quinzena de Junho/2026',
    );
  });

  it('resolve com prioridade range > texto > data', () => {
    assert.equal(
      resolveClientReceivableDescription({
        startDate: '2026-06-01',
        endDate: '2026-06-15',
        serviceDescription: 'qualquer - 2ª Quinzena de Maio/2026',
      }),
      'Ref. a primeira quinzena de Junho/2026',
    );
    assert.equal(
      resolveClientReceivableDescription({
        notes: 'Referente ao 1ª Quinzena de Julho/2026',
        competenceDate: '2026-01-01',
      }),
      'Ref. a primeira quinzena de Julho/2026',
    );
  });
});
