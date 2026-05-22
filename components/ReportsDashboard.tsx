
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
    FileBarChart, Calendar, Clock, User, Download, Search, Loader2, 
    ArrowRight, Shield, Activity, FileText, BarChart2, PieChart, Users, 
    MousePointer2, AlertTriangle, CheckCircle2, TrendingUp, List, MapPin, 
    Building2, Briefcase, Printer, Filter, Zap, Scale, UserCheck
} from 'lucide-react';
import { SystemLog, MissionStatus } from '../types';
import {
    ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend
} from 'recharts';
import { calculateMissionFinancials } from '../lib/financialUtils';
import { isAutoMasterRow } from '../lib/providerAutoPricing';

const formatCurrencyBR = (val: number) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface AutoEngineLogRow {
    logId: string;
    createdAt: string;
    userName: string;
    missionId: string;
    suggestedTotal: number;
    savedCost: number;
    divergence: number;
    divergent: boolean;
    bandKm: number | null;
    realKm: number | null;
    goldenHours: number | null;
    provider: string;
    client: string;
    costEditReason: string;
    revenueEditReason: string;
    reasonUser: string;
    reasonAt: string;
    manualCost: number | null;
    manualTableName: string | null;
    manualDivergence: number | null;
}

interface UserStats {
    userId: string;
    userName: string;
    totalActions: number;
    createCount: number;
    updateCount: number;
    deleteCount: number;
    navCount: number; // Navegação
    lastActivity: string;
    score: number; // Pontuação de produtividade
}

