import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Mission, MissionStatus, MissionLog, User as UserType, Agent, Client, ClientPriceTable, ProviderCostTable } from '../types';
import { authFetch } from '../lib/authFetch';
import { supabase } from '../lib/supabase';
import { useNotification } from '../lib/NotificationContext';
import { logAction } from '../lib/logger';
import { 
  Plus, Loader2, Activity, Search, Database, AlertTriangle, Check, Trash2, Lock, Share2, X, Eye, EyeOff, Layers, PlayCircle, CheckCircle2,
  ClipboardList, FileSearch, CalendarClock, MapPin, Truck, Flag, XCircle, UserX, AlertOctagon, ToggleLeft, ToggleRight, Calendar,
  BarChart4, Globe, Building2, LayoutDashboard, User, ExternalLink, RefreshCw,
  Target, Clock, History, CalendarPlus, ShieldAlert, Mail, MessageCircle, ClipboardCheck,
  FileBarChart, ArrowRight, Briefcase, Printer, Filter, List, Download, Link2, TrendingDown, Sparkles
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
import DhlSolicitationModal from './DhlSolicitationModal';
import LossesDialog from './LossesDialog';
import MissingTableDialog, { computeMissingTableRows, type MissingTableRow } from './MissingTableDialog';
import {
  computeCanonicalRevenueCost as computeCanonicalRC,
  getCanonicalDateRange as getCanonicalDR,
  filterMissionsByPeriod as filterByPeriodCanonical,
  type CanonicalPeriod as CanonicalPeriodT,
} from '../lib/missionFinancialsCanonical';
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
  
  const [customStartDate, setCustomStartDate] = useState<string>(() => { const d = new Date(); return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); });
  const [customEndDate, setCustomEndDate] = useState<string>(() => { const d = new Date(); return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); });
  
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
  const [cancelEscortAtOrigin, setCancelEscortAtOrigin] = useState<boolean | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyMissionId, setHistoryMissionId] = useState('');
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const [isFinancialModalOpen, setIsFinancialModalOpen] = useState(false);
  const [missionForFinancials, setMissionForFinancials] = useState<Mission | null>(null);
  const [isLossesOpen, setIsLossesOpen] = useState(false);
  const [isMissingTableOpen, setIsMissingTableOpen] = useState(false);
  const [showClientRequestModal, setShowClientRequestModal] = useState(false);
  const [solicitationCount, setSolicitationCount] = useState(0);
  const [accidentCount, setAccidentCount] = useState(0);
  const [approvalMap, setApprovalMap] = useState<Record<string, { stage: string; date: string }[]>>({});
  const [evidenceMap, setEvidenceMap] = useState<Record<string, { url: string; uploadedBy: string; uploadedAt: string }[]>>({});
  const [lastLogMap, setLastLogMap] = useState<Record<string, MissionLog>>({});
  const [dhlIntakeMap, setDhlIntakeMap] = useState<Record<string, { status: string; providerFilledAt: string | null; intakeId: string; progressAgent1?: boolean; progressAgent2?: boolean; progressVehicle?: boolean; progressMirror?: boolean }>>({});
  const [resolvedClientName, setResolvedClientName] = useState('');
  const [showMyApprovalOnly, setShowMyApprovalOnly] = useState(false);
  const [approvalViewStage, setApprovalViewStage] = useState<'auditor' | 'financeiro' | null>(null);
  const [showNegativeMarginOnly, setShowNegativeMarginOnly] = useState(false);
  const [showDhlOnly, setShowDhlOnly] = useState(false);
  const [showDhlSolicitation, setShowDhlSolicitation] = useState(false);
  const [tollConfirmMap, setTollConfirmMap] = useState<Record<string, { user: string; date: string; hasToll: boolean; value: number; source?: string }>>({});
  const [showTollNotConfirmedOnly, setShowTollNotConfirmedOnly] = useState(false);
  // Resultados de busca server-side (OS/cliente/fornecedor/motorista/SE) para
  // que a busca encontre OS fora do período atualmente carregado.
  const [searchMatches, setSearchMatches] = useState<Mission[]>([]);
  // Só liberamos a busca server-side depois que o escopo de cliente foi
  // RESOLVIDO em fetchMissions. clientScopeRef nasce como { type: 'all' }, então
  // buscar antes da resolução vazaria OS de outros clientes para usuários
  // restritos/comercial (não há RLS no banco).
  const [scopeReady, setScopeReady] = useState(false);

  // Paginação da tabela: o usuário escolhe quantas OS por página (10 ou 100).
  // A escolha é lembrada entre sessões via localStorage.
  const PAGE_SIZE_OPTIONS = [10, 100] as const;
  const [pageSize, setPageSize] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('missionTablePageSize'));
      return PAGE_SIZE_OPTIONS.includes(saved as any) ? saved : 10;
    } catch { return 10; }
  });
  const PAGE_SIZE = pageSize;
  const [currentPage, setCurrentPage] = useState(1);

  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const mainContentRef = useRef<HTMLDivElement | null>(null);
  const syncingFromTopRef = useRef(false);
  const syncingFromMainRef = useRef(false);
  const [topMirrorWidth, setTopMirrorWidth] = useState<number>(1100);

  // Mantém a barra de rolagem SUPERIOR com a mesma largura interna da lista.
  useEffect(() => {
    const el = mainContentRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => setTopMirrorWidth(el.scrollWidth || el.offsetWidth || 1100);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, [isLoading]);

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
    if (roleLower === 'comercial') return false;
    return nameLower.includes('daniel') || nameLower.includes('michelle') || nameLower.includes('barbara') || nameLower.includes('bárbara') || nameLower.includes('thiago moreira') || roleLower === 'controller';
  }, [currentUser]);

  // Alerta "OS sem Tabela" restrito a: Thiago Moreira (Diretoria), Bárbara e Simone.
  const canSeeMissingTableAlert = useMemo(() => {
    if (!currentUser) return false;
    const nameLower = (currentUser.name || '').toLowerCase();
    return nameLower.includes('thiago moreira') || nameLower.includes('barbara') || nameLower.includes('bárbara') || nameLower.includes('simone');
  }, [currentUser]);

  // Conta quantas OS estão com prejuízo direto (custo > receita) no período
  // canônico selecionado. Usado para esconder o botão "OS com Prejuízo"
  // quando não há nenhuma OS com prejuízo no período.
  // Passada única de filtragem por período, compartilhada pelas memos pesadas
  // abaixo (prejuízo e "OS sem tabela") para não varrer allMissions duas vezes.
  const missionsInCanonicalPeriod = useMemo(() => {
    if (!canSeeFinancials && !canSeeMissingTableAlert) return [];
    try {
      const allowed: CanonicalPeriodT[] = ['TODAY', 'YESTERDAY', 'WEEK', 'MONTH', 'YEAR', 'CUSTOM', 'ALL'];
      const period = (allowed.includes(viewPeriod as CanonicalPeriodT) ? viewPeriod : 'TODAY') as CanonicalPeriodT;
      const [start, end] = getCanonicalDR(period, customStartDate, customEndDate);
      return filterByPeriodCanonical(allMissions || [], start, end);
    } catch {
      return [];
    }
  }, [canSeeFinancials, canSeeMissingTableAlert, allMissions, viewPeriod, customStartDate, customEndDate]);

  const lossesCount = useMemo(() => {
    if (!canSeeFinancials) return 0;
    try {
      const refs = { clientTables, providerTables, clientsData };
      let count = 0;
      for (const m of missionsInCanonicalPeriod) {
        if ((m as any).status === MissionStatus.REFUSED) continue;
        const r = computeCanonicalRC(m as any, refs);
        if (r.rev <= 0 && r.cost <= 0) continue;
        if (r.cost - r.rev > 0) count++;
      }
      return count;
    } catch {
      return 0;
    }
  }, [canSeeFinancials, missionsInCanonicalPeriod, clientTables, providerTables, clientsData]);

  const missingTableRows = useMemo<MissingTableRow[]>(() => {
    if (!canSeeMissingTableAlert) return [];
    try {
      // missionsInCanonicalPeriod já está filtrada pelo período (alreadyFiltered=true).
      return computeMissingTableRows(missionsInCanonicalPeriod, clientTables, providerTables, clientsData, viewPeriod, customStartDate, customEndDate, true);
    } catch {
      return [];
    }
  }, [canSeeMissingTableAlert, missionsInCanonicalPeriod, clientTables, providerTables, clientsData, viewPeriod, customStartDate, customEndDate]);
  const missingTableCount = missingTableRows.length;

  const isCommercial = useMemo(() => {
      if (!currentUser) return false;
      const roleLower = (currentUser.role || '').toLowerCase();
      return roleLower === 'comercial' && !currentUser.permissions?.includes('*');
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

  // Mapas de lookup usados para enriquecer cada OS (placa do veículo, nome
  // fantasia de cliente/fornecedor, veículo do cliente). Guardados em ref para
  // permitir patch direcionado de UMA única OS no realtime, sem rebaixar a
  // lista inteira a cada mudança.
  const lookupMapsRef = useRef<{
    vehicleMap: Record<string, any>;
    clientVehicleMap: Record<string, any>;
    clientNameMap: Record<string, string>;
    providerNameMap: Record<string, string>;
  }>({ vehicleMap: {}, clientVehicleMap: {}, clientNameMap: {}, providerNameMap: {} });

  // Controle de recarga total: debounce + janela de supressão quando um patch
  // direcionado já tratou a mudança (evita recarga total redundante disparada
  // pelo evento global 'refreshMissions').
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const auxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressFullRefetchUntilRef = useRef<number>(0);
  const hasSubscribedOnceRef = useRef<boolean>(false);
  // Garante que o fetch inicial concluiu antes de aceitar patches direcionados
  // (evita race de startup com eventos chegando antes do snapshot inicial).
  const initialFetchDoneRef = useRef<boolean>(false);
  // Versiona refreshDerivedData para descartar respostas fora de ordem.
  const derivedReqIdRef = useRef<number>(0);
  // Espelha allMissions para leitura síncrona dentro de callbacks realtime.
  const allMissionsRef = useRef<Mission[]>([]);

  // Parâmetros de período lidos por fetchMissions SEM entrar nas deps do
  // callback — assim trocar de período não recria o canal realtime nem o
  // intervalo de refetch (que dependem da identidade de fetchMissions).
  const periodParamsRef = useRef({ viewPeriod, customStartDate, customEndDate });
  useEffect(() => {
    periodParamsRef.current = { viewPeriod, customStartDate, customEndDate };
  }, [viewPeriod, customStartDate, customEndDate]);

  // Escopo de cliente resolvido no último fetch — reaproveitado pela busca
  // server-side para respeitar a visão restrita de cliente/comercial.
  const clientScopeRef = useRef<{ type: 'all' | 'eq' | 'in' | 'empty'; value?: string; values?: string[] }>({ type: 'all' });

  // Converte uma linha bruta da tabela `missions` no objeto enriquecido usado
  // pela UI, reaproveitando os mapas de lookup já carregados.
  const mapRawMissionRow = useCallback((m: any): Mission => {
    const maps = lookupMapsRef.current;
    const clientKey = m.client ? (m.client || '').trim().toUpperCase() : '';
    const providerKey = m.provider ? (m.provider || '').trim().toUpperCase() : '';
    const resolvedVehicle = maps.vehicleMap[m.vehicle_id];
    let displayVehicleId = m.vehicle_id;
    if (resolvedVehicle) displayVehicleId = resolvedVehicle.plate;
    const fallbackDate = m.last_update || m.created_at || new Date().toISOString();
    const cargoId = m.client_vehicle?.toString();
    const cargoVehicle = cargoId ? (maps.clientVehicleMap[cargoId] || { plate: `ID: ${cargoId}`, model: 'VEÍCULO NÃO LOCALIZADO' }) : null;
    return {
      ...m,
      client: maps.clientNameMap[clientKey] || m.client,
      provider: maps.providerNameMap[providerKey] || m.provider,
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
      displacement_value: m.displacement_value,
      displacement_value_provider: m.displacement_value_provider,
      billing_approved: m.billing_approved,
      billing_verified_by: m.billing_verified_by,
      reference_number: m.reference_number || '',
      billing_release: m.billing_release || '',
      dhl_se_number: m.dhl_se_number || ''
    } as Mission;
  }, []);

  // Recalcula os dados DERIVADOS da lista de OS (contadores e mapas auxiliares
  // de aprovação/evidência/logs/DHL/pedágio). É leve comparado à recarga total
  // (consultas indexadas por id), e pode ser chamado após um patch direcionado
  // para manter esses estados consistentes sem rebaixar a lista inteira.
  const refreshDerivedData = useCallback(async (missions: Mission[]) => {
    // Descarta respostas fora de ordem: se um refresh mais novo começar antes
    // deste terminar, os setters abaixo são ignorados.
    const reqId = ++derivedReqIdRef.current;
    const portalMissions = missions.filter(m => m.status === MissionStatus.SOLICITED && (m.currentLocation || '').includes('Solicitação via Portal'));
    setSolicitationCount(portalMissions.length);
    setAccidentCount(portalMissions.filter(m => (m.currentLocation || '').includes('ACIDENTE')).length);

    const completedIds = missions.filter(m => m.status === MissionStatus.COMPLETED && !m.billing_approved).map(m => m.id);
    const allIds = missions.map(m => m.id);
    const batchSize = 200;

    const fetchApprovalLogs = async () => {
        if (completedIds.length === 0) { if (reqId === derivedReqIdRef.current) setApprovalMap({}); return; }
        const map: Record<string, { stage: string; date: string }[]> = {};
        const batches = [];
        for (let i = 0; i < completedIds.length; i += batchSize) batches.push(completedIds.slice(i, i + batchSize));
        const results = await Promise.all(batches.map(batch => supabase.from('system_logs').select('entity_id, action_type, details, created_at').eq('entity', 'BillingApproval').in('entity_id', batch)));
        results.forEach(({ data }) => {
            (data || []).forEach((l: any) => {
                if (!map[l.entity_id]) map[l.entity_id] = [];
                try { const parsed = JSON.parse(l.details); map[l.entity_id].push({ stage: parsed.stage || l.action_type, date: parsed.date || l.created_at }); }
                catch { map[l.entity_id].push({ stage: l.action_type, date: l.created_at }); }
            });
        });
        if (reqId === derivedReqIdRef.current) setApprovalMap(map);
    };

    const fetchEvidenceLogs = async () => {
        if (allIds.length === 0) { if (reqId === derivedReqIdRef.current) setEvidenceMap({}); return; }
        const evMap: Record<string, { url: string; uploadedBy: string; uploadedAt: string }[]> = {};
        const batches = [];
        for (let i = 0; i < allIds.length; i += batchSize) batches.push(allIds.slice(i, i + batchSize));
        const results = await Promise.all(batches.map(batch => supabase.from('system_logs').select('entity_id, details').eq('entity', 'MissionEvidence').in('entity_id', batch)));
        results.forEach(({ data }) => {
            (data || []).forEach((l: any) => {
                if (!evMap[l.entity_id]) evMap[l.entity_id] = [];
                try { const parsed = JSON.parse(l.details); evMap[l.entity_id].push({ url: parsed.publicUrl || '', uploadedBy: parsed.uploadedBy || '', uploadedAt: parsed.uploadedAt || '' }); } catch {}
            });
        });
        if (reqId === derivedReqIdRef.current) setEvidenceMap(evMap);
    };

    const fetchMissionLogs = async () => {
        if (allIds.length === 0) { if (reqId === derivedReqIdRef.current) setLastLogMap({}); return; }
        const logMap: Record<string, MissionLog> = {};
        const batches = [];
        for (let i = 0; i < allIds.length; i += batchSize) batches.push(allIds.slice(i, i + batchSize));
        const results = await Promise.all(batches.map(batch => supabase.from('mission_logs').select('*').in('mission_id', batch).order('created_at', { ascending: false })));
        results.forEach(({ data }) => {
            (data || []).forEach((l: any) => {
                if (!logMap[l.mission_id]) logMap[l.mission_id] = l as MissionLog;
            });
        });
        if (reqId === derivedReqIdRef.current) setLastLogMap(logMap);
    };

    const fetchDhlIntakes = async () => {
        const dhlIds = missions.filter(m => {
            const original = ((m as any).originalClientName || '').toUpperCase();
            const displayed = (m.client || '').toUpperCase();
            return original.includes('DHL') || displayed.includes('DHL');
        }).map(m => m.id);
        if (dhlIds.length === 0) { if (reqId === derivedReqIdRef.current) setDhlIntakeMap({}); return; }
        const intakeMap: Record<string, { status: string; providerFilledAt: string | null; intakeId: string; progressAgent1?: boolean; progressAgent2?: boolean; progressVehicle?: boolean; progressMirror?: boolean }> = {};
        const batches: string[][] = [];
        for (let i = 0; i < dhlIds.length; i += batchSize) batches.push(dhlIds.slice(i, i + batchSize));
        const results = await Promise.all(batches.map(batch =>
            supabase.from('dhl_supplier_intakes')
                .select('id, mission_id, status, provider_filled_at, created_at, progress_agent1, progress_agent2, progress_vehicle, progress_mirror')
                .in('mission_id', batch)
                .in('status', ['pendente', 'preenchido'])
                .order('created_at', { ascending: false })
        ));
        results.forEach(({ data }) => {
            (data || []).forEach((it: any) => {
                if (!intakeMap[it.mission_id]) {
                    intakeMap[it.mission_id] = {
                        status: it.status,
                        providerFilledAt: it.provider_filled_at || null,
                        intakeId: it.id,
                        progressAgent1: !!it.progress_agent1,
                        progressAgent2: !!it.progress_agent2,
                        progressVehicle: !!it.progress_vehicle,
                        progressMirror: !!it.progress_mirror,
                    };
                }
            });
        });
        if (reqId === derivedReqIdRef.current) setDhlIntakeMap(intakeMap);
    };

    const fetchTollConfirmations = async () => {
        if (allIds.length === 0) { if (reqId === derivedReqIdRef.current) setTollConfirmMap({}); return; }
        const tcMap: Record<string, { user: string; date: string; hasToll: boolean; value: number; source?: string }> = {};
        const batches = [];
        for (let i = 0; i < allIds.length; i += batchSize) batches.push(allIds.slice(i, i + batchSize));
        const results = await Promise.all(batches.map(batch => supabase.from('system_logs').select('entity_id, user_name, details, created_at').eq('entity', 'MissionTollConfirmation').in('entity_id', batch).order('created_at', { ascending: false })));
        results.forEach(({ data }) => {
            (data || []).forEach((l: any) => {
                if (tcMap[l.entity_id]) return; // keep most recent only
                let parsed: any = {};
                try { parsed = JSON.parse(l.details || '{}'); } catch {}
                tcMap[l.entity_id] = {
                    user: parsed.user || l.user_name || 'Usuário',
                    date: parsed.confirmed_at || l.created_at,
                    hasToll: !!parsed.has_toll,
                    value: Number(parsed.value) || 0,
                    source: parsed.source,
                };
            });
        });
        if (reqId === derivedReqIdRef.current) setTollConfirmMap(tcMap);
    };

    await Promise.all([fetchApprovalLogs(), fetchEvidenceLogs(), fetchMissionLogs(), fetchDhlIntakes(), fetchTollConfirmations()]);
  }, []);

  const fetchMissions = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setDbStatus(null);
    try {
      // 1) Resolve o escopo de cliente (visão restrita por cliente / comercial).
      //    Guardamos o escopo num ref para reaproveitar na busca server-side.
      let scope: { type: 'all' | 'eq' | 'in' | 'empty'; value?: string; values?: string[] } = { type: 'all' };
      if (currentUser?.clientId) {
          const { data: clientData } = await supabase.from('clients').select('name').eq('id', currentUser.clientId).single();
          if (clientData) { scope = { type: 'eq', value: clientData.name }; setResolvedClientName(clientData.name); }
          else { setAllMissions([]); allMissionsRef.current = []; setIsLoading(false); return; }
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
              scope = { type: 'in', values: validNames };
              if (validNames.length === 1) setResolvedClientName(validNames[0]);
          } else {
              scope = { type: 'empty' };
          }
      }
      clientScopeRef.current = scope;
      setScopeReady(true);

      // Constrói uma query base nova (com o escopo de cliente já aplicado).
      const buildBase = () => {
          let q = supabase.from('missions').select('*').order('created_at', { ascending: false });
          if (scope.type === 'eq') q = q.eq('client', scope.value!);
          else if (scope.type === 'in') q = q.in('client', scope.values!);
          else if (scope.type === 'empty') q = q.eq('client', 'NON_EXISTENT_CLIENT_TO_FORCE_EMPTY');
          return q;
      };

      const fetchAllPagesOf = async (q: any) => {
          let all: any[] = [];
          let from = 0;
          const pageSize = 1000;
          while (true) {
              const { data, error } = await q.range(from, from + pageSize - 1);
              if (error) throw error;
              if (data) all = all.concat(data);
              if (!data || data.length < pageSize) break;
              from += pageSize;
          }
          return all;
      };

      // OS "em aberto": sempre carregadas, independentemente do período. Mantém
      // corretos os badges globais (aprovação, pedágio, "amanhã") e a visão
      // "TOTAL ABERTOS". Settled = Concluída aprovada / Cancelada / Recusada
      // (essas só são buscadas quando caem no intervalo de datas selecionado).
      const OPEN_OR = 'status.in.("Pendente","Solicitada","Documentação","Agendada","Origem","Em Viagem"),and(status.eq."Concluída",billing_approved.not.is.true)';

      const params = periodParamsRef.current;
      const vp = params.viewPeriod;

      // Busca SOMENTE o necessário para o período selecionado, em vez de baixar
      // toda a base. HISTÓRICO continua trazendo tudo (é a visão de histórico).
      const fetchScoped = async (): Promise<any[]> => {
          // Visão restrita por cliente (portal do cliente / client_view): o
          // conjunto de UM cliente já é pequeno e os painéis do cliente
          // (ClientExecutiveDashboard/Relatórios/Comitê) têm seu PRÓPRIO
          // seletor de período. Carrega tudo do cliente para não quebrá-los.
          if (isRestrictedClientView) {
              return fetchAllPagesOf(buildBase());
          }
          if (vp === 'HISTORY') {
              return fetchAllPagesOf(buildBase());
          }
          if (vp === 'ALL') {
              // "TOTAL ABERTOS" mostra apenas OS não-terminais.
              return fetchAllPagesOf(buildBase().or(OPEN_OR));
          }
          const allowed: CanonicalPeriodT[] = ['TODAY', 'YESTERDAY', 'WEEK', 'MONTH', 'YEAR', 'CUSTOM'];
          const period = (allowed.includes(vp as CanonicalPeriodT) ? vp : 'TODAY') as CanonicalPeriodT;
          const [start, end] = getCanonicalDR(period, params.customStartDate, params.customEndDate);
          const s = start.toISOString();
          const e = end.toISOString();
          // Espelha a regra do filtro local (start_time como referência, com
          // fallback para created_at quando start_time é nulo).
          const rangeOr = `and(start_time.gte.${s},start_time.lte.${e}),and(start_time.is.null,created_at.gte.${s},created_at.lte.${e})`;
          const [inRange, open] = await Promise.all([
              fetchAllPagesOf(buildBase().or(rangeOr)),
              fetchAllPagesOf(buildBase().or(OPEN_OR)),
          ]);
          const byId = new Map<string, any>();
          for (const m of inRange) byId.set(m.id, m);
          for (const m of open) if (!byId.has(m.id)) byId.set(m.id, m);
          return Array.from(byId.values());
      };

      const [missionsData, clientTablesRes, providerTablesRes, clientsRes, providersRes] = await Promise.all([
          fetchScoped(),
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

          const fetchAllAgentPhones = async () => {
              if (agentNames.length === 0) return [];
              let all: any[] = [];
              let from = 0;
              const pageSize = 1000;
              while (true) {
                  const { data } = await supabase.from('agents').select('name, phone').not('phone', 'is', null).range(from, from + pageSize - 1);
                  if (data) all = all.concat(data);
                  if (!data || data.length < pageSize) break;
                  from += pageSize;
              }
              return all;
          };

          // PostgREST retorna no máximo 1000 linhas por chamada. Se houver
          // mais IDs do que isso, precisamos quebrar em lotes — caso contrário
          // veículos como o 1122 ficam de fora e o card mostra "VEÍCULO NÃO
          // LOCALIZADO" mesmo o registro existindo no banco.
          const fetchInChunks = async (table: string, columns: string, ids: any[], chunkSize = 500) => {
              if (ids.length === 0) return [] as any[];
              const chunks: any[][] = [];
              for (let i = 0; i < ids.length; i += chunkSize) chunks.push(ids.slice(i, i + chunkSize));
              const results = await Promise.all(chunks.map(c => supabase.from(table).select(columns).in('id', c)));
              return results.flatMap(r => r.data || []);
          };

          // Só veículos / veículos-do-cliente bloqueiam a renderização das
          // linhas (as placas aparecem nos cards). Telefones de agente e os
          // dados derivados (selos/contadores) são carregados DEPOIS, sem
          // travar a tabela — eles não são necessários para desenhar as OS.
          const [vehiclesRows, clientVehiclesRows] = await Promise.all([
              fetchInChunks('vehicles', '*', vehicleIds),
              fetchInChunks('client_vehicles', 'id, plate, model, brand, color', clientVehicleIds),
          ]);

          const vehicleMap = vehiclesRows.reduce((acc: any, v: any) => ({ ...acc, [v.id]: v }), {});
          const clientVehicleMap = clientVehiclesRows.reduce((acc: any, v: any) => ({ ...acc, [v.id.toString()]: v }), {});

          const clientNameMap = (clientsRes.data || []).reduce((acc: any, c: any) => {
              if (c.trading_name && c.trading_name.trim() !== '') acc[(c.name || '').trim().toUpperCase()] = c.trading_name.trim();
              return acc;
          }, {});

          const providerNameMap = (providersRes.data || []).reduce((acc: any, p: any) => {
              if (p.trading_name && p.trading_name.trim() !== '') acc[(p.name || '').trim().toUpperCase()] = p.trading_name.trim();
              return acc;
          }, {});

            // Publica os mapas de lookup para que o patch direcionado no realtime
            // consiga enriquecer uma única OS sem recarregar a lista inteira.
            lookupMapsRef.current = { vehicleMap, clientVehicleMap, clientNameMap, providerNameMap };

            const mapped: Mission[] = missionsData.map((m: any) => mapRawMissionRow(m));
            // Sincroniza o ref no mesmo tick para que callbacks realtime leiam o
            // snapshot recém-carregado sem esperar o useEffect de espelhamento.
            allMissionsRef.current = mapped;
            setAllMissions(mapped);
            initialFetchDoneRef.current = true;
            // Tabela já pode aparecer: liberamos o loader sem esperar telefones
            // de agente nem os dados derivados (selos/contadores).
            if (!silent) setIsLoading(false);

            // Telefones dos agentes — usados apenas nos botões de WhatsApp.
            // Fora do caminho crítico; chegam logo após a tabela aparecer.
            void (async () => {
                const allAgentPhones = await fetchAllAgentPhones();
                const agentPhoneIndex = new Map<string, string>();
                for (const a of allAgentPhones) {
                    if (a.name && a.phone) {
                        agentPhoneIndex.set(a.name, a.phone);
                        agentPhoneIndex.set(a.name.trim().toUpperCase(), a.phone);
                    }
                }
                const phonesMap: Record<string, string> = {};
                for (const name of agentNames) {
                    const phone = agentPhoneIndex.get(name) || agentPhoneIndex.get(name.trim().toUpperCase());
                    if (phone) phonesMap[name] = phone;
                }
                setAgentPhonesMap(phonesMap);
            })().catch(err => console.error('Erro ao carregar telefones de agente:', err));

            // Selos/contadores (aprovação, pedágio, evidência, logs, DHL) —
            // reconciliados em segundo plano; já têm versionamento próprio.
            void refreshDerivedData(mapped).catch(err => console.error('Erro ao carregar dados derivados:', err));
        }
      } catch (error: any) {
        console.error('Error fetching missions:', error.message || error);
        setDbStatus('error');
        showNotification('Erro', `Falha ao carregar monitoramento`, 'error');
      } finally {
        if (!silent) setIsLoading(false);
      }
    }, [showNotification, currentUser, isCommercial, isRestrictedClientView, mapRawMissionRow, refreshDerivedData]);

    // Mantém allMissionsRef sincronizado para leitura síncrona em callbacks.
    useEffect(() => { allMissionsRef.current = allMissions; }, [allMissions]);

    // Recarga total com debounce (coalesce de rajadas de eventos realtime e do
    // evento global 'refreshMissions').
    const scheduleFullRefetch = useCallback(() => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      refetchTimerRef.current = setTimeout(() => { fetchMissions(true); }, 800);
    }, [fetchMissions]);

    // Reconcilia apenas os dados derivados (contadores + mapas auxiliares) a
    // partir da lista atual, sem rebaixar missions/clientes/tabelas. Usado após
    // patch direcionado e quando o evento global chega durante a supressão.
    const scheduleAuxRefresh = useCallback(() => {
      if (auxTimerRef.current) clearTimeout(auxTimerRef.current);
      auxTimerRef.current = setTimeout(() => { refreshDerivedData(allMissionsRef.current); }, 900);
    }, [refreshDerivedData]);

    // Aplica uma mudança realtime de UMA OS direto no estado, sem rebaixar a
    // lista inteira. Em qualquer incerteza (mapa de lookup ausente, payload
    // incompleto) faz fallback para recarga total com debounce.
    const applyRealtimeMissionChange = useCallback((payload: any) => {
      try {
        // Se o snapshot inicial ainda não concluiu, um patch direcionado poderia
        // ser sobrescrito pelo fetch em andamento (race de startup). Faz recarga
        // total com debounce, que roda após o fetch inicial assentar.
        if (!initialFetchDoneRef.current) { scheduleFullRefetch(); return; }
        if (payload.eventType === 'DELETE') {
          const oldId = payload.old?.id;
          if (oldId == null) { scheduleFullRefetch(); return; }
          setAllMissions(prev => {
            const next = prev.filter(m => String(m.id) !== String(oldId));
            allMissionsRef.current = next;
            return next;
          });
          suppressFullRefetchUntilRef.current = Date.now() + 1500;
          scheduleAuxRefresh();
          return;
        }
        const row = payload.new;
        if (!row || row.id == null) { scheduleFullRefetch(); return; }
        const maps = lookupMapsRef.current;
        const needsVehicle = !!row.vehicle_id && !maps.vehicleMap[row.vehicle_id];
        const needsClientVehicle = !!row.client_vehicle && !maps.clientVehicleMap[row.client_vehicle?.toString()];
        if (needsVehicle || needsClientVehicle) { scheduleFullRefetch(); return; }
        const mappedRow = mapRawMissionRow(row);
        setAllMissions(prev => {
          const idx = prev.findIndex(m => String(m.id) === String(row.id));
          const next = idx === -1 ? [mappedRow, ...prev] : prev.slice();
          if (idx !== -1) next[idx] = mappedRow;
          allMissionsRef.current = next;
          // Contadores de solicitações/acidentes (baratos) atualizados na hora.
          const portal = next.filter(m => m.status === MissionStatus.SOLICITED && (m.currentLocation || '').includes('Solicitação via Portal'));
          setSolicitationCount(portal.length);
          setAccidentCount(portal.filter(m => (m.currentLocation || '').includes('ACIDENTE')).length);
          return next;
        });
        suppressFullRefetchUntilRef.current = Date.now() + 1500;
        // Reconcilia mapas auxiliares (aprovação/evidência/logs/DHL/pedágio) da
        // OS afetada de forma leve, sem rebaixar a lista inteira.
        scheduleAuxRefresh();
      } catch {
        scheduleFullRefetch();
      }
    }, [mapRawMissionRow, scheduleFullRefetch, scheduleAuxRefresh]);

    useEffect(() => {
      if (currentUser) {
          fetchMissions();
          // Patch direcionado só para usuários com acesso total (listas grandes).
          // Para visão restrita de cliente / comercial, o conjunto é pequeno e
          // filtrado no servidor — uma recarga total com debounce é mais segura.
          const canPatchInPlace = !isRestrictedClientView && !isCommercial;
          // Recalcula custo/receita das OS automaticamente ao abrir a tela
          // (silencioso, não altera tabelas de preço — apenas reflete tabelas atuais nas OS sem edição manual/aprovação).
          const role = (currentUser.role || '').toLowerCase();
          if (!isRestrictedClientView && ['diretoria', 'administrador', 'ceo', 'financeiro'].includes(role)) {
              authFetch('/api/recalculate-all', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
                  .then(r => r.json())
                  .then(data => { if (data?.success && data.updated > 0) fetchMissions(true); })
                  .catch(() => { /* silencioso */ });
          }
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
                // Em vez de rebaixar TODAS as OS a cada evento, aplica a mudança
                // de uma única OS direto no estado (acesso total) ou recarrega
                // com debounce (visão restrita/comercial).
                if (canPatchInPlace) applyRealtimeMissionChange(payload);
                else scheduleFullRefetch();
              }
            )
            .subscribe((status: string) => {
              if (status === 'SUBSCRIBED') {
                // Não recarregar no primeiro SUBSCRIBED: o efeito já fez o fetch
                // inicial. Em reconexões posteriores, ressincroniza com debounce.
                if (hasSubscribedOnceRef.current) {
                  console.log('[Realtime] Canal missions reconectado — ressincronizando...');
                  scheduleFullRefetch();
                } else {
                  hasSubscribedOnceRef.current = true;
                }
              }
              if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                console.warn('[Realtime] Canal missions desconectado — tentando reconexão em 3s...');
                setTimeout(() => { channel.subscribe(); }, 3000);
              }
            });
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
            .subscribe((status: string) => {
              if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                console.warn('[Realtime] Canal broadcast desconectado — tentando reconexão em 3s...');
                setTimeout(() => { broadcastChannel.subscribe(); }, 3000);
              }
            });
          const interval = setInterval(() => fetchMissions(true), 300000);
          // O evento global 'refreshMissions' também dispara para mudanças em
          // missions (via RealtimeProvider). Se um patch direcionado já tratou a
          // mudança há instantes, ignora para não fazer recarga total redundante.
          const handleExternalRefresh = () => {
            if (Date.now() < suppressFullRefetchUntilRef.current) {
              // Um patch direcionado já atualizou as OS há instantes. O evento
              // global pode ter vindo de mudanças correlatas (DHL, pedágio,
              // evidência, logs): reconcilia só os mapas derivados, sem rebaixar
              // a lista inteira.
              scheduleAuxRefresh();
              return;
            }
            scheduleFullRefetch();
          };
          window.addEventListener('refreshMissions', handleExternalRefresh);
          return () => {
            supabase.removeChannel(channel);
            supabase.removeChannel(broadcastChannel);
            clearInterval(interval);
            if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
            if (auxTimerRef.current) clearTimeout(auxTimerRef.current);
            window.removeEventListener('refreshMissions', handleExternalRefresh);
          };
      }
    }, [fetchMissions, currentUser, showNotification, isRestrictedClientView, isCommercial, applyRealtimeMissionChange, scheduleFullRefetch, scheduleAuxRefresh]);

    // Recarrega do servidor SÓ o período/datas selecionados quando o usuário
    // troca de período. Pula o mount (o efeito de assinatura acima já fez o
    // fetch inicial), evitando uma recarga dupla.
    const periodChangeInitRef = useRef(true);
    useEffect(() => {
      if (!currentUser) return;
      if (periodChangeInitRef.current) { periodChangeInitRef.current = false; return; }
      fetchMissions();
    }, [viewPeriod, customStartDate, customEndDate, currentUser, fetchMissions]);

    // Busca server-side por termo (OS, cliente, fornecedor, motorista, SE),
    // com debounce. Mantém a busca encontrando OS fora do período carregado,
    // já que agora só baixamos o intervalo selecionado.
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
      const term = (osFilterTerm.trim() || searchTerm.trim());
      if (term.length < 2) { setSearchMatches([]); return; }
      // Não busca antes do escopo de cliente estar resolvido (evita IDOR).
      if (!scopeReady) { setSearchMatches([]); return; }
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = setTimeout(async () => {
        try {
          const scope = clientScopeRef.current;
          if (scope.type === 'empty') { setSearchMatches([]); return; }
          let q = supabase.from('missions').select('*').order('created_at', { ascending: false });
          if (scope.type === 'eq') q = q.eq('client', scope.value!);
          else if (scope.type === 'in') q = q.in('client', scope.values!);
          // Sanitiza caracteres que quebram a sintaxe do filtro PostgREST.
          const like = `%${term.replace(/[%,().]/g, ' ')}%`;
          q = q.or(`id.ilike.${like},client.ilike.${like},provider.ilike.${like},driver_name.ilike.${like},dhl_se_number.ilike.${like}`);
          const { data } = await q.limit(300);
          if (data) setSearchMatches(data.map((m: any) => mapRawMissionRow(m)));
        } catch { /* silencioso */ }
      }, 400);
      return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
    }, [osFilterTerm, searchTerm, scopeReady, mapRawMissionRow]);
  
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
            if (viewPeriod === 'HISTORY') {
                return true;
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

    const negativeLinkedIds = useMemo(() => {
        const linkedIds = new Set<string>();
        const allSource = allMissions.length > 0 ? allMissions : periodMissions;
        const negativeMissions = allSource.filter(m => {
            const rev = m.revenue_value || 0;
            const cost = m.is_same_os ? 0 : (m.cost_value || 0);
            return (rev - cost) < 0;
        });
        const negativeIds = new Set(negativeMissions.map(m => m.id));
        for (const m of allSource) {
            if (m.is_same_os && m.parent_mission_id) {
                if (negativeIds.has(m.parent_mission_id)) {
                    linkedIds.add(m.id);
                }
                if (negativeIds.has(m.id)) {
                    linkedIds.add(m.parent_mission_id);
                }
            }
            if (parentMissionIds.has(m.id) && negativeIds.has(m.id)) {
                for (const child of allSource) {
                    if (child.parent_mission_id === m.id) {
                        linkedIds.add(child.id);
                    }
                }
            }
        }
        return linkedIds;
    }, [allMissions, periodMissions, parentMissionIds]);

    const filteredBySpecialCriteria = useMemo(() => {
        const isSearching = searchTerm && searchTerm.trim().length > 0;
        const hasActiveSpecialFilters = showPendingOnly || showTomorrowOnly || showMyApprovalOnly || showNegativeMarginOnly || showTollNotConfirmedOnly;
        const isOsFiltering = osFilterTerm && osFilterTerm.trim().length > 0;

        const needsAllMissions = showPendingOnly || showTomorrowOnly || showMyApprovalOnly || showNegativeMarginOnly || showTollNotConfirmedOnly || isOsFiltering;
        let sourceMissions: Mission[];
        if (isSearching || isOsFiltering) {
            // Combina o que já está carregado com os resultados da busca
            // server-side (que podem estar fora do período atual).
            const byId = new Map<string, Mission>();
            for (const m of allMissions) byId.set(m.id, m);
            for (const m of searchMatches) if (!byId.has(m.id)) byId.set(m.id, m);
            sourceMissions = Array.from(byId.values());
        } else {
            sourceMissions = needsAllMissions ? allMissions : periodMissions;
        }

        return sourceMissions.filter(mission => {
            if (isOsFiltering) {
                const osLower = osFilterTerm.toLowerCase().trim();
                const missionIdLower = (mission.id || '').toLowerCase();
                const seLower = String((mission as any).dhl_se_number || '').toLowerCase();
                const matchesOs = missionIdLower.includes(osLower)
                    || missionIdLower.replace('gtm-', '').includes(osLower.replace('gtm-', ''))
                    || (seLower && seLower.includes(osLower.replace('se-', '').replace('se:', '').trim()));
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
                    (mission.driver_name || '').toLowerCase().includes(searchLower) ||
                    String((mission as any).dhl_se_number || '').toLowerCase().includes(searchLower);
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

            if (showTollNotConfirmedOnly) {
                const isCompletedUnapproved = mission.status === MissionStatus.COMPLETED && !mission.billing_approved;
                if (!isCompletedUnapproved) return false;
                if (tollConfirmMap[mission.id]) return false;
            }

            if (showNegativeMarginOnly) {
                const rev = mission.revenue_value || 0;
                const cost = mission.is_same_os ? 0 : (mission.cost_value || 0);
                const resultado = rev - cost;
                const isNegative = resultado < 0;
                const isLinkedToNegative = negativeLinkedIds.has(mission.id);
                if (!isNegative && !isLinkedToNegative) return false;
            }

            {
                const cName = ((mission as any).originalClientName || mission.client || '').toUpperCase();
                const isDhl = cName.includes('DHL');
                if (showDhlOnly && !isDhl) return false;
                if (!showDhlOnly && isDhl) return false;
            }

            return true;
        });
    }, [allMissions, periodMissions, searchMatches, searchTerm, osFilterTerm, showPendingOnly, showTomorrowOnly, showMyApprovalOnly, showNegativeMarginOnly, showTollNotConfirmedOnly, tollConfirmMap, showDhlOnly, parentMissionIds, negativeLinkedIds]);

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
    const tollNotConfirmedCount = useMemo(() => {
        return allMissions.filter(m => m.status === MissionStatus.COMPLETED && !m.billing_approved && !tollConfirmMap[m.id]).length;
    }, [allMissions, tollConfirmMap]);
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
        if (nameLower.includes('daniel') || nameLower.includes('michelle')) return 'auditor';
        if (nameLower.includes('barbara') || nameLower.includes('bárbara') || roleLower === 'administrador') return 'financeiro';
        if (nameLower.includes('thiago moreira') || roleLower === 'diretoria') return 'diretoria';
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
        // Ordena sempre da mais recente para a mais antiga (por data de
        // agendamento; se não houver, cai para a data de criação) — evita
        // que a fila de aprovações fique misturada e fora de ordem.
        const sortByDateDesc = (list: Mission[]) => [...list].sort((a, b) => {
            const ta = new Date(a.startTime || a.createdAt || 0).getTime();
            const tb = new Date(b.startTime || b.createdAt || 0).getTime();
            return tb - ta;
        });
        if (myApprovalStage === 'diretoria') {
            if (approvalViewStage === 'auditor') return sortByDateDesc(pendingByStage.auditor);
            if (approvalViewStage === 'financeiro') return sortByDateDesc(pendingByStage.financeiro);
            const allIds = new Set([
                ...pendingByStage.auditor.map(m => m.id),
                ...pendingByStage.financeiro.map(m => m.id),
                ...pendingByStage.diretoria.map(m => m.id),
            ]);
            return sortByDateDesc(eligibleApprovalMissions.filter(m => allIds.has(m.id)));
        }
        return sortByDateDesc(pendingByStage[myApprovalStage] || []);
    }, [myApprovalStage, pendingByStage, eligibleApprovalMissions, approvalViewStage]);

    const myApprovalCount = myApprovalMissions.length;
  
    const filteredMissions = useMemo(() => {
        const isSearching = searchTerm && searchTerm.trim().length > 0;
        const isOsFiltering = osFilterTerm && osFilterTerm.trim().length > 0;
        const hasActiveSpecialFilters = showPendingOnly || showTomorrowOnly || showMyApprovalOnly || showNegativeMarginOnly || showTollNotConfirmedOnly || showDhlOnly;

        if (showMyApprovalOnly && myApprovalMissions.length > 0) {
            const list = showDhlOnly
                ? myApprovalMissions.filter(m => (((m as any).originalClientName || m.client || '') as string).toUpperCase().includes('DHL'))
                : myApprovalMissions;
            return list;
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
                         MissionStatus.PENDING
                     ];
                     if (hiddenStatuses.includes(mission.status as MissionStatus)) return false;
                }
            }
            return true;
        });
    }, [filteredBySpecialCriteria, filterStatus, searchTerm, osFilterTerm, showPendingOnly, showTomorrowOnly, showMyApprovalOnly, showNegativeMarginOnly, showTollNotConfirmedOnly, showDhlOnly, myApprovalMissions]);
  
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

    // Paginação: fatia conforme o tamanho de página escolhido (10 ou 100).
    const totalPages = Math.max(1, Math.ceil(sortedMissions.length / PAGE_SIZE));
    const safePage = Math.min(currentPage, totalPages);
    const pagedMissions = useMemo(() => {
        const start = (safePage - 1) * PAGE_SIZE;
        return sortedMissions.slice(start, start + PAGE_SIZE);
    }, [sortedMissions, safePage, PAGE_SIZE]);

    // Reset pra página 1 sempre que algum filtro ou o tamanho de página mudar
    useEffect(() => { setCurrentPage(1); }, [searchTerm, osFilterTerm, filterStatus, viewPeriod, customStartDate, customEndDate, showPendingOnly, showTomorrowOnly, showMyApprovalOnly, showNegativeMarginOnly, showTollNotConfirmedOnly, approvalViewStage, pageSize]);

    const handleOpenUpdateModal = (mission: Mission) => { setSelectedMission(mission); setIsUpdateModalOpen(true); };
    const handleUpdateSuccess = (reportText?: string) => { setIsUpdateModalOpen(false); setSelectedMission(null); fetchMissions(true); if (reportText) handleCopyToClipboard(reportText, 'relatorio', true); };
    const handleOpenStatusModal = async (mission: Mission) => { setMissionForStatusView(mission); setIsStatusModalOpen(true); const { data } = await supabase.from('mission_logs').select('*').eq('mission_id', mission.id).order('created_at', { ascending: false }); if (data) setMissionLogs(data as MissionLog[]); };
    const handleOpenFinancialModal = (mission: Mission) => { setMissionForFinancials(mission); setIsFinancialModalOpen(true); };

    // Task #116: deep-link ?openMission=<id> abre o modal financeiro da OS
    // correspondente assim que as missões forem carregadas (uma única vez por
    // sessão). Usado pelo badge "Memória do Auditor" para abrir a OS de origem
    // da sugestão em outra aba.
    const openMissionDeepLinkConsumedRef = useRef(false);
    useEffect(() => {
        if (openMissionDeepLinkConsumedRef.current) return;
        try {
            const params = new URLSearchParams(window.location.search);
            const targetId = params.get('openMission');
            if (!targetId) return;
            const consume = (mission: Mission) => {
                openMissionDeepLinkConsumedRef.current = true;
                setMissionForFinancials(mission);
                setIsFinancialModalOpen(true);
                params.delete('openMission');
                const qs = params.toString();
                const newUrl = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
                window.history.replaceState({}, '', newUrl);
            };
            const found = allMissions.find(m => String(m.id) === String(targetId));
            if (found) { consume(found); return; }
            // Não está no período carregado: só busca direto por id após o
            // primeiro carregamento concluir (evita fetch prematuro).
            if (!initialFetchDoneRef.current) return;
            openMissionDeepLinkConsumedRef.current = true;
            (async () => {
                try {
                    // Aplica o MESMO escopo de cliente usado em fetchMissions —
                    // caso contrário um usuário restrito poderia abrir a OS de
                    // outro cliente via ?openMission=<id> (não há RLS).
                    const sc = clientScopeRef.current;
                    if (sc.type === 'empty') return;
                    let q = supabase.from('missions').select('*').eq('id', targetId);
                    if (sc.type === 'eq') q = q.eq('client', sc.value!);
                    else if (sc.type === 'in') q = q.in('client', sc.values!);
                    const { data } = await q.single();
                    if (data) {
                        const mapped = mapRawMissionRow(data);
                        setMissionForFinancials(mapped);
                        setIsFinancialModalOpen(true);
                        params.delete('openMission');
                        const qs = params.toString();
                        const newUrl = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
                        window.history.replaceState({}, '', newUrl);
                    }
                } catch { /* ignore */ }
            })();
        } catch { /* ignore */ }
    }, [allMissions, mapRawMissionRow]);
    const handleOpenPrintModal = (mission: Mission) => { setMissionForPrint(mission); setIsPrintModalOpen(true); };
    const handleDeleteClick = (mission: Mission) => { setMissionToDelete(mission); setDeletePassword(''); setCancelEscortAtOrigin(null); setIsDeleteModalOpen(true); };
    
    const handleCopyMission = async (mission: Mission) => {
        const dateObj = new Date(mission.startTime || mission.createdAt);
        const dateStr = dateObj.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const timeStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
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
        const isDHL = /DHL/i.test(mission.client || '');
        const fmtTime = (iso?: string) => {
            if (!iso) return '';
            try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }); } catch { return ''; }
        };
        let dhlOriginAt = '', dhlInTransitAt = '', dhlCompletedAt = '';
        if (isDHL) {
            try {
                const { data: statusHist } = await supabase
                    .from('mission_history')
                    .select('changed_at,new_value')
                    .eq('mission_id', mission.id)
                    .eq('field_name', 'status')
                    .order('changed_at', { ascending: false });
                if (statusHist) {
                    const lastOf = (val: string) => (statusHist as any[]).find(h => h.new_value === val)?.changed_at;
                    dhlOriginAt = fmtTime(lastOf('Origem'));
                    dhlInTransitAt = fmtTime(lastOf('Em Viagem'));
                    dhlCompletedAt = fmtTime(lastOf('Concluída'));
                }
            } catch {}
        }
        const text = isDHL ? `*ESCOLTA ARMADA*⚡️

🗒️ *SE:* ${(mission.dhl_se_number || '').toString().trim().toUpperCase()}
🚔 *VIATURA:* ${mission.vehicleId || ''}
🥷 *AGT 1:* ${formatFL(mission.agent1)}
🥷 *AGT 2:* ${formatFL(mission.agent2)}

👔 *CLIENTE:* DHL
🏦 *ORIGEM:* ${mission.origin || ''}
🏭 *DESTINO:* ${(mission.destination || '').replace(/\s*[—-]\s*DESTINO\s+A\s+DEFINIR\s*$/i, '').trim()}
👨‍🦰 *MOTORISTA:* ${formatFL(mission.driver_name)}
📞 *FONE:* ${mission.driver_phone || ''}
🚛 *CAVALO:* ${mission.clientVehicle?.plate || ''}
🚛 *CARRETA:* ${mission.clientVehicle2?.plate || ''}

🕑 *INÍCIO PREVISTO:* ${fmtTime(mission.createdAt)}
🕑 *CHEGADA NA ORIGEM:* ${dhlOriginAt}
🧭 *INÍCIO DE OPERAÇÃO:* ${dhlInTransitAt}
🧭 *FIM DE OPERAÇÃO:* ${dhlCompletedAt}

🖋️ *STATUS:* ${mission.status.toUpperCase()}${mission.currentLocation ? ' — ' + locationParts[0].trim().toUpperCase() : ''}` : `*MONITORAMENTO GRUPO TMSEG*
*OS:* ${mission.id} | *STATUS:* ${mission.status.toUpperCase()}

🗓 *DATA:* ${dateStr} *HORA:* ${timeStr}
🛡 *OPERAÇÃO:* ${mission.mission_type?.toUpperCase() || 'CARACTERIZADA'}
🏢 *CLIENTE:* ${mission.client}

📍 *ORIGEM:* ${mission.origin || 'N/A'}
🏁 *DESTINO:* ${(mission.destination || 'N/A').replace(/\s*[—-]\s*DESTINO\s+A\s+DEFINIR\s*$/i, '').trim() || 'N/A'}

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
            const res = await authFetch('/api/email/mission-resend-client', {
                method: 'POST',
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
    const confirmDelete = async () => {
        if (!missionToDelete || cancelEscortAtOrigin === null) return;
        setIsDeleting(true);
        try {
            const updateData: any = {
                status: 'Cancelada',
            };
            if (!cancelEscortAtOrigin) {
                updateData.revenue_value = 0;
                updateData.cost_value = 0;
                updateData.toll_value = 0;
                updateData.toll_value_provider = 0;
                updateData.valor_zero_motivo = 'Cancelada — escolta não estava na origem';
            } else {
                const currentToll = Number(missionToDelete.toll_value) || 0;
                if (currentToll > 0) {
                    updateData.toll_value_provider = currentToll;
                }
            }
            const { error } = await supabase.from('missions').update(updateData).eq('id', missionToDelete.id).select('id').single();
            if (error) throw error;
            const motivo = cancelEscortAtOrigin ? 'Escolta na origem — valores mantidos' : 'Escolta NÃO na origem — valores zerados';
            await logAction('UPDATE', 'Mission', missionToDelete.id, `Missão cancelada por ${currentUser?.name}. ${motivo}`);

            try {
                await authFetch('/api/dhl/intake/cancel-by-mission', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ missionId: missionToDelete.id })
                });
            } catch (intakeErr) {
                console.warn('[Cancel] Falha ao invalidar links DHL do fornecedor:', intakeErr);
            }

            try {
                const emailRes = await authFetch(`/api/missions/${missionToDelete.id}/cancel-missing-info-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
                const emailData = await emailRes.json();
                if (emailData.sent) {
                    console.log(`[Cancel] Email enviado — campos faltantes: ${emailData.missingFields?.join(', ')}`);
                }
            } catch (emailErr) {
                console.warn('[Cancel] Falha ao verificar/enviar email de dados faltantes:', emailErr);
            }

            showNotification('Sucesso', `Missão cancelada. ${motivo}.`, 'success');
            setIsDeleteModalOpen(false);
            setMissionToDelete(null);
            setCancelEscortAtOrigin(null);
            fetchMissions(true);
        } catch (error: any) {
            showNotification('Erro', error.message, 'error');
        } finally {
            setIsDeleting(false);
        }
    };
    const handleSearchHistory = async () => { if (!searchHistoryId.trim()) return; let sid = searchHistoryId.trim().toUpperCase(); if (!sid.startsWith('GTM-') && !isNaN(Number(sid))) sid = `GTM-${sid.padStart(4, '0')}`; setHistoryMissionId(sid); setIsHistoryModalOpen(true); };
    const handleViewHistory = (mission: Mission) => { setHistoryMissionId(mission.id); setIsHistoryModalOpen(true); };
  
    return (
      <div className="space-y-6 animate-fade-in pb-20 relative">
        <div className={`p-6 rounded-xl shadow-sm border flex flex-col gap-6 ${isCevaClient ? 'bg-[#152c54] border-[#152c54]' : 'bg-white border-gray-200'}`}>
          <div className="flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-6">
          <div className="2xl:w-[350px] shrink-0">
            <div className="flex items-center gap-3">
              <span className={`w-1.5 h-6 rounded-full ${isCevaClient ? 'bg-[#e81818]' : 'bg-red-700'}`}></span>
              <h2 className={`text-xl font-bold ${isCevaClient ? 'text-white' : 'text-gray-900'}`}>Monitoramento de Missões</h2>
            </div>
            {dbStatus === 'ok' && !isRestrictedClientView && ( <div className={`flex items-center gap-2 text-[10px] font-bold px-2 py-1 rounded w-fit border mt-2 ml-4.5 ${isCevaClient ? 'text-green-300 bg-green-900/30 border-green-700' : 'text-green-700 bg-green-50 border-green-200'}`}><Database size={12} /> Realtime Sync</div> )}
          </div>
          <div className="flex flex-wrap gap-2 items-center justify-end 2xl:flex-1">
                {!isRestrictedClientView && ( <div className="flex items-center gap-2 bg-indigo-50 p-1.5 rounded-lg border border-indigo-200"><input type="text" className="bg-transparent text-xs font-bold text-indigo-900 placeholder-indigo-400 outline-none w-32 pl-2" placeholder="Filtrar OS..." value={osFilterTerm} onChange={(e) => setOsFilterTerm(e.target.value)} data-testid="input-os-filter" />{osFilterTerm && <button onClick={() => setOsFilterTerm('')} className="p-1 bg-indigo-600 text-white rounded hover:bg-indigo-700" data-testid="button-clear-os-filter"><X size={14} /></button>}</div> )}
                <button onClick={() => setShowFleetMap(!showFleetMap)} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-[11px] font-bold uppercase transition-all border ${showFleetMap ? (isCevaClient ? 'bg-[#e81818] text-white border-[#e81818] shadow-md' : 'bg-indigo-600 text-white border-indigo-700 shadow-md') : (isCevaClient ? 'bg-white/10 text-white border-white/30 hover:bg-white/20' : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50')}`}><Globe size={14} /> Mapa</button>
                {!isRestrictedClientView && ( <button onClick={() => setShowAnalyticsDash(!showAnalyticsDash)} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-[11px] font-bold uppercase transition-all border ${showAnalyticsDash ? 'bg-blue-600 text-white border-blue-700 shadow-md' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}><BarChart4 size={14} /> Analytics</button> )}
                {isRestrictedClientView && ( <button onClick={() => { setShowClientDash(!showClientDash); if (!showClientDash) { setShowClientReports(false); setShowClientCommittee(false); } }} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-[11px] font-bold uppercase transition-all border ${showClientDash ? (isCevaClient ? 'bg-[#e81818] text-white border-[#e81818] shadow-md' : 'bg-red-700 text-white border-red-800 shadow-md') : (isCevaClient ? 'bg-white/10 text-white border-white/30 hover:bg-white/20' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50')}`} data-testid="button-client-dashboard"><BarChart4 size={14} /> Painel</button> )}
                {isRestrictedClientView && ( <button onClick={() => { setShowClientReports(!showClientReports); if (!showClientReports) { setShowClientDash(false); setShowClientCommittee(false); } }} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-[11px] font-bold uppercase transition-all border ${showClientReports ? (isCevaClient ? 'bg-[#e81818] text-white border-[#e81818] shadow-md' : 'bg-red-700 text-white border-red-800 shadow-md') : (isCevaClient ? 'bg-white/10 text-white border-white/30 hover:bg-white/20' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50')}`} data-testid="button-client-reports"><Activity size={14} /> Relatórios</button> )}
                {isRestrictedClientView && ( <button onClick={() => { setShowClientCommittee(!showClientCommittee); if (!showClientCommittee) { setShowClientDash(false); setShowClientReports(false); } }} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-[11px] font-bold uppercase transition-all border ${showClientCommittee ? (isCevaClient ? 'bg-[#e81818] text-white border-[#e81818] shadow-md' : 'bg-red-700 text-white border-red-800 shadow-md') : (isCevaClient ? 'bg-white/10 text-white border-white/30 hover:bg-white/20' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50')}`} data-testid="button-client-committee"><FileSearch size={14} /> Comitê</button> )}
                <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-200"><Calendar size={14} className="text-gray-500 ml-1" /><select value={viewPeriod} onChange={(e) => setViewPeriod(e.target.value)} className="bg-transparent border-none text-[11px] font-bold text-gray-700 outline-none cursor-pointer uppercase focus:ring-0"><option value="TODAY">HOJE</option><option value="YESTERDAY">ONTEM</option><option value="WEEK">SEMANA</option><option value="MONTH">MÊS</option><option value="YEAR">ANO</option><option value="CUSTOM">PERSONALIZADO</option><option value="ALL">TOTAL ABERTOS</option><option value="HISTORY">HISTÓRICO</option></select></div>
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

          {!isRestrictedClientView && (
          <div className="flex flex-wrap gap-3 w-full justify-start">
             <div className="w-full sm:w-[320px] sm:shrink-0">
                <DailyGoalThermometer 
                   viewPeriod={viewPeriod} 
                   customStartDate={customStartDate} 
                   customEndDate={customEndDate}
                   missions={allMissions}
                   clientTables={clientTables}
                   providerTables={providerTables}
                   clientsData={clientsData}
                   onRefreshMissions={() => fetchMissions(true)}
                   clientFilter={(name) => {
                     const n = (name || '').toUpperCase();
                     return !n.includes('DHL SUPPLY CHAIN') && !n.includes('DHL LOGISTICS');
                   }}
                   dailyGoalOverride={35000}
                   monthlyGoalOverride={35000 * 20}
                />
             </div>
             <div className="w-full sm:w-[320px] sm:shrink-0">
                <DailyGoalThermometer 
                   viewPeriod={viewPeriod} 
                   customStartDate={customStartDate} 
                   customEndDate={customEndDate}
                   missions={allMissions}
                   clientTables={clientTables}
                   providerTables={providerTables}
                   clientsData={clientsData}
                   onRefreshMissions={() => fetchMissions(true)}
                   clientFilter={(name) => {
                     const n = (name || '').toUpperCase();
                     return n.includes('DHL SUPPLY CHAIN') || n.includes('DHL LOGISTICS');
                   }}
                   dailyGoalOverride={40000}
                   monthlyGoalOverride={40000 * 20}
                   titleSuffix="DHL"
                   accentClass="from-yellow-400 to-red-600"
                />
             </div>
             <div className="w-full sm:w-[320px] sm:shrink-0">
                <DailyGoalThermometer 
                   viewPeriod={viewPeriod} 
                   customStartDate={customStartDate} 
                   customEndDate={customEndDate}
                   missions={allMissions}
                   clientTables={clientTables}
                   providerTables={providerTables}
                   clientsData={clientsData}
                   onRefreshMissions={() => fetchMissions(true)}
                   dailyGoalOverride={35000 + 40000}
                   monthlyGoalOverride={(35000 + 40000) * 20}
                   titleSuffix="TOTAL"
                   accentClass="from-blue-500 to-indigo-700"
                />
             </div>
             {canSeeFinancials && lossesCount > 0 && (
             <div className="w-full sm:w-auto sm:shrink-0 flex items-stretch">
                <button
                   onClick={() => setIsLossesOpen(true)}
                   className="group w-full sm:w-[200px] h-full min-h-[110px] flex flex-col items-center justify-center gap-1.5 px-4 py-3 rounded-[35px] bg-gradient-to-br from-red-500 to-orange-600 text-white shadow-[0_20px_50px_rgba(239,68,68,0.25)] hover:shadow-[0_25px_60px_rgba(239,68,68,0.4)] hover:-translate-y-0.5 transition-all border-x border-t border-b-4 border-red-700/40"
                   title={`Listar OS onde o custo do fornecedor superou a receita do cliente (${lossesCount} OS)`}
                   data-testid="button-open-losses"
                >
                   <TrendingDown size={22} strokeWidth={2.5} className="drop-shadow" />
                   <span className="text-[11px] font-black uppercase tracking-wider leading-tight text-center">OS com Prejuízo</span>
                   <span className="text-[10px] font-black uppercase tracking-widest bg-white/20 px-2 py-0.5 rounded-full">{lossesCount} {lossesCount === 1 ? 'OS' : 'OS'}</span>
                </button>
             </div>
             )}
             {canSeeMissingTableAlert && missingTableCount > 0 && (
             <div className="w-full sm:w-auto sm:shrink-0 flex items-stretch">
                <button
                   onClick={() => setIsMissingTableOpen(true)}
                   className="group w-full sm:w-[200px] h-full min-h-[110px] flex flex-col items-center justify-center gap-1.5 px-4 py-3 rounded-[35px] bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-[0_20px_50px_rgba(245,158,11,0.25)] hover:shadow-[0_25px_60px_rgba(245,158,11,0.4)] hover:-translate-y-0.5 transition-all border-x border-t border-b-4 border-amber-700/40 animate-pulse"
                   title={`Listar OS sem tabela de preço (cliente) ou de custo (fornecedor) (${missingTableCount} OS)`}
                   data-testid="button-open-missing-table"
                >
                   <AlertTriangle size={22} strokeWidth={2.5} className="drop-shadow" />
                   <span className="text-[11px] font-black uppercase tracking-wider leading-tight text-center">OS sem Tabela</span>
                   <span className="text-[10px] font-black uppercase tracking-widest bg-white/20 px-2 py-0.5 rounded-full">{missingTableCount} {missingTableCount === 1 ? 'OS' : 'OS'}</span>
                </button>
             </div>
             )}
          </div>
          )}
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
            <StatCard icon={Activity} title={totalVolumeCount < allMissions.length ? `Total (${allMissions.length})` : "Total"} value={totalVolumeCount} bgColor="bg-gray-800" loading={isLoading} isActive={filterStatus === 'ALL' && !showPendingOnly && !showTomorrowOnly && !showMyApprovalOnly && !showNegativeMarginOnly && !showTollNotConfirmedOnly} onClick={() => { setFilterStatus('ALL'); setShowPendingOnly(false); setShowTomorrowOnly(false); setShowMyApprovalOnly(false); setApprovalViewStage(null); setShowNegativeMarginOnly(false); setShowTollNotConfirmedOnly(false); }} />
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

                    {myApprovalStage === 'diretoria' && (
                        <>
                        <button 
                            data-testid="button-approvals-daniel"
                            onClick={() => { 
                                const isActive = showMyApprovalOnly && approvalViewStage === 'auditor';
                                setShowMyApprovalOnly(!isActive); 
                                setApprovalViewStage(!isActive ? 'auditor' : null); 
                            }} 
                            className={`relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-black uppercase border transition-all ${
                                showMyApprovalOnly && approvalViewStage === 'auditor'
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
                            onClick={() => { 
                                const isActive = showMyApprovalOnly && approvalViewStage === 'financeiro';
                                setShowMyApprovalOnly(!isActive); 
                                setApprovalViewStage(!isActive ? 'financeiro' : null); 
                            }} 
                            className={`relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-black uppercase border transition-all ${
                                showMyApprovalOnly && approvalViewStage === 'financeiro'
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
            <div className="flex flex-wrap items-center gap-2 md:gap-3 text-xs text-gray-500 w-full md:w-auto justify-start md:justify-end">
              {!isRestrictedClientView && (
                <button
                  data-testid="button-dhl-only"
                  onClick={() => setShowDhlOnly(!showDhlOnly)}
                  title="Mostrar somente OS de clientes DHL"
                  className={`relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase border-2 transition-all shadow-md ${
                    showDhlOnly
                      ? 'bg-gradient-to-r from-yellow-400 to-yellow-300 text-red-700 border-red-600 scale-105 ring-2 ring-red-500/30 animate-pulse'
                      : 'bg-white text-red-700 border-yellow-400 hover:bg-yellow-50 hover:scale-105'
                  }`}
                >
                  {showDhlOnly ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                  <span className="flex items-center gap-1.5 tracking-wider">OPERAÇÕES DHL{showDhlOnly && <span className="text-[8px] font-black bg-red-700 text-white px-1.5 py-0.5 rounded">ON</span>}</span>
                </button>
              )}
              {!isRestrictedClientView && (
                <button
                  data-testid="button-dhl-solicitation"
                  onClick={() => setShowDhlSolicitation(true)}
                  title="Gerar mensagem de solicitação para fornecedor a partir do print da DHL"
                  className="relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase border-2 transition-all shadow-md bg-white text-red-700 border-red-500 hover:bg-red-50 hover:scale-105"
                >
                  <Sparkles size={16} />
                  <span className="tracking-wider">Solicitação DHL - Fornecedor</span>
                </button>
              )}
              <div className="flex items-center gap-2">
                <span className="hidden md:inline">Filtrados:</span>
                <span className="font-bold text-gray-800 bg-gray-200 px-2 py-1 rounded">{filteredMissions.length}</span>
              </div>
            </div></div>
  

          <div className="bg-gray-50/5 p-4 min-h-[400px]">
              {isLoading ? ( <div className="flex flex-col items-center justify-center h-64 text-gray-400"><Loader2 size={32} className="animate-spin mb-2 text-red-600" /><p className="text-sm font-medium">Carregando...</p></div> ) : sortedMissions.length === 0 ? ( <div className="relative flex flex-col items-center justify-center h-64 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl bg-white overflow-hidden">
                  <svg viewBox="0 0 320 80" className="absolute h-32 opacity-[0.06] pointer-events-none" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <g transform="translate(10, 5) scale(0.85)"><path d="M40 5 L10 15 V35 C10 55 25 70 40 75 C55 70 70 55 70 35 V15 L40 5 Z" stroke="#000" strokeWidth="4" fill="none" strokeLinejoin="round"/><path d="M20 50 Q40 65 60 40" stroke="#b91c1c" strokeWidth="6" strokeLinecap="round"/><path d="M28 22 L40 22 L40 55" stroke="#000" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/><path d="M45 22 L55 38 L65 22 L65 55 M45 55 L45 22" stroke="#000" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></g>
                      <text x="95" y="52" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="34" fill="#000" letterSpacing="3">GRUPO TMSEG</text>
                  </svg>
                  <p className="text-sm font-bold text-gray-500 relative z-10">Nenhuma missão encontrada para este filtro.</p>
              </div> ) : (
                <>
                  {/* Barra de rolagem horizontal SUPERIOR — espelha a inferior */}
                  <div
                    ref={topScrollRef}
                    style={{ height: 14 }}
                    className="overflow-x-scroll overflow-y-hidden sticky top-2 z-20 mb-2 rounded-full bg-[#13151f] [scrollbar-color:#2d3748_#13151f] [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-track]:bg-[#13151f] [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#3b4252] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-[#13151f] [&::-webkit-scrollbar-thumb:hover]:bg-[#4a5568]"
                    onScroll={() => { if (mainScrollRef.current && topScrollRef.current && !syncingFromMainRef.current) { syncingFromTopRef.current = true; mainScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft; requestAnimationFrame(() => { syncingFromTopRef.current = false; }); } }}
                    data-testid="mission-list-scroll-top"
                    aria-hidden="true"
                  >
                    <div style={{ width: topMirrorWidth, height: 1 }} />
                  </div>
                  <div
                    ref={mainScrollRef}
                    className="overflow-x-auto overflow-y-hidden pb-2 rounded-lg [scrollbar-color:#2d3748_#13151f] [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-track]:bg-[#13151f] [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#2d3748] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-[#13151f] [&::-webkit-scrollbar-thumb:hover]:bg-[#4a5568]"
                    onScroll={() => { if (mainScrollRef.current && topScrollRef.current && !syncingFromTopRef.current) { syncingFromMainRef.current = true; topScrollRef.current.scrollLeft = mainScrollRef.current.scrollLeft; requestAnimationFrame(() => { syncingFromMainRef.current = false; }); } }}
                    data-testid="mission-list-scroll"
                  >
                    <div ref={mainContentRef} className="flex flex-col gap-3 lg:min-w-[1100px]">
                      {pagedMissions.map((mission) => {
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
                                      dhlIntake={dhlIntakeMap[mission.id]}
                                      tollConfirmation={tollConfirmMap[mission.id]}
                                      onEvidenceUploaded={() => fetchMissions(true)}
                                  />
                              </div>
                          );
                      })}
                    </div>
                  </div>
                </>
              )}
              {!isLoading && sortedMissions.length > Math.min(...PAGE_SIZE_OPTIONS) && (
                <div className="flex flex-wrap items-center justify-between gap-3 mt-4 px-2 py-3 bg-white border border-gray-200 rounded-lg" data-testid="pagination-bar">
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-gray-600 font-medium">
                      Mostrando <span className="font-bold text-gray-900">{(safePage - 1) * PAGE_SIZE + 1}</span>
                      {' – '}
                      <span className="font-bold text-gray-900">{Math.min(safePage * PAGE_SIZE, sortedMissions.length)}</span>
                      {' de '}
                      <span className="font-bold text-gray-900">{sortedMissions.length}</span> OS
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label htmlFor="select-page-size" className="text-xs text-gray-600 font-medium">Por página:</label>
                      <select
                        id="select-page-size"
                        value={pageSize}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setPageSize(v);
                          try { localStorage.setItem('missionTablePageSize', String(v)); } catch {}
                        }}
                        data-testid="select-page-size"
                        className="px-2 py-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer"
                      >
                        {PAGE_SIZE_OPTIONS.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage(1)}
                      disabled={safePage === 1}
                      data-testid="btn-page-first"
                      className="px-2.5 py-1.5 text-xs font-bold rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >«</button>
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={safePage === 1}
                      data-testid="btn-page-prev"
                      className="px-3 py-1.5 text-xs font-bold rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >‹ Anterior</button>
                    <span className="px-3 py-1.5 text-xs font-bold text-gray-700 bg-gray-100 rounded-md min-w-[80px] text-center" data-testid="text-page-info">
                      {safePage} / {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={safePage >= totalPages}
                      data-testid="btn-page-next"
                      className="px-3 py-1.5 text-xs font-bold rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >Próxima ›</button>
                    <button
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={safePage >= totalPages}
                      data-testid="btn-page-last"
                      className="px-2.5 py-1.5 text-xs font-bold rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >»</button>
                  </div>
                </div>
              )}
          </div>
        </div>
  
        {isStatusModalOpen && <MissionStatusModal isOpen={isStatusModalOpen} onClose={() => setIsStatusModalOpen(false)} mission={missionForStatusView!} logs={missionLogs} onUpdate={() => fetchMissions(true)} hideProviderInfo={isRestrictedClientView} />}
        {isFinancialModalOpen && <MissionFinancialModal isOpen={isFinancialModalOpen} onClose={() => setIsFinancialModalOpen(false)} mission={missionForFinancials} onUpdate={() => fetchMissions(true)} />}
        {isLossesOpen && canSeeFinancials && (
          <LossesDialog
            isOpen={isLossesOpen}
            onClose={() => setIsLossesOpen(false)}
            missions={allMissions}
            clientTables={clientTables}
            providerTables={providerTables}
            clientsData={clientsData}
            viewPeriod={viewPeriod}
            customStartDate={customStartDate}
            customEndDate={customEndDate}
            onOpenMission={(m) => handleOpenFinancialModal(m)}
          />
        )}
        {isMissingTableOpen && canSeeMissingTableAlert && (
          <MissingTableDialog
            isOpen={isMissingTableOpen}
            onClose={() => setIsMissingTableOpen(false)}
            rows={missingTableRows}
            viewPeriod={viewPeriod}
            onOpenMission={(m) => handleOpenFinancialModal(m)}
          />
        )}
        {isHistoryModalOpen && <MissionHistoryModal missionId={historyMissionId} onClose={() => setIsHistoryModalOpen(false)} />}
        {isUpdateModalOpen && <UpdateMissionModal isOpen={isUpdateModalOpen} onClose={() => setIsUpdateModalOpen(false)} mission={selectedMission} currentUser={currentUser} onSuccess={handleUpdateSuccess} hideProviderInfo={isRestrictedClientView} />}
        {isPrintModalOpen && missionForPrint && <MissionPrintModal mission={missionForPrint} onClose={() => setIsPrintModalOpen(false)} />}
        {isFullReportOpen && missionForFullReport && <MissionFullReportModal mission={missionForFullReport} onClose={() => { setIsFullReportOpen(false); setMissionForFullReport(null); }} hideProviderInfo={isRestrictedClientView} />}
        {showClientRequestModal && resolvedClientName && <ClientMissionRequest clientName={resolvedClientName} onClose={() => setShowClientRequestModal(false)} onSuccess={() => { fetchMissions(true); showNotification('Sucesso', 'Solicitação enviada com sucesso!', 'success'); }} />}
        <DhlSolicitationModal isOpen={showDhlSolicitation} onClose={() => setShowDhlSolicitation(false)} />
        {missionForOpReport && <MissionOperationalReport mission={missionForOpReport} onClose={() => setMissionForOpReport(null)} isClientView={isRestrictedClientView} isInternalEditor={isDirector || (currentUser?.role || '').toLowerCase() === 'avançado'} />}
        {isDeleteModalOpen && missionToDelete && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-red-200">
                    <div className="bg-red-50 p-4 border-b border-red-100 flex items-center gap-3">
                        <div className="p-2 bg-red-100 rounded-full text-red-600"><Trash2 size={24} /></div>
                        <h3 className="text-lg font-bold text-red-900">Cancelar OS {missionToDelete.id}?</h3>
                    </div>
                    <div className="p-6 space-y-4">
                        <p className="text-sm text-gray-600">Confirma o cancelamento de <strong>{missionToDelete.id}</strong>?</p>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                            <p className="text-sm font-bold text-amber-900">A escolta já estava na origem?</p>
                            <div className="flex gap-3">
                                <button
                                    data-testid="btn-cancel-escort-yes"
                                    onClick={() => setCancelEscortAtOrigin(true)}
                                    className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold border-2 transition-all ${cancelEscortAtOrigin === true ? 'bg-green-600 text-white border-green-600 shadow-md' : 'bg-white text-gray-700 border-gray-300 hover:border-green-400'}`}
                                >
                                    Sim — cobrar valores
                                </button>
                                <button
                                    data-testid="btn-cancel-escort-no"
                                    onClick={() => setCancelEscortAtOrigin(false)}
                                    className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold border-2 transition-all ${cancelEscortAtOrigin === false ? 'bg-red-600 text-white border-red-600 shadow-md' : 'bg-white text-gray-700 border-gray-300 hover:border-red-400'}`}
                                >
                                    Não — zerar valores
                                </button>
                            </div>
                            {cancelEscortAtOrigin === true && (
                                <p className="text-xs text-green-800 bg-green-50 rounded p-2">Receita, custo e pedágio serão mantidos. Pedágio do fornecedor será igualado ao do cliente.</p>
                            )}
                            {cancelEscortAtOrigin === false && (
                                <p className="text-xs text-red-800 bg-red-50 rounded p-2">Receita, custo e pedágio serão zerados (cliente e fornecedor).</p>
                            )}
                        </div>
                        {!isDirector && (
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1 block">Senha</label>
                                <div className="relative">
                                    <input type="password" className="w-full p-2 pl-9 border rounded" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
                                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="p-4 bg-gray-50 flex justify-end gap-3 border-t">
                        <button data-testid="btn-cancel-modal-close" onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 border rounded text-xs">Sair</button>
                        <button data-testid="btn-cancel-confirm" onClick={confirmDelete} disabled={isDeleting || cancelEscortAtOrigin === null || (!isDirector && !deletePassword)} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                            {isDeleting ? 'Cancelando...' : 'Confirmar Cancelamento'}
                        </button>
                    </div>
                </div>
            </div>
        )}
      </div>
    );
  };
  
  export default MissionTable;