import test from 'node:test';
import assert from 'node:assert/strict';
import { conferirTabelaRota } from '../lib/conferenciaTabelaRota';

const cubatao = { id: '1', nome: 'SUDESTE - CUBATÃO X SANTOS', franchiseKm: 100 };
const betim = { id: '2', nome: 'SUDESTE - BETIM X BETIM', franchiseKm: 100 };
const cubataoLonga = { id: '3', nome: 'SUDESTE - CUBATÃO X SANTOS', franchiseKm: 200 };

test('tabela da mesma cidade e UF fica certa', () => {
  const resultado = conferirTabelaRota(cubatao, {
    origem: 'Cubatão - SP',
    destino: 'Santos - SP',
    km: 80,
  }, [cubatao, betim]);
  assert.equal(resultado.status, 'OK');
});

test('tabela de outra cidade fica errada e aponta a rota', () => {
  const resultado = conferirTabelaRota(cubatao, {
    origem: 'Betim - MG',
    destino: 'Betim - MG',
    km: 40,
  }, [cubatao, betim]);
  assert.equal(resultado.status, 'ERRADA');
  assert.match(resultado.motivos.join(' '), /CUBATAO X BETIM|CUBATAO/);
  assert.equal(resultado.sugestaoId, '2');
});

test('nome genérico não acusa ninguém', () => {
  const resultado = conferirTabelaRota(
    { id: '9', nome: 'PADRAO', franchiseKm: 100 },
    { origem: 'Cubatão - SP', destino: 'Santos - SP', km: 80 },
    [],
  );
  assert.equal(resultado.status, 'INCONCLUSIVO');
});

test('faixa curta para o KM da rota sugere a faixa que cobre', () => {
  const resultado = conferirTabelaRota(
    { ...cubatao, franchiseKm: 50 },
    { origem: 'Cubatão - SP', destino: 'Santos - SP', km: 160 },
    [{ ...cubatao, franchiseKm: 50 }, cubataoLonga],
  );
  assert.equal(resultado.status, 'ERRADA');
  assert.match(resultado.motivos.join(' '), /160/);
  assert.equal(resultado.sugestaoId, '3');
});
