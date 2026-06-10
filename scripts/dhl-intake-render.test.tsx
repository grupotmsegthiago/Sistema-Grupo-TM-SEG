// Teste de RENDERIZAÇÃO do formulário público de cadastro de fornecedor
// (components/DhlSupplierIntake.tsx).
//
// O link /fornecedor/dhl atende TODOS os clientes, mas a identidade visual da
// DHL é EXCLUSIVA dela: a cor amarela #FFCC00, o campo "Nº S.E." e as
// instruções técnicas de espelhamento por tecnologia (IP/CNPJ/conta da DHL).
// Os testes server-side já cobrem os e-mails; aqui garantimos que o PRÓPRIO
// componente renderizado nunca vaza esses elementos quando isDhl=false, com um
// caso de controle isDhl=true confirmando que eles aparecem para a DHL.
//
// Rodar:
//   node --import tsx --import ./scripts/test-loaders/asset-loader.mjs \
//        --test scripts/dhl-intake-render.test.tsx

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// ── Ambiente DOM (jsdom) ──────────────────────────────────────
// O componente lê window.location.search (token) e usa react-dom/client, que
// exige um DOM real. Montamos o jsdom e expomos os globais que o React precisa.
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://app.exemplo.com/fornecedor/dhl?token=abc',
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

let React: typeof import('react');
let createRoot: typeof import('react-dom/client').createRoot;
let DhlSupplierIntake: React.ComponentType;

before(async () => {
  React = await import('react');
  ({ createRoot } = await import('react-dom/client'));
  DhlSupplierIntake = (await import('../components/DhlSupplierIntake')).default;
});

// Resposta do GET /api/dhl/intake/public/:token. Os snapshots de agent1/agent2/
// vehicle (sem mirrorProofUrl) fazem o componente retomar na etapa 3 (Veículo),
// onde a regra técnica de espelhamento por tecnologia aparece quando isDhl=true.
function buildPublicResponse(isDhl: boolean) {
  return {
    isDhl,
    mission: {
      id: 'GTM-001',
      dhl_se_number: 'SE-12345',
      origin: 'São Paulo/SP',
      destination: 'Curitiba/PR',
      start_time: '2026-01-01T10:00:00.000Z',
    },
    intake: { providerName: 'FORNECEDOR XPTO', status: 'pendente' },
    escoltistas: [],
    vehicles: [],
    snapshots: {
      agent1: { id: 'a1', nome: 'FULANO', cpf: '111.111.111-11' },
      agent2: { id: 'a2', nome: 'BELTRANO', cpf: '222.222.222-22' },
      vehicle: { id: 'v1', placa: 'ABC1D23', marca: 'VW', modelo: 'Gol', tecnologia: 'OMNILINK' },
    },
    progress: {},
  };
}

async function renderIntake(isDhl: boolean): Promise<string> {
  (globalThis as any).fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => buildPublicResponse(isDhl),
  });

  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  const root = createRoot(container);

  // Render + flush dos efeitos (o fetch dentro do useEffect é assíncrono).
  await React.act(async () => {
    root.render(React.createElement(DhlSupplierIntake));
  });
  // Flushes extras p/ garantir que o setState pós-fetch foi aplicado.
  await React.act(async () => { await Promise.resolve(); });
  await React.act(async () => { await Promise.resolve(); });

  const html = container.innerHTML;
  await React.act(async () => { root.unmount(); });
  container.remove();
  return html;
}

test('isDhl=false: o formulário público NÃO mostra identidade nem regras da DHL', async () => {
  const html = await renderIntake(false);

  // Sanidade: o componente saiu do loading e renderizou o formulário (etapa 3).
  assert.ok(html.includes('Veículo da Escolta'), 'deveria ter renderizado a etapa de Veículo');

  // 1) Campo "Nº S.E." — exclusivo da DHL.
  assert.ok(!html.includes('Nº S.E.'), 'não-DHL não pode mostrar o campo "Nº S.E."');
  // 2) Cor amarela #FFCC00 (verificada de forma tolerante a normalização rgb).
  assert.ok(!containsYellowIdentity(html), 'não-DHL não pode usar a cor amarela #FFCC00');
  // 3) Instruções técnicas de espelhamento por tecnologia (IP/CNPJ/conta DHL).
  assert.ok(!html.includes('131.255.103.146'), 'não-DHL não pode vazar o IP de espelhamento da DHL');
  assert.ok(!html.includes('00.233.065/0001-87'), 'não-DHL não pode vazar o CNPJ da DHL');
  assert.ok(!html.includes('Regra de espelhamento DHL'), 'não-DHL não pode mostrar a regra de espelhamento DHL');
});

test('isDhl=true: o formulário público mostra identidade e regras da DHL (controle)', async () => {
  const html = await renderIntake(true);

  assert.ok(html.includes('Veículo da Escolta'), 'deveria ter renderizado a etapa de Veículo');
  assert.ok(html.includes('Nº S.E.'), 'DHL deve mostrar o campo "Nº S.E."');
  assert.ok(containsYellowIdentity(html), 'DHL deve usar a cor amarela #FFCC00');
  assert.ok(html.includes('131.255.103.146'), 'DHL deve mostrar as instruções técnicas de espelhamento');
  assert.ok(html.includes('Regra de espelhamento DHL'), 'DHL deve mostrar a regra de espelhamento DHL');
});

// O jsdom pode serializar o estilo inline como hex (#FFCC00) ou como rgb
// (rgb(255, 204, 0)). Aceitamos ambas as formas para detectar a faixa amarela.
function containsYellowIdentity(html: string): boolean {
  const h = html.toLowerCase();
  return h.includes('#ffcc00') || h.includes('rgb(255, 204, 0)') || h.includes('rgb(255,204,0)');
}
