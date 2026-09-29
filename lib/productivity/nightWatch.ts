/**
 * Controle de improdutividade noturno (home office).
 * Janela: 20:00 → 08:00 (America/Sao_Paulo).
 * Sem interação por NIGHT_IDLE_MS → desafio de presença (clique + palavra-chave + OK).
 */

export const NIGHT_WATCH_TZ = 'America/Sao_Paulo';

/** Minutos sem interação na janela noturna antes de bloquear a tela (desafio). */
export const NIGHT_IDLE_MINUTES = 10;
export const NIGHT_IDLE_MS = NIGHT_IDLE_MINUTES * 60 * 1000;

/**
 * Minutos sem interação na vigia noturna antes de forçar logout
 * (mais rígido que o logout diurno de 30 min).
 */
export const NIGHT_FORCE_LOGOUT_MINUTES = 20;
export const NIGHT_FORCE_LOGOUT_MS = NIGHT_FORCE_LOGOUT_MINUTES * 60 * 1000;

/** Intervalo do heartbeat de presença noturna (cliente → servidor). */
export const NIGHT_HEARTBEAT_INTERVAL_MINUTES = 30;
export const NIGHT_HEARTBEAT_INTERVAL_MS = NIGHT_HEARTBEAT_INTERVAL_MINUTES * 60 * 1000;

/**
 * Sem heartbeat por estes minutos na vigia → alerta e-mail à diretoria.
 * Deve ser > NIGHT_HEARTBEAT_INTERVAL para evitar falso positivo.
 * Pedido Thiago: 1h30 sem sinal.
 */
export const NIGHT_STALE_ALERT_MINUTES = 90;

/** Tempo máximo do desafio aberto sem resposta → timeout + logout. */
export const NIGHT_CHALLENGE_TIMEOUT_MS = 10 * 60 * 1000;

/** Início da vigia (hora local BRT). */
export const NIGHT_WATCH_START_HOUR = 20;
/** Fim da vigia (hora local BRT do dia seguinte). */
export const NIGHT_WATCH_END_HOUR = 8;

/**
 * Horário de janta do plantão noturno (BRT) — não contabiliza improdutividade
 * e não dispara desafio de presença.
 * Janela: 00:00 (inclusive) → 01:00 (exclusive).
 */
export const DINNER_BREAK_START = { hour: 0, minute: 0 };
export const DINNER_BREAK_END = { hour: 1, minute: 0 };

/** Palavras-chave simples (sem acento) exibidas no desafio. */
export const NIGHT_WATCH_KEYWORDS = [
  'PRESENTE',
  'TRABALHO',
  'ATENCAO',
  'OPERACAO',
  'VIGILANTE',
  'SEGURANCA',
  'PLANTAO',
  'SERVICO',
  'MONITOR',
  'CENTRAL',
] as const;

const EXEMPT_ROLES = new Set([
  'diretoria',
  'diretor',
  'diretor(a)',
  'administrador',
  'admin',
  'ceo',
]);

export type NightWatchParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

/** Partes de data/hora no fuso de Brasília. */
export function getBrasiliaParts(date: Date = new Date()): NightWatchParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: NIGHT_WATCH_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

/** true entre 20:00 (inclusive) e 08:00 (exclusive) no horário de Brasília. */
export function isNightWatchWindow(date: Date = new Date()): boolean {
  const { hour } = getBrasiliaParts(date);
  return hour >= NIGHT_WATCH_START_HOUR || hour < NIGHT_WATCH_END_HOUR;
}

/** true durante a janta (00:00–01:00 BRT) — pausa não conta como ociosidade. */
export function isDinnerBreakWindow(date: Date = new Date()): boolean {
  const { hour, minute } = getBrasiliaParts(date);
  const nowMin = hour * 60 + minute;
  const startMin = DINNER_BREAK_START.hour * 60 + DINNER_BREAK_START.minute;
  const endMin = DINNER_BREAK_END.hour * 60 + DINNER_BREAK_END.minute;
  return nowMin >= startMin && nowMin < endMin;
}

/**
 * Vigia efetiva: dentro de 20h–08h e fora do horário de janta.
 * É esta função que deve disparar o desafio de presença.
 */
export function isNightWatchActive(date: Date = new Date()): boolean {
  return isNightWatchWindow(date) && !isDinnerBreakWindow(date);
}

export function dinnerBreakLabel(): string {
  const padN = (n: number) => String(n).padStart(2, '0');
  return `${padN(DINNER_BREAK_START.hour)}:${padN(DINNER_BREAK_START.minute)}–${padN(DINNER_BREAK_END.hour)}:${padN(DINNER_BREAK_END.minute)}`;
}

