import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildOccurrenceNarrative } from '../lib/dhlOccurrenceReport/buildReportHtml';
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
  const handler = fs.readFileSync('api/dhl-occurrence-report.ts', 'utf8');
  assert.doesNotMatch(handler, /proxyToExpress/);
  assert.match(handler, /generateDhlOccurrenceReportHtml/);
  const vercel = fs.readFileSync('vercel.json', 'utf8');
  assert.match(vercel, /api\/dhl-occurrence-report\.ts/);
  assert.match(vercel, /"source": "\/api\/dhl\/occurrence-report"/);
});

test('service usa parseJsonResponse para evitar erro de JSON inválido', () => {
  const src = fs.readFileSync('lib/services/dhlOccurrenceReportService.ts', 'utf8');
  assert.match(src, /parseJsonResponse/);
  assert.doesNotMatch(src, /await res\.json\(\)/);
});
