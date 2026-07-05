import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://app.exemplo.com/missoes',
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
} catch { /* read-only */ }
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let React: typeof import('react');
let createRoot: typeof import('react-dom/client').createRoot;
let DailyGoalThermometer: React.ComponentType<any>;

before(async () => {
  React = await import('react');
  ({ createRoot } = await import('react-dom/client'));
  DailyGoalThermometer = (await import('../components/DailyGoalThermometer')).default;
});

async function renderGoal(canSeeMonetary: boolean): Promise<string> {
  window.localStorage.clear();
  window.localStorage.setItem('userData', JSON.stringify({ role: 'operador', name: 'Operador' }));

  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  const root = createRoot(container);

  await React.act(async () => {
    root.render(
      React.createElement(DailyGoalThermometer, {
        canSeeMonetary,
        viewPeriod: 'TODAY',
        missions: [],
        clientTables: [{ id: 1 }],
        providerTables: [],
        clientsData: [],
        lastDataUpdatedAt: new Date('2026-07-05T12:00:00.000Z'),
        onRefreshMissions: async () => true,
        historyKey: `test-meta-${canSeeMonetary ? 'on' : 'off'}`,
      }),
    );
  });
  await React.act(async () => { await Promise.resolve(); });

  const html = container.innerHTML;
  await React.act(async () => { root.unmount(); });
  container.remove();
  return html;
}

test('canSeeMonetary=true mostra valor e gráfico da meta mesmo sem role diretoria', async () => {
  const html = await renderGoal(true);

  assert.ok(html.includes('data-testid="text-goal-revenue"'), 'deveria renderizar o valor da meta');
  assert.ok(html.includes('data-testid="goal-update-sparkline"'), 'deveria renderizar o gráfico da meta');
  assert.ok(!html.includes('Sincronização ativa'), 'não deveria cair no modo sem valores');
});

test('canSeeMonetary=false mantém valores e gráfico ocultos', async () => {
  const html = await renderGoal(false);

  assert.ok(!html.includes('data-testid="text-goal-revenue"'), 'não deveria renderizar o valor da meta');
  assert.ok(!html.includes('data-testid="goal-update-sparkline"'), 'não deveria renderizar o gráfico da meta');
  assert.ok(html.includes('Sincronização ativa'), 'deveria mostrar o estado sem valores');
});
