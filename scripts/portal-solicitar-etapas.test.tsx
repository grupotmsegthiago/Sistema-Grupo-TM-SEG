// Barra azul, coluna de etapas e o aviso quando o veículo entra sem operação.
//
// node --import tsx --import ./scripts/test-loaders/register.mjs --test scripts/portal-solicitar-etapas.test.tsx

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost:5000/ceva',
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
let SolicitarEscolta: typeof import('../components/ceva/SolicitarEscolta').SolicitarEscolta;
let PortalMarcaProvider: typeof import('../components/ceva/portalMarca').PortalMarcaProvider;
let MARCA_CEVA: typeof import('../lib/portalEscolta/marca').MARCA_CEVA;

before(async () => {
  React = await import('react');
  ({ createRoot } = await import('react-dom/client'));
  ({ SolicitarEscolta } = await import('../components/ceva/SolicitarEscolta'));
  ({ PortalMarcaProvider } = await import('../components/ceva/portalMarca'));
  ({ MARCA_CEVA } = await import('../lib/portalEscolta/marca'));
});

function resposta(corpo: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  });
}

async function flush() {
  await React.act(async () => { await new Promise((r) => setTimeout(r, 30)); });
}

function digitar(campo: HTMLInputElement, valor: string) {
  const descritor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  descritor?.set?.call(campo, valor);
  campo.dispatchEvent(new window.Event('input', { bubbles: true }));
  campo.dispatchEvent(new window.Event('change', { bubbles: true }));
}

function clicar(el: Element) {
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

test('veículo sem operação mostra a falta, a barra azul e a coluna de etapas', async () => {
  (globalThis as any).fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method || 'GET').toUpperCase();
    if (url.endsWith('/catalogo') && method === 'GET') {
      return resposta({ catalogo: { operacao: [], quemAutorizou: [], contrato: [], tsp: [], atendimentoPgr: [] } });
    }
    if (url.endsWith('/frota')) {
      return resposta({
        motoristas: [{ nome: 'CELSO CARVALHO DE OLIVEIRA', telefone: '(13) 98808-2731' }],
        veiculos: [{ placa: 'AAT5F53', modelo: 'VOLVO FH 460 6X2' }],
      });
    }
    if (url.endsWith('/catalogo') && method === 'POST') return resposta({ error: 'permission denied for table ceva_portal_catalogo' }, 500);
    return resposta({}, 404);
  };

  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  const root = createRoot(container);
  await React.act(async () => {
    root.render(
      React.createElement(PortalMarcaProvider, { marca: MARCA_CEVA },
        React.createElement(SolicitarEscolta, { onFechar: () => undefined, onCriada: () => undefined }),
      ),
    );
  });
  await flush();

  const texto = () => document.body.textContent || '';
  assert.match(texto(), /Etapas/);
  assert.match(texto(), /0% concluído/);
  const barra = document.querySelector('.bg-blue-600') as HTMLElement | null;
  assert.ok(barra, 'a barra azul existe');
  assert.equal(barra.style.width, '0%');

  const caracterizada = [...document.querySelectorAll('button')].find((botao) => botao.textContent?.includes('Escolta Caracterizada'));
  assert.ok(caracterizada);
  await React.act(async () => { clicar(caracterizada); });
  await flush();
  assert.match(texto(), /Concluída/);
  assert.match(texto(), /25% concluído/);

  const data = document.querySelector('input[placeholder="dd/mm/aaaa"]') as HTMLInputElement;
  const hora = document.querySelector('input[aria-label="Início hora"]') as HTMLInputElement;
  const origem = [...document.querySelectorAll('label')].find((label) => label.textContent?.startsWith('Origem'))?.querySelector('input') as HTMLInputElement;
  const destino = [...document.querySelectorAll('label')].find((label) => label.textContent?.startsWith('Destino'))?.querySelector('input') as HTMLInputElement;
  await React.act(async () => {
    digitar(data, '22/10/2026');
    digitar(hora, '12:00');
    digitar(origem, 'SANTOS, SP');
    digitar(destino, 'DIADEMA, SP');
  });
  await flush();
  assert.match(texto(), /50% concluído/);
  assert.match(texto(), /Não avança porque falta/);
  assert.match(texto(), /A próxima etapa fica fechada/);
  assert.equal(document.body.textContent?.includes('Enviar solicitação'), false);

  const motorista = document.querySelector('input[placeholder="Digite o nome para filtrar"]') as HTMLInputElement;
  await React.act(async () => { digitar(motorista, 'CELSO'); });
  await flush();
  const nome = [...document.querySelectorAll('button')].find((botao) => botao.textContent?.includes('CELSO CARVALHO DE OLIVEIRA'));
  assert.ok(nome, 'a lista do motorista aparece ao digitar');
  await React.act(async () => { clicar(nome); });
  await flush();
  const confirmar = [...document.querySelectorAll('button')].find((botao) => botao.textContent?.includes('Sim, o número está correto'));
  assert.ok(confirmar, 'o telefone só aparece depois da escolha');
  await React.act(async () => { clicar(confirmar); });
  await flush();

  const placa = document.querySelector('input[placeholder="Digite a placa para filtrar"]') as HTMLInputElement;
  await React.act(async () => { digitar(placa, 'AAT5F53'); });
  await flush();
  const veiculo = [...document.querySelectorAll('button')].find((botao) => botao.textContent?.includes('AAT5F53'));
  assert.ok(veiculo);
  await React.act(async () => { clicar(veiculo); });
  await flush();

  assert.match(texto(), /Não avança porque falta a operação/);
  assert.match(texto(), /Clique em Novo, ao lado de Operação/);
  assert.equal(texto().includes('Enviar solicitação'), false);
  assert.match(texto(), /Agora/);
  assert.equal((document.querySelector('.bg-blue-600') as HTMLElement).style.width, '50%');

  const novo = [...document.querySelectorAll('button')].find((botao) => botao.textContent?.includes('Novo'));
  assert.ok(novo);
  await React.act(async () => { clicar(novo); });
  await flush();
  const nomeNovo = document.querySelector('input[placeholder="Nome novo"]') as HTMLInputElement;
  await React.act(async () => { digitar(nomeNovo, 'DEDICADO'); });
  const salvar = [...document.querySelectorAll('button')].find((botao) => botao.textContent?.trim() === 'Salvar');
  assert.ok(salvar);
  await React.act(async () => { clicar(salvar); });
  await flush();

  assert.match(texto(), /Neste ambiente a lista não foi gravada/);
  assert.match(texto(), /100% concluído/);
  assert.match(texto(), /Enviar solicitação/);
  assert.equal(texto().includes('Não avança porque falta'), false);
  assert.equal((document.querySelector('.bg-blue-600') as HTMLElement).style.width, '100%');
  assert.match(texto(), /Dados da CEVA/);

  await React.act(async () => { root.unmount(); });
  container.remove();
});
