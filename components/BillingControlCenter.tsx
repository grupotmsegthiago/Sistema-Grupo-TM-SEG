
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../lib/RealtimeProvider';
import { Client, ClientPriceTable, ProviderCostTable, MissionStatus } from '../types';
import { 
    Search, DollarSign, RefreshCw, Loader2, 
    Building2, Gauge, Clock, 
    Wrench, ThumbsUp, Layers, ArrowUpRight, ArrowDownRight, Calendar, AlertCircle, BrainCircuit, Zap, TrendingUp, CheckCircle2
} from 'lucide-react';
import { useNotification } from '../lib/NotificationContext';
import { resolveStoredClientToll } from '../lib/toll/clientTollBilling';
import MissionFinancialModal from './MissionFinancialModal';

const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'R$ 0,00';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const BillingControlCenter: React.FC = () => {
    const { showNotification } = useNotification();
    const [missions, setMissions] = useState<any[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [priceTables, setPriceTables] = useState<ClientPriceTable[]>([]);
    const [providerTables, setProviderTables] = useState<ProviderCostTable[]>([]);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedClient, setSelectedClient] = useState('ALL');
    
    const [isLoading, setIsLoading] = useState(true);
    const [selectedMission, setSelectedMission] = useState<any | null>(null);
    
    // Inteligência
    const [aiStats, setAiStats] = useState({ maturity: 0, learnedRules: 0 });

    useEffect(() => {
        loadInitialData();
        loadIntelligenceStats();
    }, []);

    useRealtimeRefresh(['missions', 'clients', 'client_price_tables', 'provider_cost_tables'], () => {
        loadInitialData();
        loadIntelligenceStats();
    });

    const loadIntelligenceStats = async () => {
        const [approvedRes, rulesRes] = await Promise.all([
            supabase.from('missions').select('*', { count: 'exact', head: true }).eq('billing_approved', true),
            supabase.from('system_logs').select('*', { count: 'exact', head: true }).eq('entity', 'BillingIntelligence')
        ]);
        setAiStats({
            maturity: Math.min(100, Math.floor((approvedRes.count || 0) / 5)),
            learnedRules: rulesRes.count || 0
        });
    };

    const loadInitialData = async () => {
        setIsLoading(true);
        try {
            const [clientsRes, tablesRes, provTablesRes, missionsRes] = await Promise.all([
                supabase.from('clients').select('*').eq('status', 'Ativo').order('name'),
                supabase.from('client_price_tables').select('*'),
                supabase.from('provider_cost_tables').select('*'),
                supabase.from('missions')
                    .select('*, client_vehicle_data:client_vehicles(*)')
                    .eq('status', MissionStatus.COMPLETED)
                    .or('billing_approved.is.null,billing_approved.eq.false') 
                    .order('created_at', { ascending: false })
            ]);

            if (clientsRes.data) setClients(clientsRes.data as any);
            if (tablesRes.data) setPriceTables(tablesRes.data as any);
            if (provTablesRes.data) setProviderTables(provTablesRes.data as any);
            if (missionsRes.data) setMissions(missionsRes.data);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const calculateBilling = (m: any) => {
        const startKm = m.start_km || 0;
        const endKm = m.end_km || 0;
        const traveledKm = (endKm > startKm) ? (endKm - startKm) : (m.total_distance || 0);
        
        let durationHours = 0;
        if (m.start_time && m.end_time) {
            const start = new Date(m.start_time).getTime();
            const end = new Date(m.end_time).getTime();
            const diffMs = end - start;
            if (diffMs > 0) durationHours = diffMs / (1000 * 60 * 60);
        }

        const toll = resolveStoredClientToll(m.toll_value || 0, m.toll_value_provider);
        const cTables = priceTables.filter(t => t.client === m.client);
        cTables.sort((a, b) => a.franchise_km - b.franchise_km);
        let cTable = cTables.find(t => t.franchise_km >= traveledKm) || cTables[cTables.length - 1];

        const missionDest = (m.destination || '').toUpperCase();

        let revBase = 0, revExtraKmVal = 0, revExtraHrVal = 0, totalRevenue = 0;
        if (cTable) {
            const cTableName = (cTable.operation_type || '').toUpperCase();
            const isFixedDistClient = cTableName.includes('200KM') || cTableName.includes('200 KM') || 
                                      cTableName.includes('100KM') || cTableName.includes('100 KM') ||
                                      cTableName.includes('LOGITECH') || missionDest.includes('200KM');
            const isFixedHoursClient = cTableName.includes('02H') || cTableName.includes('02 HORAS') || 
                                       missionDest.includes('02 HORAS') || missionDest.includes('02H');

            let effectiveKm = traveledKm;
            let effectiveHours = durationHours;
            if (isFixedDistClient) effectiveKm = Math.min(effectiveKm, cTable.franchise_km);
            if (isFixedHoursClient) effectiveHours = Math.min(effectiveHours, cTable.franchise_hours);

            revBase = cTable.activation_fee;
            const extraKm = Math.max(0, effectiveKm - cTable.franchise_km);
            let extraHr = Math.max(0, effectiveHours - cTable.franchise_hours);
            
            const currentClient = clients.find(c => c.name === m.client);
            if (currentClient?.full_extra_hour_after_16_min && extraHr > 0) {
                const minutesFraction = (extraHr % 1) * 60;
                if (minutesFraction >= 16) extraHr = Math.ceil(extraHr);
            }
            revExtraKmVal = extraKm * (cTable.price_per_extra_km || 0);
            revExtraHrVal = extraHr * (cTable.price_per_extra_hour || 0);
            totalRevenue = revBase + revExtraKmVal + revExtraHrVal + toll;
        }

        let totalCost = 0;
        if (m.is_same_os) {
            totalCost = toll; 
        } else {
            const pTables = providerTables.filter(t => t.provider === m.provider);
            pTables.sort((a, b) => a.franchise_km - b.franchise_km);
            let pTable = pTables.find(t => t.franchise_km >= traveledKm) || pTables[pTables.length - 1];
            
            if (pTable) {
                const pTableName = (pTable.operation_type || '').toUpperCase();
                const isFixedDistProv = pTableName.includes('200KM') || pTableName.includes('200 KM') || 
                                        pTableName.includes('100KM') || pTableName.includes('100 KM') ||
                                        pTableName.includes('LOGITECH') || missionDest.includes('200KM');
                const isFixedHoursProv = pTableName.includes('02H') || pTableName.includes('02 HORAS') || 
                                         missionDest.includes('02 HORAS') || missionDest.includes('02H');

                let pEffectiveKm = traveledKm;
                let pEffectiveHours = durationHours;
                if (isFixedDistProv) pEffectiveKm = Math.min(pEffectiveKm, pTable.franchise_km);
                if (isFixedHoursProv) pEffectiveHours = Math.min(pEffectiveHours, pTable.franchise_hours);

                const costBase = pTable.activation_cost;
                const pExtraKm = Math.max(0, pEffectiveKm - pTable.franchise_km);
                const pExtraHr = Math.max(0, pEffectiveHours - pTable.franchise_hours);
                const costExtraKmVal = pExtraKm * (pTable.cost_per_extra_km || 0);
                const costExtraHrVal = pExtraHr * (pTable.cost_per_extra_hour || 0);
                totalCost = costBase + costExtraKmVal + costExtraHrVal + toll;
            }
        }

        return {
            totalRevenue,
            totalCost,
            profit: totalRevenue - totalCost,
            traveledKm,
            durationHours,
            toll
        };
    };

    const filteredMissions = useMemo(() => {
        return missions.filter(m => {
            const matchesClient = selectedClient === 'ALL' || m.client === (clients.find(c => c.id.toString() === selectedClient)?.name);
            const searchLower = searchTerm.toLowerCase();
            return matchesClient && (
                m.id.toLowerCase().includes(searchLower) || 
                (m.client || '').toLowerCase().includes(searchLower) ||
                (m.provider || '').toLowerCase().includes(searchLower)
            );
        });
    }, [missions, selectedClient, searchTerm, clients]);

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            {selectedMission && (
                <MissionFinancialModal 
                    isOpen={true} 
                    onClose={() => setSelectedMission(null)} 
                    mission={selectedMission} 
                    onUpdate={() => { loadInitialData(); loadIntelligenceStats(); }}
                />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-red-700 text-white rounded-2xl shadow-lg"><DollarSign size={28} /></div>
                        <div>
                            <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight leading-none">Gestão de Cobrança</h2>
                            <p className="text-xs text-gray-500 font-bold uppercase mt-2 tracking-widest flex items-center gap-2">
                                <AlertCircle size={14} className="text-orange-500" /> Aprovação Pendente de {filteredMissions.length} Missões
                            </p>
                        </div>
                    </div>
                    <button onClick={loadInitialData} className="p-3 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-all text-gray-500">
                        <RefreshCw size={24} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                </div>

                <div className="bg-gray-900 rounded-2xl p-6 text-white border border-white/5 shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-125 transition-transform duration-500"><BrainCircuit size={100}/></div>
                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                                <BrainCircuit className="text-indigo-400" size={18} /> Neural Learning
                            </h3>
                            <span className="text-[10px] font-black text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-400/20 uppercase animate-pulse">Software Vivo</span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div className="space-y-1">
                                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Nível de Maturidade</p>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${aiStats.maturity}%` }}></div>
                                    </div>
                                    <span className="text-xs font-black font-mono">{aiStats.maturity}%</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Regras Aprendidas</p>
                                <p className="text-lg font-black text-white font-mono">{aiStats.learnedRules}</p>
                            </div>
                        </div>
                        <p className="text-[9px] text-slate-400 font-medium leading-relaxed italic border-t border-white/5 pt-3">
                            "A cada OS aprovada com ajustes manuais, o sistema auto-calibra os fatores de precificação para este cliente e rota."
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                    <input type="text" placeholder="Buscar por OS, Cliente ou Fornecedor..." className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
                <div className="relative">
                    <select className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm font-bold text-gray-700 outline-none appearance-none" value={selectedClient} onChange={e => setSelectedClient(e.target.value)}>
                        <option value="ALL">FILTRAR POR CLIENTE (TODOS)</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.trading_name || c.name}</option>)}
                    </select>
                    <Building2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest">
                            <tr>
                                <th className="px-6 py-4">OS / Entidades</th>
                                <th className="px-6 py-4 text-center">Medição Real</th>
                                <th className="px-6 py-4 text-center">Estimativa Técnica</th>
                                <th className="px-6 py-4 text-right">Valores Atuais</th>
                                <th className="px-6 py-4 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {isLoading ? (
                                <tr><td colSpan={5} className="p-20 text-center"><Loader2 size={40} className="animate-spin text-red-700 mx-auto" /></td></tr>
                            ) : filteredMissions.length === 0 ? (
                                <tr><td colSpan={5} className="p-20 text-center text-gray-400 font-bold uppercase">Sem missões aguardando aprovação.</td></tr>
                            ) : (
                                filteredMissions.map(m => {
                                    const billing = calculateBilling(m);
                                    const revInDb = (m.revenue_value || 0) + resolveStoredClientToll(m.toll_value || 0, m.toll_value_provider);
                                    const tollProv = Math.max(0, m.toll_value_provider != null ? m.toll_value_provider : (m.toll_value || 0));
                                    const costInDb = (m.cost_value || 0) + tollProv;
                                    const hasDiff = Math.abs(billing.totalRevenue - revInDb) > 1 || billing.totalRevenue <= 0;
                                    
                                    return (
                                        <tr key={m.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="font-black text-gray-900 text-sm font-mono flex items-center gap-2">
                                                    {m.id} {m.is_same_os && <Layers size={12} className="text-gray-400" />}
                                                </div>
                                                <div className="text-[10px] font-black text-blue-800 uppercase mt-1">CLI: {m.client}</div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="text-xs font-bold text-gray-900"><Gauge size={12} className="inline mr-1 text-orange-500" /> {billing.traveledKm.toFixed(0)} KM</div>
                                                <div className="text-[9px] text-gray-400 font-black"><Clock size={10} className="inline mr-1"/> {billing.durationHours.toFixed(1)}H</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="bg-gray-100 p-2 rounded-xl text-[9px] space-y-1 min-w-[180px]">
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-400 font-black uppercase">Calculado:</span>
                                                        <span className="font-bold text-green-700">{formatCurrency(billing.totalRevenue)}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-400 font-black uppercase">Lucro:</span>
                                                        <span className="font-bold text-blue-700">{formatCurrency(billing.profit)}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="text-xs font-black text-green-700">REC: {formatCurrency(revInDb)}</div>
                                                <div className="text-xs font-black text-red-600">CUST: {m.is_same_os && costInDb === 0 ? <span className="text-amber-600" title="Custo zerado: missão compartilha OS principal (reaproveitamento)">MESMA OS</span> : formatCurrency(costInDb)}</div>
                                                {hasDiff && <span className="text-[8px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-black animate-pulse uppercase mt-1 block w-fit ml-auto">Conferir</span>}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button 
                                                    onClick={() => setSelectedMission(m)} 
                                                    className={`bg-white border-2 hover:shadow-lg ${hasDiff ? 'border-orange-500 text-orange-600 hover:bg-orange-50' : 'border-blue-500 text-blue-600 hover:bg-blue-50'} p-2 rounded-xl transition-all flex flex-col items-center gap-1 min-w-[90px] group`}
                                                >
                                                    <Wrench size={18} className="group-hover:rotate-12 transition-transform" />
                                                    <span className="text-[8px] font-black uppercase">Conferir & Aprovar</span>
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default BillingControlCenter;
