import React, { useState } from 'react';
import { Wallet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchAllPages } from '../lib/supabasePaging';
import { listBalanceSnapshots } from '../lib/investment/snapshotClient';
import { useNotification } from '../lib/NotificationContext';
import { isPureMedicaoReceivable } from '../lib/billing/medicaoVisibility';
import { isInternalGroupTransfer } from '../lib/financialInternalTransfer';
import { cashFlowCoverRange } from '../lib/financial/cashFlowPreview';
import { formatIsoDateBR } from '../lib/dateUtils';
import FinancialCashFlowPreviewModal from './FinancialCashFlowPreviewModal';
import type { FinancialAccount, FinancialCategory, FinancialTransaction } from '../types';

type Props = {
  className?: string;
  testId?: string;
};

const DEFAULT_CLASS =
  'inline-flex items-center justify-center gap-2 bg-blue-50 border border-blue-200 text-blue-800 hover:bg-blue-100 px-4 py-2 rounded-lg text-sm font-bold transition-all no-print';

const CashFlowPreviewButton: React.FC<Props> = ({
  className = DEFAULT_CLASS,
  testId = 'btn-resumo-caixa',
}) => {
  const { showNotification } = useNotification();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [latestBalances, setLatestBalances] = useState<Record<string, number>>({});

  const openPreview = async () => {
    setOpen(true);
    setLoading(true);
    try {
      const today = formatIsoDateBR();
      const cover = cashFlowCoverRange(today);
      const [txResult, accRes, snapshots, catRes] = await Promise.all([
        fetchAllPages<FinancialTransaction>(async (from, size) => {
          const { data, error, count } = await supabase
            .from('financial_transactions')
            .select('*', { count: 'exact' })
            .gte('due_date', cover.start)
            .lte('due_date', cover.end)
            .order('due_date', { ascending: true })
            .order('id', { ascending: true })
            .range(from, from + size - 1);
          return { data: data as FinancialTransaction[] | null, error, count };
        }),
        supabase.from('financial_accounts').select('id, name, bank_name, initial_balance, status').eq('status', 'Ativo'),
        listBalanceSnapshots(3650).catch(() => [] as Awaited<ReturnType<typeof listBalanceSnapshots>>),
        supabase.from('financial_categories').select('id, group, name'),
      ]);

      const categories = (catRes.data || []) as FinancialCategory[];
      const investmentIds = new Set(categories.filter((c) => c.group === 'INVESTIMENTOS').map((c) => c.id));
      const rows = txResult.rows.filter((t) =>
        !isPureMedicaoReceivable(t)
        && !investmentIds.has(t.category_id)
        && !(t.notes || '').startsWith('Atualização de saldo de investimento')
        && !isInternalGroupTransfer(t, categories),
      );
      setTransactions(rows);
      if (accRes.data) setAccounts(accRes.data as FinancialAccount[]);

      const latest: Record<string, { balance: number; at: number }> = {};
      for (const s of snapshots || []) {
        const id = String(s.account_id || '');
        if (!id) continue;
        const at = new Date(s.recorded_at).getTime();
        if (!Number.isFinite(at)) continue;
        const prev = latest[id];
        if (!prev || at >= prev.at) latest[id] = { balance: Number(s.balance) || 0, at };
      }
      const map: Record<string, number> = {};
      for (const [id, v] of Object.entries(latest)) map[id] = v.balance;
      setLatestBalances(map);

      if (!txResult.complete) {
        showNotification('Consulta incompleta', 'O resumo do caixa não carregou todos os títulos do período.', 'warning');
      }
    } catch (e) {
      showNotification('Resumo', e instanceof Error ? e.message : 'Falha ao montar o resumo do caixa', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { void openPreview(); }}
        className={className}
        data-testid={testId}
      >
        <Wallet size={16} /> {loading ? 'Montando…' : 'Resumo'}
      </button>
      {open && (
        <FinancialCashFlowPreviewModal
          today={formatIsoDateBR()}
          transactions={transactions}
          accounts={accounts}
          latestBalances={latestBalances}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};

export default CashFlowPreviewButton;
