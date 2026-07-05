// Histórico das últimas atualizações de meta (gráfico Monitoramento) — só diretoria vê no UI.
// Amostras agrupadas a cada 30 minutos por filtro de período.

export type GoalUpdateSnapshot = {
  at: string;
  revenue: number;
  cost: number;
  profit: number;
  missionCount: number;
  percentage: number;
  deltaRevenue: number | null;
  deltaCost: number | null;
  deltaProfit: number | null;
  deltaMissions: number | null;
  source: 'manual' | 'sync';
};

/** Intervalo fixo de amostragem do gráfico. */
export const GOAL_SAMPLE_INTERVAL_MS = 30 * 60 * 1000;

/** Pontos exibidos no sparkline (últimas 30 amostras de 30 min = 15 h). */
export const GOAL_CHART_POINTS = 30;

/** ~31 dias de amostras de 30 min por filtro. */
export const GOAL_MAX_HISTORY_ENTRIES = 48 * 31;

const STORAGE_PREFIX = 'tmseg_goal_history_';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function localDateKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function bucketTimestampMs(at: string | Date): number {
  const t = typeof at === 'string' ? new Date(at).getTime() : at.getTime();
  return Math.floor(t / GOAL_SAMPLE_INTERVAL_MS) * GOAL_SAMPLE_INTERVAL_MS;
}

/** Chave de histórico escopada ao filtro ativo (hoje, mês corrente, semana, etc.). */
export function resolveGoalHistoryKey(
  baseKey: string,
  viewPeriod: string,
  customStartDate?: string,
  customEndDate?: string,
  now: Date = new Date(),
): string {
  const period = viewPeriod || 'TODAY';
  switch (period) {
    case 'TODAY':
      return `${baseKey}-TODAY-${localDateKey(now)}`;
    case 'YESTERDAY': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return `${baseKey}-YESTERDAY-${localDateKey(y)}`;
    }
    case 'WEEK': {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      return `${baseKey}-WEEK-${localDateKey(weekStart)}`;
    }
    case 'MONTH':
      return `${baseKey}-MONTH-${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
    case 'YEAR':
      return `${baseKey}-YEAR-${now.getFullYear()}`;
    case 'CUSTOM':
      if (customStartDate && customEndDate) {
        return `${baseKey}-CUSTOM-${customStartDate}_${customEndDate}`;
      }
      return `${baseKey}-CUSTOM`;
    case 'ALL':
    default:
      return `${baseKey}-ALL`;
  }
}

function storageKey(key: string) {
  return `${STORAGE_PREFIX}${key}`;
}

export function loadGoalUpdateHistory(key: string): GoalUpdateSnapshot[] {
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(0, GOAL_MAX_HISTORY_ENTRIES)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  } catch {
    return [];
  }
}

/** Últimas N amostras de 30 min em ordem cronológica (para o gráfico). */
export function selectChartSnapshots(
  rows: GoalUpdateSnapshot[],
  maxPoints = GOAL_CHART_POINTS,
): GoalUpdateSnapshot[] {
  const sorted = [...rows].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return sorted.slice(-maxPoints);
}

export function pushGoalUpdateHistory(
  key: string,
  entry: Omit<GoalUpdateSnapshot, 'deltaRevenue' | 'deltaCost' | 'deltaProfit' | 'deltaMissions'>,
): GoalUpdateSnapshot[] {
  const prev = loadGoalUpdateHistory(key);
  const bucketMs = bucketTimestampMs(entry.at);
  const bucketAt = new Date(bucketMs).toISOString();

  const chronologicallyPrev = prev
    .filter(p => bucketTimestampMs(p.at) < bucketMs)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0] ?? null;

  const snapshot: GoalUpdateSnapshot = {
    ...entry,
    at: bucketAt,
    deltaRevenue: chronologicallyPrev ? entry.revenue - chronologicallyPrev.revenue : null,
    deltaCost: chronologicallyPrev ? entry.cost - chronologicallyPrev.cost : null,
    deltaProfit: chronologicallyPrev ? entry.profit - chronologicallyPrev.profit : null,
    deltaMissions: chronologicallyPrev ? entry.missionCount - chronologicallyPrev.missionCount : null,
  };

  const hasBucket = prev.some(p => bucketTimestampMs(p.at) === bucketMs);
  const next = hasBucket
    ? prev
        .map(p => (bucketTimestampMs(p.at) === bucketMs ? snapshot : p))
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    : [snapshot, ...prev].slice(0, GOAL_MAX_HISTORY_ENTRIES);

  try {
    localStorage.setItem(storageKey(key), JSON.stringify(next));
  } catch { /* quota */ }
  return next;
}

export function formatGoalDelta(val: number | null, asCurrency = true): string {
  if (val === null) return '—';
  if (Math.abs(val) < 0.01) return asCurrency ? 'R$ 0,00' : '0';
  const sign = val > 0 ? '+' : '';
  if (asCurrency) {
    return sign + val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  return sign + String(val);
}
