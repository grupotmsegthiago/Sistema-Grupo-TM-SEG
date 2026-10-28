import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildBrazilTimestampFromHm,
  formatCivilDateBR,
  formatDateBR,
  formatDateTimeBR,
  formatIsoDateFromTimestampBR,
  formatTimeBR,
} from '../lib/dateUtils.ts';

describe('ponto data civil Brasília', () => {
  it('batida noturna (22h BRT) permanece no mesmo dia civil', () => {
    const ts = buildBrazilTimestampFromHm('2026-07-28', '22:00');
    // UTC já é dia 29 — slice(0,10) quebraria; helper BRT mantém 28.
    assert.equal(ts.slice(0, 10), '2026-07-29');
    assert.equal(formatIsoDateFromTimestampBR(ts), '2026-07-28');
  });

  it('batida diurna (08h BRT) no mesmo dia UTC e BRT', () => {
    const ts = buildBrazilTimestampFromHm('2026-07-28', '08:00');
    assert.equal(formatIsoDateFromTimestampBR(ts), '2026-07-28');
  });

  it('formata yyyy-mm-dd sem deslocar para o dia anterior', () => {
    assert.equal(formatCivilDateBR('2026-07-28'), '28/07/2026');
    assert.equal(formatDateBR('2026-10-31'), '31/10/2026');
  });

  it('carimbo fica em DD/MM/AAAA HH:mm no fuso de Brasília', () => {
    const ts = buildBrazilTimestampFromHm('2026-07-28', '22:15');
    assert.equal(formatDateBR(ts), '28/07/2026');
    assert.equal(formatDateTimeBR(ts), '28/07/2026 22:15');
    assert.equal(formatTimeBR(ts), '22:15');
    assert.equal(formatDateTimeBR(ts).includes('AM'), false);
    assert.equal(formatDateTimeBR(ts).includes('PM'), false);
  });
});
