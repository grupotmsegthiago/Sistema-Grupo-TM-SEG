/** Fuso horário oficial do sistema TM SEG. */
export const TMSEG_TIMEZONE = 'America/Sao_Paulo';

const TZ = TMSEG_TIMEZONE;

const TIME_HM: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TZ,
};

const DATE_SHORT: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: TZ,
};

const DATETIME_SHORT: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TZ,
};

function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const nowBR = (): Date => {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
};

/** Data dd/mm/aaaa em Brasília. */
export const formatDateBR = (date: string | Date | null | undefined): string => {
  const d = toDate(date);
  if (!d) return '—';
  return d.toLocaleDateString('pt-BR', DATE_SHORT);
};

/** Data e hora dd/mm/aaaa HH:MM em Brasília (sem segundos). */
export const formatDateTimeBR = (date: string | Date | null | undefined): string => {
  const d = toDate(date);
  if (!d) return '—';
  return d.toLocaleString('pt-BR', DATETIME_SHORT);
};

/** Hora HH:MM em Brasília. */
export const formatTimeBR = (date: string | Date | null | undefined, fallback = '—'): string => {
  const d = toDate(date);
  if (!d) return fallback;
  return d.toLocaleTimeString('pt-BR', TIME_HM);
};

/** Hora atual em Brasília — HH:MM. */
export const formatNowTimeBR = (date: Date = new Date()): string => {
  return date.toLocaleTimeString('pt-BR', TIME_HM);
};

/** Data ISO yyyy-mm-dd no fuso de Brasília. */
export const formatIsoDateBR = (date: Date = new Date()): string => {
  return date.toLocaleDateString('en-CA', { timeZone: TZ });
};

/**
 * Limites UTC (ISO) do dia civil em Brasília.
 * Corrige consultas que usavam T00:00:00 sem offset e perdiam batidas após ~21h BRT.
 */
export function getBrazilDayBounds(isoDate?: string): { date: string; start: string; end: string } {
  const date = (isoDate || formatIsoDateBR()).trim();
  const start = new Date(`${date}T00:00:00-03:00`).toISOString();
  const end = new Date(`${date}T23:59:59.999-03:00`).toISOString();
  return { date, start, end };
}

/** Monta ISO UTC a partir de data (yyyy-mm-dd) e hora HH:MM em Brasília. */
export function buildBrazilTimestampFromHm(isoDate: string, timeHm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(timeHm || '').trim());
  if (!m) throw new Error('Horário inválido — use HH:MM');
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) throw new Error('Horário inválido — use HH:MM entre 00:00 e 23:59');
  const hh = String(h).padStart(2, '0');
  const mm = String(min).padStart(2, '0');
  return new Date(`${isoDate.trim()}T${hh}:${mm}:00-03:00`).toISOString();
}

/** Agora formatado para rodapés e logs visíveis. */
export const formatNowDateTimeBR = (): string => formatDateTimeBR(new Date());

/** Hora HH:MM:SS — auditoria / checklist de conclusão de OS. */
export const formatTimeAuditBR = (date: string | Date | null | undefined, fallback = ''): string => {
  const d = toDate(date);
  if (!d) return fallback;
  return d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: TZ,
  });
};

/** Data/hora com segundos — auditoria interna. */
export const formatDateTimeAuditBR = (date: string | Date | null | undefined, fallback = '—'): string => {
  const d = toDate(date);
  if (!d) return fallback;
  return d.toLocaleString('pt-BR', { ...DATETIME_SHORT, second: '2-digit' });
};

export const toISOBR = (): string => {
  return new Date().toLocaleString('sv-SE', { timeZone: TZ }).replace(' ', 'T');
};

// Aliases usados em imports recentes
export const fmtDateTimeBR = formatDateTimeBR;
export const fmtTimeBR = formatTimeBR;
export const fmtNowTimeBR = formatNowTimeBR;
export const fmtIsoDateBR = formatIsoDateBR;
export const fmtNowDateTimeBR = formatNowDateTimeBR;
export const fmtDateBR = formatDateBR;
export const fmtTimeAuditBR = formatTimeAuditBR;
