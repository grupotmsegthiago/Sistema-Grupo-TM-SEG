import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  billableClientToll,
  billableProviderToll,
  normalizeTollAmount,
  tollPersistencePair,
} from '../lib/toll/clientTollBilling';
import { buildRotasBrasilUrl, ROTAS_BRASIL_STEPS_PT } from '../lib/toll/rotasBrasil';

describe('clientTollBilling', () => {
  it('normalizeTollAmount arredonda e rejeita inválido', () => {
    assert.equal(normalizeTollAmount('12,345'), 12.35);
    assert.equal(normalizeTollAmount(-1), 0);
    assert.equal(normalizeTollAmount('abc'), 0);
  });

  it('billableClientToll: até R$ 10 sem acréscimo', () => {
    assert.equal(billableClientToll(0), 0);
    assert.equal(billableClientToll(10), 10);
    assert.equal(billableClientToll(10.01), 12.01);
  });

  it('billableClientToll: acima de R$ 10 aplica fator 1,2', () => {
    assert.equal(billableClientToll(50), 60);
    assert.equal(billableClientToll(100), 120);
  });

  it('provider e persistência usam valor base', () => {
    assert.equal(billableProviderToll(50), 50);
    assert.equal(billableProviderToll(50, true), 0);
    assert.deepEqual(tollPersistencePair(50, false), { toll_value: 50, toll_value_provider: 50 });
    assert.deepEqual(tollPersistencePair(50, true), { toll_value: 50, toll_value_provider: 0 });
  });
});

describe('rotasBrasil', () => {
  it('buildRotasBrasilUrl é sempre a home (sem origem/destino na query)', () => {
    const url = buildRotasBrasilUrl('Campinas, SP', 'Barueri, SP');
    assert.equal(url, 'https://www.rotasbrasil.com.br/');
    assert.doesNotMatch(url, /pontos=/);
  });

  it('buildRotasBrasilUrl sem destino também é a home', () => {
    assert.equal(buildRotasBrasilUrl('Campinas', 'RAIO 200 KM — DESTINO A DEFINIR'), 'https://www.rotasbrasil.com.br/');
  });

  it('há 5 passos obrigatórios', () => {
    assert.equal(ROTAS_BRASIL_STEPS_PT.length, 5);
  });
});