const ReportsDashboard: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'dashboard' | 'ranking' | 'logs' | 'timeline' | 'autoEngine' | 'manualOverride' | 'dhlMemory'>('dashboard');

    // Task #117 — Painel global da memória DHL
    interface DhlMemoryRow {
        id: string;
        createdAt: string;
        userName: string;
        missionId: string;
        region: string;
        band: number;
        originUF: string;
        originCity: string;
        destCity: string;
        suggestedTableOp: string | null;
        suggestedMatchLevel: string | null;
        chosenTableOp: string | null;
    }
    const [dhlMemoryRows, setDhlMemoryRows] = useState<DhlMemoryRow[]>([]);
    const [dhlMemoryLoading, setDhlMemoryLoading] = useState(false);
    const [dhlMemoryRegionFilter, setDhlMemoryRegionFilter] = useState('');
    const [dhlMemoryBandFilter, setDhlMemoryBandFilter] = useState('');
    const [dhlMemorySearchTerm, setDhlMemorySearchTerm] = useState('');
    
    // Helper para formatar data local (YYYY-MM-DD)
    const getLocalISODate = (date: Date) => {
        return date.toLocaleDateString('en-CA');
    };

    const [startDate, setStartDate] = useState(getLocalISODate(new Date()));
    const [endDate, setEndDate] = useState(getLocalISODate(new Date()));
    const [isLoading, setIsLoading] = useState(false);
    
    // Dados Raw
    const [logs, setLogs] = useState<SystemLog[]>([]);
    
    // Filtros
    const [searchTerm, setSearchTerm] = useState('');
    
    // Timeline
    const [timelineMissions, setTimelineMissions] = useState<any[]>([]);
    const [timelineLoading, setTimelineLoading] = useState(false);
    const [timelineClientFilter, setTimelineClientFilter] = useState('');
    const [timelineProviderFilter, setTimelineProviderFilter] = useState('');
    const [timelineStatusFilter, setTimelineStatusFilter] = useState('');

    // Motor Automático vs Manual (Task #57)
    const [autoEngineRows, setAutoEngineRows] = useState<AutoEngineLogRow[]>([]);
    const [autoEngineLoading, setAutoEngineLoading] = useState(false);
    const [autoEngineProviderFilter, setAutoEngineProviderFilter] = useState('');
    const [autoEngineOnlyDivergent, setAutoEngineOnlyDivergent] = useState(false);

    // Auditoria de Edições Manuais sobre o Motor (Task #62)
    const [manualOverrideProviderFilter, setManualOverrideProviderFilter] = useState('');
    const [manualOverrideUserFilter, setManualOverrideUserFilter] = useState('');

    // Task #73 — Painel de alertas já disparados
    type OverrideAlertItem = {
        id: string;
        createdAt: string;
        userName: string;
        actionType: 'MANUAL_OVERRIDE_ALERT' | 'MANUAL_OVERRIDE_ALERT_SILENCE' | 'MANUAL_OVERRIDE_ALERT_REOPEN';
        entityId: string;
        details: any;
    };
    type OverrideScopeHistoryEntry = { actionType: string; actor: string; at: string; hours?: number; silenceUntil?: string };
    type OverrideCooldown = {
        scope: 'user' | 'provider';
        name: string;
        until: string;
        source: 'auto' | 'silence';
        actor?: string | null;
        startedAt?: string | null;
        hours?: number | null;
        history?: OverrideScopeHistoryEntry[];
    };
    type OverrideModerationEvent = {
        id: string;
        at: string;
        actionType: 'MANUAL_OVERRIDE_ALERT_SILENCE' | 'MANUAL_OVERRIDE_ALERT_REOPEN';
        actor: string;
        scope: 'user' | 'provider' | null;
        name: string;
        hours?: number | null;
        silenceUntil?: string | null;
    };
    const [overrideAlerts, setOverrideAlerts] = useState<OverrideAlertItem[]>([]);
    const [overrideCooldowns, setOverrideCooldowns] = useState<OverrideCooldown[]>([]);
    const [overrideModerationTimeline, setOverrideModerationTimeline] = useState<OverrideModerationEvent[]>([]);
    const [overrideExpandedScope, setOverrideExpandedScope] = useState<string | null>(null);
    const [overrideAlertsConfig, setOverrideAlertsConfig] = useState<{ windowDays: number; threshold: number; cooldownHours: number } | null>(null);
    const [overrideAlertsLoading, setOverrideAlertsLoading] = useState(false);
    const [overrideActionBusy, setOverrideActionBusy] = useState<string | null>(null);

    const fetchOverrideAlerts = async () => {
        setOverrideAlertsLoading(true);
        try {
            const r = await fetch('/api/admin/manual-override-alerts?limit=100', { credentials: 'include' });
            if (r.ok) {
                const j = await r.json();
                setOverrideAlerts(j.alerts || []);
                setOverrideCooldowns(j.cooldowns || []);
                setOverrideModerationTimeline(j.moderationTimeline || []);
                setOverrideAlertsConfig({ windowDays: j.windowDays, threshold: j.threshold, cooldownHours: j.cooldownHours });
            }
        } catch { /* ignore */ }
        finally { setOverrideAlertsLoading(false); }
    };

    const silenceOverrideScope = async (scope: 'user' | 'provider', name: string) => {
        const hoursStr = window.prompt(`Silenciar ${scope === 'user' ? 'usuário' : 'fornecedor'} "${name}" por quantas horas? (1 a 720)`, '72');
        if (!hoursStr) return;
        const hours = Math.max(1, Math.min(720, Number(hoursStr) || 0));
        if (!hours) { window.alert('Informe um número entre 1 e 720.'); return; }
        const key = `silence:${scope}:${name}`;
        setOverrideActionBusy(key);
        try {
            const r = await fetch('/api/admin/manual-override-alerts/silence', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scope, name, hours }),
            });
            if (!r.ok) {
                const j = await r.json().catch(() => ({}));
                window.alert(`Falha ao silenciar: ${j?.error || r.statusText}`);
            } else {
                await fetchOverrideAlerts();
            }
        } finally { setOverrideActionBusy(null); }
    };

    const reopenOverrideScope = async (scope: 'user' | 'provider', name: string) => {
        if (!window.confirm(`Reabrir alertas para ${scope === 'user' ? 'usuário' : 'fornecedor'} "${name}"? O cooldown atual será encerrado e um novo alerta poderá ser disparado na próxima varredura.`)) return;
        const key = `reopen:${scope}:${name}`;
        setOverrideActionBusy(key);
        try {
            const r = await fetch('/api/admin/manual-override-alerts/reopen', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scope, name }),
            });
            if (!r.ok) {
                const j = await r.json().catch(() => ({}));
                window.alert(`Falha ao reabrir: ${j?.error || r.statusText}`);
            } else {
                await fetchOverrideAlerts();
            }
        } finally { setOverrideActionBusy(null); }
    };

    // Task #77 — Configuração atual do alerta de edições manuais (para avisar quando estiver frouxa)
    const [overrideAlertSettings, setOverrideAlertSettings] = useState<{
        threshold: number;
        windowDays: number;
        cooldownHours: number;
        updatedBy: string | null;
        updatedAt: string | null;
    } | null>(null);
    useEffect(() => {
        if (activeTab !== 'manualOverride') return;
        let aborted = false;
        (async () => {
            try {
                const token = localStorage.getItem('authToken');
                const res = await fetch('/api/admin/manual-override-settings', {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (!res.ok) return;
                const json = await res.json();
                if (aborted || !json?.ok || !json?.settings) return;
                setOverrideAlertSettings({
                    threshold: Number(json.settings.threshold),
                    windowDays: Number(json.settings.windowDays),
                    cooldownHours: Number(json.settings.cooldownHours),
                    updatedBy: json.updatedBy ?? null,
                    updatedAt: json.updatedAt ?? null,
                });
            } catch { /* silencioso: o painel não depende disso */ }
        })();
        return () => { aborted = true; };
    }, [activeTab]);

    // Task #67 — Deep-link vindo do e-mail/notificação de alerta de edições manuais.
    // Aceita ?tab=manualOverride&user=...&provider=...&from=YYYY-MM-DD&to=YYYY-MM-DD
    useEffect(() => {
        try {
            if (typeof window === 'undefined') return;
            const qs = new URLSearchParams(window.location.search);
            const tab = qs.get('tab');
            const user = qs.get('user');
            const provider = qs.get('provider');
            const from = qs.get('from');
            const to = qs.get('to');
            if (tab === 'manualOverride' || tab === 'autoEngine' || tab === 'timeline' || tab === 'dashboard' || tab === 'ranking' || tab === 'logs' || tab === 'dhlMemory') {
                setActiveTab(tab as any);
            }
            if (user) setManualOverrideUserFilter(user);
            if (provider) setManualOverrideProviderFilter(provider);
            if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) setStartDate(from);
            if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) setEndDate(to);
        } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        fetchData();
        if (activeTab === 'timeline') fetchTimelineData();
        if (activeTab === 'autoEngine' || activeTab === 'manualOverride') fetchAutoEngineData();
        if (activeTab === 'dhlMemory') fetchDhlMemoryData();
    }, [startDate, endDate]);

    useEffect(() => {
        if (activeTab === 'timeline' && timelineMissions.length === 0) fetchTimelineData();
        if (activeTab === 'autoEngine' || activeTab === 'manualOverride') fetchAutoEngineData();
        if (activeTab === 'manualOverride') fetchOverrideAlerts();
        if (activeTab === 'dhlMemory') fetchDhlMemoryData();
    }, [activeTab]);

    // Task #117 — Carrega correções DHL (system_logs entity=DhlTableCorrection)
    const fetchDhlMemoryData = async () => {
        setDhlMemoryLoading(true);
        try {
            const { data, error } = await supabase
                .from('system_logs')
                .select('id, created_at, user_name, entity_id, details')
                .eq('entity', 'DhlTableCorrection')
                .gte('created_at', `${startDate}T00:00:00`)
                .lte('created_at', `${endDate}T23:59:59`)
                .order('created_at', { ascending: false })
                .limit(5000);
            if (error) {
                console.warn('[DHL Memória Painel] Falha ao carregar correções:', error.message);
                setDhlMemoryRows([]);
                return;
            }
            const rows: DhlMemoryRow[] = [];
            for (const row of (data || []) as any[]) {
                try {
                    const d = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
                    if (!d) continue;
                    rows.push({
                        id: String(row.id),
                        createdAt: row.created_at || '',
                        userName: String(row.user_name || ''),
                        missionId: String(d.missionId || row.entity_id || ''),
                        region: String(d.region || ''),
                        band: Number(d.band || 0),
                        originUF: String(d.originUF || ''),
                        originCity: String(d.originCity || ''),
                        destCity: String(d.destCity || ''),
                        suggestedTableOp: d.suggestedTableOp || null,
                        suggestedMatchLevel: d.suggestedMatchLevel || null,
                        chosenTableOp: d.chosenTableOp || null,
                    });
                } catch { /* ignore */ }
            }
            setDhlMemoryRows(rows);
        } finally {
            setDhlMemoryLoading(false);
        }
    };

    const fetchAutoEngineData = async () => {
        setAutoEngineLoading(true);
        try {
            const { data: logsData, error: logsErr } = await supabase
                .from('system_logs')
                .select('id, created_at, user_name, entity_id, details')
                .eq('entity', 'Mission')
                .eq('action_type', 'FINANCIAL_RECALC')
                .gte('created_at', `${startDate}T00:00:00`)
                .lte('created_at', `${endDate}T23:59:59`)
                .order('created_at', { ascending: false })
                .limit(5000);
            if (logsErr) throw logsErr;

            const parsed: Array<Omit<AutoEngineLogRow, 'provider' | 'client' | 'costEditReason' | 'revenueEditReason' | 'reasonUser' | 'reasonAt' | 'manualCost' | 'manualTableName' | 'manualDivergence'> & { missionId: string }> = [];
            (logsData || []).forEach((l: any) => {
                try {
                    const d = typeof l.details === 'string' ? JSON.parse(l.details) : (l.details || {});
                    if ((d.source || '') !== 'provider_auto_engine') return;
                    const suggested = Number(d.suggestedTotal) || 0;
                    const saved = Number(d.savedCost) || 0;
                    parsed.push({
                        logId: l.id,
                        createdAt: l.created_at,
                        userName: l.user_name || '-',
                        missionId: String(l.entity_id),
                        suggestedTotal: suggested,
                        savedCost: saved,
                        divergence: saved - suggested,
                        divergent: !!d.divergent || Math.abs(saved - suggested) > 0.01,
                        bandKm: d.bandKm != null ? Number(d.bandKm) : null,
                        realKm: d.realKm != null ? Number(d.realKm) : null,
                        goldenHours: d.goldenHours != null ? Number(d.goldenHours) : null,
                    });
                } catch { /* ignore malformed log */ }
            });

            const missionIds = Array.from(new Set(parsed.map(p => p.missionId))).filter(Boolean);
            const missionsById: Record<string, any> = {};
            if (missionIds.length > 0) {
                const CHUNK = 200;
                for (let i = 0; i < missionIds.length; i += CHUNK) {
                    const slice = missionIds.slice(i, i + CHUNK);
                    const { data: mData, error: mErr } = await supabase
                        .from('missions')
                        .select('*')
                        .in('id', slice);
                    if (mErr) throw mErr;
                    (mData || []).forEach((m: any) => {
                        missionsById[String(m.id)] = m;
                    });
                }
            }

            // Cruzar com logs VALUE_EDIT_REASON da mesma OS (Task #62) para anexar motivo
            const reasonByMission: Record<string, { costEditReason: string; revenueEditReason: string; userName: string; at: string }> = {};
            if (missionIds.length > 0) {
                const CHUNK = 200;
                for (let i = 0; i < missionIds.length; i += CHUNK) {
                    const slice = missionIds.slice(i, i + CHUNK);
                    const { data: rData, error: rErr } = await supabase
                        .from('system_logs')
                        .select('entity_id, user_name, created_at, details')
                        .eq('entity', 'Mission')
                        .eq('action_type', 'VALUE_EDIT_REASON')
                        .in('entity_id', slice)
                        .order('created_at', { ascending: false });
                    if (rErr) throw rErr;
                    (rData || []).forEach((r: any) => {
                        const mid = String(r.entity_id);
                        if (reasonByMission[mid]) return; // queremos só o mais recente
                        try {
                            const d = typeof r.details === 'string' ? JSON.parse(r.details) : (r.details || {});
                            reasonByMission[mid] = {
                                costEditReason: d.cost_edit_reason || '',
                                revenueEditReason: d.revenue_edit_reason || '',
                                userName: r.user_name || '-',
                                at: r.created_at || '',
                            };
                        } catch { /* ignore */ }
                    });
                }
            }

            // Carrega tabelas e clientes uma única vez para recomputar o custo (Task #60)
            // usando apenas as linhas manuais (não-AUTO_MASTER) do mesmo fornecedor.
            const [ptRes, ctRes, clRes] = await Promise.all([
                supabase.from('provider_cost_tables').select('*'),
                supabase.from('client_price_tables').select('*'),
                supabase.from('clients').select('*'),
            ]);
            if (ptRes.error) throw ptRes.error;
            if (ctRes.error) throw ctRes.error;
            if (clRes.error) throw clRes.error;
            const allProviderTables = (ptRes.data || []) as any[];
            const allClientTables = (ctRes.data || []) as any[];
            const allClients = (clRes.data || []) as any[];
            // Pré-computa tabelas manuais (sem AUTO_MASTER) para a recomputação.
            const providerTablesManualOnly = allProviderTables.filter(t => !isAutoMasterRow(t));

            const normalize = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();

            const enriched: AutoEngineLogRow[] = parsed.map(p => {
                const mission = missionsById[p.missionId];
                const provider = mission?.provider || '—';
                const client = mission?.client || '—';

                let manualCost: number | null = null;
                let manualTableName: string | null = null;
                if (mission) {
                    try {
                        const providerNorm = normalize(provider);
                        // Existe ao menos uma linha manual para este fornecedor?
                        const hasManualRows = providerTablesManualOnly.some(t => {
                            const tProv = normalize(t.provider);
                            if (!tProv || tProv.length < 3) return false;
                            return tProv === providerNorm || tProv.includes(providerNorm) || providerNorm.includes(tProv);
                        });
                        if (hasManualRows) {
                            const matchedClient = allClients.find(c => normalize(c.name) === normalize(client))
                                || allClients.find(c => normalize(c.name).includes(normalize(client)) || normalize(client).includes(normalize(c.name)));
                            const fin = calculateMissionFinancials(
                                mission as any,
                                allClientTables as any,
                                providerTablesManualOnly as any,
                                matchedClient as any,
                            );
                            if (fin.hasProviderTable) {
                                // provider.total inclui pedágio; o motor sugerido é só serviço.
                                manualCost = fin.provider.serviceTotal;
                                manualTableName = fin.provider.tableName || null;
                            }
                        }
                    } catch (err) {
                        console.warn('Falha ao recomputar custo manual para OS', p.missionId, err);
                    }
                }

                const manualDivergence = manualCost != null ? (p.suggestedTotal - manualCost) : null;

                return {
                    ...p,
                    provider,
                    client,
                    costEditReason: reasonByMission[p.missionId]?.costEditReason || '',
                    revenueEditReason: reasonByMission[p.missionId]?.revenueEditReason || '',
                    reasonUser: reasonByMission[p.missionId]?.userName || '',
                    reasonAt: reasonByMission[p.missionId]?.at || '',
                    manualCost,
                    manualTableName,
                    manualDivergence,
                };
            });
            setAutoEngineRows(enriched);
        } catch (e) {
            console.error('Erro ao carregar relatório do motor automático:', e);
        } finally {
            setAutoEngineLoading(false);
        }
    };

    const fetchTimelineData = async () => {
        setTimelineLoading(true);
        try {
            const { data, error } = await supabase
                .from('missions')
                .select('id, client, provider, origin, destination, status, mission_type, created_at, startTime, endTime, start_km, end_km, vehicle_id, agent1, agent2, is_same_os, revenue_value, cost_value, toll_value, billing_approved')
                .gte('created_at', `${startDate}T00:00:00`)
                .lte('created_at', `${endDate}T23:59:59`)
                .order('created_at', { ascending: true });
            if (error) throw error;
            setTimelineMissions(data || []);
        } catch (e) {
            console.error('Erro ao carregar timeline:', e);
        } finally {
            setTimelineLoading(false);
        }
    };

    const fetchData = async () => {
        setIsLoading(true);
        try {
            // Busca expandida para incluir mais tipos de ações se necessário
            const { data, error } = await supabase
                .from('system_logs')
                .select('id, created_at, user_name, action_type, entity, entity_id, details')
                .gte('created_at', `${startDate}T00:00:00`)
                .lte('created_at', `${endDate}T23:59:59`)
                .order('created_at', { ascending: false })
                .limit(2000);

            if (error) throw error;
            setLogs(data || []);
        } catch (error) {
            console.error(error);
            alert('Erro ao carregar dados. Verifique a conexão.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleQuickFilter = (period: 'TODAY' | 'WEEK' | 'MONTH' | 'YEAR') => {
        const now = new Date();
        let start = new Date();
        const end = new Date();

        if (period === 'WEEK') {
            start.setDate(now.getDate() - 7);
        } else if (period === 'MONTH') {
            start = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (period === 'YEAR') {
            // Janela móvel de 12 meses (mês atual + 11 anteriores) para a visão Anual.
            start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        }
        // Para TODAY, start já é agora.

        setStartDate(getLocalISODate(start));
        setEndDate(getLocalISODate(end));
    };

    // --- PROCESSAMENTO DE DADOS ---

    const processedStats = useMemo(() => {
        const stats: Record<string, UserStats> = {};
        let totalSystemActions = 0;
        const actionDistribution: Record<string, number> = {
            CREATE: 0, UPDATE: 0, DELETE: 0, LOGIN: 0, OTHER: 0
        };

        logs.forEach(log => {
            const key = log.user_name || 'Sistema/Desconhecido';
            
            if (!stats[key]) {
                stats[key] = {
                    userId: log.entity_id, // Pode não ser exato se o log for genérico
                    userName: key,
                    totalActions: 0,
                    createCount: 0,
                    updateCount: 0,
                    deleteCount: 0,
                    navCount: 0,
                    lastActivity: log.created_at,
                    score: 0
                };
            }

            // Update Last Activity (Logs are sorted desc, so first hit is latest)
            // Mas como estamos iterando, precisamos garantir que pegamos o maior valor
            if (new Date(log.created_at) > new Date(stats[key].lastActivity)) {
                stats[key].lastActivity = log.created_at;
            }

            stats[key].totalActions++;
            totalSystemActions++;

            // Categorização
            if (log.action_type === 'CREATE') {
                stats[key].createCount++;
                actionDistribution.CREATE++;
                stats[key].score += 5; // Criar vale mais pontos
            } else if (log.action_type === 'UPDATE') {
                stats[key].updateCount++;
                actionDistribution.UPDATE++;
                stats[key].score += 2; // Atualizar vale pontos médios
            } else if (log.action_type === 'DELETE') {
                stats[key].deleteCount++;
                actionDistribution.DELETE++;
                stats[key].score += 3; // Deletar é ação crítica
            } else if (log.entity === 'Navigation') {
                stats[key].navCount++;
                actionDistribution.OTHER++; // Navegação entra em outros
                stats[key].score += 0.1; // Navegar vale pouco
            } else if (log.action_type === 'LOGIN') {
                actionDistribution.LOGIN++;
            } else {
                actionDistribution.OTHER++;
                stats[key].score += 1;
            }
        });

        // Ordenar usuários por pontuação (score)
        const sortedUsers = Object.values(stats).sort((a, b) => b.score - a.score);

        return {
            users: sortedUsers,
            totalActions: totalSystemActions,
            actionDistribution
        };
    }, [logs]);

    const filteredLogs = logs.filter(log => {
        const term = searchTerm.toLowerCase();
        return (log.user_name || '').toLowerCase().includes(term) ||
            (log.details || '').toLowerCase().includes(term) ||
            (log.entity || '').toLowerCase().includes(term);
    });

    const handlePrint = () => {
        window.print();
    };

    // Componente de Barra de Progresso Simples
    const ProgressBar = ({ value, max, colorClass }: { value: number, max: number, colorClass: string }) => {
        const width = Math.min(100, Math.max(0, (value / max) * 100));
        return (
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full ${colorClass}`} style={{ width: `${width}%` }}></div>
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-fade-in pb-12">
            
            {/* CABEÇALHO */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col lg:flex-row justify-between items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                        <Activity className="text-red-600" /> Relatórios Analíticos & Gestão
                    </h2>
                    <p className="text-sm text-gray-500 mt-1 ml-9">
                        Análise completa de comportamento, produtividade e auditoria do sistema.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 no-print">
                    
                    {/* Botões Rápidos */}
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button onClick={() => handleQuickFilter('TODAY')} className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-white hover:text-red-600 hover:shadow-sm rounded-md transition-all">Hoje</button>
                        <button onClick={() => handleQuickFilter('WEEK')} className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-white hover:text-red-600 hover:shadow-sm rounded-md transition-all">Semana</button>
                        <button onClick={() => handleQuickFilter('MONTH')} className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-white hover:text-red-600 hover:shadow-sm rounded-md transition-all">Mês</button>
                        <button onClick={() => handleQuickFilter('YEAR')} className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-white hover:text-red-600 hover:shadow-sm rounded-md transition-all">Ano</button>
                    </div>

                    <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                        <Calendar size={16} className="text-gray-500 ml-1" />
                        <input 
                            type="date" 
                            className="bg-transparent border-none text-xs font-bold text-gray-700 outline-none cursor-pointer"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                        <span className="text-gray-400">-</span>
                        <input 
                            type="date" 
                            className="bg-transparent border-none text-xs font-bold text-gray-700 outline-none cursor-pointer"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>
                    <button onClick={handlePrint} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white px-4 py-2.5 rounded-lg text-sm font-bold transition-colors shadow-sm">
                        <Download size={16} /> Exportar
                    </button>
                </div>
            </div>

            {/* NAVEGAÇÃO DE ABAS */}
            <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit no-print">
                <button 
                    onClick={() => setActiveTab('dashboard')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'dashboard' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <PieChart size={16} /> Visão Geral
                </button>
                <button 
                    onClick={() => setActiveTab('ranking')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'ranking' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Users size={16} /> Ranking de Usuários
                </button>
                <button 
                    onClick={() => setActiveTab('logs')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'logs' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <FileText size={16} /> Logs Detalhados
                </button>
                <button 
                    onClick={() => setActiveTab('timeline')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'timeline' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    data-testid="tab-timeline"
                >
                    <List size={16} /> Timeline de OS
                </button>
                <button 
                    onClick={() => setActiveTab('autoEngine')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'autoEngine' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    data-testid="tab-auto-engine"
                >
                    <Zap size={16} /> Motor Auto vs Manual
                </button>
                <button 
                    onClick={() => setActiveTab('manualOverride')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'manualOverride' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    data-testid="tab-manual-override"
                >
                    <UserCheck size={16} /> Edições Manuais
                </button>
                <button
                    onClick={() => setActiveTab('dhlMemory')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'dhlMemory' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    data-testid="tab-dhl-memory"
                >
                    <MapPin size={16} /> Memória DHL
                </button>
            </div>

            {/* CONTEÚDO */}
            <div className="min-h-[400px]">
                
                {/* 1. DASHBOARD OVERVIEW */}
                {activeTab === 'dashboard' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                        {/* KPI Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-xs font-bold text-gray-500 uppercase">Interações Totais</p>
                                        <h3 className="text-3xl font-black text-gray-900 mt-1">{processedStats.totalActions}</h3>
                                    </div>
                                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><MousePointer2 size={20} /></div>
                                </div>
                                <div className="mt-2 text-xs text-gray-400">Cliques e ações registradas no período</div>
                            </div>

                            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-xs font-bold text-gray-500 uppercase">Usuário + Ativo</p>
                                        <h3 className="text-lg font-black text-gray-900 mt-1 truncate max-w-[150px]" title={processedStats.users[0]?.userName}>
                                            {processedStats.users[0]?.userName || '-'}
                                        </h3>
                                    </div>
                                    <div className="p-2 bg-green-50 text-green-600 rounded-lg"><TrendingUp size={20} /></div>
                                </div>
                                <div className="mt-2 text-xs text-green-600 font-bold">Top Performance</div>
                            </div>

                            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-xs font-bold text-gray-500 uppercase">Novos Registros</p>
                                        <h3 className="text-3xl font-black text-gray-900 mt-1">{processedStats.actionDistribution.CREATE}</h3>
                                    </div>
                                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><FileText size={20} /></div>
                                </div>
                                <div className="mt-2 text-xs text-gray-400">Missões, Clientes, etc.</div>
                            </div>

                            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-xs font-bold text-gray-500 uppercase">Edições / Atualizações</p>
                                        <h3 className="text-3xl font-black text-gray-900 mt-1">{processedStats.actionDistribution.UPDATE}</h3>
                                    </div>
                                    <div className="p-2 bg-amber-50 text-amber-600 rounded-lg"><Activity size={20} /></div>
                                </div>
                                <div className="mt-2 text-xs text-gray-400">Alterações no sistema</div>
                            </div>
                        </div>

                        {/* Charts Area */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Distribuição de Ações */}
                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                                <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2"><PieChart size={18} /> Distribuição de Ações</h3>
                                <div className="space-y-4">
                                    <div>
                                        <div className="flex justify-between text-xs font-bold text-gray-600 mb-1">
                                            <span>Criação (Create)</span>
                                            <span>{Math.round((processedStats.actionDistribution.CREATE / processedStats.totalActions) * 100) || 0}%</span>
                                        </div>
                                        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-green-500" style={{ width: `${(processedStats.actionDistribution.CREATE / processedStats.totalActions) * 100}%` }}></div>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-xs font-bold text-gray-600 mb-1">
                                            <span>Atualização (Update)</span>
                                            <span>{Math.round((processedStats.actionDistribution.UPDATE / processedStats.totalActions) * 100) || 0}%</span>
                                        </div>
                                        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-blue-500" style={{ width: `${(processedStats.actionDistribution.UPDATE / processedStats.totalActions) * 100}%` }}></div>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-xs font-bold text-gray-600 mb-1">
                                            <span>Exclusão (Delete)</span>
                                            <span>{Math.round((processedStats.actionDistribution.DELETE / processedStats.totalActions) * 100) || 0}%</span>
                                        </div>
                                        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-red-500" style={{ width: `${(processedStats.actionDistribution.DELETE / processedStats.totalActions) * 100}%` }}></div>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-xs font-bold text-gray-600 mb-1">
                                            <span>Navegação / Outros</span>
                                            <span>{Math.round((processedStats.actionDistribution.OTHER / processedStats.totalActions) * 100) || 0}%</span>
                                        </div>
                                        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-gray-400" style={{ width: `${(processedStats.actionDistribution.OTHER / processedStats.totalActions) * 100}%` }}></div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Top 5 Usuários */}
                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                                <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2"><Users size={18} /> Top 5 Usuários Ativos</h3>
                                <div className="space-y-4">
                                    {processedStats.users.slice(0, 5).map((user, idx) => (
                                        <div key={user.userName} className="flex items-center gap-3">
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                                                {idx + 1}
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="font-bold text-gray-700 truncate max-w-[150px]">{user.userName}</span>
                                                    <span className="text-gray-500">{user.totalActions} ações</span>
                                                </div>
                                                <ProgressBar value={user.totalActions} max={processedStats.users[0].totalActions} colorClass="bg-indigo-600" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. RANKING DE USUÁRIOS */}
                {activeTab === 'ranking' && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-right-4">
                        <div className="p-4 border-b border-gray-100 bg-gray-50 font-bold text-sm text-gray-700">
                            Gestão de Produtividade da Equipe
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase font-bold border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-3">Posição</th>
                                        <th className="px-6 py-3">Usuário</th>
                                        <th className="px-6 py-3 text-center">Score Produtividade</th>
                                        <th className="px-6 py-3 text-center">Cadastros</th>
                                        <th className="px-6 py-3 text-center">Edições</th>
                                        <th className="px-6 py-3 text-center">Navegação</th>
                                        <th className="px-6 py-3 text-right">Última Atividade</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {processedStats.users.map((user, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-bold ${
                                                    idx === 0 ? 'bg-yellow-100 text-yellow-800' :
                                                    idx === 1 ? 'bg-gray-200 text-gray-700' :
                                                    idx === 2 ? 'bg-orange-100 text-orange-800' : 'text-gray-400'
                                                }`}>
                                                    {idx + 1}º
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs border border-blue-100">
                                                        {user.userName.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-gray-800">{user.userName}</p>
                                                        <p className="text-[10px] text-gray-400">{user.totalActions} logs totais</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col items-center">
                                                    <span className="text-sm font-black text-indigo-900">{user.score.toFixed(1)}</span>
                                                    <div className="w-24 h-1.5 bg-gray-100 rounded-full mt-1">
                                                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(user.score / processedStats.users[0].score) * 100}%` }}></div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center text-sm font-mono text-green-600 font-bold bg-green-50/30">
                                                {user.createCount}
                                            </td>
                                            <td className="px-6 py-4 text-center text-sm font-mono text-blue-600 font-bold bg-blue-50/30">
                                                {user.updateCount}
                                            </td>
                                            <td className="px-6 py-4 text-center text-sm font-mono text-gray-500">
                                                {user.navCount}
                                            </td>
                                            <td className="px-6 py-4 text-right text-xs text-gray-500">
                                                {new Date(user.lastActivity).toLocaleString('pt-BR')}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* 3. LOGS DETALHADOS (AUDITORIA) */}
                {activeTab === 'logs' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex items-center gap-2">
                            <Search className="text-gray-400" size={20} />
                            <input 
                                type="text" 
                                placeholder="Filtrar logs por usuário, ação ou detalhe..." 
                                className="flex-1 outline-none text-sm text-gray-700"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase font-bold border-b border-gray-200">
                                        <tr>
                                            <th className="px-6 py-3">Data/Hora</th>
                                            <th className="px-6 py-3">Usuário</th>
                                            <th className="px-6 py-3">Tipo Ação</th>
                                            <th className="px-6 py-3">Entidade</th>
                                            <th className="px-6 py-3">Detalhes</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredLogs.length === 0 ? (
                                            <tr><td colSpan={5} className="p-8 text-center text-gray-500">Nenhum log encontrado para o filtro.</td></tr>
                                        ) : filteredLogs.slice(0, 100).map((log) => (
                                            <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-3 whitespace-nowrap text-xs text-gray-500 font-mono">
                                                    {new Date(log.created_at).toLocaleString('pt-BR')}
                                                </td>
                                                <td className="px-6 py-3 text-xs font-bold text-gray-700">
                                                    {log.user_name}
                                                </td>
                                                <td className="px-6 py-3">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                                                        log.action_type === 'CREATE' ? 'bg-green-50 text-green-700 border-green-200' :
                                                        log.action_type === 'DELETE' ? 'bg-red-50 text-red-700 border-red-200' :
                                                        log.action_type === 'UPDATE' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                        log.action_type === 'LOGIN' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                                        'bg-gray-50 text-gray-600 border-gray-200'
                                                    }`}>
                                                        {log.action_type}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-3 text-xs font-medium text-gray-600">
                                                    {log.entity} <span className="text-gray-400 text-[9px]">#{log.entity_id}</span>
                                                </td>
                                                <td className="px-6 py-3 text-xs text-gray-600 max-w-md truncate" title={log.details}>
                                                    {log.details}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {filteredLogs.length > 100 && (
                                    <div className="p-2 text-center text-[10px] text-gray-400 bg-gray-50 border-t border-gray-200">
                                        Exibindo os 100 logs mais recentes de {filteredLogs.length} encontrados. Use o filtro para refinar.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'timeline' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                        <div className="flex flex-wrap gap-3 items-center no-print">
                            <div className="flex items-center gap-2">
                                <Filter size={14} className="text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Filtrar cliente..."
                                    value={timelineClientFilter}
                                    onChange={e => setTimelineClientFilter(e.target.value)}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs w-40"
                                    data-testid="input-timeline-client-filter"
                                />
                                <input
                                    type="text"
                                    placeholder="Filtrar fornecedor..."
                                    value={timelineProviderFilter}
                                    onChange={e => setTimelineProviderFilter(e.target.value)}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs w-40"
                                    data-testid="input-timeline-provider-filter"
                                />
                                <select
                                    value={timelineStatusFilter}
                                    onChange={e => setTimelineStatusFilter(e.target.value)}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs"
                                    data-testid="select-timeline-status-filter"
                                >
                                    <option value="">Todos os Status</option>
                                    <option value="COMPLETED">Concluída</option>
                                    <option value="IN_PROGRESS">Em Andamento</option>
                                    <option value="PENDING">Pendente</option>
                                    <option value="CANCELLED">Cancelada</option>
                                </select>
                            </div>
                            <button
                                onClick={() => window.print()}
                                className="ml-auto px-4 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors"
                                data-testid="btn-print-timeline"
                            >
                                <Printer size={14} /> Imprimir
                            </button>
                        </div>

                        {timelineLoading ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 size={32} className="animate-spin text-red-500" />
                            </div>
                        ) : (() => {
                            const filtered = timelineMissions.filter(m => {
                                if (timelineClientFilter && !(m.client || '').toUpperCase().includes(timelineClientFilter.toUpperCase())) return false;
                                if (timelineProviderFilter && !(m.provider || '').toUpperCase().includes(timelineProviderFilter.toUpperCase())) return false;
                                if (timelineStatusFilter && m.status !== timelineStatusFilter) return false;
                                return true;
                            });

                            const grouped: Record<string, any[]> = {};
                            filtered.forEach(m => {
                                const dateKey = new Date(m.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
                                if (!grouped[dateKey]) grouped[dateKey] = [];
                                grouped[dateKey].push(m);
                            });

                            const sortedDates = Object.keys(grouped).sort((a, b) => {
                                const [dA, mA, yA] = a.split('/').map(Number);
                                const [dB, mB, yB] = b.split('/').map(Number);
                                return new Date(yA, mA - 1, dA).getTime() - new Date(yB, mB - 1, dB).getTime();
                            });

                            const statusLabel = (s: string) => {
                                if (s === 'COMPLETED') return { text: 'Concluída', color: 'bg-emerald-100 text-emerald-700' };
                                if (s === 'IN_PROGRESS') return { text: 'Em Andamento', color: 'bg-blue-100 text-blue-700' };
                                if (s === 'PENDING') return { text: 'Pendente', color: 'bg-amber-100 text-amber-700' };
                                if (s === 'CANCELLED') return { text: 'Cancelada', color: 'bg-red-100 text-red-700' };
                                return { text: s || '-', color: 'bg-gray-100 text-gray-600' };
                            };

                            const extractCity = (addr: string) => {
                                if (!addr) return '-';
                                const parts = addr.split(',');
                                if (parts.length >= 2) {
                                    const cityPart = parts[1]?.trim().split('-')[0]?.trim();
                                    if (cityPart && cityPart.length > 2) return cityPart;
                                }
                                return parts[0]?.trim().substring(0, 30) || '-';
                            };

                            let globalCounter = 0;

                            return (
                                <div className="space-y-6">
                                    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                                        <div>
                                            <p className="text-lg font-black text-gray-800">{filtered.length} <span className="text-sm font-bold text-gray-500">OS criadas no período</span></p>
                                            <p className="text-[10px] text-gray-400">{sortedDates.length} dia(s) com atividade</p>
                                        </div>
                                        <div className="flex gap-4 text-center">
                                            <div>
                                                <p className="text-lg font-black text-emerald-600">{filtered.filter(m => m.status === 'COMPLETED').length}</p>
                                                <p className="text-[9px] font-bold text-gray-400 uppercase">Concluídas</p>
                                            </div>
                                            <div>
                                                <p className="text-lg font-black text-blue-600">{filtered.filter(m => m.status === 'IN_PROGRESS').length}</p>
                                                <p className="text-[9px] font-bold text-gray-400 uppercase">Em Andamento</p>
                                            </div>
                                            <div>
                                                <p className="text-lg font-black text-amber-600">{filtered.filter(m => m.status === 'PENDING').length}</p>
                                                <p className="text-[9px] font-bold text-gray-400 uppercase">Pendentes</p>
                                            </div>
                                            <div>
                                                <p className="text-lg font-black text-red-600">{filtered.filter(m => m.status === 'CANCELLED').length}</p>
                                                <p className="text-[9px] font-bold text-gray-400 uppercase">Canceladas</p>
                                            </div>
                                        </div>
                                    </div>

                                    {sortedDates.map(dateStr => {
                                        const dayMissions = grouped[dateStr];
                                        return (
                                            <div key={dateStr} className="relative">
                                                <div className="sticky top-0 z-10 bg-gradient-to-r from-red-600 to-red-700 text-white px-5 py-2.5 rounded-xl shadow-md flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-3">
                                                        <Calendar size={18} />
                                                        <span className="font-black text-sm uppercase tracking-wider">{dateStr}</span>
                                                    </div>
                                                    <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold">{dayMissions.length} OS</span>
                                                </div>

                                                <div className="space-y-1.5 pl-2">
                                                    {dayMissions.map((m: any) => {
                                                        globalCounter++;
                                                        const st = statusLabel(m.status);
                                                        const hora = new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
                                                        const revTotal = (m.revenue_value || 0) + (m.toll_value || 0);
                                                        const costTotal = (m.cost_value || 0) + (m.toll_value || 0);
                                                        
                                                        return (
                                                            <div key={m.id} className="flex items-stretch gap-3 group" data-testid={`timeline-row-${m.id}`}>
                                                                <div className="flex flex-col items-center">
                                                                    <div className="w-8 h-8 rounded-full bg-gray-800 text-white flex items-center justify-center text-[10px] font-black shrink-0">{globalCounter}</div>
                                                                    <div className="w-0.5 flex-1 bg-gray-200 group-last:hidden" />
                                                                </div>

                                                                <div className="flex-1 bg-white border border-gray-200 rounded-xl p-3 hover:shadow-md transition-shadow mb-1">
                                                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="font-black text-sm text-gray-900" data-testid={`timeline-id-${m.id}`}>{m.id}</span>
                                                                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${st.color}`}>{st.text}</span>
                                                                            {m.is_same_os && <span className="text-[8px] font-black bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">MESMA OS</span>}
                                                                            {m.billing_approved && <span className="text-[8px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">FATURADO</span>}
                                                                            {m.mission_type && <span className="text-[8px] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full uppercase">{m.mission_type}</span>}
                                                                        </div>
                                                                        <span className="text-[10px] font-mono text-gray-400 flex items-center gap-1"><Clock size={10} /> {hora}</span>
                                                                    </div>
                                                                    
                                                                    <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-[10px]">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <Building2 size={11} className="text-blue-500" />
                                                                            <span className="font-bold text-gray-700 truncate max-w-[200px]">{m.client || '-'}</span>
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5">
                                                                            <Briefcase size={11} className="text-indigo-500" />
                                                                            <span className="font-bold text-gray-600 truncate max-w-[200px]">{m.provider || 'Pendente'}</span>
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5 text-gray-500">
                                                                            <MapPin size={11} className="text-red-400" />
                                                                            <span className="truncate max-w-[150px]">{extractCity(m.origin)}</span>
                                                                            <ArrowRight size={10} />
                                                                            <span className="truncate max-w-[150px]">{extractCity(m.destination)}</span>
                                                                        </div>
                                                                    </div>

                                                                    {(revTotal > 0 || costTotal > 0) && (
                                                                        <div className="flex gap-4 mt-2 text-[10px]">
                                                                            <span className="font-bold text-green-700">Receita: R$ {revTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                                            <span className="font-bold text-blue-700">Custo: R$ {costTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                                            {revTotal > 0 && costTotal > 0 && (
                                                                                <span className={`font-black ${revTotal - costTotal >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                                                    Margem: {((1 - costTotal / revTotal) * 100).toFixed(1)}%
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {filtered.length === 0 && (
                                        <div className="text-center py-20 text-gray-400">
                                            <List size={48} className="mx-auto mb-4 opacity-30" />
                                            <p className="font-bold text-lg">Nenhuma OS encontrada</p>
                                            <p className="text-sm">Ajuste o período ou os filtros para ver resultados.</p>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* 5. MOTOR AUTOMÁTICO vs MANUAL (Task #57) */}
                {activeTab === 'autoEngine' && (() => {
                    const filtered = autoEngineRows.filter(r => {
                        if (autoEngineProviderFilter && !(r.provider || '').toUpperCase().includes(autoEngineProviderFilter.toUpperCase())) return false;
                        if (autoEngineOnlyDivergent && !r.divergent) return false;
                        return true;
                    });
                    const totalSuggested = filtered.reduce((a, r) => a + r.suggestedTotal, 0);
                    const totalSaved = filtered.reduce((a, r) => a + r.savedCost, 0);
                    const totalDivergence = totalSaved - totalSuggested;
                    const divergentCount = filtered.filter(r => r.divergent).length;

                    // Agregação mensal para acompanhar a evolução de uso do motor (Task #61).
                    // Gera todos os buckets entre startDate e endDate (inclusive) para que
                    // meses sem registros apareçam zerados — essencial para a visão Anual (12 meses).
                    const monthlyMap: Record<string, { month: string; count: number; suggested: number; saved: number; divergenceAbs: number }> = {};
                    const monthKey = (y: number, m0: number) => `${y}-${String(m0 + 1).padStart(2, '0')}`;
                    const [sy, sm] = startDate.split('-').map(Number);
                    const [ey, em] = endDate.split('-').map(Number);
                    if (sy && sm && ey && em) {
                        let cursor = new Date(sy, sm - 1, 1);
                        const lastBucket = new Date(ey, em - 1, 1);
                        // safety cap: no more than 24 buckets
                        let guard = 0;
                        while (cursor.getTime() <= lastBucket.getTime() && guard < 24) {
                            const k = monthKey(cursor.getFullYear(), cursor.getMonth());
                            monthlyMap[k] = { month: k, count: 0, suggested: 0, saved: 0, divergenceAbs: 0 };
                            cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
                            guard++;
                        }
                    }
                    filtered.forEach(r => {
                        const d = new Date(r.createdAt);
                        if (isNaN(d.getTime())) return;
                        const key = monthKey(d.getFullYear(), d.getMonth());
                        if (!monthlyMap[key]) monthlyMap[key] = { month: key, count: 0, suggested: 0, saved: 0, divergenceAbs: 0 };
                        monthlyMap[key].count++;
                        monthlyMap[key].suggested += r.suggestedTotal;
                        monthlyMap[key].saved += r.savedCost;
                        monthlyMap[key].divergenceAbs += Math.abs(r.divergence);
                    });
                    const monthlyData = Object.values(monthlyMap)
                        .sort((a, b) => a.month.localeCompare(b.month))
                        .map(m => {
                            const [y, mo] = m.month.split('-');
                            const label = new Date(Number(y), Number(mo) - 1, 1)
                                .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
                                .replace('.', '');
                            return { ...m, label };
                        });


                    const byProvider: Record<string, { provider: string; count: number; suggested: number; saved: number; divergent: number; manual: number; manualCount: number; suggestedOnManualSubset: number }> = {};
                    filtered.forEach(r => {
                        const key = (r.provider || '—').toUpperCase().trim();
                        if (!byProvider[key]) byProvider[key] = { provider: r.provider || '—', count: 0, suggested: 0, saved: 0, divergent: 0, manual: 0, manualCount: 0, suggestedOnManualSubset: 0 };
                        byProvider[key].count++;
                        byProvider[key].suggested += r.suggestedTotal;
                        byProvider[key].saved += r.savedCost;
                        if (r.divergent) byProvider[key].divergent++;
                        if (r.manualCost != null) {
                            byProvider[key].manual += r.manualCost;
                            byProvider[key].manualCount++;
                            byProvider[key].suggestedOnManualSubset += r.suggestedTotal;
                        }
                    });
                    const providerRows = Object.values(byProvider).sort((a, b) => Math.abs(b.saved - b.suggested) - Math.abs(a.saved - a.suggested));

                    const handleExportCsv = () => {
                        const header = ['Data/Hora', 'OS', 'Cliente', 'Fornecedor', 'KM Real', 'Faixa KM', 'Horas (Regra Ouro)', 'Custo Sugerido (Motor)', 'Custo Salvo', 'Divergência', 'Custo Tabela Manual', 'Tabela Manual Aplicada', 'Divergência Motor − Manual', 'Usuário'];
                        const lines = [header.join(';')];
                        filtered.forEach(r => {
                            lines.push([
                                new Date(r.createdAt).toLocaleString('pt-BR'),
                                r.missionId,
                                (r.client || '').replace(/;/g, ','),
                                (r.provider || '').replace(/;/g, ','),
                                r.realKm ?? '',
                                r.bandKm ?? '',
                                r.goldenHours != null ? r.goldenHours.toFixed(2) : '',
                                r.suggestedTotal.toFixed(2).replace('.', ','),
                                r.savedCost.toFixed(2).replace('.', ','),
                                r.divergence.toFixed(2).replace('.', ','),
                                r.manualCost != null ? r.manualCost.toFixed(2).replace('.', ',') : '',
                                (r.manualTableName || '').replace(/;/g, ','),
                                r.manualDivergence != null ? r.manualDivergence.toFixed(2).replace('.', ',') : '',
                                (r.userName || '').replace(/;/g, ','),
                            ].join(';'));
                        });
                        const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `motor_auto_vs_manual_${startDate}_${endDate}.csv`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    };

                    return (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                            <div className="flex flex-wrap gap-3 items-center no-print">
                                <div className="flex items-center gap-2">
                                    <Filter size={14} className="text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Filtrar fornecedor..."
                                        value={autoEngineProviderFilter}
                                        onChange={e => setAutoEngineProviderFilter(e.target.value)}
                                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs w-48"
                                        data-testid="input-auto-engine-provider-filter"
                                    />
                                    <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={autoEngineOnlyDivergent}
                                            onChange={e => setAutoEngineOnlyDivergent(e.target.checked)}
                                            className="accent-red-600"
                                            data-testid="checkbox-auto-engine-divergent"
                                        />
                                        Apenas divergentes
                                    </label>
                                </div>
                                <div className="ml-auto flex gap-2">
                                    <button
                                        onClick={handleExportCsv}
                                        className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors"
                                        data-testid="btn-export-auto-engine-csv"
                                    >
                                        <Download size={14} /> CSV
                                    </button>
                                    <button
                                        onClick={() => window.print()}
                                        className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors"
                                        data-testid="btn-print-auto-engine"
                                    >
                                        <Printer size={14} /> Imprimir
                                    </button>
                                </div>
                            </div>

                            {autoEngineLoading ? (
                                <div className="flex items-center justify-center py-20">
                                    <Loader2 size={32} className="animate-spin text-red-500" />
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                            <p className="text-[9px] font-black text-gray-400 uppercase mb-1">OS calculadas pelo motor</p>
                                            <p className="text-2xl font-black text-indigo-700" data-testid="kpi-auto-engine-count">{filtered.length}</p>
                                            <p className="text-[9px] text-gray-500 font-bold mt-1">{divergentCount} divergente(s)</p>
                                        </div>
                                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                            <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Custo Sugerido (Motor)</p>
                                            <p className="text-lg font-black text-blue-700 font-mono" data-testid="kpi-auto-engine-suggested">{formatCurrencyBR(totalSuggested)}</p>
                                            <p className="text-[9px] text-blue-500 font-bold mt-1">Total no período</p>
                                        </div>
                                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                            <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Custo Salvo (Canônico)</p>
                                            <p className="text-lg font-black text-amber-700 font-mono" data-testid="kpi-auto-engine-saved">{formatCurrencyBR(totalSaved)}</p>
                                            <p className="text-[9px] text-amber-500 font-bold mt-1">Total no período</p>
                                        </div>
                                        <div className={`p-4 rounded-xl border-2 shadow-sm ${Math.abs(totalDivergence) > 0.01 ? (totalDivergence > 0 ? 'border-red-300 bg-red-50' : 'border-emerald-300 bg-emerald-50') : 'border-gray-200 bg-white'}`}>
                                            <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Divergência (Salvo − Sugerido)</p>
                                            <p className={`text-lg font-black font-mono ${totalDivergence > 0.01 ? 'text-red-700' : totalDivergence < -0.01 ? 'text-emerald-700' : 'text-gray-700'}`} data-testid="kpi-auto-engine-divergence">
                                                {totalDivergence >= 0 ? '+' : ''}{formatCurrencyBR(totalDivergence)}
                                            </p>
                                            <p className="text-[9px] text-gray-500 font-bold mt-1">{totalDivergence > 0.01 ? 'Salvou MAIS que o motor' : totalDivergence < -0.01 ? 'Salvou MENOS que o motor' : 'Sem desvio'}</p>
                                        </div>
                                    </div>

                                    {/* Evolução mensal do uso do motor (Task #61) */}
                                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                        <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-200 flex items-center justify-between gap-2">
                                            <h4 className="text-xs font-black text-indigo-800 uppercase flex items-center gap-2">
                                                <TrendingUp size={14} /> Evolução Mensal — Motor Automático
                                            </h4>
                                            <span className="text-[10px] font-bold text-indigo-600">
                                                {monthlyData.length} mês(es) no período · clique "Ano" para janela móvel de 12 meses
                                            </span>
                                        </div>
                                        <div className="p-4">
                                            {monthlyData.length === 0 ? (
                                                <div className="py-10 text-center text-xs text-gray-400" data-testid="empty-auto-engine-monthly">
                                                    Nenhum dado mensal do motor no período selecionado.
                                                </div>
                                            ) : (
                                                <div className="w-full" style={{ height: 320 }} data-testid="chart-auto-engine-monthly">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <ComposedChart data={monthlyData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#eef2ff" />
                                                            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#4b5563' }} />
                                                            <YAxis
                                                                yAxisId="left"
                                                                tick={{ fontSize: 11, fill: '#4338ca' }}
                                                                label={{ value: 'OS', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#4338ca' } }}
                                                            />
                                                            <YAxis
                                                                yAxisId="right"
                                                                orientation="right"
                                                                tick={{ fontSize: 11, fill: '#b45309' }}
                                                                tickFormatter={(v: number) => `R$ ${(v / 1000).toFixed(0)}k`}
                                                            />
                                                            <Tooltip
                                                                formatter={(value: any, name: string) => {
                                                                    if (name === 'OS processadas') return [value, name];
                                                                    return [formatCurrencyBR(Number(value)), name];
                                                                }}
                                                                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                                                            />
                                                            <Legend wrapperStyle={{ fontSize: 11 }} />
                                                            <Bar yAxisId="left" dataKey="count" name="OS processadas" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={18} />
                                                            <Bar yAxisId="right" dataKey="suggested" name="Total Sugerido" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={18} />
                                                            <Bar yAxisId="right" dataKey="saved" name="Total Salvo" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={18} />
                                                            <Line yAxisId="right" type="monotone" dataKey="divergenceAbs" name="Divergência absoluta" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
                                                        </ComposedChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Totalizador por fornecedor */}
                                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                        <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-200">
                                            <h4 className="text-xs font-black text-indigo-800 uppercase flex items-center gap-2">
                                                <Scale size={14} /> Totalizador por Fornecedor
                                            </h4>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="text-[9px] font-black text-indigo-700 uppercase bg-indigo-50/40">
                                                        <th className="px-4 py-2">Fornecedor</th>
                                                        <th className="px-4 py-2 text-right">OS</th>
                                                        <th className="px-4 py-2 text-right">Divergentes</th>
                                                        <th className="px-4 py-2 text-right">Sugerido (Motor)</th>
                                                        <th className="px-4 py-2 text-right">Salvo</th>
                                                        <th className="px-4 py-2 text-right">Divergência</th>
                                                        <th className="px-4 py-2 text-right" title="Custo recomputado usando as tabelas manuais (não-AUTO) do próprio fornecedor.">Tabela Manual</th>
                                                        <th className="px-4 py-2 text-right" title="Motor − Tabela Manual. Positivo = motor cobra MAIS que a tabela legada.">Motor − Manual</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {providerRows.length === 0 ? (
                                                        <tr><td colSpan={8} className="px-4 py-6 text-center text-xs text-gray-400">Nenhum registro do motor automático no período.</td></tr>
                                                    ) : providerRows.map((p, i) => {
                                                        const div = p.saved - p.suggested;
                                                        const motorVsManual = p.manualCount > 0 ? (p.suggestedOnManualSubset - p.manual) : null;
                                                        return (
                                                            <tr key={i} className="border-t border-gray-100 hover:bg-indigo-50/30" data-testid={`row-auto-engine-provider-${i}`}>
                                                                <td className="px-4 py-2 text-sm font-bold text-gray-800">{p.provider}</td>
                                                                <td className="px-4 py-2 text-sm text-gray-600 text-right">{p.count}</td>
                                                                <td className="px-4 py-2 text-sm text-right">
                                                                    {p.divergent > 0
                                                                        ? <span className="font-bold text-red-600">{p.divergent}</span>
                                                                        : <span className="text-gray-400">0</span>}
                                                                </td>
                                                                <td className="px-4 py-2 text-sm font-mono text-blue-700 text-right">{formatCurrencyBR(p.suggested)}</td>
                                                                <td className="px-4 py-2 text-sm font-mono text-amber-700 text-right">{formatCurrencyBR(p.saved)}</td>
                                                                <td className={`px-4 py-2 text-sm font-mono font-black text-right ${Math.abs(div) < 0.01 ? 'text-gray-500' : div > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                                                    {div >= 0 ? '+' : ''}{formatCurrencyBR(div)}
                                                                </td>
                                                                <td className="px-4 py-2 text-sm font-mono text-purple-700 text-right" title={p.manualCount < p.count ? `${p.manualCount}/${p.count} OS com tabela manual disponível` : undefined}>
                                                                    {p.manualCount > 0 ? formatCurrencyBR(p.manual) : <span className="text-gray-400">—</span>}
                                                                    {p.manualCount > 0 && p.manualCount < p.count && (
                                                                        <span className="ml-1 text-[9px] text-gray-400">({p.manualCount}/{p.count})</span>
                                                                    )}
                                                                </td>
                                                                <td className={`px-4 py-2 text-sm font-mono font-black text-right ${motorVsManual == null ? 'text-gray-400' : Math.abs(motorVsManual) < 0.01 ? 'text-gray-500' : motorVsManual > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                                                    {motorVsManual == null ? '—' : `${motorVsManual >= 0 ? '+' : ''}${formatCurrencyBR(motorVsManual)}`}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                    {providerRows.length > 0 && (() => {
                                                        const totalManual = providerRows.reduce((a, p) => a + p.manual, 0);
                                                        const totalManualCount = providerRows.reduce((a, p) => a + p.manualCount, 0);
                                                        const motorSubsetForManual = providerRows.reduce((a, p) => a + p.suggestedOnManualSubset, 0);
                                                        const totalMotorVsManualSubset = motorSubsetForManual - totalManual;
                                                        return (
                                                                <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                                                                    <td className="px-4 py-2 text-xs font-black text-indigo-800 uppercase">Total</td>
                                                                    <td className="px-4 py-2 text-sm font-black text-indigo-800 text-right">{filtered.length}</td>
                                                                    <td className="px-4 py-2 text-sm font-black text-red-700 text-right">{divergentCount}</td>
                                                                    <td className="px-4 py-2 text-sm font-mono font-black text-blue-800 text-right">{formatCurrencyBR(totalSuggested)}</td>
                                                                    <td className="px-4 py-2 text-sm font-mono font-black text-amber-800 text-right">{formatCurrencyBR(totalSaved)}</td>
                                                                    <td className={`px-4 py-2 text-sm font-mono font-black text-right ${Math.abs(totalDivergence) < 0.01 ? 'text-gray-500' : totalDivergence > 0 ? 'text-red-800' : 'text-emerald-800'}`}>
                                                                        {totalDivergence >= 0 ? '+' : ''}{formatCurrencyBR(totalDivergence)}
                                                                    </td>
                                                                    <td className="px-4 py-2 text-sm font-mono font-black text-purple-800 text-right" title={`${totalManualCount}/${filtered.length} OS com tabela manual disponível`}>
                                                                        {totalManualCount > 0 ? formatCurrencyBR(totalManual) : <span className="text-gray-400">—</span>}
                                                                    </td>
                                                                    <td className={`px-4 py-2 text-sm font-mono font-black text-right ${totalManualCount === 0 ? 'text-gray-400' : Math.abs(totalMotorVsManualSubset) < 0.01 ? 'text-gray-500' : totalMotorVsManualSubset > 0 ? 'text-red-800' : 'text-emerald-800'}`} title={totalManualCount > 0 ? `Motor cobrou ${formatCurrencyBR(motorSubsetForManual)} nessas ${totalManualCount} OS; tabela manual cobraria ${formatCurrencyBR(totalManual)}.` : undefined}>
                                                                        {totalManualCount === 0 ? '—' : `${totalMotorVsManualSubset >= 0 ? '+' : ''}${formatCurrencyBR(totalMotorVsManualSubset)}`}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })()}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Detalhe por OS */}
                                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                                            <h4 className="text-xs font-black text-gray-700 uppercase flex items-center gap-2">
                                                <FileText size={14} /> Detalhe por OS — Custo Sugerido vs. Custo Salvo
                                            </h4>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="text-[9px] font-black text-gray-500 uppercase bg-gray-50">
                                                        <th className="px-4 py-2">Data</th>
                                                        <th className="px-4 py-2">OS</th>
                                                        <th className="px-4 py-2">Cliente</th>
                                                        <th className="px-4 py-2">Fornecedor</th>
                                                        <th className="px-4 py-2 text-right">KM (Real / Faixa)</th>
                                                        <th className="px-4 py-2 text-right">Horas</th>
                                                        <th className="px-4 py-2 text-right">Sugerido</th>
                                                        <th className="px-4 py-2 text-right">Salvo</th>
                                                        <th className="px-4 py-2 text-right">Divergência</th>
                                                        <th className="px-4 py-2 text-right" title="Custo recomputado usando as tabelas manuais (não-AUTO) do próprio fornecedor.">Tabela Manual</th>
                                                        <th className="px-4 py-2 text-right" title="Motor − Tabela Manual. Positivo = motor cobra MAIS que a tabela legada.">Motor − Manual</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filtered.length === 0 ? (
                                                        <tr><td colSpan={11} className="px-4 py-6 text-center text-xs text-gray-400">Nenhum registro encontrado no período/filtro.</td></tr>
                                                    ) : filtered.slice(0, 500).map(r => (
                                                        <tr key={r.logId} className={`border-t border-gray-100 hover:bg-gray-50 ${r.divergent ? 'bg-red-50/30' : ''}`} data-testid={`row-auto-engine-${r.missionId}`}>
                                                            <td className="px-4 py-2 text-[11px] text-gray-500 font-mono whitespace-nowrap">{new Date(r.createdAt).toLocaleString('pt-BR')}</td>
                                                            <td className="px-4 py-2 text-xs font-black text-gray-800">{r.missionId}</td>
                                                            <td className="px-4 py-2 text-xs text-gray-600 truncate max-w-[160px]" title={r.client}>{r.client}</td>
                                                            <td className="px-4 py-2 text-xs font-bold text-gray-700 truncate max-w-[160px]" title={r.provider}>{r.provider}</td>
                                                            <td className="px-4 py-2 text-[11px] font-mono text-gray-600 text-right whitespace-nowrap">{r.realKm ?? '-'} / {r.bandKm ?? '-'}</td>
                                                            <td className="px-4 py-2 text-[11px] font-mono text-gray-600 text-right">{r.goldenHours != null ? r.goldenHours.toFixed(2) : '-'}</td>
                                                            <td className="px-4 py-2 text-xs font-mono text-blue-700 text-right">{formatCurrencyBR(r.suggestedTotal)}</td>
                                                            <td className="px-4 py-2 text-xs font-mono text-amber-700 text-right">{formatCurrencyBR(r.savedCost)}</td>
                                                            <td className={`px-4 py-2 text-xs font-mono font-black text-right ${!r.divergent ? 'text-gray-400' : r.divergence > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                                                {r.divergent ? `${r.divergence >= 0 ? '+' : ''}${formatCurrencyBR(r.divergence)}` : '—'}
                                                            </td>
                                                            <td className="px-4 py-2 text-xs font-mono text-purple-700 text-right" title={r.manualTableName ? `Tabela aplicada: ${r.manualTableName}` : 'Sem tabela manual cadastrada para este fornecedor.'}>
                                                                {r.manualCost != null ? formatCurrencyBR(r.manualCost) : <span className="text-gray-400">—</span>}
                                                            </td>
                                                            <td className={`px-4 py-2 text-xs font-mono font-black text-right ${r.manualDivergence == null ? 'text-gray-400' : Math.abs(r.manualDivergence) < 0.01 ? 'text-gray-500' : r.manualDivergence > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                                                {r.manualDivergence == null ? '—' : `${r.manualDivergence >= 0 ? '+' : ''}${formatCurrencyBR(r.manualDivergence)}`}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            {filtered.length > 500 && (
                                                <div className="p-2 text-center text-[10px] text-gray-400 bg-gray-50 border-t border-gray-200">
                                                    Exibindo as 500 OS mais recentes de {filtered.length}. Refine o período ou o filtro de fornecedor para reduzir.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })()}

                {/* 6. AUDITORIA DE EDIÇÕES MANUAIS SOBRE O MOTOR (Task #62) */}
                {activeTab === 'manualOverride' && (() => {
                    const divergentRows = autoEngineRows.filter(r => r.divergent);
                    const filtered = divergentRows.filter(r => {
                        if (manualOverrideProviderFilter && !(r.provider || '').toUpperCase().includes(manualOverrideProviderFilter.toUpperCase())) return false;
                        if (manualOverrideUserFilter && !(r.userName || '').toUpperCase().includes(manualOverrideUserFilter.toUpperCase())) return false;
                        return true;
                    });

                    const totalSuggested = filtered.reduce((a, r) => a + r.suggestedTotal, 0);
                    const totalSaved = filtered.reduce((a, r) => a + r.savedCost, 0);
                    const totalDivergence = totalSaved - totalSuggested;

                    // Ranking por usuário e por fornecedor
                    const byUser: Record<string, { user: string; count: number; divergence: number }> = {};
                    const byProvider: Record<string, { provider: string; count: number; divergence: number }> = {};
                    filtered.forEach(r => {
                        const u = r.userName || '—';
                        const p = r.provider || '—';
                        if (!byUser[u]) byUser[u] = { user: u, count: 0, divergence: 0 };
                        byUser[u].count++;
                        byUser[u].divergence += r.divergence;
                        if (!byProvider[p]) byProvider[p] = { provider: p, count: 0, divergence: 0 };
                        byProvider[p].count++;
                        byProvider[p].divergence += r.divergence;
                    });
                    const userRows = Object.values(byUser).sort((a, b) => b.count - a.count);
                    const providerRows = Object.values(byProvider).sort((a, b) => b.count - a.count);

                    const reasonOf = (r: AutoEngineLogRow) => r.costEditReason || r.revenueEditReason || '';

                    const handleExportCsv = () => {
                        const header = ['Data/Hora Edicao', 'OS', 'Usuario (Recalculo)', 'Cliente', 'Fornecedor', 'Custo Sugerido (Motor)', 'Custo Salvo', 'Diferenca', 'Motivo (Custo)', 'Motivo (Receita)', 'Usuario (Motivo)', 'Data Motivo'];
                        const lines = [header.join(';')];
                        filtered.forEach(r => {
                            lines.push([
                                new Date(r.createdAt).toLocaleString('pt-BR'),
                                r.missionId,
                                (r.userName || '').replace(/[;\n\r]/g, ' '),
                                (r.client || '').replace(/[;\n\r]/g, ' '),
                                (r.provider || '').replace(/[;\n\r]/g, ' '),
                                r.suggestedTotal.toFixed(2).replace('.', ','),
                                r.savedCost.toFixed(2).replace('.', ','),
                                r.divergence.toFixed(2).replace('.', ','),
                                (r.costEditReason || '').replace(/[;\n\r]/g, ' '),
                                (r.revenueEditReason || '').replace(/[;\n\r]/g, ' '),
                                (r.reasonUser || '').replace(/[;\n\r]/g, ' '),
                                r.reasonAt ? new Date(r.reasonAt).toLocaleString('pt-BR') : '',
                            ].join(';'));
                        });
                        const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `auditoria_edicoes_manuais_${startDate}_${endDate}.csv`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    };

                    const formatDateTimeBR = (iso: string) => {
                        try { return new Date(iso).toLocaleString('pt-BR'); } catch { return iso; }
                    };
                    const formatCooldownRemaining = (untilIso: string) => {
                        const ms = Date.parse(untilIso) - Date.now();
                        if (ms <= 0) return 'expirando';
                        const totalMin = Math.floor(ms / 60000);
                        const h = Math.floor(totalMin / 60);
                        const m = totalMin % 60;
                        if (h >= 24) {
                            const d = Math.floor(h / 24);
                            const hh = h % 24;
                            return `${d}d ${hh}h`;
                        }
                        return h > 0 ? `${h}h ${m}m` : `${m}m`;
                    };
                    const onlyRealAlerts = overrideAlerts.filter(a => a.actionType === 'MANUAL_OVERRIDE_ALERT');

                    const s = overrideAlertSettings;
                    const isLoose = !!s && (s.threshold > 50 || s.windowDays > 30 || s.cooldownHours > 72);
                    const fmtUpdatedAt = (iso: string | null) => {
                        if (!iso) return '—';
                        try { return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }); }
                        catch { return iso; }
                    };
                    const goToSettings = () => {
                        try { window.dispatchEvent(new CustomEvent('tmseg:navigate', { detail: 'manual-override-settings' })); }
                        catch { /* ignore */ }
                    };

                    return (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                            {s && (
                                <div
                                    className={`p-3 rounded-r-lg border-l-4 no-print ${isLoose ? 'bg-yellow-50 border-yellow-400' : 'bg-gray-50 border-gray-300'}`}
                                    data-testid="banner-manual-override-settings"
                                >
                                    <div className="flex items-start gap-2">
                                        <AlertTriangle size={14} className={`shrink-0 mt-0.5 ${isLoose ? 'text-yellow-600' : 'text-gray-500'}`} />
                                        <div className="flex-1 text-xs">
                                            <p className={`font-semibold ${isLoose ? 'text-yellow-900' : 'text-gray-700'}`}>
                                                {isLoose ? (
                                                    <>Atenção: o alerta de edições manuais está com configuração frouxa e pode estar deixando passar problemas.</>
                                                ) : (
                                                    <>Configuração atual do alerta de edições manuais.</>
                                                )}
                                            </p>
                                            <p className={`mt-1 ${isLoose ? 'text-yellow-800' : 'text-gray-600'}`}>
                                                Limite: <strong data-testid="text-override-threshold">{s.threshold}</strong> edições
                                                {' '}· Janela: <strong data-testid="text-override-window">{s.windowDays}</strong> dia(s)
                                                {' '}· Cooldown: <strong data-testid="text-override-cooldown">{s.cooldownHours}</strong> h
                                            </p>
                                            {isLoose && (
                                                <p className="text-[11px] text-yellow-800 mt-1">
                                                    Piso recomendado: limite ≤ 50, janela ≤ 30 dias e cooldown ≤ 72 h.
                                                </p>
                                            )}
                                            <p className="text-[11px] text-gray-500 mt-1">
                                                Última alteração:{' '}
                                                <strong data-testid="text-override-updated-by">{s.updatedBy || '—'}</strong>
                                                {' '}em{' '}
                                                <strong data-testid="text-override-updated-at">{fmtUpdatedAt(s.updatedAt)}</strong>
                                            </p>
                                        </div>
                                        <button
                                            onClick={goToSettings}
                                            className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg ${isLoose ? 'bg-yellow-500 hover:bg-yellow-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
                                            data-testid="btn-open-manual-override-settings"
                                        >
                                            Ajustar
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="bg-amber-50 border-l-4 border-amber-400 p-3 rounded-r-lg no-print">
                                <p className="text-xs text-amber-800 font-semibold flex items-start gap-2">
                                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                    <span>
                                        Lista apenas as OS em que o operador salvou um custo <strong>diferente</strong> do sugerido pelo motor automático.
                                        Cruzamos com os motivos cadastrados em <code className="bg-amber-100 px-1 rounded text-[10px]">VALUE_EDIT_REASON</code> para identificar quem editou, quando e por quê.
                                    </span>
                                </p>
                            </div>

                            {/* Task #73 — Alertas já disparados + cooldown */}
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden no-print" data-testid="panel-override-alerts">
                                <div className="px-4 py-2.5 bg-red-50 border-b border-red-200 flex flex-wrap items-center gap-3">
                                    <h4 className="text-xs font-black text-red-800 uppercase flex items-center gap-2">
                                        <AlertTriangle size={14} /> Alertas Disparados ao Gestor
                                    </h4>
                                    <span className="text-[10px] font-bold text-gray-600 bg-white border border-gray-200 px-2 py-0.5 rounded-full" data-testid="badge-override-cooldown-count">
                                        {overrideCooldowns.length} escopo(s) em cooldown
                                    </span>
                                    {overrideAlertsConfig && (
                                        <span className="text-[10px] text-gray-500">
                                            Limite: {overrideAlertsConfig.threshold} edições / {overrideAlertsConfig.windowDays}d · Cooldown padrão: {overrideAlertsConfig.cooldownHours}h
                                        </span>
                                    )}
                                    <button
                                        onClick={fetchOverrideAlerts}
                                        className="ml-auto px-2 py-1 text-[10px] font-bold bg-white border border-gray-300 rounded hover:bg-gray-50"
                                        data-testid="btn-refresh-override-alerts"
                                    >
                                        Atualizar
                                    </button>
                                </div>
                                {overrideAlertsLoading ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 size={20} className="animate-spin text-red-500" />
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 lg:grid-cols-2">
                                        {/* Cooldowns ativos */}
                                        <div className="border-b lg:border-b-0 lg:border-r border-gray-200">
                                            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-[10px] font-black text-gray-600 uppercase">
                                                Em Cooldown Agora
                                            </div>
                                            {overrideCooldowns.length === 0 ? (
                                                <div className="px-4 py-6 text-center text-[11px] text-gray-400">Nenhum escopo silenciado no momento.</div>
                                            ) : (
                                                <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                                                    {overrideCooldowns.map(c => {
                                                        const reopenKey = `reopen:${c.scope}:${c.name}`;
                                                        const busy = overrideActionBusy === reopenKey;
                                                        const scopeKey = `${c.scope}:${c.name}`;
                                                        const expanded = overrideExpandedScope === scopeKey;
                                                        const history = c.history || [];
                                                        const actorLabel = c.actor || 'Sistema';
                                                        const startedLabel = c.startedAt ? formatDateTimeBR(c.startedAt) : '';
                                                        const tooltip = c.source === 'silence'
                                                            ? `Silenciado por ${actorLabel}${startedLabel ? ' em ' + startedLabel : ''}${c.hours ? ' · duração: ' + c.hours + 'h' : ''}`
                                                            : `Disparado automaticamente após o limite${startedLabel ? ' em ' + startedLabel : ''}${actorLabel && actorLabel !== 'Sistema' ? ' · última edição por ' + actorLabel : ''}`;
                                                        return (
                                                            <li key={scopeKey} className="px-4 py-2" data-testid={`row-override-cooldown-${c.scope}-${c.name}`}>
                                                                <div className="flex items-center gap-3">
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="text-[11px] font-black text-gray-800 truncate">
                                                                            <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] mr-1.5 ${c.scope === 'user' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                                                                {c.scope === 'user' ? 'USUÁRIO' : 'FORNECEDOR'}
                                                                            </span>
                                                                            {c.name}
                                                                        </div>
                                                                        <div className="text-[10px] text-gray-500 mt-0.5" title={tooltip}>
                                                                            Termina em <strong className="font-mono">{formatCooldownRemaining(c.until)}</strong>
                                                                            {' · '}
                                                                            <span className={c.source === 'silence' ? 'text-amber-700 font-bold' : ''}>
                                                                                {c.source === 'silence' ? 'silenciado manualmente' : 'cooldown automático'}
                                                                            </span>
                                                                        </div>
                                                                        {c.source === 'silence' && (
                                                                            <div className="text-[10px] text-gray-600 mt-0.5" data-testid={`text-override-cooldown-actor-${c.scope}-${c.name}`}>
                                                                                Por <strong>{actorLabel}</strong>
                                                                                {startedLabel && <span className="font-mono"> · {startedLabel}</span>}
                                                                                {c.hours ? <span className="text-gray-400"> · {c.hours}h</span> : null}
                                                                            </div>
                                                                        )}
                                                                        {history.length > 0 && (
                                                                            <button
                                                                                onClick={() => setOverrideExpandedScope(expanded ? null : scopeKey)}
                                                                                className="text-[10px] text-blue-700 hover:underline mt-0.5"
                                                                                data-testid={`btn-override-history-toggle-${c.scope}-${c.name}`}
                                                                            >
                                                                                {expanded ? 'Ocultar histórico' : `Ver histórico (${history.length})`}
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                    <button
                                                                        onClick={() => reopenOverrideScope(c.scope, c.name)}
                                                                        disabled={busy}
                                                                        className="px-2 py-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded hover:bg-emerald-100 disabled:opacity-50"
                                                                        data-testid={`btn-override-reopen-${c.scope}-${c.name}`}
                                                                    >
                                                                        {busy ? '...' : 'Reabrir'}
                                                                    </button>
                                                                </div>
                                                                {expanded && history.length > 0 && (
                                                                    <ul className="mt-2 ml-2 border-l-2 border-gray-200 pl-2 space-y-1" data-testid={`list-override-history-${c.scope}-${c.name}`}>
                                                                        {history.map((h, idx) => (
                                                                            <li key={idx} className="text-[10px] text-gray-600">
                                                                                <span className={`inline-block px-1 py-0.5 rounded text-[9px] font-bold mr-1.5 ${h.actionType === 'MANUAL_OVERRIDE_ALERT_SILENCE' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                                                                    {h.actionType === 'MANUAL_OVERRIDE_ALERT_SILENCE' ? 'SILENCIOU' : 'REABRIU'}
                                                                                </span>
                                                                                <strong>{h.actor}</strong>
                                                                                <span className="font-mono text-gray-500"> · {formatDateTimeBR(h.at)}</span>
                                                                                {h.hours ? <span className="text-gray-400"> · {h.hours}h</span> : null}
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                )}
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            )}
                                        </div>

                                        {/* Alertas recentes */}
                                        <div>
                                            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-[10px] font-black text-gray-600 uppercase">
                                                Últimos Alertas Disparados
                                            </div>
                                            {onlyRealAlerts.length === 0 ? (
                                                <div className="px-4 py-6 text-center text-[11px] text-gray-400">Nenhum alerta disparado ainda.</div>
                                            ) : (
                                                <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                                                    {onlyRealAlerts.slice(0, 30).map(a => {
                                                        const scope = a.details?.scope as 'user' | 'provider' | undefined;
                                                        const name = String(a.details?.name || '');
                                                        const count = Number(a.details?.count || 0);
                                                        const link = a.details?.link as string | undefined;
                                                        const silenceKey = scope && name ? `silence:${scope}:${name}` : '';
                                                        const busy = !!silenceKey && overrideActionBusy === silenceKey;
                                                        return (
                                                            <li key={a.id} className="px-4 py-2" data-testid={`row-override-alert-${a.id}`}>
                                                                <div className="flex items-center gap-2">
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="text-[11px] font-black text-gray-800 truncate">
                                                                            {scope && (
                                                                                <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] mr-1.5 ${scope === 'user' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                                                                    {scope === 'user' ? 'USUÁRIO' : 'FORNECEDOR'}
                                                                                </span>
                                                                            )}
                                                                            {name || a.entityId}
                                                                            <span className="ml-2 text-red-700 font-mono">{count} edições</span>
                                                                        </div>
                                                                        <div className="text-[10px] text-gray-500 mt-0.5 font-mono">{formatDateTimeBR(a.createdAt)}</div>
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                                        {link && (
                                                                            <a
                                                                                href={link}
                                                                                className="px-2 py-1 text-[10px] font-bold bg-gray-100 text-gray-700 border border-gray-200 rounded hover:bg-gray-200"
                                                                                data-testid={`link-override-alert-${a.id}`}
                                                                            >
                                                                                Auditar
                                                                            </a>
                                                                        )}
                                                                        {scope && name && (
                                                                            <button
                                                                                onClick={() => silenceOverrideScope(scope, name)}
                                                                                disabled={busy}
                                                                                className="px-2 py-1 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 rounded hover:bg-amber-100 disabled:opacity-50"
                                                                                data-testid={`btn-override-silence-${a.id}`}
                                                                            >
                                                                                {busy ? '...' : 'Silenciar'}
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Task #75 — Linha do tempo de moderação (silenciamentos / reaberturas) */}
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden no-print" data-testid="panel-override-moderation-timeline">
                                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-3">
                                    <h4 className="text-xs font-black text-gray-700 uppercase flex items-center gap-2">
                                        <AlertTriangle size={14} className="text-amber-500" /> Histórico de Silenciamentos e Reaberturas
                                    </h4>
                                    <span className="text-[10px] text-gray-500">Últimos {overrideModerationTimeline.length} eventos · cada linha mostra quem agiu e quando</span>
                                </div>
                                {overrideModerationTimeline.length === 0 ? (
                                    <div className="px-4 py-6 text-center text-[11px] text-gray-400">Nenhum silenciamento ou reabertura registrado ainda.</div>
                                ) : (
                                    <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto" data-testid="list-override-moderation-timeline">
                                        {overrideModerationTimeline.map(ev => (
                                            <li key={ev.id} className="px-4 py-2 flex items-center gap-3" data-testid={`row-override-moderation-${ev.id}`}>
                                                <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${ev.actionType === 'MANUAL_OVERRIDE_ALERT_SILENCE' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                                    {ev.actionType === 'MANUAL_OVERRIDE_ALERT_SILENCE' ? 'SILENCIOU' : 'REABRIU'}
                                                </span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[11px] text-gray-800 truncate">
                                                        <strong data-testid={`text-override-moderation-actor-${ev.id}`}>{ev.actor}</strong>
                                                        {ev.scope && (
                                                            <>
                                                                {' · '}
                                                                <span className={`inline-block px-1 py-0.5 rounded text-[9px] mr-1 ${ev.scope === 'user' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                                                    {ev.scope === 'user' ? 'USUÁRIO' : 'FORNECEDOR'}
                                                                </span>
                                                                {ev.name}
                                                            </>
                                                        )}
                                                        {ev.hours ? <span className="text-gray-400"> · {ev.hours}h</span> : null}
                                                    </div>
                                                    <div className="text-[10px] text-gray-500 font-mono">{formatDateTimeBR(ev.at)}</div>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-3 items-center no-print">
                                <div className="flex items-center gap-2">
                                    <Filter size={14} className="text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Filtrar fornecedor..."
                                        value={manualOverrideProviderFilter}
                                        onChange={e => setManualOverrideProviderFilter(e.target.value)}
                                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs w-44"
                                        data-testid="input-manual-override-provider-filter"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Filtrar usuário..."
                                        value={manualOverrideUserFilter}
                                        onChange={e => setManualOverrideUserFilter(e.target.value)}
                                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs w-44"
                                        data-testid="input-manual-override-user-filter"
                                    />
                                </div>
                                <div className="ml-auto flex gap-2">
                                    <button
                                        onClick={handleExportCsv}
                                        className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors"
                                        data-testid="btn-export-manual-override-csv"
                                    >
                                        <Download size={14} /> CSV
                                    </button>
                                    <button
                                        onClick={() => window.print()}
                                        className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors"
                                        data-testid="btn-print-manual-override"
                                    >
                                        <Printer size={14} /> Imprimir
                                    </button>
                                </div>
                            </div>

                            {autoEngineLoading ? (
                                <div className="flex items-center justify-center py-20">
                                    <Loader2 size={32} className="animate-spin text-red-500" />
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                            <p className="text-[9px] font-black text-gray-400 uppercase mb-1">OS Editadas Manualmente</p>
                                            <p className="text-2xl font-black text-red-700" data-testid="kpi-manual-override-count">{filtered.length}</p>
                                            <p className="text-[9px] text-gray-500 font-bold mt-1">de {divergentRows.length} divergente(s) no período</p>
                                        </div>
                                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                            <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Sugerido pelo Motor</p>
                                            <p className="text-lg font-black text-blue-700 font-mono" data-testid="kpi-manual-override-suggested">{formatCurrencyBR(totalSuggested)}</p>
                                        </div>
                                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                            <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Custo Salvo (Manual)</p>
                                            <p className="text-lg font-black text-amber-700 font-mono" data-testid="kpi-manual-override-saved">{formatCurrencyBR(totalSaved)}</p>
                                        </div>
                                        <div className={`p-4 rounded-xl border-2 shadow-sm ${Math.abs(totalDivergence) > 0.01 ? (totalDivergence > 0 ? 'border-red-300 bg-red-50' : 'border-emerald-300 bg-emerald-50') : 'border-gray-200 bg-white'}`}>
                                            <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Diferença Total (Salvo − Motor)</p>
                                            <p className={`text-lg font-black font-mono ${totalDivergence > 0.01 ? 'text-red-700' : totalDivergence < -0.01 ? 'text-emerald-700' : 'text-gray-700'}`} data-testid="kpi-manual-override-divergence">
                                                {totalDivergence >= 0 ? '+' : ''}{formatCurrencyBR(totalDivergence)}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                                                <h4 className="text-[10px] font-black text-gray-700 uppercase flex items-center gap-2">
                                                    <Users size={12} /> Ranking por Usuário
                                                </h4>
                                            </div>
                                            <div className="overflow-x-auto max-h-60">
                                                <table className="w-full text-left">
                                                    <thead>
                                                        <tr className="text-[9px] font-black text-gray-500 uppercase bg-gray-50">
                                                            <th className="px-3 py-2">Usuário</th>
                                                            <th className="px-3 py-2 text-right">Edições</th>
                                                            <th className="px-3 py-2 text-right">Δ Acumulado</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {userRows.length === 0 ? (
                                                            <tr><td colSpan={3} className="px-3 py-4 text-center text-[11px] text-gray-400">Sem edições manuais no período.</td></tr>
                                                        ) : userRows.map((u, i) => (
                                                            <tr key={i} className="border-t border-gray-100 hover:bg-gray-50" data-testid={`row-manual-override-user-${i}`}>
                                                                <td className="px-3 py-1.5 text-xs font-bold text-gray-800 truncate max-w-[180px]">{u.user}</td>
                                                                <td className="px-3 py-1.5 text-xs text-right">{u.count}</td>
                                                                <td className={`px-3 py-1.5 text-xs font-mono text-right ${Math.abs(u.divergence) < 0.01 ? 'text-gray-500' : u.divergence > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                                                    {u.divergence >= 0 ? '+' : ''}{formatCurrencyBR(u.divergence)}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                                                <h4 className="text-[10px] font-black text-gray-700 uppercase flex items-center gap-2">
                                                    <Briefcase size={12} /> Ranking por Fornecedor
                                                </h4>
                                            </div>
                                            <div className="overflow-x-auto max-h-60">
                                                <table className="w-full text-left">
                                                    <thead>
                                                        <tr className="text-[9px] font-black text-gray-500 uppercase bg-gray-50">
                                                            <th className="px-3 py-2">Fornecedor</th>
                                                            <th className="px-3 py-2 text-right">Edições</th>
                                                            <th className="px-3 py-2 text-right">Δ Acumulado</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {providerRows.length === 0 ? (
                                                            <tr><td colSpan={3} className="px-3 py-4 text-center text-[11px] text-gray-400">Sem edições manuais no período.</td></tr>
                                                        ) : providerRows.map((p, i) => (
                                                            <tr key={i} className="border-t border-gray-100 hover:bg-gray-50" data-testid={`row-manual-override-provider-${i}`}>
                                                                <td className="px-3 py-1.5 text-xs font-bold text-gray-800 truncate max-w-[180px]">{p.provider}</td>
                                                                <td className="px-3 py-1.5 text-xs text-right">{p.count}</td>
                                                                <td className={`px-3 py-1.5 text-xs font-mono text-right ${Math.abs(p.divergence) < 0.01 ? 'text-gray-500' : p.divergence > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                                                    {p.divergence >= 0 ? '+' : ''}{formatCurrencyBR(p.divergence)}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                        <div className="px-5 py-3 bg-red-50 border-b border-red-200">
                                            <h4 className="text-xs font-black text-red-800 uppercase flex items-center gap-2">
                                                <UserCheck size={14} /> Edições Manuais com Motivo
                                            </h4>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="text-[9px] font-black text-gray-500 uppercase bg-gray-50">
                                                        <th className="px-3 py-2">Data</th>
                                                        <th className="px-3 py-2">OS</th>
                                                        <th className="px-3 py-2">Usuário</th>
                                                        <th className="px-3 py-2">Cliente / Fornecedor</th>
                                                        <th className="px-3 py-2 text-right">Sugerido</th>
                                                        <th className="px-3 py-2 text-right">Salvo</th>
                                                        <th className="px-3 py-2 text-right">Diferença</th>
                                                        <th className="px-3 py-2">Motivo</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filtered.length === 0 ? (
                                                        <tr><td colSpan={8} className="px-3 py-6 text-center text-xs text-gray-400">Nenhuma edição manual divergente do motor no período/filtros selecionados.</td></tr>
                                                    ) : filtered.slice(0, 500).map(r => {
                                                        const reason = reasonOf(r);
                                                        return (
                                                            <tr key={r.logId} className="border-t border-gray-100 hover:bg-red-50/20" data-testid={`row-manual-override-${r.missionId}`}>
                                                                <td className="px-3 py-2 text-[11px] text-gray-500 font-mono whitespace-nowrap">{new Date(r.createdAt).toLocaleString('pt-BR')}</td>
                                                                <td className="px-3 py-2 text-xs font-black text-gray-800">{r.missionId}</td>
                                                                <td className="px-3 py-2 text-xs font-bold text-gray-700 truncate max-w-[140px]" title={r.userName}>{r.userName || '-'}</td>
                                                                <td className="px-3 py-2 text-[11px] text-gray-600">
                                                                    <div className="truncate max-w-[180px] font-bold" title={r.client}>{r.client}</div>
                                                                    <div className="truncate max-w-[180px] text-gray-500" title={r.provider}>{r.provider}</div>
                                                                </td>
                                                                <td className="px-3 py-2 text-xs font-mono text-blue-700 text-right">{formatCurrencyBR(r.suggestedTotal)}</td>
                                                                <td className="px-3 py-2 text-xs font-mono text-amber-700 text-right">{formatCurrencyBR(r.savedCost)}</td>
                                                                <td className={`px-3 py-2 text-xs font-mono font-black text-right ${r.divergence > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                                                    {r.divergence >= 0 ? '+' : ''}{formatCurrencyBR(r.divergence)}
                                                                </td>
                                                                <td className="px-3 py-2 text-[11px] text-gray-700 max-w-[260px]">
                                                                    {reason ? (
                                                                        <div>
                                                                            <div className="whitespace-pre-wrap break-words" title={reason}>{reason}</div>
                                                                            {r.reasonUser && (
                                                                                <div className="text-[9px] text-gray-400 mt-0.5">
                                                                                    por {r.reasonUser}{r.reasonAt ? ` · ${new Date(r.reasonAt).toLocaleString('pt-BR')}` : ''}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-[10px] italic text-gray-400">Sem motivo registrado</span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                            {filtered.length > 500 && (
                                                <div className="p-2 text-center text-[10px] text-gray-400 bg-gray-50 border-t border-gray-200">
                                                    Exibindo as 500 OS mais recentes de {filtered.length}. Refine o período ou os filtros para reduzir.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })()}

                {/* Task #117 — PAINEL GLOBAL DA MEMÓRIA DHL */}
                {activeTab === 'dhlMemory' && (() => {
                    const VALID_REGIONS = ['SUDESTE', 'SUL', 'CENTRO-OESTE', 'NORDESTE', 'NORTE', 'BRASIL'];
                    const bandsSet = new Set<number>();
                    dhlMemoryRows.forEach(r => { if (r.band) bandsSet.add(r.band); });
                    const allBands = Array.from(bandsSet).sort((a, b) => a - b);
                    const search = dhlMemorySearchTerm.trim().toUpperCase();
                    const filtered = dhlMemoryRows.filter(r => {
                        if (dhlMemoryRegionFilter && r.region !== dhlMemoryRegionFilter) return false;
                        if (dhlMemoryBandFilter && String(r.band) !== dhlMemoryBandFilter) return false;
                        if (search) {
                            const blob = `${r.originCity} ${r.destCity} ${r.originUF} ${r.userName} ${r.missionId} ${r.chosenTableOp || ''} ${r.suggestedTableOp || ''}`.toUpperCase();
                            if (!blob.includes(search)) return false;
                        }
                        return true;
                    });

                    const totalGeral = filtered.length;
                    const countsByRegion: Record<string, number> = {};
                    const countsByBand: Record<string, number> = {};
                    filtered.forEach(r => {
                        const reg = r.region || '—';
                        countsByRegion[reg] = (countsByRegion[reg] || 0) + 1;
                        const b = r.band ? String(r.band) : '—';
                        countsByBand[b] = (countsByBand[b] || 0) + 1;
                    });
                    const regionRows = Object.entries(countsByRegion).sort((a, b) => b[1] - a[1]);
                    const bandRows = Object.entries(countsByBand).sort((a, b) => Number(a[0]) - Number(b[0]));

                    const handleExportCsv = () => {
                        const header = ['Data/Hora', 'Usuário', 'OS', 'Região', 'Faixa KM', 'UF Origem', 'Origem', 'Destino', 'Match Sugerido', 'Tabela Sugerida', 'Tabela Escolhida'];
                        const lines = [header.join(';')];
                        filtered.forEach(r => {
                            lines.push([
                                new Date(r.createdAt).toLocaleString('pt-BR'),
                                (r.userName || '').replace(/;/g, ','),
                                r.missionId,
                                r.region || '',
                                r.band ? String(r.band) : '',
                                r.originUF || '',
                                (r.originCity || '').replace(/;/g, ','),
                                (r.destCity || '').replace(/;/g, ','),
                                r.suggestedMatchLevel || '',
                                (r.suggestedTableOp || '').replace(/;/g, ','),
                                (r.chosenTableOp || '').replace(/;/g, ','),
                            ].join(';'));
                        });
                        const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `memoria_dhl_${startDate}_${endDate}.csv`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    };

                    return (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                            <div className="flex flex-wrap gap-3 items-center no-print">
                                <div className="flex items-center gap-2">
                                    <Filter size={14} className="text-gray-400" />
                                    <select
                                        value={dhlMemoryRegionFilter}
                                        onChange={e => setDhlMemoryRegionFilter(e.target.value)}
                                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs"
                                        data-testid="select-dhl-memory-region"
                                    >
                                        <option value="">Todas as regiões</option>
                                        {VALID_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                    <select
                                        value={dhlMemoryBandFilter}
                                        onChange={e => setDhlMemoryBandFilter(e.target.value)}
                                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs"
                                        data-testid="select-dhl-memory-band"
                                    >
                                        <option value="">Todas as faixas</option>
                                        {allBands.map(b => <option key={b} value={String(b)}>{b} km</option>)}
                                    </select>
                                    <input
                                        type="text"
                                        placeholder="Buscar rota, OS, usuário..."
                                        value={dhlMemorySearchTerm}
                                        onChange={e => setDhlMemorySearchTerm(e.target.value)}
                                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs w-56"
                                        data-testid="input-dhl-memory-search"
                                    />
                                </div>
                                <div className="ml-auto flex gap-2">
                                    <button
                                        onClick={handleExportCsv}
                                        className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors"
                                        data-testid="btn-export-dhl-memory-csv"
                                    >
                                        <Download size={14} /> CSV
                                    </button>
                                    <button
                                        onClick={() => window.print()}
                                        className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors"
                                        data-testid="btn-print-dhl-memory"
                                    >
                                        <Printer size={14} /> Imprimir
                                    </button>
                                </div>
                            </div>

                            {dhlMemoryLoading ? (
                                <div className="flex items-center justify-center py-20">
                                    <Loader2 size={32} className="animate-spin text-red-500" />
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                            <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Total de Correções</p>
                                            <p className="text-3xl font-black text-red-700" data-testid="kpi-dhl-memory-total">{totalGeral}</p>
                                            <p className="text-[9px] text-gray-500 font-bold mt-1">no período {startDate} → {endDate}</p>
                                        </div>
                                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm md:col-span-2">
                                            <p className="text-[9px] font-black text-gray-400 uppercase mb-2">Por Região</p>
                                            <div className="flex flex-wrap gap-2">
                                                {regionRows.length === 0 ? (
                                                    <span className="text-[11px] italic text-gray-400">Sem correções no período.</span>
                                                ) : regionRows.map(([reg, n]) => (
                                                    <div key={reg} className="px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2" data-testid={`kpi-dhl-memory-region-${reg}`}>
                                                        <span className="text-[10px] font-black text-red-700 uppercase">{reg}</span>
                                                        <span className="text-sm font-black text-red-900 font-mono">{n}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                                                <h4 className="text-[10px] font-black text-gray-700 uppercase">Correções por Faixa KM</h4>
                                            </div>
                                            <div className="overflow-x-auto max-h-60">
                                                <table className="w-full text-left">
                                                    <thead>
                                                        <tr className="text-[9px] font-black text-gray-500 uppercase bg-gray-50">
                                                            <th className="px-3 py-2">Faixa</th>
                                                            <th className="px-3 py-2 text-right">Correções</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {bandRows.length === 0 ? (
                                                            <tr><td colSpan={2} className="px-3 py-4 text-center text-[11px] text-gray-400">Sem dados.</td></tr>
                                                        ) : bandRows.map(([b, n]) => (
                                                            <tr key={b} className="border-t border-gray-100 hover:bg-gray-50">
                                                                <td className="px-3 py-1.5 text-xs font-bold text-gray-800">{b === '—' ? '—' : `${b} km`}</td>
                                                                <td className="px-3 py-1.5 text-xs text-right font-mono">{n}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                                                <h4 className="text-[10px] font-black text-gray-700 uppercase">Resumo por Região</h4>
                                            </div>
                                            <div className="overflow-x-auto max-h-60">
                                                <table className="w-full text-left">
                                                    <thead>
                                                        <tr className="text-[9px] font-black text-gray-500 uppercase bg-gray-50">
                                                            <th className="px-3 py-2">Região</th>
                                                            <th className="px-3 py-2 text-right">Correções</th>
                                                            <th className="px-3 py-2 text-right">% do Total</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {regionRows.length === 0 ? (
                                                            <tr><td colSpan={3} className="px-3 py-4 text-center text-[11px] text-gray-400">Sem dados.</td></tr>
                                                        ) : regionRows.map(([reg, n]) => (
                                                            <tr key={reg} className="border-t border-gray-100 hover:bg-gray-50">
                                                                <td className="px-3 py-1.5 text-xs font-bold text-gray-800">{reg}</td>
                                                                <td className="px-3 py-1.5 text-xs text-right font-mono">{n}</td>
                                                                <td className="px-3 py-1.5 text-xs text-right font-mono text-gray-500">{totalGeral > 0 ? ((n / totalGeral) * 100).toFixed(1) : '0.0'}%</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                                            <h4 className="text-[10px] font-black text-gray-700 uppercase">Correções Detalhadas ({filtered.length})</h4>
                                        </div>
                                        <div className="overflow-x-auto max-h-[520px]">
                                            <table className="w-full text-left">
                                                <thead className="sticky top-0 bg-gray-50">
                                                    <tr className="text-[9px] font-black text-gray-500 uppercase">
                                                        <th className="px-3 py-2">Data/Hora</th>
                                                        <th className="px-3 py-2">Usuário</th>
                                                        <th className="px-3 py-2">OS</th>
                                                        <th className="px-3 py-2">Região</th>
                                                        <th className="px-3 py-2 text-right">Faixa</th>
                                                        <th className="px-3 py-2">Rota</th>
                                                        <th className="px-3 py-2">Sugerida</th>
                                                        <th className="px-3 py-2">Escolhida</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filtered.length === 0 ? (
                                                        <tr><td colSpan={8} className="px-3 py-8 text-center text-[11px] text-gray-400">Nenhuma correção encontrada para os filtros atuais.</td></tr>
                                                    ) : filtered.slice(0, 500).map((r, i) => (
                                                        <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50" data-testid={`row-dhl-memory-${i}`}>
                                                            <td className="px-3 py-1.5 text-[11px] text-gray-700 whitespace-nowrap">{new Date(r.createdAt).toLocaleString('pt-BR')}</td>
                                                            <td className="px-3 py-1.5 text-[11px] text-gray-700 truncate max-w-[140px]">{r.userName}</td>
                                                            <td className="px-3 py-1.5 text-[11px] font-mono text-gray-700">{r.missionId.slice(0, 8)}</td>
                                                            <td className="px-3 py-1.5 text-[11px] font-bold text-red-700">{r.region || '—'}</td>
                                                            <td className="px-3 py-1.5 text-[11px] text-right font-mono">{r.band || '—'}</td>
                                                            <td className="px-3 py-1.5 text-[11px] text-gray-700 truncate max-w-[220px]" title={`${r.originCity} → ${r.destCity}`}>
                                                                {r.originCity || '—'} → {r.destCity || '—'}
                                                            </td>
                                                            <td className="px-3 py-1.5 text-[10px] text-gray-600 truncate max-w-[200px]" title={r.suggestedTableOp || ''}>
                                                                {r.suggestedTableOp || <span className="italic text-gray-400">—</span>}
                                                                {r.suggestedMatchLevel && <span className="ml-1 text-[9px] text-gray-400">({r.suggestedMatchLevel})</span>}
                                                            </td>
                                                            <td className="px-3 py-1.5 text-[10px] font-bold text-emerald-700 truncate max-w-[200px]" title={r.chosenTableOp || ''}>
                                                                {r.chosenTableOp || <span className="italic text-gray-400">—</span>}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            {filtered.length > 500 && (
                                                <div className="p-2 text-center text-[10px] text-gray-400 bg-gray-50 border-t border-gray-200">
                                                    Exibindo as 500 correções mais recentes de {filtered.length}. Refine o período ou os filtros para reduzir.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })()}
            </div>
            
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    .shadow-sm { box-shadow: none !important; }
                    .border { border: 1px solid #ddd !important; }
                    body { background: white; }
                }
            `}</style>
        </div>
    );
};

export default ReportsDashboard;
