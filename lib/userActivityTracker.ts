/**
 * Rastreia atividade real do usuário no sistema (navegação, cliques, APIs).
 * Usado pelo quadro de presença da diretoria para detectar inatividade > 10 min.
 */

import { ACTIVITY_IDLE_MS } from './timeclock/shiftRules';

const STORAGE_KEY = 'tmseg:last-activity-at';
const TOUCH_DEBOUNCE_MS = 5_000;

let lastTouchMs = 0;
let wired = false;

export function getLastActivityAt(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || new Date().toISOString();
  } catch {
    return new Date().toISOString();
  }
}

export function touchUserActivity(): void {
  const now = Date.now();
  if (now - lastTouchMs < TOUCH_DEBOUNCE_MS) return;
  lastTouchMs = now;
  try {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
  } catch {
    // ignora
  }
  window.dispatchEvent(new CustomEvent('tmseg:activity'));
}

export type ActivityStatus = 'active' | 'idle';

export function getActivityStatus(now: Date = new Date()): ActivityStatus {
  const last = new Date(getLastActivityAt()).getTime();
  if (!Number.isFinite(last)) return 'active';
  return now.getTime() - last > ACTIVITY_IDLE_MS ? 'idle' : 'active';
}

export function getIdleMinutes(now: Date = new Date()): number {
  const last = new Date(getLastActivityAt()).getTime();
  if (!Number.isFinite(last)) return 0;
  const diff = now.getTime() - last;
  if (diff <= ACTIVITY_IDLE_MS) return 0;
  return Math.floor((diff - ACTIVITY_IDLE_MS) / 60_000);
}

/** Instala listeners globais uma única vez. */
export function wireUserActivityTracker(): () => void {
  if (wired || typeof window === 'undefined') return () => {};
  wired = true;
  touchUserActivity();

  const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click', 'pointerdown'];
  const handler = () => touchUserActivity();
  events.forEach((ev) => document.addEventListener(ev, handler, { passive: true }));

  const navHandler = () => touchUserActivity();
  window.addEventListener('tmseg:navigate', navHandler);
  window.addEventListener('tmseg:screen-change', navHandler);

  return () => {
    events.forEach((ev) => document.removeEventListener(ev, handler));
    window.removeEventListener('tmseg:navigate', navHandler);
    window.removeEventListener('tmseg:screen-change', navHandler);
    wired = false;
  };
}
