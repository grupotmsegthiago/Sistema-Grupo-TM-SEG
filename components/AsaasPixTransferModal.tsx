import React, { useMemo, useState } from 'react';
import { X, Loader2, Send, Wallet, AlertCircle } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import { parseJsonResponse } from '../lib/parseJsonResponse';
import { withTimeout, TimeoutError } from '../lib/promiseTimeout';
import { parseAmountBR } from '../lib/utils';
import {
  ASAAS_PIX_FINANCEIRO_EMAIL,
  ASAAS_PIX_MIN_RESERVE_BRL,
  calcMaxPixTransfer,
  isValidPixTransferAmount,
  roundMoneyBrl,
} from '../lib/asaasPixTransfer';
import { formatAsaasTransferError } from '../lib/asaasTransferErrors';

interface Props {
  company: string;
  label: string;
  balance: number;
  onClose: () => void;
  onSuccess: () => void;
}

type AmountMode = 'full' | 'custom';

const formatBrl = (val: number) =>
  val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const AsaasPixTransferModal: React.FC<Props> = ({ company, label, balance, onClose, onSuccess }) => {
  const maxTransfer = useMemo(() => calcMaxPixTransfer(balance), [balance]);
  const [mode, setMode] = useState<AmountMode>(maxTransfer > 0 ? 'full' : 'custom');
  const [customAmount, setCustomAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const selectedValue = mode === 'full' ? maxTransfer : roundMoneyBrl(parseAmountBR(customAmount));

  const validation = useMemo(() => {
    if (mode === 'full') {
      return isValidPixTransferAmount(maxTransfer, balance);
    }
    if (!customAmount.trim()) {
      return { ok: false as const, error: 'Informe o valor ou selecione valor total.' };
    }
    return isValidPixTransferAmount(selectedValue, balance);
  }, [mode, maxTransfer, balance, customAmount, selectedValue]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    const value = mode === 'full' ? maxTransfer : selectedValue;
    const ok = window.confirm(
      `Confirmar transferência Pix de ${formatBrl(value)}?\n\n` +
        `Origem: ${label}\n` +
        `Destino: ${ASAAS_PIX_FINANCEIRO_EMAIL}\n` +
        `Permanecerá ${formatBrl(ASAAS_PIX_MIN_RESERVE_BRL)} na conta de origem.`,
    );
    if (!ok) return;

    setSubmitting(true);
    try {
      const res = await withTimeout(
        authFetch('/api/asaas/transfer-pix', {
          method: 'POST',
          body: JSON.stringify({ company, value }),
        }),
        30_000,
        'Tempo esgotado ao solicitar transferência Pix',
      );
      const json = await parseJsonResponse(res);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Erro na transferência (${res.status})`);
      }
      onSuccess();
      onClose();
    } catch (err) {
      const msg =
        err instanceof TimeoutError
          ? 'A solicitação demorou demais. Verifique o extrato Asaas antes de tentar novamente.'
          : err instanceof Error
            ? formatAsaasTransferError(err.message)
            : 'Falha na transferência Pix';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h3 className="font-black text-gray-900 text-sm uppercase flex items-center gap-2">
            <Send size={16} className="text-teal-600" />
            Transferir Pix — {label}
          </h3>
          <button type="button" onClick={onClose} disabled={submitting}>
            <X size={18} className="text-gray-400 hover:text-gray-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1 text-xs">
            <p className="flex justify-between">
              <span className="text-gray-500">Saldo atual</span>
              <span className="font-bold text-gray-900">{formatBrl(balance)}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-gray-500">Reserva obrigatória</span>
              <span className="font-bold text-amber-700">{formatBrl(ASAAS_PIX_MIN_RESERVE_BRL)}</span>
            </p>
            <p className="flex justify-between border-t border-slate-200 pt-2">
              <span className="text-gray-600 font-bold">Disponível para transferir</span>
              <span className="font-black text-teal-700">{formatBrl(maxTransfer)}</span>
            </p>
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase mb-1 block">Destino Pix</label>
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-800">
              <Wallet size={14} className="text-teal-600 shrink-0" />
              {ASAAS_PIX_FINANCEIRO_EMAIL}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase block">Valor</label>
            <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
              <input
                type="radio"
                name="pix-amount-mode"
                checked={mode === 'full'}
                disabled={maxTransfer <= 0 || submitting}
                onChange={() => setMode('full')}
              />
              <span className="text-sm font-bold text-gray-800">Valor total disponível ({formatBrl(maxTransfer)})</span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
              <input
                type="radio"
                name="pix-amount-mode"
                checked={mode === 'custom'}
                disabled={submitting}
                onChange={() => setMode('custom')}
                className="mt-1"
              />
              <div className="flex-1">
                <span className="text-sm font-bold text-gray-800 block mb-1">Informar valor</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Ex: 1.500,00"
                  disabled={mode !== 'custom' || submitting}
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100"
                  data-testid="input-pix-custom-amount"
                />
              </div>
            </label>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-red-600 text-xs bg-red-50 border border-red-100 rounded-lg p-3">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!validation.ok && !error && customAmount.trim() && mode === 'custom' && (
            <p className="text-xs text-amber-700">{validation.error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-bold text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !validation.ok}
              className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-black uppercase disabled:opacity-50 flex items-center justify-center gap-2"
              data-testid="btn-confirm-pix-transfer"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Transferir Pix
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AsaasPixTransferModal;
