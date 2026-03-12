import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Bell, Clock, MapPin, Phone, Users, X, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Volume2, Copy, MessageCircle, Timer, XCircle } from 'lucide-react';

interface MissionAlert {
    id: string;
    missionId: string;
    client: string;
    provider: string;
    origin: string;
    destination: string;
    startTime: string;
    driverName: string;
    driverPhone: string;
    minutesUntilStart: number;
    createdAt: number;
    dismissed: boolean;
    acknowledged: boolean;
    acknowledgedAt?: number;
    acknowledgedBy?: string;
    declinedAt?: number;
    reminderAt?: number;
    escalationLevel: number;
    lastEscalationMinutes: number;
}

const ALERT_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2645/2645-preview.mp3';
const CHECK_INTERVAL = 30_000;
const ALERT_WINDOW_MINUTES = 65;
const ESCALATION_THRESHOLDS = [60, 30, 15, 10, 5, 0];

const getEscalationLevel = (minutes: number): number => {
    if (minutes <= 0) return 5;
    if (minutes <= 5) return 4;
    if (minutes <= 10) return 3;
    if (minutes <= 15) return 2;
    if (minutes <= 30) return 1;
    return 0;
};

const getEscalationLabel = (level: number): string => {
    switch (level) {
        case 0: return '1º AVISO — 1 HORA';
        case 1: return '2º AVISO — 30 MIN';
        case 2: return '3º AVISO — 15 MIN';
        case 3: return '4º AVISO — 10 MIN';
        case 4: return '5º AVISO — 5 MIN';
        case 5: return 'ATRASADA!';
        default: return 'ALERTA';
    }
};

