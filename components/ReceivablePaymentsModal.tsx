import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, X, Wallet } from 'lucide-react';
import { FinancialTransaction } from '../types';
import { formatDateBR } from '../lib/dateUtils';
import { useNotification } from '../lib/NotificationContext';
import {
  addPaymentToTransaction,
  deletePaymentFromTransaction,
  listPaymentsForTransaction,
  type FinancialTransactionPayment,
} from '../lib/financial/receivablePaymentsClient';
import { computePaymentSettlement } from '../lib/financial/partialPayments';

function getTodayBR(): string {
  const now = new Date();
  const brDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const y = brDate.getFullYear();
  const m = String(brDate.getMonth() + 1).padStart(2, '0');
  const d = String(brDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const formatCurrency = (val: number) =>
  val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

type Props = {
  transaction: FinancialTransaction;
  onClose: () => void;
  onUpdated: (patch: Partial<FinancialTransaction>) => void;
};

const ReceivablePaymentsModal: React.FC<Props> = ({ transaction, onClose, onUpdated }) => {
  const { showNotification } = useNotification();
  const [payments, setPayments] = useState<FinancialTransactionPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(getTodayBR());
  const [notes, setNotes] = useState('');

  const userName =
    (() => {
      try {
        return JSON.parse(localStorage.getItem('userData') || '{}').name || 'Sistema';
      } catch {
        return 'Sistema';
      }
    })();

  const settlement = computePaymentSettlement(
    Number(transaction.amount || 0),
    payments,
    transaction.notes,
  );

  const load = async () => {
    setLoading(true);
    try {
      const rows = await listPaymentsForTransaction(transaction.id);
      setPayments(rows);
    } catch (e: any) {
      console.error(e);
      showNotification(
        'Erro',
        e?.message?.includes('financial_transaction_payments') || e?.code === '42P01'
          ? 'Tabela de pagamentos ainda não existe. Execute a migration no Supabase (2026_07_20_financial_transaction_payments.sql).'
          : 'Erro ao carregar pagamentos: ' + (e?.message || e),
        'error',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transaction.id]);

  const handleAdd = async () => {
    const value = Number(String(amount).replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      showNotification('Atenção', 'Informe um valor de pagamento válido.', 'error');
      return;
    }
    setSaving(true);
    try {
      const result = await addPaymentToTransaction({
        transactionId: transaction.id,
        titleAmount: Number(transaction.amount || 0),
        titleNotes: transaction.notes,
        amount: value,
        paymentDate,
        notes,
        createdBy: userName,
        previousStatus: transaction.status,
      });
      onUpdated({
        status: result.status as FinancialTransaction['status'],
        amount_paid: result.paid,
        amount_open: result.open,
        payment_date: paymentDate,
      });
      setAmount('');
      setNotes('');
      await load();
      showNotification(
        'Sucesso',
        result.status === 'PARTIALLY_PAID'
          ? `Pagamento anexado. Em aberto: ${formatCurrency(result.open)}`
          : result.status === 'PAID'
            ? 'Pagamento anexado. Título quitado.'
            : 'Pagamento anexado.',
        'success',
      );
    } catch (e: any) {
      console.error(e);
      showNotification('Erro', 'Falha ao anexar pagamento: ' + (e?.message || e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (paymentId: string) => {
    if (!confirm('Remover este pagamento do título?')) return;
    setSaving(true);
    try {
      const result = await deletePaymentFromTransaction({
        paymentId,
        transactionId: transaction.id,
        titleAmount: Number(transaction.amount || 0),
        titleNotes: transaction.notes,
        createdBy: userName,
      });
      onUpdated({
        status: result.status as FinancialTransaction['status'],
        amount_paid: result.paid,
        amount_open: result.open,
      });
      await load();
    } catch (e: any) {
      showNotification('Erro', 'Falha ao remover pagamento: ' + (e?.message || e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4" data-testid="receivable-payments-modal">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b flex items-center justify-between bg-gradient-to-r from-orange-500 to-red-600 text-white">
          <div className="flex items-center gap-2">
            <Wallet size={18} />
            <div>
              <p className="text-sm font-black uppercase tracking-wide">Pagamentos recebidos</p>
              <p className="text-[11px] opacity-90 truncate max-w-[280px]">{transaction.description}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg" data-testid="btn-close-payments-modal">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-3 grid grid-cols-3 gap-2 border-b bg-gray-50">
          <div>
            <p className="text-[9px] font-black text-gray-400 uppercase">Título</p>
            <p className="text-sm font-black font-mono text-gray-800">{formatCurrency(Number(transaction.amount || 0))}</p>
          </div>
          <div>
            <p className="text-[9px] font-black text-gray-400 uppercase">Recebido</p>
            <p className="text-sm font-black font-mono text-green-600">{formatCurrency(settlement.paid)}</p>
          </div>
          <div>
            <p className="text-[9px] font-black text-gray-400 uppercase">Em aberto</p>
            <p className="text-sm font-black font-mono text-amber-600">{formatCurrency(settlement.open)}</p>
          </div>
        </div>

        <div className="px-5 py-4 space-y-3 border-b">
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Anexar pagamento</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-bold text-gray-600">
              Valor
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono"
                placeholder="0,00"
                data-testid="input-payment-amount"
              />
            </label>
            <label className="text-xs font-bold text-gray-600">
              Data
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                data-testid="input-payment-date"
              />
            </label>
          </div>
          <label className="block text-xs font-bold text-gray-600">
            Observação
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
              placeholder='Ex: valor parcial'
              data-testid="input-payment-notes"
            />
          </label>
          <p className="text-[10px] text-gray-400">
            Se a observação indicar parcial (ex.: &quot;valor parcial&quot;), o status fica <strong>Parcialmente Pago</strong> e o em aberto permanece no radar.
          </p>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleAdd()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black uppercase tracking-wide disabled:opacity-60"
            data-testid="btn-add-payment"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Anexar pagamento
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-orange-600" /></div>
          ) : payments.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8 italic">Nenhum pagamento anexado ainda.</p>
          ) : (
            <ul className="space-y-2">
              {payments.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-2 border rounded-xl px-3 py-2 bg-white">
                  <div>
                    <p className="text-sm font-black font-mono text-green-700">{formatCurrency(Number(p.amount))}</p>
                    <p className="text-[11px] text-gray-500 font-bold">{formatDateBR(p.payment_date + 'T12:00:00')}</p>
                    {p.notes ? (
                      <p className="text-[11px] text-amber-700 font-semibold mt-0.5">Obs: {p.notes}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleDelete(p.id)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                    title="Remover pagamento"
                    data-testid={`btn-delete-payment-${p.id}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReceivablePaymentsModal;
