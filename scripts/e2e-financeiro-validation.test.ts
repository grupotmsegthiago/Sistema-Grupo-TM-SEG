import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import {
  assertProviderOnlyPayload,
  buildProviderOnlyMissionPayload,
  resolveProviderSaveObservation,
} from '../lib/controllerProviderScope';
import { isIntentionalBillingOverride } from '../lib/financialUtils';

describe('E2E validação — Salvar≠Aprovar, overrides e payload controller', () => {
  it('V01 Salvar não marca billing_verified_by nem billing_approved', () => {
    const source = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
    const applyStart = source.indexOf('const applyOfficialTableToDb');
    const applyEnd = source.indexOf('const handleUpdate', applyStart);
    assert.ok(applyStart >= 0 && applyEnd > applyStart);
    const applyBlock = source.slice(applyStart, applyEnd);
    assert.doesNotMatch(applyBlock, /billing_verified_by:\s*userName/);
    assert.doesNotMatch(applyBlock, /billing_approved:\s*true/);

    assert.match(
      source,
      /\/\/ Controller\/Plínio \(provider-only\) não chega aqui com approve=true\.\s*\n\s*if \(approve\) \{\s*\n\s*basePayload\.billing_verified_by = userName;/,
    );
    assert.match(
      source,
      /const isApprovedForBilling = approve\s*\?\s*\([\s\S]*?\)\s*:\s*\(mission\.billing_approved === true\);/,
    );
  });

  it('V02 Boletim consolida apenas billing_approved', () => {
    const source = fs.readFileSync('components/ClientBillingReport.tsx', 'utf8');
    const start = source.indexOf('const grandTotal = useMemo');
    const end = source.indexOf('}, [missions', start);
    assert.ok(start >= 0 && end > start);
    const block = source.slice(start, end);
    assert.match(block, /billing_approved !== true/);
    assert.match(source, /isApproved: !!m\.billing_approved/);
  });

  it('V03 Autosave não sobrescreve override intencional do controller', () => {
    assert.equal(
      isIntentionalBillingOverride('[Plínio - 09/09/2026] Ajuste de franquia do fornecedor'),
      true,
    );
    assert.equal(
      isIntentionalBillingOverride('[Sistema] Recalculado pelo sistema — alinhado ao motor'),
      false,
    );
    const source = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
    assert.match(source, /!isIntentionalBillingOverride\(mission\.cost_edit_reason\)/);
    assert.match(source, /const canResyncSaved =/);
    assert.match(source, /!costIntentional/);
  });

  it('V04 Payload provider-only com motivo é schema-safe', () => {
    const payload = buildProviderOnlyMissionPayload({
      costValue: 1850.75,
      tollValueProvider: 42.3,
      displacementValueProvider: 15,
      costEditReason: 'Revisão de custo com o fornecedor — OS GTM-9999',
      lastUpdate: '2026-09-09T12:00:00.000Z',
    });
    assert.deepEqual(assertProviderOnlyPayload(payload), []);
    assert.equal(payload.cost_value, 1850.75);
    assert.equal(payload.cost_edit_reason, 'Revisão de custo com o fornecedor — OS GTM-9999');
    assert.equal('revenue_value' in payload, false);
    assert.equal('billing_approved' in payload, false);
    assert.equal('billing_verified_by' in payload, false);

    const obs = resolveProviderSaveObservation({
      editObservation: '',
      costEditReason: String(payload.cost_edit_reason),
      providerOnlySave: true,
    });
    assert.equal(obs.ok, true);
    assert.equal(obs.observation, payload.cost_edit_reason);
  });
});