/** Diretoria / admin não entram no bloqueio noturno. */
export function isNightWatchExemptRole(role: string | null | undefined): boolean {
  const normalized = String(role || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return EXEMPT_ROLES.has(normalized);
}

export function pickNightWatchKeyword(random = Math.random()): string {
  const idx = Math.floor(random * NIGHT_WATCH_KEYWORDS.length) % NIGHT_WATCH_KEYWORDS.length;
  return NIGHT_WATCH_KEYWORDS[idx];
}

export function normalizeKeywordInput(value: string): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function keywordMatches(expected: string, typed: string): boolean {
  return normalizeKeywordInput(typed) === normalizeKeywordInput(expected);
}

/**
 * Intervalo do plantão noturno que terminou (ou termina) no dia civil de referência às 08:00.
 * Ex.: ref = 06/08 09:00 → janela 05/08 20:00 → 06/08 08:00 (BRT), em UTC ISO.
 */
export function getNightWatchWindowBounds(reference: Date = new Date()): {
  startIso: string;
  endIso: string;
  label: string;
} {
  const p = getBrasiliaParts(reference);
  const endLocal = `${pad(p.year)}-${pad(p.month)}-${pad(p.day)}T${pad(NIGHT_WATCH_END_HOUR)}:00:00`;
  const endUtc = brasiliaLocalToUtc(endLocal);
  const startFixed = new Date(endUtc.getTime() - 12 * 3600_000);

  const startLabel = startFixed.toLocaleString('pt-BR', { timeZone: NIGHT_WATCH_TZ });
  const endLabel = endUtc.toLocaleString('pt-BR', { timeZone: NIGHT_WATCH_TZ });
  return {
    startIso: startFixed.toISOString(),
    endIso: endUtc.toISOString(),
    label: `${startLabel} → ${endLabel}`,
  };
}

/** Dia civil anterior (BRT) 00:00 → 24:00 para o log diário das 09h. */
export function getPreviousBrasiliaDayBounds(reference: Date = new Date()): {
  startIso: string;
  endIso: string;
  dateLabel: string;
} {
  const p = getBrasiliaParts(reference);
  const todayMidnightUtc = brasiliaLocalToUtc(
    `${pad(p.year)}-${pad(p.month)}-${pad(p.day)}T00:00:00`,
  );
  const startUtc = new Date(todayMidnightUtc.getTime() - 24 * 3600_000);
  const endUtc = todayMidnightUtc;
  const dateLabel = startUtc.toLocaleDateString('pt-BR', { timeZone: NIGHT_WATCH_TZ });
  return {
    startIso: startUtc.toISOString(),
    endIso: endUtc.toISOString(),
    dateLabel,
  };
}

/** Dia civil atual (BRT) 00:00 → reference (ex.: relatório parcial das 21h). */
export function getCurrentBrasiliaDayBounds(reference: Date = new Date()): {
  startIso: string;
  endIso: string;
  dateLabel: string;
} {
  const p = getBrasiliaParts(reference);
  const startUtc = brasiliaLocalToUtc(
    `${pad(p.year)}-${pad(p.month)}-${pad(p.day)}T00:00:00`,
  );
  const endUtc = reference;
  const dateLabel = startUtc.toLocaleDateString('pt-BR', { timeZone: NIGHT_WATCH_TZ });
  return {
    startIso: startUtc.toISOString(),
    endIso: endUtc.toISOString(),
    dateLabel,
  };
}

/**
 * Trecho noturno já iniciado no dia civil atual (20h → reference), se houver.
 * Antes das 20h BRT retorna janela vazia (start === end).
 */
export function getEveningNightSliceBounds(reference: Date = new Date()): {
  startIso: string;
  endIso: string;
  label: string;
} {
  const p = getBrasiliaParts(reference);
  const todayNightStart = brasiliaLocalToUtc(
    `${pad(p.year)}-${pad(p.month)}-${pad(p.day)}T${pad(NIGHT_WATCH_START_HOUR)}:00:00`,
  );
  if (reference.getTime() <= todayNightStart.getTime()) {
    const iso = reference.toISOString();
    return { startIso: iso, endIso: iso, label: '— (antes das 20h)' };
  }
  const startLabel = todayNightStart.toLocaleString('pt-BR', { timeZone: NIGHT_WATCH_TZ });
  const endLabel = reference.toLocaleString('pt-BR', { timeZone: NIGHT_WATCH_TZ });
  return {
    startIso: todayNightStart.toISOString(),
    endIso: reference.toISOString(),
    label: `${startLabel} → ${endLabel}`,
  };
}

/** Início da vigia noturna em andamento (ou a última, se ainda de manhã). */
export function getActiveNightWatchStart(reference: Date = new Date()): Date {
  const p = getBrasiliaParts(reference);
  if (p.hour >= NIGHT_WATCH_START_HOUR) {
    return brasiliaLocalToUtc(
      `${pad(p.year)}-${pad(p.month)}-${pad(p.day)}T${pad(NIGHT_WATCH_START_HOUR)}:00:00`,
    );
  }
  const todayMidnight = brasiliaLocalToUtc(
    `${pad(p.year)}-${pad(p.month)}-${pad(p.day)}T00:00:00`,
  );
  return new Date(todayMidnight.getTime() - (24 - NIGHT_WATCH_START_HOUR) * 3600_000);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Interpreta "YYYY-MM-DDTHH:mm:ss" como horário de Brasília e devolve Date UTC. */
export function brasiliaLocalToUtc(localIsoNoZone: string): Date {
  return new Date(`${localIsoNoZone}-03:00`);
}
