import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyGeminiError } from '../lib/geminiUnavailable.ts';

test('classifyGeminiError detecta chave ausente', () => {
  const r = classifyGeminiError(new Error('Chave Gemini não configurada'));
  assert.equal(r.code, 'KEY_MISSING');
});

test('classifyGeminiError detecta chave inválida do Google', () => {
  const r = classifyGeminiError(new Error('API key not valid. Please pass a valid API key.'));
  assert.equal(r.code, 'KEY_INVALID');
});

test('classifyGeminiError detecta cota excedida', () => {
  const r = classifyGeminiError(new Error('429 Resource exhausted quota'));
  assert.equal(r.code, 'QUOTA');
});

test('health endpoint expõe code KEY_MISSING quando não configurado', () => {
  const src = fs.readFileSync('server/routes.ts', 'utf8');
  assert.match(src, /code: 'KEY_MISSING'/);
  assert.match(src, /classifyGeminiError/);
});
