import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://app.exemplo.com/rh',
  pretendToBeVisual: true,
});
const { window } = dom;
const copiedWindowKeys: string[] = [];
(globalThis as any).window = window;
(globalThis as any).document = window.document;
Object.getOwnPropertyNames(window).forEach((key) => {
  if (!(key in globalThis)) {
    try {
      (globalThis as any)[key] = (window as any)[key];
      copiedWindowKeys.push(key);
    } catch {
      /* read-only */
    }
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
let RhMedicalExams: typeof import('../components/rh/RhMedicalExams').default;

before(async () => {
  React = await import('react');
  ({ createRoot } = await import('react-dom/client'));
  ({ default: RhMedicalExams } = await import('../components/rh/RhMedicalExams'));
});

after(async () => {
  window.close();
  copiedWindowKeys.forEach((key) => {
    try { delete (globalThis as any)[key]; } catch { /* non-configurable */ }
  });
  delete (globalThis as any).window;
  delete (globalThis as any).document;
  delete (globalThis as any).navigator;
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  (process as any)._getActiveHandles()
    .filter((handle: any) => handle?.constructor?.name === 'MessagePort')
    .forEach((handle: any) => handle.unref?.());
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

function mount(
  services: any,
  notify: (title: string, message: string) => void = () => undefined,
) {
  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  const root = createRoot(container);
  return {
    container,
    async render() {
      await React.act(async () => {
        root.render(React.createElement(RhMedicalExams, {
          employeeId: '11111111-1111-4111-8111-111111111111',
          services,
          notify,
        }));
      });
      await flush();
    },
    async cleanup() {
      await React.act(async () => { root.unmount(); });
      container.remove();
    },
  };
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')]
    .find((item) => item.textContent?.includes(text));
  assert.ok(button, `botão ${text} deve existir`);
  return button as HTMLButtonElement;
}

async function click(button: HTMLButtonElement) {
  await React.act(async () => {
    button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await flush();
}

async function changeValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof window.HTMLSelectElement
    ? window.HTMLSelectElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  assert.ok(setter);
  await React.act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}

test('lista, cria, edita e remove preservando tabela, busca, ordem e refresh', async () => {
  let listCalls = 0;
  let created: any;
  let updated: any;
  let removed = '';
  const existing = {
    id: '22222222-2222-4222-8222-222222222222',
    employee_id: '11111111-1111-4111-8111-111111111111',
    exam_type: 'Admissional',
    exam_date: '2026-08-20',
    expiry_date: '2027-08-20',
    clinic_name: 'Clínica TM',
    result: 'Apto',
    document_url: 'https://files/exame.pdf',
  };
  const services = {
    list: async () => {
      listCalls += 1;
      return [existing];
    },
    create: async (input: any) => {
      created = input;
      return { id: 'exam-new', employee_id: input.employeeId, ...input };
    },
    update: async (id: string, input: any) => {
      updated = { id, input };
      return { id, employee_id: input.employeeId, ...input };
    },
    remove: async (id: string) => {
      removed = id;
    },
  };
  const notifications: string[] = [];
  const mounted = mount(services, (title, message) => notifications.push(`${title}:${message}`));
  await mounted.render();

  assert.match(mounted.container.textContent || '', /Exames médicos/);
  assert.match(mounted.container.textContent || '', /Admissional/);
  assert.ok(mounted.container.querySelector('input[placeholder="Pesquisar..."]'));
  assert.equal(listCalls, 1);

  await click(buttonByText(mounted.container, 'Adicionar'));
  await click(buttonByText(mounted.container, 'Salvar'));
  assert.equal(created, undefined);
  assert.ok(notifications.includes('error:Tipo é obrigatório'));

  await changeValue(
    mounted.container.querySelector('select[name="examType"]') as HTMLSelectElement,
    'Periódico',
  );
  await changeValue(
    mounted.container.querySelector('input[name="examDate"]') as HTMLInputElement,
    '2026-08-26',
  );
  await click(buttonByText(mounted.container, 'Salvar'));
  assert.ok(created);
  const createdPayload = created as any;
  assert.equal(createdPayload.examType, 'Periódico');
  assert.equal(createdPayload.examDate, '2026-08-26');
  assert.equal('updated_by' in createdPayload, false);
  assert.equal(listCalls, 2);
  assert.ok(notifications.includes('success:Salvo com sucesso!'));

  await click(buttonByText(mounted.container, 'Editar'));
  await click(buttonByText(mounted.container, 'Salvar'));
  assert.equal(updated.id, existing.id);
  assert.equal(updated.input.examType, existing.exam_type);
  assert.equal(updated.input.documentUrl, existing.document_url);
  assert.equal('updated_by' in updated.input, false);
  assert.equal(listCalls, 3);

  const deleteButton = [...mounted.container.querySelectorAll('button')]
    .find((item) => item.querySelector('svg') && !item.textContent?.trim());
  assert.ok(deleteButton);
  await click(deleteButton as HTMLButtonElement);
  assert.equal(removed, existing.id);
  assert.equal(listCalls, 4);
  assert.ok(notifications.includes('success:Registro removido'));
  await mounted.cleanup();
});

test('leitura mantém lista vazia e escritas falhas nunca exibem sucesso', async () => {
  const notifications: string[] = [];
  const services = {
    list: async () => { throw new Error('SENSITIVE_READ_DETAIL'); },
    create: async () => { throw new Error('SENSITIVE_INSERT_DETAIL'); },
    update: async () => { throw new Error('SENSITIVE_UPDATE_DETAIL'); },
    remove: async () => { throw new Error('SENSITIVE_DELETE_DETAIL'); },
  };
  const mounted = mount(services, (title, message) => notifications.push(`${title}:${message}`));
  await mounted.render();
  assert.match(mounted.container.textContent || '', /Nenhum registro encontrado/);
  assert.equal(notifications.length, 0, 'erro de leitura não cria notificação nova');

  await click(buttonByText(mounted.container, 'Adicionar'));
  await changeValue(
    mounted.container.querySelector('select[name="examType"]') as HTMLSelectElement,
    'Periódico',
  );
  await changeValue(
    mounted.container.querySelector('input[name="examDate"]') as HTMLInputElement,
    '2026-08-26',
  );
  await click(buttonByText(mounted.container, 'Salvar'));
  assert.deepEqual(notifications, ['error:Falha ao operar exames médicos']);
  assert.doesNotMatch(notifications.join(' '), /SENSITIVE/);
  assert.equal(notifications.some((message) => message.startsWith('success:')), false);
  await mounted.cleanup();
});

test('perfil sem permissão mantém leitura e oculta ações de escrita', async () => {
  window.localStorage.setItem('userData', JSON.stringify({ role: 'Financeiro' }));
  const mounted = mount({
    list: async () => [],
    create: async () => { throw new Error('não deveria criar'); },
    update: async () => { throw new Error('não deveria editar'); },
    remove: async () => { throw new Error('não deveria remover'); },
  });
  await mounted.render();
  assert.doesNotMatch(mounted.container.textContent || '', /Adicionar/);
  assert.doesNotMatch(mounted.container.textContent || '', /Editar/);
  await mounted.cleanup();
});
