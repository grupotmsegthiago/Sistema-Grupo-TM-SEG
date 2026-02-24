
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { DATA_RETENTION } from '../constants';
// Fix: Added missing Info icon to the lucide-react imports
import { 
    Database, Download, Trash2, RefreshCw, Loader2, CheckCircle2, 
    AlertTriangle, ShieldCheck, Clock, Zap, FileJson, Server,
    HardDrive, History, Trash, FileDown, ShieldAlert, Upload, 
    FileUp, AlertCircle, ArrowRight, Save, List, Info
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

const MaintenanceDashboard: React.FC = () => {
    const { showNotification } = useNotification();
    const [stats, setStats] = useState({
        logsCount: 0,
        oldLogsCount: 0,
        missionsCount: 0,
        storageEstimate: 0
    });
    const [backups, setBackups] = useState<BackupRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState<string | null>(null);
    const [isRestoreMode, setIsRestoreMode] = useState(false);

    useEffect(() => {
        fetchStats();
        fetchBackupHistory();
    }, []);

    const fetchStats = async () => {
        setIsLoading(true);
        try {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - DATA_RETENTION.LOGS_DAYS);

            const [logsRes, oldLogsRes, missionsRes] = await Promise.all([
                supabase.from('system_logs').select('*', { count: 'exact', head: true }),
                supabase.from('system_logs').select('*', { count: 'exact', head: true }).lt('created_at', thirtyDaysAgo.toISOString()),
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
        if (!confirm(`ATENÇÃO: Deseja remover apenas os LOGS DE SISTEMA (rastros de acessos) com mais de ${DATA_RETENTION.LOGS_DAYS} dias?\n\nSuas Missões e Cadastros NUNCA serão apagados por este botão.`)) return;
        
        setIsProcessing('ROTATE');
        try {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - DATA_RETENTION.LOGS_DAYS);

            const { error } = await supabase
                .from('system_logs')
                .delete()
                .lt('created_at', thirtyDaysAgo.toISOString());

            if (error) throw error;

            await logAction('DELETE', 'DatabaseMaintenance', 'LOG_ROTATION', `Limpeza de ${stats.oldLogsCount} logs de auditoria antigos.`);
            showNotification('Otimização Concluída', `${stats.oldLogsCount} logs de rastro foram removidos.`, 'success');
            fetchStats();
        } catch (e: any) {
            alert(e.message);
        } finally {
            setIsProcessing(null);
        }
    };

    const handleFullBackup = async () => {
        setIsProcessing('BACKUP');
        try {
            // Coleta todas as tabelas vitais
            const [
                clients, providers, missions, prices, costs, routes, 
                agents, vehicles, mission_logs, fin_trans, fin_acc, fin_cat
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
                supabase.from('financial_categories').select('*')
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
                    financial_categories: fin_cat.data
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
            
            // Grava no histórico do banco
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

                // Restauração em Ordem para respeitar Foreign Keys
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

    const storagePercent = (stats.storageEstimate / DATA_RETENTION.STORAGE_LIMIT_MB) * 100;

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            {/* CABEÇALHO */}
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-lg">
                        <Database size={28} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Saúde & Backup do Sistema</h2>
                        <p className="text-sm text-gray-500 font-medium">Proteção contra perda de dados e otimização de espaço</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setIsRestoreMode(!isRestoreMode)} 
                        className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-2 border ${isRestoreMode ? 'bg-red-600 text-white border-red-700' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    >
                        <ShieldAlert size={16} /> {isRestoreMode ? 'Cancelar Restauro' : 'Restaurar Backup'}
                    </button>
                    <button onClick={fetchStats} className="p-3 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-all">
                        <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* MODO RESTAURO (ALERTA) */}
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

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* COLUNA ESQUERDA: INFRA E LIMPEZA */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-200 flex flex-col justify-between group overflow-hidden relative">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-125 transition-transform"><HardDrive size={120}/></div>
                        <div className="relative z-10">
                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Uso de Banco (Limite 500MB)</h4>
                            <div className="flex items-baseline gap-2 mb-2">
                                <span className={`text-4xl font-black font-mono tracking-tighter ${storagePercent > 80 ? 'text-red-600' : 'text-slate-900'}`}>
                                    {storagePercent.toFixed(1)}%
                                </span>
                            </div>
                            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                                <div className={`h-full transition-all duration-1000 ${storagePercent > 80 ? 'bg-red-500' : 'bg-blue-600'}`} style={{ width: `${storagePercent}%` }}></div>
                            </div>
                            <p className="text-[10px] text-gray-400 mt-4 font-bold uppercase tracking-widest">Est: {stats.storageEstimate.toFixed(2)} MB / 500 MB</p>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-200 flex flex-col justify-between">
                        <div>
                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Otimização de Espaço</h4>
                            <div className="flex items-center gap-4 mb-4">
                                <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl border border-orange-100"><History size={24}/></div>
                                <div>
                                    <p className="text-2xl font-black text-gray-900">{stats.oldLogsCount}</p>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase">Logs de Auditoria (+30 dias)</p>
                                </div>
                            </div>
                            <p className="text-xs text-gray-500 leading-relaxed italic">Apaga apenas os rastros de uso do sistema para liberar espaço. <strong>Suas missões estão seguras.</strong></p>
                        </div>
                        <button 
                            onClick={handleLogRotation} 
                            disabled={isProcessing === 'ROTATE' || stats.oldLogsCount === 0}
                            className="mt-6 w-full py-3 bg-red-50 text-red-700 hover:bg-red-600 hover:text-white rounded-2xl text-xs font-black uppercase transition-all shadow-sm flex items-center justify-center gap-2 border border-red-200 disabled:opacity-50"
                        >
                            {isProcessing === 'ROTATE' ? <Loader2 size={16} className="animate-spin"/> : <Trash size={16}/>}
                            Limpar Apenas Logs
                        </button>
                    </div>
                </div>

                {/* COLUNA DIREITA: BACKUP E LISTA */}
                <div className="lg:col-span-8 flex flex-col gap-6">
                    {/* BOTÃO BACKUP MESTRE */}
                    <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl text-white overflow-hidden relative">
                        <div className="absolute top-0 right-0 p-4 opacity-10"><Zap size={150} className="text-red-500"/></div>
                        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="p-2 bg-red-600 rounded-xl shadow-lg"><FileJson size={20}/></div>
                                    <h3 className="text-xl font-black uppercase tracking-tight">Gerar Cópia de Segurança Total</h3>
                                </div>
                                <p className="text-sm text-slate-400 font-medium max-w-md">Este processo exporta todas as tabelas vitais do Grupo TMSEG para um arquivo JSON seguro que pode ser guardado fora do sistema.</p>
                            </div>
                            <button 
                                onClick={handleFullBackup}
                                disabled={isProcessing === 'BACKUP'}
                                className="px-10 py-4 bg-white text-slate-900 hover:bg-red-600 hover:text-white rounded-2xl text-sm font-black uppercase transition-all shadow-xl flex items-center justify-center gap-3 disabled:opacity-50"
                            >
                                {isProcessing === 'BACKUP' ? <Loader2 size={20} className="animate-spin"/> : <FileDown size={20} strokeWidth={3} />}
                                Executar Backup Agora
                            </button>
                        </div>
                    </div>

                    {/* LISTA DE HISTÓRICO DE BACKUP */}
                    <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-200 overflow-hidden flex-1 flex flex-col">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                <List size={16} className="text-slate-400"/> Histórico de Exportações (Últimas 10)
                            </h3>
                        </div>
                        <div className="flex-1 overflow-x-auto">
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
                                                <td className="px-6 py-4 text-xs font-bold text-gray-700">{new Date(b.created_at).toLocaleString('pt-BR')}</td>
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
                </div>
            </div>

            {/* INFOCARD PROTOCOLO */}
            <div className="bg-blue-600 rounded-[2.5rem] p-8 text-white shadow-xl relative overflow-hidden flex flex-col md:flex-row items-center gap-8">
                <div className="absolute top-0 right-0 p-4 opacity-10"><ShieldCheck size={120} /></div>
                <div className="p-4 bg-white/10 rounded-3xl backdrop-blur-md border border-white/20">
                    {/* Fix: Usage of previously missing Info icon */}
                    <Info size={40} className="text-white" />
                </div>
                <div>
                    <h3 className="text-xl font-black uppercase tracking-tight">Protocolo de Continuidade (DRP)</h3>
                    <p className="text-sm text-blue-100 mt-2 max-w-3xl leading-relaxed">
                        Em caso de falha crítica no servidor ou banco de dados, o arquivo de backup baixado permite a reconstrução total da operação em um novo ambiente em menos de 5 minutos. 
                        <strong> Recomendamos realizar o download manual a cada 12 horas ou antes de atualizações massivas.</strong>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default MaintenanceDashboard;
