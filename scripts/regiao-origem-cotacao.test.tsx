import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { useEffect, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  REGIOES_COTACAO,
  regiaoAcompanhaOrigem,
  textoCardRegiao,
} from '../lib/portalCliente/cotacao';
import QuoteCalculatorCard from '../components/precificacao/QuoteCalculatorCard';
import { calculateTripCost } from '../lib/precificacao/tabela2027';

function digitar(input: HTMLInputElement, valor: string) {
  const descritor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  descritor?.set?.call(input, valor);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
}

function PainelRegiao() {
  const [origem, setOrigem] = useState('');
  const [regiao, setRegiao] = useState('NORTE');
  useEffect(() => {
    setRegiao((atual) => regiaoAcompanhaOrigem(origem, 'CEVA', atual));
  }, [origem]);
  return (
    <div>
      <input aria-label="Origem" value={origem} onChange={(evento) => setOrigem(evento.target.value)} />
      {REGIOES_COTACAO.map((item) => (
        <button key={item} type="button" aria-pressed={regiao === item} data-testid={`botao-regiao-${item}`}>{item}</button>
      ))}
      <p data-testid="card-regiao-cotacao">{textoCardRegiao(origem, 'CEVA', regiao) || '—'}</p>
    </div>
  );
}

describe('região da cotação acompanha a origem', () => {
  it('Guarulhos acende SUDESTE e Curitiba acende SUL', () => {
    assert.equal(regiaoAcompanhaOrigem('Guarulhos, SP', 'CEVA', 'NORTE'), 'SUDESTE');
    assert.equal(textoCardRegiao('Guarulhos, SP', 'CEVA', 'NORTE'), 'SUDESTE SP/RJ');
    assert.equal(regiaoAcompanhaOrigem('Rio de Janeiro, RJ', 'CEVA', 'NORTE'), 'SUDESTE');
    assert.equal(regiaoAcompanhaOrigem('Belo Horizonte, MG', 'CEVA', 'NORTE'), 'SUDESTE');
    assert.equal(textoCardRegiao('Belo Horizonte, MG', 'CEVA', 'SUDESTE'), 'SUDESTE MG/ES');
    assert.equal(regiaoAcompanhaOrigem('Curitiba, PR', 'CEVA', 'NORTE'), 'SUL');
    assert.equal(textoCardRegiao('Porto Alegre, RS', 'CEVA', 'NORTE'), 'SUL');
    assert.equal(regiaoAcompanhaOrigem('Guarulhos, SP', 'IBL', 'NORTE'), 'NORTE');
    assert.equal(regiaoAcompanhaOrigem('', 'CEVA', 'NORTE'), 'NORTE');
  });

  it('a digitação troca o botão ativo e o card sem deixar a região anterior', async () => {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="raiz"></div></body></html>', { url: 'http://localhost:5000/' });
    const alvo = globalThis as typeof globalThis & {
      window?: Window;
      document?: Document;
      HTMLElement?: typeof HTMLElement;
      Node?: typeof Node;
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    alvo.window = dom.window;
    alvo.document = dom.window.document;
    alvo.HTMLElement = dom.window.HTMLElement;
    alvo.Node = dom.window.Node;
    alvo.IS_REACT_ACT_ENVIRONMENT = true;
    const { createRoot } = await import('react-dom/client');
    const { act } = await import('react');
    const raiz = createRoot(dom.window.document.getElementById('raiz')!);
    await act(async () => { raiz.render(React.createElement(PainelRegiao)); });
    const botao = (nome: string) => dom.window.document.querySelector(`[data-testid="botao-regiao-${nome}"]`);
    const card = () => dom.window.document.querySelector('[data-testid="card-regiao-cotacao"]')?.textContent || '';
    assert.equal(botao('NORTE')?.getAttribute('aria-pressed'), 'true');
    const origem = dom.window.document.querySelector('input');
    assert.ok(origem);
    await act(async () => { digitar(origem, 'Guarulhos, SP'); });
    assert.equal(botao('SUDESTE')?.getAttribute('aria-pressed'), 'true');
    assert.equal(botao('NORTE')?.getAttribute('aria-pressed'), 'false');
    assert.equal(card(), 'SUDESTE SP/RJ');
    await act(async () => { digitar(origem, 'Curitiba, PR'); });
    assert.equal(botao('SUL')?.getAttribute('aria-pressed'), 'true');
    assert.equal(botao('SUDESTE')?.getAttribute('aria-pressed'), 'false');
    assert.equal(card(), 'SUL');
    raiz.unmount();
  });

  it('o resumo mostra só as horas e o total, sem corte nem acionamento mínimo', () => {
    const html = renderToStaticMarkup(React.createElement(QuoteCalculatorCard, {
      cliente: 'CEVA',
      versao: '2027',
      origem: 'Guarulhos, SP',
      destino: 'Rio de Janeiro, RJ',
      km: '419.8',
      onOrigem: () => undefined,
      onDestino: () => undefined,
      onKm: () => undefined,
      ocultarCampos: true,
      linhas: [{ operation_type: 'TABELA 2027 - SUDESTE SP/RJ', price_per_extra_km: 6.9, price_per_extra_hour: 275 }],
    }));
    assert.match(html, /cotacao-horas/);
    assert.match(html, /cotacao-total/);
    assert.match(html, /SUDESTE SP\/RJ/);
    assert.doesNotMatch(html, /min no corte/);
    assert.doesNotMatch(html, /Acionamento mínimo/);
    assert.doesNotMatch(html, /hora extra/);
    assert.match(html, /\d+ h/);
    assert.match(html, /R\$/);
  });

  it('sem linha do cliente, o piso 2027 da região preenche km, horas e total', () => {
    const conta = calculateTripCost(430, 6.9);
    const html = renderToStaticMarkup(React.createElement(QuoteCalculatorCard, {
      cliente: 'CLIENTE NOVO',
      versao: '2027',
      origem: 'Guarulhos, SP',
      destino: 'Rio de Janeiro, RJ',
      km: '430',
      onOrigem: () => undefined,
      onDestino: () => undefined,
      onKm: () => undefined,
      ocultarCampos: true,
      linhas: [],
    }));
    assert.match(html, /SUDESTE SP\/RJ/);
    assert.match(html, /430 km/);
    assert.match(html, new RegExp(`cotacao-horas[^>]*>${conta.horasFaturadas} h`));
    assert.match(html, /cotacao-total[^>]*>R\$/);
    const vazio = renderToStaticMarkup(React.createElement(QuoteCalculatorCard, {
      cliente: 'CLIENTE NOVO',
      versao: '2027',
      origem: 'Guarulhos, SP',
      destino: 'Rio de Janeiro, RJ',
      km: '',
      onOrigem: () => undefined,
      onDestino: () => undefined,
      onKm: () => undefined,
      ocultarCampos: true,
      linhas: [],
    }));
    assert.match(vazio, /cotacao-horas[^>]*>—/);
    assert.match(vazio, /cotacao-total[^>]*>—/);
  });
});
