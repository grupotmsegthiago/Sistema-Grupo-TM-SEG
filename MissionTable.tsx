
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Mission, MissionStatus, MissionLog, User as UserType, Agent } from '../types';
import { supabase } from '../lib/supabase';
import { useNotification } from '../lib/NotificationContext';
import { logAction } from '../lib/logger';
import { 
  Plus, Loader2, Activity, Search, Database, AlertTriangle, Check, Trash2, Lock, Share2, X, Eye, EyeOff, Layers, PlayCircle, CheckCircle2, FileClock,
  ClipboardList, FileSearch, CalendarClock, MapPin, Truck, Flag, XCircle, UserX, AlertOctagon, ToggleLeft, ToggleRight, Calendar,
  BarChart4, TrendingUp, TrendingDown, DollarSign, PieChart, Wallet, Map as MapIcon, Globe, Building2, LayoutDashboard, User
} from 'lucide-react';
import { GoogleMap, useLoadScript, Marker, InfoWindow } from '@react-google-maps/api';
import { googleMapsApiKey, libraries } from '../lib/maps';
import { extractCoordinates } from '../lib/utils';
import MissionStatusModal from './MissionStatusModal';
import UpdateMissionModal from './UpdateMissionModal';
import MissionCard from './MissionCard';
import MissionPrintModal from './MissionPrintModal';
import MissionHistoryModal from './MissionHistoryModal';
import MissionFinancialModal from './MissionFinancialModal';

interface MissionTableProps {
  onNewMission?: () => void;
}

const STATUS_CONFIG = [
    { id: MissionStatus.SOLICITED, label: 'Solicitada', icon: ClipboardList, color: 'bg-orange-500' },
    { id: MissionStatus.DOCUMENTATION, label: 'Documentação', icon: FileSearch, color: 'bg-blue-400' }, 
    { id: MissionStatus.SCHEDULED, label: 'Agendada', icon: CalendarClock, color: 'bg-yellow-500' },
    { id: MissionStatus.ORIGIN, label: 'Origem', icon: MapPin, color: 'bg-indigo-500' },
    { id: MissionStatus.IN_TRANSIT, label: 'Em Viagem', icon: Truck, color: 'bg-purple-600' },
    { id: MissionStatus.COMPLETED, label: 'Concluída', icon: Flag, color: 'bg-green-600' },
    { id: MissionStatus.CANCELLED, label: 'Cancelada', icon: XCircle, color: 'bg-red-600' },
    { id: MissionStatus.REFUSED, label: 'Recusada', icon: UserX, color: 'bg-red-800' },
];

const mapContainerStyle = {
  width: '100%',
  height: '450px',
  borderRadius: '0.75rem'
};

const defaultMapCenter = {
  lat: -14.235,
  lng: -51.9253 
};

interface StatCardProps {
  icon: React.ElementType;
  title: string;
  value: number;
  bgColor: string;
  loading: boolean;
  isActive: boolean;
  onClick: () => void;
}

const StatCard: React.FC<StatCardProps> = ({ icon: Icon, title, value, bgColor, loading, isActive, onClick }) => (
    <button 
      onClick={onClick}
      className={`
        relative flex flex-col items-start p-2.5 rounded-lg border transition-all duration-200 w-full text-left group
        ${isActive 
          ? 'bg-white border-gray-800 text-gray-900 ring-1 ring-gray-800 shadow-md transform scale-[1.02] z-10' 
          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:shadow-sm'
        }
      `}
    >
      <div className="flex items-center justify-between w-full mb-2">
          <div className={`p-1.5 rounded-md transition-colors ${isActive ? 'bg-gray-800 text-white' : `${bgColor} text-white`}`}>
            <Icon size={16} />
          </div>
          {isActive && <div className="h-1.5 w-1.5 rounded-full bg-gray-800 shadow-sm"></div>}
      </div>
      <div className="w-full min-w-0">
        <p className={`text-[9px] font-bold uppercase tracking-wider mb-0.5 truncate ${isActive ? 'text-gray-800' : 'text-gray-400'}`} title={title}>{title}</p>
        {loading ? (
            <div className="w-8 h-5 bg-gray-200/50 rounded animate-pulse"></div>
        ) : (
            <p className={`text-lg font-black tracking-tight ${isActive ? 'text-gray-900' : 'text-gray-700'} font-mono`}>{value}</p>
        )}
      </div>
    </button>
);

