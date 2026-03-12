import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Bell, Clock, MapPin, Phone, Users, X, AlertTriangle, CheckCircle2, ChevronRight, ChevronLeft, Volume2, MessageCircle, Timer, XCircle, Maximize2, Minimize2, Shield } from 'lucide-react';

interface MissionAlert {
    id: string;
    missionId: string;
    client: string;
    provider: string;
    providerContactName: string;
    providerPhone: string;
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
        case 0: return '1º AVISO — 1H';
        case 1: return '2º AVISO — 30MIN';
        case 2: return '3º AVISO — 15MIN';
        case 3: return '4º AVISO — 10MIN';
        case 4: return '5º AVISO — 5MIN';
        case 5: return 'ATRASADA!';
        default: return 'ALERTA';
    }
};

const formatPhone = (phone: string) => {
    const clean = phone.replace(/\D/g, '');
    if (clean.length === 11) return `(${clean.slice(0,2)}) ${clean.slice(2,7)}-${clean.slice(7)}`;
    if (clean.length === 10) return `(${clean.slice(0,2)}) ${clean.slice(2,6)}-${clean.slice(6)}`;
    return phone;
};

const formatTime = (d: string) => {
    try { return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return d; }
};

const MissionAlertMonitor: React.FC = () => {
    const [alerts, setAlerts] = useState<MissionAlert[]>([]);
    const [expanded, setExpanded] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [selectedAlert, setSelectedAlert] = useState<string | null>(null);
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
            providerContactName: 'JOÃO CARLOS',
            providerPhone: '11988776655',
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
        setExpanded(true);
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

            const providerNames = [...new Set(missions.map(m => m.provider).filter(Boolean))];
            let providerMap: Record<string, { contact_name: string; phone: string }> = {};
            if (providerNames.length > 0) {
                const { data: providers } = await supabase
                    .from('providers')
                    .select('name, contact_name, phone')
                    .in('name', providerNames);
                if (providers) {
                    providers.forEach(p => {
                        providerMap[p.name] = { contact_name: p.contact_name || '', phone: p.phone || '' };
                    });
                }
            }

            let hasNewAlerts = false;

            missions.forEach(m => {
                if (!m.start_time) return;
                const startDate = new Date(m.start_time);
                const minutesUntil = Math.round((startDate.getTime() - now.getTime()) / 60_000);

                if (minutesUntil <= ALERT_WINDOW_MINUTES && minutesUntil >= -30) {
                    const alertKey = `alert-${m.id}-${startDate.toISOString().split('T')[0]}`;
                    const pInfo = providerMap[m.provider] || { contact_name: '', phone: '' };

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
                                providerContactName: pInfo.contact_name,
                                providerPhone: pInfo.phone,
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
                setExpanded(true);
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
        if (selectedAlert === alertId) setSelectedAlert(null);
    };

    const generateWhatsAppText = (alert: MissionAlert) => {
        const startFormatted = (() => {
            try { return new Date(alert.startTime).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return alert.startTime; }
        })();
        return `🚨 *ATENÇÃO — MISSÃO PRÓXIMA DE INICIAR*\n\n📋 *OS:* ${alert.missionId}\n🏢 *Fornecedor:* ${alert.provider}\n${alert.providerContactName ? `👷 *Contato:* ${alert.providerContactName}\n` : ''}📞 *Telefone Fornecedor:* ${alert.providerPhone ? formatPhone(alert.providerPhone) : 'Não informado'}\n\n📍 *Origem:* ${alert.origin}\n📍 *Destino:* ${alert.destination}\n🕐 *Início:* ${startFormatted}\n\n🚗 *Motorista:* ${alert.driverName || 'Não informado'}\n📞 *Tel Motorista:* ${alert.driverPhone ? formatPhone(alert.driverPhone) : 'Não informado'}\n\n⚠️ *Equipe, favor entrar em contato com o motorista para alinhar o ponto de encontro.*`;
    };

    const handleCopyContact = async (alert: MissionAlert) => {
        const text = generateWhatsAppText(alert);
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        setCopiedId(alert.id);
        setTimeout(() => setCopiedId(null), 3000);
    };

    const handleWhatsAppDirect = (alert: MissionAlert) => {
        if (!alert.providerPhone) return;
        const phone = alert.providerPhone.replace(/\D/g, '');
        const fullPhone = phone.startsWith('55') ? phone : `55${phone}`;
        const contactName = alert.providerContactName || alert.provider;
        const text = encodeURIComponent(`Olá ${contactName}, tudo bem? Sou da equipe TMSEG referente à OS ${alert.missionId}.\n\nCliente: ${alert.client}\nOrigem: ${alert.origin}\nDestino: ${alert.destination}\n\nFavor entrar em contato com o motorista ${alert.driverName || ''} ${alert.driverPhone ? '(' + formatPhone(alert.driverPhone) + ')' : ''} para alinhar o ponto de encontro. Podemos confirmar?`);
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
                <button onClick={simulateTestAlert} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white font-black text-[10px] py-2.5 px-4 rounded-xl shadow-lg transition-colors uppercase tracking-wider border border-gray-600" data-testid="button-test-alert">
                    <Bell size={14} /> Testar Alerta
                </button>
            </div>
        );
    }

    const lateCount = activeAlerts.filter(a => a.minutesUntilStart <= 0 && !a.acknowledged).length;
    const urgentCount = activeAlerts.filter(a => a.minutesUntilStart <= 15 && !a.acknowledged).length;
    const unackCount = activeAlerts.filter(a => !a.acknowledged && !a.declinedAt).length;
    const confirmedCount = activeAlerts.filter(a => a.acknowledged).length;
    const sorted = [...activeAlerts].sort((a, b) => a.minutesUntilStart - b.minutesUntilStart);
    const detail = selectedAlert ? activeAlerts.find(a => a.id === selectedAlert) : null;

    const getBadgeColor = (a: MissionAlert) => {
        if (a.minutesUntilStart <= 0 && !a.acknowledged) return 'bg-red-600 text-white animate-pulse';
        if (a.acknowledged) return 'bg-green-600 text-white';
        if (a.declinedAt) return 'bg-gray-400 text-white';
        if (a.minutesUntilStart <= 5) return 'bg-red-500 text-white animate-pulse';
        if (a.minutesUntilStart <= 10) return 'bg-red-500 text-white';
        if (a.minutesUntilStart <= 15) return 'bg-orange-500 text-white';
        if (a.minutesUntilStart <= 30) return 'bg-amber-500 text-white';
        return 'bg-yellow-500 text-white';
    };

    const getRowBg = (a: MissionAlert) => {
        if (a.minutesUntilStart <= 0 && !a.acknowledged) return 'bg-red-100 hover:bg-red-200 border-l-4 border-l-red-600';
        if (a.acknowledged) return 'bg-green-50 hover:bg-green-100 border-l-4 border-l-green-500';
        if (a.declinedAt) return 'bg-gray-50 hover:bg-gray-100 border-l-4 border-l-gray-400';
        if (a.minutesUntilStart <= 10) return 'bg-red-50 hover:bg-red-100 border-l-4 border-l-red-500';
        if (a.minutesUntilStart <= 30) return 'bg-amber-50 hover:bg-amber-100 border-l-4 border-l-amber-500';
        return 'bg-yellow-50 hover:bg-yellow-100 border-l-4 border-l-yellow-400';
    };

    if (!expanded) {
        return (
            <div className="fixed bottom-4 right-4 z-[45]" data-testid="mission-alert-monitor-mini">
                <div
                    onClick={() => setExpanded(true)}
                    className={`cursor-pointer rounded-2xl shadow-2xl border-2 px-4 py-3 flex items-center gap-3 transition-all hover:scale-105 ${
                        lateCount > 0 ? 'bg-red-700 border-red-500 animate-pulse' : urgentCount > 0 ? 'bg-red-600 border-red-400' : 'bg-amber-500 border-amber-400'
                    } text-white`}
                    data-testid="button-expand-alerts"
                >
                    <div className="relative">
                        <Bell size={22} className={unackCount > 0 ? 'animate-bounce' : ''} />
                        {unackCount > 0 && (
                            <span className="absolute -top-2 -right-2 bg-white text-red-700 text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-lg">
                                {unackCount}
                            </span>
                        )}
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-tight leading-none">
                            {activeAlerts.length} Missão{activeAlerts.length > 1 ? 'ões' : ''} Próxima{activeAlerts.length > 1 ? 's' : ''}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                            {lateCount > 0 && <span className="text-[8px] font-black bg-white/30 px-1.5 py-0.5 rounded">{lateCount} ATRASADA{lateCount > 1 ? 'S' : ''}</span>}
                            {confirmedCount > 0 && <span className="text-[8px] font-black bg-green-400/40 px-1.5 py-0.5 rounded">{confirmedCount} OK</span>}
                            <span className="text-[8px] font-bold opacity-70">toque para expandir</span>
                        </div>
                    </div>
                    <Maximize2 size={16} className="flex-shrink-0 opacity-70" />
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[46] flex items-end justify-end p-4 pointer-events-none" data-testid="mission-alert-monitor">
            <div className={`pointer-events-auto rounded-2xl shadow-2xl border-2 overflow-hidden transition-all duration-300 flex flex-col ${
                lateCount > 0 ? 'border-red-600' : urgentCount > 0 ? 'border-red-400' : 'border-amber-400'
            }`} style={{ width: '460px', maxHeight: 'calc(100vh - 100px)' }}>

                <div className={`flex items-center justify-between px-4 py-3 flex-shrink-0 ${
                    lateCount > 0 ? 'bg-gradient-to-r from-red-700 to-red-900 text-white' : urgentCount > 0 ? 'bg-gradient-to-r from-red-600 to-red-700 text-white' : 'bg-gradient-to-r from-amber-500 to-amber-600 text-white'
                }`}>
                    <div className="flex items-center gap-2">
                        <Shield size={18} />
                        <span className="text-sm font-black uppercase tracking-tight">Central de Alertas</span>
                        <span className="bg-white/20 text-[9px] font-black px-2 py-0.5 rounded-full">{activeAlerts.length}</span>
                        {lateCount > 0 && <span className="bg-white text-red-700 text-[8px] font-black px-2 py-0.5 rounded-full animate-pulse">{lateCount} ATRASADA{lateCount > 1 ? 'S' : ''}</span>}
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={e => { e.stopPropagation(); setSoundEnabled(!soundEnabled); }} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors" data-testid="button-toggle-sound">
                            <Volume2 size={14} className={soundEnabled ? 'opacity-100' : 'opacity-40'} />
                        </button>
                        <button onClick={() => { setExpanded(false); setSelectedAlert(null); }} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors" data-testid="button-minimize-alerts">
                            <Minimize2 size={14} />
                        </button>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden bg-white">

                    <div className={`overflow-y-auto divide-y divide-gray-100 flex-shrink-0 ${detail ? 'w-[180px] border-r border-gray-200' : 'w-full'}`}>
                        {sorted.map(a => {
                            const isLate = a.minutesUntilStart <= 0 && !a.acknowledged;
                            const isSelected = selectedAlert === a.id;
                            return (
                                <div
                                    key={a.id}
                                    onClick={() => setSelectedAlert(isSelected ? null : a.id)}
                                    className={`px-3 py-2.5 cursor-pointer transition-all ${getRowBg(a)} ${isSelected ? 'ring-2 ring-inset ring-blue-500' : ''}`}
                                    data-testid={`alert-row-${a.missionId}`}
                                >
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <span className={`font-black text-xs ${isLate ? 'text-red-800' : 'text-gray-900'}`}>{a.missionId}</span>
                                        <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-full whitespace-nowrap ${getBadgeColor(a)}`}>
                                            {a.minutesUntilStart <= 0 ? `${Math.abs(a.minutesUntilStart)}m atrás` : `${a.minutesUntilStart}min`}
                                        </span>
                                    </div>

                                    {!detail && (
                                        <>
                                            <div className="flex items-center gap-1 mb-1">
                                                <span className="text-[9px] font-black text-blue-800 truncate">{a.client}</span>
                                                <span className="text-[8px] text-gray-400">|</span>
                                                <span className="text-[9px] font-bold text-gray-600 truncate">{a.provider}</span>
                                            </div>
                                            <div className="flex items-center gap-1 text-[8px] text-gray-500">
                                                <MapPin size={9} className="flex-shrink-0" />
                                                <span className="truncate">{a.origin}</span>
                                                <span>→</span>
                                                <span className="truncate">{a.destination}</span>
                                            </div>
                                        </>
                                    )}

                                    {detail && (
                                        <div className="text-[8px] font-bold text-gray-600 truncate">{a.client}</div>
                                    )}

                                    {!detail && !a.acknowledged && !a.declinedAt && (
                                        <div className="space-y-1.5 mt-2">
                                            <div className="flex gap-1.5">
                                                <button onClick={e => { e.stopPropagation(); handleAcknowledge(a.id); }} className="flex-1 flex items-center justify-center gap-1 bg-green-600 hover:bg-green-700 text-white font-black text-[8px] py-1.5 rounded-md transition-colors uppercase" data-testid={`button-ack-${a.missionId}`}>
                                                    <CheckCircle2 size={10} /> Sim
                                                </button>
                                                <button onClick={e => { e.stopPropagation(); handleDecline(a.id); }} className="flex-1 flex items-center justify-center gap-1 bg-red-500 hover:bg-red-600 text-white font-black text-[8px] py-1.5 rounded-md transition-colors uppercase" data-testid={`button-decline-${a.missionId}`}>
                                                    <XCircle size={10} /> Não
                                                </button>
                                            </div>
                                            <button
                                                onClick={e => { e.stopPropagation(); handleCopyContact(a); }}
                                                className={`w-full flex items-center justify-center gap-1.5 font-black text-[8px] py-1.5 rounded-md transition-colors uppercase border ${
                                                    copiedId === a.id ? 'bg-green-100 text-green-700 border-green-300' : 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                                }`}
                                                data-testid={`button-contact-row-${a.missionId}`}
                                            >
                                                {copiedId === a.id ? <><CheckCircle2 size={10} /> Copiado!</> : <><MessageCircle size={10} /> Entre em Contato</>}
                                            </button>
                                            {a.providerPhone && (
                                                <button
                                                    onClick={e => { e.stopPropagation(); handleWhatsAppDirect(a); }}
                                                    className="w-full flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-600 text-white font-black text-[8px] py-1.5 rounded-md transition-colors uppercase"
                                                    data-testid={`button-whatsapp-row-${a.missionId}`}
                                                >
                                                    <Phone size={10} /> WhatsApp Fornecedor
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {!detail && a.acknowledged && (
                                        <div className="mt-1.5 text-[8px] font-bold text-green-700 flex items-center gap-1">
                                            <CheckCircle2 size={9} /> {a.acknowledgedBy} {a.acknowledgedAt ? new Date(a.acknowledgedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                                        </div>
                                    )}

                                    {!detail && a.declinedAt && !a.acknowledged && (
                                        <div className="space-y-1.5 mt-2">
                                            <div className="text-[8px] font-bold text-gray-500 flex items-center gap-1">
                                                <Timer size={9} /> Lembrete automático...
                                            </div>
                                            <button
                                                onClick={e => { e.stopPropagation(); handleCopyContact(a); }}
                                                className={`w-full flex items-center justify-center gap-1.5 font-black text-[8px] py-1.5 rounded-md transition-colors uppercase border ${
                                                    copiedId === a.id ? 'bg-green-100 text-green-700 border-green-300' : 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                                }`}
                                                data-testid={`button-contact-waiting-row-${a.missionId}`}
                                            >
                                                {copiedId === a.id ? <><CheckCircle2 size={10} /> Copiado!</> : <><MessageCircle size={10} /> Entre em Contato</>}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {detail && (
                        <div className="flex-1 overflow-y-auto p-4" data-testid={`alert-detail-${detail.missionId}`}>
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    {detail.minutesUntilStart <= 0 && !detail.acknowledged ? (
                                        <AlertTriangle size={20} className="text-red-700 animate-pulse" />
                                    ) : detail.acknowledged ? (
                                        <CheckCircle2 size={20} className="text-green-600" />
                                    ) : (
                                        <Clock size={20} className="text-amber-600" />
                                    )}
                                    <span className="text-lg font-black text-gray-900">{detail.missionId}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className={`text-[8px] font-black px-2 py-1 rounded-full uppercase ${getBadgeColor(detail)}`}>
                                        {getEscalationLabel(detail.escalationLevel)}
                                    </span>
                                    <button onClick={() => handleDismiss(detail.id)} className="p-1 hover:bg-gray-200 rounded-lg text-gray-400" data-testid={`button-dismiss-${detail.missionId}`}>
                                        <X size={14} />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2 mb-4">
                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                                    <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-1">Cliente</p>
                                    <p className="text-sm font-black text-blue-900 leading-tight">{detail.client}</p>
                                </div>
                                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
                                    <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-1">Fornecedor</p>
                                    <p className="text-sm font-black text-indigo-900 leading-tight">{detail.provider}</p>
                                </div>
                            </div>

                            <div className="space-y-2 text-[11px] mb-4">
                                <div className="flex items-start gap-2">
                                    <MapPin size={14} className="text-green-600 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-[9px] font-black text-gray-400 uppercase">Origem</p>
                                        <p className="font-bold text-gray-800">{detail.origin}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-2">
                                    <MapPin size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-[9px] font-black text-gray-400 uppercase">Destino</p>
                                        <p className="font-bold text-gray-800">{detail.destination}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-2">
                                    <Clock size={14} className="text-purple-600 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-[9px] font-black text-gray-400 uppercase">Início Previsto</p>
                                        <p className="font-black text-gray-900">{formatTime(detail.startTime)}</p>
                                    </div>
                                </div>
                                {(detail.providerContactName || detail.providerPhone) && (
                                    <div className="flex items-start gap-2">
                                        <Phone size={14} className="text-indigo-600 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-[9px] font-black text-gray-400 uppercase">Contato Fornecedor</p>
                                            {detail.providerContactName && <p className="font-black text-gray-900">{detail.providerContactName}</p>}
                                            {detail.providerPhone && <p className="font-mono text-indigo-700 text-[10px] font-bold">{formatPhone(detail.providerPhone)}</p>}
                                        </div>
                                    </div>
                                )}
                                {detail.driverName && (
                                    <div className="flex items-start gap-2">
                                        <Users size={14} className="text-teal-600 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-[9px] font-black text-gray-400 uppercase">Motorista</p>
                                            <p className="font-black text-gray-900">{detail.driverName}</p>
                                            {detail.driverPhone && <p className="font-mono text-gray-500 text-[10px]">{formatPhone(detail.driverPhone)}</p>}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {detail.minutesUntilStart <= 0 && !detail.acknowledged && (
                                <div className="bg-red-200 border-2 border-red-400 rounded-xl p-3 mb-4 animate-pulse">
                                    <p className="text-[11px] font-black text-red-900 uppercase flex items-center gap-1">
                                        <AlertTriangle size={14} /> MISSÃO ATRASADA SEM CONFIRMAÇÃO!
                                    </p>
                                    <p className="text-[10px] font-bold text-red-800 mt-1">Entrar em contato com equipe imediatamente.</p>
                                </div>
                            )}

                            {!detail.acknowledged && !detail.declinedAt && (
                                <div className="space-y-2">
                                    <div className={`rounded-xl p-3 text-[10px] font-bold ${
                                        detail.minutesUntilStart <= 15 ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                                    }`}>
                                        <p className="flex items-center gap-1 font-black">
                                            <Phone size={11} /> Equipe já está na origem? Já ligou pro motorista?
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleAcknowledge(detail.id)} className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white font-black text-[11px] py-3 rounded-xl transition-colors uppercase" data-testid={`button-ack-detail-${detail.missionId}`}>
                                            <CheckCircle2 size={14} /> Sim, Confirmado
                                        </button>
                                        <button onClick={() => handleDecline(detail.id)} className="flex-1 flex items-center justify-center gap-1.5 bg-red-500 hover:bg-red-600 text-white font-black text-[11px] py-3 rounded-xl transition-colors uppercase" data-testid={`button-decline-detail-${detail.missionId}`}>
                                            <XCircle size={14} /> Não
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => handleCopyContact(detail)}
                                        className={`w-full flex items-center justify-center gap-1.5 font-black text-[10px] py-2.5 rounded-xl transition-colors uppercase tracking-wider border ${
                                            copiedId === detail.id ? 'bg-green-100 text-green-700 border-green-300' : 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100'
                                        }`}
                                        data-testid={`button-contact-${detail.missionId}`}
                                    >
                                        {copiedId === detail.id ? <><CheckCircle2 size={12} /> Copiado para WhatsApp!</> : <><MessageCircle size={12} /> Entre em Contato — Copiar WhatsApp</>}
                                    </button>
                                    {detail.providerPhone && (
                                        <button onClick={() => handleWhatsAppDirect(detail)} className="w-full flex items-center justify-center gap-1.5 bg-green-50 text-green-700 border border-green-300 hover:bg-green-100 font-black text-[10px] py-2.5 rounded-xl transition-colors uppercase" data-testid={`button-whatsapp-${detail.missionId}`}>
                                            <Phone size={12} /> WhatsApp Fornecedor — {formatPhone(detail.providerPhone)}
                                        </button>
                                    )}
                                </div>
                            )}

                            {detail.declinedAt && !detail.acknowledged && (
                                <div className="space-y-2">
                                    <div className="bg-gray-100 border border-gray-300 rounded-xl p-3 text-[10px] font-bold text-gray-700 flex items-center gap-1.5">
                                        <Timer size={14} className="text-gray-500" />
                                        <div>
                                            <p className="font-black">Lembrete programado</p>
                                            <p className="text-[9px] text-gray-500">O alerta voltará no próximo nível de escalonamento</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleCopyContact(detail)} className={`flex-1 flex items-center justify-center gap-1.5 font-black text-[10px] py-2.5 rounded-xl transition-colors uppercase border ${copiedId === detail.id ? 'bg-green-100 text-green-700 border-green-300' : 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100'}`}>
                                            {copiedId === detail.id ? <><CheckCircle2 size={12} /> Copiado!</> : <><MessageCircle size={12} /> Entre em Contato</>}
                                        </button>
                                        <button onClick={() => handleAcknowledge(detail.id)} className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white font-black text-[10px] py-2.5 rounded-xl transition-colors uppercase">
                                            <CheckCircle2 size={12} /> Confirmar Agora
                                        </button>
                                    </div>
                                </div>
                            )}

                            {detail.acknowledged && (
                                <div className="bg-green-100 border border-green-200 rounded-xl p-3 text-[11px] font-bold text-green-700 flex items-center gap-2">
                                    <CheckCircle2 size={16} />
                                    <div>
                                        <p className="font-black">Viatura confirmada na origem</p>
                                        <p className="text-[10px] text-green-600">por {detail.acknowledgedBy} às {detail.acknowledgedAt ? new Date(detail.acknowledgedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MissionAlertMonitor;
