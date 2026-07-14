import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getScreenFromUrl,
  getRoleDefaultScreen,
  resolveInitialScreen,
  syncUrlWithScreen,
  DIRECTORIA_COCKPIT_SCREEN,
} from '../lib/screenNavigation.ts';

test('resolveInitialScreen usa ?page= da URL', () => {
  const prev = globalThis.window;
  (globalThis as any).window = {
    location: { search: '?page=rh-timeclock', href: 'https://x/?page=rh-timeclock' },
    history: { replaceState: () => {} },
  };
  try {
    assert.equal(resolveInitialScreen('dashboard'), 'rh-timeclock');
  } finally {
    (globalThis as any).window = prev;
  }
});

test('syncUrlWithScreen define page na URL', () => {
  let href = 'https://sistema.test/';
  const prev = globalThis.window;
  (globalThis as any).window = {
    location: { href, search: '' },
    history: {
      replaceState: (_s: unknown, _t: unknown, url: string) => {
        href = url;
      },
    },
  };
  try {
    syncUrlWithScreen('system-settings');
    assert.match(href, /page=system-settings/);
    syncUrlWithScreen('dashboard');
    assert.doesNotMatch(href, /page=/);
  } finally {
    (globalThis as any).window = prev;
  }
});

test('getScreenFromUrl retorna null sem param', () => {
  const prev = globalThis.window;
  (globalThis as any).window = { location: { search: '' } };
  try {
    assert.equal(getScreenFromUrl(), null);
  } finally {
    (globalThis as any).window = prev;
  }
});

test('Thiago Moreira abre no cockpit executivo por padrão (não basta perfil Diretoria)', () => {
  const prev = globalThis.window;
  const prevStorage = globalThis.localStorage;
  const store: Record<string, string> = {
    userData: JSON.stringify({ name: 'Thiago Moreira', role: 'Diretoria' }),
  };
  (globalThis as any).window = {
    location: { search: '', href: 'https://sistema.test/' },
    history: { replaceState: () => {} },
  };
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
  (globalThis as any).sessionStorage = {
    getItem: () => 'missions',
    setItem: () => {},
    removeItem: () => {},
  };
  try {
    assert.equal(getRoleDefaultScreen(), DIRECTORIA_COCKPIT_SCREEN);
    assert.equal(resolveInitialScreen('dashboard'), DIRECTORIA_COCKPIT_SCREEN);
  } finally {
    (globalThis as any).window = prev;
    (globalThis as any).localStorage = prevStorage;
  }
});

test('perfil Diretoria sem ser Thiago NÃO abre no cockpit', () => {
  const prev = globalThis.window;
  const prevStorage = globalThis.localStorage;
  const prevSession = globalThis.sessionStorage;
  (globalThis as any).window = {
    location: { search: '', href: 'https://sistema.test/' },
    history: { replaceState: () => {} },
  };
  (globalThis as any).localStorage = {
    getItem: () => JSON.stringify({ name: 'Outro Diretor', role: 'Diretoria' }),
    setItem: () => {},
    removeItem: () => {},
  };
  (globalThis as any).sessionStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
  try {
    assert.equal(getRoleDefaultScreen(), null);
    assert.equal(resolveInitialScreen('dashboard'), 'dashboard');
  } finally {
    (globalThis as any).window = prev;
    (globalThis as any).localStorage = prevStorage;
    (globalThis as any).sessionStorage = prevSession;
  }
});

test('?page= na URL tem prioridade sobre padrão da Diretoria', () => {
  const prev = globalThis.window;
  const prevStorage = globalThis.localStorage;
  (globalThis as any).window = {
    location: { search: '?page=missions', href: 'https://sistema.test/?page=missions' },
    history: { replaceState: () => {} },
  };
  (globalThis as any).localStorage = {
    getItem: () => JSON.stringify({ name: 'Thiago Santos', role: 'diretoria' }),
    setItem: () => {},
    removeItem: () => {},
  };
  try {
    assert.equal(resolveInitialScreen('dashboard'), 'missions');
  } finally {
    (globalThis as any).window = prev;
    (globalThis as any).localStorage = prevStorage;
  }
});
