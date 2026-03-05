
import React, { memo, useMemo, useState, useRef } from 'react';
import { Mission, MissionStatus, ClientPriceTable, ProviderCostTable, Client } from '../types';
import { supabase } from '../lib/supabase';
import { 
  Truck, User, Phone, EyeOff, ShieldCheck, UserCheck, CarFront, 
  Map, Pencil, Eye, Check, Trash2, FileText, Clock, Building2, Navigation, Hourglass, History, Mail, MapPin, AlertOctagon, Printer, FileSearch, TrendingUp, TrendingDown, DollarSign, Layers, Calculator, Flag, Activity, Briefcase, Shield, MessageCircle, ImageOff, Image, X, Upload, Loader2, Camera
} from 'lucide-react';

const WhatsAppIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);
import MissionTimer from './MissionTimer';
import { useNotification } from '../lib/NotificationContext';
import { applyRegionSuffix, calculateMissionFinancials, auditMissionFinancials } from '../lib/financialUtils';
import { formatProviderName } from '../lib/utils';

interface MissionCardProps {
    mission: Mission;
    canEditMission: boolean;
    isDirector: boolean;
    isRedLight: boolean;
    isImminent: boolean;
    minutesSinceUpdate: number;
    copiedId: string | null;
    hideProviderInfo?: boolean;
    onViewMap: (m: Mission) => void;
    onUpdate: (m: Mission) => void;
    onOpenFinancials?: (m: Mission) => void; 
    onCopy: (m: Mission) => void;
    onCopyEmail: (m: Mission) => void;
    onDelete: (m: Mission) => void;
    onPrint?: (m: Mission) => void;
    onPrintLabels?: (m: Mission) => void;
    onViewHistory?: (m: Mission) => void;
    onFullReport?: (m: Mission) => void;
    onOperationalReport?: (m: Mission) => void;
    onEvidenceUploaded?: () => void;
    clientTables: ClientPriceTable[];
    providerTables: ProviderCostTable[];
    clientsData: Client[];
    agentPhonesMap?: Record<string, string>;
    currentTime?: Date;
    approvalStages?: { stage: string; date: string }[];
    evidenceList?: { url: string; uploadedBy: string; uploadedAt: string }[];
}

const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'R$ 0,00';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const AgingTimelineBar: React.FC<{ minutes: number; status: string }> = ({ minutes, status }) => {
    const isFuture = [MissionStatus.SOLICITED, MissionStatus.SCHEDULED, MissionStatus.DOCUMENTATION].includes(status as MissionStatus);
    
    if (isFuture && minutes === 0) return null;

    let colorClass = 'bg-gray-300'; 
    let textColor = 'text-gray-500';
    let borderColor = 'border-gray-200';
    let bgBase = 'bg-gray-50';
    let label = 'Atualizado';

    if (minutes >= 60) { 
        colorClass = 'bg-red-600';
        textColor = 'text-red-700';
        borderColor = 'border-red-200';
        bgBase = 'bg-red-50';
        label = 'Ocioso';
    } else if (minutes >= 30) {
        colorClass = 'bg-amber-500';
        textColor = 'text-amber-700';
        borderColor = 'border-red-200';
        bgBase = 'bg-amber-50';
        label = 'Atenção';
    }

    const widthPercentage = Math.min(100, Math.max(5, (minutes / 240) * 100));
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    const timeDisplay = hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;

    return (
        <div className={`flex flex-col w-full rounded-lg border ${borderColor} ${bgBase} p-2 shadow-sm`} title="Tempo sem atualização (Ociosidade)">
            <div className="flex justify-between items-center mb-1.5">
                <span className={`text-[9px] font-bold uppercase ${textColor} flex items-center gap-1`}>
                    <History size={10} /> {label}
                </span>
                <span className={`text-[9px] font-mono font-bold uppercase ${textColor}`}>
                    {timeDisplay}
                </span>
            </div>
            
            <div className="w-full h-2 bg-white/50 rounded-full overflow-hidden border border-black/5 relative">
                <div 
                    className={`h-full rounded-full transition-all duration-500 ease-out ${colorClass} ${minutes >= 30 ? 'animate-pulse' : ''}`}
                    style={{ width: `${widthPercentage}%` }}
                ></div>
            </div>
        </div>
    );
};

const getStatusBadgeClass = (status: string) => {
    switch (status) {
        case MissionStatus.SOLICITED: return 'bg-orange-100 text-orange-700 border-orange-200';
        case MissionStatus.DOCUMENTATION: return 'bg-blue-100 text-blue-700 border-blue-200';
        case MissionStatus.SCHEDULED: return 'bg-yellow-100 text-yellow-800 border-yellow-200';
        case MissionStatus.ORIGIN: return 'bg-indigo-100 text-indigo-700 border-indigo-200';
        case MissionStatus.IN_TRANSIT: return 'bg-purple-100 text-purple-700 border-purple-200';
        case MissionStatus.PENDING: return 'bg-amber-100 text-amber-800 border-amber-300';
        case MissionStatus.COMPLETED: return 'bg-green-100 text-green-700 border-green-200';
        case MissionStatus.CANCELLED: return 'bg-red-100 text-red-700 border-red-200';
        case MissionStatus.REFUSED: return 'bg-red-100 text-red-800 border-red-200';
        default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
};

const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '-';
        const day = d.getDate().toString().padStart(2, '0');
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const year = d.getFullYear();
        const hours = d.getHours().toString().padStart(2, '0');
        const minutes = d.getMinutes().toString().padStart(2, '0');
        return `${day}/${month}/${year} - ${hours}:${minutes}`;
    } catch {
        return '-';
    }
};

const getAgentDisplayName = (fullName?: string) => {
    if (!fullName || fullName === '---') return '-';
    return fullName.trim().toUpperCase();
};

const EVIDENCE_REQUIRED_DATE = new Date('2026-03-04T00:00:00');

const compressImage = (file: File, maxWidth = 1200, quality = 0.7): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > maxWidth) { h = (maxWidth / w) * h; w = maxWidth; }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Canvas error'));
            ctx.drawImage(img, 0, 0, w, h);
            canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Compress error')), 'image/jpeg', quality);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
};

