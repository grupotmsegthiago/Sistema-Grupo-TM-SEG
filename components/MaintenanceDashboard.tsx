import { formatDateTimeBR } from '../lib/dateUtils';

import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../lib/authFetch';
import { supabase } from '../lib/supabase';
import { DATA_RETENTION } from '../constants';
import { applyRotatableLogFilter } from '../lib/systemLogRetention';
import { 
    Database, Download, Trash2, RefreshCw, Loader2, CheckCircle2, 
    AlertTriangle, ShieldCheck, Clock, Zap, FileJson, Server,
    HardDrive, History, Trash, FileDown, ShieldAlert, Upload, 
    FileUp, AlertCircle, ArrowRight, Save, List, Info, Activity,
    BarChart3, Gauge, Wind, Table2
} from 'lucide-react';
import { useNotification } from '../lib/NotificationContext';
import { logAction } from '../lib/logger';

interface BackupRecord {
    id: string;
    created_at: string;
    created_by: string;
    file_name: string;
    file_size: string;
    record_count: number;
    status: string;
}

interface DbCapacity {
    used_bytes: number;
    limit_bytes: number;
    percent_used: number | null;
    used_mb: number;
    used_gb: number;
    limit_gb: number;
    size_pretty: string;
    total_rows: number;
    total_dead_rows: number;
    tables: Array<{
        table: string;
        total_bytes: number;
        total_size: string;
        data_bytes?: number;
        data_size?: string;
        rows: number;
        dead_rows: number;
    }>;
    source: string;
    updated_at: string;
}

