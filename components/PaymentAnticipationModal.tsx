import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, Loader2, Search, X, AlertTriangle, CheckCircle2, Link2 } from 'lucide-react';
import type { FinancialTransaction } from '../types';
import { useNotification } from '../lib/NotificationContext';
import {
  buildAnticipationPlan,
  formatBrl,
  parseAnticipationMoney,
  parsePctInput,
  settlementLabel,
} from '../lib/financial/paymentAnticipation';
import {
  savePaymentAnticipation,
  searchOpenReceivables,
  type AnticipationLinkable,
} from '../lib/financial/paymentAnticipationClient';
import { getTransactionOpenAmount } from '../lib/financial/partialPayments';
import { formatDateBR } from '../lib/dateUtils';
import { logAction } from '../lib/logger';
import { withTimeout } from '../lib/promiseTimeout';

function getTodayBR(): string {
  const now = new Date();
  const brDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const y = brDate.getFullYear();
  const m = String(brDate.getMonth() + 1).padStart(2, '0');
  const d = String(brDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

type Props = {
  preselected: FinancialTransaction[];
  onClose: () => void;
  onSaved: (result: {
    updatedIds: string[];
    residual: FinancialTransaction | null;
  }) => void;
};

const PaymentAnticipationModal: React.FC<Props> = ({ preselected, onClose, onSaved }) => {
  const { showNotification } = useNotification();
  const today = getTodayBR();
  const [nfNumber, setNfNumber] = useState('');
  const [operationDate, setOperationDate] = useState(today);
  const [averageRate, setAverageRate] = useState('');
  const [netAnticipated, setNetAnticipated] = useState('');
  const [offeredAmount, setOfferedAmount] = useState('');
  const [titleId, setTitleId] = useState('');
  const [itemId, setItemId] = useState('');
  const [paymentDate, setPaymentDate] = useState(today);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [candidates, setCandidates] = useState<AnticipationLinkable[]>(preselected);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(preselected.map((t) => t.id)),
  );

  const userName = (() => {
    try {
      return JSON.parse(localStorage.getItem('userData') || '{}').name || 'Sistema';
    } catch {
      return 'Sistema';
    }
  })();

  useEffect(() => {
    const map = new Map<string, AnticipationLinkable>();
    for (const t of preselected) map.set(t.id, t);
    setCandidates(Array.from(map.values()));
  }, [preselected]);

  const runSearch = async () => {
    setSearching(true);
    try {
      const rows = await searchOpenReceivables(search);
      setCandidates((prev) => {
        const map = new Map<string, AnticipationLinkable>();
        for (const t of prev) {
          if (selectedIds.has(t.id)) map.set(t.id, t);
        }
        for (const t of rows) map.set(t.id, t);
        return Array.from(map.values());
      });
    } catch (e: any) {
      showNotification('Erro', 'Falha ao buscar títulos: ' + (e?.message || e), 'error');
    } finally {
      setSearching(false);
    }
  };

  const selected = useMemo(
    () => candidates.filter((t) => selectedIds.has(t.id)),
    [candidates, selectedIds],
  );

  const plan = useMemo(
    () =>
      buildAnticipationPlan({
        nfNumber,
        operationDate,
        averageRatePct: parsePctInput(averageRate),
        netAnticipated: parseAnticipationMoney(netAnticipated),
        offeredAmount: parseAnticipationMoney(offeredAmount),
        titleId,
        itemId,
        paymentDate,
        linkedAmounts: selected.map((t) => getTransactionOpenAmount(t)),
      }),
    [nfNumber, operationDate, averageRate, netAnticipated, offeredAmount, titleId, itemId, paymentDate, selected],
  );

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (selected.length === 0) {
      showNotification('Atenção', 'Vincule ao menos uma nota/título em aberto.', 'error');
      return;
    }
    if (!operationDate || !paymentDate) {
      showNotification('Atenção', 'Informe a data da operação e a data do pagamento.', 'error');
      return;
    }
    if (parseAnticipationMoney(offeredAmount) <= 0 && parseAnticipationMoney(netAnticipated) <= 0) {
      showNotification('Atenção', 'Informe o valor ofertado e/ou o valor líquido antecipado.', 'error');
      return;
    }
    setSaving(true);
    try {
      const result = await withTimeout(
        savePaymentAnticipation({
          fields: {
            nfNumber: nfNumber.trim(),
            operationDate,
            averageRatePct: parsePctInput(averageRate),
            netAnticipated: parseAnticipationMoney(netAnticipated) || plan.valorLiquido,
            offeredAmount: parseAnticipationMoney(offeredAmount) || plan.saldoTotal,
            titleId: titleId.trim(),
            itemId: itemId.trim(),
            paymentDate,
          },
          titles: selected,
          createdBy: userName,
        }),
        40_000,
        'A operação demorou demais. Recarregue e confira se as notas já foram baixadas.',
      );
      void logAction(
        'CREATE',
        'PaymentAnticipation',
        result.anticipationId,
        `Antecipação ${result.plan.settlement} | ${selected.length} NF(s) | líquido ${formatBrl(result.plan.valorLiquido)} | ressalva ${formatBrl(result.plan.residual)}`,
      );
      const paidMsg =
        result.plan.settlement === 'PAGO'
          ? 'Notas baixadas como PAGO (R$ 0,00).'
          : `Notas baixadas. Ressalva ${formatBrl(result.plan.residual)} com vencimento em ${formatDateBR(result.plan.residualDueDate + 'T12:00:00')}.`;
      const emailMsg = result.plan.residual > 0.009
        ? result.emailSent
          ? ' E-mail enviado para financeiro@grupotmseg.com.br.'
          : ` E-mail ao financeiro não enviado: ${result.emailError || 'falha'}.`
        : '';
      showNotification('Antecipação lançada', paidMsg + emailMsg, result.emailError ? 'error' : 'success');
      onSaved({ updatedIds: result.updatedIds, residual: result.residual });
      onClose();
    } catch (e: any) {
      console.error(e);
      showNotification('Erro', 'Falha ao lançar antecipação: ' + (e?.message || e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4" data-testid="payment-anticipation-modal">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[94vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b flex items-center justify-between bg-gradient-to-r from-teal-700 to-emerald-800 text-white">
          <div className="flex items-center gap-2 min-w-0">
            <Banknote size={18} className="shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-black uppercase tracking-wide">Antecipação de pagamento</p>
              <p className="text-[11px] opacity-90 truncate">Vincule uma ou várias NFs e lance a operação manualmente</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg" data-testid="btn-close-anticipation">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="text-[10px] font-black text-gray-400 uppercase col-span-2">
              Número da NF
              <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-bold" value={nfNumber} onChange={(e) => setNfNumber(e.target.value)} data-testid="input-ant-nf" />
            </label>
            <label className="text-[10px] font-black text-gray-400 uppercase">
              Data da operação
              <input type="date" className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={operationDate} onChange={(e) => setOperationDate(e.target.value)} data-testid="input-ant-op-date" />
            </label>
            <label className="text-[10px] font-black text-gray-400 uppercase">
              Data do pagamento
              <input type="date" className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} data-testid="input-ant-pay-date" />
            </label>
            <label className="text-[10px] font-black text-gray-400 uppercase">
              Taxa média aprovada (%)
              <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono" value={averageRate} onChange={(e) => setAverageRate(e.target.value)} placeholder="ex: 2,50" data-testid="input-ant-rate" />
            </label>
            <label className="text-[10px] font-black text-gray-400 uppercase">
              Valor ofertado
              <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono" value={offeredAmount} onChange={(e) => setOfferedAmount(e.target.value)} placeholder="0,00" data-testid="input-ant-offered" />
            </label>
            <label className="text-[10px] font-black text-gray-400 uppercase">
              Valor líquido antecipado
              <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono" value={netAnticipated} onChange={(e) => setNetAnticipated(e.target.value)} placeholder="0,00" data-testid="input-ant-net" />
            </label>
            <label className="text-[10px] font-black text-gray-400 uppercase">
              Id do título
              <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono" value={titleId} onChange={(e) => setTitleId(e.target.value)} data-testid="input-ant-title-id" />
            </label>
            <label className="text-[10px] font-black text-gray-400 uppercase">
              Id do item
              <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono" value={itemId} onChange={(e) => setItemId(e.target.value)} data-testid="input-ant-item-id" />
            </label>
          </div>

          <div className="border border-teal-100 rounded-xl p-3 bg-teal-50/40">
            <p className="text-[10px] font-black text-teal-800 uppercase mb-2 flex items-center gap-1">
              <Link2 size={12} /> Vincular notas do contas a receber
            </p>
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                <input
                  className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
                  placeholder="Buscar cliente, NF, descrição (ex: CEVA)"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void runSearch(); } }}
                  data-testid="input-ant-search"
                />
              </div>
              <button type="button" onClick={() => void runSearch()} className="px-4 py-2 bg-teal-700 text-white rounded-lg text-xs font-black uppercase" data-testid="btn-ant-search">
                {searching ? <Loader2 size={14} className="animate-spin" /> : 'Buscar'}
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto border rounded-lg bg-white divide-y">
              {candidates.length === 0 ? (
                <p className="p-4 text-xs text-gray-400 italic">Nenhum título. Busque o cliente ou marque na lista antes de abrir.</p>
              ) : candidates.map((t) => {
                const open = getTransactionOpenAmount(t);
                const checked = selectedIds.has(t.id);
                return (
                  <label key={t.id} className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer ${checked ? 'bg-teal-50' : 'hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(t.id)} data-testid={`chk-ant-${t.id}`} />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-gray-800 uppercase truncate text-xs">{t.description}</p>
                      <p className="text-[10px] text-gray-500 uppercase">{t.entity_name || '—'} · vence {t.due_date ? formatDateBR(t.due_date + 'T12:00:00') : '—'}</p>
                    </div>
                    <span className="font-mono font-black text-xs text-teal-800">{formatBrl(open)}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-[10px] text-teal-800 font-bold mt-2">{selected.length} nota(s) vinculada(s)</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl border bg-gray-50">
              <p className="text-[9px] font-black text-gray-400 uppercase">Saldo total</p>
              <p className="text-lg font-black font-mono text-gray-900" data-testid="ant-saldo-total">{formatBrl(plan.saldoTotal)}</p>
            </div>
            <div className="p-3 rounded-xl border bg-amber-50 border-amber-100">
              <p className="text-[9px] font-black text-amber-700 uppercase">Juros de antecipação</p>
              <p className="text-lg font-black font-mono text-amber-800" data-testid="ant-juros">{formatBrl(plan.juros)}</p>
            </div>
            <div className="p-3 rounded-xl border bg-emerald-50 border-emerald-100">
              <p className="text-[9px] font-black text-emerald-700 uppercase">Valor líquido</p>
              <p className="text-lg font-black font-mono text-emerald-800" data-testid="ant-liquido">{formatBrl(plan.valorLiquido)}</p>
            </div>
            <div className={`p-3 rounded-xl border ${plan.settlement === 'PAGO' ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}`}>
              <p className="text-[9px] font-black uppercase text-gray-500">Situação</p>
              <p className={`text-sm font-black ${plan.settlement === 'PAGO' ? 'text-green-700' : 'text-orange-700'}`} data-testid="ant-settlement">
                {settlementLabel(plan)}
              </p>
              {plan.settlement === 'SALDO_A_RECEBER' && (
                <p className="text-[10px] font-bold text-orange-700 mt-1">
                  Ressalva vence em {plan.residualDueDate ? formatDateBR(plan.residualDueDate + 'T12:00:00') : '—'} (15 dias)
                </p>
              )}
            </div>
          </div>

          {plan.alerts.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <ul className="space-y-1">{plan.alerts.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t bg-gray-50 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-gray-600">Cancelar</button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-sm font-black uppercase flex items-center gap-2 disabled:opacity-60"
            data-testid="btn-ant-confirm"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Confirmar antecipação
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentAnticipationModal;
