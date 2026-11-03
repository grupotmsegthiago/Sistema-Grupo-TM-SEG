import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import {
  DHL_CANCELLED_HOURS_CUTOFF,
  resolveDhlCancelledSheetWindow,
} from '../lib/billing/dhlCancelledSheetWindow.ts';
import { exportDhlFaturamentoFilled } from '../exports/dhl-faturamento-export.ts';

const samples = [
  { id: 'GTM-7787', start: '2026-09-12T15:00:00Z', end: '2026-09-13T00:39:00Z', cancel: '2026-09-13T00:40:31.512311Z', hours: 9.65, total: 1654.25 },
  { id: 'GTM-7790', start: '2026-09-12T15:00:00Z', end: '2026-09-12T23:34:45Z', cancel: '2026-09-12T23:42:10.161044Z', hours: 8 + 34 / 60, total: 1497.17 },
  { id: 'GTM-7791', start: '2026-09-12T15:00:00Z', end: '2026-09-13T00:42:00Z', cancel: '2026-09-13T01:14:31.259970Z', hours: 9.7, total: 1661.50 },
  { id: 'GTM-7793', start: '2026-09-12T15:00:00Z', end: '2026-09-13T01:00:00Z', cancel: '2026-09-13T01:40:05.177106Z', hours: 10, total: 1705 },
  { id: 'GTM-7833', start: '2026-09-14T18:00:00Z', end: '2026-09-14T21:49:00Z', cancel: '2026-09-14T21:56:30.909578Z', hours: 3 + 49 / 60, total: 808.42 },
  { id: 'GTM-7834', start: '2026-09-14T18:00:00Z', end: '2026-09-14T21:49:00Z', cancel: '2026-09-14T21:55:52.761184Z', hours: 3 + 49 / 60, total: 808.42 },
] as const;

