import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('Controle OS Fornecedor — overlay e período', () => {
  const vendor = readFileSync(join(ROOT, 'components/VendorVerificationControl.tsx'), 'utf8');
  const app = readFileSync(join(ROOT, 'App.tsx'), 'utf8');
  const picker = readFileSync(join(ROOT, 'components/VendorPeriodPicker.tsx'), 'utf8');

  it('não pré-preenche data (só filtra depois do Mês → Quinzena)', () => {
    assert.doesNotMatch(vendor, /useState\('2026-01-01'\)/);
    assert.match(vendor, /shouldLoadVendorGrid\(dateFrom, dateTo\)/);
    assert.match(vendor, /<VendorPeriodPicker/);
    assert.doesNotMatch(vendor, /btn-quick-mes/);
  });

  it('persiste filtros para sobreviver ao overlay de edição/auditoria', () => {
    assert.match(vendor, /loadVendorFilters\(/);
    assert.match(vendor, /saveVendorFilters\(/);
    assert.match(vendor, /from '\.\/VendorPeriodPicker'/);
  });

  it('auditoria e conferência de boletim abrem sobrepostas', () => {
    assert.match(vendor, /data-testid="modal-audit-trail"/);
    assert.match(vendor, /fixed inset-0 bg-black\/60 z-50[\s\S]*data-testid="modal-audit-trail"/);
    assert.match(vendor, /data-testid="modal-divergence"/);
    assert.match(vendor, /onOpenMission\?\.\(m\.id\)/);
  });

  it('App abre a OS em MissionFinancialModal sem trocar de tela', () => {
    assert.match(app, /case 'fin-vendor-verification': return <VendorVerificationControl/);
    assert.match(app, /onOpenMission=\{handleOpenBillingMission\}/);
    assert.match(app, /billingMissionId && billingMission &&[\s\S]*<MissionFinancialModal/);
    assert.match(app, /setBillingMissionId\(null\)/);
  });

  it('seletor tem hierarquia Mês → Quinzena e import React', () => {
    const periodLib = readFileSync(join(ROOT, 'lib/vendorVerificationPeriod.ts'), 'utf8');
    assert.match(picker, /import React, \{ useState \} from 'react'/);
    assert.match(picker, /Mês → Quinzena/);
    assert.match(picker, /btn-period-full-month/);
    assert.match(picker, /btn-period-q1/);
    assert.match(picker, /btn-period-q2/);
    assert.match(picker, /VENDOR_MONTH_NAMES\.map/);
    for (const mes of ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']) {
      assert.match(periodLib, new RegExp(mes));
    }
  });
});
