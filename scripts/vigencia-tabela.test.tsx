import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  filtrarPorVigencia,
  versaoDaLinhaTarifaria,
  type VersaoTabelaRegional,
} from '../lib/precificacao/tabela2027';
import { pedidoParaRegistro, vigenciaDaCotacao } from '../lib/portalCliente/historicoCotacoes';
import { listarHistoricoCotacoes } from '../lib/portalCliente/cotacaoHttp';
import { SeletorVigencia } from '../components/precificacao/SeletorVigencia';

const TARIFAS = [
  { id: 's', nome: 'TABELA 2026 - SUL' },
  { id: 'n', nome: 'TABELA 2027 - SUDESTE SP/RJ' },
  { id: 'c', nome: 'SUDESTE - GUARULHOS X SERRA' },
  { id: 'a', nome: 'TABELA 2026 - NORTE' },
];

const COTACOES = [
  { id: 'q27', contract_details: JSON.stringify({ vigencia: '2027' }), rotulo: 'COTACAO-2027' },
  { id: 'q26', contract_details: JSON.stringify({ pricing_version: '2026' }), rotulo: 'COTACAO-MARCA-2026' },
  { id: 'qsem', contract_details: 'observacao livre', rotulo: 'COTACAO-SEM-MARCA' },
  { id: 'qvazio', contract_details: null, rotulo: 'COTACAO-VAZIA' },
];

function Painel({ versao }: { versao: VersaoTabelaRegional }) {
  const tarifas = filtrarPorVigencia(TARIFAS, versao, (item) => versaoDaLinhaTarifaria(item.nome));
  const cotacoes = COTACOES.filter((quote) => vigenciaDaCotacao(quote) === versao);
  return (
    <div>
      <SeletorVigencia versao={versao} onChange={() => undefined} />
      <ul data-testid="tarifas">{tarifas.map((item) => <li key={item.id}>{item.nome}</li>)}</ul>
      <ul data-testid="cotacoes">{cotacoes.map((item) => <li key={item.id}>{item.rotulo}</li>)}</ul>
    </div>
  );
}

function PainelInterativo() {
  const [versao, setVersao] = useState<VersaoTabelaRegional>('2026');
  const tarifas = filtrarPorVigencia(TARIFAS, versao, (item) => versaoDaLinhaTarifaria(item.nome));
  const cotacoes = COTACOES.filter((quote) => vigenciaDaCotacao(quote) === versao);
  return (
    <div>
      <SeletorVigencia versao={versao} onChange={setVersao} />
      <ul data-testid="tarifas">{tarifas.map((item) => <li key={item.id}>{item.nome}</li>)}</ul>
      <ul data-testid="cotacoes">{cotacoes.map((item) => <li key={item.id}>{item.rotulo}</li>)}</ul>
    </div>
  );
}

function linha(id: string, clientId: number, details: string | null) {
  return {
    id,
    client_id: clientId,
    client_name: clientId === 7 ? 'CEVA' : 'IBL',
    origin: 'A',
    destination: 'B',
    total_km: 10,
    total_hours: 3,
    total_value: 100,
    created_at: '2026-10-26T12:00:00Z',
    created_by: 'Ana',
    status: 'Enviada',
    is_active: true,
    contract_details: details,
  };
}

function supabaseDas(linhas: ReturnType<typeof linha>[]) {
  const chamadas: Array<[number, number]> = [];
  return {
    chamadas,
    from(tabela: string) {
      assert.equal(tabela, 'quotes');
      const filtros: Record<string, unknown> = {};
      const api = {
        select() { return api; },
        eq(coluna: string, valor: unknown) { filtros[coluna] = valor; return api; },
        order() { return api; },
        range(inicio: number, fim: number) {
          chamadas.push([inicio, fim]);
          const lista = linhas.filter((item) => item.client_id === filtros.client_id).slice(inicio, fim + 1);
          return Promise.resolve({ data: lista, error: null });
        },
      };
      return api;
    },
  };
}

