import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/**
 * Garante que a Edge Function ativa não versiona chave Resend literal.
 * Cópias legadas em attached_assets/ são escopo de limpeza na Fase 2.
 */
describe('resend security guard', () => {
  it('send-welcome-email não contém chave Resend hardcoded', () => {
    const src = fs.readFileSync('supabase/functions/send-welcome-email/index.ts', 'utf8');
    assert.doesNotMatch(src, /re_[A-Za-z0-9]{10,}/, 'chave Resend literal detectada no código ativo');
    assert.match(src, /Deno\.env\.get\(['"]RESEND_API_KEY['"]\)/, 'deve ler RESEND_API_KEY do ambiente');
  });
});
