/** URL e anon key públicas do projeto TM SEG (seguras no client). */
const DEFAULT_SUPABASE_URL = 'https://ajhmmjuewdsukecaimik.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk';

export type BalanceSnapshotRow = {
  id: number;
  account_id: string;
  balance: number;
  notes: string;
  created_by: string;
  recorded_at: string;
};

let tableEnsured = false;

function getSupabaseConfig(): { url: string; key: string } {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
  const key = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      DEFAULT_SUPABASE_ANON_KEY,
  ).trim();
  return { url, key };
}

function restHeaders(key: string, extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
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

export async function ensureSnapshotsTable(): Promise<void> {
  if (tableEnsured) return;
  const { url, key } = getSupabaseConfig();
  const sql = `CREATE TABLE IF NOT EXISTS public.account_balance_snapshots (
    id serial PRIMARY KEY,
    account_id text NOT NULL,
    balance numeric(18,2) NOT NULL DEFAULT 0,
    notes text DEFAULT '',
    created_by text DEFAULT '',
    recorded_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE public.account_balance_snapshots ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Allow all for account_balance_snapshots" ON public.account_balance_snapshots;
  CREATE POLICY "Allow all for account_balance_snapshots" ON public.account_balance_snapshots
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);`;

  try {
    const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: restHeaders(key),
      body: JSON.stringify({ sql }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[account_balance_snapshots] ensure status', res.status, text.slice(0, 200));
    }
  } catch (err) {
    console.warn('[account_balance_snapshots] ensure falhou:', err);
  }
  tableEnsured = true;
}

async function restSelect(filters: {
  accountId?: string;
  since?: string;
}): Promise<BalanceSnapshotRow[]> {
  const { url, key } = getSupabaseConfig();
  const params = new URLSearchParams({ select: '*', order: 'recorded_at.asc' });
  if (filters.accountId) params.set('account_id', `eq.${filters.accountId}`);
  if (filters.since) params.set('recorded_at', `gte.${filters.since}`);

  const res = await fetch(`${url}/rest/v1/account_balance_snapshots?${params}`, {
    method: 'GET',
    headers: restHeaders(key),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`select ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as Record<string, unknown>[];
  return (data || [])
    .map((row) => normalizeRow(row))
    .filter(Boolean) as BalanceSnapshotRow[];
}


export async function listSnapshotsForAccount(
  accountId: string,
  days: number,
): Promise<BalanceSnapshotRow[]> {
  try {
    await ensureSnapshotsTable();
    return await restSelect({ accountId, since: sinceIso(days) });
  } catch (err) {
    console.warn('[account_balance_snapshots] list falhou:', err);
    return [];
  }
}

export async function listAllSnapshots(days: number): Promise<BalanceSnapshotRow[]> {
  try {
    await ensureSnapshotsTable();
    return await restSelect({ since: sinceIso(days) });
  } catch (err) {
    console.warn('[account_balance_snapshots] listAll falhou:', err);
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

  try {
    await ensureSnapshotsTable();
    const { url, key } = getSupabaseConfig();
    const res = await fetch(`${url}/rest/v1/account_balance_snapshots`, {
      method: 'POST',
      headers: restHeaders(key, { Prefer: 'return=representation' }),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`insert ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    return normalizeRow(row as Record<string, unknown>);
  } catch (err) {
    console.error('[account_balance_snapshots] insert falhou:', err);
    return null;
  }
}

export async function deleteSnapshot(id: number): Promise<boolean> {
  try {
    const { url, key } = getSupabaseConfig();
    const res = await fetch(`${url}/rest/v1/account_balance_snapshots?id=eq.${id}`, {
      method: 'DELETE',
      headers: restHeaders(key),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`delete ${res.status}: ${text.slice(0, 200)}`);
    }
    return true;
  } catch (err) {
    console.error('[account_balance_snapshots] delete falhou:', err);
    return false;
  }
}
