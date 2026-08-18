/**
 * SSOT backend de account_balance_snapshots.
 * A identidade é validada pelos handlers TM SEG; o acesso ao banco exige
 * service_role e nunca degrada para anon.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createSupabaseAdminClient,
  getSupabaseServiceRoleKey,
} from '../supabaseAdmin.js';

export type BalanceSnapshotRow = {
  id: number;
  account_id: string;
  balance: number;
  notes: string;
  created_by: string;
  recorded_at: string;
};

type SnapshotsAdminDeps = {
  getServiceRoleKey: () => string;
  createAdminClient: () => SupabaseClient | null;
};

const defaultAdminDeps: SnapshotsAdminDeps = {
  getServiceRoleKey: getSupabaseServiceRoleKey,
  createAdminClient: createSupabaseAdminClient,
};

let tableEnsured = false;

/** Bloqueia toda operação antes de criar cliente quando service_role está ausente. */
export function requireSnapshotsAdminClient(
  deps: SnapshotsAdminDeps = defaultAdminDeps,
): SupabaseClient {
  if (!deps.getServiceRoleKey()) {
    throw new Error('Supabase admin indisponível — service_role obrigatória');
  }
  const client = deps.createAdminClient();
  if (!client) {
    throw new Error('Supabase admin indisponível — service_role obrigatória');
  }
  return client;
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
  return new Date(Date.now() - Math.max(1, days) * 86400000).toISOString();
}

/** Estrutura somente: deliberadamente não cria/remove nenhuma policy. */
export function snapshotsStructuralSql(): string {
  return `CREATE TABLE IF NOT EXISTS public.account_balance_snapshots (
    id serial PRIMARY KEY,
    account_id text NOT NULL,
    balance numeric(18,2) NOT NULL DEFAULT 0,
    notes text DEFAULT '',
    created_by text DEFAULT '',
    recorded_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_account_balance_snapshots_account_ts
    ON public.account_balance_snapshots (account_id, recorded_at DESC);
  COMMENT ON TABLE public.account_balance_snapshots IS
    'Histórico de saldos informados manualmente em contas de investimento';
  ALTER TABLE public.account_balance_snapshots ENABLE ROW LEVEL SECURITY;`;
}

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === '42P01'
    || error.code === 'PGRST205'
    || /relation.*does not exist|schema cache/i.test(String(error.message || ''))
  );
}

export async function ensureSnapshotsTable(
  client: SupabaseClient = requireSnapshotsAdminClient(),
): Promise<void> {
  if (tableEnsured) return;

  const { error } = await client
    .from('account_balance_snapshots')
    .select('id')
    .limit(1);
  if (!error) {
    tableEnsured = true;
    return;
  }
  if (!isMissingTableError(error)) {
    throw new Error(error.message || 'Falha ao verificar account_balance_snapshots');
  }

  const { error: migrationError } = await client.rpc('exec_sql', {
    sql: snapshotsStructuralSql(),
  });
  if (migrationError) {
    throw new Error(migrationError.message || 'Falha ao criar account_balance_snapshots');
  }
  tableEnsured = true;
}

async function selectSnapshots(
  client: SupabaseClient,
  filters: { accountId?: string; since?: string },
): Promise<BalanceSnapshotRow[]> {
  let query = client
    .from('account_balance_snapshots')
    .select('*');
  if (filters.accountId) query = query.eq('account_id', filters.accountId);
  if (filters.since) query = query.gte('recorded_at', filters.since);
  const { data, error } = await query.order('recorded_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || [])
    .map((row) => normalizeRow(row))
    .filter(Boolean) as BalanceSnapshotRow[];
}

export async function listSnapshotsForAccount(
  accountId: string,
  days: number,
  client: SupabaseClient = requireSnapshotsAdminClient(),
): Promise<BalanceSnapshotRow[]> {
  await ensureSnapshotsTable(client);
  return selectSnapshots(client, { accountId, since: sinceIso(days) });
}

export async function listAllSnapshots(
  days: number,
  client: SupabaseClient = requireSnapshotsAdminClient(),
): Promise<BalanceSnapshotRow[]> {
  await ensureSnapshotsTable(client);
  return selectSnapshots(client, { since: sinceIso(days) });
}

export async function insertSnapshot(
  input: {
    account_id: string;
    balance: number;
    notes?: string;
    created_by?: string;
  },
  client: SupabaseClient = requireSnapshotsAdminClient(),
): Promise<BalanceSnapshotRow> {
  const payload = {
    account_id: String(input.account_id || '').trim(),
    balance: input.balance,
    notes: String(input.notes || ''),
    created_by: String(input.created_by || ''),
  };

  if (!payload.account_id) throw new Error('account_id é obrigatório');
  if (!Number.isFinite(payload.balance)) throw new Error('balance inválido');

  await ensureSnapshotsTable(client);
  const { data, error } = await client
    .from('account_balance_snapshots')
    .insert([payload])
    .select('*')
    .single();
  if (error) throw new Error(`insert ${error.message}`);

  const normalized = normalizeRow(data as Record<string, unknown>);
  if (!normalized) throw new Error('insert retornou resposta vazia do Supabase');
  return normalized;
}

export async function deleteSnapshot(
  id: number,
  client: SupabaseClient = requireSnapshotsAdminClient(),
): Promise<boolean> {
  const { error } = await client
    .from('account_balance_snapshots')
    .delete()
    .eq('id', id);
  if (error) throw new Error(`delete ${error.message}`);
  return true;
}

/** Remove todo o histórico de saldo de uma conta (antes de excluir/desativar). */
export async function deleteSnapshotsForAccount(
  accountId: string,
  client: SupabaseClient = requireSnapshotsAdminClient(),
): Promise<boolean> {
  const id = String(accountId || '').trim();
  if (!id) return false;
  const { error } = await client
    .from('account_balance_snapshots')
    .delete()
    .eq('account_id', id);
  if (error) throw new Error(`delete by account ${error.message}`);
  return true;
}
