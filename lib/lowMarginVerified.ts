// OS marcadas como "verificadas" na fila de margem baixa do termômetro de meta.
// Escopo por filtro (mês, DHL, TOTAL, etc.) — persiste no navegador do usuário.

import { MissionStatus } from '../types';
import { computeCanonicalRevenueCost, type CanonicalRefs } from './missionFinancialsCanonical';

export const LOW_MARGIN_DEFAULT_THRESHOLD = 20;

export type LowMarginVerifiedEntry = {
  missionId: string;
  at: string;
  by: string;
  rev: number;
  cost: number;
};

export type LowMarginMissionRow = {
  m: any;
  rev: number;
  cost: number;
  profit: number;
  marginPct: number;
  verifiedEntry?: LowMarginVerifiedEntry;
};

export type LowMarginPartition = {
  pending: LowMarginMissionRow[];
  verified: LowMarginMissionRow[];
};

const STORAGE_PREFIX = 'tmseg_low_margin_verified_';
const VALUE_EPS = 0.02;

function storageKey(scopeKey: string) {
  return `${STORAGE_PREFIX}${scopeKey}`;
}

export function loadLowMarginVerifiedMap(scopeKey: string): Record<string, LowMarginVerifiedEntry> {
  try {
    const raw = localStorage.getItem(storageKey(scopeKey));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, LowMarginVerifiedEntry>;
  } catch {
    return {};
  }
}

/** Verificado permanece até os valores canônicos (rev/custo) mudarem. */
export function isLowMarginVerified(
  map: Record<string, LowMarginVerifiedEntry>,
  missionId: string,
  rev: number,
  cost: number,
): boolean {
  const entry = map[missionId];
  if (!entry) return false;
  return Math.abs(entry.rev - rev) < VALUE_EPS && Math.abs(entry.cost - cost) < VALUE_EPS;
}

export function markLowMarginVerified(
  scopeKey: string,
  items: Array<{ missionId: string; rev: number; cost: number }>,
  by: string,
): Record<string, LowMarginVerifiedEntry> {
  const map = loadLowMarginVerifiedMap(scopeKey);
  const at = new Date().toISOString();
  for (const item of items) {
    map[item.missionId] = {
      missionId: item.missionId,
      at,
      by,
      rev: item.rev,
      cost: item.cost,
    };
  }
  try {
    localStorage.setItem(storageKey(scopeKey), JSON.stringify(map));
  } catch {
    /* quota */
  }
  return map;
}

export function resolveLowMarginScopeKey(historyKey: string): string {
  return `low-margin-${historyKey}`;
}

export function getCurrentUserName(): string {
  try {
    const raw = localStorage.getItem('userData');
    if (!raw) return 'Usuário';
    const user = JSON.parse(raw);
    return user.name || user.email || user.username || 'Usuário';
  } catch {
    return 'Usuário';
  }
}

/** Separa OS abaixo do limite em pendentes (fila de conferência) e já verificadas. */
export function partitionLowMarginMissions(
  missions: any[],
  refs: CanonicalRefs,
  verifiedMap: Record<string, LowMarginVerifiedEntry>,
  threshold = LOW_MARGIN_DEFAULT_THRESHOLD,
  currentTime: Date = new Date(),
): LowMarginPartition {
  const pending: LowMarginMissionRow[] = [];
  const verified: LowMarginMissionRow[] = [];

  for (const m of missions || []) {
    if (m.status === MissionStatus.REFUSED) continue;
    const r = computeCanonicalRevenueCost(m, refs, currentTime);
    if (r.rev <= 0 && r.cost <= 0) continue;
    const marginPct = r.rev > 0 ? ((r.rev - r.cost) / r.rev) * 100 : -100;
    if (marginPct >= threshold) continue;

    const row: LowMarginMissionRow = {
      m,
      rev: r.rev,
      cost: r.cost,
      profit: r.rev - r.cost,
      marginPct,
    };
    const entry = verifiedMap[m.id];
    if (isLowMarginVerified(verifiedMap, m.id, r.rev, r.cost)) {
      row.verifiedEntry = entry;
      verified.push(row);
    } else {
      pending.push(row);
    }
  }

  const byMargin = (a: LowMarginMissionRow, b: LowMarginMissionRow) => a.marginPct - b.marginPct;
  pending.sort(byMargin);
  verified.sort(byMargin);
  return { pending, verified };
}
