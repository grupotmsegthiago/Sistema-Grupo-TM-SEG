/**
 * SSOT das seis rotas administrativas /api/supabase/*.
 * Usado pelo Express local e pelo handler Vercel leve (NB-07).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type SupabaseAdminOperation =
  | 'init-invoices'
  | 'status'
  | 'db-metrics'
  | 'storage-usage'
  | 'billing-links'
  | 'health-check';

type FetchLike = typeof fetch;

const DB_METRIC_TABLES = [
  'missions', 'clients', 'providers', 'vehicles', 'client_vehicles',
  'client_routes', 'client_price_tables', 'provider_cost_tables',
  'system_users', 'system_logs', 'financial_transactions',
  'financial_accounts', 'financial_categories', 'commercial_proposals',
  'quotes', 'provider_agents', 'agents', 'mission_logs', 'mission_history',
  'profiles', 'contracts',
];

async function soft<T>(work: PromiseLike<T>, ms = 4_000): Promise<T | null> {
  try {
    return await Promise.race([
      Promise.resolve(work),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
    ]);
  } catch {
    return null;
  }
}

export async function initFinancialInvoicesProbe(
  supabase: SupabaseClient,
): Promise<Record<string, unknown>> {
  const probe = await soft(
    supabase.from('financial_invoices').select('id', { count: 'exact', head: true }),
  );
  if (!probe) return { ok: true, note: 'probe_timeout_or_skip' };

  const { error } = probe as { error: { code?: string } | null };
  const newCols = [
    'nf_image_url', 'boleto_image_url', 'provider', 'issuer_company',
    'boleto_due_date', 'asaas_payment_id', 'asaas_status', 'asaas_invoice_url',
    'asaas_bankslip_url', 'asaas_pix_payload', 'asaas_barcode', 'nf_status',
    'nf_number',
  ];

  if (error?.code === '42P01') {
    const sql = `
          CREATE TABLE IF NOT EXISTS public.financial_invoices (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            client TEXT NOT NULL,
            number TEXT NOT NULL,
            amount DOUBLE PRECISION NOT NULL DEFAULT 0,
            date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'EMITIDA',
            notes TEXT DEFAULT '',
            created_by TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            nf_image_url TEXT,
            boleto_image_url TEXT,
            provider TEXT,
            issuer_company TEXT,
            boleto_due_date TEXT
          );
          ALTER TABLE public.financial_invoices ENABLE ROW LEVEL SECURITY;
          CREATE POLICY IF NOT EXISTS "Allow all for financial_invoices" ON public.financial_invoices FOR ALL USING (true) WITH CHECK (true);
        `;
    return {
      ok: false,
      note: 'Table does not exist. Please create it via Supabase SQL editor.',
      sql,
    };
  }

  const check = await soft(
    supabase.from('financial_invoices').select('nf_image_url').limit(1),
  );
  const checkErr = (check as { error?: { code?: string } } | null)?.error;
  if (checkErr?.code === '42703') {
    const sql = newCols
      .map((column) => `ALTER TABLE public.financial_invoices ADD COLUMN IF NOT EXISTS ${column} TEXT;`)
      .join('\n');
    return {
      ok: true,
      migration_needed: true,
      sql,
      hint: 'Execute this SQL in Supabase SQL Editor to add the new columns',
    };
  }

  return { ok: true };
}

export async function getSupabaseStatus(
  supabase: SupabaseClient,
  fetchFn: FetchLike = fetch,
): Promise<Record<string, unknown>> {
  const startTime = Date.now();
  const { error: pingError } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true });
  const latencyMs = Date.now() - startTime;

  let incidents: unknown[] = [];
  try {
    const response = await fetchFn('https://status.supabase.com/api/v2/incidents.json');
    const data = await response.json() as { incidents?: unknown[] };
    incidents = (data.incidents || []).slice(0, 5);
  } catch {
    // Diagnóstico externo é opcional.
  }

  let scheduledMaintenances: unknown[] = [];
  try {
    const response = await fetchFn('https://status.supabase.com/api/v2/scheduled-maintenances.json');
    const data = await response.json() as { scheduled_maintenances?: unknown[] };
    scheduledMaintenances = (data.scheduled_maintenances || []).slice(0, 3);
  } catch {
    // Diagnóstico externo é opcional.
  }

  return {
    rest_ok: !pingError,
    latency_ms: latencyMs,
    incidents,
    scheduled_maintenances: scheduledMaintenances,
    timestamp: new Date().toISOString(),
  };
}

export async function getSupabaseDbMetrics(
  supabase: SupabaseClient,
): Promise<Record<string, unknown>> {
  const counts = await Promise.allSettled(
    DB_METRIC_TABLES.map(async (table) => {
      const startTime = Date.now();
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      const latency = Date.now() - startTime;
      if (error) return { table, count: 0, estimatedSizeKb: 0, latency, error: error.message };
      const rowCount = count || 0;
      const avgRowSizeKb = ['system_logs', 'mission_logs', 'mission_history'].includes(table)
        ? 2
        : ['missions', 'commercial_proposals'].includes(table) ? 4 : 1;
      return { table, count: rowCount, estimatedSizeKb: rowCount * avgRowSizeKb, latency };
    }),
  );

  const tables = counts.map((result, index) => (
    result.status === 'fulfilled'
      ? result.value
      : { table: DB_METRIC_TABLES[index], count: 0, estimatedSizeKb: 0, error: 'Inacessível' }
  ));
  const totalRows = tables.reduce((sum, table) => sum + (table.count || 0), 0);
  const totalEstimatedKb = tables.reduce((sum, table) => sum + (table.estimatedSizeKb || 0), 0);

  return {
    tables,
    total_rows: totalRows,
    total_estimated_size_mb: parseFloat((totalEstimatedKb / 1024).toFixed(2)),
    quota_mb: 500,
    usage_percent: parseFloat((totalEstimatedKb / 1024 / 500 * 100).toFixed(2)),
    timestamp: new Date().toISOString(),
  };
}

export async function getSupabaseStorageUsage(
  supabase: SupabaseClient,
): Promise<Record<string, unknown>> {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;

  const bucketStats: Array<Record<string, unknown>> = [];
  for (const bucket of (buckets || [])) {
    try {
      const result = await supabase.storage.from(bucket.name).list('', { limit: 1000 });
      if (!result.error && result.data) {
        const totalBytes = result.data.reduce(
          (sum, file) => sum + (Number((file.metadata as { size?: number } | null)?.size) || 0),
          0,
        );
        bucketStats.push({
          bucket_id: bucket.name,
          objects: result.data.length,
          size_bytes: totalBytes,
          size_mb: parseFloat((totalBytes / 1024 / 1024).toFixed(2)),
          public: bucket.public,
        });
      } else {
        bucketStats.push({
          bucket_id: bucket.name,
          objects: 0,
          size_bytes: 0,
          size_mb: 0,
          public: bucket.public,
          error: result.error?.message,
        });
      }
    } catch {
      bucketStats.push({
        bucket_id: bucket.name,
        objects: 0,
        size_bytes: 0,
        size_mb: 0,
        public: bucket.public,
      });
    }
  }

  const totalStorageMb = bucketStats.reduce(
    (sum, bucket) => sum + Number(bucket.size_mb || 0),
    0,
  );
  return {
    buckets: bucketStats,
    total_storage_mb: parseFloat(totalStorageMb.toFixed(2)),
    storage_quota_mb: 1024,
    usage_percent: parseFloat((totalStorageMb / 1024 * 100).toFixed(2)),
  };
}

export function getSupabaseBillingLinks(): Record<string, string> {
  const projectRef = 'ajhmmjuewdsukecaimik';
  return {
    billing: 'https://supabase.com/dashboard/org/_/billing',
    usage: 'https://supabase.com/dashboard/org/_/usage',
    database: `https://supabase.com/dashboard/project/${projectRef}/database/tables`,
    storage: `https://supabase.com/dashboard/project/${projectRef}/storage/buckets`,
    logs: `https://supabase.com/dashboard/project/${projectRef}/logs/explorer`,
    settings: `https://supabase.com/dashboard/project/${projectRef}/settings/general`,
    api_docs: `https://supabase.com/dashboard/project/${projectRef}/api`,
  };
}

export async function getSupabaseHealthCheck(
  supabase: SupabaseClient,
  supabaseUrl: string,
  anonKey: string,
  fetchFn: FetchLike = fetch,
): Promise<Record<string, unknown>> {
  const checks: Record<string, { ok: boolean; latency_ms: number; error?: string | null }> = {};

  const dbStart = Date.now();
  const { error: dbError } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true });
  checks.database = {
    ok: !dbError,
    latency_ms: Date.now() - dbStart,
    error: dbError?.message || null,
  };

  const authStart = Date.now();
  try {
    const response = await fetchFn(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: anonKey },
    });
    checks.auth = { ok: response.ok, latency_ms: Date.now() - authStart };
  } catch (error: unknown) {
    checks.auth = {
      ok: false,
      latency_ms: Date.now() - authStart,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const storageStart = Date.now();
  const { error: storageError } = await supabase.storage.listBuckets();
  checks.storage = {
    ok: !storageError,
    latency_ms: Date.now() - storageStart,
    error: storageError?.message || null,
  };

  const realtimeStart = Date.now();
  try {
    const response = await fetchFn(`${supabaseUrl}/realtime/v1/api/tenants`, {
      headers: { apikey: anonKey },
    });
    checks.realtime = {
      ok: response.status !== 500,
      latency_ms: Date.now() - realtimeStart,
    };
  } catch (error: unknown) {
    checks.realtime = {
      ok: false,
      latency_ms: Date.now() - realtimeStart,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    overall: Object.values(checks).every((check) => check.ok) ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  };
}

export async function executeSupabaseAdminOperation(
  op: SupabaseAdminOperation,
  supabase: SupabaseClient,
  options: {
    supabaseUrl: string;
    anonKey: string;
    fetchFn?: FetchLike;
  },
): Promise<Record<string, unknown>> {
  if (op === 'init-invoices') return initFinancialInvoicesProbe(supabase);
  if (op === 'status') return getSupabaseStatus(supabase, options.fetchFn);
  if (op === 'db-metrics') return getSupabaseDbMetrics(supabase);
  if (op === 'storage-usage') return getSupabaseStorageUsage(supabase);
  if (op === 'billing-links') return getSupabaseBillingLinks();
  return getSupabaseHealthCheck(
    supabase,
    options.supabaseUrl,
    options.anonKey,
    options.fetchFn,
  );
}
