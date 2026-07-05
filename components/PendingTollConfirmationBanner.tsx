import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { AlertTriangle, ChevronRight, Loader2, RefreshCw } from 'lucide-react';

import { formatDateBR } from '../lib/dateUtils';

interface PendingMission {
    id: string;
    client: string | null;
    origin: string | null;
    destination: string | null;
    end_time: string | null;
    last_update: string | null;
}

interface Props {
    onOpenMission?: (missionId: string) => void;
}

const formatDate = (d: string | null) => formatDateBR(d);

const PendingTollConfirmationBanner: React.FC<Props> = ({ onOpenMission }) => {
    const [missions, setMissions] = useState<PendingMission[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            // Só pedágios pendentes de OS concluídas a partir de maio/2026.
            const { data: candidateMissions, error } = await supabase
                .from('missions')
                .select('id, client, origin, destination, end_time, last_update')
                .eq('status', 'Concluída')
                .is('toll_value', null)
                .gte('end_time', '2026-05-01')
                .order('end_time', { ascending: false })
                .limit(200);

            if (error || !candidateMissions || candidateMissions.length === 0) {
                setMissions([]);
                return;
            }

            const ids = candidateMissions.map(m => m.id);
            const { data: logs } = await supabase
                .from('system_logs')
                .select('entity_id')
                .eq('action_type', 'TOLL_CONFIRMATION')
                .in('entity_id', ids);

            const confirmedIds = new Set((logs || []).map((l: any) => l.entity_id));
            const pending = candidateMissions.filter(m => !confirmedIds.has(m.id));
            setMissions(pending);
        } catch (e) {
            console.error('[PendingTollBanner] erro', e);
            setMissions([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const handler = () => load();
        window.addEventListener('refreshMissions', handler);
        const interval = setInterval(load, 5 * 60_000);
        return () => {
            window.removeEventListener('refreshMissions', handler);
            clearInterval(interval);
        };
    }, [load]);

    if (loading && missions.length === 0) return null;
    if (!loading && missions.length === 0) return null;

    const visible = expanded ? missions : missions.slice(0, 5);

    return (
        <div
            className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-2xl p-5 shadow-sm"
            data-testid="banner-pending-toll-confirmation"
        >
            <div className="flex items-start gap-3 mb-3">
                <div className="p-2 bg-amber-500 text-white rounded-lg flex-shrink-0">
                    <AlertTriangle size={18} />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-black uppercase tracking-tight text-amber-900">
                        Pedágio Pendente de Confirmação
                    </h3>
                    <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                        {missions.length} OS concluída{missions.length > 1 ? 's' : ''} sem confirmação de pedágio.
                        Confirme agora para evitar travas no faturamento.
                    </p>
                </div>
                <button
                    onClick={load}
                    className="p-1.5 text-amber-700 hover:bg-amber-100 rounded-lg"
                    title="Atualizar"
                    data-testid="button-pending-toll-refresh"
                >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                </button>
            </div>

            <div className="space-y-1.5">
                {visible.map(m => (
                    <button
                        key={m.id}
                        onClick={() => onOpenMission?.(m.id)}
                        disabled={!onOpenMission}
                        className="w-full text-left bg-white hover:bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-3 transition-colors group disabled:opacity-60 disabled:cursor-not-allowed"
                        data-testid={`button-pending-toll-${m.id}`}
                    >
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-gray-500 uppercase">OS {m.id}</span>
                                <span className="text-[10px] font-bold text-amber-700">{m.client || '—'}</span>
                            </div>
                            <p className="text-[11px] text-gray-700 truncate mt-0.5">
                                {m.origin || '—'} → {m.destination || '—'}
                            </p>
                            <p className="text-[9px] text-gray-500 mt-0.5">
                                Concluída em {formatDate(m.end_time || m.last_update)}
                            </p>
                        </div>
                        <span className="text-[9px] font-black text-amber-700 uppercase whitespace-nowrap">
                            Confirmar
                        </span>
                        <ChevronRight size={14} className="text-amber-600 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                ))}
            </div>

            {missions.length > 5 && (
                <button
                    onClick={() => setExpanded(e => !e)}
                    className="mt-3 text-[10px] font-black text-amber-800 uppercase hover:text-amber-900"
                    data-testid="button-pending-toll-toggle"
                >
                    {expanded ? 'Mostrar menos' : `Ver todas (${missions.length})`}
                </button>
            )}
        </div>
    );
};

export default PendingTollConfirmationBanner;
