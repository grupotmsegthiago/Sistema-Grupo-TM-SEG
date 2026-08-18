import { authFetch } from '../authFetch';

export type BalanceSnapshotRow = {
  id: number;
  account_id: string;
  balance: number;
  notes: string;
  created_by: string;
  recorded_at: string;
};

export type CreateBalanceSnapshotInput = {
  account_id: string;
  balance: number;
  notes?: string;
  created_by?: string;
};

const SNAPSHOTS_API = '/api/investment/snapshots';
const inFlightCreates = new Map<string, Promise<BalanceSnapshotRow>>();

async function readApiError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return String(body?.error || res.statusText || `HTTP ${res.status}`);
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

function normalizeSnapshot(row: Record<string, unknown>): BalanceSnapshotRow {
  return {
    id: Number(row.id),
    account_id: String(row.account_id || ''),
    balance: Number(row.balance),
    notes: String(row.notes || ''),
    created_by: String(row.created_by || ''),
    recorded_at: String(row.recorded_at || ''),
  };
}

/** Lista ordenada pela API autenticada; [] é um resultado legítimo. */
export async function listBalanceSnapshots(days: number): Promise<BalanceSnapshotRow[]> {
  const safeDays = Math.max(1, Math.trunc(Number(days) || 365));
  const res = await authFetch(
    `/api/investment/snapshots-all?days=${safeDays}&_t=${Date.now()}`,
  );
  if (!res.ok) throw new Error(await readApiError(res));
  const body = await res.json();
  if (!Array.isArray(body)) throw new Error('Resposta inválida da API de snapshots');
  return body.map((row) => normalizeSnapshot(row as Record<string, unknown>));
}

/**
 * Evita duplo INSERT enquanto o mesmo payload está em voo.
 * Operações distintas continuam independentes.
 */
export function createBalanceSnapshot(
  input: CreateBalanceSnapshotInput,
): Promise<BalanceSnapshotRow> {
  const payload = {
    account_id: String(input.account_id || '').trim(),
    balance: Number(input.balance),
    notes: String(input.notes || ''),
    created_by: String(input.created_by || ''),
  };
  const key = JSON.stringify(payload);
  const current = inFlightCreates.get(key);
  if (current) return current;

  const request = (async () => {
    const res = await authFetch(SNAPSHOTS_API, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await readApiError(res));
    const body = await res.json();
    return normalizeSnapshot(body as Record<string, unknown>);
  })();

  inFlightCreates.set(key, request);
  const clear = () => {
    if (inFlightCreates.get(key) === request) inFlightCreates.delete(key);
  };
  void request.then(clear, clear);
  return request;
}

export async function deleteBalanceSnapshot(id: number): Promise<void> {
  const res = await authFetch(`${SNAPSHOTS_API}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await readApiError(res));
}
