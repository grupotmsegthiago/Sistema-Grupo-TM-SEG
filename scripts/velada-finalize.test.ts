import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  isVeladaPassThroughTerminal,
  shouldDowngradeCompletedToPending,
} from '../lib/veladaFinalize';

test('velada pass-through vale para conclusão e cancelamento', () => {
  assert.equal(isVeladaPassThroughTerminal({ odometerExempt: true, kind: 'completed' }), true);
  assert.equal(isVeladaPassThroughTerminal({ odometerExempt: true, kind: 'cancelled' }), true);
  assert.equal(isVeladaPassThroughTerminal({ odometerExempt: true, kind: 'refused' }), false);
  assert.equal(isVeladaPassThroughTerminal({ odometerExempt: false, kind: 'cancelled' }), false);
});

test('velada concluída com hora final não cai em Pendente sem KM', () => {
  assert.equal(
    shouldDowngradeCompletedToPending({
      exemptOdo: true,
      finalizeConfirmed: true,
      hasStart: true,
      hasEnd: true,
    }),
    false,
  );
});

test('velada concluída sem hora final ainda cai em Pendente', () => {
  assert.equal(
    shouldDowngradeCompletedToPending({
      exemptOdo: true,
      finalizeConfirmed: true,
      hasStart: true,
      hasEnd: false,
    }),
    true,
  );
});

test('fornecedor comum sem KM cai em Pendente', () => {
  assert.equal(
    shouldDowngradeCompletedToPending({
      exemptOdo: false,
      finalizeConfirmed: true,
      hasStart: true,
      hasEnd: false,
    }),
    true,
  );
});

test('checklist de cancelamento velada dispensa KM obrigatório', () => {
  const src = fs.readFileSync('components/UpdateMissionModal.tsx', 'utf8');
  assert.match(src, /isVeladaPassThroughTerminal/);
  assert.match(src, /shouldDowngradeCompletedToPending/);
  assert.match(src, /veladaPassThrough \? '\(opcional\)' : '\*'/);
});
