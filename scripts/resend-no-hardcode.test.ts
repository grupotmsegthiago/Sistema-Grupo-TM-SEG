import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/**
 * Garante que a Edge Function ativa não versiona chave Resend literal.
 * Cópias legadas em attached_assets/ são escopo de limpeza na Fase 2.
 */
describe('resend security guard', () => {
  const edgeFnPath = 'supabase/functions/send-welcome-email/index.ts';

  it('send-welcome-email não contém chave Resend hardcoded', () => {
    const src = fs.readFileSync(edgeFnPath, 'utf8');
    assert.doesNotMatch(src, /re_[A-Za-z0-9]{10,}/, 'chave Resend literal detectada no código ativo');
    assert.match(src, /Deno\.env\.get\(['"]RESEND_API_KEY['"]\)/, 'deve ler RESEND_API_KEY do ambiente');
  });

  it('send-welcome-email falha segura sem RESEND_API_KEY (HTTP 503, sem fallback)', () => {
    const src = fs.readFileSync(edgeFnPath, 'utf8');
    assert.match(src, /if\s*\(\s*!resendApiKey\s*\)/, 'deve validar ausência da chave');
    assert.match(src, /status:\s*503/, 'deve retornar HTTP 503 quando chave ausente');
    assert.doesNotMatch(
      src,
      /RESEND_API_KEY\s*=\s*['"]re_/,
      'não deve haver fallback hardcoded de chave Resend',
    );
  });
});
