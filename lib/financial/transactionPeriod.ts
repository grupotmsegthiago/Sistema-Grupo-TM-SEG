/**
 * Período de vencimento para Contas a Pagar / Receber.
 * A consulta no banco usa este intervalo — o filtro da tela não pode
 * depender de um recorte incompleto do histórico.
 */

export type PeriodoFiltroFinanceiro = 'DAY' | 'WEEK' | 'MONTH' | 'CUSTOM' | 'ALL';

export type IntervaloVencimento = {
  start: string;
  end: string;
};

function isoDay(year: number, monthIndex: number, day: number): string {
  const y = String(year).padStart(4, '0');
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseIsoDay(iso: string | null | undefined): string {
  const s = String(iso || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

/** Dia / semana / mês / personalizado. `null` = universo completo (Tudo). */
export function resolverPeriodoVencimento(opts: {
  viewPeriod: PeriodoFiltroFinanceiro;
  today: string;
  customStart?: string | null;
  customEnd?: string | null;
}): IntervaloVencimento | null {
  const today = parseIsoDay(opts.today);
  if (!today) return null;
  if (opts.viewPeriod === 'ALL') return null;
  if (opts.viewPeriod === 'DAY') return { start: today, end: today };

  if (opts.viewPeriod === 'CUSTOM') {
    let start = parseIsoDay(opts.customStart) || today;
    let end = parseIsoDay(opts.customEnd) || today;
    if (start > end) {
      const swap = start;
      start = end;
      end = swap;
    }
    return { start, end };
  }

  const [ys, ms, ds] = today.split('-').map(Number);
  const now = new Date(ys, (ms || 1) - 1, ds || 1);

  if (opts.viewPeriod === 'WEEK') {
    const day = now.getDay();
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - day);
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    return {
      start: isoDay(sunday.getFullYear(), sunday.getMonth(), sunday.getDate()),
      end: isoDay(saturday.getFullYear(), saturday.getMonth(), saturday.getDate()),
    };
  }

  const year = now.getFullYear();
  const month = now.getMonth();
  const last = new Date(year, month + 1, 0).getDate();
  return {
    start: isoDay(year, month, 1),
    end: isoDay(year, month, last),
  };
}
