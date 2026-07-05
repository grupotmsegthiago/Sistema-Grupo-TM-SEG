
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { SystemLog } from '../types';
import { logAction } from '../lib/logger';
import { useRealtimeRefresh } from '../lib/RealtimeProvider';
import { formatDateTimeBR } from '../lib/dateUtils';
import { 
    Shield, Activity, Search, User, FileText, Trash2, Edit, PlusCircle, 
    BarChart2, RefreshCw, Clock, Wifi, WifiOff, HeartPulse, Building2, Briefcase, Calendar, AlertTriangle, Copy, Check, Wrench, Zap, Power, Database, DollarSign, Loader2, ShieldCheck
} from 'lucide-react';
import { useNotification } from '../lib/NotificationContext';

const SystemLogs: React.FC = () => {
    const { showNotification } = useNotification();
    const [logs, setLogs] = useState<SystemLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [copied, setCopied] = useState(false);

    const auditSql = `-- === SCRIPT DE REPARO TOTAL v26.0 (SQL EDITOR SUPABASE) ===
-- ESTE SCRIPT CORRIGE ERROS DE COLUNAS FALTANTES EM 'PROVIDERS' E 'PROVIDER_COST_TABLES'

-- 1. CORREÇÃO DA TABELA DE FORNECEDORES (PROVIDERS)
ALTER TABLE providers 
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS trading_name text,
ADD COLUMN IF NOT EXISTS contact_name text,
ADD COLUMN IF NOT EXISTS created_by text,
ADD COLUMN IF NOT EXISTS zip_code text,
ADD COLUMN IF NOT EXISTS street text,
ADD COLUMN IF NOT EXISTS number text,
ADD COLUMN IF NOT EXISTS complement text,
ADD COLUMN IF NOT EXISTS neighborhood text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS state text,
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS alvara_validity date,
ADD COLUMN IF NOT EXISTS alvara_url text;

-- 2. CORREÇÃO DA TABELA DE CUSTOS DE FORNECEDOR (PARA REAJUSTE ANUAL)
ALTER TABLE provider_cost_tables
ADD COLUMN IF NOT EXISTS adjustment_status boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS last_adjustment_date timestamptz,
ADD COLUMN IF NOT EXISTS previous_activation_cost numeric,
ADD COLUMN IF NOT EXISTS previous_cost_per_extra_km numeric,
ADD COLUMN IF NOT EXISTS previous_cost_per_extra_hour numeric;

-- 3. GARANTIR QUE A TABELA DE LOGS EXISTE PARA AUDITORIA
CREATE TABLE IF NOT EXISTS system_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  user_name text,
  action_type text,
  entity text,
  entity_id text,
  details text
);

-- 4. LIMPAR CACHE DO SCHEMA
NOTIFY pgrst, 'reload schema';
`;

    useEffect(() => {
        fetchLogs();
    }, []);

    const fetchLogs = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('system_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);
            if (error) throw error;
            if (data) setLogs(data as SystemLog[]);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useRealtimeRefresh('system_logs', fetchLogs);

    const handleCopySql = () => {
        navigator.clipboard.writeText(auditSql);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        showNotification('Copiado', 'SQL de reparo total copiado com sucesso.', 'success');
    };

    const filteredLogs = logs.filter(log => 
        (log.user_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.details || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.entity || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            {/* CABEÇALHO */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                        <Activity className="text-red-700" /> Auditoria & Logs de Sistema
                    </h2>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Rastreamento de Segurança e Banco de Dados</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={fetchLogs} className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 text-gray-500 transition-all">
                        <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
                    </button>
                </div>
            </div>

            {/* SEÇÃO DE CORREÇÃO SQL (SEMPRE VISÍVEL) */}
            <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-500">
                    <Database size={140} />
                </div>
                
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-red-600 rounded-2xl shadow-lg"><Wrench size={24}/></div>
                        <div>
                            <h3 className="text-xl font-black uppercase tracking-tight">Reparo de Banco de Dados (Schema)</h3>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Solução definitiva para erro de colunas em providers e logs</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        <div className="lg:col-span-8">
                            <div className="bg-black/50 p-6 rounded-2xl border border-white/10 relative">
                                <pre className="font-mono text-[11px] leading-relaxed text-indigo-300 whitespace-pre-wrap select-all">
                                    {auditSql}
                                </pre>
                                <button 
                                    onClick={handleCopySql}
                                    className={`absolute top-4 right-4 p-2 rounded-lg transition-all ${copied ? 'bg-green-600' : 'bg-white/10 hover:bg-white/20'}`}
                                >
                                    {copied ? <Check size={18} /> : <Copy size={18} />}
                                </button>
                            </div>
                        </div>
                        <div className="lg:col-span-4 flex flex-col justify-center space-y-4">
                            <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                <h4 className="text-[10px] font-black text-red-500 uppercase tracking-[0.3em] mb-2">Instruções de Uso</h4>
                                <ol className="text-xs text-slate-300 space-y-2 list-decimal pl-4">
                                    <li>Abra o painel do seu projeto no <strong>Supabase</strong>.</li>
                                    <li>Acesse o menu <strong>SQL Editor</strong> na lateral esquerda.</li>
                                    <li>Crie uma <strong>New Query</strong> e cole o código ao lado.</li>
                                    <li>Clique em <strong>Run</strong> (Executar).</li>
                                </ol>
                            </div>
                            <div className="p-4 bg-emerald-950/30 rounded-2xl border border-emerald-500/20 flex items-center gap-3">
                                <ShieldCheck className="text-emerald-500" size={20} />
                                <p className="text-[10px] text-emerald-100 font-bold uppercase leading-tight">Este comando adiciona as colunas faltantes e limpa o cache de schema imediatamente.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* TABELA DE LOGS */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex gap-4">
                    <div className="relative flex-1 max-w-md">
                        <input 
                            type="text" 
                            placeholder="Buscar nos logs..." 
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-500/10 focus:border-red-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest">
                                <th className="px-6 py-4">Data/Hora</th>
                                <th className="px-6 py-4">Usuário</th>
                                <th className="px-6 py-4 text-center">Tipo</th>
                                <th className="px-6 py-4">Entidade</th>
                                <th className="px-6 py-4">Detalhes</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {isLoading ? (
                                <tr><td colSpan={5} className="p-12 text-center"><Loader2 className="animate-spin mx-auto text-red-600" size={32} /></td></tr>
                            ) : filteredLogs.length === 0 ? (
                                <tr><td colSpan={5} className="p-12 text-center text-gray-500 font-bold uppercase tracking-widest">Nenhum log registrado</td></tr>
                            ) : (
                                filteredLogs.map((log) => (
                                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 text-[11px] font-mono text-gray-500">
                                            {formatDateTimeBR(log.created_at)}
                                        </td>
                                        <td className="px-6 py-4 font-black text-xs text-gray-700 uppercase">
                                            {log.user_name}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${
                                                log.action_type === 'CREATE' ? 'bg-green-100 text-green-700' :
                                                log.action_type === 'UPDATE' ? 'bg-blue-100 text-blue-700' :
                                                log.action_type === 'DELETE' ? 'bg-red-100 text-red-700' :
                                                'bg-gray-100 text-gray-600'
                                            }`}>
                                                {log.action_type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-[11px] font-bold text-indigo-700 uppercase">
                                            {log.entity}
                                        </td>
                                        <td className="px-6 py-4 text-[11px] text-gray-600 max-w-xs truncate" title={log.details}>
                                            {log.details}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default SystemLogs;
