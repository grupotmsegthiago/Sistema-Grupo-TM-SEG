/**
 * Watchdog de perda de GPS na tela do agente (web-only).
 * Limiar oficial: 90 segundos sem captura/envio bem-sucedido.
 */

export const GPS_STALE_ALERT_MS = 90_000;
export const GPS_STALE_BEEP_EVERY_MS = 4_000;

export function gpsEstaStale(lastOkAt: number | null | undefined, now = Date.now()): boolean {
  if (!lastOkAt || lastOkAt <= 0) return false;
  return now - lastOkAt >= GPS_STALE_ALERT_MS;
}

export function segundosSemGps(lastOkAt: number | null | undefined, now = Date.now()): number {
  if (!lastOkAt || lastOkAt <= 0) return 0;
  return Math.max(0, Math.floor((now - lastOkAt) / 1000));
}

/** Beep curto + vibração (quando o SO permitir). */
export function alertarGpsStale(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([220, 120, 220, 120, 320]);
    }
  } catch {
    /* ignore */
  }
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = 880;
    g.gain.value = 0.08;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    window.setTimeout(() => {
      try {
        o.stop();
        void ctx.close();
      } catch {
        /* ignore */
      }
    }, 280);
  } catch {
    /* aparelho bloqueou áudio */
  }
}
