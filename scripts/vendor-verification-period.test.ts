import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  VENDOR_DATA_FLOOR,
  VENDOR_FILTER_STORAGE_KEY,
  defaultVendorFilterYear,
  describeVendorPeriod,
  emptyVendorFilters,
  lastDayOfMonth,
  loadVendorFilters,
  parseVendorFilters,
  parseVendorPeriod,
  resolveVendorPeriod,
  saveVendorFilters,
  shouldLoadVendorGrid,
  toCivilDate,
} from '../lib/vendorVerificationPeriod';

describe('vendorVerificationPeriod', () => {
  it('monta datas civis sem deslocar fuso', () => {
    assert.equal(toCivilDate(2026, 0, 1), '2026-01-01');
    assert.equal(toCivilDate(2026, 7, 16), '2026-08-16');
    assert.equal(lastDayOfMonth(2026, 1), 28);
    assert.equal(lastDayOfMonth(2028, 1), 29);
    assert.equal(lastDayOfMonth(2026, 7), 31);
  });

  it('resolve mês completo e quinzenas', () => {
    assert.deepEqual(resolveVendorPeriod(2026, 7, 'month'), { dateFrom: '2026-08-01', dateTo: '2026-08-31' });
    assert.deepEqual(resolveVendorPeriod(2026, 7, 1), { dateFrom: '2026-08-01', dateTo: '2026-08-15' });
    assert.deepEqual(resolveVendorPeriod(2026, 7, 2), { dateFrom: '2026-08-16', dateTo: '2026-08-31' });
    assert.deepEqual(resolveVendorPeriod(2026, 1, 2), { dateFrom: '2026-02-16', dateTo: '2026-02-28' });
    assert.deepEqual(resolveVendorPeriod(2026, 3, 'month'), { dateFrom: '2026-04-01', dateTo: '2026-04-30' });
  });

  it('descreve e reconhece o período Mês → Quinzena', () => {
    assert.equal(describeVendorPeriod('2026-08-01', '2026-08-31'), 'Agosto 2026');
    assert.equal(describeVendorPeriod('2026-08-01', '2026-08-15'), 'Agosto 2026 · 1ª Quinzena');
    assert.equal(describeVendorPeriod('2026-08-16', '2026-08-31'), 'Agosto 2026 · 2ª Quinzena');
    assert.equal(describeVendorPeriod('', ''), '');
    assert.deepEqual(parseVendorPeriod('2026-01-01', '2026-01-31'), { year: 2026, monthIndex: 0, fortnight: 'month' });
    assert.deepEqual(parseVendorPeriod('2026-01-01', '2026-01-15'), { year: 2026, monthIndex: 0, fortnight: 1 });
    assert.equal(parseVendorPeriod('2026-01-03', '2026-01-20'), null);
  });

  it('só libera a grade quando há data', () => {
    assert.equal(shouldLoadVendorGrid('', ''), false);
    assert.equal(shouldLoadVendorGrid('2026-08-01', ''), true);
    assert.equal(shouldLoadVendorGrid('', '2026-08-31'), true);
    assert.equal(shouldLoadVendorGrid('2026-08-01', '2026-08-31'), true);
    assert.equal(VENDOR_DATA_FLOOR, '2026-01-01');
  });

  it('persiste filtros para não perder a análise ao abrir overlay', () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => { mem.set(k, v); },
    };
    saveVendorFilters({
      searchTerm: 'OS-100',
      selectedProvider: 'TM SEG',
      filterStatus: 'PENDING',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-15',
      columnFilters: { status: ['Pendente'] },
      currentPage: 3,
    }, storage);
    assert.ok(mem.get(VENDOR_FILTER_STORAGE_KEY));
    const loaded = loadVendorFilters(storage);
    assert.equal(loaded.searchTerm, 'OS-100');
    assert.equal(loaded.selectedProvider, 'TM SEG');
    assert.equal(loaded.filterStatus, 'PENDING');
    assert.equal(loaded.dateFrom, '2026-08-01');
    assert.equal(loaded.dateTo, '2026-08-15');
    assert.deepEqual(loaded.columnFilters, { status: ['Pendente'] });
    assert.equal(loaded.currentPage, 3);
  });

  it('parseVendorFilters é fail-closed em JSON inválido', () => {
    assert.deepEqual(parseVendorFilters('{{{'), emptyVendorFilters());
    assert.deepEqual(parseVendorFilters(null), emptyVendorFilters());
    const parsed = parseVendorFilters('{"filterStatus":"HACK","currentPage":-2}');
    assert.equal(parsed.filterStatus, 'ALL');
    assert.equal(parsed.currentPage, 1);
  });

  it('ano padrão não fica abaixo de 2026', () => {
    assert.equal(defaultVendorFilterYear(new Date(2025, 11, 31)), 2026);
    assert.equal(defaultVendorFilterYear(new Date(2026, 7, 15)), 2026);
    assert.equal(defaultVendorFilterYear(new Date(2027, 0, 1)), 2027);
  });
});
