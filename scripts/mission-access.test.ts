import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hasFullMissionListAccess, isMissionClientScopeRestricted } from '../lib/missionAccess';

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

  it('Bárbara tem acesso total (libera faturamento)', () => {
    assert.equal(hasFullMissionListAccess({ role: 'Financeiro', name: 'Bárbara Silva' }), true);
    assert.equal(isMissionClientScopeRestricted({ role: 'Financeiro', name: 'Barbara Costa', permissions: ['client_view:1'] }), false);
  });

  it('wildcard * tem acesso total', () => {
    assert.equal(hasFullMissionListAccess({ role: 'Operador', permissions: ['*'] }), true);
    assert.equal(isMissionClientScopeRestricted({ role: 'Operador', permissions: ['*'] }), false);
  });

  it('comercial / portal cliente continuam restritos', () => {
    assert.equal(hasFullMissionListAccess({ role: 'Comercial', name: 'João', permissions: ['client_view:x'] }), false);
    assert.equal(isMissionClientScopeRestricted({ role: 'Comercial', permissions: ['client_view:x'] }), true);
    assert.equal(isMissionClientScopeRestricted({ role: 'Cliente', clientId: 'c1' }), true);
  });

  it('MissionTable usa hasFullMissionListAccess e não restringe admin no fetch', () => {
    const src = fs.readFileSync('components/MissionTable.tsx', 'utf8');
    assert.match(src, /from '\.\.\/lib\/missionAccess'/);
    assert.match(src, /hasFullMissionListAccess/);
    assert.match(src, /isMissionClientScopeRestricted/);
    assert.match(src, /fullListAccess/);
    assert.match(src, /!hasFullMissionListAccessFlag/);
    assert.match(src, /from 'react'/);
  });
});
