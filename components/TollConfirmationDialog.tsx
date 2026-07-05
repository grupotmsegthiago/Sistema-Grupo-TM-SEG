import { formatDateBR } from '../lib/dateUtils';
import React, { useEffect, useMemo, useState } from 'react';
import { Mission } from '../types';
import { supabase } from '../lib/supabase';
import { AlertTriangle, CheckCircle2, History, Loader2, X } from 'lucide-react';

type HistoryEntry = {
    missionId: string;
    date: string;
    toll: number;
    user?: string | null;
};

interface Props {
    isOpen: boolean;
    mission: Mission | null;
    initialValue?: string;
    source: 'financial_modal' | 'completion' | 'manual';
    onClose?: () => void;
    allowClose?: boolean;
    onConfirm: (result: { hasToll: boolean; value: number }) => void | Promise<void>;
}

const parseBRL = (val: string): number => {
    if (!val) return 0;
    const clean = String(val).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
    const n = parseFloat(clean);
    return isNaN(n) ? 0 : n;
};

const formatBRL = (n: number): string => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TollConfirmationDialog: React.FC<Props> = ({ isOpen, mission, initialValue, source, onClose, allowClose = false, onConfirm }) => {
    const [choice, setChoice] = useState<'yes' | 'no' | null>(null);
    const [valueInput, setValueInput] = useState(initialValue || '');
    const [history, setHistory] = useState<HistoryEntry[] | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setChoice(null);
            setValueInput(initialValue && parseBRL(initialValue) > 0 ? initialValue : '');
            setHistory(null);
            setShowHistory(false);
            setSubmitError(null);
        }
    }, [isOpen, mission?.id, initialValue]);

    const routeLabel = useMemo(() => {
        if (!mission) return '';
        return `${mission.origin || '—'} → ${mission.destination || '—'}`;
    }, [mission]);

    const loadHistory = async () => {
        if (!mission || history) { setShowHistory(s => !s); return; }
        setLoadingHistory(true);
        try {
            const { data } = await supabase
                .from('missions')
                .select('id, toll_value, last_update, updated_by, origin, destination')
                .eq('origin', mission.origin)
                .eq('destination', mission.destination)
                .neq('id', mission.id)
                .not('toll_value', 'is', null)
                .order('last_update', { ascending: false })
                .limit(10);
            const entries: HistoryEntry[] = (data || []).map((m: any) => ({
                missionId: m.id,
                date: m.last_update,
                toll: Number(m.toll_value) || 0,
                user: m.updated_by,
            }));
            setHistory(entries);
            setShowHistory(true);
        } catch (e) {
            console.error('[TollConfirm] historico falhou', e);
            setHistory([]);
            setShowHistory(true);
        } finally {
            setLoadingHistory(false);
        }
    };

    const canSubmit = choice === 'no' || (choice === 'yes' && parseBRL(valueInput) > 0);

    const handleSubmit = async () => {
        if (!canSubmit || submitting || !mission) return;
        const hasToll = choice === 'yes';
        const value = hasToll ? parseBRL(valueInput) : 0;
        setSubmitting(true);
        setSubmitError(null);
        try {
            // Auditoria é OBRIGATÓRIA: sem registro em system_logs não liberamos
            // a confirmação (Task #45 — "A confirmação fica registrada em system_logs").
            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
            const userName = userData.name || userData.username || 'Usuário';
            const { error: logError } = await supabase.from('system_logs').insert([{
                user_name: userName,
                action_type: 'TOLL_CONFIRMATION',
                entity: 'MissionTollConfirmation',
                entity_id: mission.id,
                details: JSON.stringify({
                    user: userName,
                    role: userData.role || '',
                    confirmed_at: new Date().toISOString(),
                    has_toll: hasToll,
                    value,
                    source,
                    route: routeLabel,
                    origin: mission.origin,
                    destination: mission.destination,
                    client: mission.client,
                    provider: mission.provider,
                })
            }]);
            if (logError) {
                console.error('[TollConfirm] log falhou', logError);
                setSubmitError('Não foi possível registrar a confirmação em system_logs. Tente novamente.');
                return;
            }
            try {
                await onConfirm({ hasToll, value });
            } catch (cbErr: any) {
                console.error('[TollConfirm] callback falhou', cbErr);
                setSubmitError(cbErr?.message || 'Falha ao aplicar confirmação. Tente novamente.');
                return;
            }
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen || !mission) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4" data-testid="modal-toll-confirmation">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-white">
                        <AlertTriangle size={18} />
                        <h3 className="text-sm font-black uppercase tracking-wide">Confirmação Obrigatória de Pedágio</h3>
                    </div>
                    {allowClose && onClose && (
                        <button onClick={onClose} className="text-white/80 hover:text-white" data-testid="button-toll-close"><X size={18} /></button>
                    )}
                </div>
                <div className="p-5 space-y-4">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                        <p className="text-[11px] font-bold text-amber-900 leading-relaxed">
                            Para evitar aprovações com pedágio acidentalmente zerado, confirme manualmente o pedágio desta OS antes de prosseguir.
                        </p>
                        <div className="mt-2 space-y-1">
                            <p className="text-[10px] font-bold text-amber-800 leading-snug" data-testid="text-toll-origin">
                                <span className="uppercase tracking-wide text-amber-700">Origem:</span>{' '}
                                <span className="text-amber-900">{mission.origin || '—'}</span>
                            </p>
                            <p className="text-[10px] font-bold text-amber-800 leading-snug" data-testid="text-toll-destination">
                                <span className="uppercase tracking-wide text-amber-700">Destino:</span>{' '}
                                <span className="text-amber-900">{mission.destination || '—'}</span>
                            </p>
                            <p className="text-[10px] font-bold text-amber-800 leading-snug" data-testid="text-toll-total-km">
                                <span className="uppercase tracking-wide text-amber-700">Total de KM:</span>{' '}
                                <span className="text-amber-900">
                                    {Number(mission.totalDistance || (mission as any).total_distance || 0) > 0
                                        ? `${Number(mission.totalDistance || (mission as any).total_distance).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`
                                        : '—'}
                                </span>
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => setChoice('yes')}
                            className={`p-3 rounded-xl border-2 text-left transition-all ${choice === 'yes' ? 'border-green-600 bg-green-50' : 'border-gray-200 hover:border-green-300'}`}
                            data-testid="button-toll-yes"
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <CheckCircle2 size={14} className={choice === 'yes' ? 'text-green-600' : 'text-gray-400'} />
                                <span className="text-[11px] font-black uppercase text-gray-900">Sim, tem pedágio</span>
                            </div>
                            <span className="text-[10px] text-gray-500">Informe o valor cobrado nesta rota.</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => { setChoice('no'); setValueInput('0,00'); }}
                            className={`p-3 rounded-xl border-2 text-left transition-all ${choice === 'no' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
                            data-testid="button-toll-no"
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <CheckCircle2 size={14} className={choice === 'no' ? 'text-blue-600' : 'text-gray-400'} />
                                <span className="text-[11px] font-black uppercase text-gray-900">Não, sem pedágio</span>
                            </div>
                            <span className="text-[10px] text-gray-500">A rota não teve cobrança de pedágio.</span>
                        </button>
                    </div>

                    {choice === 'yes' && (
                        <div>
                            <label className="text-[10px] font-black text-gray-700 uppercase mb-1 block">Valor do Pedágio (R$)</label>
                            <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center">
                                <span className="text-sm font-bold text-green-500 mr-2">R$</span>
                                <input
                                    type="text"
                                    autoFocus
                                    value={valueInput}
                                    onChange={e => setValueInput(e.target.value)}
                                    placeholder="0,00"
                                    className="flex-1 bg-transparent border-none outline-none font-black text-xl text-green-900"
                                    data-testid="input-toll-confirmation-value"
                                />
                            </div>
                            {parseBRL(valueInput) <= 0 && (
                                <span className="text-[9px] font-bold text-red-600 mt-1 block">Informe um valor maior que zero.</span>
                            )}
                        </div>
                    )}

                    <div className="border-t border-gray-100 pt-3">
                        <button
                            type="button"
                            onClick={loadHistory}
                            disabled={loadingHistory}
                            className="flex items-center gap-2 text-[10px] font-black text-indigo-700 uppercase hover:text-indigo-900"
                            data-testid="button-toll-history"
                        >
                            {loadingHistory ? <Loader2 size={12} className="animate-spin" /> : <History size={12} />}
                            {showHistory ? 'Ocultar histórico' : 'Ver histórico desta rota'}
                        </button>
                        {showHistory && history && (
                            <div className="mt-2 max-h-40 overflow-y-auto border border-gray-100 rounded-lg">
                                {history.length === 0 ? (
                                    <p className="p-3 text-[10px] text-gray-500">Nenhum histórico de pedágio para esta rota.</p>
                                ) : (
                                    <table className="w-full text-[10px]">
                                        <thead className="bg-gray-50 sticky top-0">
                                            <tr className="text-gray-600 uppercase font-bold">
                                                <th className="text-left px-2 py-1">Data</th>
                                                <th className="text-left px-2 py-1">Quem</th>
                                                <th className="text-right px-2 py-1">Pedágio</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {history.map((h, i) => (
                                                <tr key={h.missionId + i} className="border-t border-gray-100">
                                                    <td className="px-2 py-1 text-gray-700">{h.date ? formatDateBR(h.date) : '—'}</td>
                                                    <td className="px-2 py-1 text-gray-700 truncate max-w-[120px]">{h.user || '—'}</td>
                                                    <td className="px-2 py-1 text-right font-bold text-green-700">R$ {formatBRL(h.toll)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                                <p className="px-2 py-1 text-[9px] text-gray-500 bg-gray-50 border-t border-gray-100">Apenas consulta — valores nunca são aplicados automaticamente.</p>
                            </div>
                        )}
                    </div>
                </div>
                {submitError && (
                    <div className="mx-5 mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[10px] font-bold text-red-700" data-testid="text-toll-submit-error">
                        {submitError}
                    </div>
                )}
                <div className="bg-gray-50 border-t border-gray-100 px-5 py-3 flex items-center justify-end gap-2">
                    {allowClose && onClose && (
                        <button onClick={onClose} className="px-4 py-2 rounded-lg text-[10px] font-black text-gray-600 uppercase hover:bg-gray-200" data-testid="button-toll-cancel">Cancelar</button>
                    )}
                    <button
                        onClick={handleSubmit}
                        disabled={!canSubmit || submitting}
                        className={`px-5 py-2 rounded-lg text-[10px] font-black uppercase flex items-center gap-2 ${canSubmit && !submitting ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                        data-testid="button-toll-confirm"
                    >
                        {submitting ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                        Confirmar Pedágio
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TollConfirmationDialog;
