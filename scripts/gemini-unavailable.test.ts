import test from 'node:test';
import assert from 'node:assert/strict';
import { isGeminiUnavailableError, sanitizeGeminiErrorForUser } from '../lib/geminiUnavailable';

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

test('isGeminiUnavailableError detecta billing/dunning do Google Cloud', () => {
  const msg = 'Lightning dunning decision is deny for project: projects/779291370874';
  assert.equal(isGeminiUnavailableError(msg), true);
});

test('isGeminiUnavailableError detecta projeto Gemini com acesso negado', () => {
  const msg = 'Your project has been denied access. Please contact support.';
  assert.equal(isGeminiUnavailableError(msg), true);
});

test('isGeminiUnavailableError detecta PERMISSION_DENIED do GenerateContent', () => {
  assert.equal(isGeminiUnavailableError('403 PERMISSION_DENIED'), true);
});

test('sanitizeGeminiErrorForUser traduz denied access e não vaza inglês cru', () => {
  const raw = 'Your project has been denied access. Please contact support.';
  const msg = sanitizeGeminiErrorForUser(raw);
  assert.match(msg, /projeto Gemini/i);
  assert.doesNotMatch(msg, /Please contact support/i);
});
