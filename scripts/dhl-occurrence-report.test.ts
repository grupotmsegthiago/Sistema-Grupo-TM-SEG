import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildOccurrenceNarrative, buildOccurrenceReportHtml } from '../lib/dhlOccurrenceReport/buildReportHtml';
import { roleCanGenerateDhlOccurrenceReport } from '../lib/services/dhlOccurrenceReportAccess';
import type { DhlOccurrenceReportData } from '../lib/dhlOccurrenceReport/types';

const baseData: DhlOccurrenceReportData = {
  missionId: 'GTM-6296',
  seNumber: '183013',
  client: 'DHL SUPPLY CHAIN (BRAZIL) LTDA',
  provider: 'COMANDO G8 - SEGURANCA PATRIMONIAL E TRANSPORTE DE VALORES LTDA',
  origin: 'JUNDIAÍ/SP',
  destination: 'RAIO 100 KM',
  destinationOperational: 'Rodovia Vice-Prefeito Hermenegildo Tonoli, 1500',
  clientVehiclePlate: 'FQO6B16',
  escortVehiclePlate: 'TXW5H42',
  agents: ['Agente 1', 'Agente 2'],
  scheduledOriginAt: '2026-07-08T14:00:00+00:00',
  marks: [],
  phasePhotos: [],
  delayMinutesAtOrigin: 86,
  factsSummary: null,
  emailLink: null,
  emailAttachmentText: null,
  directorName: 'Thiago',
  generatedAt: '2026-07-10T17:00:00.000Z',
};

test('acesso ao relatório restrito à diretoria', () => {
  assert.equal(roleCanGenerateDhlOccurrenceReport('diretoria', 'Qualquer'), true);
  assert.equal(roleCanGenerateDhlOccurrenceReport('operador', 'Thiago Moreira'), false);
  assert.equal(roleCanGenerateDhlOccurrenceReport('administrador', 'Thiago Arruda'), false);
  assert.equal(roleCanGenerateDhlOccurrenceReport('operador', 'Michelle Dias'), false);
});

test('narrativa inclui referência de e-mail quando informada', () => {
  const narrative = buildOccurrenceNarrative({
    ...baseData,
    emailLink: 'https://mail.example.com/thread/123',
    emailAttachmentText: 'Corpo do e-mail da DHL solicitando posicionamento.',
  });
  assert.match(narrative.emailReference || '', /mail\.example\.com/i);
  assert.match(narrative.emailReference || '', /Corpo do e-mail/i);
});

test('narrativa não expõe nominalmente o parceiro operacional', () => {
  const narrative = buildOccurrenceNarrative(baseData);
  const blob = JSON.stringify(narrative).toUpperCase();
  assert.doesNotMatch(blob, /COMANDO G8/);
  assert.match(narrative.rootCause, /TM SEG/i);
});

test('narrativa usa resumo customizado quando informado', () => {
  const custom = 'Resumo enviado pela diretoria com contexto de e-mails.';
  const narrative = buildOccurrenceNarrative({ ...baseData, factsSummary: custom });
  assert.equal(narrative.factsSummary, custom);
});

test('ações corretivas não citam advertência nominal ao parceiro', () => {
  const narrative = buildOccurrenceNarrative(baseData);
  const joined = narrative.correctiveActions.join(' ').toUpperCase();
  assert.doesNotMatch(joined, /COMANDO/);
  assert.doesNotMatch(joined, /ADVERTÊNCIA/);
});

test('handler standalone do Plano de Ação DHL existe na Vercel', () => {
  const vercel = fs.readFileSync('vercel.json', 'utf8');
  assert.match(vercel, /"source": "\/api\/dhl\/occurrence-report"/);
  assert.match(vercel, /"destination": "\/api\/dhl\/occurrence-report"/);
  assert.doesNotMatch(vercel, /dhl-occurrence-report/);
});

test('handler standalone carrega bundle HTML sem jspdf no preview', () => {
  const handler = fs.readFileSync('api/dhl/occurrence-report.ts', 'utf8');
  assert.match(handler, /\.\/occurrence-report-html\.cjs/);
  assert.doesNotMatch(handler, /proxyToExpress/);
  assert.doesNotMatch(handler, /server\/dhlOccurrenceReportPdf/);
});

test('HTML incorpora logo TM SEG em base64 quando informado', () => {
  const html = buildOccurrenceReportHtml(baseData, {
    logoDataUri: 'data:image/png;base64,AAAA',
  });
  assert.match(html, /data:image\/png;base64,AAAA/);
  assert.match(html, /--brand-navy: #0d3b66/);
  assert.match(html, /--brand-wine: #450a0a/);
  assert.match(html, /8\. Compromisso/);
  assert.match(html, /Evidências fotográficas/);
});

test('service imprime sem window.open (evita bloqueio de pop-up)', () => {
  const src = fs.readFileSync('lib/services/dhlOccurrenceReportService.ts', 'utf8');
  assert.match(src, /printDhlOccurrenceReportHtml/);
  assert.match(src, /dhl-occurrence-print-frame/);
  assert.doesNotMatch(src, /window\.open\('', '_blank'/);
  assert.match(src, /downloadDhlOccurrenceReportHtml/);
});

test('service usa parseJsonResponse para evitar erro de JSON inválido', () => {
  const src = fs.readFileSync('lib/services/dhlOccurrenceReportService.ts', 'utf8');
  assert.match(src, /parseJsonResponse/);
  assert.doesNotMatch(src, /await res\.json\(\)/);
});
