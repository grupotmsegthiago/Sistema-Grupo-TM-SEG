/**
 * Flush periódico dos contadores de produtividade para system_logs.
 */

import { supabase } from '../supabase';
import {
  readInteractionStats,
  writeInteractionStats,
  type InteractionStats,
} from './interactionCounters';

export type { InteractionStats, InteractionKind } from './interactionCounters';
export { bumpInteraction, readInteractionStats } from './interactionCounters';

const FLUSH_INTERVAL_MS = 5 * 60 * 1000;

function readUserName(): string {
  try {
    const u = JSON.parse(localStorage.getItem('userData') || '{}');
    return String(u?.name || 'Sistema');
  } catch {
    return 'Sistema';
  }
}

function readUserId(): string {
  try {
    const u = JSON.parse(localStorage.getItem('userData') || '{}');
    return String(u?.id ?? 'unknown');
  } catch {
    return 'unknown';
  }
}

/** Grava snapshot acumulado do dia em system_logs. */
export async function flushInteractionStats(reason: string = 'interval'): Promise<boolean> {
  const stats = readInteractionStats();
  if (stats.interactions <= 0) return false;

  const payload = {
    ...stats,
    flushedAt: new Date().toISOString(),
    reason,
  };

  try {
    const { error } = await supabase.from('system_logs').insert([
      {
        user_name: readUserName(),
        action_type: 'PRODUCTIVITY_STATS',
        entity: 'Productivity',
        entity_id: readUserId(),
        details: JSON.stringify(payload),
        created_at: new Date().toISOString(),
      },
    ]);
    if (error) {
      console.warn('[Productivity] Falha ao gravar stats:', error.message);
      return false;
    }
    stats.lastFlushAt = payload.flushedAt;
    writeInteractionStats(stats);
    return true;
  } catch (e) {
    console.warn('[Productivity] Erro ao flush stats:', e);
    return false;
  }
}

let flushTimer: ReturnType<typeof setInterval> | null = null;

export function startInteractionStatsFlush(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (flushTimer) return () => {};
  flushTimer = setInterval(() => {
    void flushInteractionStats('interval');
  }, FLUSH_INTERVAL_MS);

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      void flushInteractionStats('visibility');
    }
  };
  const onHide = () => {
    void flushInteractionStats('visibility');
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('beforeunload', onHide);

  return () => {
    if (flushTimer) clearInterval(flushTimer);
    flushTimer = null;
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('beforeunload', onHide);
    void flushInteractionStats('unmount');
  };
}
