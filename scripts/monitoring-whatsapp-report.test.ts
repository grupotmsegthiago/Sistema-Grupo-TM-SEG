import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildMonitoringWhatsAppReport,
  formatProgressSquares,
  parseMonitoringLocation,
} from '../lib/monitoringWhatsAppReport';

test('formatProgressSquares: 100% usa quatro quadrados verdes escuros', () => {
  assert.equal(formatProgressSquares(100), '🟩🟩🟩🟩 100%');
});

test('formatProgressSquares: 25% começa com verde clarinho', () => {
  assert.equal(formatProgressSquares(25), '🟢⬜⬜⬜ 25%');
});

test('formatProgressSquares: 50% mantém verde claro', () => {
  assert.equal(formatProgressSquares(50), '🟢🟢⬜⬜ 50%');
});

test('formatProgressSquares: 0% deixa quatro quadrados vazios', () => {
  assert.equal(formatProgressSquares(0), '⬜⬜⬜⬜ 0%');
});

test('formatProgressSquares: 75% passa para verde escuro (quadrado)', () => {
  assert.equal(formatProgressSquares(75), '🟩🟩🟩⬜ 75%');
});

test('formatProgressSquares: não exibe texto explicativo do quadrado', () => {
  assert.doesNotMatch(formatProgressSquares(100), /cada quadrado vale/i);
});

test('formatProgressSquares: não usa coração verde', () => {
  assert.doesNotMatch(formatProgressSquares(100), /💚/);
  assert.doesNotMatch(formatProgressSquares(75), /💚/);
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
  assert.match(report, /📈\*PROGRESSO DA MISSÃO:\* 🟩🟩🟩🟩 100%/);
  assert.doesNotMatch(report, /cada quadrado vale/i);
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

  // Linha em branco entre progresso e localização, e entre link e ocorrência
  assert.match(report, /📈\*PROGRESSO DA MISSÃO:\* 🟩🟩🟩🟩 100%\n\n🏙️ \*LOCALIZAÇÃO:\*/);
  assert.match(report, /🗾 \*LINK DO GOOGLE:\* https:\/\/www\.google\.com\/maps[^\n]*\n\n📣 \*OCORRÊNCIA:\*/);
});

test('buildMonitoringWhatsAppReport: exemplo GTM-6312 com espaçamento oficial', () => {
  const report = buildMonitoringWhatsAppReport({
    osId: 'GTM-6312',
    status: 'EM VIAGEM',
    dateStr: '08/07/2026',
    timeStr: '10:57',
    operationType: 'CARACTERIZADA',
    client: 'CESLOG',
    origin: 'ESTR. DOS ROMEIROS, 49 - JARDIM BOM JESUS, PIRAPORA DO BOM JESUS - SP, 06550-000, BRASIL',
    destination: 'ESTR. PARTICULAR DA CODESP - ILHA BARNABÉ, SANTOS - SP, 11095-710, BRASIL',
    vehiclePlate: 'TIO4D31',
    vehicleModel: 'ATEGO 1933SCE',
    driverName: 'JOSE FRANCISCO DA FILHO',
    driverPhone: '(13) 99671-5450',
    escortVehicle: 'OVG5D55',
    agent1: 'ADENILTON SILVA',
    agent2: 'VALDEMIR CARNEIRO',
    progress: 0,
    occurrence: 'SEGUE MISSÃO',
    locationCity: 'ITAPECERICA DA SERRA - SP, BRASIL',
    mapLink: 'https://www.google.com/maps?q=-23.7538084,-46.7966622&z=17&hl=pt-BR',
  });

  assert.match(report, /^\*MONITORAMENTO GRUPO TMSEG\*/);
  assert.match(report, /\*OS:\* GTM-6312 \| \*STATUS:\* EM VIAGEM\n\n🗓️/);
  assert.match(report, /🏢 \*CLIENTE:\* CESLOG\n\n📍/);
  assert.match(report, /🏁 \*DESTINO:\* .+\n\n🚛/);
  assert.match(report, /📞 \*CONTATO:\* .+\n\n🚔/);
  assert.match(report, /👮 \*AGENTE 02:\* VALDEMIR CARNEIRO\n\n📈\*PROGRESSO DA MISSÃO:\* ⬜⬜⬜⬜ 0%/);
  assert.match(report, /📈\*PROGRESSO DA MISSÃO:\* ⬜⬜⬜⬜ 0%\n\n🏙️ \*LOCALIZAÇÃO:\* ITAPECERICA DA SERRA - SP, BRASIL/);
  assert.match(report, /🗾 \*LINK DO GOOGLE:\* https:\/\/www\.google\.com\/maps[^\n]+\n\n📣 \*OCORRÊNCIA:\* SEGUE MISSÃO$/);
});

test('buildMonitoringWhatsAppReport: exemplo GTM-6238 em origem', () => {
  const report = buildMonitoringWhatsAppReport({
    osId: 'GTM-6238',
    status: 'ORIGEM',
    dateStr: '07/07/2026',
    timeStr: '14:00',
    operationType: 'CARACTERIZADA',
    client: 'PREXTEX ENCOMENDAS',
    origin: 'R. FRANCISCO REIS, 1205 - CORDEIROS, ITAJAÍ - SC, 88311-750',
    destination: 'BELO HORIZONTE, MG',
    vehiclePlate: 'AUF6B18',
    vehicleModel: 'sem inf',
    driverName: 'ISMAEL NUNES',
    driverPhone: '+55 41 9803-5183',
    escortVehicle: 'UDE1G87',
    agent1: 'FERMANDO COLONHEZI',
    agent2: 'VITOR FRANÇA',
    progress: 0,
    occurrence: 'AGUARDANDO PARA DAR INICIO, SEM NOVIDADES',
    locationCity: '88307 - 750, BRASIL',
    mapLink: 'https://www.google.com/maps?q=-26.9639,-48.6839&z=17&hl=pt-BR',
  });

  assert.match(report, /\*OS:\* GTM-6238 \| \*STATUS:\* ORIGEM/);
  assert.match(report, /📈\*PROGRESSO DA MISSÃO:\* ⬜⬜⬜⬜ 0%/);
  assert.doesNotMatch(report, /cada quadrado vale/i);
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
