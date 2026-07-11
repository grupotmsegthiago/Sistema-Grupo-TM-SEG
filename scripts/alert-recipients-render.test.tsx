// Teste de RENDERIZAÇÃO de components/AlertRecipientsSettings.tsx.
//
// Este painel (destinatários de "Alertas pontuais", onde o usuário adiciona os
// e-mails) é renderizado dentro de SystemSettingsPage junto com o painel de IA
// (AuditSummarySettings). Já quebrou em produção com "useState is not defined"
// por faltar `import ... from 'react'` — e, como o React 18 desmonta a raiz ao
// dar erro de render, isso derrubava a página INTEIRA de configurações (o campo
// de e-mail E o campo de texto da IA no mesmo lugar).
//
// O teste monta o componente de verdade e garante que ele renderiza sem lançar
// (o que capturaria a ausência do import dos hooks).
//
// Rodar:
//   node --import tsx --import ./scripts/test-loaders/register.mjs \
//        --test scripts/alert-recipients-render.test.tsx

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://app.exemplo.com/configuracoes',
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
try {
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
} catch { /* navigator pode ser read-only */ }
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
if (!(globalThis as any).localStorage) {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
}

let React: typeof import('react');
let createRoot: typeof import('react-dom/client').createRoot;
let AlertRecipientsSettings: React.ComponentType;

before(async () => {
  React = await import('react');
  ({ createRoot } = await import('react-dom/client'));
  AlertRecipientsSettings = (await import('../components/AlertRecipientsSettings')).default;
});

const SETTINGS = {
  lossAlert: 'a@grupotmseg.com.br',
  cancelMissingInfo: 'b@grupotmseg.com.br',
  operationalFallback: 'op@grupotmseg.com.br',
  externalReportAlert: 'c@grupotmseg.com.br',
  trustedEmailDomains: 'grupotmseg.com.br',
  reportFailure: 'd@grupotmseg.com.br',
};

function mockFetch() {
  (globalThis as any).fetch = async (url: string) => {
    const body = String(url).includes('/history')
      ? { ok: true, history: [] }
      : { ok: true, settings: SETTINGS, defaults: SETTINGS, updatedBy: 'Teste', updatedAt: '2026-01-01T10:00:00.000Z' };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
      json: async () => body,
    };
  };
}

test('AlertRecipientsSettings renderiza sem lançar "useState is not defined"', async () => {
  mockFetch();
  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  const root = createRoot(container);

  let renderError: unknown = null;
  try {
    await React.act(async () => {
      root.render(React.createElement(AlertRecipientsSettings));
    });
    // Flushes extras para aplicar o setState pós-fetch do useEffect.
    await React.act(async () => { await Promise.resolve(); });
    await React.act(async () => { await Promise.resolve(); });
  } catch (e) {
    renderError = e;
  }

  const html = container.innerHTML;
  try { await React.act(async () => { root.unmount(); }); } catch { /* noop */ }
  container.remove();

  assert.equal(renderError, null, `render lançou erro: ${(renderError as any)?.message || renderError}`);
  // Saiu do loading e montou o formulário (prova que os hooks executaram).
  assert.ok(html.includes('Alertas pontuais'), 'deveria renderizar o título "Alertas pontuais"');
  assert.ok(html.includes('Destinatários'), 'deveria renderizar os campos de destinatários de e-mail');
});
