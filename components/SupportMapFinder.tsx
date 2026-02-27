import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { SupportAgent } from '../types';
import { useLoadScript, GoogleMap, Marker, InfoWindow } from '@react-google-maps/api';
import { googleMapsApiKey, libraries, googleMapsLoadConfig } from '../lib/maps';
import { extractCoordinates } from '../lib/utils';
import { 
  Loader2, MapPin, Globe, Users, Plus, X, ShieldCheck, 
  AlertTriangle, RefreshCw, MessageCircle, Phone, Search, 
  Shield, Target, Zap, Filter, Navigation, Clock, ChevronRight,
  BarChart3, PieChart, TrendingUp, DollarSign, LayoutGrid, Map as MapIcon, Flag, Activity
} from 'lucide-react';
import SupportAgentFormModal from './SupportAgentFormModal';
import WhatsAppChat from './WhatsAppChat';

declare const google: any;

const mapContainerStyle = { width: '100%', height: '100%', borderRadius: '1.5rem' };
const defaultCenter = { lat: -15.7938, lng: -47.8827 }; 

const MiniChart: React.FC<{ title: string, data: {label: string, value: number, color: string}[], type: 'bar' | 'hbar' }> = ({ title, data }) => {
    const total = data.reduce((acc, curr) => acc + curr.value, 0);
    return (
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col h-full hover:shadow-md transition-shadow">
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 border-b pb-2 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div> {title}
            </h4>
            <div className="flex-1 flex flex-col justify-center gap-3">
                {data.map((item, i) => (
                    <div key={i} className="w-full">
                        <div className="flex justify-between text-[9px] font-bold uppercase mb-1">
                            <span className="text-gray-600 truncate max-w-[120px]">{item.label}</span>
                            <span className="text-gray-900 font-mono">{item.value} ({Math.round((item.value / (total || 1)) * 100)}%)</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-50 rounded-full overflow-hidden border border-gray-100">
                            <div className={`h-full ${item.color} transition-all duration-1000`} style={{ width: `${(item.value / (total || 1)) * 100}%` }}></div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const SupportMapFinder: React.FC<{ onNavigate?: (s: string) => void }> = ({ onNavigate }) => {
    const { isLoaded, loadError } = useLoadScript(googleMapsLoadConfig);

    const [view, setView] = useState<'map' | 'chat' | 'stats'>('map');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [agents, setAgents] = useState<SupportAgent[]>([]);
    const [selectedAgent, setSelectedAgent] = useState<SupportAgent | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [mapInstance, setMapInstance] = useState<any | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchAgents();
    }, []);

    const fetchAgents = async () => {
        setIsLoading(true);
        try {
            let allData: SupportAgent[] = [];
            let from = 0;
            let to = 999;
            let hasMore = true;

            // Busca recursiva para carregar base de dados ilimitada (burlando limite de 1000 do Supabase)
            while (hasMore) {
                const { data, error } = await supabase
                    .from('support_agents')
                    .select('*')
                    .range(from, to);
                
                if (error) throw error;
                
                if (data && data.length > 0) {
                    allData = [...allData, ...(data as SupportAgent[])];
                    if (data.length < 1000) {
                        hasMore = false;
                    } else {
                        from += 1000;
                        to += 1000;
                    }
                } else {
                    hasMore = false;
                }
            }
            setAgents(allData);
        } catch (e) { 
            console.error("Erro na carga total da base:", e); 
        } finally {
            setIsLoading(false);
        }
    };

    const filteredAgents = useMemo(() => {
        const lowerSearch = searchTerm.toLowerCase();
        
        // Reconhecimento de Coordenadas no input
        const extractedCoords = extractCoordinates(searchTerm);
        if (extractedCoords) {
            if (mapInstance) {
                mapInstance.panTo(extractedCoords);
                mapInstance.setZoom(13);
            }
            return agents;
        }

        return agents.filter(a => 
            a.name.toLowerCase().includes(lowerSearch) || 
            a.base_address.toLowerCase().includes(lowerSearch) ||
            a.phone.includes(searchTerm) ||
            a.service_cities?.toLowerCase().includes(lowerSearch)
        );
    }, [agents, searchTerm, mapInstance]);

    const stats = useMemo(() => {
        if (agents.length === 0) return null;
        const armed = agents.filter(a => a.is_armed).length;
        const available24h = agents.filter(a => a.is_24h).length;
        const virtual = agents.filter(a => a.is_virtual).length;
        const real = agents.length - virtual;
        const active = agents.filter(a => a.status === 'Ativo').length;
        const pending = agents.filter(a => a.status === 'Pendente').length;
        const blocked = agents.filter(a => a.status === 'Bloqueado').length;

        const stateCounts: Record<string, number> = {};
        agents.forEach(a => {
            const addr = (a.base_address || '').toUpperCase();
            const ufMatch = addr.match(/\s([A-Z]{2})$/) || addr.match(/\s([A-Z]{2})\s/);
            const uf = ufMatch ? ufMatch[1] : 'S/D';
            stateCounts[uf] = (stateCounts[uf] || 0) + 1;
        });

        return {
            total: agents.length, armed, unarmed: agents.length - armed,
            available24h, comercial: agents.length - available24h,
            real, virtual, active, pending, blocked,
            topStates: Object.entries(stateCounts).sort((a,b) => b[1] - a[1]).slice(0, 5)
        };
    }, [agents]);

    const handleSelectAgent = (agent: SupportAgent) => {
        setSelectedAgent(agent);
        if (mapInstance && agent.latitude && agent.longitude) {
            mapInstance.panTo({ lat: agent.latitude, lng: agent.longitude });
            mapInstance.setZoom(12);
        }
    };

    const handleWhatsApp = (phone: string) => {
        const clean = phone.replace(/\D/g, '');
        const final = clean.startsWith('55') ? clean : `55${clean}`;
        window.open(`https://wa.me/${final}`, '_blank');
    };

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 flex flex-col lg:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-red-700 text-white rounded-2xl shadow-lg animate-pulse"><Globe size={28} /></div>
                    <div>
                        <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tighter leading-none">Rede de Apoio Nacional</h2>
                        <div className="flex items-center gap-2 mt-2">
                            <span className="text-[10px] font-black text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200 uppercase tracking-widest">{agents.length} AGENTES CARREGADOS (ILIMITADO)</span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                    <div className="relative flex-1 lg:w-96">
                        <input 
                            type="text" 
                            placeholder="Buscar Nome, Cidade, Lat/Long ou Link..." 
                            className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-red-500/10 focus:border-red-500 outline-none transition-all shadow-inner"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    </div>
                    
                    <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl border border-gray-200 shadow-inner">
                        <button onClick={() => setView('map')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 ${view === 'map' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><MapIcon size={14}/> Mapa</button>
                        <button onClick={() => setView('stats')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 ${view === 'stats' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><BarChart3 size={14}/> Dashboard</button>
                        <button onClick={() => setView('chat')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 ${view === 'chat' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><MessageCircle size={14}/> Chat</button>
                    </div>

                    <button onClick={() => setIsFormOpen(true)} className="flex items-center gap-2 bg-slate-900 hover:bg-black text-white px-6 py-3 rounded-2xl text-xs font-black transition-all shadow-xl uppercase active:scale-95">
                        <Plus size={20} strokeWidth={3} /> Novo Agente
                    </button>
                </div>
            </div>

            {view === 'map' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[750px] animate-in fade-in zoom-in-95 duration-300">
                    <div className="lg:col-span-4 flex flex-col bg-white rounded-[2rem] shadow-sm border border-gray-200 overflow-hidden">
                        <div className="p-5 bg-gray-900 text-white flex justify-between items-center border-b border-white/5">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2"><Users size={14} className="text-red-500"/> Agentes Disponíveis</h3>
                            <button onClick={fetchAgents} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"><RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto divide-y divide-gray-100 scrollbar-thin bg-gray-50/30">
                            {isLoading ? (
                                <div className="p-20 text-center flex flex-col items-center"><Loader2 className="animate-spin text-red-600 mb-4" size={32}/><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sincronizando Base...</p></div>
                            ) : (
                                filteredAgents.map(agent => (
                                    <div 
                                        key={agent.id}
                                        onClick={() => handleSelectAgent(agent)}
                                        className={`p-5 cursor-pointer transition-all hover:bg-red-50/40 group border-l-4 ${selectedAgent?.id === agent.id ? 'bg-red-50 border-red-600 shadow-inner' : 'border-transparent'}`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className={`font-black text-[13px] uppercase transition-colors ${selectedAgent?.id === agent.id ? 'text-red-700' : 'text-slate-800'}`}>{agent.name}</h4>
                                            <span className={`text-[8px] font-black px-2 py-0.5 rounded-full border uppercase shadow-sm ${agent.is_virtual ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                                {agent.is_virtual ? 'Virtual' : 'Base'}
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-gray-500 font-bold uppercase flex items-start gap-1.5"><MapPin size={12} className="text-red-600 shrink-0 mt-0.5"/> {agent.base_address}</p>
                                        <div className="flex items-center justify-between mt-4">
                                            <div className="flex gap-2.5">
                                                {/* Fix: wrap icons in a span to use the native title attribute as Lucide icons don't support it directly as a prop */}
                                                {agent.is_armed && <span title="Agente Armado"><Shield size={14} className="text-red-600" /></span>}
                                                {agent.is_24h && <span title="Disponível 24h"><Clock size={14} className="text-blue-600" /></span>}
                                                <span className="text-[11px] font-mono font-black text-gray-700 bg-white border px-2 py-0.5 rounded shadow-sm">{agent.phone}</span>
                                            </div>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleWhatsApp(agent.phone); }}
                                                className="p-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all shadow-md group-hover:scale-110 active:scale-95"
                                                title="WhatsApp"
                                            >
                                                <MessageCircle size={16} strokeWidth={2.5}/>
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="lg:col-span-8 bg-white p-2 rounded-[2rem] shadow-sm border border-gray-200 relative overflow-hidden">
                        {isLoaded ? (
                            <GoogleMap 
                                mapContainerStyle={mapContainerStyle} 
                                center={selectedAgent ? { lat: selectedAgent.latitude, lng: selectedAgent.longitude } : defaultCenter} 
                                zoom={selectedAgent ? 12 : 5} 
                                onLoad={map => setMapInstance(map)}
                                options={{ disableDefaultUI: true, zoomControl: true }}
                            >
                                {filteredAgents.map(agent => (
                                    <Marker 
                                        key={agent.id} 
                                        position={{ lat: agent.latitude, lng: agent.longitude }}
                                        onClick={() => handleSelectAgent(agent)}
                                        icon={{ 
                                            url: agent.status === 'Pendente' ? 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png' : agent.is_virtual ? 'https://maps.google.com/mapfiles/ms/icons/purple-dot.png' : agent.is_armed ? 'https://maps.google.com/mapfiles/ms/icons/red-dot.png' : 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
                                            scaledSize: new google.maps.Size(32, 32)
                                        }}
                                    />
                                ))}
                                {selectedAgent && (
                                    <InfoWindow position={{ lat: selectedAgent.latitude, lng: selectedAgent.longitude }} onCloseClick={() => setSelectedAgent(null)}>
                                        <div className="p-3 min-w-[240px] bg-white">
                                            <div className="flex items-center gap-2 mb-3 border-b border-gray-100 pb-2">
                                                <div className={`p-1.5 rounded-lg ${selectedAgent.is_armed ? 'bg-red-600' : 'bg-blue-600'} text-white shadow-md`}><Shield size={16}/></div>
                                                <h4 className="font-black text-sm uppercase text-slate-900 leading-tight">{selectedAgent.name}</h4>
                                            </div>
                                            <div className="space-y-2">
                                                <p className="text-[10px] text-gray-500 font-bold uppercase flex items-start gap-1.5"><MapPin size={12} className="text-red-500 shrink-0 mt-0.5"/> {selectedAgent.base_address}</p>
                                                <div className="flex items-center justify-between pt-2 border-t mt-3">
                                                    <div className="flex flex-col gap-1">
                                                        <span className={`text-[8px] font-black px-2 py-0.5 rounded text-white w-fit ${selectedAgent.is_armed ? 'bg-red-600' : 'bg-slate-400'}`}>{selectedAgent.is_armed ? 'ARMADO' : 'DESARMADO'}</span>
                                                        <span className={`text-[8px] font-black px-2 py-0.5 rounded text-white w-fit ${selectedAgent.is_24h ? 'bg-blue-600' : 'bg-slate-400'}`}>{selectedAgent.is_24h ? '24H' : 'COMERCIAL'}</span>
                                                    </div>
                                                    <button onClick={() => handleWhatsApp(selectedAgent.phone)} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg active:scale-95"><MessageCircle size={14}/> ACIONAR</button>
                                                </div>
                                            </div>
                                        </div>
                                    </InfoWindow>
                                )}
                            </GoogleMap>
                        ) : <div className="h-full flex items-center justify-center bg-gray-50 text-gray-400 uppercase font-black text-xs tracking-widest">Iniciando Geoprocessamento...</div>}
                    </div>
                </div>
            )}

            {view === 'stats' && stats && (
                <div className="space-y-6 animate-in slide-in-from-bottom-6 duration-500">
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {[
                            { label: 'Rede Total', val: stats.total, color: 'text-gray-900', bg: 'bg-white' },
                            { label: 'Agentes Reais', val: stats.real, color: 'text-emerald-600', bg: 'bg-white' },
                            { label: 'Pontos Virtuais', val: stats.virtual, color: 'text-indigo-600', bg: 'bg-white' },
                            { label: 'Status Ativo', val: stats.active, color: 'text-blue-600', bg: 'bg-white' },
                            { label: 'Pendentes', val: stats.pending, color: 'text-red-600', bg: 'bg-red-50' },
                            { label: 'Capilaridade', val: `${Math.round((stats.real / (stats.total || 1)) * 100)}%`, color: 'text-white', bg: 'bg-slate-900' }
                        ].map((kpi, idx) => (
                            <div key={idx} className={`${kpi.bg} p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center`}>
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{kpi.label}</span>
                                <span className={`text-3xl font-black ${kpi.color} tracking-tighter`}>{kpi.val}</span>
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <MiniChart title="Poder de Fogo" type="bar" data={[{ label: 'Armados', value: stats.armed, color: 'bg-red-600' }, { label: 'Desarmados', value: stats.unarmed, color: 'bg-slate-300' }]} />
                        <MiniChart title="Disponibilidade" type="bar" data={[{ label: 'Pronta Resposta 24h', value: stats.available24h, color: 'bg-blue-600' }, { label: 'Comercial', value: stats.comercial, color: 'bg-amber-500' }]} />
                        <MiniChart title="Vínculos" type="bar" data={[{ label: 'Físico', value: stats.real, color: 'bg-emerald-600' }, { label: 'Virtual', value: stats.virtual, color: 'bg-indigo-600' }]} />
                        <MiniChart title="Top 5 Estados" type="hbar" data={stats.topStates.map(([uf, val]) => ({ label: `UF: ${uf}`, value: val, color: 'bg-slate-800' }))} />
                    </div>
                </div>
            )}

            {view === 'chat' && <WhatsAppChat />}
            {isFormOpen && <SupportAgentFormModal onClose={() => setIsFormOpen(false)} onSuccess={fetchAgents} />}
        </div>
    );
};

export default SupportMapFinder;