const MaintenanceDashboard: React.FC = () => {
    const { showNotification } = useNotification();
    const [stats, setStats] = useState({
        logsCount: 0,
        oldLogsCount: 0,
        missionsCount: 0,
        storageEstimate: 0
    });
    const [dbCapacity, setDbCapacity] = useState<DbCapacity | null>(null);
    const [capacityLoading, setCapacityLoading] = useState(false);
    const [platformCosts, setPlatformCosts] = useState<any | null>(null);
    const [costsLoading, setCostsLoading] = useState(false);
    const [backups, setBackups] = useState<BackupRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState<string | null>(null);
    const [isRestoreMode, setIsRestoreMode] = useState(false);
    const [vacuumResults, setVacuumResults] = useState<any[] | null>(null);

    const fetchDbCapacity = useCallback(async () => {
        setCapacityLoading(true);
        try {
            const resp = await authFetch('/api/db/capacity');
            if (resp.ok) {
                const data = await resp.json();
                setDbCapacity(data);
            }
        } catch (e) {
            console.error('Erro ao buscar capacidade:', e);
        } finally {
            setCapacityLoading(false);
        }
    }, []);

    const fetchPlatformCosts = useCallback(async () => {
        setCostsLoading(true);
        try {
            const resp = await authFetch('/api/platform/costs');
            if (resp.ok) {
                const data = await resp.json();
                setPlatformCosts(data);
            }
        } catch (e) {
            console.error('Erro ao buscar custos:', e);
        } finally {
            setCostsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();
        fetchBackupHistory();
        fetchDbCapacity();
        fetchPlatformCosts();
    }, [fetchDbCapacity, fetchPlatformCosts]);

    const fetchStats = async () => {
        setIsLoading(true);
        try {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - DATA_RETENTION.LOGS_DAYS);

            const [logsRes, oldLogsRes, missionsRes] = await Promise.all([
                supabase.from('system_logs').select('*', { count: 'exact', head: true }),
                applyRotatableLogFilter(
                    supabase.from('system_logs').select('*', { count: 'exact', head: true }).lt('created_at', thirtyDaysAgo.toISOString())
                ),
                supabase.from('missions').select('*', { count: 'exact', head: true })
            ]);

            setStats({
                logsCount: logsRes.count || 0,
                oldLogsCount: oldLogsRes.count || 0,
                missionsCount: missionsRes.count || 0,
                storageEstimate: ((logsRes.count || 0) + (missionsRes.count || 0)) * 0.008 
            });
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchBackupHistory = async () => {
        try {
            const { data } = await supabase.from('backup_history').select('*').order('created_at', { ascending: false }).limit(10);
            if (data) setBackups(data as BackupRecord[]);
        } catch (e) {
            console.error("Erro ao buscar histórico de backup", e);
        }
    };

    const handleLogRotation = async () => {
        if (!confirm(`ATENÇÃO: Deseja remover apenas RASTROS DE ACESSO (login, logout, heartbeat) com mais de ${DATA_RETENTION.LOGS_DAYS} dias?\n\nPatrimônio, equipamentos, contratos e demais cadastros em system_logs NUNCA serão apagados por este botão.`)) return;
        
        setIsProcessing('ROTATE');
        try {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - DATA_RETENTION.LOGS_DAYS);

            const { error } = await applyRotatableLogFilter(
                supabase
                    .from('system_logs')
                    .delete()
                    .lt('created_at', thirtyDaysAgo.toISOString())
            );

            if (error) throw error;

            await logAction('DELETE', 'DatabaseMaintenance', 'LOG_ROTATION', `Limpeza de ${stats.oldLogsCount} logs de auditoria antigos.`);
            showNotification('Otimização Concluída', `${stats.oldLogsCount} logs de rastro foram removidos.`, 'success');
            fetchStats();
            fetchDbCapacity();
        } catch (e: any) {
            alert(e.message);
        } finally {
            setIsProcessing(null);
        }
    };

    const handleVacuum = async () => {
        if (!confirm('Executar VACUUM ANALYZE nas tabelas principais?\n\nIsso recupera espaço de linhas deletadas e atualiza estatísticas do banco. Pode levar alguns segundos.')) return;
        setIsProcessing('VACUUM');
        setVacuumResults(null);
        try {
            const resp = await authFetch('/api/db/vacuum', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const data = await resp.json();
            if (data.success) {
                setVacuumResults(data.results);
                if (data.method === 'direct') {
                    showNotification('VACUUM Concluído', `${data.results.filter((r: any) => r.status === 'ok').length} tabelas otimizadas com sucesso.`, 'success');
                } else {
                    showNotification('Verificação Concluída', data.message || 'Contagens de registros atualizadas. Para VACUUM completo, use o painel do Supabase.', 'info');
                }
                fetchDbCapacity();
            } else {
                showNotification('Erro', data.error || 'Falha ao executar VACUUM', 'error');
            }
        } catch (e: any) {
            showNotification('Erro', e.message, 'error');
        } finally {
            setIsProcessing(null);
        }
    };

    const handleFullBackup = async () => {
        setIsProcessing('BACKUP');
        try {
            const [
                clients, providers, missions, prices, costs, routes, 
                agents, vehicles, mission_logs, fin_trans, fin_acc, fin_cat, patrimonio_eq, patrimonio_bk
            ] = await Promise.all([
                supabase.from('clients').select('*'),
                supabase.from('providers').select('*'),
                supabase.from('missions').select('*'),
                supabase.from('client_price_tables').select('*'),
                supabase.from('provider_cost_tables').select('*'),
                supabase.from('client_routes').select('*'),
                supabase.from('agents').select('*'),
                supabase.from('vehicles').select('*'),
                supabase.from('mission_logs').select('*'),
                supabase.from('financial_transactions').select('*'),
                supabase.from('financial_accounts').select('*'),
                supabase.from('financial_categories').select('*'),
                supabase.from('patrimonio_equipments').select('*').is('deleted_at', null),
                supabase.from('patrimonio_backups').select('*').order('created_at', { ascending: false }).limit(50),
            ]);

            const backupData = {
                timestamp: new Date().toISOString(),
                version: "3.2.0",
                database: "Production_TMSEG",
                content: {
                    clients: clients.data,
                    providers: providers.data,
                    missions: missions.data,
                    client_price_tables: prices.data,
                    provider_cost_tables: costs.data,
                    client_routes: routes.data,
                    agents: agents.data,
                    vehicles: vehicles.data,
                    mission_logs: mission_logs.data,
                    financial_transactions: fin_trans.data,
                    financial_accounts: fin_acc.data,
                    financial_categories: fin_cat.data,
                    patrimonio_equipments: patrimonio_eq.data,
                    patrimonio_backups: patrimonio_bk.data
                }
            };

            const jsonString = JSON.stringify(backupData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const fileSize = (blob.size / 1024 / 1024).toFixed(2) + " MB";
            
            const url = URL.createObjectURL(blob);
            const fileName = `BACKUP_TMSEG_FULL_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
            
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            link.click();
            URL.revokeObjectURL(url);

            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
            
            await supabase.from('backup_history').insert([{
                created_by: userData.name || 'SISTEMA',
                file_name: fileName,
                file_size: fileSize,
                record_count: Object.values(backupData.content).reduce((acc, curr: any) => acc + (curr?.length || 0), 0),
                status: 'Sucesso'
            }]);

            showNotification('Backup Gerado', `Arquivo ${fileSize} baixado com sucesso.`, 'success');
            fetchBackupHistory();
        } catch (e: any) {
            alert("Erro ao gerar backup: " + e.message);
        } finally {
            setIsProcessing(null);
        }
    };

    const handleRestoreFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!confirm("AVISO DE SEGURANÇA CRÍTICO:\n\nVocê está prestes a restaurar o banco de dados. Isso pode sobrescrever dados atuais.\n\nDeseja prosseguir com a Recuperação de Desastre?")) {
            event.target.value = '';
            return;
        }

        setIsProcessing('RESTORE');
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const content = JSON.parse(e.target?.result as string);
                if (!content.database || !content.content) {
                    throw new Error("Arquivo de backup inválido ou corrompido.");
                }

                const tables = content.content;
                let totalRestored = 0;

                const order = [
                    'clients', 'providers', 'financial_accounts', 'financial_categories',
                    'vehicles', 'agents', 'client_routes', 'client_price_tables', 
                    'provider_cost_tables', 'missions', 'mission_logs', 'financial_transactions'
                ];

                for (const tableName of order) {
                    const data = tables[tableName];
                    if (data && data.length > 0) {
                        showNotification('Restaurando', `Processando tabela: ${tableName}...`, 'info');
                        const { error } = await supabase.from(tableName).upsert(data);
                        if (error) console.warn(`Erro na tabela ${tableName}:`, error.message);
                        else totalRestored += data.length;
                    }
                }

                alert(`RESTAURAÇÃO CONCLUÍDA!\n\n${totalRestored} registros foram restabelecidos no banco de dados.`);
                window.location.reload();
            } catch (err: any) {
                alert("Erro na restauração: " + err.message);
            } finally {
                setIsProcessing(null);
                setIsRestoreMode(false);
            }
        };
        reader.readAsText(file);
    };

    const usedPercent = dbCapacity?.percent_used ? (dbCapacity.percent_used * 100) : 0;
    const isWarning = usedPercent > 75;
    const isCritical = usedPercent > 90;

    const getBarColor = () => {
        if (isCritical) return 'bg-red-500';
        if (isWarning) return 'bg-amber-500';
        return 'bg-emerald-500';
    };

    const getStatusLabel = () => {
        if (isCritical) return { text: 'CRÍTICO', color: 'text-red-600 bg-red-50 border-red-200' };
        if (isWarning) return { text: 'ATENÇÃO', color: 'text-amber-600 bg-amber-50 border-amber-200' };
        return { text: 'SAUDÁVEL', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' };
    };

    const status = getStatusLabel();

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-lg">
                        <Database size={28} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight" data-testid="text-page-title">Saúde do Banco de Dados</h2>
                        <p className="text-sm text-gray-500 font-medium">Monitoramento, otimização e backup — Supabase Pro (8 GB)</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setIsRestoreMode(!isRestoreMode)} 
                        className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-2 border ${isRestoreMode ? 'bg-red-600 text-white border-red-700' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                        data-testid="btn-restore-mode"
                    >
                        <ShieldAlert size={16} /> {isRestoreMode ? 'Cancelar Restauro' : 'Restaurar Backup'}
                    </button>
                    <button onClick={() => { fetchStats(); fetchDbCapacity(); }} className="p-3 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-all" data-testid="btn-refresh-all">
                        <RefreshCw size={20} className={isLoading || capacityLoading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {isRestoreMode && (
                <div className="bg-red-50 border-2 border-red-500 p-8 rounded-[2rem] animate-in zoom-in-95">
                    <div className="flex flex-col md:flex-row items-center gap-8">
                        <div className="p-6 bg-red-600 text-white rounded-full shadow-2xl animate-pulse">
                            <FileUp size={48} />
                        </div>
                        <div className="flex-1 text-center md:text-left">
                            <h3 className="text-xl font-black text-red-900 uppercase">Recuperação de Desastres</h3>
                            <p className="text-red-700 font-medium mt-1">Ao selecionar um arquivo, o sistema tentará reinserir todos os dados. Use apenas se houver perda real de informações.</p>
                            <div className="mt-6 flex flex-col md:flex-row gap-4">
                                <label className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-2xl font-black uppercase text-xs cursor-pointer shadow-lg transition-all active:scale-95">
                                    {isProcessing === 'RESTORE' ? <Loader2 className="animate-spin" /> : <Upload size={18} />}
                                    Selecionar Arquivo de Backup (.json)
                                    <input type="file" accept=".json" className="hidden" onChange={handleRestoreFile} disabled={isProcessing === 'RESTORE'} />
                                </label>
                                <button onClick={() => setIsRestoreMode(false)} className="px-8 py-3 bg-white text-red-600 border border-red-200 rounded-2xl font-black uppercase text-xs">Cancelar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {(isWarning || isCritical) && (
                <div className={`p-5 rounded-2xl border-2 flex items-center gap-4 ${isCritical ? 'bg-red-50 border-red-400' : 'bg-amber-50 border-amber-400'}`}>
                    <AlertTriangle size={32} className={isCritical ? 'text-red-600' : 'text-amber-600'} />
                    <div>
                        <p className={`font-black text-sm uppercase ${isCritical ? 'text-red-800' : 'text-amber-800'}`}>
                            {isCritical ? 'ALERTA CRÍTICO — Banco próximo do limite!' : 'ATENÇÃO — Uso acima de 75% do limite'}
                        </p>
                        <p className={`text-xs mt-1 ${isCritical ? 'text-red-600' : 'text-amber-600'}`}>
                            {isCritical 
                                ? 'O banco pode entrar em modo somente-leitura em breve. Execute VACUUM e limpe logs antigos imediatamente.'
                                : 'Considere limpar logs antigos e executar VACUUM para recuperar espaço.'}
                        </p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-white rounded-[2rem] shadow-sm border border-gray-200 p-6 relative overflow-hidden">
                    <div className="absolute top-4 right-4 opacity-5"><HardDrive size={100}/></div>
                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Espaço em Disco</h4>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${status.color}`} data-testid="badge-db-status">
                                {status.text}
                            </span>
                        </div>

                        {capacityLoading && !dbCapacity ? (
                            <div className="flex items-center justify-center py-8"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
                        ) : dbCapacity ? (
                            <>
                                <div className="flex items-baseline gap-2 mb-1">
                                    <span className={`text-4xl font-black font-mono tracking-tighter ${isCritical ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-slate-900'}`} data-testid="text-db-size">
                                        {dbCapacity.size_pretty}
                                    </span>
                                    <span className="text-sm font-bold text-gray-400">de {dbCapacity.limit_gb} GB</span>
                                </div>
                                <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden border border-gray-200 mb-2" data-testid="progress-db-usage">
                                    <div className={`h-full transition-all duration-1000 rounded-full ${getBarColor()}`} style={{ width: `${Math.min(usedPercent, 100)}%` }}></div>
                                </div>
                                <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                    <span>{usedPercent.toFixed(1)}% utilizado</span>
                                    <span>{dbCapacity.source === 'pg_database_size' ? 'Dados reais' : 'Estimativa'}</span>
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-3">
                                    <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                                        <p className="text-lg font-black text-gray-900 font-mono" data-testid="text-total-rows">{dbCapacity.total_rows.toLocaleString('pt-BR')}</p>
                                        <p className="text-[9px] font-bold text-gray-400 uppercase">Registros ativos</p>
                                    </div>
                                    <div className={`rounded-xl p-3 text-center border ${dbCapacity.total_dead_rows > 1000 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100'}`}>
                                        <p className={`text-lg font-black font-mono ${dbCapacity.total_dead_rows > 1000 ? 'text-amber-700' : 'text-gray-900'}`} data-testid="text-dead-rows">{dbCapacity.total_dead_rows.toLocaleString('pt-BR')}</p>
                                        <p className="text-[9px] font-bold text-gray-400 uppercase">Linhas mortas</p>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <p className="text-sm text-gray-400 text-center py-4">Não foi possível consultar o banco.</p>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-[2rem] shadow-sm border border-gray-200 p-6">
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <Table2 size={14} /> Maiores Tabelas
                    </h4>
                    {dbCapacity && dbCapacity.tables.length > 0 ? (
                        <div className="space-y-2">
                            {dbCapacity.tables.slice(0, 8).map((t, i) => {
                                const pct = dbCapacity.used_bytes > 0 ? (t.total_bytes / dbCapacity.used_bytes * 100) : 0;
                                return (
                                    <div key={t.table} className="flex items-center gap-3" data-testid={`row-table-${t.table}`}>
                                        <span className="text-[9px] font-black text-gray-300 w-4 text-right">{i + 1}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-0.5">
                                                <span className="text-[11px] font-black text-gray-700 truncate">{t.table}</span>
                                                <span className="text-[10px] font-bold text-gray-500 ml-2 shrink-0">{t.total_size}</span>
                                            </div>
                                            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%` }}></div>
                                            </div>
                                            <div className="flex justify-between mt-0.5">
                                                <span className="text-[8px] text-gray-400">{t.rows.toLocaleString('pt-BR')} registros</span>
                                                {t.dead_rows > 0 && <span className="text-[8px] text-amber-500 font-bold">{t.dead_rows.toLocaleString('pt-BR')} mortas</span>}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : capacityLoading ? (
                        <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
                    ) : (
                        <p className="text-xs text-gray-400 text-center py-4">Sem dados disponíveis</p>
                    )}
                </div>

                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-200">
                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                            <Wind size={14} /> Otimização (VACUUM)
                        </h4>
                        <p className="text-xs text-gray-500 leading-relaxed mb-4">
                            Recupera espaço de linhas deletadas e atualiza as estatísticas do PostgreSQL para consultas mais rápidas.
                        </p>
                        <button 
                            onClick={handleVacuum} 
                            disabled={isProcessing === 'VACUUM'}
                            className="w-full py-3 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white rounded-2xl text-xs font-black uppercase transition-all shadow-sm flex items-center justify-center gap-2 border border-blue-200 disabled:opacity-50"
                            data-testid="btn-vacuum"
                        >
                            {isProcessing === 'VACUUM' ? <Loader2 size={16} className="animate-spin"/> : <Zap size={16}/>}
                            Executar VACUUM ANALYZE
                        </button>
                        {vacuumResults && (
                            <div className="mt-3 bg-green-50 border border-green-200 rounded-xl p-3">
                                <p className="text-[9px] font-black text-green-700 uppercase mb-2">Resultado</p>
                                {vacuumResults.map((r, i) => (
                                    <div key={i} className="flex items-center justify-between text-[10px] py-0.5">
                                        <span className="font-bold text-gray-700">{r.table}</span>
                                        <span className={`font-black ${r.status === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
                                            {r.status === 'ok' 
                                                ? (r.note === 'count-only' ? `✓ ${(r.rows || 0).toLocaleString('pt-BR')} registros` : `✓ ${r.dead_rows_before} limpas`)
                                                : `✗ ${r.error}`}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-200">
                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                            <History size={14} /> Limpeza de Logs
                        </h4>
                        <div className="flex items-center gap-4 mb-3">
                            <div className="p-2.5 bg-orange-50 text-orange-600 rounded-xl border border-orange-100"><Trash2 size={18}/></div>
                            <div>
                                <p className="text-xl font-black text-gray-900">{stats.oldLogsCount.toLocaleString('pt-BR')}</p>
                                <p className="text-[9px] font-bold text-gray-400 uppercase">Logs com +{DATA_RETENTION.LOGS_DAYS} dias</p>
                            </div>
                        </div>
                        <p className="text-[10px] text-gray-500 italic mb-3">Apaga rastros de uso antigos. Missões e cadastros permanecem intactos.</p>
                        <button 
                            onClick={handleLogRotation} 
                            disabled={isProcessing === 'ROTATE' || stats.oldLogsCount === 0}
                            className="w-full py-2.5 bg-red-50 text-red-700 hover:bg-red-600 hover:text-white rounded-xl text-xs font-black uppercase transition-all flex items-center justify-center gap-2 border border-red-200 disabled:opacity-50"
                            data-testid="btn-log-rotation"
                        >
                            {isProcessing === 'ROTATE' ? <Loader2 size={14} className="animate-spin"/> : <Trash size={14}/>}
                            Limpar Logs Antigos
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-[2rem] shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-white">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-lg"><BarChart3 size={20}/></div>
                        <div>
                            <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider" data-testid="text-costs-title">Estimativa de Custos Mensais (R$)</h3>
                            <p className="text-[10px] text-gray-500 font-medium">Valores baseados nos planos configurados — Câmbio: $1 = R$ {platformCosts?.currency_rate?.toFixed(2) || '5.80'}</p>
                        </div>
                    </div>
                    <button onClick={fetchPlatformCosts} className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-all" data-testid="btn-refresh-costs">
                        <RefreshCw size={14} className={costsLoading ? 'animate-spin text-gray-400' : 'text-gray-500'} />
                    </button>
                </div>

                {costsLoading && !platformCosts ? (
                    <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
                ) : platformCosts ? (
                    <div className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-5 text-white relative overflow-hidden">
                                <div className="absolute top-2 right-2 opacity-10"><Gauge size={60}/></div>
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Mensal</p>
                                <p className="text-3xl font-black font-mono" data-testid="text-total-brl">R$ {platformCosts.total_brl?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                <p className="text-[10px] text-slate-400 mt-1">US$ {platformCosts.total_usd?.toFixed(2)}</p>
                            </div>

                            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
                                <p className="text-[9px] font-black uppercase tracking-widest text-blue-500 mb-1">Replit</p>
                                <p className="text-2xl font-black text-blue-900 font-mono" data-testid="text-replit-brl">R$ {platformCosts.replit?.total_brl?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                <p className="text-[10px] text-blue-600 font-bold mt-1">{platformCosts.replit?.plan}</p>
                            </div>

                            <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
                                <p className="text-[9px] font-black uppercase tracking-widest text-green-500 mb-1">Supabase</p>
                                <p className="text-2xl font-black text-green-900 font-mono" data-testid="text-supabase-brl">R$ {platformCosts.supabase?.total_brl?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                <p className="text-[10px] text-green-600 font-bold mt-1">{platformCosts.supabase?.plan}</p>
                            </div>

                            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                                <p className="text-[9px] font-black uppercase tracking-widest text-amber-500 mb-1">APIs Externas</p>
                                <p className="text-2xl font-black text-amber-900 font-mono" data-testid="text-apis-brl">R$ {platformCosts.apis?.total_brl?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                <p className="text-[10px] text-amber-600 font-bold mt-1">Maps, Email, Outros</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                <h5 className="text-[9px] font-black text-blue-600 uppercase tracking-widest mb-3">Replit — Detalhes</h5>
                                <div className="space-y-1.5 text-[11px]">
                                    <div className="flex justify-between"><span className="text-gray-600">Plano Base</span><span className="font-black text-gray-900">R$ {platformCosts.replit?.base_brl?.toFixed(2)}</span></div>
                                    {platformCosts.replit?.extras?.egress?.brl > 0 && <div className="flex justify-between"><span className="text-gray-600">Tráfego Extra</span><span className="font-bold text-gray-700">R$ {platformCosts.replit.extras.egress.brl.toFixed(2)}</span></div>}
                                    {platformCosts.replit?.extras?.compute?.brl > 0 && <div className="flex justify-between"><span className="text-gray-600">Computação Extra</span><span className="font-bold text-gray-700">R$ {platformCosts.replit.extras.compute.brl.toFixed(2)}</span></div>}
                                    {platformCosts.replit?.extras?.storage?.brl > 0 && <div className="flex justify-between"><span className="text-gray-600">Armazenamento</span><span className="font-bold text-gray-700">R$ {platformCosts.replit.extras.storage.brl.toFixed(2)}</span></div>}
                                    {platformCosts.replit?.extras?.always_on?.brl > 0 && <div className="flex justify-between"><span className="text-gray-600">Always-On</span><span className="font-bold text-gray-700">R$ {platformCosts.replit.extras.always_on.brl.toFixed(2)}</span></div>}
                                    {platformCosts.replit?.extras?.other?.brl > 0 && <div className="flex justify-between"><span className="text-gray-600">Outros</span><span className="font-bold text-gray-700">R$ {platformCosts.replit.extras.other.brl.toFixed(2)}</span></div>}
                                    <div className="border-t border-gray-200 pt-1.5 flex justify-between font-black"><span className="text-gray-700">Subtotal</span><span className="text-blue-700">R$ {platformCosts.replit?.total_brl?.toFixed(2)}</span></div>
                                </div>
                            </div>

                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                <h5 className="text-[9px] font-black text-green-600 uppercase tracking-widest mb-3">Supabase — Detalhes</h5>
                                <div className="space-y-1.5 text-[11px]">
                                    <div className="flex justify-between"><span className="text-gray-600">Plano Base</span><span className="font-black text-gray-900">R$ {platformCosts.supabase?.base_brl?.toFixed(2)}</span></div>
                                    {platformCosts.supabase?.extras?.db?.brl > 0 && <div className="flex justify-between"><span className="text-gray-600">Banco Extra</span><span className="font-bold text-gray-700">R$ {platformCosts.supabase.extras.db.brl.toFixed(2)}</span></div>}
                                    {platformCosts.supabase?.extras?.bandwidth?.brl > 0 && <div className="flex justify-between"><span className="text-gray-600">Bandwidth</span><span className="font-bold text-gray-700">R$ {platformCosts.supabase.extras.bandwidth.brl.toFixed(2)}</span></div>}
                                    {platformCosts.supabase?.extras?.storage?.brl > 0 && <div className="flex justify-between"><span className="text-gray-600">Storage</span><span className="font-bold text-gray-700">R$ {platformCosts.supabase.extras.storage.brl.toFixed(2)}</span></div>}
                                    <div className="flex justify-between text-[10px] text-gray-400"><span>Disco: {platformCosts.supabase?.db_capacity_gb} GB</span><span>Região: sa-east-1</span></div>
                                    <div className="border-t border-gray-200 pt-1.5 flex justify-between font-black"><span className="text-gray-700">Subtotal</span><span className="text-green-700">R$ {platformCosts.supabase?.total_brl?.toFixed(2)}</span></div>
                                </div>
                            </div>

                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                <h5 className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-3">APIs — Detalhes</h5>
                                <div className="space-y-1.5 text-[11px]">
                                    <div className="flex justify-between"><span className="text-gray-600">Google Maps</span><span className="font-black text-gray-900">R$ {platformCosts.apis?.google_maps?.brl?.toFixed(2)}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-600">Email (SMTP)</span><span className="font-bold text-gray-700">R$ {platformCosts.apis?.resend?.brl?.toFixed(2)}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-600">Outras APIs</span><span className="font-bold text-gray-700">R$ {platformCosts.apis?.other?.brl?.toFixed(2)}</span></div>
                                    <div className="border-t border-gray-200 pt-1.5 flex justify-between font-black"><span className="text-gray-700">Subtotal</span><span className="text-amber-700">R$ {platformCosts.apis?.total_brl?.toFixed(2)}</span></div>
                                </div>
                            </div>
                        </div>

                        {platformCosts.saving_tips && platformCosts.saving_tips.length > 0 && (
                            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
                                <h5 className="text-[9px] font-black text-blue-600 uppercase tracking-widest mb-3 flex items-center gap-2"><Info size={12} /> Dicas de Economia</h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {platformCosts.saving_tips.slice(0, 6).map((tip: any, i: number) => (
                                        <div key={i} className="flex items-start gap-2 bg-white rounded-lg p-2.5 border border-blue-100">
                                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${
                                                tip.impact === 'Alto' ? 'bg-red-100 text-red-700' : 
                                                tip.impact === 'Médio' ? 'bg-amber-100 text-amber-700' : 
                                                tip.impact === 'Info' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                                            }`}>{tip.impact}</span>
                                            <div className="min-w-0">
                                                <span className="text-[9px] font-bold text-blue-800 uppercase">{tip.area}</span>
                                                <p className="text-[10px] text-gray-700 leading-relaxed">{tip.tip}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <p className="text-[9px] text-gray-400 mt-4 text-center italic">
                            Valores estimados baseados nos planos configurados. Custos extras de uso (egress, compute) podem ser ajustados via variáveis de ambiente. 
                            O Replit não disponibiliza API para consultar o valor exato cobrado — consulte Settings &gt; Account &gt; Billing no site do Replit para o valor real.
                        </p>
                    </div>
                ) : (
                    <div className="p-6 text-center text-gray-400 text-sm">Não foi possível carregar os custos.</div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-12">
                    <div className="bg-slate-900 p-8 rounded-[2rem] shadow-2xl text-white overflow-hidden relative">
                        <div className="absolute top-0 right-0 p-4 opacity-10"><Zap size={150} className="text-red-500"/></div>
                        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="p-2 bg-red-600 rounded-xl shadow-lg"><FileJson size={20}/></div>
                                    <h3 className="text-xl font-black uppercase tracking-tight">Gerar Cópia de Segurança Total</h3>
                                </div>
                                <p className="text-sm text-slate-400 font-medium max-w-md">Exporta todas as tabelas vitais para um arquivo JSON seguro que pode ser guardado fora do sistema.</p>
                            </div>
                            <button 
                                onClick={handleFullBackup}
                                disabled={isProcessing === 'BACKUP'}
                                className="px-10 py-4 bg-white text-slate-900 hover:bg-red-600 hover:text-white rounded-2xl text-sm font-black uppercase transition-all shadow-xl flex items-center justify-center gap-3 disabled:opacity-50"
                                data-testid="btn-backup"
                            >
                                {isProcessing === 'BACKUP' ? <Loader2 size={20} className="animate-spin"/> : <FileDown size={20} strokeWidth={3} />}
                                Executar Backup Agora
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-[2rem] shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                        <List size={16} className="text-slate-400"/> Histórico de Exportações (Últimas 10)
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                            <tr>
                                <th className="px-6 py-4">Data / Hora</th>
                                <th className="px-6 py-4">Responsável</th>
                                <th className="px-6 py-4">Tamanho</th>
                                <th className="px-6 py-4">Itens Salvos</th>
                                <th className="px-6 py-4 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {backups.length === 0 ? (
                                <tr><td colSpan={5} className="p-10 text-center text-gray-400 italic text-sm">Nenhum backup registrado recentemente.</td></tr>
                            ) : (
                                backups.map(b => (
                                    <tr key={b.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-4 text-xs font-bold text-gray-700">{formatDateTimeBR(b.created_at)}</td>
                                        <td className="px-6 py-4 text-xs font-black text-slate-500 uppercase">{b.created_by}</td>
                                        <td className="px-6 py-4 text-xs font-mono text-indigo-600 font-bold">{b.file_size}</td>
                                        <td className="px-6 py-4 text-xs font-bold text-gray-900">{b.record_count} registros</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-[9px] font-black uppercase border border-green-200">
                                                {b.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-blue-600 rounded-[2rem] p-8 text-white shadow-xl relative overflow-hidden flex flex-col md:flex-row items-center gap-8">
                <div className="absolute top-0 right-0 p-4 opacity-10"><ShieldCheck size={120} /></div>
                <div className="p-4 bg-white/10 rounded-3xl backdrop-blur-md border border-white/20">
                    <Info size={40} className="text-white" />
                </div>
                <div>
                    <h3 className="text-xl font-black uppercase tracking-tight">Protocolo de Continuidade (DRP)</h3>
                    <p className="text-sm text-blue-100 mt-2 max-w-3xl leading-relaxed">
                        Em caso de falha crítica no servidor ou banco de dados, o arquivo de backup baixado permite a reconstrução total da operação em um novo ambiente em menos de 5 minutos. 
                        <strong> Recomendamos realizar o download manual a cada 12 horas ou antes de atualizações massivas.</strong>
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3 text-[10px] font-black uppercase tracking-wider">
                        <span className="px-3 py-1 bg-white/10 rounded-lg border border-white/20">Plano: Supabase Pro</span>
                        <span className="px-3 py-1 bg-white/10 rounded-lg border border-white/20">Disco: 8 GB</span>
                        <span className="px-3 py-1 bg-white/10 rounded-lg border border-white/20">Região: sa-east-1</span>
                        <span className="px-3 py-1 bg-white/10 rounded-lg border border-white/20">Alerta: 75% (6 GB)</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MaintenanceDashboard;
