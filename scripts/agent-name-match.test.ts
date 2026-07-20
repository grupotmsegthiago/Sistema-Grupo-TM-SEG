import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findAgentByName,
  normalizeAgentNameKey,
  sanitizeAgentField,
} from '../lib/agents/agentNameMatch.ts';

test('normalizeAgentNameKey ignora acento e case', () => {
  assert.equal(
    normalizeAgentNameKey('ULYSSES SILVA CORREIA VENANCIO'),
    normalizeAgentNameKey('ULYSSES SILVA CORREIA VENÂNCIO'),
  );
  assert.equal(
    normalizeAgentNameKey('  Carlos   Henrique  '),
    'CARLOS HENRIQUE',
  );
});

test('findAgentByName resolve VENANCIO vs VENÂNCIO', () => {
  const agents = [
    { id: '1', name: 'CARLOS HENRIQUE SOUSA BARBOSA', cpf: '111' },
    { id: '2', name: 'ULYSSES SILVA CORREIA VENÂNCIO', cpf: '03294481101' },
  ];
  const found = findAgentByName(agents, 'ULYSSES SILVA CORREIA VENANCIO');
  assert.ok(found);
  assert.equal(found?.id, '2');
  assert.equal(found?.cpf, '03294481101');
});

test('sanitizeAgentField remove tab invisível', () => {
  assert.equal(sanitizeAgentField('\t03294481101'), '03294481101');
  assert.equal(sanitizeAgentField('\t5201196'), '5201196');
});
