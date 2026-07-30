import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, X, Wallet } from 'lucide-react';
import type { FinancialTransaction } from '../types';
import { useNotification } from '../lib/NotificationContext';
import {
  buildConfirmReceivablePayPlan,
  formatBrl,
  parseMoneyInput,
} from '../lib/financial/confirmReceivablePay';
import { confirmReceivablePayment } from '../lib/financial/confirmReceivablePayClient';

function getTodayBR(): string {
  const now = new Date();
  const brDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const y = brDate.getFullYear();
  const m = String(brDate.getMonth() + 1).padStart(2, '0');
  const d = String(brDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

type Props = {
  transaction: FinancialTransaction;
  onClose: () => void;
  onConfirmed: (result: {
    updated: Partial<FinancialTransaction>;
    residual?: FinancialTransaction | null;
  }) => void;
};

const ReceivablePayConfirmModal: React.FC<Props> = ({ transaction, onClose, onConfirmed }) => {
  const { showNotification } = useNotification();
  const titleAmount = Number(transaction.amount || 0);
  const [principal, setPrincipal] = useState(String(titleAmount.toFixed(2)).replace('.', ','));
  const [interest, setInterest] = useState('');
  const [fine, setFine] = useState('');
  const [paymentDate, setPaymentDate] = useState(getTodayBR());
  const [saving, setSaving] = useState(false);

  const userName = (() => {
    try {
      return JSON.parse(localStorage.getItem('userData') || '{}').name || 'Sistema';
    } catch {
      return 'Sistema';
    }
  })();

  const plan = useMemo(
    () =>
      buildConfirmReceivablePayPlan({
        titleAmount,
        principalPaid: parseMoneyInput(principal),
        interest: parseMoneyInput(interest),
        fine: parseMoneyInput(fine),
        dueDate: String(transaction.due_date || '').slice(0, 10),
        today: getTodayBR(),
      }),
    [titleAmount, principal, interest, fine, transaction.due_date],
  );

  const handleConfirm = async () => {
    if (plan.principalApplied <= 0.009) {
      showNotification('Atenção', 'Informe o valor pago do principal do título.', 'error');
      return;
    }
    setSaving(true);
    try {
      const result = await confirmReceivablePayment({
        transaction,
        principalPaid: plan.principalApplied,
        interest: plan.interest,
        fine: plan.fine,
        paymentDate,
        today: getTodayBR(),
        createdBy: userName,
      });
      onConfirmed({ updated: result.updated, residual: result.residual });
      const msg = result.plan.isPartial
        ? `Pago incompleto ${formatBrl(result.plan.principalApplied)}. Residual ${formatBrl(result.plan.residual)} criado como ${result.plan.residualStatus === 'OVERDUE' ? 'VENCIDO' : 'PENDENTE'}.`
        : result.plan.interest > 0 || result.plan.fine > 0
          ? `Título quitado. Total recebido ${formatBrl(result.plan.totalReceived)}.`
          : 'Título marcado como PAGO.';
      showNotification('Sucesso', msg, 'success');
      onClose();
    } catch (e: any) {
      console.error(e);
      showNotification('Erro', 'Falha ao confirmar pagamento: ' + (e?.message || e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4"
      data-testid="receivable-pay-confirm-modal"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b flex items-center justify-between bg-gradient-to-r from-emerald-600 to-teal-700 text-white">
          <div className="flex items-center gap-2 min-w-0">
            <Wallet size={18} className="shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-black uppercase tracking-wide">Confirmar pagamento</p>
              <p className="text-[11px] opacity-90 truncate">{transaction.description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-white/20 rounded-lg shrink-0"
            data-testid="btn-close-pay-confirm"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3 bg-gray-50 border border-gray-100 rounded-xl p-3">
            <div>
              <p className="text-[9px] font-black text-gray-400 uppercase">Favorecido</p>
              <p className="text-xs font-bold text-gray-800 truncate">{transaction.entity_name || '—'}</p>
            </div>
            <div>
              <p className="text-[9px] font-black text-gray-400 uppercase">Valor do título</p>
              <p className="text-sm font-black font-mono text-gray-900">{formatBrl(titleAmount)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold text-gray-600 col-span-2 sm:col-span-1">
              Valor pago (principal)
              <input
                type="text"
                inputMode="decimal"
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono"
                data-testid="input-pay-principal"
              />
            </label>
            <label className="text-xs font-bold text-gray-600 col-span-2 sm:col-span-1">
              Data do pagamento
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                data-testid="input-pay-date"
              />
            </label>
            <label className="text-xs font-bold text-gray-600">
              Juros (opcional)
              <input
                type="text"
                inputMode="decimal"
                value={interest}
                onChange={(e) => setInterest(e.target.value)}
                placeholder="0,00"
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono"
                data-testid="input-pay-interest"
              />
            </label>
            <label className="text-xs font-bold text-gray-600">
              Multa (opcional)
              <input
                type="text"
                inputMode="decimal"
                value={fine}
                onChange={(e) => setFine(e.target.value)}
                placeholder="0,00"
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono"
                data-testid="input-pay-fine"
              />
            </label>
          </div>

          {plan.alerts.length > 0 && (
            <div
              className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-1"
              data-testid="pay-confirm-alerts"
            >
              <div className="flex items-center gap-1.5 text-amber-800 text-[10px] font-black uppercase">
                <AlertTriangle size={12} /> Atenção
              </div>
              {plan.alerts.map((a) => (
                <p key={a} className="text-xs font-semibold text-amber-900">
                  {a}
                </p>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="font-bold text-gray-600">Principal aplicado</span>
              <span className="font-mono font-black text-gray-900">{formatBrl(plan.principalApplied)}</span>
            </div>
            {plan.interest > 0.009 && (
              <div className="flex justify-between text-xs">
                <span className="font-bold text-amber-700">(+) Juros</span>
                <span className="font-mono font-black text-amber-800">{formatBrl(plan.interest)}</span>
              </div>
            )}
            {plan.fine > 0.009 && (
              <div className="flex justify-between text-xs">
                <span className="font-bold text-amber-700">(+) Multa</span>
                <span className="font-mono font-black text-amber-800">{formatBrl(plan.fine)}</span>
              </div>
            )}
            {plan.isPartial && (
              <div className="flex justify-between text-xs border-t border-emerald-200 pt-1.5">
                <span className="font-bold text-orange-700">Residual (nova linha)</span>
                <span className="font-mono font-black text-orange-700">{formatBrl(plan.residual)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm border-t border-emerald-300 pt-2">
              <span className="font-black text-emerald-800 uppercase">Total recebido</span>
              <span className="font-mono font-black text-emerald-900" data-testid="pay-confirm-total">
                {formatBrl(plan.totalReceived)}
              </span>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t bg-gray-50 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-xs font-bold rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
            data-testid="btn-cancel-pay-confirm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={saving}
            className="px-4 py-2 text-xs font-black rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1.5 disabled:opacity-60"
            data-testid="btn-confirm-pay"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Confirmar PAGO
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceivablePayConfirmModal;
