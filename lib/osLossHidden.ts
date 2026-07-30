/**
 * OS ocultadas no dialog "OS com Prejuízo" após análise.
 * Persiste no navegador; uma vez ocultada, permanece oculta (por missionId).
 * rev/cost ficam gravados só como metadado da análise (auditoria local).
 */

export type OsLossHiddenEntry = {
  missionId: string;
  at: string;
  by: string;
  rev: number;
  cost: number;
};

const STORAGE_KEY = 'tmseg_os_loss_hidden_v1';

export function loadOsLossHiddenMap(): Record<string, OsLossHiddenEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, OsLossHiddenEntry>;
  } catch {
    return {};
  }
}

/**
 * Oculta permanente por missionId.
 * rev/cost na assinatura são mantidos por compatibilidade com call sites; não invalidam o hide.
 */
export function isOsLossHidden(
  map: Record<string, OsLossHiddenEntry>,
  missionId: string,
  _rev?: number,
  _cost?: number,
): boolean {
  return Boolean(map[String(missionId || '').trim()]);
}

export function markOsLossHidden(
  items: Array<{ missionId: string; rev: number; cost: number }>,
  by: string,
): Record<string, OsLossHiddenEntry> {
  const map = loadOsLossHiddenMap();
  const at = new Date().toISOString();
  for (const item of items) {
    const id = String(item.missionId || '').trim();
    if (!id) continue;
    map[id] = {
      missionId: id,
      at,
      by,
      rev: item.rev,
      cost: item.cost,
    };
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
  return map;
}

export function unmarkOsLossHidden(missionIds: string[]): Record<string, OsLossHiddenEntry> {
  const map = loadOsLossHiddenMap();
  for (const id of missionIds) {
    delete map[String(id)];
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
  return map;
}

export function getCurrentUserNameForLossHide(): string {
  try {
    const raw = localStorage.getItem('userData');
    if (!raw) return 'Usuário';
    const user = JSON.parse(raw);
    return user.name || user.email || user.username || 'Usuário';
  } catch {
    return 'Usuário';
  }
}