describe('filtro exclusivo de vigência', () => {
  it('classifica a linha pelo prefixo e deixa rota de cidade na 2026', () => {
    assert.equal(versaoDaLinhaTarifaria('TABELA 2027 - SUL'), '2027');
    assert.equal(versaoDaLinhaTarifaria('  tabela 2027 - norte'), '2027');
    assert.equal(versaoDaLinhaTarifaria('TABELA 2026 - SUL'), '2026');
    assert.equal(versaoDaLinhaTarifaria('SUDESTE - GUARULHOS X SERRA'), '2026');
    assert.equal(versaoDaLinhaTarifaria(''), '2026');
    assert.equal(versaoDaLinhaTarifaria(null), '2026');
  });

  it('não devolve as duas vigências na mesma lista', () => {
    const de2027 = filtrarPorVigencia(TARIFAS, '2027', (item) => versaoDaLinhaTarifaria(item.nome));
    const de2026 = filtrarPorVigencia(TARIFAS, '2026', (item) => versaoDaLinhaTarifaria(item.nome));
    assert.deepEqual(de2027.map((item) => item.id), ['n']);
    assert.deepEqual(de2026.map((item) => item.id), ['s', 'c', 'a']);
    const ids2027 = new Set(de2027.map((item) => item.id));
    assert.equal(de2026.some((item) => ids2027.has(item.id)), false);
    assert.equal(de2027.length + de2026.length, TARIFAS.length);
  });

  it('lê a vigência da cotação e trata o que não tem marca como 2026', () => {
    assert.equal(vigenciaDaCotacao(COTACOES[0]), '2027');
    assert.equal(vigenciaDaCotacao(COTACOES[1]), '2026');
    assert.equal(vigenciaDaCotacao(COTACOES[2]), '2026');
    assert.equal(vigenciaDaCotacao(COTACOES[3]), '2026');
    assert.equal(vigenciaDaCotacao(null), '2026');
    const da2027 = COTACOES.filter((quote) => vigenciaDaCotacao(quote) === '2027');
    const da2026 = COTACOES.filter((quote) => vigenciaDaCotacao(quote) === '2026');
    assert.deepEqual(da2027.map((item) => item.id), ['q27']);
    assert.deepEqual(da2026.map((item) => item.id), ['q26', 'qsem', 'qvazio']);
  });

  it('grava a vigência escolhida no snapshot e omite como 2026', () => {
    const marcada = pedidoParaRegistro({
      origem: 'Guarulhos',
      destino: 'São Paulo',
      km: 40,
      valor: 500,
      vigencia: '2027',
    }, { id: 7, name: 'CEVA' }, { name: 'Ana', email: 'ana@grupotmseg.com.br' });
    assert.equal(marcada.ok, true);
    if (!marcada.ok) return;
    assert.equal(vigenciaDaCotacao({ contract_details: String(marcada.linha.contract_details) }), '2027');
    const antiga = pedidoParaRegistro({
      origem: 'Guarulhos',
      destino: 'São Paulo',
      km: 40,
      valor: 500,
    }, { id: 7, name: 'CEVA' }, { name: 'Ana', email: 'ana@grupotmseg.com.br' });
    assert.equal(antiga.ok, true);
    if (!antiga.ok) return;
    assert.equal(vigenciaDaCotacao({ contract_details: String(antiga.linha.contract_details) }), '2026');
  });

  it('a troca de 2026 para 2027 tira a linha da outra tabela do HTML', () => {
    const html2026 = renderToStaticMarkup(React.createElement(Painel, { versao: '2026' }));
    const html2027 = renderToStaticMarkup(React.createElement(Painel, { versao: '2027' }));
    assert.match(html2026, /TABELA 2026 - SUL/);
    assert.match(html2026, /SUDESTE - GUARULHOS X SERRA/);
    assert.match(html2026, /COTACAO-SEM-MARCA/);
    assert.doesNotMatch(html2026, /TABELA 2027/);
    assert.doesNotMatch(html2026, /COTACAO-2027/);
    assert.match(html2026, /aria-pressed="true"/);
    assert.match(html2027, /TABELA 2027 - SUDESTE SP\/RJ/);
    assert.match(html2027, /COTACAO-2027/);
    assert.doesNotMatch(html2027, /TABELA 2026/);
    assert.doesNotMatch(html2027, /GUARULHOS/);
    assert.doesNotMatch(html2027, /COTACAO-MARCA-2026/);
    assert.doesNotMatch(html2027, /COTACAO-SEM-MARCA/);
    const inicial = renderToStaticMarkup(React.createElement(PainelInterativo));
    assert.match(inicial, /TABELA 2026 - SUL/);
    assert.doesNotMatch(inicial, /TABELA 2027/);
  });

  it('lista o histórico só da vigência pedida, dentro da janela, e pagina o resultado filtrado', async () => {
    const linhas = [
      linha('outro', 9, JSON.stringify({ vigencia: '2027' })),
      ...Array.from({ length: 12 }, (_, indice) => linha(`p27-${indice}`, 7, JSON.stringify({ vigencia: '2027', ordem: indice }))),
      linha('p26', 7, JSON.stringify({ pricing_version: '2026' })),
      linha('solta', 7, null),
    ];
    const sb = supabaseDas(linhas);
    const primeira = await listarHistoricoCotacoes(sb, { id: 7, name: 'CEVA' }, 0, '2027');
    assert.equal(primeira.status, 200);
    if (!('cotacoes' in primeira.corpo)) return;
    assert.equal(primeira.corpo.cotacoes.length, 10);
    assert.equal(primeira.corpo.temMais, true);
    assert.equal(primeira.corpo.cotacoes.some((item) => item.id === 'p26' || item.id === 'solta' || item.id === 'outro'), false);
    assert.deepEqual(sb.chamadas[0], [0, 99]);
    const segunda = await listarHistoricoCotacoes(sb, { id: 7, name: 'CEVA' }, 1, '2027');
    if (!('cotacoes' in segunda.corpo)) return;
    assert.deepEqual(segunda.corpo.cotacoes.map((item) => item.id), ['p27-10', 'p27-11']);
    assert.equal(segunda.corpo.temMais, false);
    const ano2026 = await listarHistoricoCotacoes(sb, { id: 7, name: 'CEVA' }, 0, '2026');
    if (!('cotacoes' in ano2026.corpo)) return;
    assert.deepEqual(ano2026.corpo.cotacoes.map((item) => item.id), ['p26', 'solta']);
  });

  it('o clique em Tabela 2027 esvazia a lista de 2026 e o inverso também', async () => {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="raiz"></div></body></html>', { url: 'http://localhost:5000/' });
    const alvo = globalThis as typeof globalThis & { window?: unknown; document?: unknown; HTMLElement?: unknown; Node?: unknown; IS_REACT_ACT_ENVIRONMENT?: boolean };
    alvo.window = dom.window;
    alvo.document = dom.window.document;
    alvo.HTMLElement = dom.window.HTMLElement;
    alvo.Node = dom.window.Node;
    alvo.IS_REACT_ACT_ENVIRONMENT = true;
    const { createRoot } = await import('react-dom/client');
    const { act } = await import('react');
    const raiz = createRoot(dom.window.document.getElementById('raiz')!);
    await act(async () => { raiz.render(React.createElement(PainelInterativo)); });
    const texto = () => dom.window.document.body.textContent || '';
    assert.match(texto(), /TABELA 2026 - SUL/);
    assert.match(texto(), /COTACAO-SEM-MARCA/);
    assert.doesNotMatch(texto(), /TABELA 2027/);
    const botao2027 = [...dom.window.document.querySelectorAll('button')].find((item) => item.textContent?.includes('Tabela 2027'));
    assert.ok(botao2027);
    await act(async () => { botao2027.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    assert.match(texto(), /TABELA 2027 - SUDESTE SP\/RJ/);
    assert.match(texto(), /COTACAO-2027/);
    assert.doesNotMatch(texto(), /TABELA 2026/);
    assert.doesNotMatch(texto(), /GUARULHOS/);
    assert.doesNotMatch(texto(), /COTACAO-SEM-MARCA/);
    assert.doesNotMatch(texto(), /COTACAO-MARCA-2026/);
    const botao2026 = [...dom.window.document.querySelectorAll('button')].find((item) => item.textContent?.includes('Tabela 2026'));
    assert.ok(botao2026);
    await act(async () => { botao2026.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    assert.match(texto(), /SUDESTE - GUARULHOS X SERRA/);
    assert.match(texto(), /COTACAO-VAZIA/);
    assert.doesNotMatch(texto(), /TABELA 2027/);
    assert.doesNotMatch(texto(), /COTACAO-2027/);
    raiz.unmount();
  });
});
