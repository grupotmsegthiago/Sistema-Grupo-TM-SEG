import test from 'node:test';
import assert from 'node:assert/strict';
import { conferirTabelaRota, explicarTabelaErrada } from '../lib/conferenciaTabelaRota';

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

test('explica o erro para quem abriu a OS e aponta a tabela certa', () => {
  const texto = explicarTabelaErrada({
    criador: 'Beatriz de Carvalho Simões',
    tabela: 'SUDESTE - ATÉ 100 KM - MG E ES',
    motivos: ['A tabela é SUDESTE e a rota está em NORDESTE.'],
    sugestaoNome: 'NORDESTE - ATÉ 100 KM',
    lado: 'cliente',
  });
  assert.match(texto, /Beatriz de Carvalho Simões, não repita esta OS/);
  assert.match(texto, /no preço do cliente/);
  assert.match(texto, /NORDESTE/);
  assert.match(texto, /Na próxima, use a tabela NORDESTE - ATÉ 100 KM/);
});

test('faixa curta não manda usar tabela de outra cidade', () => {
  const texto = explicarTabelaErrada({
    criador: 'Beatriz de Carvalho Simões',
    lado: 'cliente',
    tabela: 'SUDESTE - ATÉ 100 KM - MG E ES',
    motivos: ['O KM da rota é 104 e a faixa aplicada é 100. A faixa que cobre é 550 (SUDESTE - CONTAGEM/MG X UBERLÂNDIA/MG).'],
    sugestaoNome: 'SUDESTE - CONTAGEM/MG X UBERLÂNDIA/MG',
  });
  assert.match(texto, /não repita esta OS/);
  assert.match(texto, /104/);
  assert.doesNotMatch(texto, /use a tabela SUDESTE - CONTAGEM/);
  assert.match(texto, /Não troque por uma tabela de outra cidade/);
});

test('faixa curta de KM puro aponta a faixa que cobre', () => {
  const texto = explicarTabelaErrada({
    criador: 'Cristiane Aurora',
    lado: 'fornecedor',
    tabela: '500KM',
    motivos: ['O KM da rota é 511 e a faixa aplicada é 500. A faixa que cobre é 600 (600KM).'],
    sugestaoNome: '600KM',
  });
  assert.match(texto, /no custo do fornecedor/);
  assert.match(texto, /Na próxima, use a tabela 600KM/);
});