const MissionAlertMonitor: React.FC = () => {
    const [alerts, setAlerts] = useState<MissionAlert[]>([]);
    const [minimized, setMinimized] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const alertIdsRef = useRef<Set<string>>(new Set());
    const lastEscalationRef = useRef<Map<string, number>>(new Map());

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
        const testStart = new Date(now.getTime() + 55 * 60_000);
        const testAlert: MissionAlert = {
            id: `alert-TEST-${Date.now()}`,
            missionId: 'GTM-TESTE',
            client: 'CEVA LOGISTICA',
            provider: 'USE SEGURANCA PRIVADA LTDA',
            origin: 'SÃO PAULO, SP',
            destination: 'GUARULHOS, SP',
            startTime: testStart.toISOString(),
            driverName: 'CARLOS EDUARDO SILVA',
            driverPhone: '11999887766',
            minutesUntilStart: 55,
            createdAt: Date.now(),
            dismissed: false,
            acknowledged: false,
            escalationLevel: 0,
            lastEscalationMinutes: 60,
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
                .select('id, client, provider, origin, destination, start_time, status, driver_name, driver_phone')
                .in('status', ['Solicitada', 'Agendada', 'Ativa'])
                .gte('start_time', new Date(now.getTime() - 30 * 60_000).toISOString())
                .lte('start_time', inOneHour.toISOString())
                .order('start_time', { ascending: true });

            if (error || !missions) return;

            let hasNewAlerts = false;

            missions.forEach(m => {
                if (!m.start_time) return;
                const startDate = new Date(m.start_time);
                const minutesUntil = Math.round((startDate.getTime() - now.getTime()) / 60_000);

                if (minutesUntil <= ALERT_WINDOW_MINUTES && minutesUntil >= -30) {
                    const alertKey = `alert-${m.id}-${startDate.toISOString().split('T')[0]}`;

                    if (!alertIdsRef.current.has(alertKey)) {
                        alertIdsRef.current.add(alertKey);
                        hasNewAlerts = true;
                        const level = getEscalationLevel(minutesUntil);

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
                                driverName: m.driver_name || '',
                                driverPhone: m.driver_phone || '',
                                minutesUntilStart: minutesUntil,
                                createdAt: Date.now(),
                                dismissed: false,
                                acknowledged: false,
                                escalationLevel: level,
                                lastEscalationMinutes: minutesUntil,
                            }];
                        });
                    }
                }
            });

            setAlerts(prev => prev.map(a => {
                if (a.dismissed) return a;
                const startDate = new Date(a.startTime);
                const newMinutes = Math.round((startDate.getTime() - now.getTime()) / 60_000);
                const newLevel = getEscalationLevel(newMinutes);
                const prevLevel = lastEscalationRef.current.get(a.id) ?? a.escalationLevel;

                if (newLevel > prevLevel && !a.acknowledged) {
                    lastEscalationRef.current.set(a.id, newLevel);
                    hasNewAlerts = true;

                    if (a.declinedAt) {
                        return { ...a, minutesUntilStart: newMinutes, escalationLevel: newLevel, acknowledged: false, declinedAt: undefined, reminderAt: undefined };
                    }
                }

                return { ...a, minutesUntilStart: newMinutes, escalationLevel: newLevel };
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
            const now = Date.now();
            setAlerts(prev => prev.map(a => {
                if (a.declinedAt && a.reminderAt && !a.dismissed && now >= a.reminderAt) {
                    return { ...a, declinedAt: undefined, reminderAt: undefined, acknowledged: false };
                }
                return a;
            }));
        }, 30_000);
        return () => clearInterval(interval);
    }, []);

    const handleAcknowledge = (alertId: string) => {
        const ud = JSON.parse(localStorage.getItem('userData') || '{}');
        const userName = ud.name || ud.email || 'Operador';

        setAlerts(prev => prev.map(a =>
            a.id === alertId
                ? { ...a, acknowledged: true, acknowledgedAt: Date.now(), acknowledgedBy: userName, declinedAt: undefined, reminderAt: undefined }
                : a
        ));

        supabase.from('system_logs').insert({
            entity: 'MissionAlert',
            entity_id: alertId.replace('alert-', '').split('-2')[0],
            action_type: 'MISSION_ALERT_ACK',
            user_name: userName,
            details: JSON.stringify({ alertId, action: 'confirmed', timestamp: new Date().toISOString() })
        }).then(() => {});
    };

    const handleDecline = (alertId: string) => {
        const now = Date.now();
        const alert = alerts.find(a => a.id === alertId);
        const nextThreshold = ESCALATION_THRESHOLDS.find(t => t < (alert?.minutesUntilStart ?? 60));
        const reminderMinutes = nextThreshold !== undefined
            ? Math.max(2, (alert?.minutesUntilStart ?? 0) - nextThreshold)
            : 5;

        setAlerts(prev => prev.map(a =>
            a.id === alertId
                ? { ...a, declinedAt: now, reminderAt: now + reminderMinutes * 60_000 }
                : a
        ));

        const ud = JSON.parse(localStorage.getItem('userData') || '{}');
        supabase.from('system_logs').insert({
            entity: 'MissionAlert',
            entity_id: alertId.replace('alert-', '').split('-2')[0],
            action_type: 'MISSION_ALERT_DECLINED',
            user_name: ud.name || ud.email || 'Operador',
            details: JSON.stringify({ alertId, action: 'declined', reminderInMinutes: reminderMinutes, timestamp: new Date().toISOString() })
        }).then(() => {});
    };

    const handleDismiss = (alertId: string) => {
        setAlerts(prev => prev.map(a =>
            a.id === alertId ? { ...a, dismissed: true } : a
        ));
    };

    const generateWhatsAppText = (alert: MissionAlert) => {
        const startFormatted = (() => {
            try { return new Date(alert.startTime).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return alert.startTime; }
        })();
        return `🚨 *ATENÇÃO — MISSÃO PRÓXIMA DE INICIAR*

📋 *OS:* ${alert.missionId}
👤 *Cliente:* ${alert.client}
🏢 *Fornecedor:* ${alert.provider}

📍 *Origem:* ${alert.origin}
📍 *Destino:* ${alert.destination}
🕐 *Início:* ${startFormatted}

🚗 *Motorista:* ${alert.driverName || 'Não informado'}
📞 *Telefone:* ${alert.driverPhone ? formatPhone(alert.driverPhone) : 'Não informado'}

⚠️ *Equipe, favor entrar em contato com o motorista para alinhar o ponto de encontro.*`;
    };

    const formatPhone = (phone: string) => {
        const clean = phone.replace(/\D/g, '');
        if (clean.length === 11) return `(${clean.slice(0,2)}) ${clean.slice(2,7)}-${clean.slice(7)}`;
        if (clean.length === 10) return `(${clean.slice(0,2)}) ${clean.slice(2,6)}-${clean.slice(6)}`;
        return phone;
    };

    const handleCopyContact = async (alert: MissionAlert) => {
        const text = generateWhatsAppText(alert);
        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(alert.id);
            setTimeout(() => setCopiedId(null), 3000);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setCopiedId(alert.id);
            setTimeout(() => setCopiedId(null), 3000);
        }
    };

    const handleWhatsAppDirect = (alert: MissionAlert) => {
        if (!alert.driverPhone) return;
        const phone = alert.driverPhone.replace(/\D/g, '');
        const fullPhone = phone.startsWith('55') ? phone : `55${phone}`;
        const text = encodeURIComponent(`Olá ${alert.driverName || 'Motorista'}, tudo bem? Sou da equipe de escolta referente à OS ${alert.missionId}. Precisamos alinhar o ponto de encontro para a missão com início previsto. Podemos conversar?`);
        window.open(`https://wa.me/${fullPhone}?text=${text}`, '_blank');
    };

    const activeAlerts = alerts.filter(a => !a.dismissed);

    const ud2 = JSON.parse(localStorage.getItem('userData') || '{}');
    const userRole2 = (ud2.role || '').toLowerCase();
    const isAdmin = ['administrador', 'diretoria', 'ceo'].includes(userRole2) || ud2.permissions?.includes('*');

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

    const lateCount = activeAlerts.filter(a => a.minutesUntilStart <= 0 && !a.acknowledged).length;
    const urgentCount = activeAlerts.filter(a => a.minutesUntilStart <= 15 && !a.acknowledged).length;
    const unackCount = activeAlerts.filter(a => !a.acknowledged && !a.declinedAt).length;

    const formatTime = (d: string) => {
        try { return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return d; }
    };

    const getAlertStyle = (alert: MissionAlert) => {
        if (alert.minutesUntilStart <= 0 && !alert.acknowledged) return 'border-l-red-700 bg-red-100 ring-2 ring-red-400 ring-inset';
        if (alert.acknowledged) return 'border-l-green-500 bg-green-50';
        if (alert.declinedAt) return 'border-l-gray-400 bg-gray-50';
        if (alert.minutesUntilStart <= 5) return 'border-l-red-600 bg-red-50 animate-pulse';
        if (alert.minutesUntilStart <= 10) return 'border-l-red-500 bg-red-50';
        if (alert.minutesUntilStart <= 15) return 'border-l-orange-500 bg-orange-50';
        if (alert.minutesUntilStart <= 30) return 'border-l-amber-500 bg-amber-50';
        return 'border-l-yellow-400 bg-yellow-50';
    };

    const getHeaderStyle = () => {
        if (lateCount > 0) return 'bg-gradient-to-r from-red-700 to-red-900 text-white';
        if (urgentCount > 0) return 'bg-gradient-to-r from-red-600 to-red-700 text-white';
        return 'bg-gradient-to-r from-amber-500 to-amber-600 text-white';
    };

    return (
        <div className="fixed bottom-4 right-4 z-[45] max-w-[440px] w-full" data-testid="mission-alert-monitor">
            <div className={`rounded-2xl shadow-2xl border-2 overflow-hidden transition-all duration-300 ${lateCount > 0 ? 'border-red-600' : urgentCount > 0 ? 'border-red-500' : 'border-amber-400'}`}>
                <div className={`w-full flex items-center justify-between px-4 py-3 transition-colors cursor-pointer ${getHeaderStyle()}`} onClick={() => setMinimized(!minimized)} data-testid="button-toggle-alerts">
                    <div className="flex items-center gap-2">
                        <Bell size={18} className={unackCount > 0 ? 'animate-bounce' : ''} />
                        <span className="text-sm font-black uppercase tracking-tight">
                            {activeAlerts.length} Alerta{activeAlerts.length > 1 ? 's' : ''}
                        </span>
                        {lateCount > 0 && (
                            <span className="bg-white text-red-700 text-[9px] font-black px-2 py-0.5 rounded-full animate-pulse">
                                {lateCount} ATRASADA{lateCount > 1 ? 'S' : ''}
                            </span>
                        )}
                        {unackCount > 0 && lateCount === 0 && (
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
                </div>

                {!minimized && (
                    <div className="bg-white max-h-[55vh] overflow-y-auto divide-y divide-gray-100">
                        {activeAlerts
                            .sort((a, b) => a.minutesUntilStart - b.minutesUntilStart)
                            .map(alert => {
                                const isLate = alert.minutesUntilStart <= 0 && !alert.acknowledged;
                                const isWaiting = Boolean(alert.declinedAt && !alert.acknowledged);
                                const remainingReminder = alert.reminderAt ? Math.max(0, Math.ceil((alert.reminderAt - Date.now()) / 60_000)) : 0;

                                return (
                                    <div
                                        key={alert.id}
                                        className={`p-4 border-l-4 transition-all ${getAlertStyle(alert)} ${isLate ? 'shadow-inner' : ''}`}
                                        data-testid={`alert-${alert.missionId}`}
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {isLate ? (
                                                    <AlertTriangle size={16} className="text-red-700 animate-pulse" />
                                                ) : alert.acknowledged ? (
                                                    <CheckCircle2 size={16} className="text-green-600" />
                                                ) : isWaiting ? (
                                                    <Timer size={16} className="text-gray-500" />
                                                ) : alert.minutesUntilStart <= 15 ? (
                                                    <AlertTriangle size={16} className="text-red-600 animate-pulse" />
                                                ) : (
                                                    <Clock size={16} className="text-amber-600" />
                                                )}
                                                <span className={`font-black text-sm ${isLate ? 'text-red-800' : 'text-gray-900'}`}>{alert.missionId}</span>
                                                <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                                    isLate ? 'bg-red-700 text-white animate-pulse'
                                                    : alert.minutesUntilStart <= 5 ? 'bg-red-600 text-white'
                                                    : alert.minutesUntilStart <= 10 ? 'bg-red-500 text-white'
                                                    : alert.minutesUntilStart <= 15 ? 'bg-orange-500 text-white'
                                                    : alert.minutesUntilStart <= 30 ? 'bg-amber-500 text-white'
                                                    : 'bg-yellow-500 text-white'
                                                }`}>
                                                    {getEscalationLabel(alert.escalationLevel)}
                                                </span>
                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                                                    isLate ? 'bg-red-200 text-red-800' : 'bg-gray-200 text-gray-700'
                                                }`}>
                                                    {alert.minutesUntilStart <= 0 ? `${Math.abs(alert.minutesUntilStart)} min atrás` : `${alert.minutesUntilStart} min`}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => handleDismiss(alert.id)}
                                                className="p-1 hover:bg-gray-200 rounded-lg transition-colors text-gray-400 flex-shrink-0"
                                                data-testid={`button-dismiss-${alert.missionId}`}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>

                                        <div className="space-y-1 text-[10px] mb-3">
                                            <div className="flex items-center gap-1.5 text-gray-600">
                                                <Users size={11} className="text-blue-500 flex-shrink-0" />
                                                <span className="font-bold truncate">{alert.client}</span>
                                                <span className="text-gray-400">•</span>
                                                <span className="font-bold text-blue-700 truncate">{alert.provider}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-gray-600">
                                                <MapPin size={11} className="text-green-500 flex-shrink-0" />
                                                <span className="font-bold truncate max-w-[140px]" title={alert.origin}>{alert.origin}</span>
                                                <span className="text-gray-400">→</span>
                                                <span className="font-bold truncate max-w-[140px]" title={alert.destination}>{alert.destination}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-gray-600">
                                                <Clock size={11} className="text-purple-500 flex-shrink-0" />
                                                <span className="font-bold">Início: {formatTime(alert.startTime)}</span>
                                            </div>
                                            {alert.driverName && (
                                                <div className="flex items-center gap-1.5 text-gray-700">
                                                    <Phone size={11} className="text-teal-500 flex-shrink-0" />
                                                    <span className="font-black">{alert.driverName}</span>
                                                    {alert.driverPhone && <span className="font-mono text-gray-500">{formatPhone(alert.driverPhone)}</span>}
                                                </div>
                                            )}
                                        </div>

                                        {isLate && (
                                            <div className="bg-red-200 border border-red-400 rounded-lg p-2.5 mb-3 animate-pulse">
                                                <p className="text-[10px] font-black text-red-900 uppercase flex items-center gap-1">
                                                    <AlertTriangle size={12} />
                                                    MISSÃO ATRASADA SEM CONFIRMAÇÃO!
                                                </p>
                                                <p className="text-[9px] font-bold text-red-800 mt-1">
                                                    Equipe não confirmou presença na origem. Entrar em contato imediatamente.
                                                </p>
                                            </div>
                                        )}

                                        {!alert.acknowledged && !isWaiting && (
                                            <div className="space-y-2">
                                                <div className={`rounded-lg p-2.5 text-[10px] font-bold ${
                                                    isLate ? 'bg-red-100 text-red-900 border border-red-300'
                                                    : alert.minutesUntilStart <= 15 ? 'bg-red-100 text-red-800 border border-red-200'
                                                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                                                }`}>
                                                    <p className="flex items-center gap-1 font-black">
                                                        <Phone size={10} />
                                                        Equipe já está na origem? Já ligou pro motorista?
                                                    </p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleAcknowledge(alert.id)}
                                                        className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white font-black text-[10px] py-2.5 rounded-lg transition-colors uppercase tracking-wider"
                                                        data-testid={`button-ack-${alert.missionId}`}
                                                    >
                                                        <CheckCircle2 size={12} /> Sim
                                                    </button>
                                                    <button
                                                        onClick={() => handleDecline(alert.id)}
                                                        className="flex-1 flex items-center justify-center gap-1.5 bg-red-500 hover:bg-red-600 text-white font-black text-[10px] py-2.5 rounded-lg transition-colors uppercase tracking-wider"
                                                        data-testid={`button-decline-${alert.missionId}`}
                                                    >
                                                        <XCircle size={12} /> Não
                                                    </button>
                                                </div>

                                                <button
                                                    onClick={() => handleCopyContact(alert)}
                                                    className={`w-full flex items-center justify-center gap-1.5 font-black text-[10px] py-2 rounded-lg transition-colors uppercase tracking-wider border ${
                                                        copiedId === alert.id
                                                            ? 'bg-green-100 text-green-700 border-green-300'
                                                            : 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100'
                                                    }`}
                                                    data-testid={`button-contact-${alert.missionId}`}
                                                >
                                                    {copiedId === alert.id ? (
                                                        <><CheckCircle2 size={12} /> Copiado para WhatsApp!</>
                                                    ) : (
                                                        <><MessageCircle size={12} /> Entre em Contato</>
                                                    )}
                                                </button>

                                                {alert.driverPhone && (
                                                    <button
                                                        onClick={() => handleWhatsAppDirect(alert)}
                                                        className="w-full flex items-center justify-center gap-1.5 bg-green-50 text-green-700 border border-green-300 hover:bg-green-100 font-black text-[10px] py-2 rounded-lg transition-colors uppercase tracking-wider"
                                                        data-testid={`button-whatsapp-${alert.missionId}`}
                                                    >
                                                        <Phone size={12} /> WhatsApp Motorista ({formatPhone(alert.driverPhone)})
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {isWaiting && (
                                            <div className="space-y-2">
                                                <div className="bg-gray-100 border border-gray-300 rounded-lg p-2.5 text-[10px] font-bold text-gray-700 flex items-center gap-1.5">
                                                    <Timer size={12} className="text-gray-500" />
                                                    Lembrete em {remainingReminder > 0 ? `${remainingReminder} min` : 'breve'}...
                                                    <span className="text-[8px] text-gray-400 ml-auto">próximo aviso automático</span>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleCopyContact(alert)}
                                                        className={`flex-1 flex items-center justify-center gap-1.5 font-black text-[10px] py-2 rounded-lg transition-colors uppercase tracking-wider border ${
                                                            copiedId === alert.id
                                                                ? 'bg-green-100 text-green-700 border-green-300'
                                                                : 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100'
                                                        }`}
                                                        data-testid={`button-contact-waiting-${alert.missionId}`}
                                                    >
                                                        {copiedId === alert.id ? <><CheckCircle2 size={12} /> Copiado!</> : <><MessageCircle size={12} /> Entre em Contato</>}
                                                    </button>
                                                    <button
                                                        onClick={() => handleAcknowledge(alert.id)}
                                                        className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white font-black text-[10px] py-2 rounded-lg transition-colors uppercase"
                                                        data-testid={`button-ack-waiting-${alert.missionId}`}
                                                    >
                                                        <CheckCircle2 size={12} /> Confirmar Agora
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {alert.acknowledged && (
                                            <div className="bg-green-100 border border-green-200 rounded-lg p-2.5 text-[10px] font-bold text-green-700 flex items-center gap-1.5">
                                                <CheckCircle2 size={12} />
                                                <span>Confirmado por <span className="font-black">{alert.acknowledgedBy}</span> às {alert.acknowledgedAt ? new Date(alert.acknowledgedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MissionAlertMonitor;
