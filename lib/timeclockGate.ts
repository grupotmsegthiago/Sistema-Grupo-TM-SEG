/** Lógica compartilhada do gate de ponto eletrônico (jornada diária). */

export type TimeClockStage = 'IN' | 'BREAK_START' | 'BREAK_END' | 'OUT';
export type TimeClockGateMode = 'skip' | 'must_punch' | 'can_continue';

export interface TimeClockEntry {
  type: string;
  timestamp: string;
}

export interface TimeClockGateState {
  required: boolean;
  mode: TimeClockGateMode;
  currentStage: TimeClockStage;
  message: string;
  title: string;
  dayComplete: boolean;
  history: TimeClockEntry[];
}

export const LUNCH_WINDOW_START = 12;
export const LUNCH_WINDOW_END = 14;
export const END_OF_DAY_HOUR = 17;

/** Hora decimal no fuso America/Sao_Paulo. */
export function getBrazilHour(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const h = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const m = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  return h + m / 60;
}

function hasType(entries: TimeClockEntry[], type: TimeClockStage): boolean {
  return entries.some((e) => e.type === type);
}

export function evaluateTimeclockGate(
  requiresClock: boolean,
  entries: TimeClockEntry[],
  now = new Date(),
): TimeClockGateState {
  const base = { history: entries, dayComplete: false };

  if (!requiresClock) {
    return { ...base, required: false, mode: 'skip', currentStage: 'IN', message: '', title: '', dayComplete: false };
  }

  if (hasType(entries, 'OUT')) {
    return { ...base, required: false, mode: 'skip', currentStage: 'OUT', message: '', title: '', dayComplete: true };
  }

  const hour = getBrazilHour(now);

  if (!hasType(entries, 'IN')) {
    return {
      ...base,
      required: true,
      mode: 'must_punch',
      currentStage: 'IN',
      title: 'Bata o ponto — Entrada',
      message: 'Registre sua entrada para iniciar o expediente de hoje.',
    };
  }

  if (!hasType(entries, 'BREAK_START')) {
    if (hour >= LUNCH_WINDOW_START && hour < LUNCH_WINDOW_END) {
      return {
        ...base,
        required: true,
        mode: 'must_punch',
        currentStage: 'BREAK_START',
        title: 'Horário de almoço',
        message: 'Entre 12h e 14h: registre a saída para almoço.',
      };
    }
    if (hour >= LUNCH_WINDOW_END) {
      return {
        ...base,
        required: true,
        mode: 'must_punch',
        currentStage: 'BREAK_START',
        title: 'Saída para almoço pendente',
        message: 'Registre a saída para almoço antes de continuar.',
      };
    }
    return {
      ...base,
      required: true,
      mode: 'can_continue',
      currentStage: 'BREAK_START',
      title: 'Turno em andamento',
      message: 'Entrada registrada. Lembre-se de bater o ponto para almoço entre 12h e 14h.',
    };
  }

  if (!hasType(entries, 'BREAK_END')) {
    return {
      ...base,
      required: true,
      mode: 'must_punch',
      currentStage: 'BREAK_END',
      title: 'Retorno do almoço',
      message: 'Registre o retorno do almoço para continuar o expediente.',
    };
  }

  if (!hasType(entries, 'OUT')) {
    if (hour >= END_OF_DAY_HOUR) {
      return {
        ...base,
        required: true,
        mode: 'must_punch',
        currentStage: 'OUT',
        title: 'Fim de expediente',
        message: 'Registre sua saída para encerrar o dia de trabalho.',
      };
    }
    return {
      ...base,
      required: true,
      mode: 'can_continue',
      currentStage: 'OUT',
      title: 'Turno em andamento',
      message: 'Retorno do almoço registrado. Ao final do dia, registre o fim de expediente.',
    };
  }

  return { ...base, required: false, mode: 'skip', currentStage: 'OUT', message: '', title: '', dayComplete: true };
}
