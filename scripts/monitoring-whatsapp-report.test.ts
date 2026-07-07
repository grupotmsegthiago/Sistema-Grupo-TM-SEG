import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildMonitoringWhatsAppReport,
  formatProgressSquares,
  parseMonitoringLocation,
} from '../lib/monitoringWhatsAppReport';

test('formatProgressSquares: 100% preenche cinco quadrados em degradê verde', () => {
  assert.equal(
    formatProgressSquares(100),
    '🟢💚🟩🟩🟩 100% (cada quadrado vale 20%)',
  );
});

test('formatProgressSquares: 20% começa com verde clarinho no 1º quadrado', () => {
  assert.equal(
    formatProgressSquares(20),
    '🟢⬜⬜⬜⬜ 20% (cada quadrado vale 20%)',
  );
});

test('formatProgressSquares: 0% deixa todos vazios', () => {
  assert.equal(
    formatProgressSquares(0),
    '⬜⬜⬜⬜⬜ 0% (cada quadrado vale 20%)',
  );
});

test('formatProgressSquares: 60% preenche três quadrados com degradê', () => {
  assert.equal(
    formatProgressSquares(60),
    '🟢💚🟩⬜⬜ 60% (cada quadrado vale 20%)',
  );
});

test('parseMonitoringLocation separa ocorrência e cidade', () => {
  const parsed = parseMonitoringLocation(
    'CHEGADA NO DESTINO|11460 - 001, BRASIL',
  );
  assert.equal(parsed.occurrence, 'CHEGADA NO DESTINO');
  assert.equal(parsed.city, '11460 - 001, BRASIL');
});

test('buildMonitoringWhatsAppReport segue o modelo oficial', () => {
  const report = buildMonitoringWhatsAppReport({
    osId: 'GTM-6253',
    status: 'EM VIAGEM',
    dateStr: '07/07/2026',
    timeStr: '08:00',
    operationType: 'CARACTERIZADA',
    client: 'CESLOG',
    origin: 'ESTR. DOS ROMEIROS, 49 - PARQUE PAYOL I E II, PIRAPORA DO BOM JESUS - SP, 06550-000',
    destination: 'AV. ENGENHEIRO AUGUSTO BARATA - MORRO DA PENHA, SANTOS - SP',
    vehiclePlate: 'IYV5D99',
    vehicleModel: 'AXOR 2041 LS',
    driverName: 'ROBERTO ANDRADE',
    driverPhone: '(13) 7405-2798',
    escortVehicle: 'TXW5H52',
    agent1: 'ANTONIO MESQUITA',
    agent2: 'ROMARIO OLIVEIRA',
    progress: 100,
    occurrence: 'CHEGADA NO DESTINO, AGUARDANDO A ENTRADA DO AUTO',
    locationCity: '11460 - 001, BRASIL',
    mapLink: 'https://www.google.com/maps?q=-23.959205,-46.2878617&z=17&hl=pt-BR',
  });

  assert.match(report, /^\*MONITORAMENTO GRUPO TMSEG\*/);
  assert.match(report, /\*OS:\* GTM-6253 \| \*STATUS:\* EM VIAGEM/);
  assert.match(report, /🗓️ \*DATA:\* 07\/07\/2026 \*HORA:\* 08:00/);
  assert.match(report, /🛡️ \*OPERAÇÃO:\* CARACTERIZADA/);
  assert.match(report, /📈\*PROGRESSO DA MISSÃO:\* 🟢💚🟩🟩🟩 100% \(cada quadrado vale 20%\)/);
  assert.match(report, /🏙️ \*LOCALIZAÇÃO:\* 11460 - 001, BRASIL/);
  assert.match(report, /🗾 \*LINK DO GOOGLE:\* https:\/\/www\.google\.com\/maps/);
  assert.match(report, /📣 \*OCORRÊNCIA:\* CHEGADA NO DESTINO, AGUARDANDO A ENTRADA DO AUTO/);

  const progressIdx = report.indexOf('📈*PROGRESSO DA MISSÃO:*');
  const locationIdx = report.indexOf('🏙️ *LOCALIZAÇÃO:*');
  const linkIdx = report.indexOf('🗾 *LINK DO GOOGLE:*');
  const occurrenceIdx = report.indexOf('📣 *OCORRÊNCIA:*');
  assert.ok(progressIdx < locationIdx);
  assert.ok(locationIdx < linkIdx);
  assert.ok(linkIdx < occurrenceIdx);
});

test('buildMonitoringWhatsAppReport não altera o padrão DHL (ESCOLTA ARMADA)', () => {
  const report = buildMonitoringWhatsAppReport({
    osId: 'GTM-0001',
    status: 'EM VIAGEM',
    dateStr: '07/07/2026',
    timeStr: '08:00',
    client: 'DHL',
    origin: 'ORIGEM',
    destination: 'DESTINO',
    progress: 50,
  });
  assert.doesNotMatch(report, /ESCOLTA ARMADA/);
  assert.match(report, /^\*MONITORAMENTO GRUPO TMSEG\*/);
});
