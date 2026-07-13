import type { DashboardPeriod, DashboardPeriodMode } from './types';
import type { FinancialTransaction } from '../../types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Data de movimentação de caixa: pagamento quando PAID, senão vencimento. */
export function getCashMovementDate(t: FinancialTransaction): string {
  if (t.status === 'PAID') {
    const paid = String(t.payment_date || '').slice(0, 10);
    if (paid) return paid;
  }
  return String(t.due_date || '').slice(0, 10);
}

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Segunda-feira 00:00 da semana que contém `ref` (semana seg–dom, horário local). */
export function getWeekMonday(ref: Date): Date {
  const day = ref.getDay(); // 0=dom … 6=sáb
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(ref);
  monday.setDate(ref.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/** Domingo 23:59:59 da semana que contém `ref`. */
export function getWeekSunday(ref: Date): Date {
  const sunday = new Date(getWeekMonday(ref));
  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return sunday;
}

/** Intervalo do período selecionado (início/fim inclusivos no fuso local). */
export function getPeriodRange(
  period: DashboardPeriod,
  now = new Date(),
): { start: Date; end: Date; startIso: string; endIso: string } {
  const mode: DashboardPeriodMode = period.mode ?? 'month';

  if (mode === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const iso = toIsoDate(start);
    return { start, end, startIso: iso, endIso: iso };
  }

  if (mode === 'week') {
    const start = getWeekMonday(now);
    const end = getWeekSunday(now);
    return { start, end, startIso: toIsoDate(start), endIso: toIsoDate(end) };
  }

  // Mês = calendário completo (01 → último dia), inclusive o mês corrente.
  // Assim "Falta entrar/pagar" inclui vencimentos ainda por cair no mês.
  const start = new Date(period.year, period.month, 1, 0, 0, 0, 0);
  const end = new Date(period.year, period.month + 1, 0, 23, 59, 59, 999);
  const startIso = `${period.year}-${pad(period.month + 1)}-01`;
  const endIso = `${period.year}-${pad(period.month + 1)}-${pad(end.getDate())}`;
  return { start, end, startIso, endIso };
}

/** @deprecated use getPeriodRange */
export const getMonthRange = getPeriodRange;

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function formatPeriodLabel(period: DashboardPeriod, now = new Date()): string {
  const mode: DashboardPeriodMode = period.mode ?? 'month';
  if (mode === 'today') {
    return `Hoje, ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
  }
  if (mode === 'week') {
    const start = getWeekMonday(now);
    const end = getWeekSunday(now);
    return `Semana ${pad(start.getDate())}/${pad(start.getMonth() + 1)} – ${pad(end.getDate())}/${pad(end.getMonth() + 1)}/${end.getFullYear()}`;
  }
  return `${MONTH_NAMES[period.month]} ${period.year}`;
}

/** Sempre mostra o intervalo calendário do mês selecionado (01 → último dia). */
export function formatPeriodRangeHint(period: DashboardPeriod, _now = new Date()): string | null {
  const mode: DashboardPeriodMode = period.mode ?? 'month';
  if (mode !== 'month') return null;
  const { startIso, endIso } = getPeriodRange(period, _now);
  const [, sm, sd] = startIso.split('-');
  const [, em, ed] = endIso.split('-');
  return `Período: ${sd}/${sm}/${period.year} até ${ed}/${em}/${period.year}`;
}

/** Mês de referência para RH/comissões (sempre calendário do “agora” em hoje/semana). */
export function getRhReferenceMonth(period: DashboardPeriod, now = new Date()): string {
  const mode: DashboardPeriodMode = period.mode ?? 'month';
  if (mode === 'month') {
    return `${period.year}-${pad(period.month + 1)}`;
  }
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

export function buildYearOptions(back = 3): number[] {
  const y = new Date().getFullYear();
  return Array.from({ length: back + 1 }, (_, i) => y - i);
}

export function createDefaultPeriod(now = new Date()): DashboardPeriod {
  return { mode: 'month', year: now.getFullYear(), month: now.getMonth() };
}
