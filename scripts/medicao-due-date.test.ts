import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addCalendarDaysIso,
  computeMedicaoDueDate,
  isCevaClientName,
  medicaoDueDaysForClient,
} from '../lib/billing/medicaoDueDate';

describe('medicaoDueDate', () => {
  it('detecta CEVA', () => {
    assert.equal(isCevaClientName('CEVA LOGISTICS LTDA'), true);
    assert.equal(isCevaClientName('Prestex'), false);
  });

  it('CEVA = 70 dias, demais = 30', () => {
    assert.equal(medicaoDueDaysForClient('CEVA LOGISTICS LTDA'), 70);
    assert.equal(medicaoDueDaysForClient('PRESTEX'), 30);
  });

  it('soma dias no calendário', () => {
    assert.equal(addCalendarDaysIso('2026-06-01', 30), '2026-07-01');
    assert.equal(addCalendarDaysIso('2026-06-01', 70), '2026-08-10');
  });

  it('computeMedicaoDueDate aplica regra CEVA', () => {
    const ceva = computeMedicaoDueDate({ clientName: 'CEVA LOGISTICS', fromDateIso: '2026-06-01' });
    assert.equal(ceva.days, 70);
    assert.equal(ceva.dueDate, '2026-08-10');
    const other = computeMedicaoDueDate({ clientName: 'PRESTEX', fromDateIso: '2026-06-01' });
    assert.equal(other.days, 30);
    assert.equal(other.dueDate, '2026-07-01');
  });
});
