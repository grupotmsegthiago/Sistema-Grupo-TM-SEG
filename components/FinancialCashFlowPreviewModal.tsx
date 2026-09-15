import React, { useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Wallet, X } from 'lucide-react';
import { formatDateBR } from '../lib/dateUtils';
import {
  amountPagarPreview,
  amountReceberPreview,
  dataPagamentoPreview,
  listCashAvailableAccounts,
  periodoCompetencia,
  splitCashFlowTitles,
  statusLabelFinanceiro,
  type CashFlowHorizon,
} from '../lib/financial/cashFlowPreview';
import type { FinancialAccount, FinancialTransaction } from '../types';

const formatCurrency = (val: number) =>
  val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const HORIZONS: { id: CashFlowHorizon; label: string }[] = [
  { id: 'DAY', label: 'Dia' },
  { id: 'WEEK', label: 'Semana' },
  { id: 'MONTH', label: 'Mês' },
];

type Props = {
  today: string;
  transactions: FinancialTransaction[];
  accounts: FinancialAccount[];
  latestBalances: Record<string, number>;
  onClose: () => void;
};

const FinancialCashFlowPreviewModal: React.FC<Props> = ({
  today,
  transactions,
  accounts,
  latestBalances,
  onClose,
}) => {
  const [horizon, setHorizon] = useState<CashFlowHorizon>('MONTH');
  const cash = useMemo(
    () => listCashAvailableAccounts(accounts, latestBalances),
    [accounts, latestBalances],
  );
  const { pagar, receber } = useMemo(
    () => splitCashFlowTitles(transactions, horizon, today),
    [transactions, horizon, today],
  );
  const totalPagar = pagar.reduce((s, t) => s + amountPagarPreview(t), 0);
  const totalReceber = receber.reduce((s, t) => s + amountReceberPreview(t), 0);
  const liquido = totalReceber - totalPagar;
  const projecao = cash.total + liquido;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="cash-flow-preview-overlay">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Resumo do caixa</h3>
            <p className="text-xs text-gray-500 mt-0.5">O que entra e o que sai no dia, na semana e no mês. Sem a conta de investimento.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" data-testid="btn-close-cash-flow-preview">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 border-b border-gray-100 bg-slate-50">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <Wallet size={12} /> Dinheiro nas contas
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {cash.accounts.map((acc) => (
              <div key={acc.id} className="bg-white border border-gray-200 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-black text-gray-800 uppercase truncate">{acc.name}</p>
                  <p className="text-[10px] text-gray-400 uppercase">{acc.bankName || '—'}</p>
                </div>
                <p className="text-sm font-black font-mono text-blue-700 shrink-0">{formatCurrency(acc.balance)}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between bg-blue-700 text-white rounded-xl px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest">Total em conta</p>
            <p className="text-xl font-black font-mono" data-testid="cash-flow-accounts-total">{formatCurrency(cash.total)}</p>
          </div>
        </div>

        <div className="px-5 pt-3 flex gap-1 bg-white">
          {HORIZONS.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => setHorizon(h.id)}
              data-testid={`cash-flow-horizon-${h.id.toLowerCase()}`}
              className={`flex-1 py-2 text-[11px] font-black uppercase rounded-lg ${
                horizon === h.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:text-gray-800'
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border border-red-100 rounded-xl overflow-hidden">
            <div className="bg-red-50 px-3 py-2 flex items-center justify-between">
              <p className="text-[11px] font-black uppercase text-red-800 flex items-center gap-1.5">
                <ArrowDownCircle size={14} /> Contas a Pagar
              </p>
              <p className="text-sm font-black font-mono text-red-600">(-) {formatCurrency(totalPagar)}</p>
            </div>
            <table className="w-full text-left">
              <thead>
                <tr className="text-[9px] font-black uppercase text-gray-400 bg-white">
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {pagar.length === 0 ? (
                  <tr><td colSpan={2} className="px-3 py-6 text-center text-xs text-gray-400">Nada a sair neste período</td></tr>
                ) : pagar.map((t) => (
                  <tr key={t.id} className="border-t border-red-50">
                    <td className="px-3 py-2 text-[11px] font-bold text-gray-700 uppercase">{t.description || t.entity_name || '—'}</td>
                    <td className="px-3 py-2 text-right text-[11px] font-black font-mono text-red-600">(-) {formatCurrency(amountPagarPreview(t))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border border-emerald-100 rounded-xl overflow-hidden">
            <div className="bg-emerald-50 px-3 py-2 flex items-center justify-between">
              <p className="text-[11px] font-black uppercase text-emerald-800 flex items-center gap-1.5">
                <ArrowUpCircle size={14} /> Contas a Receber
              </p>
              <p className="text-sm font-black font-mono text-emerald-600">(+) {formatCurrency(totalReceber)}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[520px]">
                <thead>
                  <tr className="text-[9px] font-black uppercase text-gray-400 bg-white">
                    <th className="px-3 py-2">Cliente</th>
                    <th className="px-3 py-2">Período</th>
                    <th className="px-3 py-2">Data pagamento</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {receber.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-xs text-gray-400">Nada a entrar neste período</td></tr>
                  ) : receber.map((t) => (
                    <tr key={t.id} className="border-t border-emerald-50">
                      <td className="px-3 py-2 text-[11px] font-bold text-gray-700 uppercase">{t.entity_name || t.description || '—'}</td>
                      <td className="px-3 py-2 text-[11px] font-mono text-gray-500">{periodoCompetencia(t.due_date)}</td>
                      <td className="px-3 py-2 text-[11px] font-mono text-gray-500">{formatDateBR(dataPagamentoPreview(t) + 'T12:00:00')}</td>
                      <td className="px-3 py-2 text-[10px] font-black uppercase text-gray-600">{statusLabelFinanceiro(t.status)}</td>
                      <td className="px-3 py-2 text-right text-[11px] font-black font-mono text-emerald-600">(+) {formatCurrency(amountReceberPreview(t))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-200 grid grid-cols-2 lg:grid-cols-4 gap-2 bg-white">
          <div className="rounded-lg bg-red-50 px-3 py-2">
            <p className="text-[9px] font-black uppercase text-red-500">A sair</p>
            <p className="text-sm font-black font-mono text-red-600">(-) {formatCurrency(totalPagar)}</p>
          </div>
          <div className="rounded-lg bg-emerald-50 px-3 py-2">
            <p className="text-[9px] font-black uppercase text-emerald-600">A entrar</p>
            <p className="text-sm font-black font-mono text-emerald-600">(+) {formatCurrency(totalReceber)}</p>
          </div>
          <div className={`rounded-lg px-3 py-2 ${liquido >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
            <p className="text-[9px] font-black uppercase text-gray-400">Líquido do período</p>
            <p className={`text-sm font-black font-mono ${liquido >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatCurrency(liquido)}</p>
          </div>
          <div className="rounded-lg bg-blue-50 px-3 py-2">
            <p className="text-[9px] font-black uppercase text-blue-600">Conta + líquido</p>
            <p className="text-sm font-black font-mono text-blue-800" data-testid="cash-flow-projection">{formatCurrency(projecao)}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinancialCashFlowPreviewModal;
