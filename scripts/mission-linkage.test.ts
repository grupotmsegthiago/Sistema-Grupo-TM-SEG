import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChildrenByParentId,
  collectLinkedFamilyIds,
  isLinkedChildMission,
  missingLinkedMissionIds,
} from '../lib/missionLinkage';

describe('missionLinkage — OS vinculada independente do cliente', () => {
  const pool = [
    { id: 'GTM-100', client: 'CLIENTE A', is_same_os: false, parent_mission_id: null },
    { id: 'GTM-101', client: 'CLIENTE B', is_same_os: true, parent_mission_id: 'GTM-100' },
    { id: 'GTM-102', client: 'CLIENTE C', is_same_os: true, parent_mission_id: 'GTM-100' },
    { id: 'GTM-200', client: 'OUTRO', is_same_os: false, parent_mission_id: null },
  ];

  it('isLinkedChildMission reconhece filha mesmo com cliente diferente', () => {
    assert.equal(isLinkedChildMission(pool[1]), true);
    assert.equal(isLinkedChildMission(pool[0]), false);
  });

  it('buildChildrenByParentId agrupa filhas de qualquer cliente', () => {
    const map = buildChildrenByParentId(pool);
    const kids = map.get('GTM-100') || [];
    assert.equal(kids.length, 2);
    assert.deepEqual(
      kids.map((k) => k.client).sort(),
      ['CLIENTE B', 'CLIENTE C'],
    );
  });

  it('collectLinkedFamilyIds inclui mãe e filhas a partir de qualquer âncora', () => {
    const fromChild = collectLinkedFamilyIds(['GTM-101'], pool);
    assert.equal(fromChild.has('GTM-100'), true);
    assert.equal(fromChild.has('GTM-101'), true);
    assert.equal(fromChild.has('GTM-102'), true);
    assert.equal(fromChild.has('GTM-200'), false);

    const fromMother = collectLinkedFamilyIds(['GTM-100'], pool);
    assert.equal(fromMother.has('GTM-101'), true);
    assert.equal(fromMother.has('GTM-102'), true);
  });

  it('missingLinkedMissionIds aponta mãe/filhas ausentes do pool', () => {
    const partial = [pool[1]]; // só filha B, sem mãe nem irmã C
    const miss = missingLinkedMissionIds(partial, ['GTM-101']);
    assert.ok(miss.missingParentIds.includes('GTM-100'));
    assert.ok(miss.missingChildParentIds.includes('GTM-100'));
  });
});
