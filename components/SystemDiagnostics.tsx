import React, { useState, useEffect, useCallback } from 'react';
import { 
    X, Loader2, CheckCircle2, XCircle, AlertTriangle, Wifi, WifiOff, 
    Database, Server, Globe, Shield, Zap, Clock, HardDrive, RefreshCw,
    Monitor, Cpu, Activity, ArrowRight, Copy, Download
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface DiagResult {
    name: string;
    category: string;
    status: 'pending' | 'ok' | 'warning' | 'error';
    latency?: number;
    detail?: string;
    icon: any;
}

interface Props {
    onClose: () => void;
}

const SystemDiagnostics: React.FC<Props> = ({ onClose }) => {
    const [results, setResults] = useState<DiagResult[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [startTime, setStartTime] = useState<number>(0);
    const [totalTime, setTotalTime] = useState<number>(0);
    const [copied, setCopied] = useState(false);

    const tests: Omit<DiagResult, 'status' | 'latency' | 'detail'>[] = [
        { name: 'Conexão com Internet', category: 'Rede', icon: Wifi },
        { name: 'DNS / Resolução de Nomes', category: 'Rede', icon: Globe },
        { name: 'Latência de Rede', category: 'Rede', icon: Activity },
        { name: 'Backend Express (API)', category: 'Servidor', icon: Server },
        { name: 'Supabase — Banco de Dados', category: 'Banco de Dados', icon: Database },
        { name: 'Supabase — Auth', category: 'Banco de Dados', icon: Shield },
        { name: 'Supabase — Storage', category: 'Banco de Dados', icon: HardDrive },
        { name: 'Supabase — Realtime', category: 'Banco de Dados', icon: Zap },
        { name: 'Google Maps API', category: 'Serviços Externos', icon: Globe },
        { name: 'Gemini AI (Backend)', category: 'Serviços Externos', icon: Cpu },
        { name: 'Frontend — Renderização', category: 'Cliente', icon: Monitor },
        { name: 'LocalStorage', category: 'Cliente', icon: HardDrive },
        { name: 'Service Worker / PWA', category: 'Cliente', icon: Shield },
        { name: 'WebSocket / SSE', category: 'Cliente', icon: Zap },
        { name: 'Firewall / CORS', category: 'Segurança', icon: Shield },
    ];

    const updateResult = (index: number, update: Partial<DiagResult>) => {
        setResults(prev => prev.map((r, i) => i === index ? { ...r, ...update } : r));
    };

    const runTest = async (index: number, testFn: () => Promise<{ status: 'ok' | 'warning' | 'error'; latency?: number; detail: string }>) => {
        try {
            const result = await testFn();
            updateResult(index, result);
        } catch (err: any) {
            updateResult(index, { status: 'error', detail: err.message || 'Erro desconhecido' });
        }
        setProgress(prev => prev + 1);
    };

    const measureLatency = async (fn: () => Promise<any>): Promise<number> => {
        const start = performance.now();
        await fn();
        return Math.round(performance.now() - start);
    };

    const runAllTests = useCallback(async () => {
        setIsRunning(true);
        setProgress(0);
        setStartTime(Date.now());
        setTotalTime(0);

        const initial: DiagResult[] = tests.map(t => ({ ...t, status: 'pending' as const }));
        setResults(initial);

        await runTest(0, async () => {
            if (!navigator.onLine) return { status: 'error', detail: 'Sem conexão com a internet detectada' };
            const lat = await measureLatency(() => fetch('/api/health', { cache: 'no-store' }).catch(() => fetch(window.location.origin, { cache: 'no-store' })));
            return { status: 'ok', latency: lat, detail: `Online — ${lat}ms` };
        });

        await runTest(1, async () => {
            try {
                const lat = await measureLatency(() => fetch('https://dns.google/resolve?name=supabase.co', { mode: 'no-cors', cache: 'no-store' }));
                return { status: lat < 2000 ? 'ok' : 'warning', latency: lat, detail: `Resolução DNS: ${lat}ms` };
            } catch {
                return { status: 'warning', detail: 'Não foi possível verificar DNS externo (pode ser bloqueio de CORS)' };
            }
        });

        await runTest(2, async () => {
            const pings: number[] = [];
            for (let i = 0; i < 3; i++) {
                const lat = await measureLatency(() => fetch(`/api/health?t=${Date.now()}`, { cache: 'no-store' }).catch(() => {}));
                pings.push(lat);
            }
            const avg = Math.round(pings.reduce((a, b) => a + b, 0) / pings.length);
            const jitter = Math.round(Math.max(...pings) - Math.min(...pings));
            const status = avg < 200 ? 'ok' : avg < 500 ? 'warning' : 'error';
            return { status, latency: avg, detail: `Média: ${avg}ms | Jitter: ${jitter}ms | Pings: ${pings.join(', ')}ms` };
        });

        await runTest(3, async () => {
            try {
                const lat = await measureLatency(async () => {
                    const res = await fetch('/api/health', { cache: 'no-store' });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                });
                return { status: lat < 500 ? 'ok' : 'warning', latency: lat, detail: `API respondendo em ${lat}ms` };
            } catch (err: any) {
                return { status: 'error', detail: `Backend offline ou inacessível: ${err.message}` };
            }
        });

        await runTest(4, async () => {
            try {
                const lat = await measureLatency(async () => {
                    const { error } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
                    if (error) throw error;
                });
                return { status: lat < 1000 ? 'ok' : 'warning', latency: lat, detail: `Query executada em ${lat}ms` };
            } catch (err: any) {
                return { status: 'error', detail: `Falha na conexão: ${err.message}` };
            }
        });

        await runTest(5, async () => {
            try {
                const lat = await measureLatency(async () => {
                    const { data, error } = await supabase.from('system_users').select('id', { count: 'exact', head: true });
                    if (error) throw error;
                });
                return { status: 'ok', latency: lat, detail: `Auth + tabela de usuários acessível: ${lat}ms` };
            } catch (err: any) {
                return { status: 'error', detail: `Auth/Usuários inacessível: ${err.message}` };
            }
        });

        await runTest(6, async () => {
            try {
                const lat = await measureLatency(async () => {
                    const { error } = await supabase.storage.listBuckets();
                    if (error) throw error;
                });
                return { status: 'ok', latency: lat, detail: `Storage acessível: ${lat}ms` };
            } catch (err: any) {
                return { status: 'warning', detail: `Storage: ${err.message}` };
            }
        });

        await runTest(7, async () => {
            try {
                const lat = await measureLatency(async () => {
                    const res = await fetch('https://ajhmmjuewdsukecaimik.supabase.co/realtime/v1/api/tenants', { mode: 'no-cors', cache: 'no-store' });
                });
                return { status: 'ok', latency: lat, detail: `Realtime acessível: ${lat}ms` };
            } catch (err: any) {
                return { status: 'warning', detail: `Realtime: ${err.message || 'Possível bloqueio CORS (normal no browser)'}` };
            }
        });

        await runTest(8, async () => {
            try {
                const lat = await measureLatency(async () => {
                    const res = await fetch('https://maps.googleapis.com/maps/api/js?key=AIzaSyBIs-lrtAP6hoA1z_VA4Gbx1ujA-AlJe2k&callback=__gmTest', { mode: 'no-cors', cache: 'no-store' });
                });
                return { status: 'ok', latency: lat, detail: `Google Maps acessível: ${lat}ms` };
            } catch (err: any) {
                return { status: 'error', detail: `Google Maps bloqueado: ${err.message}` };
            }
        });

        await runTest(9, async () => {
            try {
                const lat = await measureLatency(async () => {
                    const res = await fetch('/api/health', { cache: 'no-store' });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                });
                return { status: 'ok', latency: lat, detail: `Gemini via backend disponível: ${lat}ms` };
            } catch (err: any) {
                return { status: 'error', detail: `Backend AI inacessível: ${err.message}` };
            }
        });

        await runTest(10, async () => {
            try {
                const start = performance.now();
                const el = document.getElementById('root');
                const hasContent = el && el.children.length > 0;
                const renderTime = Math.round(performance.now() - start);
                const memInfo = (performance as any).memory;
                let memDetail = '';
                if (memInfo) {
                    const usedMB = Math.round(memInfo.usedJSHeapSize / 1024 / 1024);
                    const totalMB = Math.round(memInfo.totalJSHeapSize / 1024 / 1024);
                    memDetail = ` | RAM: ${usedMB}/${totalMB}MB`;
                }
                return { status: hasContent ? 'ok' : 'error', latency: renderTime, detail: `DOM ativo: ${el?.children.length || 0} elementos${memDetail}` };
            } catch {
                return { status: 'warning', detail: 'Não foi possível verificar DOM' };
            }
        });

        await runTest(11, async () => {
            try {
                const testKey = '__diag_test_' + Date.now();
                localStorage.setItem(testKey, 'ok');
                const val = localStorage.getItem(testKey);
                localStorage.removeItem(testKey);
                const keys = Object.keys(localStorage).length;
                let totalSize = 0;
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key) totalSize += (localStorage.getItem(key) || '').length;
                }
                const sizeKB = Math.round(totalSize / 1024);
                return { status: val === 'ok' ? 'ok' : 'error', detail: `${keys} chaves | ${sizeKB}KB usado` };
            } catch (err: any) {
                return { status: 'error', detail: `LocalStorage bloqueado: ${err.message}` };
            }
        });

        await runTest(12, async () => {
            try {
                if (!('serviceWorker' in navigator)) return { status: 'warning', detail: 'Service Worker não suportado neste navegador' };
                const reg = await navigator.serviceWorker.getRegistration();
                const isInstalled = window.matchMedia('(display-mode: standalone)').matches;
                return { status: reg ? 'ok' : 'warning', detail: `SW: ${reg ? 'Registrado ✅' : 'Não registrado'} | PWA: ${isInstalled ? 'Instalada' : 'Navegador'}` };
            } catch (err: any) {
                return { status: 'warning', detail: `SW: ${err.message}` };
            }
        });

        await runTest(13, async () => {
            try {
                const wsSupport = 'WebSocket' in window;
                const sseSupport = 'EventSource' in window;
                if (!wsSupport) return { status: 'error', detail: 'WebSocket não suportado — comunicação em tempo real indisponível' };
                const lat = await measureLatency(async () => {
                    await new Promise<void>((resolve, reject) => {
                        const ws = new WebSocket('wss://ajhmmjuewdsukecaimik.supabase.co/realtime/v1/websocket?apikey=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ5MTY2ODAsImV4cCI6MjA2MDQ5MjY4MH0.zNHBe-JOyJHIBOOMYBnYi_nAjd3U0iqr6_p0pJqNiYc&vsn=1.0.0');
                        ws.onopen = () => { ws.close(); resolve(); };
                        ws.onerror = () => { resolve(); };
                        setTimeout(() => { try { ws.close(); } catch {} resolve(); }, 5000);
                    });
                });
                return { status: lat < 3000 ? 'ok' : 'warning', latency: lat, detail: `WebSocket: ${lat}ms | SSE: ${sseSupport ? 'Sim' : 'Não'}` };
            } catch (err: any) {
                return { status: 'warning', detail: `WebSocket: ${err.message}` };
            }
        });

        await runTest(14, async () => {
            try {
                const corsTargets = [
                    { name: 'Supabase', url: 'https://ajhmmjuewdsukecaimik.supabase.co/rest/v1/', mode: 'cors' as RequestMode },
                    { name: 'Backend', url: '/api/health', mode: 'cors' as RequestMode },
                ];
                const issues: string[] = [];
                for (const target of corsTargets) {
                    try {
                        const res = await fetch(target.url, { mode: target.mode, cache: 'no-store', headers: target.name === 'Supabase' ? { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ5MTY2ODAsImV4cCI6MjA2MDQ5MjY4MH0.zNHBe-JOyJHIBOOMYBnYi_nAjd3U0iqr6_p0pJqNiYc' } : {} });
                    } catch {
                        issues.push(target.name);
                    }
                }
                if (issues.length > 0) return { status: 'error', detail: `Bloqueio detectado: ${issues.join(', ')}` };
                return { status: 'ok', detail: 'Nenhum bloqueio de CORS/Firewall detectado' };
            } catch (err: any) {
                return { status: 'warning', detail: `Teste inconclusivo: ${err.message}` };
            }
        });

        setTotalTime(Date.now() - Date.now());
        setIsRunning(false);
    }, []);

    useEffect(() => {
        runAllTests();
    }, []);

    useEffect(() => {
        if (!isRunning && startTime > 0 && progress >= tests.length) {
            setTotalTime(Date.now() - startTime);
        }
    }, [isRunning, progress, startTime]);

    const okCount = results.filter(r => r.status === 'ok').length;
    const warnCount = results.filter(r => r.status === 'warning').length;
    const errCount = results.filter(r => r.status === 'error').length;
    const overallStatus = errCount > 0 ? 'error' : warnCount > 0 ? 'warning' : progress >= tests.length ? 'ok' : 'pending';

    const statusIcon = (s: string) => {
        switch (s) {
            case 'ok': return <CheckCircle2 size={16} className="text-emerald-500" />;
            case 'warning': return <AlertTriangle size={16} className="text-amber-500" />;
            case 'error': return <XCircle size={16} className="text-red-500" />;
            default: return <Loader2 size={16} className="text-gray-400 animate-spin" />;
        }
    };

    const handleCopyReport = () => {
        const user = JSON.parse(localStorage.getItem('userData') || '{}');
        const ua = navigator.userAgent;
        const lines = [
            '🔧 DIAGNÓSTICO DO SISTEMA — GRUPO TMSEG',
            `📅 Data: ${new Date().toLocaleString('pt-BR')}`,
            `👤 Usuário: ${user.name || 'N/A'} (${user.role || 'N/A'})`,
            `🌐 Navegador: ${ua.substring(0, 100)}`,
            `📱 Tela: ${window.innerWidth}x${window.innerHeight}`,
            `⏱️ Tempo total: ${(totalTime / 1000).toFixed(1)}s`,
            '',
            `✅ OK: ${okCount} | ⚠️ Alerta: ${warnCount} | ❌ Erro: ${errCount}`,
            '',
            '--- RESULTADOS ---',
            ''
        ];
        results.forEach(r => {
            const icon = r.status === 'ok' ? '✅' : r.status === 'warning' ? '⚠️' : r.status === 'error' ? '❌' : '⏳';
            lines.push(`${icon} ${r.name}: ${r.detail || 'Pendente'}${r.latency ? ` (${r.latency}ms)` : ''}`);
        });
        lines.push('', '— Gerado pelo Sistema TMSEG —');
        navigator.clipboard.writeText(lines.join('\n'));
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
    };

    const categories = ['Rede', 'Servidor', 'Banco de Dados', 'Serviços Externos', 'Cliente', 'Segurança'];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="modal-diagnostics">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95">
                <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0" style={{ background: overallStatus === 'ok' ? 'linear-gradient(135deg, #059669, #047857)' : overallStatus === 'error' ? 'linear-gradient(135deg, #dc2626, #991b1b)' : overallStatus === 'warning' ? 'linear-gradient(135deg, #d97706, #b45309)' : 'linear-gradient(135deg, #1e40af, #1e3a8a)' }}>
                    <div className="flex items-center gap-3 text-white">
                        <div className="p-2 bg-white/20 rounded-xl">
                            {isRunning ? <Loader2 size={22} className="animate-spin" /> : overallStatus === 'ok' ? <CheckCircle2 size={22} /> : overallStatus === 'error' ? <XCircle size={22} /> : <AlertTriangle size={22} />}
                        </div>
                        <div>
                            <h3 className="text-base font-black uppercase tracking-tight">Diagnóstico do Sistema</h3>
                            <p className="text-white/70 text-[10px] font-medium">
                                {isRunning ? `Testando... ${progress}/${tests.length}` : `${okCount} OK · ${warnCount} Alertas · ${errCount} Erros · ${(totalTime / 1000).toFixed(1)}s`}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all" data-testid="button-close-diagnostics"><X size={20} /></button>
                </div>

                {isRunning && (
                    <div className="h-1 bg-gray-100 flex-shrink-0">
                        <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${(progress / tests.length) * 100}%` }} />
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin">
                    {categories.map(cat => {
                        const catResults = results.filter(r => r.category === cat);
                        if (catResults.length === 0) return null;
                        return (
                            <div key={cat}>
                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                    <span className="w-4 h-px bg-gray-200" /> {cat}
                                </h4>
                                <div className="space-y-1.5">
                                    {catResults.map((r, i) => (
                                        <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${r.status === 'ok' ? 'bg-emerald-50/50 border-emerald-100' : r.status === 'error' ? 'bg-red-50/50 border-red-100' : r.status === 'warning' ? 'bg-amber-50/50 border-amber-100' : 'bg-gray-50 border-gray-100'}`} data-testid={`diag-${r.name.toLowerCase().replace(/\s/g, '-')}`}>
                                            <div className="flex-shrink-0">{statusIcon(r.status)}</div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <r.icon size={12} className="text-gray-400 flex-shrink-0" />
                                                    <span className="text-xs font-bold text-gray-800">{r.name}</span>
                                                    {r.latency !== undefined && <span className="text-[9px] font-mono font-bold text-gray-400 ml-auto flex-shrink-0">{r.latency}ms</span>}
                                                </div>
                                                {r.detail && <p className="text-[10px] text-gray-500 mt-0.5 truncate">{r.detail}</p>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="p-4 border-t border-gray-100 flex items-center gap-3 flex-shrink-0 bg-gray-50">
                    <button
                        onClick={runAllTests}
                        disabled={isRunning}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-[11px] font-black uppercase hover:bg-gray-800 transition-all disabled:opacity-50"
                        data-testid="button-rerun-diagnostics"
                    >
                        <RefreshCw size={14} className={isRunning ? 'animate-spin' : ''} /> Executar Novamente
                    </button>
                    <button
                        onClick={handleCopyReport}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase transition-all ${copied ? 'bg-emerald-600 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'}`}
                        data-testid="button-copy-diagnostics"
                    >
                        {copied ? <><CheckCircle2 size={14} /> Copiado!</> : <><Copy size={14} /> Copiar Relatório</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SystemDiagnostics;
