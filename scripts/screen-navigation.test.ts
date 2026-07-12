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

test('Diretoria abre no cockpit executivo por padrão', () => {
  const prev = globalThis.window;
  const prevStorage = globalThis.localStorage;
  const store: Record<string, string> = {
    userData: JSON.stringify({ role: 'Diretoria' }),
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

test('?page= na URL tem prioridade sobre padrão da Diretoria', () => {
  const prev = globalThis.window;
  const prevStorage = globalThis.localStorage;
  (globalThis as any).window = {
    location: { search: '?page=missions', href: 'https://sistema.test/?page=missions' },
    history: { replaceState: () => {} },
  };
  (globalThis as any).localStorage = {
    getItem: () => JSON.stringify({ role: 'diretoria' }),
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
