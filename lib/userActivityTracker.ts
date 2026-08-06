/**
 * Rastreia atividade real do usuário no sistema (navegação, cliques, APIs).
 * Usado pelo quadro de presença da diretoria para detectar inatividade > 10 min.
 * Também alimenta contadores de produtividade (cliques/interações).
 */

import { bumpInteraction } from './productivity/interactionCounters';
import { ACTIVITY_IDLE_MS } from './timeclock/shiftRules';

const STORAGE_KEY = 'tmseg:last-activity-at';
const TOUCH_DEBOUNCE_MS = 5_000;

let lastTouchMs = 0;
let wired = false;
/** Quando true, cliques no modal de desafio não renovam o timer de atividade. */
let activityPaused = false;

export function setActivityTrackingPaused(paused: boolean): void {
  activityPaused = paused;
}

export function isActivityTrackingPaused(): boolean {
  return activityPaused;
}

export function getLastActivityAt(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || new Date().toISOString();
  } catch {
    return new Date().toISOString();
  }
}

export function touchUserActivity(): void {
  if (activityPaused) return;
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

/** Força renovação do timestamp (ex.: após passar no desafio noturno). */
export function forceTouchUserActivity(): void {
  lastTouchMs = 0;
  activityPaused = false;
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

export function getIdleMs(now: Date = new Date()): number {
  const last = new Date(getLastActivityAt()).getTime();
  if (!Number.isFinite(last)) return 0;
  return Math.max(0, now.getTime() - last);
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
  let stopFlush: () => void = () => {};
  let cancelled = false;
  // Import dinâmico: evita carregar supabase no import estático (testes Node).
  void import('./productivity/interactionStats').then((mod) => {
    if (cancelled || !wired) return;
    stopFlush = mod.startInteractionStatsFlush();
  });

  const onClick = () => {
    if (!activityPaused) bumpInteraction('click');
    touchUserActivity();
  };
  const onKey = () => {
    if (!activityPaused) bumpInteraction('keydown');
    touchUserActivity();
  };
  const onTouch = () => {
    if (!activityPaused) bumpInteraction('touch');
    touchUserActivity();
  };
  const onPointer = () => touchUserActivity();
  const onScroll = () => touchUserActivity();

  document.addEventListener('click', onClick, { passive: true });
  document.addEventListener('keydown', onKey, { passive: true });
  document.addEventListener('touchstart', onTouch, { passive: true });
  document.addEventListener('pointerdown', onPointer, { passive: true });
  document.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('mousedown', onPointer, { passive: true });

  const navHandler = () => {
    if (!activityPaused) bumpInteraction('navigation');
    touchUserActivity();
  };
  window.addEventListener('tmseg:navigate', navHandler);
  window.addEventListener('tmseg:screen-change', navHandler);

  return () => {
    cancelled = true;
    document.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('touchstart', onTouch);
    document.removeEventListener('pointerdown', onPointer);
    document.removeEventListener('scroll', onScroll);
    document.removeEventListener('mousedown', onPointer);
    window.removeEventListener('tmseg:navigate', navHandler);
    window.removeEventListener('tmseg:screen-change', navHandler);
    stopFlush();
    wired = false;
  };
}
