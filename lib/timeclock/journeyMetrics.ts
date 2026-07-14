/**
 * Métricas de jornada do dia a partir das batidas CLT
 * (IN → BREAK_START → BREAK_END → OUT).
 */

export type JourneyPunch = { type: string; timestamp: string };

export interface JourneyDayMetrics {
  /** Minutos do trecho aberto de serviço agora (desde IN ou BREAK_END). */
  serviceOpenMinutes: number;
  /** Minutos de almoço no dia (concluído ou em andamento). */
  lunchMinutes: number;
  /** Minutos líquidos trabalhados no dia (exclui almoço). */
  workedMinutes: number;
  /** true se ainda está em almoço. */
  onLunch: boolean;
  /** true se jornada aberta (bateu IN e não bateu OUT). */
  onDuty: boolean;
}

const ms = (iso: string): number => {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : NaN;
};

const minutesBetween = (startIso: string, endMs: number): number => {
  const start = ms(startIso);
  if (!Number.isFinite(start) || !Number.isFinite(endMs) || endMs < start) return 0;
  return Math.max(0, Math.floor((endMs - start) / 60_000));
};

/** Formata minutos → "3h 15min" (ou "45min" se < 1h). */
export function formatDurationHoursMinutes(totalMinutes: number): string {
  const m = Math.max(0, Math.floor(Number(totalMinutes) || 0));
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h <= 0) return `${min}min`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}min`;
}

/**
 * Soma intervalos IN→BREAK_START + BREAK_END→OUT (ou até `now` se aberto).
 * Almoço = BREAK_START→BREAK_END (ou até `now` se ainda no almoço).
 */
export function computeJourneyDayMetrics(
  entries: JourneyPunch[],
  now: Date = new Date(),
): JourneyDayMetrics {
  const sorted = [...entries]
    .filter((e) => e?.timestamp && e?.type)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const nowMs = now.getTime();
  let worked = 0;
  let lunch = 0;
  let serviceOpen = 0;
  let onLunch = false;
  let onDuty = false;

  let serviceStart: string | null = null;
  let lunchStart: string | null = null;

  for (const e of sorted) {
    const type = String(e.type || '').toUpperCase();
    if (type === 'IN') {
      serviceStart = e.timestamp;
      lunchStart = null;
      onDuty = true;
      onLunch = false;
    } else if (type === 'BREAK_START') {
      if (serviceStart) {
        worked += minutesBetween(serviceStart, ms(e.timestamp));
      }
      serviceStart = null;
      lunchStart = e.timestamp;
      onLunch = true;
      onDuty = true;
    } else if (type === 'BREAK_END') {
      if (lunchStart) {
        lunch += minutesBetween(lunchStart, ms(e.timestamp));
      }
      lunchStart = null;
      serviceStart = e.timestamp;
      onLunch = false;
      onDuty = true;
    } else if (type === 'OUT') {
      if (serviceStart) {
        worked += minutesBetween(serviceStart, ms(e.timestamp));
      }
      if (lunchStart) {
        lunch += minutesBetween(lunchStart, ms(e.timestamp));
      }
      serviceStart = null;
      lunchStart = null;
      onLunch = false;
      onDuty = false;
    }
  }

  if (serviceStart) {
    serviceOpen = minutesBetween(serviceStart, nowMs);
    worked += serviceOpen;
  }
  if (lunchStart) {
    const openLunch = minutesBetween(lunchStart, nowMs);
    lunch += openLunch;
    onLunch = true;
  }

  return {
    serviceOpenMinutes: serviceOpen,
    lunchMinutes: lunch,
    workedMinutes: worked,
    onLunch,
    onDuty,
  };
}
