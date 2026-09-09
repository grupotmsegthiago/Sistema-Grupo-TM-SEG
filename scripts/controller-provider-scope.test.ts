import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import {
  assertProviderOnlyPayload,
  buildProviderOnlyMissionPayload,
  resolveProviderSaveObservation,
} from '../lib/controllerProviderScope';
import {
  isControllerRole,
  isProviderOnlyControllerUser,
  isRestrictedPlinioUser,
} from '../lib/plinioMissionRestrictions';

describe('Escopo controller/fornecedor', () => {
  it('T01 identifica role controller e Plínio homologado', () => {
    assert.equal(isControllerRole('Controller'), true);
    assert.equal(isControllerRole('financeiro'), false);
    assert.equal(isRestrictedPlinioUser({ id: 9 }), true);
    assert.equal(isProviderOnlyControllerUser({ role: 'controller' }), true);
    assert.equal(isProviderOnlyControllerUser({ email: 'plinio@grupotmseg.com.br' }), true);
    assert.equal(isProviderOnlyControllerUser({ role: 'operacional', name: 'Outro' }), false);
  });

  it('T02 payload provider-only contém custo+motivo e exclui lado cliente', () => {
    const payload = buildProviderOnlyMissionPayload({
      costValue: 1500.5,
      tollValueProvider: 40,
      displacementValueProvider: 10,
      costEditReason: 'Ajuste de franquia do fornecedor',
      lastUpdate: '2026-09-09T12:00:00.000Z',
    });
    assert.equal(payload.cost_value, 1500.5);
    assert.equal(payload.toll_value_provider, 40);
    assert.equal(payload.displacement_value_provider, 10);
    assert.equal(payload.cost_edit_reason, 'Ajuste de franquia do fornecedor');
    assert.equal(payload.last_update, '2026-09-09T12:00:00.000Z');
    assert.deepEqual(assertProviderOnlyPayload(payload), []);
    assert.equal('revenue_value' in payload, false);
    assert.equal('billing_approved' in payload, false);
    assert.equal('billing_verified_by' in payload, false);
  });

  it('T03 não envia cost_edit_reason vazio (evita constraint)', () => {
    const empty = buildProviderOnlyMissionPayload({
      costValue: 100,
      tollValueProvider: 0,
      displacementValueProvider: 0,
      costEditReason: '   ',
    });
    assert.equal('cost_edit_reason' in empty, false);
  });

  it('T04 motivo do fornecedor satisfaz observação pós-aprovação', () => {
    const blocked = resolveProviderSaveObservation({
      editObservation: '',
      costEditReason: '',
      providerOnlySave: true,
    });
    assert.equal(blocked.ok, false);

    const viaCost = resolveProviderSaveObservation({
      editObservation: '',
      costEditReason: 'Revisão de custo com o fornecedor',
      providerOnlySave: true,
    });
    assert.equal(viaCost.ok, true);
    assert.equal(viaCost.observation, 'Revisão de custo com o fornecedor');

    const nonProvider = resolveProviderSaveObservation({
      editObservation: '',
      costEditReason: 'motivo',
      providerOnlySave: false,
    });
    assert.equal(nonProvider.ok, false);
  });

  it('T05 modal usa helpers e bloqueia aprovação/cliente para provider-only', () => {
    const source = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
    assert.match(source, /isProviderOnlyControllerUser/);
    assert.match(source, /buildProviderOnlyMissionPayload\(/);
    assert.match(source, /resolveProviderSaveObservation\(/);
    assert.match(source, /canSaveProviderAdjustments = isProviderOnlyUser/);
    assert.match(source, /providerFinanceInputLocked = isEffectivelyLocked && !isProviderOnlyUser/);
    assert.match(source, /if \(isProviderOnlyUser && approve\)/);
    assert.match(source, /disabled=\{isProviderOnlyUser \|\| isUpdating/);
    assert.doesNotMatch(source, /canSaveProviderAdjustments = isPlinio/);
  });

  it('T06 UpdateMissionModal bloqueia pedágio de cliente para controller', () => {
    const source = fs.readFileSync('components/UpdateMissionModal.tsx', 'utf8');
    assert.match(source, /isProviderOnlyControllerUser\(currentUser\)/);
    assert.match(source, /if \(isProviderOnlyUser\) \{\s*showNotification\('Sem Permissão'/);
  });
});
