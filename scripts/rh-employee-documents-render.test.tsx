import assert from 'node:assert/strict';
import { before, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://app.exemplo.com/rh',
  pretendToBeVisual: true,
});
const { window } = dom;
(globalThis as any).window = window;
(globalThis as any).document = window.document;
Object.getOwnPropertyNames(window).forEach((key) => {
  if (!(key in globalThis)) {
    try { (globalThis as any)[key] = (window as any)[key]; } catch { /* read-only */ }
  }
});
Object.defineProperty(globalThis, 'navigator', {
  value: window.navigator,
  configurable: true,
});
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).confirm = () => true;

let React: typeof import('react');
let createRoot: typeof import('react-dom/client').createRoot;
let RhEmployeeDocuments: typeof import('../components/rh/RhEmployeeDocuments').default;

before(async () => {
  React = await import('react');
  ({ createRoot } = await import('react-dom/client'));
  ({ default: RhEmployeeDocuments } = await import('../components/rh/RhEmployeeDocuments'));
});

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem('userData', JSON.stringify({
    id: 'user-rh-1',
    name: 'Pessoa RH',
    role: 'RH',
  }));
});

async function flush() {
  await React.act(async () => { await Promise.resolve(); });
  await React.act(async () => { await Promise.resolve(); });
}

function mount(services: any, notify: (title: string, message: string) => void = () => undefined) {
  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  const root = createRoot(container);
  return {
    container,
    root,
    async render() {
      await React.act(async () => {
        root.render(
          React.createElement(RhEmployeeDocuments, {
            employeeId: 'emp-1',
            services,
            notify,
          }),
        );
      });
      await flush();
    },
    async cleanup() {
      await React.act(async () => { root.unmount(); });
      container.remove();
    },
  };
}

test('piloto abre, lista, cria, remove e atualiza sem Supabase direto', async () => {
  let listCalls = 0;
  let created: any;
  let removed = '';
  const services = {
    list: async () => {
      listCalls += 1;
      return [{
        id: 'doc-1',
        employee_id: 'emp-1',
        doc_type: 'Contrato',
        file_name: 'contrato.pdf',
        file_url: 'https://files/contrato.pdf',
        created_at: '2026-08-19T10:00:00.000Z',
      }];
    },
    uploadFile: async () => 'https://files/novo.pdf',
    create: async (payload: any) => {
      created = payload;
      return { id: 'doc-2', ...payload };
    },
    remove: async (id: string) => {
      removed = id;
    },
  };
  const mounted = mount(services);
  await mounted.render();

  assert.match(mounted.container.textContent || '', /Documentos e contratos/);
  assert.match(mounted.container.textContent || '', /contrato\.pdf/);
  assert.equal(listCalls, 1);

  const input = mounted.container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new window.File(['pdf'], 'novo.pdf', { type: 'application/pdf' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await React.act(async () => {
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await flush();

  assert.deepEqual(created, {
    employeeId: 'emp-1',
    docType: 'Contrato',
    fileName: 'novo.pdf',
    fileUrl: 'https://files/novo.pdf',
    mimeType: 'application/pdf',
    notes: null,
  });
  assert.equal(listCalls, 2, 'upload deve atualizar a lista');
  assert.match(mounted.container.textContent || '', /Enviar arquivo/);

  const buttons = [...mounted.container.querySelectorAll('button')];
  const deleteButton = buttons.at(-1) as HTMLButtonElement;
  await React.act(async () => {
    deleteButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await flush();

  assert.equal(removed, 'doc-1');
  assert.equal(listCalls, 3, 'remoção deve atualizar a lista');
  await mounted.cleanup();
});

test('erro de API não quebra tela e permissão sem edição oculta ações', async () => {
  const notifications: string[] = [];
  const failingServices = {
    list: async () => { throw new Error('Falha API'); },
    uploadFile: async () => { throw new Error('Falha API'); },
    create: async () => { throw new Error('não deveria criar'); },
    remove: async () => { throw new Error('não deveria remover'); },
  };
  const mounted = mount(failingServices, (_title, message) => notifications.push(message));
  await mounted.render();
  assert.match(mounted.container.textContent || '', /Nenhum documento anexado/);

  const input = mounted.container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new window.File(['pdf'], 'falha.pdf', { type: 'application/pdf' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await React.act(async () => {
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await flush();
  assert.deepEqual(notifications, ['Falha API']);
  await mounted.cleanup();

  window.localStorage.setItem('userData', JSON.stringify({ role: 'Financeiro' }));
  const readonly = mount({
    ...failingServices,
    list: async () => [],
  });
  await readonly.render();
  assert.equal(readonly.container.querySelector('input[type="file"]'), null);
  assert.doesNotMatch(readonly.container.textContent || '', /Enviar arquivo/);
  await readonly.cleanup();
});

test('upload exibe loading até concluir e então faz refresh', async () => {
  let releaseUpload!: (url: string) => void;
  let listCalls = 0;
  const uploadPromise = new Promise<string>((resolve) => {
    releaseUpload = resolve;
  });
  const services = {
    list: async () => {
      listCalls += 1;
      return [];
    },
    uploadFile: async () => uploadPromise,
    create: async (payload: any) => ({ id: 'doc-loading', ...payload }),
    remove: async () => undefined,
  };
  const mounted = mount(services);
  await mounted.render();
  const input = mounted.container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new window.File(['pdf'], 'loading.pdf', { type: 'application/pdf' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });

  await React.act(async () => {
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    await Promise.resolve();
  });
  assert.match(mounted.container.textContent || '', /Enviando/);

  releaseUpload('https://files/loading.pdf');
  await flush();
  assert.match(mounted.container.textContent || '', /Enviar arquivo/);
  assert.equal(listCalls, 2);
  await mounted.cleanup();
});
