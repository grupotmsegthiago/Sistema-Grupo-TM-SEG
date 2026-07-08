import { TMSEG_TIMEZONE } from '../dateUtils';

export type ShiftType = 'diurno' | 'noturno';

export const SHIFT_ENTRY_START: Record<ShiftType, { hour: number; minute: number }> = {
  diurno: { hour: 7, minute: 30 },
  noturno: { hour: 19, minute: 30 },
};

export const ACTIVITY_IDLE_MS = 10 * 60 * 1000;

export function normalizeShiftType(value: string | null | undefined): ShiftType {
  const v = String(value || '').trim().toLowerCase();
  return v === 'noturno' ? 'noturno' : 'diurno';
}

/** Hora local (BRT) a partir de um instante. */
export function getBrtParts(date: Date): { hour: number; minute: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TMSEG_TIMEZONE,
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  const wd = parts.find((p) => p.type === 'weekday')?.value || 'Mon';
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { hour, minute, weekday: map[wd] ?? 1 };
}

export function minutesSinceMidnight(hour: number, minute: number): number {
  return hour * 60 + minute;
}

export interface ShiftWindowResult {
  allowed: boolean;
  shiftType: ShiftType;
  message?: string;
  waitUntilLabel?: string;
}

/** Verifica se o operador pode bater a entrada (IN) agora. */
export function canPunchEntryNow(
  shiftTypeInput: string | null | undefined,
  now: Date = new Date(),
): ShiftWindowResult {
  const shiftType = normalizeShiftType(shiftTypeInput);
  const start = SHIFT_ENTRY_START[shiftType];
  const { hour, minute } = getBrtParts(now);
  const nowMin = minutesSinceMidnight(hour, minute);
  const startMin = minutesSinceMidnight(start.hour, start.minute);

  if (nowMin >= startMin) {
    return { allowed: true, shiftType };
  }

  const label = `${String(start.hour).padStart(2, '0')}:${String(start.minute).padStart(2, '0')}`;
  const turno = shiftType === 'noturno' ? 'noturno' : 'diurno';
  return {
    allowed: false,
    shiftType,
    waitUntilLabel: label,
    message: `Turno ${turno}: batida de entrada liberada após ${label}.`,
  };
}
