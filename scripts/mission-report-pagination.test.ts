import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/** Espelha a lógica de página do Relatório de OS (10 por página). */
const REPORT_PAGE_SIZE = 10;

function paginateIds(ids: string[], page: number) {
  const totalPages = Math.max(1, Math.ceil(ids.length / REPORT_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * REPORT_PAGE_SIZE;
  return {
    totalPages,
    safePage,
    pageIds: ids.slice(start, start + REPORT_PAGE_SIZE),
    rowStart: ids.length === 0 ? 0 : start + 1,
    rowEnd: Math.min(safePage * REPORT_PAGE_SIZE, ids.length),
  };
}

describe('Relatório de OS — auditoria só na página', () => {
  it('lote de auditoria tem no máximo PAGE_SIZE ids', () => {
    const ids = Array.from({ length: 115 }, (_, i) => `GTM-${i + 1}`);
    const page = 1;
    const start = (page - 1) * REPORT_PAGE_SIZE;
    const pageIds = ids.slice(start, start + REPORT_PAGE_SIZE);
    assert.equal(pageIds.length, 10);
    assert.ok(pageIds.length <= REPORT_PAGE_SIZE);
    assert.notEqual(pageIds.length, ids.length);
  });
});

describe('Relatório de OS — paginação 10/página', () => {
  it('retorna no máximo 10 itens por página', () => {
    const ids = Array.from({ length: 25 }, (_, i) => `GTM-${i + 1}`);
    const p1 = paginateIds(ids, 1);
    assert.equal(p1.pageIds.length, 10);
    assert.deepEqual(p1.pageIds, ids.slice(0, 10));
    assert.equal(p1.totalPages, 3);
    assert.equal(p1.rowStart, 1);
    assert.equal(p1.rowEnd, 10);

    const p2 = paginateIds(ids, 2);
    assert.deepEqual(p2.pageIds, ids.slice(10, 20));
    assert.equal(p2.rowStart, 11);
    assert.equal(p2.rowEnd, 20);

    const p3 = paginateIds(ids, 3);
    assert.equal(p3.pageIds.length, 5);
    assert.equal(p3.rowStart, 21);
    assert.equal(p3.rowEnd, 25);
  });

  it('corrige página acima do total', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `OS-${i}`);
    const p = paginateIds(ids, 99);
    assert.equal(p.safePage, 2);
    assert.equal(p.pageIds.length, 2);
  });

  it('lista vazia tem 1 página e slice vazio', () => {
    const p = paginateIds([], 1);
    assert.equal(p.totalPages, 1);
    assert.equal(p.pageIds.length, 0);
    assert.equal(p.rowStart, 0);
    assert.equal(p.rowEnd, 0);
  });
});
