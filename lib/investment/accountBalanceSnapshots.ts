import pg from 'pg';

export type BalanceSnapshotRow = {
  id: number;
  account_id: string;
  balance: number;
  notes: string;
  created_by: string;
  recorded_at: string;
};

let pool: pg.Pool | null = null;

function getPool(): pg.Pool | null {
  const connectionString = String(process.env.DATABASE_URL || '').trim();
  if (!connectionString) return null;
  if (!pool) pool = new pg.Pool({ connectionString, max: 3 });
  return pool;
}

export async function ensureSnapshotsTable(): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(`CREATE TABLE IF NOT EXISTS public.account_balance_snapshots (
    id serial PRIMARY KEY,
    account_id text NOT NULL,
    balance numeric(18,2) NOT NULL DEFAULT 0,
    notes text DEFAULT '',
    created_by text DEFAULT '',
    recorded_at timestamptz DEFAULT now()
  )`);
}

export async function listSnapshotsForAccount(accountId: string, days: number): Promise<BalanceSnapshotRow[]> {
  const p = getPool();
  if (!p) return [];
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { rows } = await p.query(
    'SELECT * FROM account_balance_snapshots WHERE account_id = $1 AND recorded_at >= $2 ORDER BY recorded_at ASC',
    [accountId, since],
  );
  return rows as BalanceSnapshotRow[];
}

export async function listAllSnapshots(days: number): Promise<BalanceSnapshotRow[]> {
  const p = getPool();
  if (!p) return [];
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { rows } = await p.query(
    'SELECT * FROM account_balance_snapshots WHERE recorded_at >= $1 ORDER BY recorded_at ASC',
    [since],
  );
  return rows as BalanceSnapshotRow[];
}

export async function insertSnapshot(input: {
  account_id: string;
  balance: number;
  notes?: string;
  created_by?: string;
}): Promise<BalanceSnapshotRow | null> {
  const p = getPool();
  if (!p) return null;
  const { rows } = await p.query(
    'INSERT INTO account_balance_snapshots (account_id, balance, notes, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
    [input.account_id, input.balance, input.notes || '', input.created_by || ''],
  );
  return (rows[0] as BalanceSnapshotRow) || null;
}

export async function deleteSnapshot(id: number): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  await p.query('DELETE FROM account_balance_snapshots WHERE id = $1', [id]);
  return true;
}
