/**
 * Trava de prejuízo analisado.
 * Giovanna Marsili, Beatriz Rocha e Thiago Moreira confirmam a OS mesmo
 * quando o fornecedor cobra mais que o faturamento. Depois disso, somente
 * o perfil Diretoria pode alterar.
 */

export type NegativeMarginLockUser = {
  name?: string | null;
  role?: string | null;
};

export type NegativeMarginLockMission = {
  negative_margin_locked?: boolean | null;
  negative_margin_locked_by?: string | null;
  negative_margin_locked_at?: string | null;
};

function normalizePersonName(name: string | null | undefined): string {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeRole(role: string | null | undefined): string {
  return String(role || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Botão de travar prejuízo: somente os três nomes indicados. */
export function canApproveNegativeMarginLock(user: NegativeMarginLockUser | null | undefined): boolean {
  const n = normalizePersonName(user?.name);
  if (!n) return false;
  if (n.includes('giovanna') && n.includes('marsili')) return true;
  if (n.includes('beatriz') && n.includes('rocha')) return true;
  if (n.includes('thiago') && n.includes('moreira')) return true;
  return false;
}

/** Depois da trava, só o perfil Diretoria altera a OS. */
export function canEditNegativeMarginLockedOs(user: NegativeMarginLockUser | null | undefined): boolean {
  return normalizeRole(user?.role) === 'diretoria';
}

export function isOsNegativeMarginLocked(mission: NegativeMarginLockMission | null | undefined): boolean {
  return mission?.negative_margin_locked === true;
}

/** Fornecedor cobrando mais que o faturamento (resultado negativo). */
export function isNegativeMarginResult(revenueTotal: number, costTotal: number): boolean {
  const rev = Number(revenueTotal);
  const cost = Number(costTotal);
  if (!Number.isFinite(rev) || !Number.isFinite(cost)) return false;
  return rev - cost < -0.009;
}
