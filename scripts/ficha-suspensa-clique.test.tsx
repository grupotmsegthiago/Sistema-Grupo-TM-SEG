// A ficha das colunas 2 e 3 abre no clique e fecha ao clicar fora.
// Passar o mouse não abre. Botão interno (WhatsApp, cobrar) não abre a ficha.
//
// node --import tsx --import ./scripts/test-loaders/register.mjs --test scripts/ficha-suspensa-clique.test.tsx

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost:5005/missions',
  pretendToBeVisual: true,
});
const { window } = dom;
(globalThis as any).window = window;
(globalThis as any).document = window.document;
Object.getOwnPropertyNames(window).forEach((k) => {
  if (!(k in globalThis)) {
    try { (globalThis as any)[k] = (window as any)[k]; } catch { /* read-only */ }
  }
});
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let React: typeof import('react');
let createRoot: typeof import('react-dom/client').createRoot;
let PainelSuspensoOs: React.ComponentType<{ children: React.ReactNode; painel: React.ReactNode }>;

before(async () => {
  React = await import('react');
  ({ createRoot } = await import('react-dom/client'));
  PainelSuspensoOs = (await import('../components/os/FichaSuspensaOs')).default;
});

async function flush() {
  await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

function montar() {
  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  const root = createRoot(container);
  React.act(() => {
    root.render(
      React.createElement(PainelSuspensoOs, { painel: React.createElement('div', { className: 'os-ficha-miolo' }, 'dados') },
        React.createElement('div', { className: 'foto' }, 'foto'),
        React.createElement('button', { type: 'button' }, 'WhatsApp'),
      ),
    );
  });
  return { container, root };
}

test('ficha abre no clique da coluna e fecha ao clicar fora', async () => {
  const { container, root } = montar();
  const foto = container.querySelector('.foto') as HTMLElement;
  foto.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
  foto.dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: true }));
  await flush();
  assert.equal(document.querySelector('.os-ficha'), null, 'passar o mouse não abre');

  await React.act(async () => {
    foto.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await flush();
  const ficha = document.querySelector('.os-ficha');
  assert.ok(ficha, 'clique na coluna abre a ficha');

  await React.act(async () => {
    document.body.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
  });
  await flush();
  assert.equal(document.querySelector('.os-ficha'), null, 'clique fora fecha');

  await React.act(async () => { root.unmount(); });
  container.remove();
});

test('botão interno não abre a ficha e o segundo clique na coluna fecha', async () => {
  const { container, root } = montar();
  const botao = container.querySelector('button') as HTMLButtonElement;
  const foto = container.querySelector('.foto') as HTMLElement;

  await React.act(async () => {
    botao.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await flush();
  assert.equal(document.querySelector('.os-ficha'), null, 'WhatsApp não abre a ficha');

  await React.act(async () => {
    foto.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await flush();
  assert.ok(document.querySelector('.os-ficha'));

  await React.act(async () => {
    foto.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await flush();
  assert.equal(document.querySelector('.os-ficha'), null, 'segundo clique na coluna fecha');

  await React.act(async () => { root.unmount(); });
  container.remove();
});
