import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateDhlOccurrenceReportHtml } from '../lib/dhlOccurrenceReport/generateReportHtml';

const DEFAULT_183013_SUMMARY = `Na operação do dia 08/07/2026, a S.E. 183013 estava programada para atendimento na origem (Foxconn Jundiaí) às 11:00.
Houve atraso na chegada à origem, com necessidade de remanejamento de viatura próximo ao horário programado.`;

test('gera HTML do Plano de Ação para GTM-6296 / S.E. 183013', async () => {
  const html = await generateDhlOccurrenceReportHtml({
    missionId: 'GTM-6296',
    factsSummary: DEFAULT_183013_SUMMARY,
    emailAttachmentText: 'Corpo do e-mail da DHL solicitando posicionamento.',
    directorName: 'Diretoria — Grupo TM SEG',
    generatedAt: new Date().toISOString(),
  });

  assert.ok(html, 'HTML não deve ser vazio');
  assert.match(html!, /Plano de Ação/i);
  assert.match(html!, /183013/);
  assert.match(html!, /GTM-6296/);
  assert.match(html!, /Foxconn Jundiaí|atraso na chegada/i);
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

test('handler preview usa import estático de generateReportHtml sem jspdf', () => {
  const handler = fs.readFileSync('api/dhl/occurrence-report.ts', 'utf8');
  assert.match(handler, /from ['"].*generateReportHtml['"]/);
  assert.doesNotMatch(handler, /await import\([\s\S]*generateReportHtml/);
  const htmlMod = fs.readFileSync('lib/dhlOccurrenceReport/generateReportHtml.ts', 'utf8');
  assert.doesNotMatch(htmlMod, /from ['"]jspdf['"]/);
});

test('vercel.json não usa bloco functions para occurrence-report (evita falha de deploy)', () => {
  const vercel = fs.readFileSync('vercel.json', 'utf8');
  assert.match(vercel, /"source": "\/api\/dhl\/occurrence-report"/);
  assert.doesNotMatch(vercel, /api\/dhl\/occurrence-report\.ts[\s\S]*maxDuration/);
  assert.doesNotMatch(vercel, /dhl-occurrence-report/);
});
