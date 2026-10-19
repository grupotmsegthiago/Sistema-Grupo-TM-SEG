import assert from 'node:assert/strict';
import test from 'node:test';
import { respostaDoPacote } from '../lib/dadosProtegidos/clienteNavegador';

test('update 204 do PostgREST volta sem corpo', () => {
  const resposta = respostaDoPacote({ status: 204, body: '', contentType: 'application/json' }, 200);
  assert.equal(resposta.status, 204);
  assert.equal(resposta.body, null);
});

test('consulta 200 preserva o JSON e o intervalo', async () => {
  const resposta = respostaDoPacote({
    status: 200,
    body: '[{"id":"1"}]',
    contentType: 'application/json',
    contentRange: '0-0/1',
  }, 200);
  assert.equal(resposta.status, 200);
  assert.equal(resposta.headers.get('content-range'), '0-0/1');
  assert.equal(await resposta.text(), '[{"id":"1"}]');
});
