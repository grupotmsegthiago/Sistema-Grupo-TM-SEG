
import React, { useState, useEffect, useCallback } from 'react';
import { 
  Activity, Database, Zap, Clock, Server, RefreshCw, Truck, Play, 
  Loader2, ExternalLink, HelpCircle, MessageSquare, Map as MapIcon, 
  DollarSign, ShieldCheck, AlertCircle, Terminal, Globe, Sparkles, BrainCircuit, Info,
  HardDrive, BarChart3, Shield, Wifi, WifiOff, CheckCircle2, XCircle,
  TrendingUp, Package, FolderOpen, Eye, ArrowUpRight, ChevronDown, ChevronUp
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { API_BRASIL_CONFIG, WHATSAPP_API_CONFIG, TOLL_API_CONFIG } from '../constants';
import { googleMapsApiKey } from '../lib/maps';
import { generateContent } from '../lib/gemini';

interface HourlyStatus {
    hour: string;
    status: 'online' | 'idle' | 'error';
    count: number;
}

interface ApiTestState {
    status: 'IDLE' | 'TESTING' | 'SUCCESS' | 'ERROR';
    result: string | null;
    errorDetails: { code: string, steps: string[], link?: string } | null;
    showHelp: boolean;
}

interface TableMetric {
    table: string;
    count: number;
    estimatedSizeKb: number;
    latency?: number;
    error?: string;
}

interface DbMetrics {
    tables: TableMetric[];
    total_rows: number;
    total_estimated_size_mb: number;
    quota_mb: number;
    usage_percent: number;
}

interface BucketStat {
    bucket_id: string;
    objects: number;
    size_bytes: number;
    size_mb: number;
    public: boolean;
}

interface StorageUsage {
    buckets: BucketStat[];
    total_storage_mb: number;
    storage_quota_mb: number;
    usage_percent: number;
}

interface HealthCheck {
    overall: 'healthy' | 'degraded';
    checks: Record<string, { ok: boolean; latency_ms: number; error?: string }>;
}

interface SupabaseStatus {
    rest_ok: boolean;
    latency_ms: number;
    incidents: any[];
    scheduled_maintenances: any[];
}

interface BillingLinks {
    billing: string;
    usage: string;
    database: string;
    storage: string;
    logs: string;
    settings: string;
    api_docs: string;
}

const DB_QUOTA_MB = 500;

const ServerStats: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [dbLatency, setDbLatency] = useState(0);
  const [storageEstimate, setStorageEstimate] = useState(0);
  const [uptimeGraph, setUptimeGraph] = useState<HourlyStatus[]>([]);
  const [systemUptime, setSystemUptime] = useState("Calculando...");

  const [wdapi, setWdapi] = useState<ApiTestState>({ status: 'IDLE', result: null, errorDetails: null, showHelp: false });
  const [maps, setMaps] = useState<ApiTestState>({ status: 'IDLE', result: null, errorDetails: null, showHelp: false });
  const [zapi, setZapi] = useState<ApiTestState>({ status: 'IDLE', result: null, errorDetails: null, showHelp: false });
  const [toll, setToll] = useState<ApiTestState>({ status: 'IDLE', result: null, errorDetails: null, showHelp: false });
  const [gemini, setGemini] = useState<ApiTestState>({ status: 'IDLE', result: null, errorDetails: null, showHelp: false });

  const [supaStatus, setSupaStatus] = useState<SupabaseStatus | null>(null);
  const [dbMetrics, setDbMetrics] = useState<DbMetrics | null>(null);
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);
  const [healthCheck, setHealthCheck] = useState<HealthCheck | null>(null);
  const [billingLinks, setBillingLinks] = useState<BillingLinks | null>(null);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [showAllTables, setShowAllTables] = useState(false);
  const [activeMonitorTab, setActiveMonitorTab] = useState<'overview' | 'database' | 'storage' | 'links' | 'costs'>('overview');
  const [dbCapacity, setDbCapacity] = useState<any>(null);
  const [platformCosts, setPlatformCosts] = useState<any>(null);

  useEffect(() => {
      runFullDiagnostic();
      fetchMonitorData();
      const interval = setInterval(() => { runFullDiagnostic(true); fetchMonitorData(true); }, 60000);
      return () => clearInterval(interval);
  }, []);

  const fetchMonitorData = async (silent = false) => {
      if (!silent) setMonitorLoading(true);
      try {
          const [statusRes, dbRes, storageRes, healthRes, linksRes, capRes] = await Promise.allSettled([
              fetch('/api/supabase/status').then(r => r.json()),
              fetch('/api/supabase/db-metrics').then(r => r.json()),
              fetch('/api/supabase/storage-usage').then(r => r.json()),
              fetch('/api/supabase/health-check').then(r => r.json()),
              fetch('/api/supabase/billing-links').then(r => r.json()),
              fetch('/api/db/capacity').then(r => r.json()),
          ]);
          if (statusRes.status === 'fulfilled') setSupaStatus(statusRes.value);
          if (dbRes.status === 'fulfilled') setDbMetrics(dbRes.value);
          if (storageRes.status === 'fulfilled') setStorageUsage(storageRes.value);
          if (healthRes.status === 'fulfilled') setHealthCheck(healthRes.value);
          if (linksRes.status === 'fulfilled') setBillingLinks(linksRes.value);
          if (capRes.status === 'fulfilled') setDbCapacity(capRes.value);
          try {
              const costsResp = await fetch('/api/platform/costs');
              if (costsResp.ok) setPlatformCosts(await costsResp.json());
          } catch {}
      } catch (err) {
          console.error('Monitor fetch error:', err);
      } finally {
          if (!silent) setMonitorLoading(false);
      }
  };

  const runFullDiagnostic = async (silent = false) => {
      if (!silent) setLoading(true);
      const startPing = performance.now();
      try {
          await supabase.from('profiles').select('id', { count: 'exact', head: true });
          const endPing = performance.now();
          setDbLatency(Math.round(endPing - startPing));

          const [logsCount, missionsCount] = await Promise.all([
              supabase.from('system_logs').select('*', { count: 'exact', head: true }),
              supabase.from('missions').select('*', { count: 'exact', head: true })
          ]);
          
          const total = (logsCount.count || 0) + (missionsCount.count || 0);
          setStorageEstimate(parseFloat(((total * 8) / 1024 / 1024).toFixed(4)));

          const now = new Date();
          const graphData: HourlyStatus[] = [];
          for (let i = 23; i >= 0; i--) {
              const d = new Date(now.getTime() - i * 60 * 60 * 1000);
              graphData.push({ hour: `${d.getHours()}:00`, status: 'online', count: 1 });
          }
          setUptimeGraph(graphData);
          setSystemUptime("Ativo");
      } catch (error) {
          console.error("Diagnostic error", error);
      } finally {
          if (!silent) setLoading(false);
      }
  };

  const testGemini = async () => {
    setGemini({ ...gemini, status: 'TESTING', result: null, errorDetails: null });
    try {
        const resultText = await generateContent({
            model: 'gemini-3-flash-preview',
            contents: 'ping',
            config: { maxOutputTokens: 10, thinkingConfig: { thinkingBudget: 0 } }
        });
        if (resultText) {
            setGemini({ ...gemini, status: 'SUCCESS', result: 'IA Operacional (Gemini 3)', errorDetails: null, showHelp: false });
        } else {
            throw new Error("IA não respondeu ao comando");
        }
    } catch (e: any) {
        setGemini({ 
            status: 'ERROR', result: 'Falha na IA', showHelp: true,
            errorDetails: { code: 'AI_AUTH_ERROR', steps: ["Verifique se o faturamento do Google AI Studio está ativo", "Certifique-se que o modelo 'gemini-3-flash-preview' está disponível na sua região", "Valide se a chave de API em variáveis de ambiente está correta"], link: "https://aistudio.google.com/app/apikey" }
        });
    }
  };

  const testWdapi = async () => {
    setWdapi({ ...wdapi, status: 'TESTING', result: null, errorDetails: null });
    try {
        const url = `${API_BRASIL_CONFIG.BASE_URL}/ABC1234/${API_BRASIL_CONFIG.TOKEN}`;
        const response = await fetch(url);
        const data = await response.json();
        if (response.ok && !data.error) {
            setWdapi({ ...wdapi, status: 'SUCCESS', result: `OK: ${data.marca || 'Serviço Ativo'}`, errorDetails: null, showHelp: false });
        } else {
            const isAuth = response.status === 403 || (data.error && data.error.includes('token'));
            setWdapi({ 
                status: 'ERROR', result: data.error || 'Erro na resposta', showHelp: true,
                errorDetails: { code: isAuth ? 'AUTH_INVALID' : 'QUOTA_EXCEEDED', steps: isAuth ? ["Acesse wdapi2.com.br", "Copie o Token atualizado", "Atualize 'TOKEN' em 'constants.ts'"] : ["Saldo esgotado na WDAPI", "Realize uma recarga no painel wdapi2.com.br"], link: "https://wdapi2.com.br" }
            });
        }
    } catch (e: any) {
        setWdapi({ status: 'ERROR', result: 'Falha de conexão', showHelp: true, errorDetails: { code: 'CONN_ERR', steps: ["Verifique sua internet", "O servidor WDAPI pode estar offline"] } });
    }
  };

  const testMaps = async () => {
    setMaps({ ...maps, status: 'TESTING', result: null, errorDetails: null });
    try {
        if (!googleMapsApiKey) {
            setMaps({ status: 'ERROR', result: 'Chave não configurada', showHelp: true, errorDetails: { code: 'NO_KEY', steps: ["Configure VITE_GOOGLE_MAPS_API_KEY nas variáveis de ambiente"], link: "https://console.cloud.google.com/google/maps-apis/credentials" } });
            return;
        }
        const testUrl = `https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&libraries=places&callback=__gmTestCb__`;
        const result = await new Promise<{ok: boolean, error?: string}>((resolve) => {
            const timeout = setTimeout(() => resolve({ ok: false, error: 'TIMEOUT' }), 10000);
            (window as any).__gmTestCb__ = () => { clearTimeout(timeout); resolve({ ok: true }); };
            const script = document.createElement('script');
            script.src = testUrl;
            script.onerror = () => { clearTimeout(timeout); resolve({ ok: false, error: 'LOAD_ERR' }); };
            document.head.appendChild(script);
            setTimeout(() => { try { document.head.removeChild(script); } catch(_){} }, 12000);
        });
        delete (window as any).__gmTestCb__;
        if (result.ok) {
            setMaps({ ...maps, status: 'SUCCESS', result: 'Maps JavaScript API OK', errorDetails: null, showHelp: false });
        } else {
            setMaps({ 
                status: 'ERROR', result: result.error || 'Falha ao carregar', showHelp: true,
                errorDetails: { code: result.error || 'LOAD_ERR', steps: ["Acesse o Google Cloud Console", "Verifique se o faturamento (Billing) está ativo", "Certifique-se que a API 'Maps JavaScript' está habilitada"], link: "https://console.cloud.google.com/google/maps-apis/credentials" }
            });
        }
    } catch (e) {
        setMaps({ status: 'ERROR', result: 'Erro na requisição', showHelp: true, errorDetails: { code: 'FETCH_ERR', steps: ["Chave API pode estar bloqueada por IP ou Referrer"] } });
    }
  };

  const testZapi = async () => {
    setZapi({ ...zapi, status: 'TESTING', result: null, errorDetails: null });
    try {
        const url = WHATSAPP_API_CONFIG.GROUPS_URL;
        const response = await fetch(url, { headers: { 'Client-Token': WHATSAPP_API_CONFIG.CLIENT_TOKEN } });
        if (response.ok) {
            setZapi({ ...zapi, status: 'SUCCESS', result: 'Instância Conectada', errorDetails: null, showHelp: false });
        } else {
            setZapi({ 
                status: 'ERROR', result: `Erro ${response.status}`, showHelp: true,
                errorDetails: { code: 'ZAPI_AUTH', steps: ["Acesse o painel da Z-API", "Verifique se o celular está pareado (QR Code)", "Verifique se o INSTANCE_ID e TOKEN em 'constants.ts' estão corretos"], link: "https://painel.z-api.io" }
            });
        }
    } catch (e) {
        setZapi({ status: 'ERROR', result: 'Falha de rede', showHelp: true, errorDetails: { code: 'NET_ERR', steps: ["Servidor Z-API inacessível"] } });
    }
  };

  const testToll = async () => {
    setToll({ ...toll, status: 'TESTING', result: null, errorDetails: null });
    try {
        const response = await fetch(`${TOLL_API_CONFIG.BASE_URL}/status`);
        const data = await response.json();
        if (response.ok && data.success) {
            setToll({ ...toll, status: 'SUCCESS', result: `Serviço de Pedágio OK (${TOLL_API_CONFIG.PROVIDER})`, errorDetails: null, showHelp: false });
        } else {
            setToll({ 
                status: 'ERROR', result: data.error || 'Chave Inválida', showHelp: true,
                errorDetails: { code: 'TOLL_AUTH', steps: ["Verifique se a chave RAPIDAPI_TOLL_KEY está configurada nos Secrets do Replit", "POR QUE NÃO CALCULA?: O Pedágio depende de uma ROTA válida. Se o card de 'Google Maps' estiver com erro, o Pedágio não conseguirá calcular valores na tela de missão.", "Verifique sua assinatura no RapidAPI para a API 'Pedagio'"], link: "https://rapidapi.com/territorial/api/pedagio" }
            });
        }
    } catch (e) {
        setToll({ status: 'ERROR', result: 'Offline', showHelp: true, errorDetails: { code: 'TOLL_ERR', steps: ["Serviço de pedágio temporariamente fora do ar"] } });
    }
  };

  const formatBytes = (bytes: number) => {
      if (bytes === 0) return '0 B';
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const getServiceIcon = (name: string) => {
      switch(name) {
          case 'database': return <Database size={14} />;
          case 'auth': return <Shield size={14} />;
          case 'storage': return <HardDrive size={14} />;
          case 'realtime': return <Wifi size={14} />;
          default: return <Server size={14} />;
      }
  };

  const ApiCard = ({ title, state, icon: Icon, onTest }: { title: string, state: ApiTestState, icon: any, onTest: () => void }) => (
    <div className={`p-5 rounded-2xl border shadow-sm transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
        state.status === 'SUCCESS' ? 'bg-emerald-50 border-emerald-200' :
        state.status === 'ERROR' ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'
    }`}>
        <div className="absolute top-0 right-0 p-3 opacity-5"><Icon size={48} /></div>
        <div>
            <div className="flex justify-between items-start mb-4">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{title}</p>
                {state.status === 'ERROR' && (
                    <button onClick={() => onTest()} className="text-red-600 hover:rotate-180 transition-transform"><RefreshCw size={14} /></button>
                )}
            </div>
            <div className="flex items-center gap-3">
                <button onClick={onTest} disabled={state.status === 'TESTING'} className={`p-2.5 rounded-xl transition-all ${state.status === 'TESTING' ? 'bg-gray-100 text-gray-400' : state.status === 'SUCCESS' ? 'bg-emerald-600 text-white' : state.status === 'ERROR' ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'}`}>
                    {state.status === 'TESTING' ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                </button>
                <div className="min-w-0">
                    <h3 className={`text-xs font-black uppercase truncate ${state.status === 'SUCCESS' ? 'text-emerald-700' : state.status === 'ERROR' ? 'text-red-700' : 'text-gray-900'}`}>
                        {state.status === 'IDLE' ? 'Aguardando' : state.status === 'TESTING' ? 'Testando...' : state.status === 'SUCCESS' ? 'Online' : 'Falha'}
                    </h3>
                    <p className={`text-[9px] font-mono mt-0.5 truncate ${state.status === 'ERROR' ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                        {state.result || 'Clique para testar'}
                    </p>
                </div>
            </div>
        </div>
        {state.showHelp && state.errorDetails && (
            <div className="mt-4 p-3 bg-white border border-red-100 rounded-xl animate-in slide-in-from-top-2">
                <p className="text-[9px] font-black text-red-700 uppercase mb-2 flex items-center gap-1"><Zap size={10} className="fill-current"/> Plano de Correção:</p>
                <div className="space-y-1.5">
                    {state.errorDetails.steps.map((step, i) => (
                        <div key={i} className="flex gap-2 items-start">
                            <span className="text-[8px] bg-red-100 text-red-700 w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold shrink-0 mt-0.5">{i+1}</span>
                            <p className="text-[9px] text-gray-600 font-bold leading-tight">{step}</p>
                        </div>
                    ))}
                </div>
                {state.errorDetails.link && (
                    <a href={state.errorDetails.link} target="_blank" rel="noreferrer" className="mt-3 block text-[8px] font-black text-blue-600 hover:underline flex items-center gap-1">
                        PAINEL DE CONTROLE <ExternalLink size={8}/>
                    </a>
                )}
            </div>
        )}
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in pb-12">
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
                <h1 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                    <Terminal className="text-red-600" /> CENTRAL DE DIAGNÓSTICOS (S.O.C)
                </h1>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Status de Integridade das APIs e Banco de Dados</p>
            </div>
            <button onClick={() => { runFullDiagnostic(); fetchMonitorData(); testWdapi(); testMaps(); testZapi(); testToll(); testGemini(); }} className="flex items-center gap-2 bg-gray-900 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase hover:bg-black transition-all shadow-lg">
                <RefreshCw size={16} /> Testar Tudo
            </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <ApiCard title="IA Google Gemini" state={gemini} icon={Sparkles} onTest={testGemini} />
            <ApiCard title="WDAPI (Placas)" state={wdapi} icon={Truck} onTest={testWdapi} />
            <ApiCard title="Google Maps" state={maps} icon={MapIcon} onTest={testMaps} />
            <ApiCard title="WhatsApp (Z-API)" state={zapi} icon={MessageSquare} onTest={testZapi} />
            <ApiCard title="Pedágio (V2)" state={toll} icon={DollarSign} onTest={testToll} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
                <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-6">
                    <Server size={18} className="text-gray-400" /> Histórico de Disponibilidade (24h)
                </h3>
                <div className="flex items-end justify-between gap-1.5 h-32 w-full border-b border-gray-100 pb-1">
                    {uptimeGraph.map((slot, index) => (
                        <div key={index} className="flex-1 h-full flex flex-col justify-end group relative">
                            <div className="absolute bottom-full mb-2 bg-black text-white text-[8px] p-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 transition-opacity">Sistema OK - {slot.hour}</div>
                            <div className="w-full bg-emerald-500 rounded-t-sm h-[80%] hover:bg-emerald-400 transition-colors"></div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="space-y-4">
                <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Armazenamento Supabase</p>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-3xl font-black text-gray-900">{(storageEstimate / DB_QUOTA_MB * 100).toFixed(2)}%</h3>
                        <span className="text-[10px] font-black text-gray-400">Free Tier</span>
                    </div>
                    <div className="w-full bg-gray-100 h-2 mt-3 rounded-full overflow-hidden border">
                        <div className="h-full bg-blue-600 transition-all duration-1000" style={{ width: `${(storageEstimate / DB_QUOTA_MB * 100)}%` }}></div>
                    </div>
                </div>

                <div className="bg-slate-900 p-5 rounded-3xl text-white shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-125 transition-transform"><Zap size={80}/></div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Latência do Banco</p>
                    <div className="flex items-baseline gap-1">
                        <h3 className={`text-4xl font-black font-mono tracking-tighter ${dbLatency > 1000 ? 'text-red-500' : 'text-emerald-400'}`}>{dbLatency}</h3>
                        <span className="text-xs font-bold text-slate-500 uppercase">ms</span>
                    </div>
                    <p className="text-[9px] text-slate-400 mt-2 font-medium">Tempo de resposta Supabase/Edge</p>
                </div>
            </div>
        </div>

        <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-3xl p-6 shadow-xl border border-slate-700">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-3">
                        <Database className="text-blue-400" /> Monitor Supabase
                    </h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Custos • Uso • Segurança • Desempenho • Status</p>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => fetchMonitorData()} 
                        disabled={monitorLoading}
                        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase hover:bg-blue-700 transition-all disabled:opacity-50"
                    >
                        {monitorLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        Atualizar
                    </button>
                </div>
            </div>

            <div className="flex gap-1 mb-6 bg-slate-800/50 p-1 rounded-xl">
                {(['overview', 'database', 'storage', 'costs', 'links'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveMonitorTab(tab)}
                        className={`flex-1 py-2.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                            activeMonitorTab === tab ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-700'
                        }`}
                    >
                        {tab === 'overview' ? 'Visão Geral' : tab === 'database' ? 'Banco de Dados' : tab === 'storage' ? 'Storage' : tab === 'costs' ? 'Custos' : 'Links Úteis'}
                    </button>
                ))}
            </div>

            {activeMonitorTab === 'overview' && (
                <div className="space-y-6">
                    {healthCheck && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {Object.entries(healthCheck.checks).map(([name, check]) => (
                                <div key={name} className={`p-4 rounded-xl border ${check.ok ? 'bg-emerald-900/30 border-emerald-700/50' : 'bg-red-900/30 border-red-700/50'}`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        {getServiceIcon(name)}
                                        <span className="text-[10px] font-black text-slate-300 uppercase">{name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {check.ok ? <CheckCircle2 size={16} className="text-emerald-400" /> : <XCircle size={16} className="text-red-400" />}
                                        <span className={`text-sm font-black ${check.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {check.ok ? 'Operacional' : 'Indisponível'}
                                        </span>
                                    </div>
                                    <p className="text-[9px] text-slate-500 mt-1 font-mono">{check.latency_ms}ms</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {supaStatus && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700">
                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Status REST API</p>
                                <div className="flex items-center gap-3">
                                    {supaStatus.rest_ok ? <Wifi size={20} className="text-emerald-400" /> : <WifiOff size={20} className="text-red-400" />}
                                    <div>
                                        <p className={`text-sm font-black ${supaStatus.rest_ok ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {supaStatus.rest_ok ? 'ONLINE' : 'OFFLINE'}
                                        </p>
                                        <p className="text-[9px] text-slate-500 font-mono">{supaStatus.latency_ms}ms</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700">
                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Incidentes Supabase</p>
                                <div className="flex items-center gap-3">
                                    {supaStatus.incidents.length === 0 
                                        ? <ShieldCheck size={20} className="text-emerald-400" />
                                        : <AlertCircle size={20} className="text-amber-400" />
                                    }
                                    <div>
                                        <p className={`text-sm font-black ${supaStatus.incidents.length === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                            {supaStatus.incidents.length === 0 ? 'NENHUM' : `${supaStatus.incidents.length} ATIVO(S)`}
                                        </p>
                                        <a href="https://status.supabase.com" target="_blank" rel="noreferrer" className="text-[9px] text-blue-400 hover:underline flex items-center gap-1">
                                            status.supabase.com <ExternalLink size={8} />
                                        </a>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700">
                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Manutenções Agendadas</p>
                                <div className="flex items-center gap-3">
                                    <Clock size={20} className="text-slate-400" />
                                    <p className="text-sm font-black text-slate-300">
                                        {supaStatus.scheduled_maintenances.length === 0 ? 'NENHUMA' : `${supaStatus.scheduled_maintenances.length} AGENDADA(S)`}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {(dbMetrics || dbCapacity) && (() => {
                        const capUsedMb = dbCapacity?.used_mb || dbMetrics?.total_estimated_size_mb || 0;
                        const capLimitMb = dbCapacity ? dbCapacity.limit_gb * 1024 : (dbMetrics?.quota_mb || DB_QUOTA_MB);
                        const capPct = capLimitMb > 0 ? Math.min(100, Math.round(capUsedMb / capLimitMb * 100)) : 0;
                        const capColor = capPct < 70 ? 'bg-emerald-500' : capPct < 90 ? 'bg-amber-500' : 'bg-red-500';
                        const totalRows = dbCapacity?.total_rows || dbMetrics?.total_rows || 0;
                        const activeTables = dbCapacity?.tables?.filter((t: any) => t.rows > 0).length || dbMetrics?.tables.filter(t => (t.count || 0) > 0).length || 0;
                        const totalTables = dbCapacity?.tables?.length || dbMetrics?.tables.length || 0;
                        return (
                        <div className="space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Total de Registros</p>
                                    <p className="text-3xl font-black text-white font-mono">{totalRows.toLocaleString('pt-BR')}</p>
                                </div>
                                <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Tamanho do Banco</p>
                                    <p className="text-3xl font-black text-blue-400 font-mono">{capUsedMb.toFixed(1)} <span className="text-sm">MB</span></p>
                                    <p className="text-[9px] text-slate-500 mt-1">{dbCapacity?.source === 'rpc' ? 'Dado real via RPC' : 'Estimativa por registros'}</p>
                                </div>
                                <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Capacidade Utilizada</p>
                                    <p className="text-3xl font-black text-amber-400 font-mono">{capPct}<span className="text-sm">%</span></p>
                                    <div className="w-full bg-slate-700 h-2 mt-2 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full transition-all duration-700 ${capColor}`} style={{ width: `${capPct}%` }}></div>
                                    </div>
                                    <p className="text-[9px] text-slate-500 mt-1">{capUsedMb.toFixed(1)} MB de {capLimitMb.toFixed(0)} MB ({dbCapacity?.limit_gb || (capLimitMb / 1024).toFixed(1)} GB)</p>
                                </div>
                                <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Tabelas Ativas</p>
                                    <p className="text-3xl font-black text-emerald-400 font-mono">{activeTables}</p>
                                    <p className="text-[9px] text-slate-500 mt-1">de {totalTables} monitoradas</p>
                                </div>
                            </div>

                            {dbCapacity?.tables && dbCapacity.tables.length > 0 && (
                                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Registros por Tabela</h4>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                        {dbCapacity.tables.slice(0, 12).map((t: any, i: number) => {
                                            const maxRows = Math.max(...dbCapacity.tables.map((x: any) => x.rows || 0), 1);
                                            const pct = Math.round((t.rows / maxRows) * 100);
                                            return (
                                                <div key={i} className="bg-slate-900/50 rounded-lg p-2.5 border border-slate-700/50">
                                                    <p className="text-[9px] font-bold text-slate-400 truncate">{t.table}</p>
                                                    <p className="text-sm font-black text-white font-mono">{(t.rows || 0).toLocaleString('pt-BR')}</p>
                                                    <div className="w-full bg-slate-700 h-1 mt-1 rounded-full overflow-hidden">
                                                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }}></div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {dbCapacity.updated_at && (
                                        <p className="text-[8px] text-slate-600 mt-2 text-right">Atualizado: {new Date(dbCapacity.updated_at).toLocaleString('pt-BR')}</p>
                                    )}
                                </div>
                            )}
                        </div>
                        );
                    })()}
                </div>
            )}

            {activeMonitorTab === 'database' && dbMetrics && (
                <div className="space-y-4">
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                            <h3 className="text-xs font-black text-slate-300 uppercase flex items-center gap-2">
                                <BarChart3 size={14} className="text-blue-400" /> Uso por Tabela
                            </h3>
                            <button onClick={() => setShowAllTables(!showAllTables)} className="text-[9px] text-blue-400 font-bold flex items-center gap-1 hover:underline">
                                {showAllTables ? 'Mostrar Top 10' : 'Mostrar Todas'}
                                {showAllTables ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                        </div>

                        <div className="p-4 space-y-2">
                            {(showAllTables ? dbMetrics.tables : dbMetrics.tables.sort((a, b) => b.count - a.count).slice(0, 10)).map((t, idx) => {
                                const maxCount = Math.max(...dbMetrics.tables.map(x => x.count || 0), 1);
                                const barWidth = ((t.count || 0) / maxCount) * 100;
                                return (
                                    <div key={t.table} className="group">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[9px] font-mono text-slate-500 w-5 text-right">{idx + 1}</span>
                                            <span className="text-[10px] font-bold text-slate-300 w-40 truncate">{t.table}</span>
                                            <div className="flex-1 bg-slate-700/50 h-5 rounded-md overflow-hidden relative">
                                                <div 
                                                    className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-md transition-all duration-700"
                                                    style={{ width: `${Math.max(barWidth, 1)}%` }}
                                                ></div>
                                                <span className="absolute inset-0 flex items-center px-2 text-[9px] font-mono text-white font-bold">
                                                    {(t.count || 0).toLocaleString('pt-BR')} registros
                                                </span>
                                            </div>
                                            <span className="text-[9px] font-mono text-slate-500 w-16 text-right">
                                                {t.estimatedSizeKb > 1024 ? `${(t.estimatedSizeKb / 1024).toFixed(1)} MB` : `${t.estimatedSizeKb} KB`}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 text-center">
                            <p className="text-[9px] font-black text-slate-500 uppercase mb-1">Maior Tabela</p>
                            <p className="text-xs font-black text-white truncate">
                                {[...dbMetrics.tables].sort((a, b) => b.count - a.count)[0]?.table || '—'}
                            </p>
                            <p className="text-[9px] text-blue-400 font-mono">
                                {([...dbMetrics.tables].sort((a, b) => b.count - a.count)[0]?.count || 0).toLocaleString('pt-BR')} rows
                            </p>
                        </div>
                        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 text-center">
                            <p className="text-[9px] font-black text-slate-500 uppercase mb-1">Tabelas Vazias</p>
                            <p className="text-xl font-black text-amber-400">{dbMetrics.tables.filter(t => (t.count || 0) === 0).length}</p>
                        </div>
                        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 text-center">
                            <p className="text-[9px] font-black text-slate-500 uppercase mb-1">Disponível</p>
                            <p className="text-xl font-black text-emerald-400">{(dbMetrics.quota_mb - dbMetrics.total_estimated_size_mb).toFixed(1)} MB</p>
                        </div>
                        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 text-center">
                            <p className="text-[9px] font-black text-slate-500 uppercase mb-1">Cota Total</p>
                            <p className="text-xl font-black text-slate-300">{dbMetrics.quota_mb} MB</p>
                        </div>
                    </div>
                </div>
            )}

            {activeMonitorTab === 'storage' && (
                <div className="space-y-4">
                    {storageUsage && storageUsage.buckets.length > 0 ? (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Storage Total</p>
                                    <p className="text-3xl font-black text-blue-400 font-mono">{storageUsage.total_storage_mb} <span className="text-sm">MB</span></p>
                                    <div className="w-full bg-slate-700 h-1.5 mt-2 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500 rounded-full transition-all duration-700" style={{ width: `${Math.min(storageUsage.usage_percent, 100)}%` }}></div>
                                    </div>
                                    <p className="text-[9px] text-slate-500 mt-1">{storageUsage.usage_percent}% de {storageUsage.storage_quota_mb} MB</p>
                                </div>
                                <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Buckets</p>
                                    <p className="text-3xl font-black text-emerald-400 font-mono">{storageUsage.buckets.length}</p>
                                </div>
                                <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Objetos</p>
                                    <p className="text-3xl font-black text-amber-400 font-mono">{storageUsage.buckets.reduce((s, b) => s + b.objects, 0).toLocaleString('pt-BR')}</p>
                                </div>
                            </div>

                            <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                                <div className="p-4 border-b border-slate-700">
                                    <h3 className="text-xs font-black text-slate-300 uppercase flex items-center gap-2">
                                        <FolderOpen size={14} className="text-amber-400" /> Detalhamento por Bucket
                                    </h3>
                                </div>
                                <div className="p-4 space-y-3">
                                    {storageUsage.buckets.map(b => {
                                        const maxSize = Math.max(...storageUsage.buckets.map(x => x.size_mb), 0.01);
                                        const barWidth = (b.size_mb / maxSize) * 100;
                                        return (
                                            <div key={b.bucket_id} className="flex items-center gap-3">
                                                <div className="flex items-center gap-2 w-36">
                                                    <Package size={12} className="text-slate-500 shrink-0" />
                                                    <span className="text-[10px] font-bold text-slate-300 truncate">{b.bucket_id}</span>
                                                    {b.public && <span className="text-[7px] bg-emerald-900/50 text-emerald-400 px-1.5 py-0.5 rounded font-bold shrink-0">PUB</span>}
                                                </div>
                                                <div className="flex-1 bg-slate-700/50 h-5 rounded-md overflow-hidden relative">
                                                    <div className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-md transition-all duration-700" style={{ width: `${Math.max(barWidth, 2)}%` }}></div>
                                                    <span className="absolute inset-0 flex items-center px-2 text-[9px] font-mono text-white font-bold">
                                                        {b.objects} obj • {b.size_mb} MB
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="bg-slate-800/50 p-8 rounded-xl border border-slate-700 text-center">
                            <HardDrive size={32} className="text-slate-600 mx-auto mb-3" />
                            <p className="text-sm font-bold text-slate-400">
                                {monitorLoading ? 'Carregando dados do Storage...' : 'Nenhum bucket encontrado ou sem permissão de acesso'}
                            </p>
                        </div>
                    )}
                </div>
            )}

            {activeMonitorTab === 'costs' && (
                <div className="space-y-6">
                    {platformCosts ? (() => {
                        const c = platformCosts;
                        const fmtR = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
                        const fmtU = (v: number) => `$ ${v.toFixed(2)}`;

                        const pieData = [
                            { name: 'Replit', value: c.replit.total_brl, color: '#3b82f6' },
                            { name: 'Supabase', value: c.supabase.total_brl, color: '#22c55e' },
                            { name: 'APIs', value: c.apis.total_brl, color: '#f59e0b' },
                        ].filter(d => d.value > 0);

                        return (
                            <div className="space-y-6">
                                <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl border border-slate-700 p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                                            <DollarSign size={16} className="text-emerald-400" /> Custo Mensal Total
                                        </h3>
                                        <span className="text-[9px] text-slate-500">Câmbio: {fmtR(c.currency_rate)}/USD</span>
                                    </div>
                                    <div className="flex items-end gap-3 mb-2">
                                        <p className="text-5xl font-black text-emerald-400 font-mono tracking-tighter">{fmtR(c.total_brl)}</p>
                                        <p className="text-lg font-bold text-slate-500 pb-1">{fmtU(c.total_usd)}</p>
                                    </div>
                                    <p className="text-[10px] text-slate-500">Estimativa mensal baseada nos planos e excedentes configurados</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="bg-slate-800/50 rounded-xl border border-blue-700/30 p-5">
                                        <div className="flex items-center gap-2 mb-4">
                                            <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">
                                                <Server size={16} className="text-blue-400" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-blue-400 uppercase">Replit</p>
                                                <p className="text-[9px] text-slate-500">{c.replit.plan}</p>
                                            </div>
                                        </div>
                                        <p className="text-2xl font-black text-white font-mono mb-3">{fmtR(c.replit.total_brl)}</p>
                                        <div className="space-y-1.5 border-t border-slate-700 pt-3">
                                            <div className="flex justify-between text-[10px]">
                                                <span className="text-slate-400">Plano Base</span>
                                                <span className="text-white font-bold">{fmtR(c.replit.base_brl)}</span>
                                            </div>
                                            {c.replit.extras.egress.brl > 0 && (
                                                <div className="flex justify-between text-[10px]">
                                                    <span className="text-slate-400">Egress Extra</span>
                                                    <span className="text-amber-400 font-bold">{fmtR(c.replit.extras.egress.brl)}</span>
                                                </div>
                                            )}
                                            {c.replit.extras.compute.brl > 0 && (
                                                <div className="flex justify-between text-[10px]">
                                                    <span className="text-slate-400">Compute Extra</span>
                                                    <span className="text-amber-400 font-bold">{fmtR(c.replit.extras.compute.brl)}</span>
                                                </div>
                                            )}
                                            {c.replit.extras.storage.brl > 0 && (
                                                <div className="flex justify-between text-[10px]">
                                                    <span className="text-slate-400">Storage Extra</span>
                                                    <span className="text-amber-400 font-bold">{fmtR(c.replit.extras.storage.brl)}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="bg-slate-800/50 rounded-xl border border-emerald-700/30 p-5">
                                        <div className="flex items-center gap-2 mb-4">
                                            <div className="w-8 h-8 bg-emerald-600/20 rounded-lg flex items-center justify-center">
                                                <Database size={16} className="text-emerald-400" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-emerald-400 uppercase">Supabase</p>
                                                <p className="text-[9px] text-slate-500">{c.supabase.plan}</p>
                                            </div>
                                        </div>
                                        <p className="text-2xl font-black text-white font-mono mb-3">{fmtR(c.supabase.total_brl)}</p>
                                        <div className="space-y-1.5 border-t border-slate-700 pt-3">
                                            <div className="flex justify-between text-[10px]">
                                                <span className="text-slate-400">Plano Base</span>
                                                <span className="text-white font-bold">{fmtR(c.supabase.base_brl)}</span>
                                            </div>
                                            <div className="flex justify-between text-[10px]">
                                                <span className="text-slate-400">DB Capacity</span>
                                                <span className="text-slate-300 font-bold">{c.supabase.db_capacity_gb} GB</span>
                                            </div>
                                            {c.supabase.extras.db.brl > 0 && (
                                                <div className="flex justify-between text-[10px]">
                                                    <span className="text-slate-400">DB Extra</span>
                                                    <span className="text-amber-400 font-bold">{fmtR(c.supabase.extras.db.brl)}</span>
                                                </div>
                                            )}
                                            {c.supabase.extras.bandwidth.brl > 0 && (
                                                <div className="flex justify-between text-[10px]">
                                                    <span className="text-slate-400">Bandwidth Extra</span>
                                                    <span className="text-amber-400 font-bold">{fmtR(c.supabase.extras.bandwidth.brl)}</span>
                                                </div>
                                            )}
                                            {c.supabase.extras.storage.brl > 0 && (
                                                <div className="flex justify-between text-[10px]">
                                                    <span className="text-slate-400">Storage Extra</span>
                                                    <span className="text-amber-400 font-bold">{fmtR(c.supabase.extras.storage.brl)}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="bg-slate-800/50 rounded-xl border border-amber-700/30 p-5">
                                        <div className="flex items-center gap-2 mb-4">
                                            <div className="w-8 h-8 bg-amber-600/20 rounded-lg flex items-center justify-center">
                                                <Globe size={16} className="text-amber-400" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-amber-400 uppercase">APIs Externas</p>
                                                <p className="text-[9px] text-slate-500">Google, Resend, etc.</p>
                                            </div>
                                        </div>
                                        <p className="text-2xl font-black text-white font-mono mb-3">{fmtR(c.apis.total_brl)}</p>
                                        <div className="space-y-1.5 border-t border-slate-700 pt-3">
                                            <div className="flex justify-between text-[10px]">
                                                <span className="text-slate-400">Google Maps</span>
                                                <span className="text-white font-bold">{fmtR(c.apis.google_maps.brl)}</span>
                                            </div>
                                            <div className="flex justify-between text-[10px]">
                                                <span className="text-slate-400">Resend (Email)</span>
                                                <span className="text-white font-bold">{fmtR(c.apis.resend.brl)}</span>
                                            </div>
                                            {c.apis.other.brl > 0 && (
                                                <div className="flex justify-between text-[10px]">
                                                    <span className="text-slate-400">Outros</span>
                                                    <span className="text-white font-bold">{fmtR(c.apis.other.brl)}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between text-[10px] pt-1">
                                                <span className="text-slate-400">Gemini AI</span>
                                                <span className="text-emerald-400 font-bold">Gratuito (Replit)</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {c.saving_tips && c.saving_tips.length > 0 && (
                                    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                                        <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2 mb-4">
                                            <Sparkles size={14} className="text-yellow-400" /> Dicas de Economia
                                        </h3>
                                        <div className="space-y-3">
                                            {c.saving_tips.map((tip: any, i: number) => {
                                                const impactColor = tip.impact === 'Alto' ? 'bg-red-900/40 text-red-400 border-red-800/50' :
                                                    tip.impact === 'Médio' ? 'bg-amber-900/40 text-amber-400 border-amber-800/50' :
                                                    tip.impact === 'Info' ? 'bg-blue-900/40 text-blue-400 border-blue-800/50' :
                                                    'bg-slate-700/40 text-slate-400 border-slate-600/50';
                                                const areaColor = tip.area === 'Replit' ? 'text-blue-400' :
                                                    tip.area === 'Supabase' ? 'text-emerald-400' :
                                                    tip.area === 'Google Maps' ? 'text-red-400' :
                                                    tip.area === 'Gemini AI' ? 'text-purple-400' : 'text-slate-300';
                                                return (
                                                    <div key={i} className="bg-slate-900/50 rounded-lg p-3.5 border border-slate-700/50">
                                                        <div className="flex items-center justify-between mb-1.5">
                                                            <span className={`text-[10px] font-black uppercase ${areaColor}`}>{tip.area}</span>
                                                            <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full border ${impactColor}`}>
                                                                {tip.impact === 'Alto' ? 'IMPACTO ALTO' : tip.impact === 'Médio' ? 'IMPACTO MÉDIO' : tip.impact === 'Info' ? 'INFORMATIVO' : 'IMPACTO BAIXO'}
                                                            </span>
                                                        </div>
                                                        <p className="text-[11px] text-slate-300 font-bold mb-1">{tip.tip}</p>
                                                        <p className="text-[9px] text-slate-500 font-mono bg-slate-800/50 rounded px-2 py-1 mt-1.5">{tip.action}</p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 p-4">
                                    <p className="text-[10px] text-slate-500 font-bold">
                                        Os valores são estimativas baseadas nos planos configurados. Para valores exatos, verifique o billing do
                                        <a href="https://replit.com/account" target="_blank" rel="noreferrer" className="text-blue-400 ml-1">Replit</a> e do
                                        <a href="https://supabase.com/dashboard/org/_/billing" target="_blank" rel="noreferrer" className="text-emerald-400 ml-1">Supabase</a>.
                                        Configure os excedentes reais via variáveis de ambiente (REPLIT_EXTRA_*, SUPABASE_EXTRA_*, GOOGLE_MAPS_MONTHLY_USD).
                                    </p>
                                </div>
                            </div>
                        );
                    })() : (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 size={24} className="animate-spin text-blue-400 mr-3" />
                            <p className="text-sm font-bold text-slate-400">Carregando dados de custos...</p>
                        </div>
                    )}
                </div>
            )}

            {activeMonitorTab === 'links' && billingLinks && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                        { label: 'Billing / Custos', desc: 'Gerencie assinatura e faturas', url: billingLinks.billing, icon: DollarSign, color: 'text-emerald-400' },
                        { label: 'Usage / Uso', desc: 'Acompanhe consumo de recursos', url: billingLinks.usage, icon: TrendingUp, color: 'text-blue-400' },
                        { label: 'Database', desc: 'Tabelas, SQL Editor, Backups', url: billingLinks.database, icon: Database, color: 'text-purple-400' },
                        { label: 'Storage', desc: 'Buckets, arquivos e políticas', url: billingLinks.storage, icon: HardDrive, color: 'text-amber-400' },
                        { label: 'Logs Explorer', desc: 'Logs de API, Auth e Postgres', url: billingLinks.logs, icon: Terminal, color: 'text-cyan-400' },
                        { label: 'API Docs', desc: 'Documentação da API do projeto', url: billingLinks.api_docs, icon: Globe, color: 'text-indigo-400' },
                        { label: 'Settings', desc: 'Configurações gerais do projeto', url: billingLinks.settings, icon: Activity, color: 'text-slate-400' },
                    ].map(item => (
                        <a
                            key={item.label}
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="bg-slate-800/50 p-5 rounded-xl border border-slate-700 hover:border-blue-600 hover:bg-slate-700/50 transition-all group cursor-pointer block"
                        >
                            <div className="flex items-start justify-between mb-3">
                                <item.icon size={20} className={item.color} />
                                <ArrowUpRight size={14} className="text-slate-600 group-hover:text-blue-400 transition-colors" />
                            </div>
                            <p className="text-sm font-black text-white">{item.label}</p>
                            <p className="text-[9px] text-slate-500 mt-1">{item.desc}</p>
                        </a>
                    ))}
                </div>
            )}

            {monitorLoading && !healthCheck && (
                <div className="flex items-center justify-center py-12">
                    <Loader2 size={24} className="animate-spin text-blue-400 mr-3" />
                    <p className="text-sm font-bold text-slate-400">Carregando dados do monitor...</p>
                </div>
            )}
        </div>
    </div>
  );
};

export default ServerStats;
