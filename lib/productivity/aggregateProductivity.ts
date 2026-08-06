/**
 * Agregação pura de logs para o relatório diário de produtividade.
 */

export type ProductivityLogRow = {
  created_at: string;
  user_name: string;
  action_type: string;
  entity: string | null;
  entity_id: string | null;
  details: string | null;
};

export type UserProductivityRow = {
  userName: string;
  logins: number;
  creates: number;
  updates: number;
  navigations: number;
  interactions: number;
  clicks: number;
  challengesShown: number;
  challengesPassed: number;
  challengesFailed: number;
  challengesTimeout: number;
  lastActivityAt: string | null;
  firstActivityAt: string | null;
  activeMinutesDay: number;
  activeMinutesNight: number;
};

const SESSION_GAP_MS = 30 * 60 * 1000;

function estimateActiveMinutes(timestamps: string[]): number {
  if (!timestamps.length) return 0;
  const sorted = timestamps
    .map((t) => new Date(t).getTime())
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (!sorted.length) return 0;
  let total = 0;
  let start = sorted[0];
  let end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const t = sorted[i];
    if (t - end <= SESSION_GAP_MS) {
      end = t;
    } else {
      total += end - start;
      start = end = t;
    }
  }
  total += end - start;
  return Math.round(total / 60_000);
}

function parseDetails(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function logKey(log: ProductivityLogRow): string {
  return `${log.created_at}|${log.user_name}|${log.action_type}|${log.entity || ''}|${log.entity_id || ''}|${log.details || ''}`;
}

export function aggregateProductivityLogs(
  dayLogs: ProductivityLogRow[],
  nightLogs: ProductivityLogRow[],
): UserProductivityRow[] {
  const byUser = new Map<string, UserProductivityRow>();

  const ensure = (name: string): UserProductivityRow => {
    const key = name || 'Desconhecido';
    let row = byUser.get(key);
    if (!row) {
      row = {
        userName: key,
        logins: 0,
        creates: 0,
        updates: 0,
        navigations: 0,
        interactions: 0,
        clicks: 0,
        challengesShown: 0,
        challengesPassed: 0,
        challengesFailed: 0,
        challengesTimeout: 0,
        lastActivityAt: null,
        firstActivityAt: null,
        activeMinutesDay: 0,
        activeMinutesNight: 0,
      };
      byUser.set(key, row);
    }
    return row;
  };

  const dayTs = new Map<string, string[]>();
  const nightTs = new Map<string, string[]>();
  const seenChallenge = new Set<string>();

  const applyChallenge = (row: UserProductivityRow, log: ProductivityLogRow) => {
    const key = logKey(log);
    if (seenChallenge.has(key)) return;
    seenChallenge.add(key);
    const a = log.action_type;
    if (a === 'IDLE_CHALLENGE_SHOWN') row.challengesShown += 1;
    else if (a === 'IDLE_CHALLENGE_PASSED') row.challengesPassed += 1;
    else if (a === 'IDLE_CHALLENGE_FAILED') row.challengesFailed += 1;
    else if (a === 'IDLE_CHALLENGE_TIMEOUT') row.challengesTimeout += 1;
  };

  for (const log of dayLogs) {
    const row = ensure(log.user_name);
    const t = log.created_at;
    if (!row.firstActivityAt || t < row.firstActivityAt) row.firstActivityAt = t;
    if (!row.lastActivityAt || t > row.lastActivityAt) row.lastActivityAt = t;
    const list = dayTs.get(row.userName) || [];
    list.push(t);
    dayTs.set(row.userName, list);

    const a = log.action_type;
    if (a === 'LOGIN') row.logins += 1;
    else if (a === 'CREATE') row.creates += 1;
    else if (a === 'UPDATE' || a === 'MISSION_UPDATE') row.updates += 1;
    else if (a === 'OTHER' && log.entity === 'Navigation') row.navigations += 1;
    else if (a === 'PRODUCTIVITY_STATS') {
      const d = parseDetails(log.details);
      const interactions = Number(d.interactions || 0);
      const clicks = Number(d.clicks || 0);
      if (interactions > row.interactions) row.interactions = interactions;
      if (clicks > row.clicks) row.clicks = clicks;
    } else if (a.startsWith('IDLE_CHALLENGE_')) {
      applyChallenge(row, log);
    }
  }

  for (const log of nightLogs) {
    const row = ensure(log.user_name);
    const list = nightTs.get(row.userName) || [];
    list.push(log.created_at);
    nightTs.set(row.userName, list);
    if (log.action_type.startsWith('IDLE_CHALLENGE_')) {
      applyChallenge(row, log);
    }
    const t = log.created_at;
    if (!row.lastActivityAt || t > row.lastActivityAt) row.lastActivityAt = t;
    if (!row.firstActivityAt || t < row.firstActivityAt) row.firstActivityAt = t;
  }

  for (const [name, ts] of dayTs) {
    ensure(name).activeMinutesDay = estimateActiveMinutes(ts);
  }
  for (const [name, ts] of nightTs) {
    ensure(name).activeMinutesNight = estimateActiveMinutes(ts);
  }

  return [...byUser.values()].sort((a, b) => {
    if (a.activeMinutesDay !== b.activeMinutesDay) return a.activeMinutesDay - b.activeMinutesDay;
    return a.userName.localeCompare(b.userName, 'pt-BR');
  });
}
