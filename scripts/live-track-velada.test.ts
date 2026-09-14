import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isTerminalMissionStatus, isVeladaMission } from '../lib/liveTrack/isVeladaMission';
import {
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
  assert.match(text, /WhatsApp/);
});

test('LGPD tem controlador, finalidade e retenção', () => {
  assert.equal(LIVE_TRACK_LGPD_VERSION, '2026-09-14');
  assert.match(LIVE_TRACK_LGPD_FULL, /GRUPO TM SEG/);
  assert.match(LIVE_TRACK_LGPD_FULL, /Lei 13\.709/);
  assert.match(LIVE_TRACK_LGPD_FULL, /Retenção/);
});

test('botão gerar link só existe no fluxo velada', () => {
  const card = fs.readFileSync('components/MissionCard.tsx', 'utf8');
  assert.match(card, /isVeladaMission\(mission\) && <LiveTrackPanel/);
  const modal = fs.readFileSync('components/UpdateMissionModal.tsx', 'utf8');
  assert.match(modal, /LiveTrackPanel/);
  const panel = fs.readFileSync('components/LiveTrackPanel.tsx', 'utf8');
  assert.match(panel, /if \(!enabled\) return null/);
  assert.match(panel, /isVeladaMission\(mission\)/);
});

test('rota pública /rastreio e API dedicada existem', () => {
  const app = fs.readFileSync('App.tsx', 'utf8');
  assert.match(app, /normalizedPath === '\/rastreio'/);
  assert.match(app, /<PublicLiveTrack/);
  const api = fs.readFileSync('api/live-track.ts', 'utf8');
  assert.match(api, /public-ping/);
  assert.match(api, /Não autorizado/);
  const page = fs.readFileSync('components/PublicLiveTrack.tsx', 'utf8');
  assert.match(page, /enableHighAccuracy: true/);
  assert.match(page, /wakeLock/);
  assert.match(page, /Compartilhar localização em tempo real/);
  assert.match(page, /live-track-lgpd-check/);
});
