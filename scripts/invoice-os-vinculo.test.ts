import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  canUnlockPaidInvoiceLock,
  kmHorasValoresSnapshotMudou,
  osKmHorasValoresAlterados,
} from '../lib/billing/verificarTravaOS';
import {
  collectApprovedMissionIdsFromBulletin,
  parseMissionIdsFromBody,
} from '../lib/billing/vincularOSFatura';

describe('vínculo fatura ↔ OS', () => {
  it('coleta só OS aprovadas, sem duplicar', () => {
    const ids = collectApprovedMissionIdsFromBulletin([
      { id: 'GTM-1', billing_approved: true },
      { id: 'GTM-2', billing_approved: false },
      { id: 'GTM-1', billing_approved: true },
      { id: '  GTM-3  ', billing_approved: true },
      { id: '', billing_approved: true },
    ]);
    assert.deepEqual(ids, ['GTM-1', 'GTM-3']);
  });

  it('parseia missionIds do body do create-charge', () => {
    assert.deepEqual(parseMissionIdsFromBody(['GTM-10', ' GTM-11 ', '']), ['GTM-10', 'GTM-11']);
    assert.deepEqual(parseMissionIdsFromBody(null), []);
    assert.deepEqual(parseMissionIdsFromBody('GTM-1'), []);
  });

  it('detecta mudança de KM/horas no snapshot do modal operacional', () => {
    const orig = {
      startKm: '100', endKm: '200', startDate: '2026-09-01', startTime: '08:00',
      endDate: '2026-09-01', endTime: '12:00', revenueValue: '1000', costValue: '400',
      tollValue: '50', dhlDeslocamentoKm: '',
    };
    assert.equal(kmHorasValoresSnapshotMudou(orig, orig), false);
    assert.equal(kmHorasValoresSnapshotMudou(orig, { ...orig, endKm: '250' }), true);
    assert.equal(kmHorasValoresSnapshotMudou(null, orig), false);
  });

  it('detecta mudança de hodômetro vs missão persistida', () => {
    assert.equal(osKmHorasValoresAlterados(
      { start_km: 10, end_km: 20 },
      { startKm: 10, endKm: 20 },
    ), false);
    assert.equal(osKmHorasValoresAlterados(
      { start_km: 10, end_km: 20 },
      { startKm: 10, endKm: 40 },
    ), true);
  });

  it('libera desbloqueio só para Diretoria/Admin/CEO', () => {
    assert.equal(canUnlockPaidInvoiceLock({ role: 'diretoria', name: 'Daniel' }), true);
    assert.equal(canUnlockPaidInvoiceLock({ role: 'administrador', name: 'Bárbara' }), true);
    assert.equal(canUnlockPaidInvoiceLock({ role: 'operador', name: 'Beatriz' }), false);
    assert.equal(canUnlockPaidInvoiceLock({ role: 'controller', name: 'Plinio' }), false);
  });
});

describe('vínculo fatura ↔ OS — wiring', () => {
  it('create-charge encaminha missionIds para persistência', () => {
    const core = fs.readFileSync('lib/asaasCreateChargeCore.ts', 'utf8');
    assert.match(core, /parseMissionIdsFromBody/);
    assert.match(core, /missionIds: missionIds\.length \? missionIds : undefined/);
    const persist = fs.readFileSync('lib/persistAsaasChargeInvoice.ts', 'utf8');
    assert.match(persist, /vincularMissionsAFatura/);
    assert.match(persist, /missionIds\?:/);
  });

  it('boletim envia missionIds na emissão e grava vínculo no autosave', () => {
    const page = fs.readFileSync('components/ClientBillingReport.tsx', 'utf8');
    assert.match(page, /missionIds: bulletinMissionIds/);
    assert.match(page, /vincularMissionsAFatura/);
    assert.match(page, /collectApprovedMissionIdsFromBulletin/);
  });

  it('modais consultam a trava PAGA e exigem justificativa da Diretoria', () => {
    const fin = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
    const upd = fs.readFileSync('components/UpdateMissionModal.tsx', 'utf8');
    assert.match(fin, /verificarTravaSegurancaOS/);
    assert.match(fin, /registrarDesbloqueioAjusteOS/);
    assert.match(fin, /isPaidInvoiceEffectivelyLocked/);
    assert.match(upd, /verificarTravaSegurancaOS/);
    assert.match(upd, /kmHorasValoresSnapshotMudou/);
    assert.match(upd, /PaidInvoiceLockPanel/);
    const helper = fs.readFileSync('lib/billing/verificarTravaOS.ts', 'utf8');
    assert.match(helper, /BILLING_PAID_UNLOCK/);
    assert.doesNotMatch(helper, /from '\.\.\/supabaseClient'/);
  });

  it('migration local existe e não altera missions/financial_invoices', () => {
    const sql = fs.readFileSync('migrations/2026_09_09_financial_invoice_missions.sql', 'utf8');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.financial_invoice_missions/);
    assert.doesNotMatch(sql, /ALTER TABLE public\.missions /);
    assert.doesNotMatch(sql, /ALTER TABLE public\.financial_invoices /);
    assert.match(sql, /TO anon, authenticated/);
  });
});
