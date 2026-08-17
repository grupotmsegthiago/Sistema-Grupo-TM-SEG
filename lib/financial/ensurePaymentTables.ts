/**
 * Garante tabela financial_transaction_payments + colunas amount_paid/amount_open.
 * Mesmo padrão de account_balance_snapshots (REST + exec_sql quando disponível).
 */

const DEFAULT_SUPABASE_URL = 'https://ajhmmjuewdsukecaimik.supabase.co';
const TMSEG_REF = 'ajhmmjuewdsukecaimik';

let ensured = false;

function decodeRef(key: string): string | null {
  try {
    const payload = key.split('.')[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))?.ref || null;
  } catch {
    return null;
  }
}

function isTmSegUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().includes(`${TMSEG_REF}.supabase.co`);
  } catch {
    return false;
  }
}

function getSupabaseConfig(): { url: string; key: string } {
  const rawUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
  const url = isTmSegUrl(rawUrl) ? rawUrl : DEFAULT_SUPABASE_URL;
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '').trim();
  // Init administrativo deve falhar fechado; nunca executar DDL/RPC com anon.
  const key = serviceKey && decodeRef(serviceKey) === TMSEG_REF ? serviceKey : '';
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

/** Bootstrap não pode recriar policy ampla após o futuro lockdown F4-P0-RLS. */
export function isFinancialPaymentsPolicyStatement(statement: string): boolean {
  return /\b(create|drop)\s+policy\b/i.test(statement) && /financial_transaction_payments/i.test(statement);
}

export function selectFinancialPaymentsBootstrapStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((block) =>
      block
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter(Boolean)
    .filter((statement) => !isFinancialPaymentsPolicyStatement(statement));
}

export function financialPaymentsMigrationSql(): string {
  return `
CREATE TABLE IF NOT EXISTS public.financial_transaction_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.financial_transactions(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ft_payments_tx
  ON public.financial_transaction_payments (transaction_id, payment_date DESC);
ALTER TABLE public.financial_transaction_payments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_open NUMERIC(14,2);
`.trim();
}

async function probePaymentsTable(): Promise<boolean> {
  const { url, key } = getSupabaseConfig();
  if (!key) return false;
  try {
    const res = await fetch(`${url}/rest/v1/financial_transaction_payments?select=id&limit=1`, {
      method: 'GET',
      headers: restHeaders(key),
    });
    if (res.status === 404 || res.status === 406) return false;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (/relation.*does not exist|PGRST205|42P01/i.test(text)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function tryExecSql(sql: string): Promise<boolean> {
  const { url, key } = getSupabaseConfig();
  if (!key) return false;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: restHeaders(key),
      body: JSON.stringify({ sql }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function ensureFinancialPaymentTables(): Promise<{ ok: boolean; exists: boolean; sql?: string }> {
  if (ensured) return { ok: true, exists: true };
  const exists = await probePaymentsTable();
  if (exists) {
    ensured = true;
    // colunas auxiliares — best effort
    await tryExecSql(`
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_open NUMERIC(14,2);
`.trim());
    return { ok: true, exists: true };
  }
  const sql = selectFinancialPaymentsBootstrapStatements(financialPaymentsMigrationSql()).join(';\n') + ';';
  const ran = await tryExecSql(sql);
  if (ran && (await probePaymentsTable())) {
    ensured = true;
    return { ok: true, exists: true };
  }
  return { ok: false, exists: false, sql };
}
