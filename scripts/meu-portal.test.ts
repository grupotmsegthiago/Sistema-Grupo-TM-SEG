import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MeuPortal from '../components/MeuPortal';
import TmsegNews from '../components/TmsegNews';
import {
  documentoProfissional,
  pendenciasDoPortal,
  rotuloPontoHoje,
  textoBancoHoras,
  textoLidoEm,
  textoProximaEscala,
} from '../lib/meuPortal';

const memoria: Record<string, string> = {
  userData: JSON.stringify({ id: '1', name: 'Thiago Moreira', role: 'operador', email: 'thiago@tmseg.com.br' }),
};
Object.assign(globalThis, {
  localStorage: {
    getItem: (chave: string) => memoria[chave] ?? null,
    setItem: (chave: string, valor: string) => { memoria[chave] = valor; },
    removeItem: (chave: string) => { delete memoria[chave]; },
    clear: () => undefined,
    key: () => null,
    length: 0,
  },
  sessionStorage: {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  },
});

test('ponto de hoje sai das batidas, sem inventar regular', () => {
  assert.equal(rotuloPontoHoje([]).texto, 'Aguardando');
  assert.equal(rotuloPontoHoje([{ type: 'IN' }]).texto, 'Regular');
  assert.equal(rotuloPontoHoje([{ type: 'IN' }, { type: 'BREAK_START' }, { type: 'BREAK_END' }, { type: 'OUT' }]).texto, 'Encerrado');
});

test('banco de horas usa a hora extra do salário e avisa quando não há lançamento', () => {
  assert.equal(textoBancoHoras(null), 'Sem lançamento');
  assert.equal(textoBancoHoras(4.3333), '+ 04h20');
});

test('próxima escala lê o horário cadastrado e não inventa 08:00', () => {
  const agora = new Date('2026-10-06T15:00:00');
  assert.equal(textoProximaEscala(null, 'diurno', agora), 'Turno diurno');
  assert.equal(
    textoProximaEscala([{ weekday: 3, inicio: '08:00' }], null, agora),
    'Amanhã • 08:00',
  );
});

test('pendência avisa CNV perto do vencimento e treinamento não assistido', () => {
  const hoje = new Date('2026-10-06T12:00:00');
  const lista = pendenciasDoPortal({
    documentos: [{ id: '1', doc_type: 'CNV', expiry_date: '2026-10-28' }, { id: '2', doc_type: 'Contrato', expiry_date: '2026-10-10' }],
    exames: [],
    modulosFaltando: ['Entrar no sistema'],
    comunicadosNaoLidos: 0,
    hoje,
  });
  assert.equal(documentoProfissional({ doc_type: 'Contrato' }), false);
  assert.equal(lista.some((item) => item.texto === 'CNV vence em 22 dias'), true);
  assert.equal(lista.some((item) => item.texto.includes('Contrato')), false);
  assert.equal(lista.some((item) => item.texto.includes('Entrar no sistema')), true);
});

test('a tela do portal lista os oito módulos e não abre férias', () => {
  const html = renderToStaticMarkup(createElement(MeuPortal));
  for (const modulo of [
    'Meu Ponto',
    'Minha Escala',
    'Meus Holerites',
    'Meus Documentos',
    'Documentação Profissional',
    'Minhas Solicitações',
    'Comunicados',
    'Meus Dados',
  ]) {
    assert.match(html, new RegExp(modulo));
  }
  assert.match(html, /Olá, Thiago/);
  assert.match(html, /Ponto de hoje/);
  assert.match(html, /Banco de horas/);
  assert.match(html, /Próxima escala/);
  assert.match(html, /Pendências/);
  assert.equal(/f[eé]rias/i.test(html), false);
});

test('o card da home virou Meu Portal e a publicação anexa arquivo', () => {
  const html = renderToStaticMarkup(createElement(TmsegNews));
  assert.match(html, /Meu Portal/);
  assert.match(html, /Ponto, escala, holerites, documentos e solicitações\./);
  assert.match(html, /Treinamento/);
  assert.match(html, /Não assistiu/);
  assert.match(html, /Anexar/);
});

test('leitura do comunicado mostra dia e hora', () => {
  const texto = textoLidoEm('2026-10-06T17:32:00.000Z');
  assert.match(texto, /^Lido em 06\/10\/2026 às /);
});
