import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  listSystemSesMissingFromSheet,
  onlyDigitsSe,
  sortSystemSesForDhlSheet,
} from '../lib/billing/dhlSheetSeCoverage.ts';

describe('Planilha DHL — cobertura de SE do sistema', () => {
  it('T01 — SE FINALIZADA do sistema entra mesmo omitida na planilha do cliente', () => {
    const uploaded = [
      '186303', '186317', '186384', '186390', '186440',
      '186892', '187036', '187512', '187651',
    ];
    const system = [
      '187374', '187654', '187673', '187689', '187690',
    ];
    assert.deepEqual(
      listSystemSesMissingFromSheet(uploaded, system),
      ['187374', '187654', '187673', '187689', '187690'],
    );
  });

  it('T02 — prefixo SE- não conta como outra SE', () => {
    assert.equal(onlyDigitsSe('SE-187374'), '187374');
    assert.deepEqual(
      listSystemSesMissingFromSheet(['SE-187374'], ['187374']),
      [],
    );
  });

  it('T03 — se a planilha já tem todas as SE do período, não há omissão', () => {
    assert.deepEqual(
      listSystemSesMissingFromSheet(['187374', '187654'], ['187374', '187654']),
      [],
    );
  });

  it('T04 — Preencher Planilha usa o universo do boletim e anexa SE omitidas', () => {
    const src = fs.readFileSync('components/ClientBillingReport.tsx', 'utf8');
    const fillStart = src.indexOf('const handleFillDhlSheet');
    const fillEnd = src.indexOf('const cellStyle', fillStart);
    const fill = src.slice(fillStart, fillEnd);
    assert.match(fill, /fetchBillingMissionUniverse/);
    assert.match(fill, /listSystemSesMissingFromSheet/);
    assert.match(fill, /sortSystemSesForDhlSheet/);
    assert.match(fill, /omittedFromSheet/);
    assert.doesNotMatch(fill, /\.in\('dhl_se_number'/);
  });

  it('T05 — ordem da planilha segue a data da OS', () => {
    const bySe = new Map([
      ['187690', { start_time: '2026-08-30T16:30:00+00:00' }],
      ['187374', { start_time: '2026-08-26T17:00:00+00:00' }],
      ['187654', { start_time: '2026-08-29T12:00:00+00:00' }],
    ]);
    assert.deepEqual(sortSystemSesForDhlSheet(bySe), ['187374', '187654', '187690']);
  });
});
