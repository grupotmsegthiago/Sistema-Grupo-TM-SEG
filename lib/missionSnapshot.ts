/**
 * Snapshot de faturamento vs constraint Postgres:
 *   CHECK ((snapshot_data IS NOT NULL) OR (billing_approved = false))
 *
 * Aprovar com billing_approved=true exige snapshot_data não nulo.
 * OS recusada zerada costuma deixar snapshot_approved_by preenchido e
 * snapshot_data NULL — o Aprovar antigo falhava com check_snapshot_not_empty.
 */

export function hasUsableBillingSnapshot(snapshotData: unknown): boolean {
  if (snapshotData == null) return false;
  if (typeof snapshotData === 'string') {
    const t = snapshotData.trim();
    if (!t || t === '{}' || t === 'null' || t === '""') return false;
    try {
      return hasUsableBillingSnapshot(JSON.parse(t));
    } catch {
      return false;
    }
  }
  if (typeof snapshotData !== 'object') return false;
  if (Array.isArray(snapshotData)) return snapshotData.length > 0;
  return Object.keys(snapshotData as Record<string, unknown>).length > 0;
}

export function shouldWriteBillingSnapshot(opts: {
  approve: boolean;
  billingApproved: boolean;
  existingSnapshot: unknown;
}): boolean {
  return opts.approve && opts.billingApproved && !hasUsableBillingSnapshot(opts.existingSnapshot);
}

export function buildMinimalBillingSnapshot(opts: {
  route?: string;
  revenueServiceOnly: number;
  costServiceOnly: number;
  tollVal: number;
  tollProvider?: number;
  displacementVal?: number;
  displacementProvider?: number;
}): Record<string, unknown> {
  const revenue = Number(opts.revenueServiceOnly) || 0;
  const cost = Number(opts.costServiceOnly) || 0;
  const toll = Number(opts.tollVal) || 0;
  const displacement = Number(opts.displacementVal) || 0;
  return {
    route: opts.route || '-',
    tableName: '-',
    clientTableId: null,
    providerTableId: null,
    kmTotal: 0,
    revenueServiceOnly: revenue,
    costServiceOnly: cost,
    tollVal: toll,
    tollProvider: Number(opts.tollProvider) || 0,
    displacementVal: displacement,
    displacementProvider: Number(opts.displacementProvider) || 0,
    totalGeral: Math.round((revenue + toll + displacement) * 100) / 100,
  };
}

/** Campos a limpar ao zerar OS Recusada — evita Aprovar posterior sem snapshot. */
export function refusedOsClearSnapshotFields(): {
  snapshot_data: null;
  snapshot_approved_by: null;
  snapshot_approved_at: null;
  billing_approved: false;
} {
  return {
    snapshot_data: null,
    snapshot_approved_by: null,
    snapshot_approved_at: null,
    billing_approved: false,
  };
}

/**
 * Retry após check_snapshot_not_empty:
 * - se a OS vai ficar aprovada, GARANTE snapshot (nunca remove);
 * - se não vai ficar aprovada, pode omitir snapshot.
 */
export function retryPayloadForSnapshotConstraint(opts: {
  payload: Record<string, unknown>;
  billingApproved: boolean;
  userName: string;
  minimalSnapshot: Record<string, unknown>;
  nowIso?: string;
}): Record<string, unknown> {
  const next = { ...opts.payload };
  if (opts.billingApproved) {
    if (!hasUsableBillingSnapshot(next.snapshot_data)) {
      next.snapshot_data = opts.minimalSnapshot;
      next.snapshot_approved_by = opts.userName;
      next.snapshot_approved_at = opts.nowIso || new Date().toISOString();
    }
    return next;
  }
  delete next.snapshot_data;
  delete next.snapshot_approved_by;
  delete next.snapshot_approved_at;
  return next;
}
