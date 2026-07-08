import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getScreenFromUrl,
  resolveInitialScreen,
  syncUrlWithScreen,
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
