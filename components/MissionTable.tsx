import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Mission, MissionStatus, MissionLog, User as UserType, Agent, Client, ClientPriceTable, ProviderCostTable } from '../types';
import { supabase } from '../lib/supabase';
import { useNotification } from '../lib/NotificationContext';
import { logAction } from '../lib/logger';
import { 
  Plus, Loader2, Activity, Search, Database, AlertTriangle, Check, Trash2, Lock, Share2, X, Eye, EyeOff, Layers, PlayCircle, CheckCircle2,
  ClipboardList, FileSearch, CalendarClock, MapPin, Truck, Flag, XCircle, UserX, AlertOctagon, ToggleLeft, ToggleRight, Calendar,
  BarChart4, Globe, Building2, LayoutDashboard, User, ExternalLink, RefreshCw,
  Target, Clock, History, CalendarPlus, ShieldAlert, Mail, MessageCircle, ClipboardCheck,
  FileBarChart, ArrowRight, Briefcase, Printer, Filter, List, Download, Link2, TrendingDown
} from 'lucide-react';
import { GoogleMap, useLoadScript, Marker, InfoWindow } from '@react-google-maps/api';
import { googleMapsLoadConfig } from '../lib/maps';
import { extractCoordinates } from '../lib/utils';
import MissionStatusModal from './MissionStatusModal';
import UpdateMissionModal from './UpdateMissionModal';
import MissionCard from './MissionCard';
import MissionPrintModal from './MissionPrintModal';
import MissionHistoryModal from './MissionHistoryModal';
import MissionFinancialModal from './MissionFinancialModal';
import MissionFullReportModal from './MissionFullReportModal';
import DailyGoalThermometer from './DailyGoalThermometer';
import ExecutiveDashboard from './ExecutiveDashboard';
import ClientExecutiveDashboard from './ClientExecutiveDashboard';
import ClientReportsTab from './ClientReportsTab';
import ClientMissionRequest from './ClientMissionRequest';
import ClientCommitteePresentation from './ClientCommitteePresentation';
import MissionOperationalReport from './MissionOperationalReport';
const cevaLogoPath = '/logo_ceva.png';


interface MissionTableProps {
  onNewMission?: () => void;
}

