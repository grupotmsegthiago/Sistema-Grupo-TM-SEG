import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_SUPABASE_ANON_KEY,
  DEFAULT_SUPABASE_URL,
  TMSEG_SUPABASE_PROJECT_REF,
} from '../supabaseDefaults';

export type BalanceSnapshotRow = {
  id: number;
  account_id: string;
  balance: number;
  notes: string;
  created_by: string;
  recorded_at: string;
};

const ENSURE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS public.account_balance_snapshots (
  id serial PRIMARY KEY,
  account_id text NOT NULL,
  balance numeric(18,2) NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  created_by text DEFAULT '',
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_account_balance_snapshots_account_ts
  ON public.account_balance_snapshots (account_id, recorded_at DESC);
ALTER TABLE public.account_balance_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for account_balance_snapshots" ON public.account_balance_snapshots;
CREATE POLICY "Allow all for account_balance_snapshots" ON public.account_balance_snapshots
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);`;

type PgPool = import('pg').Pool;

let pool: PgPool | null = null;
let poolInit: Promise<PgPool | null> | null = null;
let supabaseAdmin: SupabaseClient | null = null;
let tableEnsured = false;

function decodeRef(key: string): string | null {
  try {
    const payload = key.split('.')[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))?.ref || null;
  } catch {
    return null;
  }
}

async function getPool(): Promise<PgPool | null> {
  const connectionString = String(
    process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.SUPABASE_DB_URL ||
      '',
  ).trim();
  if (!connectionString) return null;
  if (pool) return pool;
  if (!poolInit) {
    poolInit = (async () => {
      try {
        const pg = await import('pg');
        pool = new pg.default.Pool({ connectionString, max: 3 });
        return pool;
      } catch (err) {
        console.warn('[account_balance_snapshots] pg indisponível (serverless?):', err);
        return null;
      }
    })();
  }
  return poolInit;
}

function getSupabaseAdmin(): SupabaseClient | null {
  if (supabaseAdmin) return supabaseAdmin;
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL);
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  const key =
    serviceKey && decodeRef(serviceKey) === TMSEG_SUPABASE_PROJECT_REF
      ? serviceKey
      : DEFAULT_SUPABASE_ANON_KEY;
  supabaseAdmin = createClient(url, key);
  return supabaseAdmin;
}

function normalizeRow(row: Record<string, unknown> | null | undefined): BalanceSnapshotRow | null {
  if (!row || row.id == null) return null;
  return {
    id: Number(row.id),
    account_id: String(row.account_id || ''),
    balance: Number(row.balance),
    notes: String(row.notes || ''),
    created_by: String(row.created_by || ''),
    recorded_at: String(row.recorded_at || new Date().toISOString()),
  };
}

function sinceIso(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

async function ensureSnapshotsTablePg(): Promise<void> {
  const p = await getPool();
  if (!p) return;
  await p.query(ENSURE_TABLE_SQL);
}

async function ensureSnapshotsTableSupabase(): Promise<void> {
  if (tableEnsured) return;
  const sb = getSupabaseAdmin();
  if (!sb) return;
  try {
    const { error } = await sb.rpc('exec_sql', { sql: ENSURE_TABLE_SQL });
    if (error) {
      console.warn('[account_balance_snapshots] exec_sql ensure:', error.message);
    }
  } catch (err) {
    console.warn('[account_balance_snapshots] ensure supabase falhou:', err);
  }
  tableEnsured = true;
}

export async function ensureSnapshotsTable(): Promise<void> {
  try {
    if (await getPool()) {
      await ensureSnapshotsTablePg();
      return;
    }
    await ensureSnapshotsTableSupabase();
  } catch (err) {
    console.warn('[account_balance_snapshots] ensureSnapshotsTable:', err);
  }
}

export async function listSnapshotsForAccount(
  accountId: string,
  days: number,
): Promise<BalanceSnapshotRow[]> {
  const since = sinceIso(days);
  const p = await getPool();
  if (p) {
    try {
      const { rows } = await p.query(
        'SELECT * FROM account_balance_snapshots WHERE account_id = $1 AND recorded_at >= $2 ORDER BY recorded_at ASC',
        [accountId, since],
      );
      return rows as BalanceSnapshotRow[];
    } catch (err) {
      console.warn('[account_balance_snapshots] list pg falhou:', err);
    }
  }

  const sb = getSupabaseAdmin();
  if (!sb) return [];
  try {
    await ensureSnapshotsTableSupabase();
    const { data, error } = await sb
      .from('account_balance_snapshots')
      .select('*')
      .eq('account_id', accountId)
      .gte('recorded_at', since)
      .order('recorded_at', { ascending: true });
    if (error) throw error;
    return (data || []).map((row) => normalizeRow(row as Record<string, unknown>)).filter(Boolean) as BalanceSnapshotRow[];
  } catch (err) {
    console.warn('[account_balance_snapshots] list supabase falhou:', err);
    return [];
  }
}

export async function listAllSnapshots(days: number): Promise<BalanceSnapshotRow[]> {
  const since = sinceIso(days);
  const p = await getPool();
  if (p) {
    try {
      const { rows } = await p.query(
        'SELECT * FROM account_balance_snapshots WHERE recorded_at >= $1 ORDER BY recorded_at ASC',
        [since],
      );
      return rows as BalanceSnapshotRow[];
    } catch (err) {
      console.warn('[account_balance_snapshots] listAll pg falhou:', err);
    }
  }

  const sb = getSupabaseAdmin();
  if (!sb) return [];
  try {
    await ensureSnapshotsTableSupabase();
    const { data, error } = await sb
      .from('account_balance_snapshots')
      .select('*')
      .gte('recorded_at', since)
      .order('recorded_at', { ascending: true });
    if (error) throw error;
    return (data || []).map((row) => normalizeRow(row as Record<string, unknown>)).filter(Boolean) as BalanceSnapshotRow[];
  } catch (err) {
    console.warn('[account_balance_snapshots] listAll supabase falhou:', err);
    return [];
  }
}

export async function insertSnapshot(input: {
  account_id: string;
  balance: number;
  notes?: string;
  created_by?: string;
}): Promise<BalanceSnapshotRow | null> {
  const payload = {
    account_id: String(input.account_id || '').trim(),
    balance: input.balance,
    notes: String(input.notes || ''),
    created_by: String(input.created_by || ''),
  };

  const p = await getPool();
  if (p) {
    try {
      await ensureSnapshotsTablePg();
      const { rows } = await p.query(
        'INSERT INTO account_balance_snapshots (account_id, balance, notes, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
        [payload.account_id, payload.balance, payload.notes, payload.created_by],
      );
      return normalizeRow(rows[0] as Record<string, unknown>);
    } catch (err) {
      console.warn('[account_balance_snapshots] insert pg falhou, tentando Supabase:', err);
    }
  }

  const sb = getSupabaseAdmin();
  if (!sb) return null;

  try {
    await ensureSnapshotsTableSupabase();
    const { data, error } = await sb
      .from('account_balance_snapshots')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw error;
    return normalizeRow(data as Record<string, unknown>);
  } catch (err) {
    console.error('[account_balance_snapshots] insert supabase falhou:', err);
    return null;
  }
}

export async function deleteSnapshot(id: number): Promise<boolean> {
  const p = await getPool();
  if (p) {
    try {
      await p.query('DELETE FROM account_balance_snapshots WHERE id = $1', [id]);
      return true;
    } catch (err) {
      console.warn('[account_balance_snapshots] delete pg falhou:', err);
    }
  }

  const sb = getSupabaseAdmin();
  if (!sb) return false;
  try {
    const { error } = await sb.from('account_balance_snapshots').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[account_balance_snapshots] delete supabase falhou:', err);
    return false;
  }
}
