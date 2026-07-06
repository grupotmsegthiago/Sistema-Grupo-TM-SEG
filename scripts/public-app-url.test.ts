import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePublicAppUrl } from '../lib/publicAppUrl';

test('resolvePublicAppUrl normaliza app.grupotmseg.com.br para sistema.grupotmseg.com.br', () => {
  const prevApp = process.env.APP_PUBLIC_URL;
  const prevSys = process.env.SYSTEM_URL;
  try {
    process.env.APP_PUBLIC_URL = 'https://app.grupotmseg.com.br';
    process.env.SYSTEM_URL = '';
    assert.equal(resolvePublicAppUrl(), 'https://sistema.grupotmseg.com.br');
  } finally {
    process.env.APP_PUBLIC_URL = prevApp;
    process.env.SYSTEM_URL = prevSys;
  }
});

test('resolvePublicAppUrl usa env canônico quando configurado', () => {
  const prevApp = process.env.APP_PUBLIC_URL;
  const prevSys = process.env.SYSTEM_URL;
  try {
    process.env.APP_PUBLIC_URL = 'https://sistema.grupotmseg.com.br';
    assert.equal(resolvePublicAppUrl(), 'https://sistema.grupotmseg.com.br');
  } finally {
    process.env.APP_PUBLIC_URL = prevApp;
    process.env.SYSTEM_URL = prevSys;
  }
});

test('resolvePublicAppUrl fallback canônico sem env', () => {
  const prevApp = process.env.APP_PUBLIC_URL;
  const prevSys = process.env.SYSTEM_URL;
  const prevReplit = process.env.REPLIT_DOMAINS;
  try {
    process.env.APP_PUBLIC_URL = '';
    process.env.SYSTEM_URL = '';
    process.env.REPLIT_DOMAINS = '';
    assert.equal(resolvePublicAppUrl(), 'https://sistema.grupotmseg.com.br');
  } finally {
    process.env.APP_PUBLIC_URL = prevApp;
    process.env.SYSTEM_URL = prevSys;
    process.env.REPLIT_DOMAINS = prevReplit;
  }
});
