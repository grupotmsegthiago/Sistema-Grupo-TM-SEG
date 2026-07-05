// Histórico das últimas atualizações de meta (gráfico Monitoramento 24h) — só diretoria vê no UI.

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

const MAX_ENTRIES = 10;
const STORAGE_PREFIX = 'tmseg_goal_history_';

function storageKey(key: string) {
  return `${STORAGE_PREFIX}${key}`;
}

export function loadGoalUpdateHistory(key: string): GoalUpdateSnapshot[] {
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

export function pushGoalUpdateHistory(
  key: string,
  entry: Omit<GoalUpdateSnapshot, 'deltaRevenue' | 'deltaCost' | 'deltaProfit' | 'deltaMissions'>,
): GoalUpdateSnapshot[] {
  const prev = loadGoalUpdateHistory(key);
  const last = prev[0] ?? null;
  const snapshot: GoalUpdateSnapshot = {
    ...entry,
    deltaRevenue: last ? entry.revenue - last.revenue : null,
    deltaCost: last ? entry.cost - last.cost : null,
    deltaProfit: last ? entry.profit - last.profit : null,
    deltaMissions: last ? entry.missionCount - last.missionCount : null,
  };

  // Evita duplicata se nada mudou (mesmo faturamento e missões)
  if (
    last
    && Math.abs(snapshot.revenue - last.revenue) < 0.01
    && Math.abs(snapshot.cost - last.cost) < 0.01
    && snapshot.missionCount === last.missionCount
    && entry.source === 'sync'
  ) {
    return prev;
  }

  const next = [snapshot, ...prev].slice(0, MAX_ENTRIES);
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
