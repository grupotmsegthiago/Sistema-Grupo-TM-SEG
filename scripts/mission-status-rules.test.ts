import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isOdometerExemptForConclusion,
  isOdometerExemptProvider,
  isMissionPendingKm,
  isVeladaMission,
} from '../lib/missionStatusRules';

test('isVeladaMission detecta tipo Velada', () => {
  assert.equal(isVeladaMission('Velada'), true);
  assert.equal(isVeladaMission('Caracterizada'), false);
});

test('ATIVA/TM SEG isentos exceto em VELADA', () => {
  assert.equal(isOdometerExemptProvider('ATIVA SEGURANCA'), true);
  assert.equal(isOdometerExemptForConclusion('ATIVA SEGURANCA', 'Caracterizada'), true);
  assert.equal(isOdometerExemptForConclusion('ATIVA SEGURANCA', 'Velada'), false);
  assert.equal(isOdometerExemptForConclusion('TM SEG', 'Velada'), false);
});

test('isMissionPendingKm — VELADA pendente sem KM final', () => {
  assert.equal(isMissionPendingKm({ status: 'Pendente', end_km: null }), true);
  assert.equal(isMissionPendingKm({ status: 'Concluída', endKm: 0 }), true);
  assert.equal(isMissionPendingKm({ status: 'Concluída', endKm: 1200 }), false);
  assert.equal(isMissionPendingKm({ status: 'Em Viagem', end_km: null }), false);
});
