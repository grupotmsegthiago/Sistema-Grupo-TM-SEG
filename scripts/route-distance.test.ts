import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRouteDistanceKm,
  computeRouteProgressKm,
  looksLikeLatLngPair,
  normalizeRouteAddress,
  pontosDaPolyline,
  progressFromRouteLegs,
} from '../lib/routeDistance.ts';

describe('routeDistance', () => {
  it('normaliza endereço com Brasil', () => {
    assert.equal(normalizeRouteAddress('Campinas'), 'Campinas, Brasil');
    assert.equal(normalizeRouteAddress('Campinas, Brasil'), 'Campinas, Brasil');
  });

  it('não anexa Brasil em coordenadas lat,lng', () => {
    assert.equal(looksLikeLatLngPair('-22.9,-47.0'), true);
    assert.equal(normalizeRouteAddress('-22.9056, -47.0608'), '-22.9056,-47.0608');
  });

  it('lê a polyline do Google sem chamar a rede', () => {
    const pontos = pontosDaPolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    assert.equal(pontos.length, 3);
    assert.ok(Math.abs(pontos[0].lat - 38.5) < 0.001);
    assert.ok(Math.abs(pontos[2].lng - -126.453) < 0.001);
  });

  it('progressFromRouteLegs: 25% / 50% / 75% / 100%', () => {
    assert.equal(progressFromRouteLegs(100, 75).progressPct, 25);
    assert.equal(progressFromRouteLegs(100, 50).progressPct, 50);
    assert.equal(progressFromRouteLegs(100, 25).progressPct, 75);
    assert.equal(progressFromRouteLegs(100, 0).progressPct, 100);
    assert.equal(progressFromRouteLegs(100, 100).progressPct, 0);
  });

  it('calcula Campinas → Barueri com sucesso', async () => {
    const result = await computeRouteDistanceKm('CAMPINAS', 'BARUERI');
    assert.equal(result.success, true);
    assert.ok((result.distanceKm || 0) > 50);
  });

  it('computeRouteProgressKm: Campinas → Barueri com ponto no meio', async () => {
    // Posição aproximada entre Campinas e Barueri (Jundiaí)
    const result = await computeRouteProgressKm({
      origin: 'Campinas, SP',
      destination: 'Barueri, SP',
      current: '-23.186,-46.884',
    });
    assert.equal(result.success, true, result.error);
    assert.ok(result.totalKm > 50, `totalKm=${result.totalKm}`);
    assert.ok(result.progressPct >= 10 && result.progressPct <= 95, `progressPct=${result.progressPct}`);
    assert.ok(result.traveledKm > 0, `traveledKm=${result.traveledKm}`);
  });
});
