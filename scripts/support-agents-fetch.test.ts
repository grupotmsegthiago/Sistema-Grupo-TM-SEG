import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchAllSupportAgents,
  parseSupportAgentsPageRange,
  SUPPORT_AGENTS_PAGE_SIZE,
} from '../lib/supportAgents/fetchAllSupportAgents';
import { parseSupportAgentsResponse } from '../lib/supportAgents/parseSupportAgentsResponse';
import { canReadSupportAgents, isRestrictedClientUser } from '../lib/supportAgents/supportAgentsAccess';
import { handleSupportAgentsList } from '../lib/supportAgents/handleSupportAgentsList';
import type { SupportAgent } from '../types';

function fakeAgent(id: string): SupportAgent {
  return {
    id,
    name: `Agente ${id}`,
    cpf: '',
    phone: '11999999999',
    is_armed: false,
    is_24h: false,
    base_address: 'Barueri - SP',
    latitude: -23.5,
    longitude: -46.8,
    service_cities: 'Barueri',
    status: 'Ativo',
  };
}

describe('supportAgentsAccess', () => {
  it('bloqueia usuário cliente com clientId', () => {
    assert.equal(isRestrictedClientUser({ clientId: 'c1' }), true);
    assert.equal(canReadSupportAgents({ clientId: 'c1', role: 'cliente' }), false);
  });

  it('bloqueia permissão client_view', () => {
    assert.equal(canReadSupportAgents({ permissions: ['client_view:abc'] }), false);
  });

  it('libera usuário interno autenticado', () => {
    assert.equal(canReadSupportAgents({ role: 'operacional', permissions: ['support-network'] }), true);
    assert.equal(canReadSupportAgents({ role: 'diretoria' }), true);
  });

  it('bloqueia principal ausente', () => {
    assert.equal(canReadSupportAgents(null), false);
    assert.equal(canReadSupportAgents(undefined), false);
  });

  it('handleSupportAgentsList sem token retorna 401', async () => {
    const result = await handleSupportAgentsList('');
    assert.equal(result.status, 401);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.completeness, 'ERRO');
  });
});

describe('fetchAllSupportAgents', () => {
  it('marca NÃO EXISTE quando a consulta completa volta vazia', async () => {
    const result = await fetchAllSupportAgents({
      async range() {
        return { data: [], error: null };
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.completeness, 'NÃO EXISTE');
    assert.equal(result.total, 0);
  });

  it('pagina até esgotar e marca ENCONTRADO', async () => {
    const page1 = Array.from({ length: SUPPORT_AGENTS_PAGE_SIZE }, (_, i) => fakeAgent(`p1-${i}`));
    const page2 = [fakeAgent('p2-0'), fakeAgent('p2-1')];
    const result = await fetchAllSupportAgents({
      async range(from) {
        if (from === 0) return { data: page1, error: null };
        if (from === SUPPORT_AGENTS_PAGE_SIZE) return { data: page2, error: null };
        return { data: [], error: null };
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.completeness, 'ENCONTRADO');
    assert.equal(result.total, SUPPORT_AGENTS_PAGE_SIZE + 2);
    assert.equal(result.pages, 2);
  });

  it('não trata erro da primeira página como base vazia', async () => {
    const result = await fetchAllSupportAgents({
      async range() {
        return { data: null, error: { message: 'permission denied' } };
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.completeness, 'ERRO');
    assert.equal(result.total, 0);
    assert.match(result.error || '', /permission denied/);
  });

  it('marca CONSULTA INCOMPLETA se falhar depois de já ter páginas', async () => {
    const page1 = Array.from({ length: SUPPORT_AGENTS_PAGE_SIZE }, (_, i) => fakeAgent(`ok-${i}`));
    const result = await fetchAllSupportAgents({
      async range(from) {
        if (from === 0) return { data: page1, error: null };
        return { data: null, error: { message: 'timeout' } };
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.completeness, 'CONSULTA INCOMPLETA');
    assert.equal(result.total, SUPPORT_AGENTS_PAGE_SIZE);
  });

  it('marca CONSULTA INCOMPLETA ao atingir o limite de páginas', async () => {
    const fullPage = Array.from({ length: 2 }, (_, i) => fakeAgent(`lim-${i}`));
    const result = await fetchAllSupportAgents(
      {
        async range() {
          return { data: fullPage, error: null };
        },
      },
      { pageSize: 2, maxPages: 3 },
    );
    assert.equal(result.ok, false);
    assert.equal(result.completeness, 'CONSULTA INCOMPLETA');
    assert.equal(result.total, 6);
  });
});

describe('parseSupportAgentsResponse', () => {
  it('não trata HTML/texto como base vazia', () => {
    const result = parseSupportAgentsResponse(
      500,
      'A server error has occurred\n\nFUNCTION_INVOCATION_FAILED',
      'text/plain',
    );
    assert.equal(result.ok, false);
    assert.equal(result.completeness, 'ERRO');
    assert.match(result.error || '', /HTTP 500/);
    assert.match(result.error || '', /FUNCTION_INVOCATION_FAILED/);
  });

  it('trata corpo vazio como ERRO', () => {
    const result = parseSupportAgentsResponse(200, '', 'application/json');
    assert.equal(result.ok, false);
    assert.match(result.error || '', /vazia/);
  });

  it('repassa JSON válido', () => {
    const result = parseSupportAgentsResponse(200, '{"ok":true,"agents":[]}');
    assert.equal(result.ok, true);
    assert.deepEqual(result.agents, []);
  });
});

describe('parseSupportAgentsPageRange', () => {
  it('limita a página a 1000 registros', () => {
    const range = parseSupportAgentsPageRange('0', '5000');
    assert.equal(range.from, 0);
    assert.equal(range.to, SUPPORT_AGENTS_PAGE_SIZE - 1);
  });
});
