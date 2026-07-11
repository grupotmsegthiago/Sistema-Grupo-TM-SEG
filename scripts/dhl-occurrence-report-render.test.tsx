// Teste de RENDERIZAÇÃO + fluxo de components/DhlOccurrenceReportModal.tsx
// (o "Plano de Ação / Justificativa de Ocorrência" da DHL).
//
// Bug real (regressão do commit f97059c): a declaração de estado
//   const [previewHtml, setPreviewHtml] = useState<string | null>(null);
// foi removida por acidente. O build passa (esbuild/Vite não checam tipos),
// mas ao clicar em "Pré-visualizar" o código chama setPreviewHtml(...) e quebra
// em runtime com "setPreviewHtml is not defined". Como o ajuste com IA e o
// e-mail/preview dependem disso, tudo dá o MESMO erro.
//
// Este teste monta o modal de verdade, simula o clique em "Pré-visualizar"
// (com o fetch do servidor mockado) e garante que ele avança para a etapa de
// pré-visualização (prova que setPreviewHtml existe e funciona).
//
// Rodar:
//   node --import tsx --import ./scripts/test-loaders/register.mjs \
//        --test scripts/dhl-occurrence-report-render.test.tsx

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://app.exemplo.com/missions',
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
localStorage.setItem('authToken', 'tmseg-token-test-1');

let React: typeof import('react');
let createRoot: typeof import('react-dom/client').createRoot;
let DhlOccurrenceReportModal: React.ComponentType<any>;

before(async () => {
  React = await import('react');
  ({ createRoot } = await import('react-dom/client'));
  DhlOccurrenceReportModal = (await import('../components/DhlOccurrenceReportModal')).default;
});

const REPORT_HTML = '<html><body><h1>PLANO DE AÇÃO DHL S.E. 183013</h1></body></html>';

function mockFetch() {
  (globalThis as any).fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      ok: true,
      html: REPORT_HTML,
      filename: 'PA-DHL-183013.html',
      evidenceCount: 2,
      phasePhotoCount: 2,
    }),
  });
}

async function flush() {
  for (let i = 0; i < 8; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await React.act(async () => { await new Promise((r) => setTimeout(r, 5)); });
  }
}

test('DhlOccurrenceReportModal: "Pré-visualizar" funciona sem "setPreviewHtml is not defined"', async () => {
  mockFetch();
  const mission = { id: 'GTM-183013', dhl_se_number: '183013' } as any;

  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  const root = createRoot(container);

  let renderError: unknown = null;
  try {
    await React.act(async () => {
      root.render(React.createElement(DhlOccurrenceReportModal, { mission, isOpen: true, onClose: () => {} }));
    });

    // Etapa "edit": botão Pré-visualizar deve existir.
    const previewBtn = container.querySelector('[data-testid="button-preview-dhl-occurrence-report"]') as any;
    assert.ok(previewBtn, 'deveria renderizar o botão "Pré-visualizar" (etapa de edição)');

    // Simula o clique — dispara handlePreview -> setPreviewHtml(...)
    await React.act(async () => {
      previewBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await flush();
  } catch (e) {
    renderError = e;
  }

  const html = container.innerHTML;
  try { await React.act(async () => { root.unmount(); }); } catch { /* noop */ }
  container.remove();

  assert.equal(renderError, null, `fluxo lançou erro: ${(renderError as any)?.message || renderError}`);
  // Avançou para a pré-visualização: o textarea de "Ajustar com IA" só existe na etapa preview.
  assert.ok(
    html.includes('input-dhl-occurrence-ai-adjust') || html.includes('iframe-dhl-occurrence-preview'),
    'deveria avançar para a etapa de pré-visualização (setPreviewHtml aplicado)',
  );
});
