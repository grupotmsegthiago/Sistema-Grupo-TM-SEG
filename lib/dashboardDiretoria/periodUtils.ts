import type { DashboardPeriod } from './types';

/** Primeiro e último instante do mês selecionado (fim = hoje se mês corrente). */
export function getMonthRange(period: DashboardPeriod): { start: Date; end: Date; startIso: string; endIso: string } {
  const now = new Date();
  const isCurrentMonth = period.year === now.getFullYear() && period.month === now.getMonth();
  const start = new Date(period.year, period.month, 1, 0, 0, 0, 0);
  const end = isCurrentMonth
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    : new Date(period.year, period.month + 1, 0, 23, 59, 59, 999);
  const pad = (n: number) => String(n).padStart(2, '0');
  const startIso = `${period.year}-${pad(period.month + 1)}-01`;
  const endIso = `${period.year}-${pad(period.month + 1)}-${pad(end.getDate())}`;
  return { start, end, startIso, endIso };
}

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function formatPeriodLabel(period: DashboardPeriod): string {
  return `${MONTH_NAMES[period.month]} ${period.year}`;
}

export function buildYearOptions(back = 3): number[] {
  const y = new Date().getFullYear();
  return Array.from({ length: back + 1 }, (_, i) => y - i);
}
