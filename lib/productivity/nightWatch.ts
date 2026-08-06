/**
 * Controle de improdutividade noturno (home office).
 * Janela: 20:00 → 08:00 (America/Sao_Paulo).
 * Sem interação por NIGHT_IDLE_MS → desafio de presença (clique + palavra-chave + OK).
 */

export const NIGHT_WATCH_TZ = 'America/Sao_Paulo';

/** Minutos sem interação na janela noturna antes de bloquear a tela. */
export const NIGHT_IDLE_MINUTES = 15;
export const NIGHT_IDLE_MS = NIGHT_IDLE_MINUTES * 60 * 1000;

/** Início da vigia (hora local BRT). */
export const NIGHT_WATCH_START_HOUR = 20;
/** Fim da vigia (hora local BRT do dia seguinte). */
export const NIGHT_WATCH_END_HOUR = 8;

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
  // Após 08:00: janela que terminou hoje 08:00. Antes das 08:00: ainda a janela atual (fim = hoje 08:00).
  const endLocal = `${pad(p.year)}-${pad(p.month)}-${pad(p.day)}T${pad(NIGHT_WATCH_END_HOUR)}:00:00`;
  const endUtc = brasiliaLocalToUtc(endLocal);
  // 20h → 08h = 12 horas
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
  // Meia-noite de hoje BRT
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

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Interpreta "YYYY-MM-DDTHH:mm:ss" como horário de Brasília e devolve Date UTC. */
export function brasiliaLocalToUtc(localIsoNoZone: string): Date {
  // Usa formatação inversa via offset fixo -03:00 (BRT sem DST desde 2019).
  return new Date(`${localIsoNoZone}-03:00`);
}
