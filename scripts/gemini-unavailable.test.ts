import test from 'node:test';
import assert from 'node:assert/strict';
import { isGeminiUnavailableError } from '../lib/geminiUnavailable';

test('isGeminiUnavailableError detecta API Gemini bloqueada', () => {
  const msg =
    'Requests to this API generativelanguage.googleapis.com method google.ai.generativelanguage.v1beta.GenerativeService.GenerateContent are blocked.';
  assert.equal(isGeminiUnavailableError(msg), true);
});

test('isGeminiUnavailableError detecta timeout e rede', () => {
  assert.equal(isGeminiUnavailableError('Timeout na validação facial'), true);
  assert.equal(isGeminiUnavailableError('fetch failed'), true);
  assert.equal(isGeminiUnavailableError('HTTP 503'), true);
});

test('isGeminiUnavailableError não trata erro de validação facial do usuário', () => {
  assert.equal(isGeminiUnavailableError('Remova os óculos para validação facial.'), false);
  assert.equal(isGeminiUnavailableError('Rosto não confere com o cadastro facial.'), false);
});
