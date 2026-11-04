import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fornecedorAtiva, isTerminalMissionStatus, isVeladaMission, rastreioOsAberta } from '../lib/liveTrack/isVeladaMission';
import { credencialDoCliente, idPeloLinkDoCliente } from '../lib/liveTrack/service';
import {
  buildLiveTrackClientUrl,
  buildLiveTrackPublicUrl,
  buildLiveTrackWhatsappText,
  haversineMeters,
  isLiveTrackStale,
  LIVE_TRACK_STALE_MS,
  shouldInsertTrailPoint,
  validateCoords,
} from '../lib/liveTrack/pure';
import { LIVE_TRACK_LGPD_FULL, LIVE_TRACK_LGPD_VERSION } from '../lib/liveTrack/lgpd';

test('só missão velada gera rastreio ao vivo', () => {
  assert.equal(isVeladaMission({ mission_type: 'Velada' }), true);
  assert.equal(isVeladaMission({ missionType: 'Escolta Velada' }), true);
  assert.equal(isVeladaMission({ mission_type: 'Caracterizada' }), false);
  assert.equal(isVeladaMission({ mission_type: 'Pronta Resposta' }), false);
  assert.equal(isVeladaMission(null), false);
});

test('fornecedor ATIVA é a marca, e inativa não entra', () => {
  assert.equal(fornecedorAtiva('ATIVA SEGURANÇA'), true);
  assert.equal(fornecedorAtiva('ativa pronta resposta'), true);
  assert.equal(fornecedorAtiva('TORRES'), false);
  assert.equal(fornecedorAtiva('FILIAL INATIVA'), false);
  assert.equal(fornecedorAtiva(''), false);
});

test('link abre da criação até a conclusão e fecha em pendente ou encerrada', () => {
  assert.equal(rastreioOsAberta('Solicitada'), true);
  assert.equal(rastreioOsAberta('Agendada'), true);
  assert.equal(rastreioOsAberta('Origem'), true);
  assert.equal(rastreioOsAberta('Em Viagem'), true);
  assert.equal(rastreioOsAberta('Pendente'), false);
  assert.equal(rastreioOsAberta('Concluída'), false);
  assert.equal(rastreioOsAberta('Cancelada'), false);
  assert.equal(rastreioOsAberta(''), false);
});

test('credencial do cliente não serve para transmitir', () => {
  const c = credencialDoCliente('11111111-1111-1111-1111-111111111111');
  assert.equal(idPeloLinkDoCliente(c), '11111111-1111-1111-1111-111111111111');
  assert.equal(idPeloLinkDoCliente(`${c}x`), null);
  assert.match(buildLiveTrackClientUrl(c, 'https://sistema.grupotmseg.com.br'), /\/rastreio\?c=/);
  assert.doesNotMatch(buildLiveTrackClientUrl(c, 'https://sistema.grupotmseg.com.br'), /token=/);
});

test('OS terminal encerra o rastreio', () => {
  assert.equal(isTerminalMissionStatus('Concluída'), true);
  assert.equal(isTerminalMissionStatus('Cancelada'), true);
  assert.equal(isTerminalMissionStatus('Recusada'), true);
  assert.equal(isTerminalMissionStatus('Em Viagem'), false);
});

test('valida coordenadas GPS', () => {
  assert.deepEqual(validateCoords(-23.55, -46.63), { lat: -23.55, lng: -46.63 });
  assert.equal(validateCoords(0, 0), null);
  assert.equal(validateCoords(91, 0), null);
  assert.equal(validateCoords('abc', 1), null);
});

test('trilha só grava com deslocamento ou intervalo', () => {
  const last = { lat: -23.55, lng: -46.63, at: 1_000 };
  assert.equal(shouldInsertTrailPoint({ lastTrail: last, next: { lat: -23.55, lng: -46.63 }, now: 1_500 }), false);
  assert.equal(shouldInsertTrailPoint({ lastTrail: last, next: { lat: -23.55, lng: -46.63 }, now: 10_000 }), true);
  const moved = shouldInsertTrailPoint({
    lastTrail: last,
    next: { lat: -23.552, lng: -46.63 },
    now: 1_500,
  });
  assert.equal(moved, haversineMeters(last, { lat: -23.552, lng: -46.63 }) >= 25);
});

test('sinal fica stale depois do limiar WhatsApp-like', () => {
  const now = Date.now();
  assert.equal(isLiveTrackStale(new Date(now - 3_000).toISOString(), now), false);
  assert.equal(isLiveTrackStale(new Date(now - LIVE_TRACK_STALE_MS - 1).toISOString(), now), true);
});

test('texto WhatsApp e URL pública usam o domínio canônico', () => {
  const url = buildLiveTrackPublicUrl('tok123', 'https://sistema.grupotmseg.com.br');
  assert.equal(url, 'https://sistema.grupotmseg.com.br/rastreio?token=tok123');
  const text = buildLiveTrackWhatsappText({ osNumber: 'GTM-9999', url });
  assert.match(text, /acompanhamento da sua missão/i);
  assert.match(text, /tempo real até o fim da missão/);
  assert.match(text, /GTM-9999/);
  assert.match(text, /Ocultar/);
  assert.match(text, /WhatsApp/);
});

