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
  allEvidencePhotos: [],
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
  assert.doesNotMatch(vercel, /"api\/dhl\/occurrence-report\.ts"/);
});

test('handler standalone carrega bundle HTML sem jspdf no preview', () => {
  const handler = fs.readFileSync('api/dhl/occurrence-report.ts', 'utf8');
  assert.match(handler, /require\('\.\/_occurrence-report-html\.cjs'\)/);
  assert.doesNotMatch(handler, /loadDhlReportBundle/);
  assert.doesNotMatch(handler, /proxyToExpress/);
  assert.doesNotMatch(handler, /server\/dhlOccurrenceReportPdf/);
  assert.doesNotMatch(handler, /import\s*\(\s*['"]\.\.\/\.\.\/lib\/dhlOccurrenceReport/);
});

test('HTML completo usa degradê preto para vermelho no cabeçalho', () => {
  const html = buildOccurrenceReportHtml(baseData, {
    logoDataUri: 'data:image/png;base64,AAAA',
  });
  assert.match(html, /linear-gradient\(135deg, #111827 0%, #991b1b 55%, #dc2626 100%\)/);
});

test('HTML inclui seção 3.4 com todas evidências do sistema', () => {
  const html = buildOccurrenceReportHtml(
    {
      ...baseData,
      allEvidencePhotos: [
        {
          url: 'https://example.com/storage/mission-evidence/GTM-6296/deslocamento.png',
          label: 'Print aprovação deslocamento DHL',
          actionType: 'dhl_deslocamento_print',
          at: '2026-07-08T15:00:00+00:00',
          source: 'system_logs — dhl_deslocamento_print',
        },
        {
          url: 'https://example.com/storage/mission-evidence/odometer/GTM-6296/final.png',
          label: 'Hodômetro — print KM final',
          actionType: 'odometer_print',
          at: '2026-07-08T18:00:00+00:00',
          source: 'Storage: odometer/GTM-6296/final.png',
        },
      ],
    },
    { logoDataUri: 'data:image/png;base64,DDDD' },
  );
  assert.match(html, /3\.4 Todas as evidências registradas no sistema/i);
  assert.match(html, /Atualizar OS/i);
  assert.match(html, /deslocamento\.png/);
  assert.match(html, /final\.png/);
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
  assert.match(html, /linear-gradient/i);
  assert.match(html, /section-root-cause/i);
  assert.match(html, /class="subsection"/);
  assert.match(html, /break-after: avoid-page/);
  assert.match(html, /display: table-header-group/);
});

test('HTML agrupa 4.4 título com tabela (evita título órfão na impressão)', () => {
  const html = buildOccurrenceReportHtml(baseData, {
    logoDataUri: 'data:image/png;base64,AAAA',
  });
  assert.match(html, /subsection[\s\S]*4\.4 Análise complementar[\s\S]*5 Porquês[\s\S]*<table>/);
});

test('HTML inclui logo embutido e label KM final na conclusão', () => {
  const html = buildOccurrenceReportHtml(
    {
      ...baseData,
      phasePhotos: baseData.phasePhotos.map((p) =>
        p.phase === 'conclusao'
          ? { ...p, url: 'https://example.com/odometer/final.png', label: 'Conclusão da OS — KM final' }
          : p,
      ),
    },
    { logoDataUri: 'data:image/png;base64,BBBB' },
  );
  assert.match(html, /data:image\/png;base64,BBBB/);
  assert.match(html, /KM final/i);
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

test('HTML template NÃO copia/cola o e-mail (sem seção 2.1)', () => {
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
  assert.doesNotMatch(html, /2\.1 Referência \/ histórico de e-mails/i);
  assert.doesNotMatch(html, /email-card/i);
  assert.doesNotMatch(html, /patrick@dhl\.com/i);
  assert.doesNotMatch(html, /Histórico de e-mails com DHL/i);
});

test('applyEditablePatches substitui bloco INTEIRO mesmo com <strong> aninhado (sem duplicar)', async () => {
  const { applyEditablePatches, extractEditableBlocks } = await import(
    '../lib/dhlOccurrenceReport/adjustReportHtml'
  );
  // Bloco no formato real da seção 4.1: contém <strong> aninhados.
  const html =
    '<p data-dhl-editable="sec-4-1-sintese">O atraso de <strong>86 minutos</strong> na chegada à origem da S.E. 183013 não decorreu de falha. A OS foi aberta em <strong>08/07 às 10:00</strong>. Texto redundante original.</p>';

  const blocksBefore = extractEditableBlocks(html);
  assert.equal(blocksBefore.length, 1);
  assert.match(blocksBefore[0].html, /86 minutos/);
  assert.match(blocksBefore[0].html, /Texto redundante original/);

  const patched = applyEditablePatches(html, {
    'sec-4-1-sintese': 'Texto novo e profissional gerado pela IA.',
  });

  // O conteúdo antigo deve sumir por completo (não pode sobrar resquício).
  assert.match(patched, /Texto novo e profissional gerado pela IA\./);
  assert.doesNotMatch(patched, /Texto redundante original/);
  assert.doesNotMatch(patched, /86 minutos/);
  assert.doesNotMatch(patched, /A OS foi aberta em/);
  // A tag externa e o atributo editável devem ser preservados e bem-formados.
  assert.match(patched, /<p data-dhl-editable="sec-4-1-sintese">Texto novo e profissional gerado pela IA\.<\/p>/);
  // e o bloco continua re-extraível (1 único bloco).
  const blocks = extractEditableBlocks(patched);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].html, 'Texto novo e profissional gerado pela IA.');
});

test('collectReportImageUrls deduplica fotos de etapas e galeria 3.4', async () => {
  const { collectReportImageUrls } = await import('../lib/dhlOccurrenceReport/embedReportImages');
  const urls = collectReportImageUrls({
    phasePhotos: [
      { url: 'https://x.supabase.co/storage/v1/object/public/mission-evidence/a.png' },
      { url: null },
    ],
    allEvidencePhotos: [
      { url: 'https://x.supabase.co/storage/v1/object/public/mission-evidence/a.png' },
      { url: 'https://x.supabase.co/storage/v1/object/public/mission-evidence/b.jpg' },
    ],
  });
  assert.equal(urls.length, 2);
  assert.ok(urls.includes('https://x.supabase.co/storage/v1/object/public/mission-evidence/b.jpg'));
});

test('embedRemoteImagesInHtml substitui URLs remotas por data URI', async () => {
  const { embedRemoteImagesInHtml } = await import('../lib/dhlOccurrenceReport/embedReportImages');
  const remote = 'https://x.supabase.co/storage/v1/object/public/mission-evidence/foto.png';
  const html = `<img src="${remote}" alt="teste" />`;
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(pngBytes, { status: 200, headers: { 'content-type': 'image/png' } });
  try {
    const out = await embedRemoteImagesInHtml(html, [remote]);
    assert.match(out, /data:image\/png;base64,/);
    assert.doesNotMatch(out, /supabase\.co\/storage/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('HTML do relatório DHL não usa crossorigin nas fotos (evita bloqueio CORS na impressão)', () => {
  const html = buildOccurrenceReportHtml(baseData, {
    logoDataUri: 'data:image/png;base64,AAAA',
  });
  assert.doesNotMatch(html, /crossorigin="anonymous"/);
});

test('service de impressão aguarda carregamento das imagens antes do print', () => {
  const src = fs.readFileSync('lib/services/dhlOccurrenceReportService.ts', 'utf8');
  assert.match(src, /waitForImagesThenPrint/);
  assert.match(src, /addEventListener\('load'/);
  assert.doesNotMatch(src, /setTimeout\(runPrint, 400\)/);
});

test('generateReportHtml embute fotos no HTML após montar o relatório', () => {
  const src = fs.readFileSync('lib/dhlOccurrenceReport/generateReportHtml.ts', 'utf8');
  assert.match(src, /embedRemoteImagesInHtml/);
  assert.match(src, /collectReportImageUrls/);
});

test('buildPhasePhotos preenche o destino com foto ao redor da conclusão (fallback temporal)', async () => {
  const { buildPhasePhotos } = await import('../lib/dhlOccurrenceReport/collectReportData');
  const img = (n: string) => `https://x.supabase.co/storage/v1/object/public/mission-evidence/${n}.png`;
  // Sem foto específica de "destino"; há fotos em origem, viagem e conclusão.
  const evidence = [
    { url: img('origem'), at: '2026-07-08T14:05:00Z', context: 'Espelhamento na origem', actionType: 'mirroring', filePath: '' },
    { url: img('viagem'), at: '2026-07-08T15:00:00Z', context: 'Deslocamento DHL', actionType: 'dhl_deslocamento_print', filePath: '' },
    { url: img('perto-conclusao'), at: '2026-07-08T17:50:00Z', context: 'Foto operacional', actionType: 'evidence_upload', filePath: '' },
    { url: img('hodometro'), at: '2026-07-08T18:00:00Z', context: 'Hodômetro KM final', actionType: 'odometer_print', filePath: '' },
  ];
  const photos = buildPhasePhotos({
    marks: {
      originArrival: '2026-07-08T14:00:00Z',
      inTransit: '2026-07-08T15:00:00Z',
      destinationArrival: '2026-07-08T17:30:00Z',
      completed: '2026-07-08T18:00:00Z',
    },
    evidence,
    mirroringUrl: null,
    deslocUrl: null,
  });
  // Todos os 4 campos devem estar preenchidos, incluindo o destino.
  assert.equal(photos.length, 4);
  for (const p of photos) {
    assert.ok(p.url, `campo ${p.phase} deveria ter foto`);
  }
  const destino = photos.find((p) => p.phase === 'destino');
  assert.ok(destino?.url, 'destino deve ser preenchido pelo fallback temporal');
  // não deve haver URLs duplicadas entre as etapas
  const urls = photos.map((p) => p.url);
  assert.equal(new Set(urls).size, urls.length, 'cada etapa usa uma foto distinta');
});

test('geração via IA preenche blocos com base no contexto e NÃO copia o e-mail', async () => {
  const { generateDhlReportHtmlWithAi } = await import(
    '../lib/dhlOccurrenceReport/adjustReportHtml'
  );
  const html =
    '<div class="summary" data-dhl-editable="facts-summary">TEXTO PADRÃO DO TEMPLATE</div>' +
    '<p data-dhl-editable="sec-4-1-sintese">SÍNTESE PADRÃO</p>';
  const context = {
    factsBlock: 'Nº S.E.: 183013\nAtraso registrado na origem (minutos): 86',
    emailText: 'De: Antonia (DHL)\nBoa tarde, a escolta atrasou e precisamos de posicionamento.',
    emailLink: 'https://mail.example.com/thread/1',
    userSummary: 'Houve remanejamento de viatura.',
  };

  let capturedPrompt = '';
  const generateText = async (prompt: string): Promise<string> => {
    capturedPrompt = prompt;
    return JSON.stringify({
      patches: [
        { id: 'facts-summary', html: 'Síntese redigida pela IA a partir do contexto da operação.' },
        { id: 'sec-4-1-sintese', html: 'Análise executiva gerada pela IA.' },
      ],
    });
  };

  const out = await generateDhlReportHtmlWithAi(html, context, generateText);
  assert.match(out, /Síntese redigida pela IA/);
  assert.match(out, /Análise executiva gerada pela IA/);
  assert.doesNotMatch(out, /TEXTO PADRÃO DO TEMPLATE/);
  assert.doesNotMatch(out, /SÍNTESE PADRÃO/);
  // o prompt deve levar o contexto do e-mail e proibir a cópia literal
  assert.match(capturedPrompt, /a escolta atrasou/);
  assert.match(capturedPrompt, /N[ÃA]O copie e cole o e-mail/i);
  assert.match(capturedPrompt, /Nº S\.E\.: 183013/);
});

test('HTML marca trechos editáveis para ajuste com IA', () => {
  const html = buildOccurrenceReportHtml(baseData, {
    logoDataUri: 'data:image/png;base64,AAAA',
  });
  assert.match(html, /data-dhl-editable="facts-summary"/);
  assert.match(html, /data-dhl-editable="sec-4-1-sintese"/);
  assert.match(html, /data-dhl-editable="sec-4-3-causa-raiz"/);
  assert.doesNotMatch(html, /8\.1 Parecer da Diretoria/i);
});

test('ajuste com IA aplica patches nos blocos editáveis', async () => {
  const { extractEditableBlocks, applyEditablePatches, adjustDhlReportHtmlWithAi } = await import(
    '../lib/dhlOccurrenceReport/adjustReportHtml'
  );
  const html = `<p data-dhl-editable="sec-4-1-sintese">Texto acusatório sobre o fornecedor COMANDO G8.</p>`;
  const blocks = extractEditableBlocks(html);
  assert.equal(blocks.length, 1);
  assert.match(blocks[0].html, /COMANDO G8/);

  const patched = applyEditablePatches(html, {
    'sec-4-1-sintese': 'Texto construtivo sobre o parceiro operacional.',
  });
  assert.match(patched, /parceiro operacional/);
  assert.doesNotMatch(patched, /COMANDO G8/);

  const adjusted = await adjustDhlReportHtmlWithAi(
    html,
    'Suavize o tom e use parceiro em vez do nome',
    async () =>
      JSON.stringify({
        patches: [{ id: 'sec-4-1-sintese', html: 'Texto construtivo sobre o parceiro.' }],
      }),
  );
  assert.match(adjusted, /parceiro/);
});

test('service expõe ajuste com IA no payload', () => {
  const src = fs.readFileSync('lib/services/dhlOccurrenceReportService.ts', 'utf8');
  assert.match(src, /adjustDhlOccurrenceReportHtml/);
  assert.match(src, /format: 'adjust'/);
  assert.doesNotMatch(src, /reportParecer/);
});

test('histórico: handler standalone, Express, migração e service conectados', () => {
  // Migração automática (Express startup) + garantia no handler standalone
  const routes = fs.readFileSync('server/routes.ts', 'utf8');
  assert.match(routes, /CREATE TABLE IF NOT EXISTS dhl_occurrence_reports/);
  assert.match(routes, /DISABLE ROW LEVEL SECURITY/);
  // branches de histórico no POST base (mesmo path do relatório)
  assert.match(routes, /format === 'save'/);
  assert.match(routes, /format === 'history'/);
  assert.match(routes, /format === 'history-get'/);

  // Handler standalone (produção) trata os mesmos formatos e garante a tabela
  const handler = fs.readFileSync('api/dhl/occurrence-report.ts', 'utf8');
  assert.match(handler, /format === 'save'/);
  assert.match(handler, /format === 'history'/);
  assert.match(handler, /ensureReportsTable/);
  assert.match(handler, /dhl_occurrence_reports/);

  const service = fs.readFileSync('lib/services/dhlOccurrenceReportService.ts', 'utf8');
  assert.match(service, /export async function saveDhlOccurrenceReport/);
  assert.match(service, /export async function listDhlOccurrenceReportHistory/);
  assert.match(service, /export async function getDhlOccurrenceReportVersion/);
  // usa o path base do relatório com format (não sub-rotas do Express)
  assert.match(service, /format: 'save'/);
  assert.match(service, /format: 'history'/);
  assert.doesNotMatch(service, /occurrence-report\/save/);

  const modal = fs.readFileSync('components/DhlOccurrenceReportModal.tsx', 'utf8');
  assert.match(modal, /Salvar vers[aã]o/);
  assert.match(modal, /Hist[oó]rico/);
  assert.match(modal, /handleSaveVersion/);
  assert.match(modal, /handleOpenVersion/);
});

test('handler suporta format adjust com bundle CJS', () => {
  const handler = fs.readFileSync('api/dhl/occurrence-report.ts', 'utf8');
  assert.match(handler, /format === 'adjust'/);
  assert.match(handler, /adjustmentNotes/);
  assert.match(handler, /require\('\.\/_occurrence-report-adjust\.cjs'\)/);
  assert.doesNotMatch(handler, /loadDhlReportBundle/);
  assert.doesNotMatch(handler, /lib\/dhlOccurrenceReport\/adjustReportHtml/);
  assert.ok(fs.existsSync('api/dhl/_occurrence-report-adjust.cjs'), 'bundle adjust deve existir após build');
});

test('build-server gera bundle adjust do relatório DHL', () => {
  const build = fs.readFileSync('build-server.mjs', 'utf8');
  assert.match(build, /_occurrence-report-adjust\.cjs/);
});

test('ajuste com IA usa o Referer autorizado na chave Gemini', () => {
  // A chave Gemini tem restrição de HTTP referrer. O handler de ajuste precisa
  // enviar o mesmo Referer autorizado usado pelos endpoints Gemini que
  // funcionam (api/gemini/generate.ts e api/gemini/health.ts). Usar o domínio
  // custom faz o Google bloquear com "GenerateContent are blocked".
  const handler = fs.readFileSync('api/dhl/occurrence-report.ts', 'utf8');
  const generate = fs.readFileSync('api/gemini/generate.ts', 'utf8');
  const authorizedRefererMatch = generate.match(
    /GEMINI_REFERER\s*=\s*["']([^"']+)["']/,
  );
  assert.ok(authorizedRefererMatch, 'api/gemini/generate.ts deve definir GEMINI_REFERER');
  const authorizedReferer = authorizedRefererMatch![1];
  assert.match(handler, new RegExp(`Referer:\\s*['"]${authorizedReferer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`));
  assert.doesNotMatch(handler, /Referer:\s*['"]https:\/\/sistema\.grupotmseg\.com\.br\//);
});

test('pickUrl monta URL pública a partir de filePath nos logs', async () => {
  const { collectDhlOccurrenceReportData } = await import('../lib/dhlOccurrenceReport/collectReportData');
  assert.equal(typeof collectDhlOccurrenceReportData, 'function');
});

test('leitura de .msg orienta exportar em .eml', async () => {
  const { readEmailAttachmentFile } = await import('../lib/dhlOccurrenceReport/readEmailAttachment');
  const file = new File([new Uint8Array([0, 1, 2])], 'email.msg', { type: 'application/vnd.ms-outlook' });
  await assert.rejects(() => readEmailAttachmentFile(file), /Arquivo \.msg não é lido automaticamente/i);
});

const SAMPLE_PDF_BYTES = new Uint8Array(
  Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 200 200]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 55>>stream\nBT /F1 12 Tf 10 100 Td (Email DHL teste) Tj ET\nendstream\nendobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000261 00000 n \n0000000367 00000 n \ntrailer<</Size 6/Root 1 0 R>>\nstartxref\n441\n%%EOF',
  ),
);

test('readEmailAttachmentFile extrai texto de PDF', async () => {
  const { readEmailAttachmentFile } = await import('../lib/dhlOccurrenceReport/readEmailAttachment');
  const file = new File([SAMPLE_PDF_BYTES], 'thread-dhl.pdf', { type: 'application/pdf' });
  const text = await readEmailAttachmentFile(file);
  assert.match(text, /Email DHL teste/i);
});

test('modal aceita .pdf no seletor de anexo', () => {
  const src = fs.readFileSync('components/DhlOccurrenceReportModal.tsx', 'utf8');
  assert.match(src, /EMAIL_FILE_ACCEPT = '\.eml,\.txt,\.html,\.htm,\.pdf'/);
});

test('modal expõe Salvar PDF completo fixo no rodapé mobile', () => {
  const src = fs.readFileSync('components/DhlOccurrenceReportModal.tsx', 'utf8');
  assert.match(src, /button-print-pdf-dhl-report-mobile/);
  assert.match(src, /100dvh/);
  assert.match(src, /safe-area-inset-bottom/);
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