const STATUS_CONFIG = [
    { id: MissionStatus.PENDING, label: 'Pendente', icon: Clock, color: 'bg-gray-500' },
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
        relative flex items-center gap-2 p-2 rounded-lg border transition-all duration-200 w-full text-left group
        ${isActive 
          ? 'bg-white border-gray-800 text-gray-900 ring-1 ring-gray-800 shadow-md transform scale-[1.02] z-10' 
          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:shadow-sm'
        }
      `}
    >
      <div className={`p-1.5 rounded-md shrink-0 ${isActive ? 'bg-gray-800 text-white' : `${bgColor} text-white shadow-sm`}`}>
          <Icon size={13} />
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-[8px] font-black uppercase text-gray-400 tracking-wider block leading-tight truncate">{title}</span>
        {loading ? (
            <div className="w-6 h-4 bg-gray-200/50 rounded animate-pulse mt-0.5"></div>
        ) : (
            <p className={`text-sm font-black tracking-tight ${isActive ? 'text-gray-900' : 'text-gray-700'} font-mono leading-tight`}>{value}</p>
        )}
      </div>
    </button>
);

const isMissionPending = (m: Mission) => {
    if (m.status === MissionStatus.PENDING) return true;
    if (m.status === MissionStatus.COMPLETED) {
        if (m.endKm === null || m.endKm === undefined || m.endKm === 0) return true;
    }
    return false;
};

// Marco temporal solicitado: Janeiro de 2026
const DATE_THRESHOLD_2026 = new Date('2026-01-01T00:00:00').getTime();

const MissionTable: React.FC<MissionTableProps> = ({ onNewMission }) => {
  const { isLoaded, loadError } = useLoadScript(googleMapsLoadConfig);

  const { showNotification } = useNotification();
  const [allMissions, setAllMissions] = useState<Mission[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState<'ok' | 'error' | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  
  // Toggle Filters
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  const [showTomorrowOnly, setShowTomorrowOnly] = useState(false); 
  
  const [searchHistoryId, setSearchHistoryId] = useState('');
  const [osFilterTerm, setOsFilterTerm] = useState('');
  const [viewPeriod, setViewPeriod] = useState<string>('TODAY'); 
  
  const [clientTables, setClientTables] = useState<ClientPriceTable[]>([]);
  const [providerTables, setProviderTables] = useState<ProviderCostTable[]>([]);
  const [clientsData, setClientsData] = useState<Client[]>([]);
  const [agentPhonesMap, setAgentPhonesMap] = useState<Record<string, string>>({});
  
  const [customStartDate, setCustomStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [customEndDate, setCustomEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  const [showAnalyticsDash, setShowAnalyticsDash] = useState(false);
  const [showClientDash, setShowClientDash] = useState(false);
  const [showClientReports, setShowClientReports] = useState(false);
  const [showClientCommittee, setShowClientCommittee] = useState(false);
  const [showFleetMap, setShowFleetMap] = useState(false);
  const [selectedMapMission, setSelectedMapMission] = useState<Mission | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [missionForStatusView, setMissionForStatusView] = useState<Mission | null>(null);
  const [missionLogs, setMissionLogs] = useState<MissionLog[]>([]);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [missionForPrint, setMissionForPrint] = useState<Mission | null>(null);
  const [isFullReportOpen, setIsFullReportOpen] = useState(false);
  const [missionForFullReport, setMissionForFullReport] = useState<Mission | null>(null);
  const [missionForOpReport, setMissionForOpReport] = useState<Mission | null>(null);
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
  const [showClientRequestModal, setShowClientRequestModal] = useState(false);
  const [solicitationCount, setSolicitationCount] = useState(0);
  const [accidentCount, setAccidentCount] = useState(0);
  const [approvalMap, setApprovalMap] = useState<Record<string, { stage: string; date: string }[]>>({});
  const [evidenceMap, setEvidenceMap] = useState<Record<string, { url: string; uploadedBy: string; uploadedAt: string }[]>>({});
  const [lastLogMap, setLastLogMap] = useState<Record<string, MissionLog>>({});
  const [resolvedClientName, setResolvedClientName] = useState('');
  const [showMyApprovalOnly, setShowMyApprovalOnly] = useState(false);
  const [showNegativeMarginOnly, setShowNegativeMarginOnly] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);

  // Relógio para projeções
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 300000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const storedUser = localStorage.getItem('userData');
    if (storedUser) setCurrentUser(JSON.parse(storedUser));
  }, []);

  const isDirector = useMemo(() => {
    if (!currentUser) return false;
    const roleLower = (currentUser?.role || '').toLowerCase();
    return ['diretoria', 'administrador', 'controller'].includes(roleLower) || currentUser.permissions?.includes('*');
  }, [currentUser]);

  const isAdmin = useMemo(() => {
    if (!currentUser) return false;
    const roleLower = (currentUser?.role || '').toLowerCase();
    return roleLower === 'administrador' || currentUser.permissions?.includes('*');
  }, [currentUser]);

  const isDanielPinto = useMemo(() => {
    return currentUser?.name?.toUpperCase() === 'DANIEL PINTO';
  }, [currentUser]);

  const canSeeFinancials = useMemo(() => {
    if (!currentUser) return false;
    const nameLower = (currentUser.name || '').toLowerCase();
    const roleLower = (currentUser.role || '').toLowerCase();
    return nameLower.includes('daniel') || nameLower.includes('barbara') || nameLower.includes('bárbara') || nameLower.includes('thiago') || roleLower === 'controller';
  }, [currentUser]);
  
  const isCommercial = useMemo(() => {
      if (!currentUser) return false;
      const roleLower = (currentUser.role || '').toLowerCase();
      if (roleLower !== 'comercial') return false;
      const hasClientViewPerms = currentUser.permissions?.some((p: string) => p.startsWith('client_view:'));
      return !!hasClientViewPerms;
  }, [currentUser]);

  const canEditMission = useMemo(() => {
      if (!currentUser) return false;
      const roleLower = (currentUser.role || '').toLowerCase();
      return ['diretoria', 'administrador', 'avançado', 'avancado', 'operador', 'comercial'].includes(roleLower) || currentUser.permissions?.includes('*');
  }, [currentUser]);

  const isRestrictedClientView = useMemo(() => {
      if (!currentUser) return false;
      if (currentUser.clientId) return true;
      if (currentUser.permissions && Array.isArray(currentUser.permissions)) {
          return currentUser.permissions.some(p => p.startsWith('client_view:'));
      }
      return false;
  }, [currentUser]);

  const isCevaClient = useMemo(() => {
      return isRestrictedClientView && resolvedClientName.toUpperCase().includes('CEVA');
  }, [isRestrictedClientView, resolvedClientName]);

  const fetchMissions = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setDbStatus(null);
    try {
      let query = supabase.from('missions').select('*').order('created_at', { ascending: false });
      
      if (currentUser?.clientId) {
          const { data: clientData } = await supabase.from('clients').select('name').eq('id', currentUser.clientId).single();
          if (clientData) { query = query.eq('client', clientData.name); setResolvedClientName(clientData.name); }
          else { setAllMissions([]); setIsLoading(false); return; }
      } else if (isCommercial || (currentUser?.permissions && currentUser.permissions.some(p => p.startsWith('client_view:')))) {
          const allowedClientIds = currentUser?.permissions?.filter(p => p.startsWith('client_view:')).map(p => p.split(':')[1]) || [];
          
          let clientNamesQuery = supabase.from('clients').select('name');
          if (allowedClientIds.length > 0) {
              clientNamesQuery = clientNamesQuery.or(`created_by.eq."${currentUser?.name}",id.in.(${allowedClientIds.join(',')})`);
          } else {
              clientNamesQuery = clientNamesQuery.eq('created_by', currentUser?.name);
          }

          const { data: myClients } = await clientNamesQuery;
          const validNames = (myClients || []).map(c => c.name);

          if (validNames.length > 0) {
              query = query.in('client', validNames);
              if (validNames.length === 1) setResolvedClientName(validNames[0]);
          } else {
              query = query.eq('client', 'NON_EXISTENT_CLIENT_TO_FORCE_EMPTY');
          }
      }

      const fetchAllPages = async () => {
          let all: any[] = [];
          let from = 0;
          const pageSize = 1000;
          while (true) {
              const { data, error } = await query.range(from, from + pageSize - 1);
              if (error) throw error;
              if (data) all = all.concat(data);
              if (!data || data.length < pageSize) break;
              from += pageSize;
          }
          return all;
      };

      const [missionsData, clientTablesRes, providerTablesRes, clientsRes, providersRes] = await Promise.all([
          fetchAllPages(),
          supabase.from('client_price_tables').select('*'),
          supabase.from('provider_cost_tables').select('*'),
          supabase.from('clients').select('*'),
          supabase.from('providers').select('name, trading_name')
      ]);

      setDbStatus('ok');

      if (clientTablesRes.data) setClientTables(clientTablesRes.data as any);
      if (providerTablesRes.data) setProviderTables(providerTablesRes.data as any);
      if (clientsRes.data) setClientsData(clientsRes.data as any);

      if (missionsData) {
          const vehicleIds = [...new Set(missionsData.map((m: any) => m.vehicle_id).filter((id: any) => id))];
          const clientVehicleIds = [...new Set(missionsData.map((m: any) => m.client_vehicle).filter((id: any) => id))];
          
          const agentNames = [...new Set(missionsData.flatMap((m: any) => [m.agent1, m.agent2]).filter(n => n && n !== '---'))];

          const [vehiclesRes, clientVehiclesRes, agentsRes] = await Promise.all([
              vehicleIds.length > 0 ? supabase.from('vehicles').select('*').in('id', vehicleIds) : { data: [] },
              clientVehicleIds.length > 0 ? supabase.from('client_vehicles').select('id, plate, model, brand, color').in('id', clientVehicleIds) : { data: [] },
              agentNames.length > 0 ? supabase.from('agents').select('name, phone').in('name', agentNames) : { data: [] }
          ]);

          const vehicleMap = (vehiclesRes.data || []).reduce((acc: any, v: any) => ({ ...acc, [v.id]: v }), {});
          const clientVehicleMap = (clientVehiclesRes.data || []).reduce((acc: any, v: any) => ({ ...acc, [v.id.toString()]: v }), {});
          
          const phonesMap = (agentsRes.data || []).reduce((acc: any, a: any) => ({ ...acc, [a.name]: a.phone }), {});
          setAgentPhonesMap(phonesMap);
          
          const clientNameMap = (clientsRes.data || []).reduce((acc: any, c: any) => {
              if (c.trading_name && c.trading_name.trim() !== '') acc[(c.name || '').trim().toUpperCase()] = c.trading_name.trim();
              return acc;
          }, {});

          const providerNameMap = (providersRes.data || []).reduce((acc: any, p: any) => {
              if (p.trading_name && p.trading_name.trim() !== '') acc[(p.name || '').trim().toUpperCase()] = p.trading_name.trim();
              return acc;
          }, {});

            const mapped: Mission[] = missionsData.map((m: any) => {
                const clientKey = m.client ? (m.client || '').trim().toUpperCase() : '';
                const providerKey = m.provider ? (m.provider || '').trim().toUpperCase() : '';
                const resolvedVehicle = vehicleMap[m.vehicle_id];
                let displayVehicleId = m.vehicle_id;
                if (resolvedVehicle) displayVehicleId = resolvedVehicle.plate;
  
                const fallbackDate = m.last_update || m.created_at || new Date().toISOString();
                const cargoId = m.client_vehicle?.toString();
                const cargoVehicle = cargoId ? (clientVehicleMap[cargoId] || { plate: `ID: ${cargoId}`, model: 'VEÍCULO NÃO LOCALIZADO' }) : null;
  
                return { 
                    ...m, 
                    client: clientNameMap[clientKey] || m.client, 
                    provider: providerNameMap[providerKey] || m.provider,
                    originalClientName: m.client, 
                    clientVehicle: cargoVehicle, 
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
                    start_time: m.start_time, 
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
                    toll_value: m.toll_value,
                    toll_value_provider: m.toll_value_provider,
                    billing_approved: m.billing_approved,
                    billing_verified_by: m.billing_verified_by
                };
            });
            setAllMissions(mapped);
            const portalMissions = mapped.filter(m => m.status === MissionStatus.SOLICITED && (m.currentLocation || '').includes('Solicitação via Portal'));
            setSolicitationCount(portalMissions.length);
            setAccidentCount(portalMissions.filter(m => (m.currentLocation || '').includes('ACIDENTE')).length);

            const completedIds = mapped.filter(m => m.status === MissionStatus.COMPLETED && !m.billing_approved).map(m => m.id);
            if (completedIds.length > 0) {
                const { data: approvalLogs } = await supabase.from('system_logs')
                    .select('entity_id, action_type, details, created_at')
                    .eq('entity', 'BillingApproval')
                    .in('entity_id', completedIds);
                if (approvalLogs) {
                    const map: Record<string, { stage: string; date: string }[]> = {};
                    approvalLogs.forEach((l: any) => {
                        if (!map[l.entity_id]) map[l.entity_id] = [];
                        try {
                            const parsed = JSON.parse(l.details);
                            map[l.entity_id].push({ stage: parsed.stage || l.action_type, date: parsed.date || l.created_at });
                        } catch {
                            map[l.entity_id].push({ stage: l.action_type, date: l.created_at });
                        }
                    });
                    setApprovalMap(map);
                }
            }

            const allIds = mapped.map(m => m.id);
            if (allIds.length > 0) {
                const batchSize = 200;
                const evMap: Record<string, { url: string; uploadedBy: string; uploadedAt: string }[]> = {};
                for (let i = 0; i < allIds.length; i += batchSize) {
                    const batch = allIds.slice(i, i + batchSize);
                    const { data: evidenceLogs } = await supabase.from('system_logs')
                        .select('entity_id, details')
                        .eq('entity', 'MissionEvidence')
                        .in('entity_id', batch);
                    if (evidenceLogs) {
                        evidenceLogs.forEach((l: any) => {
                            if (!evMap[l.entity_id]) evMap[l.entity_id] = [];
                            try {
                                const parsed = JSON.parse(l.details);
                                evMap[l.entity_id].push({ url: parsed.publicUrl || '', uploadedBy: parsed.uploadedBy || '', uploadedAt: parsed.uploadedAt || '' });
                            } catch {}
                        });
                    }
                }
                setEvidenceMap(evMap);
            }

            const logMap: Record<string, MissionLog> = {};
            const logBatchSize = 200;
            for (let i = 0; i < allIds.length; i += logBatchSize) {
                const batch = allIds.slice(i, i + logBatchSize);
                const { data: lastLogs } = await supabase
                    .from('mission_logs')
                    .select('*')
                    .in('mission_id', batch)
                    .order('created_at', { ascending: false });
                if (lastLogs) {
                    lastLogs.forEach((l: any) => {
                        if (!logMap[l.mission_id]) logMap[l.mission_id] = l as MissionLog;
                    });
                }
            }
            setLastLogMap(logMap);
        }
      } catch (error: any) {
        console.error('Error fetching missions:', error.message || error);
        setDbStatus('error');
        showNotification('Erro', `Falha ao carregar monitoramento`, 'error');
      } finally {
        if (!silent) setIsLoading(false);
      }
    }, [showNotification, currentUser, isCommercial, isRestrictedClientView]);
  
    useEffect(() => {
      if (currentUser) {
          fetchMissions();
          const channel = supabase
            .channel('missions-changes')
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'missions' },
              (payload: any) => {
                if (payload.eventType === 'INSERT' && payload.new && payload.new.status === 'Solicitada' && !isRestrictedClientView) {
                  const location = payload.new.current_location || '';
                  const isAccident = location.includes('ACIDENTE');
                  showNotification(
                    isAccident ? 'ACIDENTE - Nova Solicitação!' : 'Nova Solicitação de Cliente!',
                    `OS ${payload.new.id} - ${payload.new.client}`,
                    isAccident ? 'error' : 'info'
                  );
                }
                fetchMissions(true);
              }
            )
            .subscribe();
          const broadcastChannel = supabase
            .channel('mission-updates')
            .on('broadcast', { event: 'mission_updated' }, ({ payload }) => {
              if (payload && payload.updatedBy !== currentUser.name) {
                showNotification(
                  `OS ${payload.missionId} Atualizada`,
                  `${payload.changeType} — por ${payload.updatedBy}`,
                  'info'
                );
              }
            })
            .subscribe();
          const interval = setInterval(() => fetchMissions(true), 120000);
          const handleExternalRefresh = () => fetchMissions(true);
          window.addEventListener('refreshMissions', handleExternalRefresh);
          return () => {
            supabase.removeChannel(channel);
            supabase.removeChannel(broadcastChannel);
            clearInterval(interval);
            window.removeEventListener('refreshMissions', handleExternalRefresh);
          };
      }
    }, [fetchMissions, currentUser, showNotification, isRestrictedClientView]);
  
    const periodMissions = useMemo(() => {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        if (viewPeriod === 'TODAY') {
            return allMissions.filter(m => {
                const isOperational = [MissionStatus.ORIGIN, MissionStatus.IN_TRANSIT].includes(m.status as MissionStatus);
                if (isOperational) return true;

                const mDate = new Date(m.startTime || m.createdAt);
                return mDate >= todayStart && mDate <= todayEnd;
            });
        }
  
        return allMissions.filter(m => {
            const mDate = new Date(m.startTime || m.createdAt);
            
            if (viewPeriod === 'YESTERDAY') {
                const yesterdayStart = new Date(todayStart);
                yesterdayStart.setDate(todayStart.getDate() - 1);
                const yesterdayEnd = new Date(todayEnd);
                yesterdayEnd.setDate(todayEnd.getDate() - 1);
                return mDate >= yesterdayStart && mDate <= yesterdayEnd;
            }
            if (viewPeriod === 'WEEK') {
                const weekStart = new Date(todayStart);
                weekStart.setDate(todayStart.getDate() - 7);
                return mDate >= weekStart && mDate <= todayEnd;
            }
            if (viewPeriod === 'MONTH') {
                const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
                const monthEnd = new Date(todayStart.getFullYear(), todayStart.getMonth() + 1, 0, 23, 59, 59, 999);
                return mDate >= monthStart && mDate <= monthEnd;
            }
            if (viewPeriod === 'YEAR') {
                const yearStart = new Date(todayStart.getFullYear(), 0, 1);
                const yearEnd = new Date(todayStart.getFullYear(), 11, 31, 23, 59, 59, 999);
                return mDate >= yearStart && mDate <= yearEnd;
            }
            if (viewPeriod === 'CUSTOM') {
                if (!customStartDate || !customEndDate) return true;
                const start = new Date(customStartDate + 'T00:00:00');
                const end = new Date(customEndDate + 'T23:59:59');
                return mDate >= start && mDate <= end;
            }
            if (viewPeriod === 'ALL') {
                const isTerminal = [MissionStatus.COMPLETED, MissionStatus.CANCELLED, MissionStatus.REFUSED].includes(m.status as MissionStatus);
                return !isTerminal;
            }
            return true;
        });
    }, [allMissions, viewPeriod, customStartDate, customEndDate]);

    const analyticsMissions = useMemo(() => {
        return periodMissions;
    }, [periodMissions]);

    // FILTER LOGIC:
    // 1. Calculate the base list after applying "Toggle" filters (AND logic).
    // 2. Use this base list for counting (Status Cards).
    // 3. Apply the specific "Status Tab" filter on top for the list view.
    
    const parentMissionIds = useMemo(() => {
        const ids = new Set<string>();
        const source = allMissions.length > 0 ? allMissions : periodMissions;
        for (const m of source) {
            if (m.is_same_os && m.parent_mission_id) {
                ids.add(m.parent_mission_id);
            }
        }
        return ids;
    }, [allMissions, periodMissions]);

    const filteredBySpecialCriteria = useMemo(() => {
        const isSearching = searchTerm && searchTerm.trim().length > 0;
        const hasActiveSpecialFilters = showPendingOnly || showTomorrowOnly || showMyApprovalOnly || showNegativeMarginOnly;
        const isOsFiltering = osFilterTerm && osFilterTerm.trim().length > 0;

        const sourceMissions = (isOsFiltering || isSearching) ? allMissions : (showTomorrowOnly ? allMissions : periodMissions);

        return sourceMissions.filter(mission => {
            if (isOsFiltering) {
                const osLower = osFilterTerm.toLowerCase().trim();
                const missionIdLower = (mission.id || '').toLowerCase();
                const matchesOs = missionIdLower.includes(osLower) || missionIdLower.replace('gtm-', '').includes(osLower.replace('gtm-', ''));
                if (!matchesOs) return false;
            }

            if (isSearching) {
                const searchLower = searchTerm.toLowerCase().trim();
                const matchesSearch = 
                    (mission.id || '').toLowerCase().includes(searchLower) || 
                    (mission.client || '').toLowerCase().includes(searchLower) || 
                    String(mission.vehicleId || '').toLowerCase().includes(searchLower) || 
                    (mission.provider || '').toLowerCase().includes(searchLower) || 
                    (mission.clientVehicle?.plate || '').toLowerCase().includes(searchLower) || 
                    (mission.driver_name || '').toLowerCase().includes(searchLower);
                if (!matchesSearch) return false;
            }

            if (showPendingOnly && !isMissionPending(mission)) {
                return false;
            }

            if (showTomorrowOnly) {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(0, 0, 0, 0);
                const mDate = new Date(mission.startTime || mission.createdAt).getTime();
                const isInitialStatus = [MissionStatus.SCHEDULED, MissionStatus.SOLICITED, MissionStatus.DOCUMENTATION].includes(mission.status as MissionStatus);
                if (mDate < tomorrow.getTime() || !isInitialStatus) return false;
            }

            if (showNegativeMarginOnly) {
                const rev = mission.revenue_value || 0;
                const cost = mission.is_same_os ? 0 : (mission.cost_value || 0);
                const resultado = rev - cost;
                if (resultado >= 0) return false;
            }

            return true;
        });
    }, [allMissions, periodMissions, searchTerm, osFilterTerm, showPendingOnly, showTomorrowOnly, showMyApprovalOnly, showNegativeMarginOnly, parentMissionIds]);

    // Status Counts based on the FILTERED set (to sync counters with visible criteria)
    const statusCounts = useMemo(() => {
        return filteredBySpecialCriteria.reduce((acc: any, m: any) => {
            acc[m.status] = (acc[m.status] || 0) + 1;
            return acc;
        }, {});
    }, [filteredBySpecialCriteria]);

    // Total Count also based on filtered set
    const totalVolumeCount = useMemo(() => {
        return filteredBySpecialCriteria.length;
    }, [filteredBySpecialCriteria]);
  
    // Counts for Badge Indicators (Global context)
    const negativeMarginCount = useMemo(() => {
        const source = periodMissions.length > 0 ? periodMissions : allMissions;
        return source.filter(m => {
            const rev = m.revenue_value || 0;
            const cost = m.is_same_os ? 0 : (m.cost_value || 0);
            const resultado = rev - cost;
            return resultado < 0;
        }).length;
    }, [periodMissions, allMissions, parentMissionIds]);
    const pendingCount = useMemo(() => allMissions.filter(m => isMissionPending(m)).length, [allMissions]);
    const tomorrowCount = useMemo(() => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const tomorrowTs = tomorrow.getTime();
        return allMissions.filter(m => {
            const mDate = new Date(m.startTime || m.createdAt).getTime();
            const isFutureDate = mDate >= tomorrowTs;
            const isInitialStatus = [MissionStatus.SCHEDULED, MissionStatus.SOLICITED, MissionStatus.DOCUMENTATION].includes(m.status as MissionStatus);
            return isFutureDate && isInitialStatus;
        }).length;
    }, [allMissions]);

    const DATE_APPROVAL_RULE = new Date('2026-03-03T00:00:00').getTime();

    const myApprovalStage = useMemo(() => {
        if (!currentUser) return null;
        const nameLower = (currentUser.name || '').toLowerCase();
        const roleLower = (currentUser.role || '').toLowerCase();
        if (nameLower.includes('daniel')) return 'auditor';
        if (nameLower.includes('barbara') || nameLower.includes('bárbara') || roleLower === 'administrador') return 'financeiro';
        if (nameLower.includes('thiago') || roleLower === 'diretoria') return 'diretoria';
        return null;
    }, [currentUser]);

    const eligibleApprovalMissions = useMemo(() => {
        return allMissions.filter(m => {
            if (m.status !== MissionStatus.COMPLETED || m.billing_approved) return false;
            const mDate = new Date(m.startTime || m.createdAt).getTime();
            return mDate >= DATE_APPROVAL_RULE;
        });
    }, [allMissions]);

    const pendingByStage = useMemo(() => {
        const auditor: Mission[] = [];
        const financeiro: Mission[] = [];
        const diretoria: Mission[] = [];
        eligibleApprovalMissions.forEach(m => {
            const stages = (approvalMap[m.id] || []).map(s => s.stage);
            if (!stages.includes('auditor')) auditor.push(m);
            if (stages.includes('auditor') && !stages.includes('financeiro')) financeiro.push(m);
            if (!stages.includes('diretoria')) diretoria.push(m);
        });
        return { auditor, financeiro, diretoria };
    }, [eligibleApprovalMissions, approvalMap]);

    const myApprovalMissions = useMemo(() => {
        if (!myApprovalStage) return [];
        if (myApprovalStage === 'diretoria') {
            const allIds = new Set([
                ...pendingByStage.auditor.map(m => m.id),
                ...pendingByStage.financeiro.map(m => m.id),
                ...pendingByStage.diretoria.map(m => m.id),
            ]);
            return eligibleApprovalMissions.filter(m => allIds.has(m.id));
        }
        return pendingByStage[myApprovalStage] || [];
    }, [myApprovalStage, pendingByStage, eligibleApprovalMissions]);

    const myApprovalCount = myApprovalMissions.length;
  
    const filteredMissions = useMemo(() => {
        const isSearching = searchTerm && searchTerm.trim().length > 0;
        const isOsFiltering = osFilterTerm && osFilterTerm.trim().length > 0;
        const hasActiveSpecialFilters = showPendingOnly || showTomorrowOnly || showMyApprovalOnly || showNegativeMarginOnly;

        if (showMyApprovalOnly && myApprovalMissions.length > 0) {
            return myApprovalMissions;
        }

        let baseList = filteredBySpecialCriteria;

        return baseList.filter(mission => {
            if (isOsFiltering) return true;
            if (filterStatus !== 'ALL') {
                return mission.status === filterStatus;
            } else {
                if (!isSearching && !hasActiveSpecialFilters) {
                     const hiddenStatuses = [
                         MissionStatus.COMPLETED, 
                         MissionStatus.CANCELLED, 
                         MissionStatus.REFUSED,
                         MissionStatus.PENDING 
                     ];
                     if (hiddenStatuses.includes(mission.status as MissionStatus)) return false;
                }
            }
            return true;
        });
    }, [filteredBySpecialCriteria, filterStatus, searchTerm, osFilterTerm, showPendingOnly, showTomorrowOnly, showMyApprovalOnly, showNegativeMarginOnly, myApprovalMissions]);
  
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
        if (m.status === MissionStatus.SCHEDULED && m.startTime) {
            const scheduledTime = new Date(m.startTime).getTime();
            if (nowTime > scheduledTime) return Math.max(0, Math.floor((nowTime - scheduledTime) / 60000));
        }
        if (m.status === MissionStatus.SOLICITED || m.status === MissionStatus.DOCUMENTATION) {
            if (m.startTime) {
                const scheduledTime = new Date(m.startTime).getTime();
                if (nowTime < scheduledTime) return 0;
                return Math.max(0, Math.floor((nowTime - scheduledTime) / 60000));
            }
            return Math.max(0, Math.floor((nowTime - lastUpdateTime) / 60000));
        }
        return 0; 
    }, []);

    const getLastUpdateTimestamp = useCallback((m: Mission) => {
        return new Date(m.lastUpdate || m.createdAt || 0).getTime();
    }, []);
  
    const sortedMissions = useMemo(() => {
        return [...filteredMissions].sort((a, b) => {
            const delayA = getDelayMinutes(a);
            const delayB = getDelayMinutes(b);

            const isOverdue = (m: Mission, delay: number) => {
                const status = m.status as MissionStatus;
                if (status === MissionStatus.SCHEDULED || status === MissionStatus.SOLICITED || status === MissionStatus.DOCUMENTATION) {
                    return m.startTime && new Date().getTime() > new Date(m.startTime).getTime();
                }
                return false;
            };

            const overdueA = isOverdue(a, delayA);
            const overdueB = isOverdue(b, delayB);
            if (overdueA !== overdueB) return overdueA ? -1 : 1;
            if (overdueA && overdueB) return delayB - delayA;

            const getAgingTier = (m: Mission, delay: number) => {
                const status = m.status as MissionStatus;
                const isActive = status === MissionStatus.IN_TRANSIT || status === MissionStatus.ORIGIN;
                if (!isActive) return 0;
                if (delay >= 60) return 3;
                if (delay >= 30) return 2;
                return 1;
            };

            const tierA = getAgingTier(a, delayA);
            const tierB = getAgingTier(b, delayB);

            if (tierA !== tierB) return tierB - tierA;

            const getStatusPriority = (m: Mission) => {
                const status = m.status as MissionStatus;
                if (status === MissionStatus.IN_TRANSIT) return 1000;
                if (status === MissionStatus.ORIGIN) return 900;
                if (status === MissionStatus.SCHEDULED) return 800;
                if (status === MissionStatus.DOCUMENTATION) return 700;
                if (status === MissionStatus.SOLICITED) return 600;
                return 0;
            };

            const spA = getStatusPriority(a);
            const spB = getStatusPriority(b);
            if (spA !== spB) return spB - spA;

            if (delayA !== delayB) return delayB - delayA;

            const tsA = getLastUpdateTimestamp(a);
            const tsB = getLastUpdateTimestamp(b);
            return tsA - tsB;
        });
    }, [filteredMissions, getDelayMinutes, getLastUpdateTimestamp]);
  
    const handleOpenUpdateModal = (mission: Mission) => { setSelectedMission(mission); setIsUpdateModalOpen(true); };
    const handleUpdateSuccess = (reportText?: string) => { setIsUpdateModalOpen(false); setSelectedMission(null); fetchMissions(true); if (reportText) handleCopyToClipboard(reportText, 'relatorio', true); };
    const handleOpenStatusModal = async (mission: Mission) => { setMissionForStatusView(mission); setIsStatusModalOpen(true); const { data } = await supabase.from('mission_logs').select('*').eq('mission_id', mission.id).order('created_at', { ascending: false }); if (data) setMissionLogs(data as MissionLog[]); };
    const handleOpenFinancialModal = (mission: Mission) => { setMissionForFinancials(mission); setIsFinancialModalOpen(true); };
    const handleOpenPrintModal = (mission: Mission) => { setMissionForPrint(mission); setIsPrintModalOpen(true); };
    const handleDeleteClick = (mission: Mission) => { setMissionToDelete(mission); setDeletePassword(''); setIsDeleteModalOpen(true); };
    
    const handleCopyMission = async (mission: Mission) => {
        const dateObj = new Date(mission.startTime || mission.createdAt);
        const dateStr = dateObj.toLocaleDateString('pt-BR');
        const timeStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const formatFL = (name?: string) => { 
            if (!name || name === '---' || name === '') return 'N/A'; 
            const parts = name.trim().split(' '); 
            return parts.length > 2 ? `${parts[0]} ${parts[parts.length-1]}`.toUpperCase() : name.toUpperCase(); 
        };
        const fullLocationRaw = mission.currentLocation || "AGUARDANDO INÍCIO";
        const locationParts = fullLocationRaw.split('|');
        const addressPart = locationParts.length > 1 ? locationParts[1].trim() : locationParts[0].trim();
        const citySplit = addressPart.split('-');
        const cityField = citySplit.length > 1 ? citySplit[citySplit.length-2].split(',').pop()?.trim() + ' - ' + citySplit[citySplit.length-1].trim() : addressPart;
        const text = `*MONITORAMENTO GRUPO TMSEG*
*OS:* ${mission.id} | *STATUS:* ${mission.status.toUpperCase()}

🗓 *DATA:* ${dateStr} *HORA:* ${timeStr}
🛡 *OPERAÇÃO:* ${mission.mission_type?.toUpperCase() || 'CARACTERIZADA'}
🏢 *CLIENTE:* ${mission.client}

📍 *ORIGEM:* ${mission.origin || 'N/A'}
🏁 *DESTINO:* ${mission.destination || 'N/A'}

🚛 *VEÍCULO:* ${mission.clientVehicle?.plate || 'N/A'} (${mission.clientVehicle?.model || 'N/D'})
👤 *MOTORISTA:* ${formatFL(mission.driver_name)}
📞 *CONTATO:* ${mission.driver_phone || 'N/A'}

🚔 *VIATURA:* ${mission.vehicleId || 'N/A'}
👮 *AGENTE 01:* ${formatFL(mission.agent1)}
👮 *AGENTE 02:* ${formatFL(mission.agent2)}

*PROGRESSO DA MISSÃO:* ${Math.floor(mission.progress || 0)}%
📣 *OCORRÊNCIA:* ${locationParts[0].trim().toUpperCase()}
🏙️ *LOCALIZAÇÃO:* ${cityField.toUpperCase()}
🗾 *LINK DO GOOGLE:* ${mission.mapLink || 'N/A'}`;
        
        await handleCopyToClipboard(text, (mission.id || 'OS'), true);
    };
    
    const [isSendingEmail, setIsSendingEmail] = useState('');
    const handleCopyEmail = async (mission: Mission) => {
        setIsSendingEmail(mission.id);
        try {
            const res = await fetch('/api/email/mission-resend-client', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ missionId: mission.id, senderName: JSON.parse(localStorage.getItem('userData') || '{}').name || undefined })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showNotification('E-mail Enviado', data.message, 'success');
            } else {
                showNotification('Erro', data.error || 'Falha ao enviar e-mail', 'error');
            }
        } catch (err: any) {
            showNotification('Erro', 'Falha na comunicação: ' + (err.message || ''), 'error');
        } finally {
            setIsSendingEmail('');
        }
    };
    const handleCopyToClipboard = async (text: string, id: string, isReport = false) => { try { await navigator.clipboard.writeText(text); if(isReport) showNotification('Sucesso', 'Relatório WhatsApp Copiado!', 'success'); else { setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); } } catch (err) { console.error(err); } };
    const confirmDelete = async () => { if (!missionToDelete) return; setIsDeleting(true); try { const { error } = await supabase.from('missions').update({ status: 'Cancelada' }).eq('id', missionToDelete.id).select('id').single(); if (error) throw error; await logAction('UPDATE', 'Mission', missionToDelete.id, `Missão cancelada por ${currentUser?.name}`); showNotification('Sucesso', 'Missão cancelada com sucesso. O registro permanece no banco.', 'success'); setIsDeleteModalOpen(false); setMissionToDelete(null); fetchMissions(true); } catch (error: any) { showNotification('Erro', error.message, 'error'); } finally { setIsDeleting(false); } };
    const handleSearchHistory = async () => { if (!searchHistoryId.trim()) return; let sid = searchHistoryId.trim().toUpperCase(); if (!sid.startsWith('GTM-') && !isNaN(Number(sid))) sid = `GTM-${sid.padStart(4, '0')}`; setHistoryMissionId(sid); setIsHistoryModalOpen(true); };
    const handleViewHistory = (mission: Mission) => { setHistoryMissionId(mission.id); setIsHistoryModalOpen(true); };
  
    return (
      <div className="space-y-6 animate-fade-in pb-20 relative">
        <div className={`p-6 rounded-xl shadow-sm border flex flex-col xl:flex-row items-center justify-between gap-6 ${isCevaClient ? 'bg-[#152c54] border-[#152c54]' : 'bg-white border-gray-200'}`}>
          <div className="xl:w-[350px] shrink-0">
            <div className="flex items-center gap-3">
              <span className={`w-1.5 h-6 rounded-full ${isCevaClient ? 'bg-[#e81818]' : 'bg-red-700'}`}></span>
              <h2 className={`text-xl font-bold ${isCevaClient ? 'text-white' : 'text-gray-900'}`}>Monitoramento de Missões</h2>
            </div>
            {dbStatus === 'ok' && !isRestrictedClientView && ( <div className={`flex items-center gap-2 text-[10px] font-bold px-2 py-1 rounded w-fit border mt-2 ml-4.5 ${isCevaClient ? 'text-green-300 bg-green-900/30 border-green-700' : 'text-green-700 bg-green-50 border-green-200'}`}><Database size={12} /> Realtime Sync</div> )}
          </div>


          {!isRestrictedClientView && (
          <div className="flex-1 w-full max-w-[450px]">
             <DailyGoalThermometer 
                viewPeriod={viewPeriod} 
                customStartDate={customStartDate} 
                customEndDate={customEndDate}
                missions={allMissions}
                clientTables={clientTables}
                providerTables={providerTables}
                clientsData={clientsData}
                onRefreshMissions={() => fetchMissions(true)}
             />
          </div>
          )}

          <div className="flex flex-wrap gap-2 items-center justify-end xl:flex-1">
                {!isRestrictedClientView && ( <div className="flex items-center gap-2 bg-indigo-50 p-1.5 rounded-lg border border-indigo-200"><input type="text" className="bg-transparent text-xs font-bold text-indigo-900 placeholder-indigo-400 outline-none w-32 pl-2" placeholder="Filtrar OS..." value={osFilterTerm} onChange={(e) => setOsFilterTerm(e.target.value)} data-testid="input-os-filter" />{osFilterTerm && <button onClick={() => setOsFilterTerm('')} className="p-1 bg-indigo-600 text-white rounded hover:bg-indigo-700" data-testid="button-clear-os-filter"><X size={14} /></button>}</div> )}
                <button onClick={() => setShowFleetMap(!showFleetMap)} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-[11px] font-bold uppercase transition-all border ${showFleetMap ? (isCevaClient ? 'bg-[#e81818] text-white border-[#e81818] shadow-md' : 'bg-indigo-600 text-white border-indigo-700 shadow-md') : (isCevaClient ? 'bg-white/10 text-white border-white/30 hover:bg-white/20' : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50')}`}><Globe size={14} /> Mapa</button>
                {!isRestrictedClientView && ( <button onClick={() => setShowAnalyticsDash(!showAnalyticsDash)} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-[11px] font-bold uppercase transition-all border ${showAnalyticsDash ? 'bg-blue-600 text-white border-blue-700 shadow-md' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}><BarChart4 size={14} /> Analytics</button> )}
                {isRestrictedClientView && ( <button onClick={() => { setShowClientDash(!showClientDash); if (!showClientDash) { setShowClientReports(false); setShowClientCommittee(false); } }} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-[11px] font-bold uppercase transition-all border ${showClientDash ? (isCevaClient ? 'bg-[#e81818] text-white border-[#e81818] shadow-md' : 'bg-red-700 text-white border-red-800 shadow-md') : (isCevaClient ? 'bg-white/10 text-white border-white/30 hover:bg-white/20' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50')}`} data-testid="button-client-dashboard"><BarChart4 size={14} /> Painel</button> )}
                {isRestrictedClientView && ( <button onClick={() => { setShowClientReports(!showClientReports); if (!showClientReports) { setShowClientDash(false); setShowClientCommittee(false); } }} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-[11px] font-bold uppercase transition-all border ${showClientReports ? (isCevaClient ? 'bg-[#e81818] text-white border-[#e81818] shadow-md' : 'bg-red-700 text-white border-red-800 shadow-md') : (isCevaClient ? 'bg-white/10 text-white border-white/30 hover:bg-white/20' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50')}`} data-testid="button-client-reports"><Activity size={14} /> Relatórios</button> )}
                {isRestrictedClientView && ( <button onClick={() => { setShowClientCommittee(!showClientCommittee); if (!showClientCommittee) { setShowClientDash(false); setShowClientReports(false); } }} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-[11px] font-bold uppercase transition-all border ${showClientCommittee ? (isCevaClient ? 'bg-[#e81818] text-white border-[#e81818] shadow-md' : 'bg-red-700 text-white border-red-800 shadow-md') : (isCevaClient ? 'bg-white/10 text-white border-white/30 hover:bg-white/20' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50')}`} data-testid="button-client-committee"><FileSearch size={14} /> Comitê</button> )}
                <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-200"><Calendar size={14} className="text-gray-500 ml-1" /><select value={viewPeriod} onChange={(e) => setViewPeriod(e.target.value)} className="bg-transparent border-none text-[11px] font-bold text-gray-700 outline-none cursor-pointer uppercase focus:ring-0"><option value="TODAY">HOJE</option><option value="YESTERDAY">ONTEM</option><option value="WEEK">SEMANA</option><option value="MONTH">MÊS</option><option value="YEAR">ANO</option><option value="CUSTOM">PERSONALIZADO</option><option value="ALL">TOTAL ABERTOS</option></select></div>
                {viewPeriod === 'CUSTOM' && (
                    <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                        <input type="date" className="bg-transparent border-none text-[11px] font-bold text-gray-700 outline-none cursor-pointer" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} />
                        <span className="text-gray-400 text-xs">até</span>
                        <input type="date" className="bg-transparent border-none text-[11px] font-bold text-gray-700 outline-none cursor-pointer" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} />
                    </div>
                )}
                {isRestrictedClientView && resolvedClientName && (
                    <button onClick={() => setShowClientRequestModal(true)} className={`flex items-center gap-2 text-white px-4 py-2.5 rounded-lg text-[11px] font-black transition-all shadow-md uppercase ${isCevaClient ? 'bg-[#e81818] hover:bg-[#c01515]' : 'bg-red-700 hover:bg-red-800'}`} data-testid="button-client-new-request">
                        <Plus size={16} /> Solicitar Escolta
                    </button>
                )}
                {!isRestrictedClientView && accidentCount > 0 && (
                    <button onClick={() => { setFilterStatus(MissionStatus.SOLICITED); }} className="relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-[11px] font-black uppercase border-2 transition-all bg-red-600 text-white border-red-700 shadow-lg animate-pulse" data-testid="button-accident-badge">
                        <AlertOctagon size={16} className="text-white" /> ACIDENTE
                        <span className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-[10px] bg-white text-red-700 font-black min-w-[20px] text-center shadow-md ring-2 ring-red-600">{accidentCount}</span>
                    </button>
                )}
                {!isRestrictedClientView && solicitationCount > 0 && (
                    <button onClick={() => { setFilterStatus(MissionStatus.SOLICITED); }} className={`relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-[11px] font-black uppercase border transition-all shadow-sm hover:bg-pink-100 ${accidentCount > 0 ? 'bg-pink-50 text-pink-800 border-pink-300' : 'bg-pink-50 text-pink-800 border-pink-300 animate-pulse'}`} data-testid="button-solicitations-badge">
                        <Mail size={14} className="text-pink-600" /> Solicitações
                        <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full text-[9px] bg-pink-600 text-white font-black min-w-[18px] text-center">{solicitationCount}</span>
                    </button>
                )}
                {onNewMission && !isRestrictedClientView && ( <button onClick={onNewMission} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-black px-4 py-2.5 rounded-lg text-[11px] font-black transition-all shadow-md uppercase"> <Plus size={16} /> Nova Missão </button> )}
          </div>
        </div>
  
        {!isRestrictedClientView && showAnalyticsDash && (
            <ExecutiveDashboard 
                missions={allMissions} 
                isDirector={isDirector} 
                clientTables={clientTables} 
                providerTables={providerTables} 
                clientsData={clientsData}
                currentTime={currentTime}
                onOpenMission={handleOpenFinancialModal}
                onRefreshMissions={() => fetchMissions(true)}
                viewPeriod={viewPeriod}
                customStartDate={customStartDate}
                customEndDate={customEndDate}
            />
        )}
        {isRestrictedClientView && showClientDash && (
            <ClientExecutiveDashboard missions={allMissions} />
        )}
        {isRestrictedClientView && showClientReports && (
            <ClientReportsTab missions={allMissions} clientTables={clientTables} providerTables={providerTables} onViewReport={(m: Mission) => { setMissionForFullReport(m); setIsFullReportOpen(true); }} />
        )}
        {isRestrictedClientView && showClientCommittee && (
            <ClientCommitteePresentation missions={allMissions} clientName={resolvedClientName || undefined} />
        )}
  
        {showFleetMap && isLoaded && !loadError && (
            <div className="bg-white p-2 rounded-xl shadow-lg border border-gray-200 mb-6 animate-in slide-in-from-top-4">
                <div className="p-3 border-b border-gray-100 flex justify-between items-center mb-2"><h3 className="text-sm font-bold text-indigo-900 uppercase flex items-center gap-2"><Globe size={16} /> Frota Localizada ({activeMapMissions.length})</h3><button onClick={() => setShowFleetMap(false)} className="text-gray-400 hover:text-red-500"><XCircle size={18}/></button></div>
                <GoogleMap mapContainerStyle={mapContainerStyle} center={activeMapMissions.length > 0 ? activeMapMissions[0].position : defaultMapCenter} zoom={activeMapMissions.length > 0 ? 6 : 4} options={{ disableDefaultUI: true, zoomControl: true }}>
                  {activeMapMissions.map(m => ( 
                    <Marker 
                      key={m.id} 
                      position={m.position} 
                      icon={{ url: m.status === MissionStatus.IN_TRANSIT ? 'https://maps.google.com/mapfiles/ms/icons/green-dot.png' : 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png' }} 
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

        {loadError && !isRestrictedClientView && (
            <div className="bg-red-50 p-6 rounded-2xl border border-red-200 text-red-700 flex flex-col md:flex-row items-center gap-6 mb-6 animate-in zoom-in-95">
                <div className="p-4 bg-white rounded-full shadow-md text-red-600"><AlertTriangle size={32} /></div>
                <div className="flex-1">
                    <p className="font-black uppercase text-sm tracking-tight">Erro na Chave de Mapa (Google Cloud)</p>
                    <p className="text-xs font-medium text-red-800/80 leading-relaxed max-w-2xl mt-1">
                        A chave de API do projeto <strong>Sistema TMSEGo</strong> foi recusada. Verifique se faturamento (Cartão de Crédito) está ativo no Google Cloud Console.
                    </p>
                </div>
                <div className="flex flex-col gap-2">
                    <a href="https://console.cloud.google.com/google/maps-apis/credentials" target="_blank" rel="noreferrer" className="px-5 py-2 bg-red-700 text-white rounded-xl font-black text-[10px] uppercase shadow-lg hover:bg-red-800 transition-all flex items-center gap-2"><ExternalLink size={14}/> Console Google</a>
                </div>
            </div>
        )}
  
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-10 gap-1.5">
            {/* BOX TOTAL: Reflete o volume absoluto do período conforme solicitado */}
            <StatCard icon={Activity} title="Total" value={totalVolumeCount} bgColor="bg-gray-800" loading={isLoading} isActive={filterStatus === 'ALL' && !showPendingOnly && !showTomorrowOnly && !showMyApprovalOnly && !showNegativeMarginOnly} onClick={() => { setFilterStatus('ALL'); setShowPendingOnly(false); setShowTomorrowOnly(false); setShowMyApprovalOnly(false); setShowNegativeMarginOnly(false); }} />
            {STATUS_CONFIG.filter(s => isRestrictedClientView ? s.id !== MissionStatus.PENDING : true).map((status) => ( <StatCard key={status.id} icon={status.icon} title={status.label} value={statusCounts[status.id] || 0} bgColor={status.color} loading={isLoading} isActive={filterStatus === status.id} onClick={() => { setFilterStatus(status.id); }} /> ))}
        </div>
  
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden sticky top-0 z-20">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50 backdrop-blur-sm flex flex-col md:flex-row gap-4 justify-between items-center">
            <div className="flex items-center gap-3 flex-1 w-full md:w-auto">
                <div className="relative flex-1 max-w-md">
                    <input type="text" placeholder="OS, Cliente, Placa, Motorista..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    <Search size={18} className="absolute left-3.5 top-3 text-gray-400" />
                </div>
          
                {!isRestrictedClientView && (
                <div className="flex items-center gap-2 flex-wrap">
                    {(isDanielPinto || isDirector) && (
                        <button 
                        onClick={() => setShowTomorrowOnly(!showTomorrowOnly)} 
                        className={`relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-black uppercase border transition-all ${
                            showTomorrowOnly 
                            ? 'bg-indigo-600 text-white border-indigo-700 shadow-md scale-105 ring-2 ring-indigo-500/20' 
                            : (tomorrowCount > 0 
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm' 
                                : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50')
                        }`}
                        >
                        <CalendarPlus size={16} /> 
                        {showTomorrowOnly ? (
                            <span className="flex items-center gap-1.5">FILTRO FUTURO <span className="text-[8px] font-black">ON</span></span>
                        ) : (
                            <span className="flex items-center gap-1.5">AGENDAMENTOS FUTUROS {tomorrowCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] bg-indigo-600 text-white font-bold">{tomorrowCount}</span>}</span>
                        )}
                        </button>
                    )}

                    <button onClick={() => setShowPendingOnly(!showPendingOnly)} className={`relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase border transition-all ${showPendingOnly ? 'bg-orange-50 text-black border-orange-600 shadow-md' : pendingCount > 0 ? 'bg-orange-50 text-black border-orange-600 shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>{pendingCount > 0 ? ( <AlertTriangle size={16} className="text-black" /> ) : ( showPendingOnly ? <ToggleRight size={16} /> : <ToggleLeft size={16} /> )}{showPendingOnly ? 'Exibindo Pendências' : 'Filtrar Pendências'}{pendingCount > 0 && ( <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] bg-white text-orange-700 font-bold">{pendingCount}</span> )}</button>

                    {canSeeFinancials && (
                        <button 
                            data-testid="button-negative-margin"
                            onClick={() => setShowNegativeMarginOnly(!showNegativeMarginOnly)} 
                            className={`relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-black uppercase border transition-all ${
                                showNegativeMarginOnly 
                                ? 'bg-red-600 text-white border-red-700 shadow-md scale-105 ring-2 ring-red-500/20' 
                                : negativeMarginCount > 0 
                                    ? 'bg-red-50 text-red-700 border-red-300 shadow-sm' 
                                    : 'bg-white text-red-400 border-red-200 hover:bg-red-50'
                            }`}
                        >
                            <TrendingDown size={16} />
                            <span className="flex items-center gap-1.5">
                                {showNegativeMarginOnly ? 'RESULTADO NEGATIVO' : 'RESULTADO NEGATIVO'}
                                {negativeMarginCount > 0 && <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${showNegativeMarginOnly ? 'bg-white text-red-700' : 'bg-red-600 text-white'}`}>{negativeMarginCount}</span>}
                            </span>
                        </button>
                    )}

                    {myApprovalStage && myApprovalStage !== 'diretoria' && (
                        <button 
                            data-testid="button-my-approvals"
                            onClick={() => setShowMyApprovalOnly(!showMyApprovalOnly)} 
                            className={`relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-black uppercase border transition-all ${
                                showMyApprovalOnly 
                                ? 'bg-emerald-600 text-white border-emerald-700 shadow-md scale-105 ring-2 ring-emerald-500/20' 
                                : myApprovalCount > 0 
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-sm animate-pulse' 
                                    : 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50'
                            }`}
                        >
                            <ClipboardCheck size={16} />
                            {showMyApprovalOnly ? (
                                <span className="flex items-center gap-1.5">MINHAS APROVAÇÕES <span className="text-[8px] font-black">ON</span></span>
                            ) : (
                                <span className="flex items-center gap-1.5">
                                    MINHAS APROVAÇÕES
                                    {myApprovalCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] bg-emerald-600 text-white font-bold">{myApprovalCount}</span>}
                                </span>
                            )}
                        </button>
                    )}

                    {myApprovalStage === 'diretoria' && (
                        <>
                        <button 
                            data-testid="button-approvals-daniel"
                            onClick={() => setShowMyApprovalOnly(!showMyApprovalOnly)} 
                            className={`relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-black uppercase border transition-all ${
                                showMyApprovalOnly 
                                ? 'bg-emerald-600 text-white border-emerald-700 shadow-md scale-105 ring-2 ring-emerald-500/20' 
                                : pendingByStage.auditor.length > 0 
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-sm animate-pulse' 
                                    : 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50'
                            }`}
                        >
                            <ClipboardCheck size={16} />
                            <span className="flex items-center gap-1.5">
                                APROVAÇÕES DANIEL
                                {pendingByStage.auditor.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] bg-emerald-600 text-white font-bold">{pendingByStage.auditor.length}</span>}
                            </span>
                        </button>
                        <button 
                            data-testid="button-approvals-barbara"
                            onClick={() => setShowMyApprovalOnly(!showMyApprovalOnly)} 
                            className={`relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-black uppercase border transition-all ${
                                showMyApprovalOnly 
                                ? 'bg-amber-600 text-white border-amber-700 shadow-md scale-105 ring-2 ring-amber-500/20' 
                                : pendingByStage.financeiro.length > 0 
                                    ? 'bg-amber-50 text-amber-700 border-amber-300 shadow-sm animate-pulse' 
                                    : 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50'
                            }`}
                        >
                            <ClipboardCheck size={16} />
                            <span className="flex items-center gap-1.5">
                                APROVAÇÕES BARBARA
                                {pendingByStage.financeiro.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] bg-amber-600 text-white font-bold">{pendingByStage.financeiro.length}</span>}
                            </span>
                        </button>
                        </>
                    )}
                </div>
                )}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="hidden md:inline">Filtrados:</span>
              <span className="font-bold text-gray-800 bg-gray-200 px-2 py-1 rounded">{filteredMissions.length}</span>
              {isDirector && (
              <button
                data-testid="btn-toggle-timeline"
                onClick={() => setShowTimeline(!showTimeline)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase border transition-all ml-2 ${
                  showTimeline 
                    ? 'bg-red-600 text-white border-red-700 shadow-md' 
                    : 'bg-white text-red-600 border-red-200 hover:bg-red-50'
                }`}
              >
                <FileBarChart size={14} />
                Relatório
              </button>
              )}
            </div></div>
  
          {showTimeline && (
            <div className="border-b border-gray-200 bg-white">
              {(() => {
                const baseMissions = showNegativeMarginOnly ? filteredBySpecialCriteria : periodMissions;
                const missions = [...baseMissions].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                const fmtDate = (d: string | undefined) => d ? new Date(d).toLocaleDateString('pt-BR') : '-';
                const fmtTime = (d: string | undefined) => d ? new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-';
                const fmtMoney = (v: number) => v ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';
                const extractRoute = (origin: string, dest: string) => {
                  const getCity = (addr: string) => {
                    if (!addr) return '?';
                    const parts = addr.split(',');
                    if (parts.length >= 2) { const c = parts[1]?.trim().split('-')[0]?.trim(); if (c && c.length > 2) return c; }
                    return parts[0]?.trim().substring(0, 25) || '?';
                  };
                  return `${getCity(origin)} X ${getCity(dest)}`;
                };
                const statusBg = (s: string) => {
                  if (s === MissionStatus.COMPLETED) return 'bg-emerald-100 text-emerald-800';
                  if (s === MissionStatus.IN_PROGRESS) return 'bg-blue-100 text-blue-800';
                  if (s === MissionStatus.PENDING || s === MissionStatus.SCHEDULED || s === MissionStatus.SOLICITED) return 'bg-amber-100 text-amber-800';
                  if (s === MissionStatus.CANCELLED || s === MissionStatus.REFUSED) return 'bg-red-100 text-red-800';
                  return 'bg-gray-100 text-gray-700';
                };

                const totalRev = missions.reduce((s, m) => s + (m.revenue_value || 0), 0);
                const totalCost = missions.reduce((s, m) => s + (m.is_same_os ? 0 : (m.cost_value || 0)), 0);
                const totalToll = missions.reduce((s, m) => s + (m.toll_value || 0), 0);

                return (
                  <div>
                    <div className="p-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <FileBarChart size={18} className="text-red-600" />
                        <span className="font-black text-sm text-gray-800">RELATÓRIO DE OS — {missions.length} missões</span>
                        <button
                          data-testid="btn-export-report"
                          onClick={() => {
                            const sep = ';';
                            const headers = ['#','OS','Status','Cliente','Veíc. Escoltado','Fornecedor','Viatura','Agentes','Rota','Data Inicial','Hora Inicial','Data Final','Hora Final'];
                            if (canSeeFinancials) headers.push('Receita','Custo','Pedágio','Resultado','% Lucro');
                            const exportParentIds = new Set<string>();
                            missions.forEach(m => { if (m.is_same_os && m.parent_mission_id) exportParentIds.add(m.parent_mission_id); });
                            const rows = missions.map((m, i) => {
                              const rev = m.revenue_value || 0;
                              const cost = m.is_same_os ? 0 : (m.cost_value || 0);
                              const toll = m.toll_value || 0;
                              const resultado = rev - cost - toll;
                              const osLabel = exportParentIds.has(m.id) ? ' (OS MÃE)' : (m.is_same_os ? ` (MESMA OS${m.parent_mission_id ? ` → MÃE: ${m.parent_mission_id}` : ''})` : '');
                              const row = [
                                i + 1,
                                m.id + osLabel,
                                m.status,
                                m.client || '',
                                m.clientVehicle?.plate || '',
                                m.provider || '',
                                m.vehicleId || '',
                                [m.agent1, m.agent2].filter(Boolean).join(' & '),
                                `${m.origin ? m.origin.split(',')[0].split('-')[0].trim() : ''} → ${m.destination ? m.destination.split(',')[0].split('-')[0].trim() : ''}`,
                                fmtDate(m.created_at),
                                m.startTime ? fmtTime(m.startTime) : '',
                                m.endTime ? fmtDate(m.endTime) : '',
                                m.endTime ? fmtTime(m.endTime) : '',
                              ];
                              if (canSeeFinancials) {
                                row.push(
                                  rev > 0 ? rev.toFixed(2).replace('.', ',') : '',
                                  cost > 0 ? cost.toFixed(2).replace('.', ',') : '',
                                  toll > 0 ? toll.toFixed(2).replace('.', ',') : '',
                                  resultado !== 0 ? resultado.toFixed(2).replace('.', ',') : '',
                                  rev > 0 ? ((resultado / rev) * 100).toFixed(1).replace('.', ',') + '%' : ''
                                );
                              }
                              return row.join(sep);
                            });
                            const bom = '\uFEFF';
                            const csv = bom + headers.join(sep) + '\n' + rows.join('\n');
                            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `relatorio_os_${new Date().toISOString().split('T')[0]}.csv`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition-colors"
                          title="Exportar para Excel"
                        >
                          <Download size={13} /> Excel
                        </button>
                      </div>
                      <div className="flex items-center gap-4 text-[10px] font-bold">
                        <span className="text-emerald-700">Concl: {missions.filter(m => m.status === MissionStatus.COMPLETED).length}</span>
                        <span className="text-blue-700">Andamento: {missions.filter(m => m.status === MissionStatus.IN_PROGRESS).length}</span>
                        <span className="text-amber-700">Pend: {missions.filter(m => [MissionStatus.PENDING, MissionStatus.SCHEDULED, MissionStatus.SOLICITED].includes(m.status)).length}</span>
                        <span className="text-red-700">Canc: {missions.filter(m => [MissionStatus.CANCELLED, MissionStatus.REFUSED].includes(m.status)).length}</span>
                        {canSeeFinancials && (<>
                        <span className="border-l border-gray-300 pl-3 text-green-700">Receita Total: R$ {fmtMoney(totalRev)}</span>
                        <span className="text-blue-700">Custo Total: R$ {fmtMoney(totalCost)}</span>
                        <span className="text-orange-700">Pedágio Total: R$ {fmtMoney(totalToll)}</span>
                        <span className={`font-black ${totalRev - totalCost - totalToll >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>Resultado: R$ {fmtMoney(totalRev - totalCost - totalToll)}</span>
                        </>)}
                      </div>
                    </div>
                    <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                      <table className="w-full text-xs border-collapse min-w-[1400px]">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-gray-900 text-white text-[11px]">
                            <th className="px-3 py-2.5 text-left font-black border-r border-gray-700 w-[35px]">#</th>
                            <th className="px-3 py-2.5 text-left font-black border-r border-gray-700">OS</th>
                            <th className="px-3 py-2.5 text-center font-black border-r border-gray-700">STATUS</th>
                            <th className="px-3 py-2.5 text-left font-black border-r border-gray-700">CLIENTE</th>
                            <th className="px-3 py-2.5 text-left font-black border-r border-gray-700">VEÍC. ESCOLTADO</th>
                            <th className="px-3 py-2.5 text-left font-black border-r border-gray-700">FORNECEDOR</th>
                            <th className="px-3 py-2.5 text-left font-black border-r border-gray-700">VIATURA</th>
                            <th className="px-3 py-2.5 text-left font-black border-r border-gray-700">AGENTES</th>
                            <th className="px-3 py-2.5 text-left font-black border-r border-gray-700">ROTA</th>
                            <th className="px-3 py-2.5 text-left font-black border-r border-gray-700">DATA INICIAL</th>
                            <th className="px-3 py-2.5 text-left font-black border-r border-gray-700">HORA INICIAL</th>
                            <th className="px-3 py-2.5 text-left font-black border-r border-gray-700">DATA FINAL</th>
                            <th className="px-3 py-2.5 text-left font-black border-r border-gray-700">HORA FINAL</th>
                            {canSeeFinancials && (<>
                            <th className="px-3 py-2.5 text-right font-black border-r border-gray-700">RECEITA</th>
                            <th className="px-3 py-2.5 text-right font-black border-r border-gray-700">CUSTO</th>
                            <th className="px-3 py-2.5 text-right font-black border-r border-gray-700">PEDÁGIO</th>
                            <th className="px-3 py-2.5 text-right font-black border-r border-gray-700">RESULTADO</th>
                            <th className="px-3 py-2.5 text-right font-black border-r border-gray-700">% LUCRO</th>
                            </>)}
                            <th className="px-3 py-2.5 text-center font-black">FATURAMENTO</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const parentChildMap = new Map<string, string[]>();
                            missions.forEach(m => {
                              if (m.is_same_os && m.parent_mission_id) {
                                const arr = parentChildMap.get(m.parent_mission_id) || [];
                                arr.push(m.id);
                                parentChildMap.set(m.parent_mission_id, arr);
                              }
                            });
                            return missions.map((m, idx) => {
                            const rev = m.revenue_value || 0;
                            const cost = m.is_same_os ? 0 : (m.cost_value || 0);
                            const toll = m.toll_value || 0;
                            const resultado = rev - cost - toll;
                            const lucroPerc = rev > 0 ? ((resultado / rev) * 100) : 0;
                            const placaEscoltado = m.clientVehicle?.plate || '-';
                            const agentes = [m.agent1, m.agent2].filter(Boolean).join(' & ') || '-';
                            const isParentMission = parentChildMap.has(m.id);
                            const childrenOfThis = parentChildMap.get(m.id);
                            const hasLink = isParentMission || (m.is_same_os && !!m.parent_mission_id);
                            const rowBg = isParentMission ? 'bg-blue-50' : (m.is_same_os && m.parent_mission_id) ? 'bg-blue-50/40' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                            
                            return (
                              <tr key={m.id} className={`${rowBg} hover:bg-yellow-50 border-b border-gray-200 transition-colors ${hasLink ? 'border-l-4 border-l-blue-500' : ''}`} data-testid={`timeline-row-${m.id}`}>
                                <td className="px-3 py-2 font-black text-gray-500 border-r border-gray-100">{idx + 1}</td>
                                <td className="px-3 py-2 font-black text-gray-900 border-r border-gray-100 whitespace-nowrap">
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {hasLink && <Link2 size={12} className="text-blue-500 shrink-0" />}
                                    <span className={isParentMission ? 'font-black text-blue-700' : (m.is_same_os && m.parent_mission_id) ? 'text-blue-600' : ''}>{m.id}</span>
                                    {m.mission_type && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${m.mission_type === 'Velada' ? 'bg-purple-100 text-purple-700' : m.mission_type === 'Pronta Resposta' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>{m.mission_type === 'Caracterizada' ? 'CARACT' : m.mission_type === 'Velada' ? 'VELADA' : 'PR'}</span>}
                                    {isParentMission && (
                                      <span className="text-[9px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded inline-flex items-center gap-0.5" title={`Filhas: ${childrenOfThis?.join(', ')}`}>OS MÃE</span>
                                    )}
                                    {m.is_same_os && (
                                      <span className="text-[9px] font-black bg-black text-white px-1.5 py-0.5 rounded">MESMA OS</span>
                                    )}
                                    {m.is_same_os && m.parent_mission_id && (
                                      <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5">MÃE: {m.parent_mission_id}</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2 border-r border-gray-100 text-center whitespace-nowrap"><span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${statusBg(m.status)}`}>{m.status}</span></td>
                                <td className="px-3 py-2 border-r border-gray-100 font-bold text-gray-800 max-w-[160px] truncate">{m.client || '-'}</td>
                                <td className="px-3 py-2 border-r border-gray-100 font-mono text-gray-700 whitespace-nowrap">{placaEscoltado}</td>
                                <td className="px-3 py-2 border-r border-gray-100 text-gray-700 max-w-[140px] truncate">{m.provider || '-'}</td>
                                <td className="px-3 py-2 border-r border-gray-100 font-mono text-gray-700 whitespace-nowrap">{m.vehicleId || '-'}</td>
                                <td className="px-3 py-2 border-r border-gray-100 text-gray-600 max-w-[180px] truncate" title={agentes}>{agentes}</td>
                                <td className="px-3 py-2 border-r border-gray-100 text-gray-600 max-w-[200px] truncate" title={`${m.origin || ''} → ${m.destination || ''}`}>
                                  {m.origin ? m.origin.split(',')[0].split('-')[0].trim() : '-'} → {m.destination ? m.destination.split(',')[0].split('-')[0].trim() : '-'}
                                </td>
                                <td className="px-3 py-2 border-r border-gray-100 whitespace-nowrap">{fmtDate(m.created_at)}</td>
                                <td className="px-3 py-2 border-r border-gray-100 whitespace-nowrap">{m.startTime ? fmtTime(m.startTime) : '-'}</td>
                                <td className="px-3 py-2 border-r border-gray-100 whitespace-nowrap">{m.endTime ? fmtDate(m.endTime) : '-'}</td>
                                <td className="px-3 py-2 border-r border-gray-100 whitespace-nowrap">{m.endTime ? fmtTime(m.endTime) : '-'}</td>
                                {canSeeFinancials && (<>
                                <td className="px-3 py-2 border-r border-gray-100 text-right font-bold text-green-700 whitespace-nowrap">{rev > 0 ? fmtMoney(rev) : '-'}</td>
                                <td className="px-3 py-2 border-r border-gray-100 text-right font-bold text-blue-700 whitespace-nowrap">{cost > 0 ? fmtMoney(cost) : '-'}</td>
                                <td className="px-3 py-2 border-r border-gray-100 text-right text-orange-600 whitespace-nowrap">{toll > 0 ? fmtMoney(toll) : '-'}</td>
                                <td className={`px-3 py-2 border-r border-gray-100 text-right font-black whitespace-nowrap ${resultado >= 0 ? 'text-emerald-700' : 'text-red-600 bg-red-50'}`}>{rev > 0 || cost > 0 ? fmtMoney(resultado) : '-'}</td>
                                <td className={`px-3 py-2 border-r border-gray-100 text-right font-black whitespace-nowrap ${lucroPerc >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{rev > 0 ? `${lucroPerc.toFixed(1)}%` : '-'}</td>
                                </>)}
                                <td className="px-3 py-2 text-center">
                                  <button
                                    data-testid={`btn-financial-${m.id}`}
                                    onClick={() => { setMissionForFinancials(m); setIsFinancialModalOpen(true); }}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold transition-colors ${
                                      m.billing_approved 
                                        ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
                                        : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                    }`}
                                    title="Conferência e Aprovação"
                                  >
                                    <ClipboardCheck size={12} />
                                    {m.billing_approved ? 'APROVADO' : 'CONFERIR'}
                                  </button>
                                </td>
                              </tr>
                            );
                          });
                          })()}
                        </tbody>
                        {missions.length > 0 && canSeeFinancials && (
                          <tfoot>
                            <tr className="bg-gray-800 text-white font-black text-xs">
                              <td colSpan={13} className="px-3 py-2.5 text-right border-r border-gray-600">TOTAIS →</td>
                              <td className="px-3 py-2.5 text-right border-r border-gray-600 text-green-300">{fmtMoney(totalRev)}</td>
                              <td className="px-3 py-2.5 text-right border-r border-gray-600 text-blue-300">{fmtMoney(totalCost)}</td>
                              <td className="px-3 py-2.5 text-right border-r border-gray-600 text-orange-300">{fmtMoney(totalToll)}</td>
                              <td className="px-3 py-2.5 text-right border-r border-gray-600 text-emerald-300">{fmtMoney(totalRev - totalCost - totalToll)}</td>
                              <td className={`px-3 py-2.5 text-right border-r border-gray-600 ${totalRev > 0 ? (((totalRev - totalCost - totalToll) / totalRev * 100) >= 0 ? 'text-emerald-300' : 'text-red-300') : ''}`}>{totalRev > 0 ? `${((totalRev - totalCost - totalToll) / totalRev * 100).toFixed(1)}%` : '-'}</td>
                              <td className="px-3 py-2.5"></td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                    {missions.length === 0 && (
                      <div className="text-center py-12 text-gray-400">
                        <List size={40} className="mx-auto mb-3 opacity-30" />
                        <p className="font-bold">Nenhuma OS encontrada</p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          <div className="bg-gray-50/5 p-4 min-h-[400px]">
              {isLoading ? ( <div className="flex flex-col items-center justify-center h-64 text-gray-400"><Loader2 size={32} className="animate-spin mb-2 text-red-600" /><p className="text-sm font-medium">Carregando...</p></div> ) : sortedMissions.length === 0 ? ( <div className="relative flex flex-col items-center justify-center h-64 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl bg-white overflow-hidden">
                  <svg viewBox="0 0 320 80" className="absolute h-32 opacity-[0.06] pointer-events-none" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <g transform="translate(10, 5) scale(0.85)"><path d="M40 5 L10 15 V35 C10 55 25 70 40 75 C55 70 70 55 70 35 V15 L40 5 Z" stroke="#000" strokeWidth="4" fill="none" strokeLinejoin="round"/><path d="M20 50 Q40 65 60 40" stroke="#b91c1c" strokeWidth="6" strokeLinecap="round"/><path d="M28 22 L40 22 L40 55" stroke="#000" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/><path d="M45 22 L55 38 L65 22 L65 55 M45 55 L45 22" stroke="#000" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></g>
                      <text x="95" y="52" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="34" fill="#000" letterSpacing="3">GRUPO TMSEG</text>
                  </svg>
                  <p className="text-sm font-bold text-gray-500 relative z-10">Nenhuma missão encontrada para este filtro.</p>
              </div> ) : (
                  <div className="flex flex-col gap-3">
                      {sortedMissions.map((mission) => {
                          const diffMinutes = getDelayMinutes(mission);
                          const isPending = isMissionPending(mission);
                          const isRedLight = isPending || [MissionStatus.CANCELLED, MissionStatus.REFUSED].includes(mission.status) || (diffMinutes > 60 && ![MissionStatus.COMPLETED].includes(mission.status));
                          return (
                              <div key={mission.id} className="relative">
                                  <MissionCard 
                                      mission={mission}
                                      canEditMission={canEditMission}
                                      isDirector={isDirector}
                                      isRedLight={isRedLight}
                                      isImminent={mission.status === MissionStatus.IN_TRANSIT && diffMinutes > 30 && diffMinutes <= 60}
                                      minutesSinceUpdate={diffMinutes}
                                      copiedId={copiedId}
                                      isSendingEmail={isSendingEmail}
                                      onViewMap={handleOpenStatusModal}
                                      onUpdate={handleOpenUpdateModal}
                                      onOpenFinancials={handleOpenFinancialModal} 
                                      onCopy={handleCopyMission}
                                      onCopyEmail={handleCopyEmail}
                                      onDelete={handleDeleteClick}
                                      hideProviderInfo={isRestrictedClientView}
                                      onPrint={handleOpenPrintModal}
                                      onViewHistory={handleViewHistory}
                                      onFullReport={(m: Mission) => { setMissionForFullReport(m); setIsFullReportOpen(true); }}
                                      onOperationalReport={(m: Mission) => setMissionForOpReport(m)}
                                      clientTables={clientTables}
                                      providerTables={providerTables}
                                      clientsData={clientsData}
                                      agentPhonesMap={agentPhonesMap}
                                      currentTime={currentTime}
                                      approvalStages={approvalMap[mission.id]}
                                      evidenceList={evidenceMap[mission.id]}
                                      lastLog={lastLogMap[mission.id]}
                                      onEvidenceUploaded={() => fetchMissions(true)}
                                  />
                              </div>
                          );
                      })}
                  </div>
              )}
          </div>
        </div>
  
        {isStatusModalOpen && <MissionStatusModal isOpen={isStatusModalOpen} onClose={() => setIsStatusModalOpen(false)} mission={missionForStatusView!} logs={missionLogs} onUpdate={() => fetchMissions(true)} hideProviderInfo={isRestrictedClientView} />}
        {isFinancialModalOpen && <MissionFinancialModal isOpen={isFinancialModalOpen} onClose={() => setIsFinancialModalOpen(false)} mission={missionForFinancials} onUpdate={() => fetchMissions(true)} />}
        {isHistoryModalOpen && <MissionHistoryModal missionId={historyMissionId} onClose={() => setIsHistoryModalOpen(false)} />}
        {isUpdateModalOpen && <UpdateMissionModal isOpen={isUpdateModalOpen} onClose={() => setIsUpdateModalOpen(false)} mission={selectedMission} currentUser={currentUser} onSuccess={handleUpdateSuccess} hideProviderInfo={isRestrictedClientView} />}
        {isPrintModalOpen && missionForPrint && <MissionPrintModal mission={missionForPrint} onClose={() => setIsPrintModalOpen(false)} />}
        {isFullReportOpen && missionForFullReport && <MissionFullReportModal mission={missionForFullReport} onClose={() => { setIsFullReportOpen(false); setMissionForFullReport(null); }} hideProviderInfo={isRestrictedClientView} />}
        {showClientRequestModal && resolvedClientName && <ClientMissionRequest clientName={resolvedClientName} onClose={() => setShowClientRequestModal(false)} onSuccess={() => { fetchMissions(true); showNotification('Sucesso', 'Solicitação enviada com sucesso!', 'success'); }} />}
        {missionForOpReport && <MissionOperationalReport mission={missionForOpReport} onClose={() => setMissionForOpReport(null)} isClientView={isRestrictedClientView} isInternalEditor={isDirector || (currentUser?.role || '').toLowerCase() === 'avançado'} />}
        {isDeleteModalOpen && missionToDelete && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
                <div className="bg-white rounded-xl shadow-2xl w-full max-sm overflow-hidden border border-red-200">
                    <div className="bg-red-50 p-4 border-b border-red-100 flex items-center gap-3"><div className="p-2 bg-red-100 rounded-full text-red-600"><Trash2 size={24} /></div><h3 className="text-lg font-bold text-red-900">Excluir?</h3></div>
                    <div className="p-6 space-y-4"><p className="text-sm text-gray-600">Confirma exclusão de <strong>{missionToDelete.id}</strong>?</p>{!isDirector && (<div><label className="text-xs font-bold text-gray-500 mb-1 block">Senha</label><div className="relative"><input type="password" className="w-full p-2 pl-9 border rounded" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} /><Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /></div></div>)}</div>
                    <div className="p-4 bg-gray-50 flex justify-end gap-3 border-t"><button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 border rounded text-xs">Sair</button><button onClick={confirmDelete} disabled={isDeleting || (!isDirector && !deletePassword)} className="px-4 py-2 bg-red-600 text-white rounded-xs flex items-center gap-2">Confirmar</button></div>
                </div>
            </div>
        )}
      </div>
    );
  };
  
  export default MissionTable;