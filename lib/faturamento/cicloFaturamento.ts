import { formatIsoDateFromTimestampBR } from '../dateUtils.js';

export type CicloFaturamento = 'diario' | 'quinzenal' | 'mensal';

export type PeriodoFaturamento = {
  start: string;
  end: string;
  ciclo: CicloFaturamento;
  label: string;
  chave: string;
};

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'] as const;

export function parseCicloFaturamento(raw: unknown): CicloFaturamento | null {
  const s = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  if (s === 'diario' || s === 'diaria' || s === 'day') return 'diario';
  if (s === 'quinzenal' || s === 'quinzena' || s === 'biweekly') return 'quinzenal';
  if (s === 'mensal' || s === 'mes' || s === 'monthly') return 'mensal';
  return null;
}

export function labelCicloFaturamento(ciclo: CicloFaturamento | null | undefined): string {
  if (ciclo === 'diario') return 'Diário';
  if (ciclo === 'quinzenal') return 'Quinzenal';
  if (ciclo === 'mensal') return 'Mensal';
  return 'Não cadastrado';
}

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function parseIsoDateParts(iso: string | null | undefined): { y: number; m: number; d: number } | null {
  const s = String(iso || '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

export function addDaysIso(iso: string, days: number): string {
  const p = parseIsoDateParts(iso);
  if (!p) return iso;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function diffDaysIso(from: string, to: string): number | null {
  const a = parseIsoDateParts(from);
  const b = parseIsoDateParts(to);
  if (!a || !b) return null;
  const da = Date.UTC(a.y, a.m - 1, a.d);
  const db = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((db - da) / 86_400_000);
}

export function isoInRange(iso: string, start: string, end: string): boolean {
  const d = String(iso || '').slice(0, 10);
  return d >= start && d <= end;
}

export function periodoEstaFechado(periodo: Pick<PeriodoFaturamento, 'end'>, todayIso: string): boolean {
  return periodo.end < todayIso;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function labelMes(year: number, month: number): string {
  return `${MONTH_SHORT[month - 1] || pad2(month)}/${year}`;
}

export function periodoQueContemData(ciclo: CicloFaturamento, isoDate: string): PeriodoFaturamento | null {
  const p = parseIsoDateParts(isoDate);
  if (!p) return null;
  const y = p.y;
  const m = p.m;
  const last = lastDayOfMonth(y, m);
  const ym = `${y}-${pad2(m)}`;

  if (ciclo === 'diario') {
    const day = `${ym}-${pad2(p.d)}`;
    return {
      start: day,
      end: day,
      ciclo,
      label: `${pad2(p.d)}/${pad2(m)}/${y}`,
      chave: `D:${day}`,
    };
  }

  if (ciclo === 'mensal') {
    return {
      start: `${ym}-01`,
      end: `${ym}-${pad2(last)}`,
      ciclo,
      label: labelMes(y, m),
      chave: `M:${ym}`,
    };
  }

  if (p.d <= 15) {
    return {
      start: `${ym}-01`,
      end: `${ym}-15`,
      ciclo,
      label: `1ª quinzena ${labelMes(y, m)}`,
      chave: `Q1:${ym}`,
    };
  }
  return {
    start: `${ym}-16`,
    end: `${ym}-${pad2(last)}`,
    ciclo,
    label: `2ª quinzena ${labelMes(y, m)}`,
    chave: `Q2:${ym}`,
  };
}

export function periodoVigente(ciclo: CicloFaturamento, todayIso: string): PeriodoFaturamento | null {
  return periodoQueContemData(ciclo, todayIso);
}

export function ultimoPeriodoFechado(ciclo: CicloFaturamento, todayIso: string): PeriodoFaturamento | null {
  const vigente = periodoVigente(ciclo, todayIso);
  if (!vigente) return null;
  const diaAntes = addDaysIso(vigente.start, -1);
  return periodoQueContemData(ciclo, diaAntes);
}

/** Períodos fechados (end < hoje) cujo fim está em [fromIso, toIso]. */
export function periodosFechadosNoIntervalo(
  ciclo: CicloFaturamento,
  fromIso: string,
  toIso: string,
  todayIso: string,
): PeriodoFaturamento[] {
  const out: PeriodoFaturamento[] = [];
  const seen = new Set<string>();
  let cursor = fromIso;
  let guard = 0;
  while (cursor <= toIso && guard < 800) {
    guard += 1;
    const p = periodoQueContemData(ciclo, cursor);
    if (!p) break;
    if (periodoEstaFechado(p, todayIso) && !seen.has(p.chave)) {
      seen.add(p.chave);
      out.push(p);
    }
    cursor = addDaysIso(p.end, 1);
    if (cursor <= p.start) break;
  }
  return out;
}

export function competenciaOs(mission: {
  start_time?: string | null;
  billing_period_override?: string | null;
}): string | null {
  const override = String(mission.billing_period_override || '').trim();
  if (override) {
    return formatIsoDateFromTimestampBR(override) || override.slice(0, 10);
  }
  const start = String(mission.start_time || '').trim();
  if (!start) return null;
  return formatIsoDateFromTimestampBR(start) || start.slice(0, 10);
}

export function osExcluidaDoBoletim(mission: {
  status?: string | null;
  exclude_from_billing?: boolean | null;
}): boolean {
  if (mission.exclude_from_billing === true) return true;
  const st = String(mission.status || '').trim().toLowerCase();
  return st === 'recusada';
}
