import { supabase } from '../supabase';

export type BalanceSnapshotRow = {
  id: number;
  account_id: string;
  balance: number;
  notes: string;
  created_by: string;
  recorded_at: string;
};

export async function insertBalanceSnapshotDirect(input: {
  account_id: string;
  balance: number;
  notes?: string;
  created_by?: string;
}): Promise<BalanceSnapshotRow> {
  const payload = {
    account_id: String(input.account_id || '').trim(),
    balance: input.balance,
    notes: String(input.notes || ''),
    created_by: String(input.created_by || ''),
  };

  const { data, error } = await supabase
    .from('account_balance_snapshots')
    .insert([payload])
    .select('*')
    .single();

  if (error) {
    if (/relation.*does not exist|42P01|PGRST205/i.test(error.message)) {
      throw new Error(
        'Tabela de histórico de investimento não configurada. Contate o suporte para aplicar a migration account_balance_snapshots.',
      );
    }
    throw new Error(error.message);
  }

  if (!data?.id) {
    throw new Error('Supabase não retornou o registro gravado');
  }

  return data as BalanceSnapshotRow;
}

export async function deleteBalanceSnapshotDirect(id: number): Promise<void> {
  const { error } = await supabase.from('account_balance_snapshots').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
