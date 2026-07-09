import { formatIsoDateBR, getPreviousIsoDateBR } from '../dateUtils';
import { getNextTimeClockStage } from './stages';
import { normalizeShiftType } from './shiftRules';
import type { TimeClockEntry } from './types';

/** Plantão noturno encerra às 08:00 (BRT) do dia seguinte. */
export const SHIFT_NOTURNO_PLANTAO_END = { hour: 8, minute: 0 };

/** Jornada iniciada (IN) e ainda sem saída final (OUT). */
export function hasOpenShiftJourney(entries: Pick<TimeClockEntry, 'type'>[]): boolean {
  if (entries.length === 0) return false;
  const next = getNextTimeClockStage(entries);
  return next !== 'DONE' && next !== 'IN';
}

/** Une batidas de dias consecutivos (plantão noturno 20:00 → 08:00). */
export function mergeShiftEntries(
  earlier: TimeClockEntry[],
  later: TimeClockEntry[],
): TimeClockEntry[] {
  const byKey = new Map<string, TimeClockEntry>();
  for (const e of [...earlier, ...later]) {
    const key = `${e.type}|${e.timestamp}`;
    byKey.set(key, e);
  }
  return [...byKey.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/**
 * Para turno noturno: se ontem ficou plantão aberto (IN sem OUT), carrega as batidas
 * de ontem junto com as de hoje — evita bloqueio após 00:00.
 */
export function resolveActiveShiftEntries(
  todayEntries: TimeClockEntry[],
  yesterdayEntries: TimeClockEntry[],
  shiftType: string | null | undefined,
): TimeClockEntry[] {
  if (normalizeShiftType(shiftType) !== 'noturno') return todayEntries;
  if (!hasOpenShiftJourney(yesterdayEntries)) return todayEntries;
  return mergeShiftEntries(yesterdayEntries, todayEntries);
}

export type FetchDayEntriesFn = (userId: string, isoDate: string) => Promise<TimeClockEntry[]>;

/** Busca batidas do dia civil + carry-over do plantão noturno anterior. */
export async function fetchActiveShiftEntries(
  userId: string,
  fetchDayEntries: FetchDayEntriesFn,
  shiftType?: string | null,
): Promise<TimeClockEntry[]> {
  const today = formatIsoDateBR();
  const todayEntries = await fetchDayEntries(userId, today);

  if (normalizeShiftType(shiftType) !== 'noturno') {
    return todayEntries;
  }

  const yesterday = getPreviousIsoDateBR(today);
  const yesterdayEntries = await fetchDayEntries(userId, yesterday);
  return resolveActiveShiftEntries(todayEntries, yesterdayEntries, shiftType);
}