const SimpleLineChart = ({ data, color }: { data: number[], color: string }) => {
    if (!data || data.length === 0) return null;
    const max = Math.max(...data, 1);
    const points = data.map((val, idx) => {
        const x = (idx / (data.length - 1)) * 100;
        const y = 100 - (val / max) * 100;
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" preserveAspectRatio="none">
            <polyline
                fill="none"
                stroke={color}
                strokeWidth="2"
                points={points}
                vectorEffect="non-scaling-stroke"
            />
            <polygon
                fill={color}
                fillOpacity="0.1"
                points={`0,100 ${points} 100,100`}
            />
        </svg>
    );
};

const ClientAnalyticsDashboard: React.FC<{ missions: Mission[] }> = ({ missions }) => {
    const stats = useMemo(() => {
        let totalValue = 0;
        const originStats: Record<string, number> = {};
        const vehicleStats: Record<string, number> = {};
        const driverStats: Record<string, number> = {};
        const dateStats: Record<string, number> = {};

        missions.forEach(m => {
            totalValue += (m.revenue_value || 0) + (m.toll_value || 0);
            
            let uf = 'N/A';
            if (m.origin) {
                const parts = m.origin.split('-');
                if (parts.length > 1) uf = parts[parts.length - 1].trim().split(',')[0].trim();
                else uf = m.origin.split(',')[0].trim();
            }
            originStats[uf] = (originStats[uf] || 0) + 1;
            const plate = m.clientVehicle?.plate || m.vehicleId || 'N/A';
            vehicleStats[plate] = (vehicleStats[plate] || 0) + 1;
            const driver = m.driver_name || 'N/A';
            driverStats[driver] = (driverStats[driver] || 0) + 1;
            const dateKey = new Date(m.createdAt).toISOString().split('T')[0];
            dateStats[dateKey] = (dateStats[dateKey] || 0) + 1;
        });

        const sortedDates = Object.keys(dateStats).sort();
        const chartData = sortedDates.map(d => dateStats[d]);

        const getTop = (obj: Record<string, number>) => 
            Object.entries(obj)
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 5);

        return {
            totalMissions: missions.length,
            totalValue,
            chartData,
            chartLabels: sortedDates,
            topOrigins: getTop(originStats),
            topVehicles: getTop(vehicleStats),
            topDrivers: getTop(driverStats)
        };
    }, [missions]);

    const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    return (
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 animate-in slide-in-from-top-4 mb-6">
            <div className="flex items-center justify-between mb-6 border-b border-gray-100 pb-4">
                <div className="flex items-center gap-2">
                    <PieChart className="text-red-600" />
                    <h3 className="text-lg font-bold text-gray-900 uppercase tracking-wider">Painel de Indicadores</h3>
                </div>
                <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                    {stats.totalMissions} registros encontrados
                </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 relative overflow-hidden">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-blue-600 uppercase mb-1">Total de Missões</p>
                            <h3 className="text-3xl font-black text-blue-900">{stats.totalMissions}</h3>
                        </div>
                        <Activity className="text-blue-300" size={24} />
                    </div>
                </div>
                
                <div className="bg-green-50 p-4 rounded-xl border border-green-100 relative overflow-hidden">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-green-600 uppercase mb-1">Investimento Total</p>
                            <h3 className="text-2xl font-black text-green-900">{formatCurrency(stats.totalValue)}</h3>
                        </div>
                        <DollarSign className="text-green-300" size={24} />
                    </div>
                </div>

                <div className="md:col-span-2 bg-gray-900 text-white p-4 rounded-xl relative overflow-hidden flex flex-col justify-between">
                    <div className="flex justify-between items-center z-10 relative">
                        <p className="text-xs font-bold text-gray-400 uppercase">Volume Diário (Linha do Tempo)</p>
                        <TrendingUp size={16} className="text-gray-500" />
                    </div>
                    <div className="h-16 w-full mt-2 relative z-10">
                        <SimpleLineChart data={stats.chartData} color="#ef4444" />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent pointer-events-none"></div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="border border-gray-100 rounded-xl p-4 bg-gray-50">
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                        <MapPin size={14} className="text-indigo-500"/> Top Origens
                    </h4>
                    <div className="space-y-3">
                        {stats.topOrigins.map((item, i) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                                <span className="font-bold text-gray-700 truncate max-w-[150px]">{item.name}</span>
                                <div className="flex items-center gap-2">
                                    <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-50" style={{ width: `${(item.count / stats.totalMissions) * 100}%` }}></div>
                                    </div>
                                    <span className="text-xs font-mono text-gray-500 w-6 text-right">{item.count}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="border border-gray-100 rounded-xl p-4 bg-gray-50">
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                        <Truck size={14} className="text-orange-500"/> Top Veículos (Placa)
                    </h4>
                    <div className="space-y-3">
                        {stats.topVehicles.map((item, i) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                                <span className="font-bold text-gray-700 truncate max-w-[150px]">{item.name}</span>
                                <div className="flex items-center gap-2">
                                    <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                        <div className="h-full bg-orange-50" style={{ width: `${(item.count / stats.totalMissions) * 100}%` }}></div>
                                    </div>
                                    <span className="text-xs font-mono text-gray-500 w-6 text-right">{item.count}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="border border-gray-100 rounded-xl p-4 bg-gray-50">
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                        <User size={14} className="text-green-500"/> Top Motoristas
                    </h4>
                    <div className="space-y-3">
                        {stats.topDrivers.map((item, i) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                                <span className="font-bold text-gray-700 truncate max-w-[150px]">{item.name}</span>
                                <div className="flex items-center gap-2">
                                    <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                        <div className="h-full bg-green-500" style={{ width: `${(item.count / stats.totalMissions) * 100}%` }}></div>
                                    </div>
                                    <span className="text-xs font-mono text-gray-500 w-6 text-right">{item.count}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

const AnalyticsDashboard: React.FC<{ missions: Mission[], isDirector: boolean }> = ({ missions, isDirector }) => {
    const stats = useMemo(() => {
        let totalRevenue = 0;
        let totalCost = 0;
        const clientStats: Record<string, { count: number, revenue: number }> = {};
        const originStats: Record<string, number> = {};

        missions.forEach(m => {
            if (isDirector) {
                const rev = (m.revenue_value || 0) + (m.toll_value || 0);
                const tollProv = m.toll_value_provider != null ? m.toll_value_provider : (m.toll_value || 0);
                const cost = (m.cost_value || 0) + tollProv;
                totalRevenue += rev;
                totalCost += cost;
            }
            const clientName = m.client || 'N/A';
            if (!clientStats[clientName]) clientStats[clientName] = { count: 0, revenue: 0 };
            clientStats[clientName].count++;
            if (isDirector) clientStats[clientName].revenue += (m.revenue_value || 0) + (m.toll_value || 0);
            
            let uf = 'N/A';
            if (m.origin) {
                const parts = m.origin.split('-');
                if (parts.length > 1) uf = parts[parts.length - 1].trim().split(',')[0].trim();
                else uf = m.origin.split(',')[0].trim();
            }
            uf = uf.substring(0, 15); 
            originStats[uf] = (originStats[uf] || 0) + 1;
        });

        const topClients = Object.entries(clientStats)
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        const topOrigins = Object.entries(originStats)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        const margin = totalRevenue - totalCost;
        const marginPercent = totalRevenue > 0 ? (margin / (totalRevenue - (missions.reduce((a, b) => a + (b.toll_value || 0), 0)))) * 100 : 0;
        const avgTicket = missions.length > 0 ? totalRevenue / missions.length : 0;

        return { 
            totalRevenue, totalCost, margin, marginPercent, avgTicket, 
            topClients, topOrigins, totalMissions: missions.length 
        };
    }, [missions, isDirector]);

    const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    return (
        <div className="bg-slate-900 text-white p-6 rounded-xl shadow-2xl border border-slate-700 animate-in slide-in-from-top-4 mb-6">
            <div className="flex items-center justify-between mb-6 border-slate-700 pb-4 border-b">
                <div className="flex items-center gap-2">
                    <LayoutDashboard className="text-blue-400" />
                    <h3 className="text-lg font-bold uppercase tracking-wider">Dashboard Operacional {isDirector && '& Financeiro'}</h3>
                </div>
                <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded font-mono">
                    {stats.totalMissions} missões no período
                </span>
            </div>

            {isDirector && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 relative overflow-hidden group">
                        <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity"><TrendingUp size={40}/></div>
                        <p className="text-xs text-slate-400 uppercase font-bold mb-1">Faturamento (Receita Bruta)</p>
                        <span className="text-2xl font-black text-green-400 tracking-tight">{formatCurrency(stats.totalRevenue)}</span>
                    </div>
                    <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 relative overflow-hidden group">
                        <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity"><TrendingDown size={40}/></div>
                        <p className="text-xs text-slate-400 uppercase font-bold mb-1">Custo Operacional Total</p>
                        <span className="text-2xl font-black text-red-400 tracking-tight">{formatCurrency(stats.totalCost)}</span>
                    </div>
                    <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity"><Wallet size={40}/></div>
                        <p className="text-xs text-slate-400 uppercase font-bold mb-1">Lucro Projetado</p>
                        <div className="flex items-baseline gap-2">
                            <span className={`text-2xl font-black tracking-tight ${stats.margin >= 0 ? 'text-blue-400' : 'text-red-500'}`}>{formatCurrency(stats.margin)}</span>
                        </div>
                    </div>
                    <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity"><DollarSign size={40}/></div>
                        <p className="text-xs text-slate-400 uppercase font-bold mb-1">Ticket Médio (Bruto)</p>
                        <span className="text-2xl font-black text-yellow-400 tracking-tight">{formatCurrency(stats.avgTicket)}</span>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                    <h4 className="text-xs font-bold text-slate-300 uppercase mb-4 flex items-center gap-2">
                        <Building2 size={14} className="text-indigo-400"/> Top 5 Clientes (Volume)
                    </h4>
                    <div className="space-y-3">
                        {stats.topClients.map((client) => {
                            const percent = (client.count / stats.totalMissions) * 100;
                            return (
                                <div key={client.name} className="relative">
                                    <div className="flex justify-between text-xs mb-1 z-10 relative">
                                        <span className="font-bold text-slate-200 truncate max-w-[200px]">{client.name}</span>
                                        <div className="flex gap-2">
                                            {isDirector && <span className="text-green-400 font-mono">{formatCurrency(client.revenue)}</span>}
                                            <span className="text-slate-400 font-mono font-bold">{client.count} OS</span>
                                        </div>
                                    </div>
                                    <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${percent}%` }}></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                    <h4 className="text-xs font-bold text-slate-300 uppercase mb-4 flex items-center gap-2">
                        <MapPin size={14} className="text-orange-400"/> Top 5 Origens (Cidades)
                    </h4>
                    <div className="space-y-3">
                        {stats.topOrigins.map((origin) => {
                            const maxVal = stats.topOrigins[0].count;
                            const percent = (origin.count / maxVal) * 100;
                            return (
                                <div key={origin.name} className="relative">
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="font-bold text-slate-200 truncate">{origin.name}</span>
                                        <span className="text-slate-400 font-mono font-bold">{origin.count}</span>
                                    </div>
                                    <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                                        <div className="h-full bg-orange-500 rounded-full" style={{ width: `${percent}%` }}></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

const isMissionPending = (m: Mission) => {
    if (m.status === MissionStatus.PENDING) return true;
    if (m.status === MissionStatus.COMPLETED) {
        if (m.endKm === null || m.endKm === undefined || m.endKm === 0) return true;
    }
    return false;
};

const MissionTable: React.FC<MissionTableProps> = ({ onNewMission }) => {
  const { isLoaded } = useLoadScript({
    googleMapsApiKey,
    libraries,
    language: 'pt-BR'
  });

  const { showNotification } = useNotification();
  const [allMissions, setAllMissions] = useState<Mission[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState<'ok' | 'error' | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  const [searchHistoryId, setSearchHistoryId] = useState('');
  const [viewPeriod, setViewPeriod] = useState<string>('TODAY');
  const [customDate, setCustomDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showAnalyticsDash, setShowAnalyticsDash] = useState(false);
  const [showClientDash, setShowClientDash] = useState(false);
  const [showFleetMap, setShowFleetMap] = useState(false);
  const [selectedMapMission, setSelectedMapMission] = useState<Mission | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [missionForStatusView, setMissionForStatusView] = useState<Mission | null>(null);
  const [missionLogs, setMissionLogs] = useState<MissionLog[]>([]);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [missionForPrint, setMissionForPrint] = useState<Mission | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [missionToDelete, setMissionToDelete] = useState<Mission | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyMissionId, setHistoryMissionId] = useState('');
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const [isFinancialModalOpen, setIsFinancialModalOpen] = useState(false);
  const [missionForFinancials, setMissionForFinancials] = useState<Mission | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('userData');
    if (storedUser) setCurrentUser(JSON.parse(storedUser));
  }, []);

  // ATUALIZADO: Inclui Administrador e Diretoria para funções financeiras
  const isDirector = useMemo(() => {
    if (!currentUser) return false;
    const roleLower = currentUser.role?.toLowerCase();
    return ['diretoria', 'administrador'].includes(roleLower) || currentUser.permissions?.includes('*');
  }, [currentUser]);
  
  const canEditMission = useMemo(() => {
      if (!currentUser) return false;
      const roleLower = (currentUser.role || '').toLowerCase();
      return ['diretoria', 'administrador', 'avançado', 'avancado', 'operador'].includes(roleLower) || currentUser.permissions?.includes('*');
  }, [currentUser]);

  const isRestrictedClientView = useMemo(() => {
      if (!currentUser) return false;
      if (currentUser.clientId) return true;
      if (currentUser.permissions && Array.isArray(currentUser.permissions)) {
          return currentUser.permissions.some(p => p.startsWith('client_view:'));
      }
      return false;
  }, [currentUser]);

  const fetchMissions = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setDbStatus(null);
    try {
      let query = supabase.from('missions').select('*').order('created_at', { ascending: false });
      
      if (currentUser?.clientId) {
          const { data: clientData } = await supabase.from('clients').select('name').eq('id', currentUser.clientId).single();
          if (clientData) query = query.eq('client', clientData.name);
          else { setAllMissions([]); setIsLoading(false); return; }
      } else if (currentUser?.permissions) {
          const allowedClientIds = currentUser.permissions.filter(p => p.startsWith('client_view:')).map(p => p.split(':')[1]);
          if (allowedClientIds.length > 0) {
              const { data: clients } = await supabase.from('clients').select('name').in('id', allowedClientIds);
              if (clients && clients.length > 0) query = query.in('client', clients.map(c => c.name));
              else { setAllMissions([]); setIsLoading(false); return; }
          }
      }

      const { data: missionsData, error: missionsError } = await query;
      if (missionsError) throw missionsError;
      setDbStatus('ok');

      if (missionsData) {
          const vehicleIds = [...new Set(missionsData.map((m: any) => m.vehicle_id).filter((id: any) => id))];
          const clientVehicleIds = [...new Set(missionsData.map((m: any) => m.client_vehicle).filter((id: any) => id))];
          const clientNames = [...new Set(missionsData.map((m: any) => m.client).filter((c: any) => typeof c === 'string' && c.trim() !== ''))];

          const [vehiclesRes, clientVehiclesRes, clientsRes] = await Promise.all([
              vehicleIds.length > 0 ? supabase.from('vehicles').select('*').in('id', vehicleIds) : { data: [] },
              clientVehicleIds.length > 0 ? supabase.from('client_vehicles').select('id, plate, model, brand, color').in('id', clientVehicleIds) : { data: [] },
              clientNames.length > 0 ? supabase.from('clients').select('name, trading_name').in('name', clientNames) : { data: [] }
          ]);

          const vehicleMap = (vehiclesRes.data || []).reduce((acc: any, v: any) => ({ ...acc, [v.id]: v }), {});
          const clientVehicleMap = (clientVehiclesRes.data || []).reduce((acc: any, v: any) => ({ ...acc, [v.id]: v }), {});
          const clientNameMap = (clientsRes.data || []).reduce((acc: any, c: any) => {
              if (c.trading_name && c.trading_name.trim() !== '') acc[c.name.trim().toUpperCase()] = c.trading_name.trim();
              return acc;
          }, {});

          const mapped: Mission[] = missionsData.map((m: any) => {
              const clientKey = m.client ? m.client.trim().toUpperCase() : '';
              const resolvedVehicle = vehicleMap[m.vehicle_id];
              let displayVehicleId = m.vehicle_id;
              if (resolvedVehicle) displayVehicleId = resolvedVehicle.plate;

              const fallbackDate = m.last_update || new Date().toISOString();

              return { 
                  ...m, 
                  client: clientNameMap[clientKey] || m.client, 
                  originalClientName: m.client, 
                  clientVehicle: clientVehicleMap[m.client_vehicle] || m.client_vehicle, 
                  driver_name: m.driver_name, 
                  driver_phone: m.driver_phone, 
                  lastUpdate: m.last_update, 
                  updatedBy: m.updated_by, 
                  createdAt: m.created_at || fallbackDate, 
                  vehicleId: displayVehicleId, 
                  vehicleData: resolvedVehicle, 
                  totalDistance: m.total_distance, 
                  traveledDistance: m.traveled_distance, 
                  mapLink: m.map_link, 
                  startKm: m.start_km, 
                  startTime: m.start_time, 
                  endKm: m.end_km, 
                  endTime: m.end_time, 
                  estimatedTime: m.estimated_time, 
                  currentLocation: m.current_location, 
                  progress: m.progress || 0, 
                  mission_type: m.mission_type || 'Caracterizada', 
                  gr_espelhamento: m.gr_espelhamento,
                  revenue_value: m.revenue_value,
                  cost_value: m.cost_value,
                  toll_value: m.toll_value
              };
          });
          setAllMissions(mapped);
      }
    } catch (error: any) {
      console.error('Error fetching missions:', error);
      const errorMsg = error.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
      setDbStatus('error');
      showNotification('Erro', `Falha ao carregar monitoramento: ${errorMsg}`, 'error');
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [showNotification, currentUser]);

  useEffect(() => {
    if (currentUser) {
        fetchMissions();
        const interval = setInterval(() => fetchMissions(true), 30000);
        return () => clearInterval(interval);
    }
  }, [fetchMissions, currentUser]);

  const periodMissions = useMemo(() => {
      if (viewPeriod === 'ALL') return allMissions;
      const now = new Date();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      return allMissions.filter(m => {
          const mDate = new Date(m.createdAt);
          const lastUpdDate = new Date(m.lastUpdate || m.createdAt);
          const isNotCompleted = ![MissionStatus.COMPLETED, MissionStatus.CANCELLED, MissionStatus.REFUSED].includes(m.status as MissionStatus);
          
          if (viewPeriod === 'TODAY') {
              if (isNotCompleted) return true;
              const createdToday = mDate >= todayStart && mDate <= todayEnd;
              if (createdToday) return true;
              const finishedToday = lastUpdDate >= todayStart && lastUpdDate <= todayEnd;
              if (finishedToday) return true;
              return false;
          }
          if (viewPeriod === 'YESTERDAY') {
              const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(todayStart.getDate() - 1);
              const yesterdayEnd = new Date(todayEnd); yesterdayEnd.setDate(todayEnd.getDate() - 1);
              return mDate >= yesterdayStart && mDate <= yesterdayEnd;
          }
          if (viewPeriod === 'LAST_7_DAYS') {
              const weekStart = new Date(todayStart); weekStart.setDate(todayStart.getDate() - 7);
              return mDate >= weekStart && mDate <= todayEnd;
          }
          if (viewPeriod === 'CUSTOM') {
              if (!customDate) return true;
              const mDateStr = mDate.toLocaleDateString('en-CA');
              return mDateStr === customDate;
          }
          return true;
      });
  }, [allMissions, viewPeriod, customDate]);

  const statusCounts = useMemo(() => {
      return periodMissions.reduce((acc: any, m: any) => {
          if (!isMissionPending(m)) {
              acc[m.status] = (acc[m.status] || 0) + 1;
          }
          return acc;
      }, {});
  }, [periodMissions]);

  const pendingCount = useMemo(() => allMissions.filter(m => isMissionPending(m)).length, [allMissions]);

  const filteredMissions = useMemo(() => {
      const sourceMissions = showPendingOnly ? allMissions : periodMissions;
      return sourceMissions.filter(mission => {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = mission.id.toLowerCase().includes(searchLower) || mission.client.toLowerCase().includes(searchLower) || (mission.vehicleId || '').toLowerCase().includes(searchLower) || (mission.provider || '').toLowerCase().includes(searchLower) || (mission.clientVehicle?.plate || '').toLowerCase().includes(searchLower) || (mission.driver_name || '').toLowerCase().includes(searchLower);
        const isPending = isMissionPending(mission);
        if (showPendingOnly) { return matchesSearch && isPending; } 
        else { if (isPending) return false; }
        if (filterStatus === 'ALL') {
            if (viewPeriod === 'TODAY' && !searchTerm) {
                const isFinished = [MissionStatus.COMPLETED, MissionStatus.CANCELLED, MissionStatus.REFUSED].includes(mission.status as MissionStatus);
                if (isFinished) return false;
            }
            return matchesSearch;
        }
        return matchesSearch && mission.status === filterStatus;
      });
  }, [periodMissions, allMissions, searchTerm, filterStatus, showPendingOnly, viewPeriod]);

  const activeMapMissions = useMemo(() => {
      return allMissions.filter(m => {
          const isActive = [MissionStatus.IN_TRANSIT, MissionStatus.ORIGIN, MissionStatus.SCHEDULED].includes(m.status);
          const hasCoords = !!extractCoordinates(m.mapLink || '');
          return isActive && hasCoords;
      }).map(m => ({
          ...m,
          position: extractCoordinates(m.mapLink || '')!
      }));
  }, [allMissions]);

  const getDelayMinutes = useCallback((m: Mission) => {
      const nowTime = new Date().getTime();
      const lastUpdateTime = new Date(m.lastUpdate).getTime();
      if (m.status === MissionStatus.IN_TRANSIT || m.status === MissionStatus.ORIGIN) {
          return Math.max(0, Math.floor((nowTime - lastUpdateTime) / 60000));
      }
      if (m.status === MissionStatus.SCHEDULED) {
          if (m.startTime) {
              const scheduledTime = new Date(m.startTime).getTime();
              if (nowTime > scheduledTime) {
                  return Math.max(0, Math.floor((nowTime - scheduledTime) / 60000));
              }
          }
          return 0; 
      }
      return 0; 
  }, []);

  const sortedMissions = useMemo(() => {
      return [...filteredMissions].sort((a, b) => {
          const delayA = getDelayMinutes(a);
          const delayB = getDelayMinutes(b);
          const getGroup = (d: number, m: Mission) => {
              if (isMissionPending(m)) return 4;
              if ([MissionStatus.COMPLETED, MissionStatus.CANCELLED, MissionStatus.REFUSED].includes(m.status as MissionStatus)) return 0; 
              if (d > 60) return 3; if (d >= 30) return 2; return 1; 
          };
          const groupA = getGroup(delayA, a); 
          const groupB = getGroup(delayB, b);
          if (groupA !== groupB) return groupB - groupA;
          if (groupA > 0 && groupA < 4) return delayB - delayA; 
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [filteredMissions, getDelayMinutes]);

  const handleOpenUpdateModal = (mission: Mission) => { setSelectedMission(mission); setIsUpdateModalOpen(true); };
  const handleUpdateSuccess = (reportText?: string) => { setIsUpdateModalOpen(false); setSelectedMission(null); fetchMissions(true); if (reportText) handleCopyToClipboard(reportText, 'relatorio', true); };
  const handleOpenStatusModal = async (mission: Mission) => { setMissionForStatusView(mission); setIsStatusModalOpen(true); const { data } = await supabase.from('mission_logs').select('*').eq('mission_id', mission.id).order('created_at', { ascending: false }); if (data) setMissionLogs(data as MissionLog[]); };
  
  const handleOpenFinancialModal = (mission: Mission) => {
      setMissionForFinancials(mission);
      setIsFinancialModalOpen(true);
  };

  const handleOpenPrintModal = (mission: Mission) => { setMissionForPrint(mission); setIsPrintModalOpen(true); };
  const handleDeleteClick = (mission: Mission) => { setMissionToDelete(mission); setDeletePassword(''); setIsDeleteModalOpen(true); };
  
  const handleCopyMission = async (mission: Mission) => {
      const dateObj = new Date(mission.startTime || mission.createdAt);
      const dateStr = dateObj.toLocaleDateString('pt-BR');
      const timeStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const formatName = (name?: string) => name || 'N/A';
      const text = `*MONITORAMENTO GRUPO TMSEG*
*OS:* ${mission.id} | *STATUS:* ${mission.status.toUpperCase()}

🗓 *DATA:* ${dateStr} *HORA:* ${timeStr}
🛡 *OPERAÇÃO:* ${mission.mission_type?.toUpperCase() || 'CARACTERIZADA'}
🏢 *CLIENTE:* ${mission.client}

📍 *ORIGEM:* ${mission.origin || 'N/A'}
🏁 *DESTINO:* ${mission.destination || 'N/A'}

🚛 *VEÍCULO:* ${mission.clientVehicle?.plate || 'N/A'} | *MOD:* ${mission.clientVehicle?.model || ''}
👤 *MOTORISTA:* ${formatName(mission.driver_name)}
📞 *CONTATO:* ${mission.driver_phone || 'N/A'}

🚔 *VIATURA:* ${mission.vehicleId || 'N/A'}
👮 *AGENTE 01:* ${formatName(mission.agent1)}
👮 *AGENTE 02:* ${mission.agent2 ? formatName(mission.agent2) : '---'}

📣 *OCORRÊNCIA:* ${mission.currentLocation || 'Sem descrição recente'}
🗺 *LOCALIZAÇÃO:* ${mission.mapLink || 'N/A'}`;
      await handleCopyToClipboard(text, mission.id);
  };
  
  const handleCopyEmail = (mission: Mission) => {
      const subject = `STATUS OS ${mission.id} - ${mission.client}`;
      const body = `Prezados,

Segue status da operação:

OS: ${mission.id}
Status: ${mission.status}
Local Atual: ${mission.currentLocation || 'N/A'}

Atenciosamente,
Grupo TMSEG`;
      const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = mailtoLink;
  };

  const handleCopyToClipboard = async (text: string, id: string, isReport = false) => {
      try { await navigator.clipboard.writeText(text); if(isReport) showNotification('Sucesso', 'Alerta copiado!', 'success'); else { setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); } } catch (err) { console.error(err); }
  };
  
  const confirmDelete = async () => {
      if (!missionToDelete) return;
      setIsDeleting(true);
      try {
          await supabase.from('mission_logs').delete().eq('mission_id', missionToDelete.id);
          const { error } = await supabase.from('missions').delete().eq('id', missionToDelete.id);
          if (error) throw error;
          await logAction('DELETE', 'Mission', missionToDelete.id, `Missão excluída por ${currentUser?.name}`);
          showNotification('Sucesso', 'Missão excluída com sucesso', 'success');
          setIsDeleteModalOpen(false);
          setMissionToDelete(null);
          fetchMissions(true);
      } catch (error: any) {
          console.error("Erro ao excluir:", error);
          showNotification('Erro', 'Erro ao excluir missão: ' + error.message, 'error');
      } finally {
          setIsDeleting(false);
      }
  };

  const handleSearchHistory = async () => {
      if (!searchHistoryId.trim()) return;
      let searchId = searchHistoryId.trim().toUpperCase();
      if (!searchId.startsWith('GTM-') && !searchId.startsWith('OS-') && !isNaN(Number(searchId))) {
          searchId = `GTM-${searchId.padStart(4, '0')}`;
      }
      setHistoryMissionId(searchId);
      setIsHistoryModalOpen(true);
  };
  
  const handleViewHistory = (mission: Mission) => {
      setHistoryMissionId(mission.id);
      setIsHistoryModalOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20 relative">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
            <span className="w-1.5 h-6 bg-red-700 rounded-full"></span>
            Monitoramento de Missões
          </h2>
          {dbStatus === 'ok' && ( <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-green-700 bg-green-50 px-2 py-1 rounded w-fit border border-green-200"><Database size={12} /> Sincronizado</div> )}
          {dbStatus === 'error' && ( <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-red-700 bg-red-50 px-2 py-1 rounded w-fit border border-red-200"><AlertTriangle size={12} /> Erro de Conexão com o Banco</div> )}
        </div>
        
        <div className="flex gap-2 items-center">
            {!isRestrictedClientView && (
                <div className="flex items-center gap-2 bg-indigo-50 p-1.5 rounded-lg border border-indigo-200 mr-2">
                    <div className="relative">
                        <input 
                            type="text" 
                            className="bg-transparent text-xs font-bold text-indigo-900 placeholder-indigo-400 outline-none w-32 pl-2"
                            placeholder="Investigar OS..."
                            value={searchHistoryId}
                            onChange={(e) => setSearchHistoryId(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearchHistory()}
                        />
                    </div>
                    <button onClick={handleSearchHistory} className="p-1 bg-indigo-600 text-white rounded hover:bg-indigo-700" title="Ver Relatório Detalhado">
                        <FileSearch size={14} />
                    </button>
                </div>
            )}
            <button
                onClick={() => setShowFleetMap(!showFleetMap)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase transition-all border ${showFleetMap ? 'bg-indigo-600 text-white border-indigo-700 shadow-md' : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50'}`}
            >
                <Globe size={16} /> {showFleetMap ? 'Ocultar Mapa' : 'Visualizar Mapa da Frota'}
            </button>
            {!isRestrictedClientView && (
                <button
                    onClick={() => setShowAnalyticsDash(!showAnalyticsDash)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase transition-all border ${showAnalyticsDash ? 'bg-blue-600 text-white border-blue-700 shadow-md' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                >
                    <BarChart4 size={16} /> Painel Analítico
                </button>
            )}
            {isRestrictedClientView && (
                <button
                    onClick={() => setShowClientDash(!showClientDash)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase transition-all border ${showClientDash ? 'bg-blue-600 text-white border-blue-700 shadow-md' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                >
                    <BarChart4 size={16} /> Painel de Indicadores
                </button>
            )}
            <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-200 mr-2">
                <Calendar size={16} className="text-gray-500 ml-1" />
                <select 
                    value={viewPeriod}
                    onChange={(e) => setViewPeriod(e.target.value)}
                    className="bg-transparent border-none text-xs font-bold text-gray-700 outline-none cursor-pointer focus:ring-0 uppercase"
                >
                    <option value="TODAY">HOJE (OPERACIONAL)</option>
                    <option value="YESTERDAY">ONTEM</option>
                    <option value="LAST_7_DAYS">ÚLTIMOS 7 DIAS</option>
                    <option value="CUSTOM">SELECIONAR DATA</option>
                    <option value="ALL">TODO O HISTÓRICO</option>
                </select>
            </div>
            {onNewMission && !isRestrictedClientView && (
                <button 
                onClick={onNewMission}
                className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-black px-5 py-2.5 rounded-lg text-sm font-bold transition-all shadow-md uppercase tracking-wide"
                >
                <Plus size={18} /> Nova Missão
                </button>
            )}
        </div>
      </div>

      {!isRestrictedClientView && showAnalyticsDash && <AnalyticsDashboard missions={periodMissions} isDirector={isDirector} />}
      {isRestrictedClientView && showClientDash && <ClientAnalyticsDashboard missions={periodMissions} />}

      {showFleetMap && isLoaded && (
          <div className="bg-white p-2 rounded-xl shadow-lg border border-gray-200 mb-6 animate-in slide-in-from-top-4">
              <div className="p-3 border-b border-gray-100 flex justify-between items-center mb-2">
                  <h3 className="text-sm font-bold text-indigo-900 uppercase flex items-center gap-2">
                      <Globe size={16} /> Mapa Global da Frota ({activeMapMissions.length} ativos)
                  </h3>
                  <button onClick={() => setShowFleetMap(false)} className="text-gray-400 hover:text-red-500"><XCircle size={18}/></button>
              </div>
              <GoogleMap mapContainerStyle={mapContainerStyle} center={activeMapMissions.length > 0 ? activeMapMissions[0].position : defaultMapCenter} zoom={activeMapMissions.length > 0 ? 6 : 4} options={{ disableDefaultUI: true, zoomControl: true }}>
                  {activeMapMissions.map(m => (
                      <Marker
                          key={m.id}
                          position={m.position}
                          icon={{ url: m.status === MissionStatus.IN_TRANSIT ? 'http://maps.google.com/mapfiles/ms/icons/green-dot.png' : 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png' }}
                          onClick={() => setSelectedMapMission(m)}
                      />
                  ))}
                  {selectedMapMission && (
                      <InfoWindow position={extractCoordinates(selectedMapMission.mapLink || '')!} onCloseClick={() => setSelectedMapMission(null)}>
                          <div className="p-1 min-w-[200px]">
                              <h4 className="font-bold text-sm mb-1">{selectedMapMission.client}</h4>
                              <p className="text-xs text-gray-600 font-bold mb-1">{selectedMapMission.vehicleId || 'Veículo N/A'}</p>
                              <p className="text-[10px] text-gray-500 mb-2">{selectedMapMission.currentLocation}</p>
                              <span className={`text-[9px] px-2 py-0.5 rounded text-white font-bold ${selectedMapMission.status === MissionStatus.IN_TRANSIT ? 'bg-green-600' : 'bg-blue-500'}`}>{selectedMapMission.status}</span>
                          </div>
                      </InfoWindow>
                  )}
              </GoogleMap>
          </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
        <StatCard icon={Activity} title="Total Geral" value={periodMissions.length} bgColor="bg-gray-700" loading={isLoading} isActive={filterStatus === 'ALL' && !showPendingOnly} onClick={() => { setFilterStatus('ALL'); setShowPendingOnly(false); }} />
        {STATUS_CONFIG.map((status) => (
            <StatCard key={status.id} icon={status.icon} title={status.label} value={statusCounts[status.id] || 0} bgColor={status.color} loading={isLoading} isActive={filterStatus === status.id && !showPendingOnly} onClick={() => { setFilterStatus(status.id); setShowPendingOnly(false); }} />
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden sticky top-0 z-20">
        <div className="p-4 border-b border-gray-100 bg-gray-50/80 backdrop-blur-sm flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="flex items-center gap-3 flex-1 w-full md:w-auto">
              <div className="relative flex-1 max-w-md">
                <input type="text" placeholder="Buscar OS, Cliente, Placa, Motorista..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all shadow-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                <Search size={18} className="absolute left-3.5 top-3 text-gray-400" />
              </div>
              <button onClick={() => setShowPendingOnly(!showPendingOnly)} className={`relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase transition-all border ${showPendingOnly ? 'bg-orange-500 text-black border-orange-600 shadow-md ring-2 orange-500/30' : pendingCount > 0 ? 'bg-orange-500 text-black border-orange-600 shadow-sm animate-pulse' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50 hover:border-gray-400'}`}>
                  {pendingCount > 0 ? ( <AlertTriangle size={16} className="text-black" /> ) : ( showPendingOnly ? <ToggleRight size={16} /> : <ToggleLeft size={16} /> )}
                  {showPendingOnly ? 'Exibindo Pendências (Global)' : 'Filtrar Pendências'}
                  {pendingCount > 0 && ( <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] bg-white text-orange-700 font-bold">{pendingCount}</span> )}
              </button>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500"><span className="hidden md:inline">Exibindo:</span><span className="font-bold text-gray-800 bg-gray-200 px-2 py-1 rounded">{filteredMissions.length}</span></div>
        </div>

        <div className="bg-gray-50/50 p-4 min-h-[400px]">
            {isLoading ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400"><Loader2 size={32} className="animate-spin mb-2 text-red-600" /><p className="text-sm font-medium">Carregando operações...</p></div>
            ) : sortedMissions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl bg-white"><Activity size={48} className="mb-2 opacity-20" /><p className="text-sm font-bold text-gray-500">Nenhuma missão encontrada.</p></div>
            ) : (
                <div className="flex flex-col gap-3">
                    {sortedMissions.map((mission) => {
                        const diffMinutes = getDelayMinutes(mission);
                        const isActive = ![MissionStatus.COMPLETED, MissionStatus.CANCELLED, MissionStatus.REFUSED].includes(mission.status);
                        const isCriticalDelay = isActive && diffMinutes > 60;
                        const isRedLight = [MissionStatus.PENDING, MissionStatus.CANCELLED, MissionStatus.REFUSED].includes(mission.status) || isCriticalDelay || (mission.status === MissionStatus.COMPLETED && (!mission.endKm || mission.endKm === 0)); 
                        const isImminent = mission.status === MissionStatus.IN_TRANSIT && diffMinutes > 30 && diffMinutes <= 60;

                        return (
                            <div key={mission.id} className="relative">
                                <MissionCard 
                                    mission={mission}
                                    canEditMission={canEditMission}
                                    isDirector={isDirector}
                                    isRedLight={isRedLight}
                                    isImminent={isImminent}
                                    minutesSinceUpdate={diffMinutes}
                                    copiedId={copiedId}
                                    onViewMap={handleOpenStatusModal}
                                    onUpdate={handleOpenUpdateModal}
                                    onOpenFinancials={handleOpenFinancialModal} 
                                    onCopy={handleCopyMission}
                                    onCopyEmail={handleCopyEmail}
                                    onDelete={handleDeleteClick}
                                    hideProviderInfo={isRestrictedClientView}
                                    onPrint={handleOpenPrintModal}
                                    onViewHistory={handleViewHistory}
                                />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
      </div>

      <MissionStatusModal isOpen={isStatusModalOpen} onClose={() => setIsStatusModalOpen(false)} mission={missionForStatusView!} logs={missionLogs} onUpdate={() => fetchMissions(true)} />
      <MissionFinancialModal isOpen={isFinancialModalOpen} onClose={() => setIsFinancialModalOpen(false)} mission={missionForFinancials} onUpdate={() => fetchMissions(true)} />
      {isHistoryModalOpen && <MissionHistoryModal missionId={historyMissionId} onClose={() => setIsHistoryModalOpen(false)} />}
      <UpdateMissionModal isOpen={isUpdateModalOpen} onClose={() => setIsUpdateModalOpen(false)} mission={selectedMission} currentUser={currentUser} onSuccess={handleUpdateSuccess} />
      {isPrintModalOpen && missionForPrint && <MissionPrintModal mission={missionForPrint} onClose={() => setIsPrintModalOpen(false)} />}
      {isDeleteModalOpen && missionToDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border border-red-200">
                  <div className="bg-red-50 p-4 border-b border-red-100 flex items-center gap-3"><div className="p-2 bg-red-100 rounded-full text-red-600"><Trash2 size={24} /></div><h3 className="text-lg font-bold text-red-900">Excluir Missão?</h3></div>
                  <div className="p-6 space-y-4"><p className="text-sm text-gray-600">Tem certeza que deseja excluir a missão <strong>{missionToDelete.id}</strong>? Esta ação removerá todos os logs e histórico associados e <span className="font-bold text-red-600">não pode ser desfeita</span>.</p>
                      {!isDirector && (<div><label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Senha de Autorização</label><div className="relative"><input type="password" className="w-full p-2 pl-9 border border-gray-300 rounded text-sm outline-none focus:border-red-500" placeholder="Senha de Admin" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} /><Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /></div></div>)}
                  </div>
                  <div className="p-4 bg-gray-50 flex justify-end gap-3 border-t border-gray-100"><button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-100">Cancelar</button><button onClick={confirmDelete} disabled={isDeleting || (!isDirector && !deletePassword)} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">{isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Confirmar Exclusão</button></div>
              </div>
          </div>
      )}
    </div>
  );
};

export default MissionTable;
