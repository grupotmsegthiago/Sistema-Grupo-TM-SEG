import { formatTimeBR } from '../dateUtils';
import { TIME_CLOCK_STAGE_SHORT } from './stages';
import type { TimeClockEntry, TimeClockStage } from './types';

export interface PresencePunchMark {
  type: TimeClockStage;
  label: string;
  time: string;
}

export function buildPunchMarks(
  entries: Pick<TimeClockEntry, 'type' | 'timestamp'>[],
): PresencePunchMark[] {
  return [...entries]
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map((entry) => ({
      type: entry.type,
      label: TIME_CLOCK_STAGE_SHORT[entry.type],
      time: formatTimeBR(entry.timestamp),
    }));
}
