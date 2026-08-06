/**
 * Contadores locais de cliques/interações (localStorage).
 * Sem dependência de Supabase — seguro para testes Node.
 */

import { getBrasiliaParts } from './nightWatch';

const STORAGE_KEY = 'tmseg:productivity-stats';

export type InteractionStats = {
  dayKey: string;
  clicks: number;
  keydowns: number;
  navigations: number;
  touches: number;
  interactions: number;
  lastFlushAt: string | null;
  sessionStartedAt: string;
};

export type InteractionKind = 'click' | 'keydown' | 'navigation' | 'touch';

function dayKeyBRT(date = new Date()): string {
  const p = getBrasiliaParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function emptyInteractionStats(date = new Date()): InteractionStats {
  const now = new Date().toISOString();
  return {
    dayKey: dayKeyBRT(date),
    clicks: 0,
    keydowns: 0,
    navigations: 0,
    touches: 0,
    interactions: 0,
    lastFlushAt: null,
    sessionStartedAt: now,
  };
}

export function readInteractionStats(): InteractionStats {
  try {
    if (typeof localStorage === 'undefined') return emptyInteractionStats();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyInteractionStats();
    const parsed = JSON.parse(raw) as InteractionStats;
    const today = dayKeyBRT();
    if (!parsed || parsed.dayKey !== today) return emptyInteractionStats();
    return { ...emptyInteractionStats(), ...parsed, dayKey: today };
  } catch {
    return emptyInteractionStats();
  }
}

export function writeInteractionStats(stats: InteractionStats): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // ignora
  }
}

export function bumpInteraction(kind: InteractionKind): InteractionStats {
  const stats = readInteractionStats();
  if (kind === 'click') stats.clicks += 1;
  else if (kind === 'keydown') stats.keydowns += 1;
  else if (kind === 'navigation') stats.navigations += 1;
  else stats.touches += 1;
  stats.interactions =
    stats.clicks + stats.keydowns + stats.navigations + stats.touches;
  writeInteractionStats(stats);
  return stats;
}
