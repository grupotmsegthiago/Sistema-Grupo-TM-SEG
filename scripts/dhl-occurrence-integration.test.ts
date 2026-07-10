import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateDhlOccurrenceReportHtml } from '../lib/dhlOccurrenceReport/generateReportHtml';

const DEFAULT_183013_SUMMARY = `Na operação do dia 08/07/2026, a S.E. 183013 estava programada para atendimento na origem (Foxconn Jundiaí) às 11:00.
Houve atraso na chegada à origem, com necessidade de remanejamento de viatura próximo ao horário programado.`;

test('gera HTML do Plano de Ação para GTM-6296 / S.E. 183013', async () => {
  const result = await generateDhlOccurrenceReportHtml({
    missionId: 'GTM-6296',
    factsSummary: DEFAULT_183013_SUMMARY,
    emailAttachmentText: 'Corpo do e-mail da DHL solicitando posicionamento.',
    directorName: 'Diretoria — Grupo TM SEG',
    generatedAt: new Date().toISOString(),
  });

  assert.ok(result?.html, 'HTML não deve ser vazio');
  assert.match(result!.html, /10\. Aprovação/i);
  assert.match(result!.html, /5 Porquês/i);
  assert.match(result!.html, /183013/);
  assert.match(result!.html, /GTM-6296/);
  assert.match(result!.html, /Foxconn Jundiaí|atraso na chegada/i);
});

test('handler retorna 401 JSON sem token (simulação local)', async () => {
  const handler = (await import('../api/dhl/occurrence-report.ts')).default;
  let statusCode = 0;
  let body: Record<string, unknown> = {};

  const req = {
    method: 'POST',
    headers: {},
    body: { missionId: 'GTM-6296', format: 'html' },
  };
  const res = {
    headersSent: false,
    status(n: number) {
      statusCode = n;
      return this;
    },
    setHeader() {},
    json(obj: Record<string, unknown>) {
      body = obj;
    },
  };

  await handler(req, res);
  assert.equal(statusCode, 401);
  assert.equal(body.error, 'Não autorizado');
});

test('handler preview carrega bundle CJS após auth, sem import estático de lib', () => {
  const handler = fs.readFileSync('api/dhl/occurrence-report.ts', 'utf8');
  assert.match(handler, /\.\/occurrence-report-html\.cjs/);
  assert.doesNotMatch(handler, /from ['"].*lib\/dhlOccurrenceReport\/generateReportHtml['"]/);
  const htmlMod = fs.readFileSync('lib/dhlOccurrenceReport/generateReportHtml.ts', 'utf8');
  assert.doesNotMatch(htmlMod, /from ['"]jspdf['"]/);
});

test('build-server gera bundles CJS do relatório DHL em api/dhl', () => {
  const build = fs.readFileSync('build-server.mjs', 'utf8');
  assert.match(build, /api\/dhl\/occurrence-report-html\.cjs/);
  assert.match(build, /api\/dhl\/occurrence-report-pdf\.cjs/);
});

test('vercel.json inclui bundles CJS do occurrence-report', () => {
  const vercel = fs.readFileSync('vercel.json', 'utf8');
  assert.match(vercel, /"source": "\/api\/dhl\/occurrence-report"/);
  assert.match(vercel, /occurrence-report-\*\.cjs/);
  assert.doesNotMatch(vercel, /dhl-occurrence-report/);
});