test('LGPD tem controlador, finalidade e retenção', () => {
  assert.equal(LIVE_TRACK_LGPD_VERSION, '2026-09-15-bg');
  assert.match(LIVE_TRACK_LGPD_FULL, /GRUPO TM SEG/);
  assert.match(LIVE_TRACK_LGPD_FULL, /Lei 13\.709/);
  assert.match(LIVE_TRACK_LGPD_FULL, /Retenção/);
  assert.match(LIVE_TRACK_LGPD_FULL, /segundo plano/);
});

test('botão gerar link só existe no fluxo velada', () => {
  const card = fs.readFileSync('components/MissionCard.tsx', 'utf8');
  assert.match(card, /isVeladaMission\(mission\) && <LiveTrackPanel/);
  const modal = fs.readFileSync('components/UpdateMissionModal.tsx', 'utf8');
  assert.match(modal, /LiveTrackPanel/);
  const panel = fs.readFileSync('components/LiveTrackPanel.tsx', 'utf8');
  assert.match(panel, /if \(!enabled\) return null/);
  assert.match(panel, /isVeladaMission\(mission\)/);
  assert.match(panel, /rastreioOsAberta/);
  assert.match(panel, /Link do agente/);
  assert.match(panel, /Link do cliente/);
});

test('rota pública /rastreio e API no Express existem', () => {
  const app = fs.readFileSync('App.tsx', 'utf8');
  assert.match(app, /normalizedPath === '\/rastreio'/);
  assert.match(app, /<PublicLiveTrack/);
  const routes = fs.readFileSync('server/liveTrackRoutes.ts', 'utf8');
  assert.match(routes, /\/api\/live-track/);
  const api = fs.readFileSync('api/live-track.ts', 'utf8');
  assert.match(api, /handleLiveTrackHttp/);
  assert.match(api, /require\('\.\/_live-track-core\.cjs'\)/);
  assert.doesNotMatch(api, /import\('\.\.\/lib\/liveTrack\/httpHandler/);
  const build = fs.readFileSync('build-server.mjs', 'utf8');
  assert.match(build, /lib\/liveTrack\/httpHandler\.ts/);
  assert.match(build, /api\/_live-track-core\.cjs/);
  const http = fs.readFileSync('lib/liveTrack/httpHandler.ts', 'utf8');
  assert.match(http, /public-ping/);
  assert.match(http, /Não autorizado/);
  const page = fs.readFileSync('components/PublicLiveTrack.tsx', 'utf8');
  assert.match(page, /enableHighAccuracy: true/);
  assert.match(page, /maximumAge: 0/);
  assert.match(page, /watchPosition/);
  assert.match(page, /será reenviada automaticamente/);
  assert.match(page, /wakeLock/);
  assert.match(page, /Compartilhar localização em tempo real/);
  assert.match(page, /live-track-lgpd-check/);
  assert.match(page, /live-track-minimize/);
  assert.match(page, /live-track-client-view/);
  assert.match(page, /live-track-map/);
  assert.match(page, /startLiveTrackKeepalive/);
  assert.match(page, /keepalive: true/);
  assert.match(page, /fechar esta página/);
  assert.match(page, /Você será redirecionado para os dados da missão/);
  assert.match(page, /ativa-pronta-resposta/);
  assert.match(page, /PING_OCULTO_MS = 60000/);
  assert.match(page, /origem=\{origem\}/);
  assert.match(page, /O origem/);
  const svcMapa = fs.readFileSync('lib/liveTrack/service.ts', 'utf8');
  assert.match(svcMapa, /pontosDaRota/);
  assert.doesNotMatch(svcMapa, /pontosDaRotaAtiva/);
  assert.match(page, /ATIVA Pronta Resposta/);
  const svc = fs.readFileSync('lib/liveTrack/service.ts', 'utf8');
  assert.match(svc, /fornecedorAtiva/);
  assert.match(svc, /geocodeAddress/);
  const idx = fs.readFileSync('index.tsx', 'utf8');
  assert.match(idx, /\/rastreio/);
  const apiSrc = fs.readFileSync('lib/liveTrack/service.ts', 'utf8');
  assert.match(apiSrc, /nextStatus: LiveTrackStatus = 'sharing'/);
  const keep = fs.readFileSync('lib/liveTrack/backgroundKeepalive.ts', 'utf8');
  assert.match(keep, /mediaSession/);
  assert.match(keep, /tmseg-live-track/);
  assert.match(keep, /setInterval\(resume/);
  assert.match(keep, /ctx\?\.resume\?\.\(\)\.catch/);
  assert.match(fs.readFileSync('index.html', 'utf8'), /failed to start the audio device/);
  const sw = fs.readFileSync('client/public/sw.js', 'utf8');
  assert.match(sw, /\/rastreio/);
  const vercel = fs.readFileSync('vercel.json', 'utf8');
  assert.match(vercel, /"destination": "\/api\/live-track"/);
});
