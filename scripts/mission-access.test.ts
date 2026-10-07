import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { financeiroConsultaOsSobDemanda, hasFullMissionListAccess, isMissionClientScopeRestricted } from '../lib/missionAccess';
import { carregarContextoOsConsultadas } from '../lib/missionTableSearch';

describe('missionAccess — lista completa para administrador / Bárbara', () => {
  it('Administrador tem acesso total mesmo com client_view no perfil', () => {
    const user = {
      role: 'Administrador',
      name: 'Operador X',
      permissions: ['client_view:abc', 'missions'],
    };
    assert.equal(hasFullMissionListAccess(user), true);
    assert.equal(isMissionClientScopeRestricted(user), false);
  });

  it('Bárbara e Giovanna têm acesso total (libera faturamento)', () => {
    assert.equal(hasFullMissionListAccess({ role: 'Financeiro', name: 'Bárbara Silva' }), true);
    assert.equal(isMissionClientScopeRestricted({ role: 'Financeiro', name: 'Barbara Costa', permissions: ['client_view:1'] }), false);
    assert.equal(hasFullMissionListAccess({ role: 'Financeiro', name: 'Giovanna Marsili' }), true);
    assert.equal(isMissionClientScopeRestricted({ role: 'Financeiro', name: 'Giovanna Marsili', permissions: ['client_view:1'] }), false);
  });

  it('wildcard * tem acesso total', () => {
    assert.equal(hasFullMissionListAccess({ role: 'Operador', permissions: ['*'] }), true);
    assert.equal(isMissionClientScopeRestricted({ role: 'Operador', permissions: ['*'] }), false);
  });

  it('comercial / portal cliente continuam restritos', () => {
    assert.equal(hasFullMissionListAccess({ role: 'Comercial', name: 'João', permissions: ['client_view:x'] }), false);
    assert.equal(isMissionClientScopeRestricted({ role: 'Comercial', permissions: ['client_view:x'] }), true);
    assert.equal(isMissionClientScopeRestricted({ role: 'Comercial', name: 'Miguel Mota' }), true);
    assert.equal(isMissionClientScopeRestricted({ role: 'Cliente', clientId: 'c1' }), true);
  });

  it('perfil Financeiro consulta OS sob demanda, sem baixar o quadro', () => {
    assert.equal(financeiroConsultaOsSobDemanda({ role: 'Financeiro', name: 'Ana Souza' }), true);
    assert.equal(financeiroConsultaOsSobDemanda({ role: 'financeiro', name: 'Ana Souza' }), true);
    assert.equal(financeiroConsultaOsSobDemanda({ role: 'Financeiro', name: 'Giovanna Marsili' }), true);
    assert.equal(financeiroConsultaOsSobDemanda({ role: 'Financeiro', name: 'Bárbara Silva' }), true);
    assert.equal(hasFullMissionListAccess({ role: 'Financeiro', name: 'Giovanna Marsili' }), true);
    assert.equal(financeiroConsultaOsSobDemanda({ role: 'Administrador', name: 'Bárbara Silva' }), false);
    assert.equal(financeiroConsultaOsSobDemanda({ role: 'Operador', name: 'Cristiane' }), false);
    assert.equal(financeiroConsultaOsSobDemanda({ role: 'Diretoria', name: 'Thiago Moreira' }), false);
    assert.equal(financeiroConsultaOsSobDemanda({ role: 'Financeiro', permissions: ['*'] }), false);
    assert.equal(financeiroConsultaOsSobDemanda(null), false);
  });

  it('contexto da consulta não pagina a tabela missions', async () => {
    const calls: string[] = [];
    const supabase = {
      from(table: string) {
        const builder: any = {
          select() { return builder; },
          in(_column: string, values: unknown[]) {
            calls.push(`${table}:${values.length}`);
            return Promise.resolve({ data: [], error: null });
          },
        };
        return builder;
      },
    };
    const vazio = await carregarContextoOsConsultadas(supabase as any, []);
    assert.deepEqual(calls, []);
    assert.deepEqual(vazio.clients, []);
    await carregarContextoOsConsultadas(supabase as any, [{
      id: 'GTM-1',
      vehicle_id: 'v1',
      client_vehicle: 'c1',
      client: 'CEVA',
      provider: 'PADLOCK',
      agent1: 'João',
      agent2: '---',
    }]);
    assert.deepEqual(calls.sort(), [
      'agents:1',
      'client_price_tables:1',
      'client_vehicles:1',
      'clients:1',
      'provider_cost_tables:1',
      'providers:1',
      'vehicles:1',
    ]);
    assert.equal(calls.some((call) => call.startsWith('missions')), false);
  });

  it('MissionTable usa hasFullMissionListAccess e não restringe admin no fetch', () => {
    const src = fs.readFileSync('components/MissionTable.tsx', 'utf8');
    assert.match(src, /from '\.\.\/lib\/missionAccess'/);
    assert.match(src, /hasFullMissionListAccess/);
    assert.match(src, /isMissionClientScopeRestricted/);
    assert.match(src, /fullListAccess/);
    assert.match(src, /!hasFullMissionListAccessFlag/);
    assert.match(src, /financeiroConsultaOsSobDemanda/);
    assert.match(src, /carregarContextoOsConsultadas/);
    assert.match(src, /não insere OS fora da consulta/);
    assert.match(src, /Consulte a OS no filtro do painel para carregar/);
    const marker = src.indexOf('Perfil Financeiro não baixa o quadro');
    const tables = src.indexOf("from('client_price_tables')");
    assert.ok(marker > 0 && tables > marker);
    assert.match(src.slice(marker, tables), /return true/);
    assert.match(src, /from 'react'/);
    assert.match(src, /carregarNomesClientesDoComercial/);
    assert.match(src, /responsavel_comercial_id|carteira\.nomes/);
    const report = fs.readFileSync('components/MissionReportPage.tsx', 'utf8');
    assert.match(report, /carregarNomesClientesDoComercial/);
    assert.match(report, /from 'react'/);
  });
});
