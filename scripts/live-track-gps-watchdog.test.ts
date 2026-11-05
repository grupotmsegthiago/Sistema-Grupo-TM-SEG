import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import {
  GPS_STALE_ALERT_MS,
  GPS_STALE_BEEP_EVERY_MS,
  gpsEstaStale,
  segundosSemGps,
} from '../lib/liveTrack/gpsWatchdog';

describe('gpsWatchdog', () => {
  it('limiar oficial é 90 segundos', () => {
    assert.equal(GPS_STALE_ALERT_MS, 90_000);
    assert.ok(GPS_STALE_BEEP_EVERY_MS < GPS_STALE_ALERT_MS);
  });

  it('não marca stale sem lastOkAt', () => {
    assert.equal(gpsEstaStale(null, Date.now()), false);
    assert.equal(gpsEstaStale(undefined, Date.now()), false);
    assert.equal(gpsEstaStale(0, Date.now()), false);
  });

  it('stale só após 90s', () => {
    const t0 = 1_000_000;
    assert.equal(gpsEstaStale(t0, t0 + 89_999), false);
    assert.equal(gpsEstaStale(t0, t0 + 90_000), true);
    assert.equal(segundosSemGps(t0, t0 + 95_000), 95);
  });

  it('PublicLiveTrack integra economia + watchdog + keepalive', () => {
    const page = fs.readFileSync('components/PublicLiveTrack.tsx', 'utf8');
    assert.match(page, /live-track-economy/);
    assert.match(page, /Modo Economia/);
    assert.match(page, /gpsWatchdog/);
    assert.match(page, /gpsEstaStale/);
    assert.match(page, /alertarGpsStale/);
    assert.match(page, /live-track-gps-stale/);
    assert.match(page, /setEconomyMode\(true\)/);
  });

  it('keepalive tem áudio silencioso + worker tick', () => {
    const keep = fs.readFileSync('lib/liveTrack/backgroundKeepalive.ts', 'utf8');
    assert.match(keep, /SILENT_WAV/);
    assert.match(keep, /setInterval\(resume, 8000\)/);
    assert.match(keep, /new Worker/);
    assert.match(keep, /postMessage\('tick'\)/);
    assert.match(keep, /Modo Economia/);
  });
});
