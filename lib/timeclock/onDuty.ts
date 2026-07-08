import type { TimeClockEntry } from './types';
import { getNextTimeClockStage } from './stages';

/** CLT em serviço: bateu entrada hoje e ainda não encerrou a jornada. */
export function isCltOnDutyToday(entries: Pick<TimeClockEntry, 'type'>[]): boolean {
  if (entries.length === 0) return false;
  const hasIn = entries.some((e) => e.type === 'IN');
  if (!hasIn) return false;
  return getNextTimeClockStage(entries) !== 'DONE';
}

export function getOnDutyStageLabel(entries: Pick<TimeClockEntry, 'type'>[]): string {
  const next = getNextTimeClockStage(entries);
  if (next === 'DONE') return 'Jornada encerrada';
  if (next === 'IN') return 'Aguardando entrada';
  if (next === 'BREAK_START') return 'Em expediente';
  if (next === 'BREAK_END') return 'Em almoço';
  if (next === 'OUT') return 'Retorno do almoço';
  return 'Em serviço';
}
