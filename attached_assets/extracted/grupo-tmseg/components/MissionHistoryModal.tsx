
import React, { useEffect, useState } from 'react';
import { X, History, ArrowRight, User, Calendar, Loader2, FileSearch, PlusCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { MissionHistory, Mission } from '../types';

interface Props {
    missionId: string;
    onClose: () => void;
}

const MissionHistoryModal: React.FC<Props> = ({ missionId, onClose }) => {
    const [history, setHistory] = useState<MissionHistory[]>([]);
    const [missionData, setMissionData] = useState<Mission | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchHistory();
    }, [missionId]);

    const fetchHistory = async () => {
        setIsLoading(true);
        try {
            // 1. Busca dados básicos da missão para o cabeçalho
            const { data: mission } = await supabase
                .from('missions')
                .select('*')
                .eq('id', missionId)
                .single();
            
            if (mission) setMissionData(mission);

            // 2. Busca histórico detalhado
            const { data: historyData, error } = await supabase
                .from('mission_history')
                .select('*')
                .eq('mission_id', missionId)
                .order('changed_at', { ascending: false });

            if (error) {
                console.warn("Tabela de histórico pode não existir ainda.", error);
            }

            if (historyData) {
                setHistory(historyData);
            }
        } catch (e) {
            console.error("Erro ao buscar histórico", e);
        } finally {
            setIsLoading(false);
        }
    };

    // Agrupa alterações pelo timestamp (mesma ação de salvar)
    const groupedHistory = history.reduce((acc, curr) => {
        const key = new Date(curr.changed_at).toLocaleString();
        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(curr);
        return acc;
    }, {} as Record<string, MissionHistory[]>);

    const translateField = (field: string) => {
        const map: Record<string, string> = {
            'status': 'Status da Missão',
            'driver_name': 'Motorista',
            'driver_phone': 'Telefone Motorista',
            'vehicle_id': 'Viatura (ID)',
            'agent1': 'Agente 01',
            'agent2': 'Agente 02',
            'provider': 'Fornecedor',
            'start_km': 'KM Inicial',
            'end_km': 'KM Final',
            'start_time': 'Início da Viagem',
            'end_time': 'Fim da Viagem',
            'current_location': 'Localização Atual',
            'revenue_value': 'Valor Faturamento',
            'cost_value': 'Custo Operacional',
            'toll_value': 'Pedágio',
            'origin': 'Origem',
            'destination': 'Destino',
            'mission_type': 'Tipo de Missão',
            'gr_espelhamento': 'GR / Espelhamento',
            'client': 'Cliente',
            'client_vehicle': 'Veículo Cliente (ID)'
        };
        return map[field] || field;
    };

    const formatValue = (val: string | null, field: string) => {
        if (val === null || val === undefined || val === '') return <span className="text-gray-400 italic">Vazio</span>;
        if (field.includes('value')) return `R$ ${parseFloat(val).toFixed(2)}`;
        return val;
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl border border-gray-700">
                
                {/* Header */}
                <div className="bg-gray-900 text-white p-6 rounded-t-2xl flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-3">
                            <FileSearch className="text-blue-400" /> Relatório Detalhado de Alterações
                        </h2>
                        <div className="flex items-center gap-2 text-sm text-gray-400 mt-1">
                            <span className="font-mono bg-gray-800 px-2 py-0.5 rounded text-white">{missionId}</span>
                            <span>•</span>
                            <span>{missionData?.client || 'Carregando...'}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full transition-colors"><X size={20}/></button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <Loader2 size={40} className="animate-spin text-blue-600 mb-4" />
                            <p>Analisando trilha de auditoria...</p>
                        </div>
                    ) : history.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400">
                            <History size={64} className="mb-4 opacity-20" />
                            <p className="font-bold text-lg text-gray-600">Nenhum registro de alteração encontrado.</p>
                            <p className="text-sm mt-2 max-w-md text-center">
                                Se esta é uma missão antiga, as alterações podem ter ocorrido antes da ativação do sistema de auditoria detalhada.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-8 relative">
                             {/* Linha vertical conectora */}
                             <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-gray-200"></div>

                             {Object.entries(groupedHistory).map(([timestamp, changesRaw], idx) => {
                                 const changes = changesRaw as MissionHistory[];
                                 const user = changes[0].changed_by || 'Sistema';
                                 
                                 // Detecta se é criação (todos os old_values são nulos)
                                 const isCreation = changes.every(c => c.old_value === null);

                                 return (
                                     <div key={idx} className="relative pl-12 animate-in slide-in-from-bottom-2">
                                         {/* Bolinha da timeline */}
                                         <div className={`absolute left-0 top-0 w-8 h-8 rounded-full flex items-center justify-center z-10 shadow-sm border-2 ${isCreation ? 'bg-green-100 border-green-500' : 'bg-white border-blue-500'}`}>
                                             {isCreation ? <PlusCircle size={14} className="text-green-600" /> : <History size={14} className="text-blue-600" />}
                                         </div>

                                         <div className={`rounded-xl border shadow-sm overflow-hidden ${isCreation ? 'bg-green-50/30 border-green-200' : 'bg-white border-gray-200'}`}>
                                             <div className={`p-3 border-b flex justify-between items-center text-xs ${isCreation ? 'bg-green-50 border-green-100' : 'bg-gray-50 border-gray-100'}`}>
                                                 <div className="flex items-center gap-3">
                                                     <div className="flex items-center gap-1 font-bold text-gray-700">
                                                         <User size={12} /> {user}
                                                     </div>
                                                     <div className="flex items-center gap-1 text-gray-500">
                                                         <Calendar size={12} /> {timestamp}
                                                     </div>
                                                 </div>
                                                 <span className={`px-2 py-0.5 rounded-full font-bold ${isCreation ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                                     {isCreation ? 'CRIAÇÃO DO REGISTRO' : `${changes.length} alteração(ões)`}
                                                 </span>
                                             </div>

                                             <div className="divide-y divide-gray-100">
                                                 {changes.map((change, cIdx) => (
                                                     <div key={cIdx} className="p-4 flex flex-col md:flex-row md:items-center gap-4 hover:bg-black/5 transition-colors">
                                                         <div className="md:w-1/4">
                                                             <span className="text-xs font-bold text-gray-500 uppercase block mb-1">Campo Alterado</span>
                                                             <span className="text-sm font-bold text-gray-800">{translateField(change.field_name)}</span>
                                                         </div>
                                                         
                                                         <div className={`flex-1 flex items-center gap-3 p-2 rounded-lg border ${isCreation ? 'bg-white border-green-100' : 'bg-gray-50 border-gray-100'}`}>
                                                             <div className="flex-1 min-w-0">
                                                                 <p className="text-[10px] font-bold text-red-500 uppercase mb-0.5">Anterior</p>
                                                                 <div className="text-sm text-gray-600 truncate font-medium" title={String(change.old_value)}>
                                                                     {change.old_value === null ? <span className="text-gray-400 italic font-normal">Valor Inicial (Vazio)</span> : formatValue(change.old_value, change.field_name)}
                                                                 </div>
                                                             </div>
                                                             <ArrowRight size={16} className="text-gray-400 shrink-0" />
                                                             <div className="flex-1 min-w-0">
                                                                 <p className="text-[10px] font-bold text-green-600 uppercase mb-0.5">Novo Valor</p>
                                                                 <div className="text-sm text-gray-900 truncate font-bold" title={String(change.new_value)}>
                                                                     {formatValue(change.new_value, change.field_name)}
                                                                 </div>
                                                             </div>
                                                         </div>
                                                     </div>
                                                 ))}
                                             </div>
                                         </div>
                                     </div>
                                 );
                             })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MissionHistoryModal;