const MissionCardComponent: React.FC<MissionCardProps> = ({ 
    mission, canEditMission, isDirector, isRedLight, isImminent, minutesSinceUpdate, copiedId, hideProviderInfo,
    onViewMap, onUpdate, onOpenFinancials, onCopy, onCopyEmail, onDelete, onPrint, onViewHistory, onFullReport, onOperationalReport, onEvidenceUploaded,
    clientTables, providerTables, clientsData, agentPhonesMap, currentTime, approvalStages, evidenceList
}) => {
    
    const { showNotification } = useNotification();
    const [showEvidenceModal, setShowEvidenceModal] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [pendingFiles, setPendingFiles] = useState<{ file: File; preview: string }[]>([]);
    const uploadFileInputRef = useRef<HTMLInputElement>(null);
    const hasEvidence = evidenceList && evidenceList.length > 0;
    const missionCreatedAt = mission.createdAt ? new Date(mission.createdAt) : null;
    const requiresEvidence = missionCreatedAt ? missionCreatedAt >= EVIDENCE_REQUIRED_DATE : false;

    const handlePasteInModal = (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
                const file = items[i].getAsFile();
                if (file) {
                    const preview = URL.createObjectURL(file);
                    setPendingFiles(prev => [...prev, { file, preview }]);
                }
                break;
            }
        }
    };

    const handleFileSelectInModal = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        Array.from(files).forEach(f => {
            if (f.type.startsWith('image/')) {
                const preview = URL.createObjectURL(f);
                setPendingFiles(prev => [...prev, { file: f, preview }]);
            }
        });
        if (uploadFileInputRef.current) uploadFileInputRef.current.value = '';
    };

    const removePendingFile = (idx: number) => {
        setPendingFiles(prev => {
            URL.revokeObjectURL(prev[idx].preview);
            return prev.filter((_, i) => i !== idx);
        });
    };

    const handleConfirmUpload = async () => {
        if (pendingFiles.length === 0) return;
        setIsUploading(true);
        try {
            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
            for (let i = 0; i < pendingFiles.length; i++) {
                const { file } = pendingFiles[i];
                const compressed = await compressImage(file);
                const path = `${mission.id}/${Date.now()}_${i}.jpg`;
                const { error: uploadError } = await supabase.storage.from('mission-evidence').upload(path, compressed, { contentType: 'image/jpeg', upsert: false });
                if (uploadError) {
                    if (uploadError.message?.includes('not found') || uploadError.message?.includes('does not exist')) {
                        showNotification('Erro', 'Bucket mission-evidence não existe. Crie no painel Supabase.', 'error');
                        return;
                    }
                    if (uploadError.message?.includes('security') || uploadError.message?.includes('policy')) {
                        showNotification('Erro', 'RLS do Storage: Crie policy INSERT no bucket mission-evidence (Supabase → Storage → Policies).', 'error');
                        return;
                    }
                    throw uploadError;
                }
                const { data: urlData } = supabase.storage.from('mission-evidence').getPublicUrl(path);
                const { error: logError } = await supabase.from('system_logs').insert({
                    entity: 'MissionEvidence',
                    entity_id: mission.id,
                    action_type: 'evidence_upload',
                    details: JSON.stringify({ publicUrl: urlData.publicUrl, uploadedBy: userData.name || 'Sistema', uploadedAt: new Date().toISOString(), fileName: file.name }),
                    created_at: new Date().toISOString()
                });
                if (logError) {
                    console.error('Erro ao salvar log:', logError.message);
                    if (logError.message?.includes('security') || logError.message?.includes('policy')) {
                        showNotification('Erro', 'RLS da tabela system_logs: Crie policy INSERT (Supabase → Table Editor → system_logs → RLS Policies).', 'error');
                        return;
                    }
                }
            }
            showNotification('Sucesso', `${pendingFiles.length} evidência(s) anexada(s)!`, 'success');
            pendingFiles.forEach(f => URL.revokeObjectURL(f.preview));
            setPendingFiles([]);
            setShowUploadModal(false);
            if (onEvidenceUploaded) onEvidenceUploaded();
        } catch (err: any) {
            showNotification('Erro', 'Falha ao anexar: ' + (err.message || err), 'error');
        } finally {
            setIsUploading(false);
        }
    };

    const isTerminal = useMemo(() => {
        return [MissionStatus.COMPLETED, MissionStatus.CANCELLED, MissionStatus.REFUSED].includes(mission.status);
    }, [mission.status]);
    
    const financials = useMemo(() => {
        if (!isDirector && !hideProviderInfo) return null;
        const clientName = ((mission as any).originalClientName || mission.client || '').trim();
        const client = clientsData.find(c => c.name === clientName);
        return calculateMissionFinancials(mission, clientTables, providerTables, client, currentTime);
    }, [mission, clientTables, providerTables, clientsData, isDirector, hideProviderInfo, currentTime]);

    const isExtraHourActive = useMemo(() => {
        if (!hideProviderInfo) return false;
        if (!financials) return false;
        if (isTerminal) return false;
        if (mission.status !== MissionStatus.IN_TRANSIT) return false;
        return financials.client.excessHours > 0;
    }, [financials, isTerminal, mission.status, hideProviderInfo]);

    const formatExcessTime = (hours: number) => {
        const totalSeconds = Math.round(hours * 3600);
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
    };

    const hasBeenVerified = !!(mission as any).billing_verified_by;

    const auditResult = useMemo(() => {
        if (!isDirector || !isTerminal) return null;
        const storedRev = (mission.revenue_value || 0);
        const storedCost = (mission.cost_value || 0);
        if (storedRev === 0 && storedCost === 0) return null;
        const clientName = ((mission as any).originalClientName || mission.client || '').trim();
        const client = clientsData.find(c => c.name === clientName);
        return auditMissionFinancials(mission, clientTables, providerTables, client);
    }, [mission, clientTables, providerTables, clientsData, isDirector, isTerminal]);

    const displayRevenue = useMemo(() => {
        const dbToll = Math.max(0, mission.toll_value || 0);
        const storedValue = (mission.revenue_value || 0) + dbToll;
        const hasStoredRevenue = (mission.revenue_value != null && mission.revenue_value > 0);
        const isVerifiedZeroRevenue = (mission.revenue_value === 0 || mission.revenue_value === null) && (mission.billing_approved || (mission as any).billing_verified_by);
        
        if (hasStoredRevenue || isVerifiedZeroRevenue) {
            return storedValue;
        }
        
        if (financials) {
            return financials.client.total;
        }

        return storedValue;
    }, [mission.revenue_value, mission.toll_value, mission.billing_approved, financials]);

    const displayCost = useMemo(() => {
        const tollProv = Math.max(0, mission.toll_value_provider != null ? mission.toll_value_provider : (mission.toll_value || 0));
        const storedValue = (mission.cost_value || 0) + tollProv;
        const hasStoredCost = (mission.cost_value != null && mission.cost_value > 0);
        const isVerifiedZeroCost = (mission.cost_value === 0 || mission.cost_value === null) && (mission.billing_approved || (mission as any).billing_verified_by);
        
        if (hasStoredCost || isVerifiedZeroCost) {
            return storedValue;
        }

        if (financials) {
            return financials.provider.total;
        }
        
        return storedValue;
    }, [mission.cost_value, mission.toll_value, mission.toll_value_provider, mission.billing_approved, financials]);

    const isActive = !isTerminal;

    const isPendingKm = useMemo(() => {
        return mission.status === MissionStatus.COMPLETED && 
               (mission.endKm === null || mission.endKm === undefined || mission.endKm === 0);
    }, [mission.status, mission.endKm]);

    const missingInfo = useMemo(() => {
        const missing: string[] = [];
        const isRelevantStatus = [MissionStatus.SCHEDULED, MissionStatus.ORIGIN, MissionStatus.IN_TRANSIT, MissionStatus.DOCUMENTATION].includes(mission.status);
        if (!isRelevantStatus) return [];
        if (!mission.driver_name || !mission.driver_name.trim()) missing.push('Motorista');
        const hasClientPlate = mission.clientVehicle && mission.clientVehicle.plate && mission.clientVehicle.plate.trim() !== '';
        if (!hasClientPlate) missing.push('Placa');
        if (!mission.origin || !mission.destination) missing.push('Rota');
        if (!mission.client) missing.push('Cliente');
        if (mission.status === MissionStatus.IN_TRANSIT && (!mission.gr_espelhamento || !mission.gr_espelhamento.trim())) {
            missing.push('GR');
        }
        return missing;
    }, [mission]);

    const displayPlannedKm = useMemo(() => {
        const destUpper = (mission.destination || '').toUpperCase();
        const clientUpper = (mission.client || '').toUpperCase();
        const isLogitech = clientUpper.includes('CEVA') && (destUpper.includes('LOGITECH') || (mission as any).operation_type?.toUpperCase().includes('LOGITECH'));

        if (isLogitech || destUpper.includes('200KM')) return '200.0 KM';
        if (destUpper.includes('02H') || destUpper.includes('100KM')) return '100.0 KM';
        return `${mission.totalDistance || '0.0'} KM`;
    }, [mission.destination, mission.client, mission.totalDistance]);

    const handlePrintClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const dateObj = new Date(mission.startTime || mission.createdAt);
        const dateStr = dateObj.toLocaleDateString('pt-BR');
        const timeStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const trackerType = mission.vehicleData?.tracker_type || 'N/A';
        const trackerId = mission.vehicleData?.tracker_id || 'N/A';
        const textToCopy = `Segue os dados referente a missão solicitada:

*OS:* ${mission.id}
*DATA DO AGENDAMENTO:* ${dateStr} *às* ${timeStr}
*ORIGEM:* ${applyRegionSuffix(mission.origin || 'N/A')}
*DESTINO:* ${applyRegionSuffix(mission.destination || 'N/A')}
*ESPELHAMENTO:* ${mission.gr_espelhamento || 'Não informado'}
*RASTREADOR:* ${trackerType} / *ID:* ${trackerId}

Qualquer dúvida, estamos a disposição.

*GRUPO TM SEG*`;
        try {
            await navigator.clipboard.writeText(textToCopy);
        } catch (err) {
            console.error("Erro ao copiar texto", err);
        }
        if (onPrint) onPrint(mission);
    };

    const handleWhatsAppContact = (phone?: string, name?: string) => {
        if (!phone || phone === '---') {
            showNotification('Contato', `Telefone de ${name || 'contato'} não localizado.`, 'warning');
            return;
        }
        const clean = phone.replace(/\D/g, '');
        const final = clean.startsWith('55') ? clean : `55${clean}`;
        window.open(`https://wa.me/${final}`, '_blank');
    };

    const locationParsed = useMemo(() => {
        const raw = mission.currentLocation || "";
        if (!raw || raw.includes('Solicitação Criada') || raw.includes('AUTO CARGA BLOQUEADO')) return { fullAddress: '', status: '' };

        const parts = raw.split('|').map(p => p.trim());
        let status = parts.length > 1 ? parts[0] : '';
        let fullAddr = parts.length > 1 ? parts[1] : parts[0];

        return { 
            fullAddress: fullAddr.toUpperCase().replace(/^,\s*/, ''), 
            status: status.toUpperCase() 
        };
    }, [mission.currentLocation]);

    const isAdjustedRevenue = mission.billing_approved || hasBeenVerified || (mission.revenue_value != null && mission.revenue_value > 0);
    const isAdjustedCost = mission.billing_approved || hasBeenVerified || (mission.cost_value != null && mission.cost_value > 0);

    const pendingApproval = useMemo(() => {
        if (mission.billing_approved) return null;
        const stages = (approvalStages || []).map(s => s.stage);
        const hasAuditor = stages.includes('auditor');
        const hasFinanceiro = stages.includes('financeiro');
        const hasDiretoria = stages.includes('diretoria');
        if (hasDiretoria || (hasAuditor && hasFinanceiro && hasDiretoria)) return null;
        const missing: string[] = [];
        if (!hasDiretoria) {
            if (!hasAuditor) missing.push('Daniel');
            if (!hasFinanceiro) missing.push('Barbara');
            missing.push('Diretoria');
        }
        let waitingDays = 0;
        if (approvalStages && approvalStages.length > 0) {
            const lastDate = approvalStages.reduce((latest, s) => {
                const d = new Date(s.date).getTime();
                return d > latest ? d : latest;
            }, 0);
            waitingDays = Math.floor((Date.now() - lastDate) / (1000 * 60 * 60 * 24));
        } else if (mission.endTime) {
            waitingDays = Math.floor((Date.now() - new Date(mission.endTime).getTime()) / (1000 * 60 * 60 * 24));
        }
        const hasPartial = hasAuditor || hasFinanceiro;
        return { missing, waitingDays, hasPartial, completedCount: (hasAuditor ? 1 : 0) + (hasFinanceiro ? 1 : 0) + (hasDiretoria ? 1 : 0) };
    }, [mission.billing_approved, mission.endTime, approvalStages]);

    // Calcula o progresso visual para a barra (0 a 100)
    const progressVisual = Math.min(100, Math.max(0, mission.progress || 0));

    return (<>
        <div 
          className={`group relative rounded-xl border bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(8,_112,_184,_0.07)] shadow-sm ${
              isRedLight ? 'border-red-200 ring-1 ring-red-100' : isImminent ? 'border-amber-200 ring-1 ring-amber-100' : 'border-gray-200 hover:border-blue-200'
          }`}
        >
            {isExtraHourActive && (
                <div className="relative overflow-hidden rounded-t-xl" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%)', boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.3), inset 0 -2px 4px rgba(0,0,0,0.2), 0 4px 12px rgba(245,158,11,0.4), 0 2px 4px rgba(0,0,0,0.15)' }}>
                    <div className="flex items-center justify-center gap-2 py-2 px-3 relative z-10">
                        <div className="relative">
                            <Clock size={14} className="text-white drop-shadow-md animate-pulse" strokeWidth={3} />
                            <div className="absolute -inset-1 bg-white/20 rounded-full blur-sm animate-ping"></div>
                        </div>
                        <span className="text-[11px] font-black text-white uppercase tracking-widest drop-shadow-md" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.4), 0 0 8px rgba(255,255,255,0.15)' }}>
                            Hora Extra Ativa
                        </span>
                        <span className="text-[10px] font-black text-yellow-100 bg-black/20 px-2 py-0.5 rounded-full" style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)' }}>
                            +{financials ? formatExcessTime(financials.client.excessHours) : ''}
                        </span>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse pointer-events-none"></div>
                </div>
            )}
            {!hideProviderInfo && (missingInfo.length > 0 || isPendingKm) && (
                <div className={`bg-red-600 text-white text-[10px] font-bold uppercase py-1.5 px-3 flex items-center justify-center gap-2 animate-pulse ${isExtraHourActive ? '' : 'rounded-t-xl'}`}>
                    <AlertOctagon size={12} strokeWidth={3} /> PENDENTE: {isPendingKm ? ['KM FINAL', ...missingInfo].join(' • ') : missingInfo.join(' • ')}
                </div>
            )}
            <div className={`absolute bottom-0 left-0 right-0 h-1 rounded-b-xl transition-colors ${isRedLight ? 'bg-red-500' : isImminent ? 'bg-amber-500' : 'bg-transparent'}`}></div>
            <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[120px] divide-y lg:divide-y-0 lg:divide-x divide-gray-100 items-stretch">
                <div className="lg:col-span-2 p-3 flex flex-col justify-center gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xl font-black text-gray-900 tracking-tighter leading-none">{mission.id}</span>
                        {mission.is_same_os && (
                            <span className="bg-black text-white px-1.5 py-0.5 rounded text-[8px] font-black uppercase flex items-center gap-1 border border-black shadow-sm" title="Missão de continuidade - Custo Fornecedor Zero">
                                <Layers size={10} /> MESMA OS
                            </span>
                        )}
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase border tracking-wider ${isPendingKm && !hideProviderInfo ? 'bg-amber-100 text-amber-800 border-amber-300' : getStatusBadgeClass(mission.status)}`}>
                            {isPendingKm && !hideProviderInfo ? 'PENDENTE KM' : mission.status}
                        </span>
                        {hasEvidence ? (
                            <button onClick={() => setShowEvidenceModal(true)} className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase border bg-emerald-50 text-emerald-700 border-emerald-300 flex items-center gap-1 hover:bg-emerald-100 transition-all cursor-pointer shadow-sm" data-testid={`badge-evidence-${mission.id}`} title="Evidência anexada - clique para ver">
                                <Image size={10} /> EVIDÊNCIA
                            </button>
                        ) : requiresEvidence ? (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase flex items-center gap-1 bg-red-100 text-red-700 border border-red-300 shadow-[0_2px_8px_rgba(239,68,68,0.25)] animate-pulse" title="Sem evidência de solicitação">
                                <ImageOff size={10} /> SEM EVIDÊNCIA
                            </span>
                        ) : null}
                    </div>
                    <div className="flex flex-col gap-1.5 mt-1">
                        <div className="flex items-center gap-2"><div className="p-0.5 bg-blue-50 rounded text-blue-600 shrink-0"><FileText size={10} /></div><div className="flex items-center gap-1.5"><span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Criação</span><span className="text-[10px] font-bold text-gray-800">{formatDateTime(mission.createdAt)}</span></div></div>
                        <div className="flex items-center gap-2"><div className="p-0.5 bg-orange-50 rounded text-orange-600 shrink-0"><Clock size={10} /></div><div className="flex items-center gap-1.5"><span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Agendamento</span><span className="text-[10px] font-bold text-gray-800">{mission.startTime ? formatDateTime(mission.startTime) : 'Imediato'}</span></div></div>
                    </div>
                    <MissionTimer status={isPendingKm && !hideProviderInfo ? MissionStatus.PENDING : mission.status} startTime={mission.startTime} createdAt={mission.createdAt} />
                    <div className="w-full">{isActive && !(isPendingKm && !hideProviderInfo) ? (<AgingTimelineBar minutes={minutesSinceUpdate} status={mission.status} />) : (<div className="h-6 w-full text-center text-[10px] text-gray-400 font-bold uppercase tracking-wider opacity-50">{isPendingKm && !hideProviderInfo ? 'KM PENDENTE' : '-'}</div>)}</div>
                </div>
                
                <div className="lg:col-span-3 p-3 flex flex-col justify-center bg-gray-50/20 border-r border-gray-100">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap gap-2">
                            <span className="text-[10px] font-black text-slate-800 bg-white px-2 py-1 rounded border border-slate-200 uppercase tracking-widest shadow-sm">
                                <Building2 size={10} className="inline mr-1 text-red-600" /> {mission.client}
                            </span>
                        </div>
                        
                        <div className="space-y-2.5 pl-1">
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 bg-white rounded-lg text-blue-600 border border-gray-100 shadow-sm"><Truck size={12}/></div>
                                <div className="min-w-0">
                                    <span className="text-[11px] font-black text-gray-900 uppercase block leading-none">{mission.clientVehicle?.plate || '---'}</span>
                                    <span className="text-[9px] text-gray-500 font-bold uppercase truncate block mt-1">{mission.clientVehicle?.model || 'MODELO N/D'}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 bg-white rounded-lg text-green-600 border border-gray-100 shadow-sm"><User size={12}/></div>
                                <div className="flex-1 min-w-0 flex items-center gap-2">
                                    <div className="min-w-0 flex-1">
                                        <span className="text-[10px] font-bold text-gray-800 uppercase block leading-none truncate" title={mission.driver_name}>{getAgentDisplayName(mission.driver_name) || '---'}</span>
                                        <div className="flex items-center gap-1 mt-1">
                                            <Phone size={8} className="text-gray-400" />
                                            <span className="text-[9px] font-mono text-gray-400 font-medium">{mission.driver_phone || ''}</span>
                                        </div>
                                    </div>
                                    {mission.driver_phone && (
                                        <button 
                                            onClick={() => handleWhatsAppContact(mission.driver_phone, mission.driver_name)}
                                            className="p-1 bg-emerald-50 text-emerald-600 rounded-md hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                                            title={`Chamar motorista no WhatsApp`}
                                        >
                                            <MessageCircle size={10} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-2 p-3 flex flex-col justify-center bg-white">
                    {hideProviderInfo ? (
                        <div className="flex flex-col items-center justify-center h-full">
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border shadow-sm ${
                                mission.mission_type?.toUpperCase().includes('VELADA') 
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                                : 'bg-red-50 text-red-700 border-red-200'
                            }`}>
                                {(mission.mission_type || 'CARACTERIZADA').toUpperCase()}
                            </span>
                        </div>
                    ) : (
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-2 mb-1">
                            <span className="text-[10px] font-black text-slate-800 bg-white px-2 py-1 rounded border border-slate-200 uppercase tracking-widest shadow-sm">
                                <Briefcase size={10} className="inline mr-1 text-blue-600" /> 
                                {formatProviderName(mission.provider) || 'PENDENTE'}
                            </span>
                        </div>

                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 bg-white rounded-lg text-red-600 border border-gray-100 shadow-sm"><CarFront size={12}/></div>
                            <div className="min-w-0 flex items-center gap-2">
                                <span className="text-[11px] font-black text-gray-900 uppercase block leading-none">
                                    {mission.vehicleId || '---'}
                                </span>
                                <span className="text-gray-300 font-black">-</span>
                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border shadow-sm ${
                                    mission.mission_type?.toUpperCase().includes('VELADA') 
                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                                    : 'bg-red-50 text-red-700 border-red-200'
                                }`}>
                                    {(mission.mission_type || 'CARACTERIZADA').toUpperCase()}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 bg-white rounded-lg text-blue-600 border border-gray-100 shadow-sm"><ShieldCheck size={12}/></div>
                            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-gray-800 uppercase block leading-tight" title={mission.agent1}>
                                        {getAgentDisplayName(mission.agent1)}
                                    </span>
                                    {mission.agent1 && (
                                        <button 
                                            onClick={() => handleWhatsAppContact(agentPhonesMap?.[mission.agent1], mission.agent1)}
                                            className="p-1 bg-emerald-50 text-emerald-600 rounded-md hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                                            title={`Chamar ${mission.agent1} no WhatsApp`}
                                        >
                                            <MessageCircle size={10} />
                                        </button>
                                    )}
                                </div>
                                {mission.agent2 && mission.agent2 !== '---' && (
                                    <div className="flex items-center justify-between border-t border-gray-50 pt-1">
                                        <span className="text-[10px] font-bold text-gray-800 uppercase block leading-tight" title={mission.agent2}>
                                            {getAgentDisplayName(mission.agent2)}
                                        </span>
                                        <button 
                                            onClick={() => handleWhatsAppContact(agentPhonesMap?.[mission.agent2], mission.agent2)}
                                            className="p-1 bg-emerald-50 text-emerald-600 rounded-md hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                                            title={`Chamar ${mission.agent2} no WhatsApp`}
                                        >
                                            <MessageCircle size={10} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    )}
                </div>
                
                <div className="lg:col-span-3 p-3 flex flex-col justify-center relative bg-gray-50/20">
                    <div className="flex flex-col h-full justify-between relative pl-2">
                        <div className="absolute left-[9px] top-[14px] bottom-[14px] w-0.5 border-l-2 border-dashed border-gray-200 z-0"></div>
                        
                        <div className="relative flex items-center gap-3 z-10">
                            <div className="w-4 h-4 rounded-full bg-green-600 shadow-md flex items-center justify-center ring-4 ring-white shrink-0">
                                <MapPin size={8} className="text-white" />
                            </div>
                            <div className="text-[9px] min-w-0 flex-1">
                                <span className="font-black text-gray-400 uppercase tracking-widest block leading-none mb-1">Ponto A (Origem)</span>
                                <span className="font-black text-gray-900 uppercase truncate block" title={mission.origin}>{mission.origin || '---'}</span>
                            </div>
                        </div>

                        <div className="relative flex items-center gap-3 z-10 my-1">
                            <div className="w-4 h-4 rounded-full bg-blue-600 shadow-md flex items-center justify-center ring-4 ring-white shrink-0">
                                <Navigation size={8} className="text-white" />
                            </div>
                            <div className="text-[9px] min-w-0 flex-1">
                                <span className="font-black text-gray-400 uppercase tracking-widest block leading-none mb-1">Ponto B (Local Atual)</span>
                                <span className="font-black text-gray-900 uppercase truncate block" title={locationParsed.fullAddress}>
                                    {locationParsed.fullAddress || 'AGUARDANDO INÍCIO'}
                                </span>
                            </div>
                        </div>

                        <div className="relative flex items-center gap-3 z-10">
                            <div className="w-4 h-4 rounded-full bg-red-600 shadow-md flex items-center justify-center ring-4 ring-white shrink-0">
                                <Flag size={8} className="text-white" />
                            </div>
                            <div className="text-[9px] min-w-0 flex-1">
                                <span className="font-black text-gray-400 uppercase tracking-widest block leading-none mb-1">Ponto C (Destino)</span>
                                <span className="font-black text-gray-900 uppercase truncate block" title={mission.destination}>{mission.destination?.toUpperCase() || '---'}</span>
                            </div>
                        </div>

                        <div className="mt-3 pt-1 border-t border-gray-100">
                            <div className="flex justify-between items-center mb-1 px-1">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Acompanhamento</span>
                                    <span className="text-[9px] font-black text-gray-900 bg-gray-100 px-1.5 rounded-full border border-gray-200" title="Distância total da rota (Regra aplicada se ativa)">
                                        {displayPlannedKm}
                                    </span>
                                </div>
                                <span className="text-[9px] font-black text-red-600 tabular-nums bg-red-50 px-1 rounded">{progressVisual.toFixed(0)}%</span>
                            </div>
                            <div className="relative w-full h-2 bg-gray-200 rounded-full overflow-visible shadow-inner border border-gray-300">
                                <div 
                                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-red-600 via-red-800 to-black rounded-full transition-all duration-1000 ease-out" 
                                    style={{ width: `${progressVisual}%` }}
                                ></div>
                                <div 
                                    className="absolute top-1/2 -translate-y-1/2 bg-white p-1 rounded-full shadow-2xl border border-red-200 z-30 flex items-center justify-center w-8 h-8 transition-all duration-1000 ease-out transform group-hover:scale-110" 
                                    style={{ left: `calc(${progressVisual}% - 16px)` }}
                                >
                                    {progressVisual <= 0 ? <MapPin size={16} className="text-blue-600" /> : progressVisual >= 100 ? <Flag size={16} className="text-green-700" /> : <Truck size={16} className="text-red-700" />}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-1 p-1.5 flex flex-col justify-center text-center border-l border-r border-gray-100 bg-gray-50/30 gap-2 min-w-[100px]">
                    {isDirector && !hideProviderInfo && (
                        <div className="flex flex-col gap-1">
                           <div className="bg-white border border-green-200 rounded-lg p-1 shadow-sm">
                               <p className="text-[7px] font-black text-green-500 uppercase tracking-tighter leading-none mb-0.5">Faturamento {mission.billing_approved ? '(Auditado)' : isAdjustedRevenue ? '(Salvo)' : '(Projetado)'}</p>
                               <p className="text-[10px] font-black text-green-700 font-mono leading-none tracking-tighter">{formatCurrency(displayRevenue)}</p>
                           </div>

                           <div className="bg-white border border-red-200 rounded-lg p-1 shadow-sm">
                               <p className="text-[7px] font-black text-red-400 uppercase tracking-tighter leading-none mb-0.5">Fornecedor {mission.billing_approved ? '(Auditado)' : isAdjustedCost ? '(Salvo)' : '(Projetado)'}</p>
                               <p className="text-[10px] font-black text-red-600 font-mono leading-none tracking-tighter">{formatCurrency(displayCost)}</p>
                           </div>

                           {(() => {
                               const margin = displayRevenue > 0 ? ((displayRevenue - displayCost) / displayRevenue) * 100 : 0;
                               const isNegative = margin < 0;
                               const isLow = margin >= 0 && margin < 20;
                               return (
                                   <div className={`w-full rounded-lg border p-1 flex items-center justify-center gap-1 shadow-sm transition-all ${isNegative ? 'bg-red-100 border-red-300 animate-pulse' : isLow ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-200'}`}>
                                       {isNegative ? <TrendingDown size={10} className="text-red-600" /> : isLow ? <AlertOctagon size={10} className="text-amber-600" /> : <TrendingUp size={10} className="text-emerald-600" />}
                                       <span className={`text-[9px] font-black font-mono leading-none ${isNegative ? 'text-red-700' : isLow ? 'text-amber-700' : 'text-emerald-700'}`}>
                                           {margin.toFixed(1)}%
                                       </span>
                                       <span className={`text-[6px] font-black uppercase leading-none ${isNegative ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-emerald-500'}`}>
                                           {isNegative ? 'PREJUÍZO' : 'MARGEM'}
                                       </span>
                                   </div>
                               );
                           })()}

                           <div className={`w-full rounded-lg border p-1 flex flex-col items-center justify-center gap-0.5 shadow-sm transition-all ${auditResult?.isInconsistent ? 'bg-amber-50 border-amber-400 ring-1 ring-amber-300' : mission.billing_approved ? 'bg-blue-50 border-blue-200' : pendingApproval?.hasPartial ? 'bg-gray-100 border-gray-300' : hasBeenVerified ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}`} title={auditResult?.isInconsistent ? auditResult.reason : pendingApproval ? `Aguardando: ${pendingApproval.missing.join(', ')}` : ''}>
                              {auditResult?.isInconsistent ? (
                                  <>
                                      <AlertOctagon size={12} className="text-amber-600 animate-pulse" />
                                      <span className="text-[7px] font-black text-amber-700 uppercase leading-none">Divergente</span>
                                  </>
                              ) : mission.billing_approved ? (
                                  <>
                                      <ShieldCheck size={12} className="text-blue-600" />
                                      <span className="text-[7px] font-black text-blue-700 uppercase leading-none">Auditado</span>
                                  </>
                              ) : pendingApproval?.hasPartial ? (
                                  <>
                                      <Clock size={10} className="text-gray-500" />
                                      <span className="text-[7px] font-black text-gray-600 uppercase leading-none truncate w-full text-center">Falta: {pendingApproval.missing.join(', ')}</span>
                                      <span className="text-[7px] font-bold text-gray-400 leading-none">({pendingApproval.waitingDays}d)</span>
                                  </>
                              ) : hasBeenVerified ? (
                                  <>
                                      <ShieldCheck size={12} className="text-green-600" />
                                      <span className="text-[7px] font-black text-green-700 uppercase leading-none">Salvo</span>
                                  </>
                              ) : (
                                  <>
                                      <Clock size={12} className="text-orange-600" />
                                      <span className="text-[7px] font-black text-orange-700 uppercase leading-none">Pendente</span>
                                  </>
                              )}
                           </div>
                        </div>
                    )}
                    {hideProviderInfo && financials && (
                        <div className="flex flex-col gap-1" data-testid={`client-billing-${mission.id}`}>
                           <div className="rounded-lg p-1.5 shadow-sm border" style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', borderColor: '#86efac' }}>
                               <p className="text-[7px] font-black text-green-600 uppercase tracking-wider leading-none mb-0.5">Faturamento</p>
                               <p className="text-[11px] font-black text-green-800 font-mono leading-none tracking-tight">{formatCurrency(financials.client.base)}</p>
                           </div>
                           <div className={`rounded-lg p-1.5 shadow-sm border ${financials.client.extraHrVal > 0 ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-200'}`}>
                               <p className="text-[7px] font-black text-amber-700 uppercase tracking-wider leading-none mb-0.5">Hora Extra</p>
                               <p className={`text-[10px] font-black font-mono leading-none ${financials.client.extraHrVal > 0 ? 'text-amber-800' : 'text-gray-400'}`}>{formatCurrency(financials.client.extraHrVal)}</p>
                               {financials.client.excessHours > 0 && <p className="text-[7px] font-bold text-amber-500 mt-0.5">+{formatExcessTime(financials.client.excessHours)}</p>}
                           </div>
                           <div className={`rounded-lg p-1.5 shadow-sm border ${financials.client.extraKmVal > 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                               <p className="text-[7px] font-black text-blue-600 uppercase tracking-wider leading-none mb-0.5">Km Extra</p>
                               <p className={`text-[10px] font-black font-mono leading-none ${financials.client.extraKmVal > 0 ? 'text-blue-800' : 'text-gray-400'}`}>{formatCurrency(financials.client.extraKmVal)}</p>
                           </div>
                           <div className={`rounded-lg p-1.5 shadow-sm border ${financials.tollValue > 0 ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200'}`}>
                               <p className="text-[7px] font-black text-purple-600 uppercase tracking-wider leading-none mb-0.5">Pedágio</p>
                               <p className={`text-[10px] font-black font-mono leading-none ${financials.tollValue > 0 ? 'text-purple-800' : 'text-gray-400'}`}>{formatCurrency(financials.tollValue)}</p>
                           </div>
                           <div className="rounded-lg p-1.5 shadow-sm border border-green-400" style={{ background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)' }}>
                               <p className="text-[7px] font-black text-green-700 uppercase tracking-wider leading-none mb-0.5">Valor Total</p>
                               <p className="text-[12px] font-black text-green-900 font-mono leading-none tracking-tight">{formatCurrency(financials.client.base + financials.client.extraHrVal + financials.client.extraKmVal + financials.tollValue)}</p>
                           </div>
                        </div>
                    )}
                </div>

                <div className="lg:col-span-1 py-1 px-0.5 flex items-center justify-center border-l border-gray-100 bg-white">
                    <div className="grid grid-cols-3 gap-1.5 w-fit justify-items-center"><button onClick={() => onViewMap(mission)} className="w-7 h-7 flex items-center justify-center rounded-md bg-blue-50 text-blue-600 border border-blue-100 transition-all duration-200 hover:bg-blue-600 hover:text-white hover:shadow-sm active:scale-95" title="Abrir Status (Modal Interno)"><Map size={14} /></button>
                        {!hideProviderInfo && (<>
                        <button onClick={(e) => { e.stopPropagation(); if (mission.mapLink) window.open(mission.mapLink, '_blank'); else alert('Nenhuma localização salva nesta OS.'); }} className={`w-7 h-7 flex items-center justify-center rounded-md border transition-all duration-200 hover:shadow-sm active:scale-95 ${mission.mapLink ? 'bg-orange-50 text-orange-600 border-orange-100 hover:bg-orange-600 hover:text-white' : 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'}`} title={mission.mapLink ? "Abrir Última Localização (Google Maps)" : "Sem localização salva"}><MapPin size={14} /></button>
                        <button onClick={() => onUpdate(mission)} className={`w-7 h-7 flex items-center justify-center rounded-md border transition-all duration-200 hover:shadow-sm active:scale-95 ${canEditMission ? 'bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-600 hover:text-white' : 'bg-gray-50 text-gray-400 border-gray-100 hover:bg-gray-200 hover:text-gray-600'}`} title={canEditMission ? "Editar Missão" : "Visualizar Detalhes"}>{canEditMission ? <Pencil size={14}/> : <Eye size={14}/>}</button>
                        
                        {(isDirector || canEditMission) && onOpenFinancials && (
                            <button onClick={() => onOpenFinancials(mission)} className={`flex items-center justify-center rounded-md transition-all duration-200 hover:shadow-sm active:scale-95 border ${mission.billing_approved ? 'w-7 h-7 bg-blue-600 text-white border-blue-700' : pendingApproval?.hasPartial ? 'h-7 px-1.5 gap-1 bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200' : 'w-7 h-7 bg-green-50 text-green-700 border-green-200 hover:bg-green-600 hover:text-white'}`} title={mission.billing_approved ? "Faturamento Aprovado - Visualizar" : pendingApproval?.hasPartial ? `Aguardando: ${pendingApproval.missing.join(', ')} (${pendingApproval.waitingDays}d)` : "Conferência e Aprovação de Faturamento"}>
                                <Calculator size={14} />
                                {pendingApproval?.hasPartial && <span className="text-[7px] font-black text-gray-500 leading-none whitespace-nowrap">{pendingApproval.missing[0]} ({pendingApproval.waitingDays}d)</span>}
                            </button>
                        )}
                        
                        <button onClick={() => onCopyEmail(mission)} className="w-7 h-7 flex items-center justify-center rounded-md bg-slate-50 text-slate-600 border border-slate-200 transition-all duration-200 hover:bg-slate-600 hover:text-white hover:shadow-sm active:scale-95" title="Copiar Template de E-mail"><Mail size={14} /></button>
                        <button onClick={() => onCopy(mission)} className={`w-7 h-7 flex items-center justify-center rounded-md border transition-all duration-200 hover:shadow-sm active:scale-95 ${copiedId === mission.id ? 'bg-green-100 text-green-700 border-green-200' : 'bg-[#25D366]/10 text-[#25D366] border-[#25D366]/20 hover:bg-[#25D366] hover:text-white'}`} title="Copiar Relatório WhatsApp">{copiedId === mission.id ? <Check size={14} strokeWidth={3}/> : <WhatsAppIcon size={14}/>}</button>
                        {onViewHistory && isDirector && (<button onClick={(e) => { e.stopPropagation(); onViewHistory(mission); }} className="w-7 h-7 flex items-center justify-center rounded-md bg-purple-50 text-purple-600 border border-purple-200 transition-all duration-200 hover:bg-purple-600 hover:text-white hover:shadow-sm active:scale-95" title="Histórico Detalhado (Auditoria)"><FileSearch size={14} /></button>)}</>)}
                        <button onClick={() => hasEvidence ? setShowEvidenceModal(true) : setShowUploadModal(true)} className={`w-7 h-7 flex items-center justify-center rounded-md border transition-all duration-200 hover:shadow-sm active:scale-95 ${hasEvidence ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-600 hover:text-white' : requiresEvidence ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-600 hover:text-white animate-pulse' : 'bg-cyan-50 text-cyan-600 border-cyan-200 hover:bg-cyan-600 hover:text-white'}`} title={hasEvidence ? 'Ver Evidência' : 'Anexar Print / Evidência (Ctrl+V para colar)'} data-testid={`button-upload-evidence-${mission.id}`}>
                            {hasEvidence ? <Image size={14} /> : <Camera size={14} />}
                        </button>
                        {onPrint && (<button onClick={handlePrintClick} className="w-7 h-7 flex items-center justify-center rounded-md bg-gray-50 text-gray-700 border border-gray-200 transition-all duration-200 hover:bg-gray-700 hover:text-white hover:shadow-sm active:scale-95" title="Imprimir Folha de Missão (PDF) e Copiar Texto"><Printer size={14} /></button>)}
                        {onFullReport && (<button onClick={() => onFullReport(mission)} className="w-7 h-7 flex items-center justify-center rounded-md bg-amber-50 text-amber-700 border border-amber-200 transition-all duration-200 hover:bg-amber-600 hover:text-white hover:shadow-sm active:scale-95" title="Relatório Completo PDF (Timeline + Auditoria)"><FileText size={14} /></button>)}
                        {onOperationalReport && (<button onClick={() => onOperationalReport(mission)} className="w-7 h-7 flex items-center justify-center rounded-md bg-red-50 text-red-700 border border-red-200 transition-all duration-200 hover:bg-red-700 hover:text-white hover:shadow-sm active:scale-95" title="Relatório Operacional" data-testid={`button-op-report-${mission.id}`}><Briefcase size={14} /></button>)}
                        {isDirector && !hideProviderInfo && (<button onClick={() => onDelete(mission)} className="w-7 h-7 flex items-center justify-center rounded-md bg-red-50 text-red-600 border-red-100 transition-all duration-200 hover:bg-red-600 hover:text-white hover:shadow-sm active:scale-95" title="Excluir Missão"><Trash2 size={14}/></button>)}
                    </div>
                </div>
            </div>
        </div>

        {showUploadModal && (
            <div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4 animate-in fade-in" onClick={() => { setShowUploadModal(false); pendingFiles.forEach(f => URL.revokeObjectURL(f.preview)); setPendingFiles([]); }}>
                <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()} onPaste={handlePasteInModal} tabIndex={0} data-testid={`upload-modal-${mission.id}`}>
                    <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50 rounded-t-2xl">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-cyan-100 rounded-xl text-cyan-600"><Camera size={18} /></div>
                            <div>
                                <h3 className="text-sm font-black text-gray-900 uppercase">Anexar Evidência</h3>
                                <p className="text-[10px] font-bold text-gray-400">{mission.id} — {mission.client}</p>
                            </div>
                        </div>
                        <button onClick={() => { setShowUploadModal(false); pendingFiles.forEach(f => URL.revokeObjectURL(f.preview)); setPendingFiles([]); }} className="p-2 hover:bg-gray-200 rounded-full transition-all" data-testid="button-close-upload-modal"><X size={18} /></button>
                    </div>
                    <div className="p-4 space-y-4">
                        <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center bg-gray-50/50 focus-within:border-cyan-400 transition-colors">
                            <Camera size={32} className="mx-auto text-gray-400 mb-2" />
                            <p className="text-sm font-bold text-gray-700">Cole o print aqui (Ctrl+V)</p>
                            <p className="text-[10px] text-gray-400 mt-1">ou selecione um arquivo abaixo</p>
                        </div>
                        <div className="flex gap-2">
                            <input ref={uploadFileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelectInModal} data-testid={`input-evidence-file-${mission.id}`} />
                            <button onClick={() => uploadFileInputRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg text-xs font-bold text-gray-700 transition-all" data-testid={`button-select-file-${mission.id}`}>
                                <Upload size={14} /> Selecionar Arquivo
                            </button>
                        </div>
                        {pendingFiles.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-[10px] font-black text-gray-500 uppercase">{pendingFiles.length} imagem(ns) pronta(s)</p>
                                <div className="grid grid-cols-3 gap-2">
                                    {pendingFiles.map((pf, idx) => (
                                        <div key={idx} className="relative group rounded-lg overflow-hidden border border-gray-200 shadow-sm">
                                            <img src={pf.preview} alt={`Preview ${idx + 1}`} className="w-full h-24 object-cover" />
                                            <button onClick={() => removePendingFile(idx)} className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`button-remove-pending-${idx}`}><X size={10} /></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <button onClick={handleConfirmUpload} disabled={pendingFiles.length === 0 || isUploading} className={`w-full py-3 rounded-xl text-sm font-black uppercase transition-all ${pendingFiles.length > 0 && !isUploading ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`} data-testid={`button-confirm-upload-${mission.id}`}>
                            {isUploading ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Enviando...</span> : `Enviar ${pendingFiles.length > 0 ? pendingFiles.length + ' Evidência(s)' : ''}`}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {showEvidenceModal && hasEvidence && (
            <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4 animate-in fade-in" onClick={() => setShowEvidenceModal(false)} data-testid={`evidence-modal-${mission.id}`}>
                <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
                    <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50 rounded-t-2xl">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-100 rounded-xl text-emerald-600"><Image size={18} /></div>
                            <div>
                                <h3 className="text-sm font-black text-gray-900 uppercase">Evidência da Solicitação</h3>
                                <p className="text-[10px] font-bold text-gray-400">{mission.id} — {mission.client}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {!hideProviderInfo && (
                                <button onClick={() => { setShowEvidenceModal(false); setShowUploadModal(true); }} className="px-3 py-1.5 bg-cyan-100 text-cyan-700 rounded-lg text-[10px] font-black uppercase hover:bg-cyan-200 transition-all flex items-center gap-1.5" data-testid="button-add-more-evidence"><Camera size={12} /> Adicionar</button>
                            )}
                            <button onClick={() => setShowEvidenceModal(false)} className="p-2 hover:bg-gray-200 rounded-full transition-all" data-testid="button-close-evidence-modal"><X size={18} /></button>
                        </div>
                    </div>
                    <div className="p-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[10px]">
                            <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                                <span className="font-black text-blue-400 uppercase tracking-widest block mb-1">Solicitação</span>
                                <span className="font-black text-blue-900">{formatDateTime(mission.createdAt)}</span>
                            </div>
                            <div className="bg-green-50 p-3 rounded-xl border border-green-100">
                                <span className="font-black text-green-400 uppercase tracking-widest block mb-1">KM Inicial</span>
                                <span className="font-black text-green-900 font-mono">{mission.startKm ? mission.startKm.toLocaleString('pt-BR') : '---'}</span>
                            </div>
                            <div className="bg-red-50 p-3 rounded-xl border border-red-100">
                                <span className="font-black text-red-400 uppercase tracking-widest block mb-1">KM Final</span>
                                <span className="font-black text-red-900 font-mono">{mission.endKm ? mission.endKm.toLocaleString('pt-BR') : '---'}</span>
                            </div>
                        </div>
                        {evidenceList!.map((ev, idx) => (
                            <div key={idx} className="border border-gray-200 rounded-xl overflow-hidden shadow-sm cursor-pointer" onClick={() => window.open(ev.url, '_blank')}>
                                <img src={ev.url} alt={`Evidência ${idx + 1}`} className="w-full object-contain max-h-[60vh] bg-gray-100" />
                                <div className="p-2 bg-gray-50 flex items-center justify-between text-[9px]">
                                    <span className="font-bold text-gray-500">Enviado por <span className="text-gray-800 font-black">{ev.uploadedBy}</span></span>
                                    <span className="font-bold text-gray-400">{formatDateTime(ev.uploadedAt)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

const MissionCard = memo(MissionCardComponent);
export default MissionCard;
