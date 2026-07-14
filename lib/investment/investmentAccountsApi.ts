/**
 * CRUD de financial_accounts para o Painel de Investimentos (Vercel serverless).
 * Espelha a lógica de server/routes.ts /api/investment/accounts*.
 */
import { createSupabaseAdminClient } from '../supabaseAdmin.js';
import { deleteSnapshotsForAccount } from './accountBalanceSnapshots.js';

export type InvestmentAccountRow = {
  id: string;
  name: string;
  initial_balance: number;
  bank_name: string | null;
  status?: string | null;
  [key: string]: unknown;
};

function requireAdmin() {
  const sb = createSupabaseAdminClient();
  if (!sb) {
    throw new Error('Supabase não configurado (service role)');
  }
  return sb;
}

export async function createInvestmentAccount(input: {
  name: string;
  initial_balance: number;
  bank_name?: string;
}): Promise<InvestmentAccountRow> {
  const name = String(input.name || '').trim();
  const bank_name = String(input.bank_name || '').trim();
  const initial_balance = Number(input.initial_balance);
  if (!name) throw new Error('Nome da conta é obrigatório');
  if (!Number.isFinite(initial_balance)) throw new Error('Saldo inicial inválido');

  const sb = requireAdmin();
  const { data, error } = await sb
    .from('financial_accounts')
    .insert([{ name, initial_balance, bank_name, status: 'Ativo' }])
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Falha ao criar conta');
  return data as InvestmentAccountRow;
}

export async function updateInvestmentAccount(
  id: string,
  input: { name: string; initial_balance: number; bank_name?: string },
): Promise<InvestmentAccountRow> {
  const accountId = String(id || '').trim();
  const name = String(input.name || '').trim();
  const bank_name = String(input.bank_name || '').trim();
  const initial_balance = Number(input.initial_balance);
  if (!accountId) throw new Error('ID da conta é obrigatório');
  if (!name) throw new Error('Nome da conta é obrigatório');
  if (!Number.isFinite(initial_balance)) throw new Error('Saldo inicial inválido');

  const sb = requireAdmin();
  const { data, error } = await sb
    .from('financial_accounts')
    .update({ name, initial_balance, bank_name })
    .eq('id', accountId)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Conta não encontrada');
  return data as InvestmentAccountRow;
}

export async function deleteOrDeactivateInvestmentAccount(id: string): Promise<{
  ok: true;
  mode: 'deleted' | 'deactivated';
  account?: InvestmentAccountRow;
  message?: string;
}> {
  const accountId = String(id || '').trim();
  if (!accountId) throw new Error('ID da conta é obrigatório');

  const sb = requireAdmin();
  const { count, error: txErr } = await sb
    .from('financial_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId);
  if (txErr) throw new Error(txErr.message);

  const hasTransactions = (count || 0) > 0;
  if (hasTransactions) {
    const { data, error } = await sb
      .from('financial_accounts')
      .update({ status: 'Inativo' })
      .eq('id', accountId)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    try {
      await deleteSnapshotsForAccount(accountId);
    } catch {
      // histórico opcional
    }
    return {
      ok: true,
      mode: 'deactivated',
      account: data as InvestmentAccountRow,
      message: 'Conta desativada (possui lançamentos financeiros vinculados).',
    };
  }

  try {
    await deleteSnapshotsForAccount(accountId);
  } catch {
    // ignora se histórico ausente
  }

  const { error } = await sb.from('financial_accounts').delete().eq('id', accountId);
  if (error) throw new Error(error.message);
  return { ok: true, mode: 'deleted' };
}
