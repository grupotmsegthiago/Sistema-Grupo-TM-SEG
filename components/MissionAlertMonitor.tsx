import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Bell, Clock, MapPin, Phone, Users, X, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Volume2 } from 'lucide-react';

interface MissionAlert {
    id: string;
    missionId: string;
    client: string;
    provider: string;
    origin: string;
    destination: string;
    startTime: string;
    minutesUntilStart: number;
    createdAt: number;
    dismissed: boolean;
    acknowledged: boolean;
    acknowledgedAt?: number;
    acknowledgedBy?: string;
}

const ALERT_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2645/2645-preview.mp3';
const CHECK_INTERVAL = 60_000;
const ALERT_WINDOW_MINUTES = 60;
const REMINDER_AFTER_MINUTES = 30;

const MissionAlertMonitor: React.FC = () => {
    const [alerts, setAlerts] = useState<MissionAlert[]>([]);
    const [minimized, setMinimized] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const lastCheckRef = useRef<number>(0);
    const alertIdsRef = useRef<Set<string>>(new Set());

    const playAlertSound = useCallback(() => {
        if (!soundEnabled) return;
        try {
            if (!audioRef.current) {
                audioRef.current = new Audio(ALERT_SOUND_URL);
                audioRef.current.volume = 0.6;
            }
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => {});
        } catch {}
    }, [soundEnabled]);

    const simulateTestAlert = useCallback(() => {
        const now = new Date();
        const testStart = new Date(now.getTime() + 45 * 60_000);
        const testAlert: MissionAlert = {
            id: `alert-TEST-${Date.now()}`,
            missionId: `GTM-TESTE`,
            client: 'CLIENTE TESTE',
            provider: 'FORNECEDOR TESTE',
            origin: 'SÃO PAULO, SP',
            destination: 'GUARULHOS, SP',
            startTime: testStart.toISOString(),
            minutesUntilStart: 45,
            createdAt: Date.now(),
            dismissed: false,
            acknowledged: false,
        };
        setAlerts(prev => [...prev, testAlert]);
        setMinimized(false);
        playAlertSound();
    }, [playAlertSound]);

    const checkMissions = useCallback(async () => {
        try {
            const now = new Date();
            const inOneHour = new Date(now.getTime() + ALERT_WINDOW_MINUTES * 60_000);

            const { data: missions, error } = await supabase
                .from('missions')
                .select('id, client, provider, origin, destination, start_time, status')
                .in('status', ['Solicitada', 'Agendada', 'Ativa'])
                .gte('start_time', now.toISOString())
                .lte('start_time', inOneHour.toISOString())
                .order('start_time', { ascending: true });

            if (error || !missions) return;

            let hasNewAlerts = false;

            missions.forEach(m => {
                if (!m.start_time) return;
                const startDate = new Date(m.start_time);
                const minutesUntil = Math.round((startDate.getTime() - now.getTime()) / 60_000);

                if (minutesUntil <= ALERT_WINDOW_MINUTES && minutesUntil >= -5) {
                    const alertKey = `alert-${m.id}-${startDate.toISOString().split('T')[0]}`;

                    if (!alertIdsRef.current.has(alertKey)) {
                        alertIdsRef.current.add(alertKey);
                        hasNewAlerts = true;

                        setAlerts(prev => {
                            if (prev.some(a => a.id === alertKey)) return prev;
                            return [...prev, {
                                id: alertKey,
                                missionId: m.id,
                                client: m.client || '—',
                                provider: m.provider || '—',
                                origin: m.origin || '—',
                                destination: m.destination || '—',
                                startTime: m.start_time,
                                minutesUntilStart: minutesUntil,
                                createdAt: Date.now(),
                                dismissed: false,
                                acknowledged: false,
                            }];
                        });
                    }
                }
            });

            setAlerts(prev => prev.map(a => {
                if (a.dismissed) return a;
                const startDate = new Date(a.startTime);
                const newMinutes = Math.round((startDate.getTime() - now.getTime()) / 60_000);
                return { ...a, minutesUntilStart: newMinutes };
            }));

            if (hasNewAlerts) {
                playAlertSound();
                setMinimized(false);
            }
        } catch (e) {
            console.error('[AlertMonitor] Erro:', e);
        }
    }, [playAlertSound]);

    useEffect(() => {
        const timer = setTimeout(() => checkMissions(), 3000);
        const interval = setInterval(checkMissions, CHECK_INTERVAL);
        return () => { clearTimeout(timer); clearInterval(interval); };
    }, [checkMissions]);

    useEffect(() => {
        const interval = setInterval(() => {
            setAlerts(prev => prev.map(a => {
                if (a.acknowledged && !a.dismissed) {
                    const elapsed = (Date.now() - (a.acknowledgedAt || 0)) / 60_000;
                    if (elapsed >= REMINDER_AFTER_MINUTES) {
                        return { ...a, acknowledged: false, acknowledgedAt: undefined, acknowledgedBy: undefined };
                    }
                }
                return a;
            }));
        }, 60_000);
        return () => clearInterval(interval);
    }, []);

    const handleAcknowledge = (alertId: string) => {
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        const userName = userData.name || userData.email || 'Operador';

        setAlerts(prev => prev.map(a =>
            a.id === alertId
                ? { ...a, acknowledged: true, acknowledgedAt: Date.now(), acknowledgedBy: userName }
                : a
        ));

        supabase.from('system_logs').insert({
            entity: 'MissionAlert',
            entity_id: alertId.replace('alert-', ''),
            action_type: 'MISSION_ALERT_ACK',
            user_name: userName,
            details: JSON.stringify({ alertId, action: 'acknowledged', timestamp: new Date().toISOString() })
        }).then(() => {});
    };

    const handleDismiss = (alertId: string) => {
        setAlerts(prev => prev.map(a =>
            a.id === alertId ? { ...a, dismissed: true } : a
        ));
    };

    const activeAlerts = alerts.filter(a => !a.dismissed);

    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
    const userRole = (userData.role || '').toLowerCase();
    const isAdmin = ['administrador', 'diretoria', 'ceo'].includes(userRole) || userData.permissions?.includes('*');

    if (activeAlerts.length === 0) {
        if (!isAdmin) return null;
        return (
            <div className="fixed bottom-4 right-4 z-[45]" data-testid="mission-alert-test">
                <button
                    onClick={simulateTestAlert}
                    className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white font-black text-[10px] py-2.5 px-4 rounded-xl shadow-lg transition-colors uppercase tracking-wider border border-gray-600"
                    data-testid="button-test-alert"
                >
                    <Bell size={14} /> Testar Alerta
                </button>
            </div>
        );
    }

    const urgentCount = activeAlerts.filter(a => a.minutesUntilStart <= 30 && !a.acknowledged).length;
    const unackCount = activeAlerts.filter(a => !a.acknowledged).length;

    const formatTime = (d: string) => {
        try {
            return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        } catch { return d; }
    };

    const getUrgencyColor = (minutes: number, acknowledged: boolean) => {
        if (acknowledged) return 'border-green-300 bg-green-50';
        if (minutes <= 15) return 'border-red-400 bg-red-50 animate-pulse';
        if (minutes <= 30) return 'border-orange-400 bg-orange-50';
        return 'border-amber-300 bg-amber-50';
    };

    return (
        <div className="fixed bottom-4 right-4 z-[45] max-w-[420px] w-full" data-testid="mission-alert-monitor">
            <div className={`rounded-2xl shadow-2xl border-2 overflow-hidden transition-all duration-300 ${urgentCount > 0 ? 'border-red-500' : 'border-amber-400'}`}>
                <button
                    onClick={() => setMinimized(!minimized)}
                    className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${
                        urgentCount > 0
                            ? 'bg-gradient-to-r from-red-600 to-red-700 text-white'
                            : 'bg-gradient-to-r from-amber-500 to-amber-600 text-white'
                    }`}
                    data-testid="button-toggle-alerts"
                >
                    <div className="flex items-center gap-2">
                        <Bell size={18} className={unackCount > 0 ? 'animate-bounce' : ''} />
                        <span className="text-sm font-black uppercase tracking-tight">
                            {activeAlerts.length} Missão{activeAlerts.length > 1 ? 'ões' : ''} Próxima{activeAlerts.length > 1 ? 's' : ''}
                        </span>
                        {unackCount > 0 && (
                            <span className="bg-white/25 text-white text-[9px] font-black px-2 py-0.5 rounded-full">
                                {unackCount} pendente{unackCount > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={e => { e.stopPropagation(); setSoundEnabled(!soundEnabled); }}
                            className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                            data-testid="button-toggle-sound"
                        >
                            <Volume2 size={14} className={soundEnabled ? 'opacity-100' : 'opacity-40'} />
                        </button>
                        {minimized ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                </button>

                {!minimized && (
                    <div className="bg-white max-h-[50vh] overflow-y-auto divide-y divide-gray-100">
                        {activeAlerts
                            .sort((a, b) => a.minutesUntilStart - b.minutesUntilStart)
                            .map(alert => (
                            <div
                                key={alert.id}
                                className={`p-4 border-l-4 transition-all ${getUrgencyColor(alert.minutesUntilStart, alert.acknowledged)}`}
                                data-testid={`alert-${alert.missionId}`}
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        {alert.minutesUntilStart <= 15 && !alert.acknowledged ? (
                                            <AlertTriangle size={16} className="text-red-600 animate-pulse" />
                                        ) : alert.acknowledged ? (
                                            <CheckCircle2 size={16} className="text-green-600" />
                                        ) : (
                                            <Clock size={16} className="text-amber-600" />
                                        )}
                                        <span className="font-black text-sm text-gray-900">{alert.missionId}</span>
                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                                            alert.minutesUntilStart <= 15
                                                ? 'bg-red-600 text-white'
                                                : alert.minutesUntilStart <= 30
                                                    ? 'bg-orange-500 text-white'
                                                    : 'bg-amber-500 text-white'
                                        }`}>
                                            {alert.minutesUntilStart <= 0 ? 'AGORA!' : `${alert.minutesUntilStart} min`}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => handleDismiss(alert.id)}
                                        className="p-1 hover:bg-gray-200 rounded-lg transition-colors text-gray-400"
                                        data-testid={`button-dismiss-${alert.missionId}`}
                                    >
                                        <X size={14} />
                                    </button>
                                </div>

                                <div className="space-y-1 text-[10px] mb-3">
                                    <div className="flex items-center gap-1.5 text-gray-600">
                                        <Users size={11} className="text-blue-500" />
                                        <span className="font-bold">{alert.client}</span>
                                        <span className="text-gray-400">•</span>
                                        <span className="font-bold text-blue-700">{alert.provider}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-gray-600">
                                        <MapPin size={11} className="text-green-500" />
                                        <span className="font-bold truncate max-w-[140px]" title={alert.origin}>{alert.origin}</span>
                                        <span className="text-gray-400">→</span>
                                        <span className="font-bold truncate max-w-[140px]" title={alert.destination}>{alert.destination}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-gray-600">
                                        <Clock size={11} className="text-purple-500" />
                                        <span className="font-bold">Início: {formatTime(alert.startTime)}</span>
                                    </div>
                                </div>

                                {!alert.acknowledged ? (
                                    <div className="space-y-2">
                                        <div className={`rounded-lg p-2 text-[10px] font-bold ${
                                            alert.minutesUntilStart <= 30
                                                ? 'bg-red-100 text-red-800 border border-red-200'
                                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                                        }`}>
                                            <p className="flex items-center gap-1">
                                                <Phone size={10} />
                                                Equipe já está na origem? Já ligou pro motorista?
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleAcknowledge(alert.id)}
                                            className="w-full flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white font-black text-[10px] py-2 rounded-lg transition-colors uppercase tracking-wider"
                                            data-testid={`button-ack-${alert.missionId}`}
                                        >
                                            <CheckCircle2 size={12} />
                                            Sim, Equipe Confirmada
                                        </button>
                                    </div>
                                ) : (
                                    <div className="bg-green-100 border border-green-200 rounded-lg p-2 text-[10px] font-bold text-green-700 flex items-center gap-1.5">
                                        <CheckCircle2 size={12} />
                                        Confirmado por {alert.acknowledgedBy} às {alert.acknowledgedAt ? new Date(alert.acknowledgedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}
                                        <span className="text-[8px] text-green-500 ml-auto">Lembrete em 30min</span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MissionAlertMonitor;