function truncatedHours(start: string, end: string): number {
  const raw = (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000;
  return Math.floor(raw * 60) / 60;
}

function sheetTotal(hours: number, franchiseHours = 3, unitHour = 145, activation = 690): number {
  return Math.round((activation + Math.max(0, hours - franchiseHours) * unitHour) * 100) / 100;
}

test('canceladas de setembro mantêm horas e total da Auditoria de Faturamento', () => {
  for (const sample of samples) {
    const window = resolveDhlCancelledSheetWindow({
      scheduledIso: sample.start,
      currentEndIso: sample.end,
      cancelStatusAt: sample.cancel,
      endTimeHistory: [{ changedAt: sample.cancel, newValue: sample.end }],
    });
    const hours = truncatedHours(window.start, window.end);
    assert.ok(Math.abs(hours - sample.hours) < 1e-9, `${sample.id}: duração`);
    assert.equal(sheetTotal(hours), sample.total, `${sample.id}: total`);
    assert.equal(window.usesExecutedWindow, true, `${sample.id}: janela executada`);
  }
});

test('GTM-7788 usa o end_time histórico do cancelamento, não o atual após reabertura', () => {
  const cancelAt = '2026-09-13T00:48:31.629897Z';
  const window = resolveDhlCancelledSheetWindow({
    scheduledIso: '2026-09-12T15:00:00Z',
    currentEndIso: '2026-09-13T22:32:00Z',
    cancelStatusAt: cancelAt,
    endTimeHistory: [
      { changedAt: cancelAt, newValue: '2026-09-13T00:38:00Z' },
      { changedAt: '2026-09-13T04:10:23.188301Z', newValue: '2026-09-13T04:10:21Z' },
    ],
  });
  const hours = truncatedHours(window.start, window.end);
  assert.equal(window.end, '2026-09-13T00:38:00Z');
  assert.equal(hours, 9 + 38 / 60);
  assert.equal(sheetTotal(hours), 1651.83);
});

test('12:00 até 12:00 do dia seguinte representa 24 horas, não zero', () => {
  const window = resolveDhlCancelledSheetWindow({
    scheduledIso: '2026-09-20T15:00:00Z',
    currentEndIso: '2026-09-21T15:00:00Z',
    cancelStatusAt: '2026-09-21T15:05:00Z',
  });
  assert.equal(truncatedHours(window.start, window.end), 24);
  assert.equal(sheetTotal(24), 3735);
});

test('arquivo preenchido conserva datas completas e fórmulas de hora da DHL', async () => {
  const window = resolveDhlCancelledSheetWindow({
    scheduledIso: '2026-09-12T15:00:00Z',
    currentEndIso: '2026-09-13T00:39:00Z',
    cancelStatusAt: '2026-09-13T00:40:31.512311Z',
  });
  const blob = await exportDhlFaturamentoFilled({
    rows: [{
      ciaEscolta: 'TM SEG',
      periodo: 'SETEMBRO',
      operacao: 'DHL',
      cancelada: 'CANCELADA',
      descricao: 'PONTA A PONTA',
      seNumber: '188721',
      smNumber: '',
      osNumber: '7787',
      placaViatura: '',
      placaVeiculo: '',
      origem: 'JUNDIAÍ - SP',
      ufOrigem: 'SP',
      destino: 'BELO HORIZONTE - MG',
      ufDestino: 'MG',
      kmInicio: 0,
      kmFinal: 0,
      franquiaKm: 34,
      kmDeslocamento: 0,
      rawStart: window.start,
      rawEnd: window.end,
      franquiaHrDays: 3 / 24,
      vlrHoraExcedenteTab: 145,
      vlrKmExcedenteTab: 6.9,
      franquiaTabela: 690,
      pedagio: 0,
      kmTotalOverride: 0,
    }],
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await blob.arrayBuffer()));
  const row = workbook.getWorksheet('ESCOLTA')!.getRow(2);
  const startValue = row.getCell(21).value;
  const endValue = row.getCell(22).value;
  assert.ok(startValue instanceof Date);
  assert.ok(endValue instanceof Date);
  const exportedHours = (endValue.getTime() - startValue.getTime()) / 3_600_000;
  assert.ok(Math.abs(exportedHours - 9.65) < 1e-8);
  assert.deepEqual(row.getCell(23).value, { formula: 'V2-U2' });
  assert.deepEqual(row.getCell(25).value, { formula: 'IF(W2-X2<0,"00:00:00",W2-X2)' });
  assert.deepEqual(row.getCell(28).value, { formula: 'Y2*Z2*24' });
  assert.deepEqual(row.getCell(33).value, { formula: 'SUM(AB2:AF2)' });
});

test('cancelada antes da execução continua só no acionamento', () => {
  const window = resolveDhlCancelledSheetWindow({
    scheduledIso: '2026-09-20T15:00:00Z',
    currentEndIso: null,
    cancelStatusAt: '2026-09-20T14:00:00Z',
  });
  assert.equal(window.end, window.start);
  assert.equal(window.cancelledBefore, true);
  assert.equal(sheetTotal(truncatedHours(window.start, window.end)), 690);
});

test('antes de setembro preserva o comportamento anterior da planilha', () => {
  const window = resolveDhlCancelledSheetWindow({
    scheduledIso: '2026-08-31T15:00:00Z',
    currentEndIso: '2026-08-31T22:00:00Z',
    cancelStatusAt: '2026-08-31T22:05:00Z',
  });
  assert.equal(DHL_CANCELLED_HOURS_CUTOFF, '2026-09-01T00:00:00-03:00');
  assert.equal(window.end, window.start);
  assert.equal(window.usesExecutedWindow, false);
});

test('Preencher Planilha busca end_time histórico e não zera toda cancelada', () => {
  const source = fs.readFileSync('components/ClientBillingReport.tsx', 'utf8');
  const start = source.indexOf('const handleFillDhlSheet');
  const end = source.indexOf('const cellStyle', start);
  const fill = source.slice(start, end);
  assert.match(fill, /\.in\('field_name', \['status', 'end_time'\]\)/);
  assert.match(fill, /fetchAllPages<any>/);
  assert.match(fill, /count: 'exact'/);
  assert.match(fill, /resolveDhlCancelledSheetWindow/);
  assert.doesNotMatch(fill, /if \(isCancelledRow\) rowEnd = rowStart/);
});
