import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildOccurrenceNarrative, buildOccurrenceReportHtml } from '../lib/dhlOccurrenceReport/buildReportHtml';
import { parseEmailThreadInput, decodeQuotedPrintable, decodeMimeWords } from '../lib/dhlOccurrenceReport/parseEmailThread';
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
  missionCreatedAt: '2026-07-07T23:43:00.000Z',
  clientVehicleModel: 'P 360 A4X2',
  escortVehicleModel: 'MOBI LIKE',
  scheduledMissionAt: '2026-07-08T13:29:00.000Z',
  odometerStartKm: '64.958 km',
  odometerEndKm: '64.968 km',
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

test('narrativa do PDF resumido não expõe nominalmente o parceiro', () => {
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

test('HTML completo inclui seções 1 a 10 do modelo DHL', () => {
  const html = buildOccurrenceReportHtml(baseData, {
    logoDataUri: 'data:image/png;base64,AAAA',
  });
  assert.match(html, /1\. Objetivo do documento/i);
  assert.match(html, /5 Porquês/i);
  assert.match(html, /Ações de contenção/i);
  assert.match(html, /Indicadores de acompanhamento/i);
  assert.match(html, /10\. Aprovação/i);
  assert.match(html, /PA-DHL-183013/);
});

test('parser de e-mail remove ruído MIME e extrai mensagens Outlook', () => {
  const sample = `De:
ANTONIA CALINE (DHL)
Para:
Thiago | Grupo TM SEG
Data:
qua., 8 de jul. de 2026, 15:21

Senhores, boa tarde!
Venho formalizar o relato de uma ocorrência.`;
  const messages = parseEmailThreadInput(sample);
  assert.equal(messages.length, 1);
  assert.match(messages[0].body, /Senhores, boa tarde/);
  assert.doesNotMatch(messages[0].body, /ARC-Seal/);
});

test('parser extrai thread Outlook com De/Para/Cc/Data em linhas separadas', () => {
  const sample = `De:
Para:
Cc:
Data:
RES: Notificação de Ocorrência – SE 183013
ANTONIA CALINE DUARTE DA SILVA (DHL Supply Chain)
antoniacaline.duartedasilva@dhl.com
Thiago | Grupo TM SEG thiago@grupotmseg.com.br
Patrick Carneiro Almeida (DHL Supply Chain) Patrick.CarneiroA@dhl.com
qua., 8 de jul. de 2026, 15:21
Senhores, boa tarde!
Venho formalizar o relato.

De:
Para:
Cc:
Data:
Patrick Carneiro Almeida (DHL Supply Chain) Patrick.CarneiroA@dhl.com
Thiago | Grupo TM SEG thiago@grupotmseg.com.br
coordenacao.GR coordenacao.GR@dhl.com
qua., 8 de jul. de 2026, 15:26
Boa tarde!
Quais serão as ações corretivas?`;

  const messages = parseEmailThreadInput(sample);
  assert.equal(messages.length, 2);
  assert.match(messages[0].from, /ANTONIA CALINE/i);
  assert.match(messages[0].from, /antoniacaline/i);
  assert.match(messages[0].to, /Thiago/i);
  assert.match(messages[0].subject, /RES:/i);
  assert.match(messages[0].date, /15:21/);
  assert.match(messages[1].body, /ações corretivas/i);
});

test('parser decodifica quoted-printable e remove HTML MIME do corpo', () => {
  const sample = `From: Thiago <thiago@grupotmseg.com.br>
To: Antonia <antonia@dhl.com>
Subject: =?utf-8?Q?Notifica=C3=A7=C3=A3o?=
Date: Wed, 8 Jul 2026 15:21:00 -0300
Content-Type: multipart/alternative; boundary="abc"

--abc
Content-Type: text/plain; charset="utf-8"
Content-Transfer-Encoding: quoted-printable

Senhores, boa tarde!
Venho formalizar o relato de uma ocorr=EAncia.

--abc
Content-Type: text/html; charset="utf-8"

<html><body><p>HTML ignorado</p></body></html>
--abc--`;

  const messages = parseEmailThreadInput(sample);
  assert.equal(messages.length, 1);
  assert.match(messages[0].body, /Senhores, boa tarde/);
  assert.match(messages[0].body, /ocorrência/i);
  assert.doesNotMatch(messages[0].body, /<html/i);
  assert.doesNotMatch(messages[0].body, /=EAncia/);
});

test('decodeQuotedPrintable decodifica acentos', () => {
  assert.match(decodeQuotedPrintable('apura=C3=A7=C3=A3o'), /apuração/);
  assert.match(decodeMimeWords('=?utf-8?Q?Notifica=C3=A7=C3=A3o?='), /Notificação/);
});

test('HTML completo formata histórico de e-mails na seção 2.1', () => {
  const html = buildOccurrenceReportHtml(
    {
      ...baseData,
      emailAttachmentText: `De:
Para:
Cc:
Data:
Patrick Carneiro (DHL) patrick@dhl.com
Thiago thiago@grupotmseg.com.br
qua., 8 de jul. de 2026, 15:26
Boa tarde! Precisamos do plano de ação.`,
    },
    { logoDataUri: 'data:image/png;base64,AAAA' },
  );
  assert.match(html, /2\.1 Referência \/ histórico de e-mails/i);
  assert.match(html, /email-card/i);
  assert.match(html, /plano de ação/i);
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
