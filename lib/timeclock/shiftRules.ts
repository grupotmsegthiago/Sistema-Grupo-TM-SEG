import { TMSEG_TIMEZONE } from '../dateUtils';

export type ShiftType = 'diurno' | 'noturno';

/** Referência de início do turno (documentação / plantão). Não bloqueia mais a batida. */
export const SHIFT_ENTRY_START: Record<ShiftType, { hour: number; minute: number }> = {
  diurno: { hour: 7, minute: 30 },
  noturno: { hour: 19, minute: 30 },
};

/** Plantão noturno segue até 09:30 do dia seguinte (usado no carry-over de batidas). */
export const SHIFT_NOTURNO_PLANTAO_END = { hour: 9, minute: 30 };

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

/**
 * Verifica se o operador pode bater a entrada (IN) agora.
 * Regra de horário removida: entrada liberada a qualquer momento (diurno e noturno).
 */
export function canPunchEntryNow(
  shiftTypeInput: string | null | undefined,
  _now: Date = new Date(),
): ShiftWindowResult {
  const shiftType = normalizeShiftType(shiftTypeInput);
  return { allowed: true, shiftType };
}
