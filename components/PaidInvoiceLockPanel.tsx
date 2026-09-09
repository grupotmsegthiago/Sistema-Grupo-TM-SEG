import React from 'react';
import { Lock } from 'lucide-react';
import type { StatusTravaOS } from '../lib/billing/verificarTravaOS';

type Props = {
  lock: StatusTravaOS;
  unlocked: boolean;
  canUnlock: boolean;
  reason: string;
  unlocking?: boolean;
  onReasonChange: (value: string) => void;
  onUnlock: () => void;
  onRelock?: () => void;
};

export default function PaidInvoiceLockPanel({
  lock,
  unlocked,
  canUnlock,
  reason,
  unlocking,
  onReasonChange,
  onUnlock,
  onRelock,
}: Props) {
  if (!lock.bloqueado) return null;
  return (
    <div
      data-testid="paid-invoice-lock-banner"
      className={`mx-4 mt-4 border-2 rounded-xl p-4 shadow-sm ${unlocked ? 'bg-orange-50 border-orange-400' : 'bg-red-50 border-red-400'}`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg shrink-0 ${unlocked ? 'bg-orange-500' : 'bg-red-600'}`}>
          <Lock size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-black text-sm uppercase tracking-wide ${unlocked ? 'text-orange-900' : 'text-red-900'}`}>
            {unlocked ? 'Ajuste desbloqueado nesta sessão' : 'OS vinculada a fatura PAGA'}
          </p>
          <p className={`text-xs mt-1 ${unlocked ? 'text-orange-800' : 'text-red-800'}`}>
            {lock.motivo}
            {lock.faturaNumero ? ` Fatura ${lock.faturaNumero}.` : ''}
          </p>
          {canUnlock && !unlocked && (
            <div className="mt-3 space-y-2">
              <textarea
                className="w-full text-xs border border-red-200 rounded-lg p-2 outline-none focus:border-red-500 bg-white"
                rows={2}
                placeholder="Justificativa obrigatória para a Diretoria (mín. 8 caracteres)"
                value={reason}
                onChange={(e) => onReasonChange(e.target.value)}
                data-testid="input-paid-invoice-unlock-reason"
              />
              <button
                type="button"
                disabled={unlocking}
                onClick={onUnlock}
                className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider bg-red-700 text-white hover:bg-red-800 disabled:opacity-50"
                data-testid="button-paid-invoice-unlock"
              >
                Desbloquear ajuste
              </button>
            </div>
          )}
          {canUnlock && unlocked && onRelock && (
            <button
              type="button"
              onClick={onRelock}
              className="mt-3 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider bg-white text-orange-800 border-2 border-orange-300 hover:bg-orange-100"
              data-testid="button-paid-invoice-relock"
            >
              Travar de novo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
