import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  billableClientToll,
  billableProviderToll,
  isDhlClientTollExempt,
  normalizeTollAmount,
  resolveStoredClientToll,
  resolveStoredProviderToll,
  tollPersistencePair,
} from '../lib/toll/clientTollBilling';
import { buildRotasBrasilUrl, ROTAS_BRASIL_STEPS_PT } from '../lib/toll/rotasBrasil';

describe('clientTollBilling', () => {
  it('isDhlClientTollExempt só casa cliente DHL', () => {
    assert.equal(isDhlClientTollExempt('DHL SUPPLY CHAIN (BRAZIL) LTDA'), true);
    assert.equal(isDhlClientTollExempt('dhl express brazil ltda'), true);
    assert.equal(isDhlClientTollExempt('CEVA LOGISTICS'), false);
    assert.equal(isDhlClientTollExempt(''), false);
    assert.equal(isDhlClientTollExempt(null), false);
  });

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

  it('provider usa valor real; persistência grava cliente com regra', () => {
    assert.equal(billableProviderToll(50), 50);
    assert.equal(billableProviderToll(50, true), 0);
    assert.deepEqual(tollPersistencePair(50, false), { toll_value: 60, toll_value_provider: 50 });
    assert.deepEqual(tollPersistencePair(100, false), { toll_value: 120, toll_value_provider: 100 });
    assert.deepEqual(tollPersistencePair(8, false), { toll_value: 8, toll_value_provider: 8 });
    assert.deepEqual(tollPersistencePair(50, true), { toll_value: 60, toll_value_provider: 0 });
  });

  it('resolveStoredClientToll: legado (iguais) aplica regra; novo não dobra', () => {
    assert.equal(resolveStoredClientToll(50, 50), 60);
    assert.equal(resolveStoredClientToll(100, 100), 120);
    assert.equal(resolveStoredClientToll(120, 100), 120);
    assert.equal(resolveStoredClientToll(8, 8), 8);
    assert.equal(resolveStoredClientToll(50, null), 60);
    assert.equal(resolveStoredClientToll(50), 60);
  });

  it('resolveStoredProviderToll devolve o valor real', () => {
    assert.equal(resolveStoredProviderToll(120, 100), 100);
    assert.equal(resolveStoredProviderToll(50, 50), 50);
    assert.equal(resolveStoredProviderToll(50, null), 50);
    assert.equal(resolveStoredProviderToll(60, 0, true), 0);
  });

  it('DHL: operação informa o valor — sem acréscimo de 20%', () => {
    const dhl = 'DHL SUPPLY CHAIN (BRAZIL) LTDA';
    assert.equal(billableClientToll(50, dhl), 50);
    assert.equal(billableClientToll(100, dhl), 100);
    assert.equal(billableClientToll(10.01, dhl), 10.01);
    assert.deepEqual(tollPersistencePair(50, false, dhl), { toll_value: 50, toll_value_provider: 50 });
    assert.deepEqual(tollPersistencePair(50, true, dhl), { toll_value: 50, toll_value_provider: 0 });
    assert.equal(resolveStoredClientToll(60, 50, dhl), 50);
    assert.equal(resolveStoredClientToll(50, 50, dhl), 50);
    assert.equal(resolveStoredClientToll(50, null, dhl), 50);
    assert.equal(resolveStoredClientToll(50, 0, dhl), 50);
  });

  it('demais clientes continuam com fator 1,2', () => {
    assert.equal(billableClientToll(50, 'CEVA LOGISTICS'), 60);
    assert.equal(resolveStoredClientToll(50, 50, 'CEVA LOGISTICS'), 60);
    assert.deepEqual(tollPersistencePair(50, false, 'CEVA LOGISTICS'), { toll_value: 60, toll_value_provider: 50 });
  });
});

describe('rotasBrasil', () => {
  it('buildRotasBrasilUrl é sempre a home (sem origem/destino na query)', () => {
    const url = buildRotasBrasilUrl('Campinas, SP', 'Barueri, SP');
    assert.equal(url, 'https://rotasbrasil.com.br/');
    assert.doesNotMatch(url, /pontos=/);
    assert.doesNotMatch(url, /www\./);
  });

  it('buildRotasBrasilUrl sem destino também é a home', () => {
    assert.equal(buildRotasBrasilUrl('Campinas', 'RAIO 200 KM — DESTINO A DEFINIR'), 'https://rotasbrasil.com.br/');
  });

  it('há 5 passos obrigatórios', () => {
    assert.equal(ROTAS_BRASIL_STEPS_PT.length, 5);
  });
});
