
import React, { useState, useEffect } from 'react';
import { 
  Activity, Database, Zap, Clock, Server, RefreshCw, Truck, Play, 
  Loader2, ExternalLink, HelpCircle, MessageSquare, Map as MapIcon, 
  DollarSign, ShieldCheck, AlertCircle, Terminal, Globe, Sparkles, BrainCircuit, Info
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

const DB_QUOTA_MB = 500; 

const ServerStats: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [dbLatency, setDbLatency] = useState(0);
  const [storageEstimate, setStorageEstimate] = useState(0);
  const [uptimeGraph, setUptimeGraph] = useState<HourlyStatus[]>([]);
  const [systemUptime, setSystemUptime] = useState("Calculando...");

  // Estados Individuais das APIs
  const [wdapi, setWdapi] = useState<ApiTestState>({ status: 'IDLE', result: null, errorDetails: null, showHelp: false });
  const [maps, setMaps] = useState<ApiTestState>({ status: 'IDLE', result: null, errorDetails: null, showHelp: false });
  const [zapi, setZapi] = useState<ApiTestState>({ status: 'IDLE', result: null, errorDetails: null, showHelp: false });
  const [toll, setToll] = useState<ApiTestState>({ status: 'IDLE', result: null, errorDetails: null, showHelp: false });
  const [gemini, setGemini] = useState<ApiTestState>({ status: 'IDLE', result: null, errorDetails: null, showHelp: false });

  useEffect(() => {
      runFullDiagnostic();
      const interval = setInterval(() => runFullDiagnostic(true), 60000);
      return () => clearInterval(interval);
  }, []);

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

  // --- TESTE GOOGLE GEMINI (IA) ---
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
            status: 'ERROR', 
            result: 'Falha na IA', 
            showHelp: true,
            errorDetails: {
                code: 'AI_AUTH_ERROR',
                steps: [
                    "Verifique se o faturamento do Google AI Studio está ativo",
                    "Certifique-se que o modelo 'gemini-3-flash-preview' está disponível na sua região",
                    "Valide se a chave de API em variáveis de ambiente está correta"
                ],
                link: "https://aistudio.google.com/app/apikey"
            }
        });
    }
  };

  // --- TESTE WDAPI (PLACAS) ---
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
                status: 'ERROR', 
                result: data.error || 'Erro na resposta', 
                showHelp: true,
                errorDetails: {
                    code: isAuth ? 'AUTH_INVALID' : 'QUOTA_EXCEEDED',
                    steps: isAuth ? [
                        "Acesse wdapi2.com.br",
                        "Copie o Token atualizado",
                        "Atualize 'TOKEN' em 'constants.ts'"
                    ] : [
                        "Saldo esgotado na WDAPI",
                        "Realize uma recarga no painel wdapi2.com.br"
                    ],
                    link: "https://wdapi2.com.br"
                }
            });
        }
    } catch (e: any) {
        setWdapi({ status: 'ERROR', result: 'Falha de conexão', showHelp: true, errorDetails: { code: 'CONN_ERR', steps: ["Verifique sua internet", "O servidor WDAPI pode estar offline"] } });
    }
  };

  // --- TESTE GOOGLE MAPS ---
  const testMaps = async () => {
    setMaps({ ...maps, status: 'TESTING', result: null, errorDetails: null });
    try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=Sao+Paulo&key=${googleMapsApiKey}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.status === 'OK') {
            setMaps({ ...maps, status: 'SUCCESS', result: 'Maps & Geocoding OK', errorDetails: null, showHelp: false });
        } else {
            setMaps({ 
                status: 'ERROR', 
                result: data.status, 
                showHelp: true,
                errorDetails: {
                    code: data.status,
                    steps: [
                        "Acesse o Google Cloud Console",
                        "Verifique se o faturamento (Billing) está ativo",
                        "Certifique-se que as APIs 'Maps JavaScript' e 'Geocoding' estão habilitadas"
                    ],
                    link: "https://console.cloud.google.com/google/maps-apis/credentials"
                }
            });
        }
    } catch (e) {
        setMaps({ status: 'ERROR', result: 'Erro na requisição', showHelp: true, errorDetails: { code: 'FETCH_ERR', steps: ["Chave API pode estar bloqueada por IP ou Referrer"] } });
    }
  };

  // --- TESTE WHATSAPP (Z-API) ---
  const testZapi = async () => {
    setZapi({ ...zapi, status: 'TESTING', result: null, errorDetails: null });
    try {
        const url = WHATSAPP_API_CONFIG.GROUPS_URL;
        const response = await fetch(url, { headers: { 'Client-Token': WHATSAPP_API_CONFIG.CLIENT_TOKEN } });
        if (response.ok) {
            setZapi({ ...zapi, status: 'SUCCESS', result: 'Instância Conectada', errorDetails: null, showHelp: false });
        } else {
            setZapi({ 
                status: 'ERROR', 
                result: `Erro ${response.status}`, 
                showHelp: true,
                errorDetails: {
                    code: 'ZAPI_AUTH',
                    steps: [
                        "Acesse o painel da Z-API",
                        "Verifique se o celular está pareado (QR Code)",
                        "Verifique se o INSTANCE_ID e TOKEN em 'constants.ts' estão corretos"
                    ],
                    link: "https://painel.z-api.io"
                }
            });
        }
    } catch (e) {
        setZapi({ status: 'ERROR', result: 'Falha de rede', showHelp: true, errorDetails: { code: 'NET_ERR', steps: ["Servidor Z-API inacessível"] } });
    }
  };

  // --- TESTE TOLL API (PEDÁGIO) ---
  const testToll = async () => {
    setToll({ ...toll, status: 'TESTING', result: null, errorDetails: null });
    try {
        const url = `${TOLL_API_CONFIG.BASE_URL}/status?key=${TOLL_API_CONFIG.API_KEY}`;
        const response = await fetch(url);
        if (response.ok) {
            setToll({ ...toll, status: 'SUCCESS', result: 'Serviço de Pedágio OK', errorDetails: null, showHelp: false });
        } else {
            setToll({ 
                status: 'ERROR', 
                result: 'Chave Inválida', 
                showHelp: true,
                errorDetails: {
                    code: 'TOLL_AUTH',
                    steps: [
                        "Verifique sua assinatura em calcularpedagio.com.br",
                        "POR QUE NÃO CALCULA?: O Pedágio depende de uma ROTA válida do Google Maps. Se o card de 'Google Maps' estiver com erro, o Pedágio não conseguirá calcular valores na tela de missão.",
                        "Certifique-se que a API_KEY em 'constants.ts' é a versão v2"
                    ],
                    link: "https://www.calcularpedagio.com.br"
                }
            });
        }
    } catch (e) {
        setToll({ status: 'ERROR', result: 'Offline', showHelp: true, errorDetails: { code: 'TOLL_ERR', steps: ["Serviço de pedágio temporariamente fora do ar"] } });
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
                    <button onClick={() => onTest()} className="text-red-600 hover:rotate-180 transition-transform">
                        <RefreshCw size={14} />
                    </button>
                )}
            </div>

            <div className="flex items-center gap-3">
                <button 
                    onClick={onTest}
                    disabled={state.status === 'TESTING'}
                    className={`p-2.5 rounded-xl transition-all ${
                        state.status === 'TESTING' ? 'bg-gray-100 text-gray-400' : 
                        state.status === 'SUCCESS' ? 'bg-emerald-600 text-white' :
                        state.status === 'ERROR' ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'
                    }`}
                >
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
            <button onClick={() => { runFullDiagnostic(); testWdapi(); testMaps(); testZapi(); testToll(); testGemini(); }} className="flex items-center gap-2 bg-gray-900 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase hover:bg-black transition-all shadow-lg">
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
    </div>
  );
};

export default ServerStats;
