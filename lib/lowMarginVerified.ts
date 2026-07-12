// OS marcadas como "verificadas" na fila de margem baixa do termômetro de meta.
// Escopo por filtro (mês, DHL, TOTAL, etc.) — persiste no navegador do usuário.

export type LowMarginVerifiedEntry = {
  missionId: string;
  at: string;
  by: string;
  rev: number;
  cost: number;
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
