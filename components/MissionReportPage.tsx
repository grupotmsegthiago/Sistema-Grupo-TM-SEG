import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Mission, MissionStatus } from '../types';
import { authFetch } from '../lib/authFetch';
import { supabase } from '../lib/supabase';
import { useNotification } from '../lib/NotificationContext';
import {
  Loader2, FileBarChart, Download, RefreshCw, Filter, List, Link2,
  ClipboardCheck, Calendar, Search, X, ChevronDown, RotateCcw,
  AlertTriangle, ShieldAlert, BadgeCheck
} from 'lucide-react';
import MissionFinancialModal from './MissionFinancialModal';
import { calculateMissionFinancials } from '../lib/financialUtils';
import {
  computeCanonicalRevenueCost,
  getCanonicalDateRange,
  filterMissionsByPeriod,
  type CanonicalResult,
} from '../lib/missionFinancialsCanonical';

const MissionReportPage: React.FC = () => {
  const { showNotification } = useNotification();
  const [allMissions, setAllMissions] = useState<Mission[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalcRowId, setRecalcRowId] = useState<string | null>(null);
  const [clientPriceTables, setClientPriceTables] = useState<any[]>([]);
  const [providerCostTables, setProviderCostTables] = useState<any[]>([]);
  const [clientsData, setClientsData] = useState<any[]>([]);

  const [periodFilter, setPeriodFilter] = useState<'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'CUSTOM' | 'ALL'>('WEEK');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(true);

  const [missionForFinancials, setMissionForFinancials] = useState<any>(null);
  const [isFinancialModalOpen, setIsFinancialModalOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('userData');
    if (stored) setCurrentUser(JSON.parse(stored));
  }, []);

  const isDirector = useMemo(() => {
    if (!currentUser) return false;
    const roleLower = (currentUser?.role || '').toLowerCase();
    return ['diretoria', 'administrador', 'controller'].includes(roleLower) || currentUser.permissions?.includes('*');
  }, [currentUser]);

  const canSeeFinancials = useMemo(() => {
    if (!currentUser) return false;
    const nameLower = (currentUser.name || '').toLowerCase();
    const roleLower = (currentUser.role || '').toLowerCase();
    return nameLower.includes('daniel') || nameLower.includes('michelle') || nameLower.includes('barbara') || nameLower.includes('bárbara') || nameLower.includes('thiago') || roleLower === 'controller';
  }, [currentUser]);

  const fetchMissions = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      let query = supabase.from('missions').select('*').order('created_at', { ascending: false });

      if (currentUser?.clientId) {
        const { data: clientData } = await supabase.from('clients').select('name').eq('id', currentUser.clientId).single();
        if (clientData) query = query.eq('client', clientData.name);
        else { setAllMissions([]); setIsLoading(false); return; }
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

      const [missionsData, clientsRes, providersRes, cptRes, pctRes, allClientsRes] = await Promise.all([
        fetchAllPages(),
        supabase.from('clients').select('name, trading_name'),
        supabase.from('providers').select('name, trading_name'),
        supabase.from('client_price_tables').select('*'),
        supabase.from('provider_cost_tables').select('*'),
        supabase.from('clients').select('*'),
      ]);
      setClientPriceTables(cptRes.data || []);
      setProviderCostTables(pctRes.data || []);
      setClientsData(allClientsRes.data || []);

      if (missionsData) {
        const clientVehicleIds = [...new Set(missionsData.map((m: any) => m.client_vehicle).filter((id: any) => id))];
        const vehicleIds = [...new Set(missionsData.map((m: any) => m.vehicle_id).filter((id: any) => id))];

        const [vehiclesRes, clientVehiclesRes] = await Promise.all([
          vehicleIds.length > 0 ? supabase.from('vehicles').select('id, plate').in('id', vehicleIds) : { data: [] },
          clientVehicleIds.length > 0 ? supabase.from('client_vehicles').select('id, plate, model, brand, color').in('id', clientVehicleIds) : { data: [] }
        ]);

        const vehicleMap = (vehiclesRes.data || []).reduce((acc: any, v: any) => ({ ...acc, [v.id]: v }), {});
        const clientVehicleMap = (clientVehiclesRes.data || []).reduce((acc: any, v: any) => ({ ...acc, [v.id.toString()]: v }), {});

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

          const cargoId = m.client_vehicle?.toString();
          const cargoVehicle = cargoId ? (clientVehicleMap[cargoId] || { plate: `ID: ${cargoId}`, model: '' }) : null;

          return {
            ...m,
            client: clientNameMap[clientKey] || m.client,
            provider: providerNameMap[providerKey] || m.provider,
            originalClientName: m.client,
            clientVehicle: cargoVehicle,
            createdAt: m.created_at,
            vehicleId: displayVehicleId,
            startKm: m.start_km,
            startTime: m.start_time,
            endKm: m.end_km,
            endTime: m.end_time,
            revenue_value: m.revenue_value,
            cost_value: m.cost_value,
            toll_value: m.toll_value,
            toll_value_provider: m.toll_value_provider,
            billing_approved: m.billing_approved,
            mission_type: m.mission_type || 'Caracterizada',
            is_same_os: m.is_same_os,
            parent_mission_id: m.parent_mission_id,
            agent_count: m.agent_count,
          };
        });
        setAllMissions(mapped);
      }
    } catch (err: any) {
      showNotification('Erro', err.message || 'Falha ao carregar missões', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, showNotification]);

  useEffect(() => {
    if (currentUser) fetchMissions();
  }, [currentUser, fetchMissions]);

  const filteredMissions = useMemo(() => {
    let filtered = allMissions;

    if (periodFilter !== 'ALL') {
      // Janela de tempo CANÔNICA — mesma usada pelo Termômetro/Dashboard/Worker.
      if (periodFilter === 'CUSTOM' && (!customStartDate || !customEndDate)) {
        // sem datas customizadas, não filtra
      } else {
        const [start, end] = getCanonicalDateRange(periodFilter, customStartDate, customEndDate);
        filtered = filterMissionsByPeriod(filtered, start, end);
      }
    }

    if (clientFilter) {
      filtered = filtered.filter(m => (m.client || '').toLowerCase().includes(clientFilter.toLowerCase()));
    }
    if (providerFilter) {
      filtered = filtered.filter(m => (m.provider || '').toLowerCase().includes(providerFilter.toLowerCase()));
    }
    if (statusFilter) {
      filtered = filtered.filter(m => m.status === statusFilter);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(m =>
        m.id?.toLowerCase().includes(term) ||
        (m.origin || '').toLowerCase().includes(term) ||
        (m.destination || '').toLowerCase().includes(term) ||
        (m.agent1 || '').toLowerCase().includes(term) ||
        (m.agent2 || '').toLowerCase().includes(term) ||
        (m.clientVehicle?.plate || '').toLowerCase().includes(term)
      );
    }

    return [...filtered].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [allMissions, periodFilter, customStartDate, customEndDate, clientFilter, providerFilter, statusFilter, searchTerm]);

  const uniqueClients = useMemo(() => [...new Set(allMissions.map(m => m.client).filter(Boolean))].sort(), [allMissions]);
  const uniqueProviders = useMemo(() => [...new Set(allMissions.map(m => m.provider).filter(Boolean))].sort(), [allMissions]);

  const fmtDate = (d: string | undefined) => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-';
  const fmtTime = (d: string | undefined) => d ? new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '-';
  const fmtMoney = (v: number) => v ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';

  const statusBg = (s: string) => {
    if (s === MissionStatus.COMPLETED) return 'bg-emerald-100 text-emerald-800';
    if (s === MissionStatus.IN_PROGRESS) return 'bg-blue-100 text-blue-800';
    if (s === MissionStatus.PENDING || s === MissionStatus.SCHEDULED || s === MissionStatus.SOLICITED) return 'bg-amber-100 text-amber-800';
    if (s === MissionStatus.CANCELLED || s === MissionStatus.REFUSED) return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-700';
  };

  const parentChildMap = useMemo(() => {
    const map = new Map<string, string[]>();
    filteredMissions.forEach(m => {
      if (m.is_same_os && m.parent_mission_id) {
        const arr = map.get(m.parent_mission_id) || [];
        arr.push(m.id);
        map.set(m.parent_mission_id, arr);
      }
    });
    return map;
  }, [filteredMissions]);

  const tableInfoMap = useMemo(() => {
    if (clientPriceTables.length === 0 && providerCostTables.length === 0) return new Map<string, { clientTable: string; providerTable: string }>();
    const map = new Map<string, { clientTable: string; providerTable: string }>();
    for (const m of filteredMissions) {
      try {
        const mObj = { ...m, startKm: m.startKm || m.start_km, endKm: m.endKm || m.end_km, startTime: m.startTime || m.start_time, endTime: m.endTime || m.end_time };
        const clientMatch = clientsData.find((c: any) => c.name === (m as any).originalClientName || c.name === m.client);
        const fd = calculateMissionFinancials(mObj, clientPriceTables, providerCostTables, clientMatch);
        if (fd) {
          map.set(m.id, { clientTable: fd.client.tableName || '-', providerTable: fd.provider.tableName || '-' });
        }
      } catch { /* skip */ }
    }
    return map;
  }, [filteredMissions, clientPriceTables, providerCostTables, clientsData]);

  const handleRecalcRow = async (missionId: string) => {
    setRecalcRowId(missionId);
    try {
      const res = await authFetch(`/api/missions/${missionId}/force-recalculate`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (data.success) {
        showNotification('Sucesso', `OS ${missionId} recalculada: Receita R$ ${(data.new.revenue || 0).toFixed(2)} | Custo R$ ${(data.new.cost || 0).toFixed(2)}`, 'success');
        fetchMissions(true);
      } else {
        showNotification('Erro', data.error || 'Falha ao recalcular', 'error');
      }
    } catch (err: any) {
      showNotification('Erro', err.message || 'Falha na comunicação', 'error');
    } finally {
      setRecalcRowId(null);
    }
  };

  // CANÔNICO: cálculo único usado por todas as telas/worker.
  // Para cada OS calcula receita base + pedágio + custo base + pedágio pago.
  // Pula REFUSED. Usa valores salvos quando há, senão estima via tabela.
  const canonicalByMission = useMemo(() => {
    const refs = { clientTables: clientPriceTables, providerTables: providerCostTables, clientsData };
    const now = new Date();
    const map = new Map<string, CanonicalResult>();
    for (const m of filteredMissions) {
      map.set(m.id, computeCanonicalRevenueCost(m, refs, now));
    }
    return map;
  }, [filteredMissions, clientPriceTables, providerCostTables, clientsData]);

  const totals = useMemo(() => {
    let revBase = 0, tollRev = 0, costBase = 0, tollCost = 0, profit = 0;
    canonicalByMission.forEach(c => {
      revBase += c.revBase; tollRev += c.tollRev;
      costBase += c.costBase; tollCost += c.tollCost;
      profit += c.profit;
    });
    return { revBase, tollRev, costBase, tollCost, profit, rev: revBase + tollRev, cost: costBase + tollCost };
  }, [canonicalByMission]);

  // Aliases para manter compatibilidade com o JSX existente.
  const totalRev = totals.revBase;
  const totalCost = totals.costBase;
  const totalToll = totals.tollRev;
  const totalTollProvider = totals.tollCost;

  const handleExportCSV = () => {
    const sep = ';';
    const headers = ['#', 'OS', 'Status', 'Cliente', 'Veíc. Escoltado', 'Fornecedor', 'Viatura', 'Agentes', 'Rota', 'Data Inicial', 'Hora Inicial', 'Data Final', 'Hora Final'];
    if (canSeeFinancials) headers.push('Receita', 'Custo', 'Ped. Recebido', 'Ped. Pago', 'Resultado', '% Lucro');

    const exportParentIds = new Set<string>();
    filteredMissions.forEach(m => { if (m.is_same_os && m.parent_mission_id) exportParentIds.add(m.parent_mission_id); });

    const rows = filteredMissions.map((m, i) => {
      const c = canonicalByMission.get(m.id);
      const rev = c?.revBase || 0;
      const cost = c?.costBase || 0;
      const toll = c?.tollRev || 0;
      const tollPaid = c?.tollCost || 0;
      const resultado = c?.profit || 0;
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
        const revTotal = rev + toll;
        row.push(
          rev > 0 ? rev.toFixed(2).replace('.', ',') : '',
          cost > 0 ? cost.toFixed(2).replace('.', ',') : '',
          toll > 0 ? toll.toFixed(2).replace('.', ',') : '',
          tollPaid > 0 ? tollPaid.toFixed(2).replace('.', ',') : '',
          resultado !== 0 ? resultado.toFixed(2).replace('.', ',') : '',
          revTotal > 0 ? ((resultado / revTotal) * 100).toFixed(1).replace('.', ',') + '%' : ''
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
  };

  const handleRecalculate = async () => {
    if (isRecalculating) return;
    setIsRecalculating(true);
    try {
      const resp = await authFetch('/api/recalculate-all', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await resp.json();
      if (data.success) {
        showNotification('Recálculo Concluído', `${data.updated} OS corrigidas de ${data.total} analisadas. ${data.skipped} sem divergência.`, 'success');
        fetchMissions(true);
      } else {
        showNotification('Erro', data.error || 'Falha no recálculo', 'error');
      }
    } catch (e: any) {
      showNotification('Erro', e.message, 'error');
    } finally {
      setIsRecalculating(false);
    }
  };

  const PERIOD_OPTIONS = [
    { id: 'TODAY', label: 'HOJE' },
    { id: 'YESTERDAY', label: 'ONTEM' },
    { id: 'WEEK', label: 'SEMANA' },
    { id: 'MONTH', label: 'MÊS' },
    { id: 'YEAR', label: 'ANO' },
    { id: 'CUSTOM', label: 'PERÍODO' },
    { id: 'ALL', label: 'TODOS' },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <FileBarChart size={22} className="text-red-600" />
            <h1 className="text-lg font-black text-gray-900 uppercase tracking-tight">Relatório de OS</h1>
            <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded">{filteredMissions.length} missões</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              data-testid="btn-toggle-filters"
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${showFilters ? 'bg-gray-800 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >
              <Filter size={13} /> Filtros
            </button>
            <button
              data-testid="btn-refresh-report"
              onClick={() => fetchMissions(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold border border-gray-200 transition-colors"
            >
              <RefreshCw size={13} /> Atualizar
            </button>
            <button
              data-testid="btn-export-csv"
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors"
            >
              <Download size={13} /> Excel
            </button>
            {canSeeFinancials && ['diretoria', 'administrador'].includes((currentUser?.role || '').toLowerCase()) && (
              <button
                data-testid="btn-recalculate-all"
                onClick={handleRecalculate}
                disabled={isRecalculating}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
              >
                {isRecalculating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {isRecalculating ? 'Recalculando...' : 'Recalcular Tudo'}
              </button>
            )}
          </div>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider mr-1">Período:</span>
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.id}
                data-testid={`period-${opt.id.toLowerCase()}`}
                onClick={() => setPeriodFilter(opt.id as any)}
                className={`px-2.5 py-1 rounded text-[10px] font-black uppercase border transition-all ${
                  periodFilter === opt.id
                    ? 'bg-red-600 text-white border-red-700 shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}

            {periodFilter === 'CUSTOM' && (
              <div className="flex items-center gap-1.5 ml-2">
                <input
                  type="date"
                  data-testid="input-start-date"
                  value={customStartDate}
                  onChange={e => setCustomStartDate(e.target.value)}
                  className="px-2 py-1 border border-gray-200 rounded text-xs"
                />
                <span className="text-xs text-gray-400">até</span>
                <input
                  type="date"
                  data-testid="input-end-date"
                  value={customEndDate}
                  onChange={e => setCustomEndDate(e.target.value)}
                  className="px-2 py-1 border border-gray-200 rounded text-xs"
                />
              </div>
            )}

            <div className="h-5 border-l border-gray-300 mx-2" />

            <div className="relative">
              <select
                data-testid="filter-client"
                value={clientFilter}
                onChange={e => setClientFilter(e.target.value)}
                className="appearance-none pl-2 pr-6 py-1 border border-gray-200 rounded text-[10px] font-bold bg-white text-gray-700 min-w-[120px]"
              >
                <option value="">Todos Clientes</option>
                {uniqueClients.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                data-testid="filter-provider"
                value={providerFilter}
                onChange={e => setProviderFilter(e.target.value)}
                className="appearance-none pl-2 pr-6 py-1 border border-gray-200 rounded text-[10px] font-bold bg-white text-gray-700 min-w-[120px]"
              >
                <option value="">Todos Fornecedores</option>
                {uniqueProviders.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                data-testid="filter-status"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="appearance-none pl-2 pr-6 py-1 border border-gray-200 rounded text-[10px] font-bold bg-white text-gray-700 min-w-[100px]"
              >
                <option value="">Todos Status</option>
                <option value={MissionStatus.COMPLETED}>Concluída</option>
                <option value={MissionStatus.IN_PROGRESS}>Em Andamento</option>
                <option value={MissionStatus.IN_TRANSIT}>Em Viagem</option>
                <option value={MissionStatus.PENDING}>Pendente</option>
                <option value={MissionStatus.SCHEDULED}>Agendada</option>
                <option value={MissionStatus.SOLICITED}>Solicitada</option>
                <option value={MissionStatus.CANCELLED}>Cancelada</option>
                <option value={MissionStatus.REFUSED}>Recusada</option>
              </select>
              <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                data-testid="input-search"
                type="text"
                placeholder="Buscar OS, placa, agente..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-7 pr-7 py-1 border border-gray-200 rounded text-[10px] font-bold bg-white text-gray-700 min-w-[180px]"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={10} />
                </button>
              )}
            </div>

            {(clientFilter || providerFilter || statusFilter || searchTerm) && (
              <button
                data-testid="btn-clear-filters"
                onClick={() => { setClientFilter(''); setProviderFilter(''); setStatusFilter(''); setSearchTerm(''); }}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
              >
                <X size={10} /> Limpar
              </button>
            )}
          </div>
        </div>
      )}

      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2">
        <div className="flex items-center gap-4 text-[10px] font-bold flex-wrap">
          <span className="text-emerald-700">Concl: {filteredMissions.filter(m => m.status === MissionStatus.COMPLETED).length}</span>
          <span className="text-blue-700">Andamento: {filteredMissions.filter(m => m.status === MissionStatus.IN_PROGRESS || m.status === MissionStatus.IN_TRANSIT).length}</span>
          <span className="text-amber-700">Pend: {filteredMissions.filter(m => [MissionStatus.PENDING, MissionStatus.SCHEDULED, MissionStatus.SOLICITED].includes(m.status as MissionStatus)).length}</span>
          <span className="text-red-700">Canc: {filteredMissions.filter(m => [MissionStatus.CANCELLED, MissionStatus.REFUSED].includes(m.status as MissionStatus)).length}</span>
          {canSeeFinancials && (
            <>
              <span className="border-l border-gray-300 pl-3 text-green-700">Receita Total: R$ {fmtMoney(totalRev)}</span>
              <span className="text-blue-700">Custo Total: R$ {fmtMoney(totalCost)}</span>
              <span className="text-orange-700">Pedágio Recebido: R$ {fmtMoney(totalToll)}</span>
              <span className="text-orange-500">Pedágio Pago: R$ {fmtMoney(totalTollProvider)}</span>
              <span className={`font-black ${totals.profit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                Resultado: R$ {fmtMoney(totals.profit)}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <Loader2 size={32} className="animate-spin mb-2 text-red-600" />
            <p className="text-sm font-medium">Carregando...</p>
          </div>
        ) : filteredMissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <List size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-bold">Nenhuma OS encontrada para os filtros selecionados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
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
                  {canSeeFinancials && (
                    <>
                      <th className="px-3 py-2.5 text-right font-black border-r border-gray-700">RECEITA</th>
                      <th className="px-3 py-2.5 text-right font-black border-r border-gray-700">CUSTO</th>
                      <th className="px-3 py-2.5 text-right font-black border-r border-gray-700">PED. RECEB.</th>
                      <th className="px-3 py-2.5 text-right font-black border-r border-gray-700">PED. PAGO</th>
                      <th className="px-3 py-2.5 text-right font-black border-r border-gray-700">RESULTADO</th>
                      <th className="px-3 py-2.5 text-right font-black border-r border-gray-700">% LUCRO</th>
                    </>
                  )}
                  <th className="px-3 py-2.5 text-center font-black">FATURAMENTO</th>
                </tr>
              </thead>
              <tbody>
                {filteredMissions.map((m, idx) => {
                  // Usa o cálculo CANÔNICO (mesmo do Termômetro/Dashboard/Worker)
                  // para que a soma das linhas BATA com o total do rodapé.
                  const c = canonicalByMission.get(m.id);
                  const rev = c?.revBase || 0;
                  const cost = c?.costBase || 0;
                  const toll = c?.tollRev || 0;
                  const tollProvider = c?.tollCost || 0;
                  const resultado = c?.profit || 0;
                  const revTotal = rev + toll;
                  const lucroPerc = revTotal > 0 ? ((resultado / revTotal) * 100) : 0;
                  const placaEscoltado = m.clientVehicle?.plate || '-';
                  const agentes = [m.agent1, m.agent2].filter(Boolean).join(' & ') || '-';
                  const isParentMission = parentChildMap.has(m.id);
                  const childrenOfThis = parentChildMap.get(m.id);
                  const hasLink = isParentMission || (m.is_same_os && !!m.parent_mission_id);
                  const rowBg = isParentMission ? 'bg-blue-50' : (m.is_same_os && m.parent_mission_id) ? 'bg-blue-50/40' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';

                  return (
                    <tr key={m.id} className={`${rowBg} hover:bg-yellow-50 border-b border-gray-200 transition-colors ${hasLink ? 'border-l-4 border-l-blue-500' : ''}`} data-testid={`report-row-${m.id}`}>
                      <td className="px-3 py-2 font-black text-gray-500 border-r border-gray-100">{idx + 1}</td>
                      <td className="px-3 py-2 font-black text-gray-900 border-r border-gray-100 whitespace-nowrap">
                        <div className="flex items-center gap-1 flex-wrap">
                          {hasLink && <Link2 size={12} className="text-blue-500 shrink-0" />}
                          <span className={isParentMission ? 'font-black text-blue-700' : (m.is_same_os && m.parent_mission_id) ? 'text-blue-600' : ''}>{m.id}</span>
                          {m.mission_type && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${m.mission_type === 'Velada' ? 'bg-purple-100 text-purple-700' : m.mission_type === 'Pronta Resposta' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                              {m.mission_type === 'Caracterizada' ? 'CARACT' : m.mission_type === 'Velada' ? 'VELADA' : 'PR'}
                            </span>
                          )}
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
                      <td className="px-3 py-2 border-r border-gray-100 text-center whitespace-nowrap">
                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${statusBg(m.status)}`}>{m.status}</span>
                      </td>
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
                      {canSeeFinancials && (
                        <>
                          <td className="px-3 py-2 border-r border-gray-100 text-right font-bold text-green-700 whitespace-nowrap" title={tableInfoMap.get(m.id)?.clientTable || ''}>
                            <div className="flex flex-col items-end">
                              <span>{rev > 0 ? fmtMoney(rev) : '-'}</span>
                              {tableInfoMap.get(m.id) && <span className="text-[8px] text-green-500 font-normal truncate max-w-[100px]">{tableInfoMap.get(m.id)?.clientTable}</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2 border-r border-gray-100 text-right font-bold text-blue-700 whitespace-nowrap" title={tableInfoMap.get(m.id)?.providerTable || ''}>
                            <div className="flex flex-col items-end">
                              <span>{cost > 0 ? fmtMoney(cost) : '-'}</span>
                              {tableInfoMap.get(m.id) && <span className="text-[8px] text-blue-500 font-normal truncate max-w-[100px]">{tableInfoMap.get(m.id)?.providerTable}</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2 border-r border-gray-100 text-right text-orange-600 whitespace-nowrap">{toll > 0 ? fmtMoney(toll) : '-'}</td>
                          <td className="px-3 py-2 border-r border-gray-100 text-right text-orange-500 whitespace-nowrap">{tollProvider > 0 ? fmtMoney(tollProvider) : '-'}</td>
                          <td className={`px-3 py-2 border-r border-gray-100 text-right font-black whitespace-nowrap ${resultado >= 0 ? 'text-emerald-700' : 'text-red-600 bg-red-50'}`}>
                            {rev > 0 || cost > 0 ? fmtMoney(resultado) : '-'}
                          </td>
                          {(() => {
                            // Regras de cor da % LUCRO:
                            // - APROVADO pelo usuário → normal (verde) + ícone verificado, independente do %
                            // - < 10% (não aprovado) → vermelho (alerta forte)
                            // - 10% a < 20% (não aprovado) → amarelo "Atenção"
                            // - >= 20% (não aprovado) → normal verde
                            // - lucro negativo (não aprovado) → vermelho
                            const hasValue = rev > 0;
                            const isApproved = !!m.billing_approved;
                            let cellClass = 'text-emerald-700';
                            let icon: React.ReactNode = null;
                            let title = '';
                            if (hasValue && !isApproved) {
                              if (lucroPerc < 10) {
                                cellClass = 'text-red-700 bg-red-100';
                                icon = <ShieldAlert size={12} className="text-red-700" />;
                                title = 'Margem crítica (abaixo de 10%) — revisar';
                              } else if (lucroPerc < 20) {
                                cellClass = 'text-amber-700 bg-amber-100';
                                icon = <AlertTriangle size={12} className="text-amber-700" />;
                                title = 'Atenção: margem entre 10% e 20%';
                              }
                            } else if (hasValue && isApproved) {
                              icon = <BadgeCheck size={12} className="text-emerald-600" />;
                              title = 'Aprovado pela conferência';
                            }
                            return (
                              <td className={`px-3 py-2 border-r border-gray-100 text-right font-black whitespace-nowrap ${cellClass}`} title={title}>
                                {hasValue ? (
                                  <div className="flex items-center justify-end gap-1">
                                    {icon}
                                    {!isApproved && lucroPerc >= 10 && lucroPerc < 20 && (
                                      <span className="text-[9px] font-black uppercase tracking-wider">Atenção</span>
                                    )}
                                    <span>{lucroPerc.toFixed(1)}%</span>
                                  </div>
                                ) : '-'}
                              </td>
                            );
                          })()}
                        </>
                      )}
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center gap-1 justify-center">
                        <button
                          data-testid={`btn-recalc-${m.id}`}
                          onClick={(e) => { e.stopPropagation(); handleRecalcRow(m.id); }}
                          disabled={recalcRowId === m.id}
                          className="inline-flex items-center gap-0.5 px-1.5 py-1 rounded text-[9px] font-bold bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors disabled:opacity-50"
                          title="Recalcular esta OS"
                        >
                          {recalcRowId === m.id ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
                        </button>
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
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {filteredMissions.length > 0 && canSeeFinancials && (
                <tfoot>
                  <tr className="bg-gray-800 text-white font-black text-xs">
                    <td colSpan={13} className="px-3 py-2.5 text-right border-r border-gray-600">TOTAIS →</td>
                    <td className="px-3 py-2.5 text-right border-r border-gray-600 text-green-300">{fmtMoney(totalRev)}</td>
                    <td className="px-3 py-2.5 text-right border-r border-gray-600 text-blue-300">{fmtMoney(totalCost)}</td>
                    <td className="px-3 py-2.5 text-right border-r border-gray-600 text-orange-300">{fmtMoney(totalToll)}</td>
                    <td className="px-3 py-2.5 text-right border-r border-gray-600 text-orange-200">{fmtMoney(totalTollProvider)}</td>
                    <td className={`px-3 py-2.5 text-right border-r border-gray-600 ${totals.profit >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{fmtMoney(totals.profit)}</td>
                    <td className={`px-3 py-2.5 text-right border-r border-gray-600 ${totals.rev > 0 ? (totals.profit >= 0 ? 'text-emerald-300' : 'text-red-300') : ''}`}>
                      {totals.rev > 0 ? `${((totals.profit / totals.rev) * 100).toFixed(1)}%` : '-'}
                    </td>
                    <td className="px-3 py-2.5"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {isFinancialModalOpen && (
        <MissionFinancialModal
          isOpen={isFinancialModalOpen}
          onClose={() => setIsFinancialModalOpen(false)}
          mission={missionForFinancials}
          onUpdate={() => fetchMissions(true)}
        />
      )}
    </div>
  );
};

export default MissionReportPage;
