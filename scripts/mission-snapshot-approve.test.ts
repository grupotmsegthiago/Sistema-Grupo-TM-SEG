import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import {
  buildMinimalBillingSnapshot,
  hasUsableBillingSnapshot,
  refusedOsClearSnapshotFields,
  retryPayloadForSnapshotConstraint,
  shouldWriteBillingSnapshot,
} from '../lib/missionSnapshot.ts';
import { datetimeLocalToIsoBR, toDatetimeLocalValueBR } from '../lib/dateUtils.ts';

describe('Snapshot de faturamento — Aprovar zerada / recusada', () => {
  it('snapshot vazio (null, {}, string) não é utilizável', () => {
    assert.equal(hasUsableBillingSnapshot(null), false);
    assert.equal(hasUsableBillingSnapshot(undefined), false);
    assert.equal(hasUsableBillingSnapshot(''), false);
    assert.equal(hasUsableBillingSnapshot('{}'), false);
    assert.equal(hasUsableBillingSnapshot({}), false);
    assert.equal(hasUsableBillingSnapshot({ revenueServiceOnly: 0, totalGeral: 0 }), true);
  });

  it('Aprovar financeiro com snapshot nulo (caso Giovanna / GTM-7186) deve gravar snapshot', () => {
    assert.equal(
      shouldWriteBillingSnapshot({
        approve: true,
        billingApproved: true,
        existingSnapshot: null,
      }),
      true,
    );
    assert.equal(
      shouldWriteBillingSnapshot({
        approve: true,
        billingApproved: true,
        existingSnapshot: null,
      }),
      true,
    );
  });

  it('carimbo snapshot_approved_by antigo NÃO impede regravação se snapshot_data está vazio', () => {
    assert.equal(
      shouldWriteBillingSnapshot({
        approve: true,
        billingApproved: true,
        existingSnapshot: null,
      }),
      true,
    );
  });

  it('Salvar (não aprovar) não grava snapshot', () => {
    assert.equal(
      shouldWriteBillingSnapshot({
        approve: false,
        billingApproved: false,
        existingSnapshot: null,
      }),
      false,
    );
  });

  it('reaprovação com snapshot válido não força rewrite', () => {
    assert.equal(
      shouldWriteBillingSnapshot({
        approve: true,
        billingApproved: true,
        existingSnapshot: { totalGeral: 100, revenueServiceOnly: 100 },
      }),
      false,
    );
  });

  it('retry da constraint NUNCA remove snapshot se billing_approved=true', () => {
    const retried = retryPayloadForSnapshotConstraint({
      payload: {
        billing_approved: true,
        revenue_value: 0,
        cost_value: 0,
      },
      billingApproved: true,
      userName: 'Giovanna Marsili',
      minimalSnapshot: buildMinimalBillingSnapshot({
        revenueServiceOnly: 0,
        costServiceOnly: 0,
        tollVal: 0,
      }),
      nowIso: '2026-09-09T13:00:00.000Z',
    });
    assert.equal(retried.billing_approved, true);
    assert.ok(hasUsableBillingSnapshot(retried.snapshot_data));
    assert.equal(retried.snapshot_approved_by, 'Giovanna Marsili');
  });

  it('zerar recusada limpa snapshot_approved_by junto com snapshot_data', () => {
    const cleared = refusedOsClearSnapshotFields();
    assert.equal(cleared.snapshot_data, null);
    assert.equal(cleared.snapshot_approved_by, null);
    assert.equal(cleared.snapshot_approved_at, null);
    assert.equal(cleared.billing_approved, false);
  });
});

describe('datetime-local Brasília', () => {
  it('ida e volta 10:36 BRT não vira horário local ambíguo', () => {
    const iso = datetimeLocalToIsoBR('2026-09-09T10:36');
    assert.ok(iso);
    assert.equal(toDatetimeLocalValueBR(iso), '2026-09-09T10:36');
  });
});

describe('Modal financeiro usa as regras de snapshot e persiste ops no Salvar', () => {
  const source = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');

  it('handleUpdate decide snapshot pela constraint, não só por snapshot_approved_by', () => {
    assert.match(source, /shouldWriteBillingSnapshot\(/);
    assert.doesNotMatch(
      source,
      /const shouldSnapshot = approve && canReleaseBilling && !mission\.snapshot_approved_by/,
    );
  });

  it('fallback da constraint não apaga snapshot com billing aprovado', () => {
    assert.match(source, /retryPayloadForSnapshotConstraint\(/);
  });

  it('Salvar do rodapé inclui horário/KM/rota em edição', () => {
    assert.match(source, /isEditingOpsData/);
    const handleStart = source.indexOf('const handleUpdate = async');
    const handleEnd = source.indexOf('const filteredProviderTables', handleStart);
    const block = source.slice(handleStart, handleEnd);
    assert.match(block, /isEditingOpsData/);
    assert.match(block, /isEditingRoute/);
    assert.match(block, /datetimeLocalToIsoBR/);
  });

  it('Recalcular fornecedor não apaga o lock de receita do cliente', () => {
    const recalcStart = source.indexOf('recalcProvPayload.cost_edit_reason');
    const recalcBlock = source.slice(recalcStart, recalcStart + 800);
    assert.doesNotMatch(recalcBlock, /recalcProvPayload\.revenue_edit_reason = ''/);
  });
});

describe('OS Recusada limpa carimbo de snapshot', () => {
  it('UpdateMissionModal zera snapshot_approved_by ao recusar', () => {
    const source = fs.readFileSync('components/UpdateMissionModal.tsx', 'utf8');
    assert.match(source, /refusedOsClearSnapshotFields\(/);
  });
});
