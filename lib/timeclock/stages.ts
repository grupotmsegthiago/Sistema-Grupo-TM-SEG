import type { TimeClockEntry, TimeClockStage, TimeClockStageState } from './types';

export const TIME_CLOCK_STAGE_ORDER: TimeClockStage[] = ['IN', 'BREAK_START', 'BREAK_END', 'OUT'];

export const TIME_CLOCK_STAGE_LABELS: Record<TimeClockStage, string> = {
  IN: 'Entrada',
  BREAK_START: 'Saída almoço',
  BREAK_END: 'Retorno almoço',
  OUT: 'Fim do expediente',
};

export const TIME_CLOCK_STAGE_SHORT: Record<TimeClockStage, string> = {
  IN: 'Entrada',
  BREAK_START: 'S. Almoço',
  BREAK_END: 'R. Almoço',
  OUT: 'Saída',
};

export function getNextTimeClockStage(history: Pick<TimeClockEntry, 'type'>[]): TimeClockStageState {
  const done = new Set(history.map((h) => h.type));
  for (const stage of TIME_CLOCK_STAGE_ORDER) {
    if (!done.has(stage)) return stage;
  }
  return 'DONE';
}

export function isTimeClockJourneyComplete(history: Pick<TimeClockEntry, 'type'>[]): boolean {
  return getNextTimeClockStage(history) === 'DONE';
}

export function getTimeClockEntryForStage(
  history: TimeClockEntry[],
  stage: TimeClockStage
): TimeClockEntry | undefined {
  return history.find((h) => h.type === stage);
}
