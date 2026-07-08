import type { TimeClockEntry } from './types';
import { getNextTimeClockStage } from './stages';

/** CLT em serviço: bateu entrada hoje e ainda não encerrou a jornada. */
export function isCltOnDutyToday(entries: Pick<TimeClockEntry, 'type' | 'timestamp'>[]): boolean {
  if (entries.length === 0) return false;
  const hasIn = entries.some((e) => e.type === 'IN');
  if (!hasIn) return false;
  return getNextTimeClockStage(entries) !== 'DONE';
}

/**
 * Rótulo textual do estado atual do CLT:
 * - Aguardando ponto: ainda não bateu entrada hoje
 * - Em serviço:       bateu entrada, ainda não saiu para almoço
 * - Em almoço:        saiu para almoço, ainda não voltou
 * - Em serviço:       voltou do almoço, ainda não encerrou
 * - Fora do expediente: encerrou a jornada
 */
export function getOnDutyStageLabel(entries: Pick<TimeClockEntry, 'type'>[]): string {
  const next = getNextTimeClockStage(entries);
  if (next === 'DONE') return 'Fora do expediente';
  if (next === 'IN') return 'Aguardando ponto';
  if (next === 'BREAK_START') return 'Em serviço';
  if (next === 'BREAK_END') return 'Em almoço';
  if (next === 'OUT') return 'Em serviço';
  return 'Em serviço';
}

/** Minutos em serviço hoje (desde última entrada ou retorno do almoço). */
export function getMinutesOnDutyToday(entries: Pick<TimeClockEntry, 'type' | 'timestamp'>[]): number {
  if (!entries.length) return 0;
  const sorted = [...entries].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  let anchor: string | null = null;
  for (const e of sorted) {
    if (e.type === 'IN' || e.type === 'BREAK_END') anchor = e.timestamp;
    if (e.type === 'OUT') anchor = null;
  }
  if (!anchor) return 0;
  const start = new Date(anchor).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((Date.now() - start) / 60_000));
}
