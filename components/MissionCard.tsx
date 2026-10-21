
import React, { memo, useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { authFetch } from '../lib/authFetch';
import { formatDateBR, formatDateTimeBR, formatTimeBR } from '../lib/dateUtils';
import { pickLiveMissionUpdate } from '../lib/missionLiveUpdate';
import { buildChargeUpdateMessage } from '../lib/chargeUpdateMessage';
import { copyTextAsync } from '../lib/clipboard';
import { Mission, MissionStatus, MissionLog, ClientPriceTable, ProviderCostTable, Client } from '../types';
import { supabase } from '../lib/supabase';
import { 
  Truck, User, Phone, EyeOff, ShieldCheck, UserCheck, 
  Map, Pencil, Eye, Check, Trash2, FileText, Clock, Calendar, Navigation, Hourglass, History, Mail, MapPin, AlertOctagon, AlertTriangle, Printer, FileSearch, DollarSign, Layers, Calculator, Flag, Activity, Briefcase, Shield, ImageOff, Image, X, Upload, Loader2, Camera, Link2, Lock, ClipboardList, Copy, MoreHorizontal, ChevronRight, Play, Coins, BarChart3, Database
} from 'lucide-react';

const WhatsAppIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);
import MissionRouteProgressBar, { type FallbackProgress } from './MissionRouteProgressBar';
import MissionTimer from './MissionTimer';
import { useNotification } from '../lib/NotificationContext';
import { applyRegionSuffix, calculateMissionFinancials, auditMissionFinancials, hasPersistedProviderCost, resolveDisplayedProviderCost } from '../lib/financialUtils';
import { formatProviderName, resolveLocationDisplay, extractCoordinates } from '../lib/utils';
import { isMissionOpsIncomplete, getMissionOpsMissingFields, isOpsAlertRecipient } from '../lib/missionOpsIncomplete';
import LiveTrackPanel from './LiveTrackPanel';
import { isVeladaMission } from '../lib/liveTrack/isVeladaMission';
import { isVeladaFinalKmPending } from '../lib/veladaClosureAlert';
import { isOsNegativeMarginLocked } from '../lib/osNegativeMarginLock';
import { missionHasOccurrence, OCCURRENCE_BANNER } from '../lib/missionOccurrence';
import { PANEL_LAYER_META, type MissionPanelLayer } from '../lib/missionPanelLayers';
import MissionOccurrenceDialog from './MissionOccurrenceDialog';
import MissionHandoverNoteButton, { type HandoverNote } from './MissionHandoverNoteButton';
import Vehicle3DCard from './os/Vehicle3DCard';
import PainelSuspensoOs, { FichaOs } from './os/FichaSuspensaOs';
import { resolverLogoCliente } from '../lib/os/visualCaminhao';
import EscortCinematic3DCard from './os/EscortCinematic3DCard';
import MapaNoturnoOs from './os/MapaNoturnoOs';
import './os/cardOsPremium.css';

const geocodeCache: Record<string, string> = {};
const geocodePending: Record<string, Promise<string>> = {};

const reverseGeocodeAddress = async (lat: number, lng: number): Promise<string> => {
    const cacheKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    const cached = geocodeCache[cacheKey];
    if (cached) return cached;
    if (geocodePending[cacheKey]) return geocodePending[cacheKey];

    const promise = (async () => {
        try {
            const resp = await authFetch(`/api/reverse-geocode?lat=${lat}&lng=${lng}`);
            const data = await resp.json();
            if (data.success && data.address) {
                geocodeCache[cacheKey] = data.address;
                delete geocodePending[cacheKey];
                return data.address;
            }
        } catch (e) {
            console.warn('[LOCATION] Card geocode failed:', e);
        }
        delete geocodePending[cacheKey];
        return '';
    })();
    geocodePending[cacheKey] = promise;
    return promise;
};

interface MissionCardProps {
    mission: Mission;
    canEditMission: boolean;
    isDirector: boolean;
    canSeeBillingSummary?: boolean;
    hideFinancialInfo?: boolean;
    isRedLight: boolean;
    isImminent: boolean;
    minutesSinceUpdate: number;
    panelLayer?: MissionPanelLayer;
    copiedId: string | null;
    isSendingEmail?: string;
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
    onActionPlan?: (m: Mission) => void;
    lastLog?: MissionLog;
    onEvidenceUploaded?: () => void;
    clientTables: ClientPriceTable[];
    providerTables: ProviderCostTable[];
    clientsData: Client[];
    agentPhonesMap?: Record<string, string>;
    currentTime?: Date;
    approvalStages?: { stage: string; date: string }[];
    evidenceList?: { url: string; uploadedBy: string; uploadedAt: string }[];
    dhlIntake?: { status: string; providerFilledAt: string | null; intakeId: string; progressAgent1?: boolean; progressAgent2?: boolean; progressVehicle?: boolean; progressMirror?: boolean };
    tollConfirmation?: { user: string; date: string; hasToll: boolean; value: number; source?: string };
    handoverNote?: HandoverNote | null;
    onHandoverNoteSaved?: (note: HandoverNote) => void;
}

const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'R$ 0,00';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const AgingTimelineBar: React.FC<{ minutes: number; status: string }> = ({ minutes, status }) => {
    const isFuture = [MissionStatus.SOLICITED, MissionStatus.SCHEDULED, MissionStatus.DOCUMENTATION].includes(status as MissionStatus);
    
    if (isFuture && minutes === 0) return null;

    let label = 'Atualizado';

    if (minutes >= 120) {
        label = 'Ocioso';
    } else if (minutes >= 30) {
        label = 'Atenção';
    }

    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    const timeDisplay = hours > 0 ? `${hours}h ${mins}min` : `${mins} min`;

    const tom = minutes >= 120 ? 'os-id-atencao--ocioso' : minutes >= 30 ? 'os-id-atencao--alerta' : 'os-id-atencao--ok';
    const selo = minutes >= 120 ? 'OCIOSO' : minutes >= 30 ? 'ATRASO' : 'EM DIA';
    return (
        <div className={`os-id-atencao ${tom}`} title="Tempo sem atualização (Ociosidade)">
            <span className="os-id-icone">{minutes >= 30 ? <AlertTriangle size={14} /> : <History size={14} />}</span>
            <span className="os-id-texto">
                <small>{label}</small>
                <strong>{timeDisplay} sem atualização</strong>
            </span>
            <span className={`os-id-selo ${minutes >= 30 ? 'os-id-selo--atraso' : 'os-id-selo--ok'}`}>
                {minutes >= 30 ? <AlertTriangle size={11} /> : <Check size={11} />} {selo}
            </span>
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
    mission, canEditMission, isDirector, canSeeBillingSummary = false, hideFinancialInfo = false, isRedLight, isImminent, minutesSinceUpdate, panelLayer, copiedId, isSendingEmail, hideProviderInfo,
    onViewMap, onUpdate, onOpenFinancials, onCopy, onCopyEmail, onDelete, onPrint, onViewHistory, onFullReport, onOperationalReport, onActionPlan, lastLog, onEvidenceUploaded,
    clientTables, providerTables, clientsData, agentPhonesMap, currentTime, approvalStages, evidenceList, dhlIntake, tollConfirmation,
    handoverNote, onHandoverNoteSaved
}) => {
    
    const { showNotification } = useNotification();
    const [chargeCopied, setChargeCopied] = useState(false);
    const [showEvidenceModal, setShowEvidenceModal] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [pendingFiles, setPendingFiles] = useState<{ file: File; preview: string }[]>([]);
    const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
    const [occurrenceOpen, setOccurrenceOpen] = useState(false);
    const [occurrenceCount, setOccurrenceCount] = useState<number | null>(null);
    const uploadFileInputRef = useRef<HTMLInputElement>(null);
    const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
    
    const locationInfo = useMemo(() => resolveLocationDisplay(mission.currentLocation || '', mission.mapLink), [mission.currentLocation, mission.mapLink]);

    useEffect(() => {
        if (!locationInfo.needsGeocode) {
            setResolvedAddress(null);
            return;
        }
        if (!locationInfo.coords) {
            setResolvedAddress('LOCALIZAÇÃO VIA GPS');
            return;
        }
        let cancelled = false;
        const { lat, lng } = locationInfo.coords;
        const cacheKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;
        const cached = geocodeCache[cacheKey];
        if (cached) {
            setResolvedAddress(cached);
            return;
        }
        setResolvedAddress(null);
        reverseGeocodeAddress(lat, lng).then(addr => {
            if (!cancelled) setResolvedAddress(addr || 'LOCALIZAÇÃO VIA GPS');
        });
        return () => { cancelled = true; };
    }, [locationInfo.needsGeocode, locationInfo.coords?.lat, locationInfo.coords?.lng]);
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
        if (!isDirector && !canSeeBillingSummary && !hideProviderInfo) return null;
        const clientName = ((mission as any).originalClientName || mission.client || '').trim();
        const client = clientsData.find(c => c.name === clientName);
        return calculateMissionFinancials(mission, clientTables, providerTables, client, currentTime);
    }, [mission, clientTables, providerTables, clientsData, isDirector, canSeeBillingSummary, hideProviderInfo, currentTime]);

    const isExtraHourActive = useMemo(() => {
        if (!hideProviderInfo && !isDirector && !canSeeBillingSummary) return false;
        if (!financials) return false;
        if (isTerminal) return false;
        if (![MissionStatus.ORIGIN, MissionStatus.IN_TRANSIT].includes(mission.status as MissionStatus)) return false;
        // Para cliente restrito mantém a leitura pela tabela do cliente.
        // Para diretoria, considera estourada se QUALQUER lado (cliente ou fornecedor) já passou da franquia.
        const clientExcess = financials.client.excessHours > 0;
        const providerExcess = financials.provider?.excessHours > 0;
        return hideProviderInfo ? clientExcess : (clientExcess || providerExcess);
    }, [financials, isTerminal, mission.status, hideProviderInfo, isDirector, canSeeBillingSummary]);

    const formatExcessTime = (hours: number) => {
        const totalSeconds = Math.round(hours * 3600);
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
    };

    const hasBeenVerified = !!(mission as any).billing_verified_by;

    const auditResult = useMemo(() => {
        if ((!isDirector && !canSeeBillingSummary) || !isTerminal) return null;
        const storedRev = (mission.revenue_value || 0);
        const storedCost = (mission.cost_value || 0);
        if (storedRev === 0 && storedCost === 0) return null;
        const clientName = ((mission as any).originalClientName || mission.client || '').trim();
        const client = clientsData.find(c => c.name === clientName);
        return auditMissionFinancials(mission, clientTables, providerTables, client);
    }, [mission, clientTables, providerTables, clientsData, isDirector, canSeeBillingSummary, isTerminal]);

    const displayRevenue = useMemo(() => {
        const dbToll = Math.max(0, mission.toll_value || 0);
        const dbDisp = Math.max(0, (mission as any).displacement_value || 0);
        const storedValue = (mission.revenue_value || 0) + dbToll + dbDisp;
        const hasStoredRevenue = (mission.revenue_value != null && mission.revenue_value > 0);
        
        if (hasStoredRevenue) {
            return storedValue;
        }
        
        if (financials && mission.status === MissionStatus.IN_TRANSIT) {
            return financials.client.total;
        }

        return storedValue;
    }, [mission.revenue_value, mission.toll_value, (mission as any).displacement_value, mission.status, financials]);

    const displayCost = useMemo(() => {
        return resolveDisplayedProviderCost({
            costValue: mission.cost_value,
            tollValueProvider: mission.toll_value_provider,
            tollValue: mission.toll_value,
            displacementValueProvider: (mission as any).displacement_value_provider,
            isSameOs: (mission as any).is_same_os === true,
            billingApproved: mission.billing_approved,
            billingVerifiedBy: (mission as any).billing_verified_by,
            costEditReason: (mission as any).cost_edit_reason,
            status: mission.status,
            projectedProviderTotal: financials?.provider?.total,
        });
    }, [mission.cost_value, mission.toll_value, mission.toll_value_provider, (mission as any).displacement_value_provider, (mission as any).is_same_os, mission.billing_approved, (mission as any).billing_verified_by, (mission as any).cost_edit_reason, mission.status, financials]);

    const profitMargin = useMemo(() => {
        return displayRevenue > 0 ? ((displayRevenue - displayCost) / displayRevenue) * 100 : 0;
    }, [displayRevenue, displayCost]);
    const isNegativeProfit = !hideFinancialInfo && profitMargin < 0;
    const mostraColunaFinanceira =
        (!hideFinancialInfo && (isDirector || canSeeBillingSummary) && !hideProviderInfo) ||
        (!hideFinancialInfo && hideProviderInfo && !!financials);

    const isActive = !isTerminal;

    const opsMissingFields = useMemo(() => getMissionOpsMissingFields(mission), [mission]);

    const showOpsPendingAlert = useMemo(() => {
        try {
            const user = JSON.parse(localStorage.getItem('userData') || '{}');
            return isOpsAlertRecipient(user) && isMissionOpsIncomplete(mission);
        } catch {
            return false;
        }
    }, [mission]);

    const showVeladaKmPending = useMemo(() => isVeladaFinalKmPending(mission), [mission]);

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
        if ((destUpper.includes('02H') || destUpper.includes('02 HORAS') || destUpper.includes('100KM')) && clientUpper.includes('VTC')) return '100.0 KM';
        let dist = mission.totalDistance || 0;
        if (dist > 10000) dist = dist / 1000;
        return `${dist || '0.0'} KM`;
    }, [mission.destination, mission.client, mission.totalDistance]);

    const handlePrintClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const dateObj = new Date(mission.startTime || mission.createdAt);
        const dateStr = formatDateBR(dateObj);
        const timeStr = formatTimeBR(dateObj);
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

    const handleCopyChargeUpdate = () => {
        const text = buildChargeUpdateMessage({
            osId: mission.id,
            origin: mission.origin,
            destination: mission.destination,
            plate: mission.clientVehicle?.plate,
            agent1: mission.agent1,
            agent2: mission.agent2,
            agent1Phone: mission.agent1 ? agentPhonesMap?.[mission.agent1] : undefined,
            agent2Phone: mission.agent2 ? agentPhonesMap?.[mission.agent2] : undefined,
        });
        void copyTextAsync(text).then(ok => {
            if (!ok) {
                showNotification('Erro', 'Não foi possível copiar. Tente novamente.', 'error');
                return;
            }
            setChargeCopied(true);
            showNotification('Copiado', 'Cobrança de atualização pronta para colar no WhatsApp.', 'success');
            window.setTimeout(() => setChargeCopied(false), 2000);
        });
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
    const isAdjustedCost = hasPersistedProviderCost(mission);

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
            if (!hasFinanceiro) missing.push('Financeiro');
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

    const { fallbackProgress } = useMemo((): {
        fallbackProgress: FallbackProgress;
    } => {
        const emptyFallback = (source: FallbackProgress['source'], plannedKm = 0, traveledKm = 0): FallbackProgress => ({
            progressVisual: 0,
            progressReal: 0,
            odometerAnomaly: false,
            traveledKm,
            plannedKm,
            source,
        });

        const destUpper = (mission.destination || '').toUpperCase();
        const clientUpper = (mission.client || '').toUpperCase();
        const isLogitech = clientUpper.includes('CEVA') && (destUpper.includes('LOGITECH') || (mission as any).operation_type?.toUpperCase()?.includes('LOGITECH'));
        let plannedKm = mission.totalDistance || 0;
        if (plannedKm > 10000) plannedKm = plannedKm / 1000;
        if (isLogitech || destUpper.includes('200KM')) plannedKm = 200;
        else if ((destUpper.includes('02H') || destUpper.includes('02 HORAS') || destUpper.includes('100KM')) && clientUpper.includes('VTC')) plannedKm = 100;

        if (mission.status === MissionStatus.COMPLETED) {
            return {
                fallbackProgress: { progressVisual: 100, progressReal: 100, odometerAnomaly: false, traveledKm: plannedKm, plannedKm, source: 'terminal' },
            };
        }
        if (mission.status === MissionStatus.CANCELLED || mission.status === MissionStatus.REFUSED) {
            const fallback = mission.progress || 0;
            return {
                fallbackProgress: { progressVisual: Math.min(100, fallback), progressReal: fallback, odometerAnomaly: false, traveledKm: 0, plannedKm, source: 'terminal' },
            };
        }

        const occurrenceUpper = (mission.currentLocation || '').toUpperCase();
        const isAtDestination = occurrenceUpper.includes('DESTINO') ||
            occurrenceUpper.includes('ENTREGUE') ||
            occurrenceUpper.includes('PONTO C') ||
            occurrenceUpper.includes('DESCARREGADO') ||
            occurrenceUpper.includes('FINALIZADO') ||
            occurrenceUpper.includes('CONCLUÍ');
        if (isAtDestination) {
            return {
                fallbackProgress: { progressVisual: 100, progressReal: 100, odometerAnomaly: false, traveledKm: plannedKm, plannedKm, source: 'destination' },
            };
        }

        const savedProgress = mission.progress || 0;
        const sKm = mission.startKm || 0;
        const eKm = mission.endKm || 0;
        const kmRodado = eKm > sKm ? (eKm - sKm) : (mission.traveledDistance || 0);

        const hasAnomaly = plannedKm > 0 && kmRodado > 0 && kmRodado > plannedKm * 5;

        if (hasAnomaly) {
            const vis = Math.min(100, Math.max(0, savedProgress));
            return {
                fallbackProgress: { progressVisual: vis, progressReal: savedProgress, odometerAnomaly: true, traveledKm: kmRodado, plannedKm, source: 'odometer' },
            };
        }

        if (kmRodado > 0 && plannedKm > 0) {
            const pct = (kmRodado / plannedKm) * 100;
            const rounded = pct >= 95 ? 100 : Math.min(100, Math.max(0, Math.round(pct)));
            return {
                fallbackProgress: { progressVisual: rounded, progressReal: Math.round(pct), odometerAnomaly: false, traveledKm: kmRodado, plannedKm, source: 'odometer' },
            };
        }

        if (savedProgress > 0) {
            const vis = Math.min(100, Math.max(0, savedProgress));
            return {
                fallbackProgress: { progressVisual: vis, progressReal: savedProgress, odometerAnomaly: false, traveledKm: 0, plannedKm, source: 'saved' },
            };
        }

        const isInTransit = mission.status === MissionStatus.IN_TRANSIT || mission.status === 'Em Trânsito' || mission.status === 'Em trânsito';
        if (isInTransit && mission.startTime && plannedKm > 0) {
            const startMs = new Date(mission.startTime).getTime();
            const nowMs = Date.now();
            const elapsedHours = (nowMs - startMs) / (1000 * 60 * 60);

            let estimatedHours = 0;
            if (mission.estimatedTime) {
                const etMatch = mission.estimatedTime.match(/(\d+)\s*h/i);
                const emMatch = mission.estimatedTime.match(/(\d+)\s*min/i);
                if (etMatch) estimatedHours += parseInt(etMatch[1]);
                if (emMatch) estimatedHours += parseInt(emMatch[1]) / 60;
            }
            if (estimatedHours <= 0) {
                estimatedHours = plannedKm / 60;
            }

            if (estimatedHours > 0 && elapsedHours > 0) {
                const timePct = Math.round((elapsedHours / estimatedHours) * 100);
                const clampedPct = Math.min(95, Math.max(1, timePct));
                return {
                    fallbackProgress: { progressVisual: clampedPct, progressReal: clampedPct, odometerAnomaly: false, traveledKm: 0, plannedKm, source: 'time' },
                };
            }
        }

        if (isInTransit && mission.startTime) {
            const startMs = new Date(mission.startTime).getTime();
            const nowMs = Date.now();
            const elapsedMinutes = (nowMs - startMs) / (1000 * 60);
            if (elapsedMinutes > 5) {
                const minProgress = Math.min(10, Math.max(1, Math.round(elapsedMinutes / 30)));
                return {
                    fallbackProgress: { progressVisual: minProgress, progressReal: minProgress, odometerAnomaly: false, traveledKm: 0, plannedKm, source: 'time' },
                };
            }
        }

        return {
            fallbackProgress: emptyFallback('saved', plannedKm, 0),
        };
    }, [mission.startKm, mission.endKm, mission.traveledDistance, mission.totalDistance, mission.destination, mission.client, mission.progress, mission.status, mission.currentLocation, mission.startTime, mission.estimatedTime]);

    const isTrackingActive = useMemo(() => {
        const terminal = [MissionStatus.COMPLETED, MissionStatus.CANCELLED, MissionStatus.REFUSED];
        return !terminal.includes(mission.status as MissionStatus) && !!mission.origin && !!mission.destination;
    }, [mission.status, mission.origin, mission.destination]);

    return (<>
        <div 
          className={`os-card group relative overflow-visible rounded-[14px] border transition-all duration-300 hover:-translate-y-0.5 ${
              isNegativeProfit ? 'bg-red-50 border-red-400 ring-2 ring-red-300 shadow-red-200 shadow-md hover:shadow-[0_18px_40px_rgba(220,38,38,0.16)]' : 'bg-white border-slate-200/80 shadow-[0_16px_36px_rgba(15,23,42,0.08)] hover:shadow-[0_22px_48px_rgba(15,23,42,0.14)]'
          } ${
              !isNegativeProfit && (isRedLight ? 'border-red-200 ring-1 ring-red-100' : isImminent ? 'border-amber-200 ring-1 ring-amber-100' : 'border-slate-200 hover:border-slate-300')
          }`}
        >
            {panelLayer && (
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${PANEL_LAYER_META[panelLayer].rail}`} />
            )}
            {isNegativeProfit && (
                <div className="relative overflow-hidden rounded-t-xl" style={{ background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 50%, #991b1b 100%)', boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.2), 0 4px 12px rgba(220,38,38,0.3)' }}>
                    <div className="flex items-center justify-center gap-2 py-1.5 px-3 relative z-10">
                        <AlertTriangle size={13} className="text-white drop-shadow-md animate-pulse" strokeWidth={3} />
                        <span className="text-[12px] font-black text-white uppercase tracking-widest drop-shadow-md">PREJUÍZO — {profitMargin.toFixed(1)}%</span>
                    </div>
                </div>
            )}
            {isExtraHourActive && (
                <div className="relative overflow-hidden rounded-t-xl" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%)', boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.3), inset 0 -2px 4px rgba(0,0,0,0.2), 0 4px 12px rgba(245,158,11,0.4), 0 2px 4px rgba(0,0,0,0.15)' }}>
                    <div className="flex items-center justify-center gap-2 py-2 px-3 relative z-10">
                        <div className="relative">
                            <Clock size={14} className="text-white drop-shadow-md animate-pulse" strokeWidth={3} />
                            <div className="absolute -inset-1 bg-white/20 rounded-full blur-sm animate-ping"></div>
                        </div>
                        <span className="text-[13px] font-black text-white uppercase tracking-widest drop-shadow-md" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.4), 0 0 8px rgba(255,255,255,0.15)' }}>
                            Hora Extra Ativa
                        </span>
                        <span className="text-[12px] font-black text-yellow-100 bg-black/20 px-2 py-0.5 rounded-full" style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)' }}>
                            +{financials ? formatExcessTime(Math.max(financials.client.excessHours || 0, financials.provider?.excessHours || 0)) : ''}
                        </span>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse pointer-events-none"></div>
                </div>
            )}
            {showOpsPendingAlert && (
                <div className={`bg-red-600 text-white text-[12px] font-bold uppercase py-1.5 px-3 flex items-center justify-center gap-2 animate-pulse ${isExtraHourActive ? '' : 'rounded-t-xl'}`} data-testid="banner-ops-pending-card">
                    <AlertOctagon size={12} strokeWidth={3} /> PENDENTE: {opsMissingFields.join(' • ')}
                </div>
            )}
            {!showOpsPendingAlert && !hideProviderInfo && missingInfo.length > 0 && (
                <div className={`bg-red-600 text-white text-[12px] font-bold uppercase py-1.5 px-3 flex items-center justify-center gap-2 animate-pulse ${isExtraHourActive ? '' : 'rounded-t-xl'}`}>
                    <AlertOctagon size={12} strokeWidth={3} /> PENDENTE: {missingInfo.join(' • ')}
                </div>
            )}
            {(() => {
                if (hideProviderInfo) return null;
                if (!dhlIntake) return null;
                if (dhlIntake.status !== 'pendente') return null;
                if (dhlIntake.providerFilledAt) return null;
                const isTerminalStatus = [MissionStatus.COMPLETED, MissionStatus.CANCELLED, MissionStatus.REFUSED].includes(mission.status);
                if (isTerminalStatus) return null;
                const isDhlBanner = /DHL/i.test(((mission as any).originalClientName || mission.client || ''));
                const fornecedorLabel = isDhlBanner ? 'FORNECEDOR DHL' : 'FORNECEDOR';
                const now = (currentTime || new Date()).getTime();
                const startMs = mission.startTime ? new Date(mission.startTime).getTime() : 0;
                const minutesToStart = startMs > 0 ? (startMs - now) / 60000 : Number.POSITIVE_INFINITY;
                const urgent = startMs > 0 && minutesToStart <= 120 && minutesToStart >= 0;
                const hoursLabel = startMs > 0 ? (
                    minutesToStart >= 0
                        ? (minutesToStart >= 60 ? `${Math.floor(minutesToStart / 60)}h${String(Math.floor(minutesToStart % 60)).padStart(2, '0')}` : `${Math.max(0, Math.floor(minutesToStart))}min`)
                        : 'INICIADA'
                ) : '';
                if (urgent) {
                    return (
                        <div
                            className={`relative text-[12px] font-black uppercase py-1.5 px-3 flex items-center justify-center gap-2 overflow-hidden ${isExtraHourActive || showOpsPendingAlert || missingInfo.length > 0 ? '' : 'rounded-t-xl'} animate-pulse`}
                            style={{ background: 'repeating-linear-gradient(135deg, #facc15 0 12px, #dc2626 12px 24px)', color: '#1f2937', textShadow: '0 1px 0 rgba(255,255,255,0.6)' }}
                            title={`${isDhlBanner ? 'Fornecedor DHL' : 'Fornecedor'} ainda nao preencheu — missao comeca em menos de 2 horas`}
                        >
                            <span className="absolute inset-0 bg-white/20 animate-pulse pointer-events-none" />
                            <AlertTriangle size={14} strokeWidth={3} className="text-red-900 drop-shadow animate-bounce" />
                            <span className="tracking-wider">{fornecedorLabel} NAO PREENCHEU — INICIO EM {hoursLabel || '< 2H'}</span>
                            <AlertTriangle size={14} strokeWidth={3} className="text-red-900 drop-shadow animate-bounce" />
                        </div>
                    );
                }
                return (
                    <div
                        className={`bg-amber-300 text-amber-950 text-[12px] font-black uppercase py-1.5 px-3 flex items-center justify-center gap-2 border-y-2 border-amber-600 ${isExtraHourActive || showOpsPendingAlert || missingInfo.length > 0 ? '' : 'rounded-t-xl'}`}
                        title={`${isDhlBanner ? 'Fornecedor DHL' : 'Fornecedor'} ainda nao preencheu os dados — cobrar preenchimento`}
                    >
                        <AlertTriangle size={12} strokeWidth={3} /> PENDENTE {fornecedorLabel} PREENCHER {hoursLabel ? `• INICIO EM ${hoursLabel}` : ''}
                    </div>
                );
            })()}
            {!hideProviderInfo && missionHasOccurrence(occurrenceCount ?? mission.occurrence_count) && (
                <button
                    type="button"
                    onClick={() => setOccurrenceOpen(true)}
                    className="w-full bg-orange-600 text-white text-[12px] font-black uppercase py-1.5 px-3 flex items-center justify-center gap-2"
                    data-testid={`banner-occurrence-${mission.id}`}
                >
                    <AlertTriangle size={12} strokeWidth={3} /> {OCCURRENCE_BANNER}
                </button>
            )}
            {!hideProviderInfo && showVeladaKmPending && (
                <div
                    className="w-full bg-amber-500 text-amber-950 text-[12px] font-black uppercase py-1.5 px-3 flex items-center justify-center gap-2 animate-pulse"
                    data-testid={`banner-velada-km-pending-${mission.id}`}
                    title="Missão velada finalizada. Falta o KM final para cobrar o fornecedor."
                >
                    <AlertTriangle size={12} strokeWidth={3} /> Falta KM final — cobrar o fornecedor
                </div>
            )}
            <div className={`absolute bottom-0 left-0 right-0 h-1 rounded-b-xl transition-colors ${isRedLight ? 'bg-red-500' : isImminent ? 'bg-amber-500' : 'bg-transparent'}`}></div>
            <div className={`os-miolo${mostraColunaFinanceira ? '' : ' os-miolo--sem-fin'} grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-12 min-h-0 divide-y sm:divide-y xl:divide-y-0 xl:divide-x divide-gray-100 items-stretch`}>
                <div className="os-col-id sm:col-span-1 xl:col-span-2 flex flex-col justify-between items-stretch gap-2 min-w-0">
                    <div className="os-id-cabeca">
                        <div className="os-id-nome">
                            <span className="os-id-gtm">{mission.id}</span>
                            {(/DHL/i.test(((mission as any).originalClientName || mission.client || ''))) && (mission as any).dhl_se_number ? (
                                <span className="os-id-se" title="Número da SE DHL" data-testid={`badge-se-${mission.id}`}>
                                    SE: {String((mission as any).dhl_se_number).toUpperCase()}
                                </span>
                            ) : null}
                        </div>
                        <div className="os-id-atalhos">
                            <button type="button" className="os-id-atalho os-id-atalho--link" title="Abrir localização salva nesta OS" onClick={(e) => { e.stopPropagation(); if (mission.mapLink) window.open(mission.mapLink, '_blank'); else alert('Nenhuma localização salva nesta OS.'); }}>
                                <Link2 size={16} />
                            </button>
                            <button type="button" className={`os-id-atalho ${copiedId === mission.id ? 'os-id-atalho--ok' : 'os-id-atalho--copiar'}`} title="Copiar relatório WhatsApp" onClick={(e) => { e.stopPropagation(); onCopy(mission); }}>
                                {copiedId === mission.id ? <Check size={16} /> : <Copy size={16} />}
                            </button>
                            <details className="os-id-mais">
                                <summary className="os-id-atalho" title="Mais ações"><MoreHorizontal size={16} /></summary>
                                <div className="os-id-mais-lista">
                                    <button type="button" onClick={() => onUpdate(mission)}>Atualizar</button>
                                    <button type="button" onClick={() => onViewMap(mission)}>Mapa</button>
                                    <button type="button" onClick={() => onCopyEmail(mission)}>E-mail ao cliente</button>
                                    {onViewHistory && isDirector ? <button type="button" onClick={() => onViewHistory(mission)}>Histórico</button> : null}
                                </div>
                            </details>
                        </div>
                    </div>
                    <div className="os-id-pills">
                        {isOsNegativeMarginLocked(mission) && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-slate-800 text-white border border-slate-900 shadow-sm flex items-center gap-1" title={`Prejuízo analisado por ${mission.negative_margin_locked_by || 'a equipe'}. Somente a Diretoria pode alterar.`} data-testid={`badge-negative-lock-${mission.id}`}>
                                <Lock size={10} /> TRAVADA
                            </span>
                        )}
                        {(/DHL/i.test(((mission as any).originalClientName || mission.client || ''))) && (mission as any).dhl_sm_number ? (
                            <span className={`px-1.5 py-0.5 rounded text-[11px] font-black uppercase border shadow-sm flex items-center gap-1 ${isOsNegativeMarginLocked(mission) ? 'bg-slate-800 text-white border-slate-900' : 'bg-amber-100 text-amber-800 border-amber-400'}`} title={isOsNegativeMarginLocked(mission) ? 'SM travada — somente a Diretoria altera' : 'Número da SM DHL'} data-testid={`badge-sm-${mission.id}`}>
                                {isOsNegativeMarginLocked(mission) && <Lock size={10} />}
                                SM: {String((mission as any).dhl_sm_number).toUpperCase()}
                            </span>
                        ) : null}
                        {mission.is_same_os && !hideProviderInfo && (
                            <span className="bg-black text-white px-1.5 py-0.5 rounded text-[10px] font-black uppercase flex items-center gap-1 border border-black shadow-sm" title={mission.parent_mission_id ? `OS Mãe: ${mission.parent_mission_id}` : 'Missão de continuidade - Custo Fornecedor Zero'}>
                                <Layers size={10} /> MESMA OS
                            </span>
                        )}
                        {mission.is_same_os && mission.parent_mission_id && !hideProviderInfo && (
                            <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded text-[10px] font-black uppercase flex items-center gap-1 border border-blue-700 shadow-sm" title={`Vinculada à OS Principal: ${mission.parent_mission_id}`}>
                                <Link2 size={10} /> MÃE: {mission.parent_mission_id}
                            </span>
                        )}
                        <span className={`os-id-status ${showOpsPendingAlert ? 'bg-amber-100 text-amber-800' : getStatusBadgeClass(mission.status)}`}>
                            <Truck size={14} />
                            {showOpsPendingAlert ? 'PENDENTE DADOS' : mission.status}
                            <i className="os-id-ponto" />
                        </span>
                        {!hideFinancialInfo && (() => {
                            if (tollConfirmation) {
                                const dt = tollConfirmation.date ? new Date(tollConfirmation.date) : null;
                                const dtStr = dt && !isNaN(dt.getTime()) ? formatDateTimeBR(dt) : '—';
                                const label = tollConfirmation.hasToll ? `Pedágio confirmado (R$ ${tollConfirmation.value.toFixed(2)}) por ${tollConfirmation.user} em ${dtStr}` : `Pedágio confirmado como ZERO por ${tollConfirmation.user} em ${dtStr}`;
                                return (
                                    <span title={label} className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase flex items-center gap-1 bg-green-100 text-green-700 border border-green-300 shadow-sm" data-testid={`badge-toll-status-confirmed-${mission.id}`}>
                                        <Check size={10} strokeWidth={3} /> PEDÁGIO OK
                                    </span>
                                );
                            }
                            if (mission.status === MissionStatus.COMPLETED && !mission.billing_approved) {
                                return (
                                    <span title="Pedágio ainda não confirmado manualmente — operacional precisa validar antes do faturamento" className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase flex items-center gap-1 bg-amber-100 text-amber-700 border border-amber-300 shadow-sm animate-pulse" data-testid={`badge-toll-status-unconfirmed-${mission.id}`}>
                                        <AlertTriangle size={10} strokeWidth={3} /> PEDÁGIO PEND.
                                    </span>
                                );
                            }
                            return null;
                        })()}
                        {hasEvidence ? (
                            <button onClick={() => setShowEvidenceModal(true)} className="os-id-evidencia flex items-center gap-1" data-testid={`badge-evidence-${mission.id}`} title="Evidência anexada - clique para ver">
                                <Image size={14} /> EVIDÊNCIA
                            </button>
                        ) : requiresEvidence ? (
                            <span className="os-id-evidencia os-id-evidencia--falta flex items-center gap-1" title="Sem evidência de solicitação">
                                <ImageOff size={14} /> SEM EVIDÊNCIA
                            </span>
                        ) : null}
                    </div>
                    {!hideProviderInfo && (/DHL/i.test(((mission as any).originalClientName || mission.client || ''))) && !dhlIntake ? (
                        <span
                            className="os-id-doc os-id-doc--espera"
                            title="Link do fornecedor ainda não foi gerado para esta OS — gere o link de Intake DHL."
                            data-testid={`badge-intake-sem-link-${mission.id}`}
                        >
                            <AlertTriangle size={16} /> Documento aguardando link <ChevronRight size={16} className="os-id-doc-seta" />
                        </span>
                    ) : null}
                    {!hideProviderInfo && dhlIntake ? (() => {
                        const a1 = !!dhlIntake.progressAgent1;
                        const a2 = !!dhlIntake.progressAgent2;
                        const vh = !!dhlIntake.progressVehicle;
                        const mr = !!dhlIntake.progressMirror;
                        const done = [a1, a2, vh, mr].filter(Boolean).length;
                        const allGreen = done === 4 || dhlIntake.status === 'preenchido' || !!dhlIntake.providerFilledAt;
                        if (allGreen) {
                            return (
                                <span
                                    className="os-id-doc os-id-doc--ok"
                                    title="Documentação do fornecedor completa — Escoltista 1, Escoltista 2, Veículo e Espelhamento enviados."
                                    data-testid={`badge-intake-apto-${mission.id}`}
                                >
                                    <Check size={16} /> Documento completo <ChevronRight size={16} className="os-id-doc-seta" />
                                </span>
                            );
                        }
                        const missing: string[] = [];
                        if (!a1) missing.push('Escoltista 1');
                        if (!a2) missing.push('Escoltista 2');
                        if (!vh) missing.push('Veículo');
                        if (!mr) missing.push('Espelhamento');
                        const isEmpty = done === 0;
                        return (
                            <span
                                className={`os-id-doc ${isEmpty ? 'os-id-doc--falta' : 'os-id-doc--espera'}`}
                                title={`Documentação faltando (${done}/4 preenchidos pelo fornecedor). Falta: ${missing.join(', ')}.`}
                                data-testid={`badge-intake-pendente-${mission.id}`}
                            >
                                <AlertTriangle size={16} /> Documento faltando {done}/4 <ChevronRight size={16} className="os-id-doc-seta" />
                            </span>
                        );
                    })() : null}
                    <div className="os-id-datas">
                        <div className="os-id-linha">
                            <span className="os-id-icone os-id-icone--azul"><Calendar size={16} /></span>
                            <span className="os-id-texto"><small>Criação</small><strong className="os-id-quando">{formatDateTime(mission.createdAt).replace(" - ", " · ")}</strong></span>
                            <Clock size={16} className="os-id-relogio" />
                        </div>
                        <div className="os-id-linha">
                            <span className="os-id-icone os-id-icone--azul"><Calendar size={16} /></span>
                            <span className="os-id-texto"><small>Agendamento</small><strong className="os-id-quando">{mission.startTime ? formatDateTime(mission.startTime).replace(" - ", " · ") : "Imediato"}</strong></span>
                            <Clock size={16} className="os-id-relogio" />
                        </div>
                    </div>
                    {(!showOpsPendingAlert && ([MissionStatus.ORIGIN, MissionStatus.IN_TRANSIT].includes(mission.status as MissionStatus) || ([MissionStatus.SOLICITED, MissionStatus.SCHEDULED, MissionStatus.DOCUMENTATION].includes(mission.status as MissionStatus) && !!mission.startTime))) ? (
                        <div className={`os-id-operacao ${[MissionStatus.ORIGIN, MissionStatus.IN_TRANSIT].includes(mission.status as MissionStatus) ? 'os-id-operacao--ativa' : ''}`}>
                            <MissionTimer apresentacao="ficha" status={showOpsPendingAlert ? MissionStatus.PENDING : mission.status} startTime={mission.startTime} createdAt={mission.createdAt} />
                            {[MissionStatus.ORIGIN, MissionStatus.IN_TRANSIT].includes(mission.status as MissionStatus) ? (
                                <span className="os-id-selo os-id-selo--ok"><Play size={10} /> ATIVO</span>
                            ) : null}
                        </div>
                    ) : null}
                    <div className="w-full">{isActive && !showOpsPendingAlert ? (<AgingTimelineBar minutes={minutesSinceUpdate} status={mission.status} />) : (<div className="h-6 w-full text-center text-[12px] text-gray-400 font-bold uppercase tracking-wider opacity-50">{showOpsPendingAlert ? 'DADOS PENDENTES' : '-'}</div>)}</div>
                    
                </div>
                
                <div className="os-col-cliente sm:col-span-1 xl:col-span-3 p-2 flex flex-col justify-center bg-gray-50/20 border-r border-gray-100 min-w-0 h-full">
                    <PainelSuspensoOs painel={(() => {
                        const nomeOficial = String((mission as any).originalClientName || mission.client || "").trim();
                        const cadastro = clientsData.find((c) => c.name === nomeOficial || c.name === mission.client || (!!c.trading_name && c.trading_name === mission.client));
                        const live = pickLiveMissionUpdate(lastLog, mission);
                        const dt = live.at ? new Date(live.at) : null;
                        const quando = dt && !Number.isNaN(dt.getTime()) ? formatDateTimeBR(dt) : "";
                        const atualizacao = [quando, live.text, mission.updatedBy && mission.updatedBy !== "---" ? mission.updatedBy : ""].filter(Boolean).join(" · ");
                        const local = locationInfo.needsGeocode ? (resolvedAddress || (locationInfo.coords ? "Resolvendo endereço..." : "")) : (locationInfo.displayText || "");
                        const carga = [mission.clientVehicle?.brand, mission.clientVehicle?.model].map((parte) => String(parte || "").trim()).filter((parte) => parte && parte !== "---").join(" ");
                        const endereco = cadastro ? ([cadastro.street, cadastro.number, cadastro.neighborhood, [cadastro.city, cadastro.state].filter(Boolean).join(" - ")].filter(Boolean).join(", ") || cadastro.address) : "";
                        return (
                            <FichaOs
                                titulo="Cliente"
                                nome={mission.client || nomeOficial || "Cliente"}
                                complemento={nomeOficial}
                                logo={resolverLogoCliente(mission.client || "") || resolverLogoCliente(nomeOficial)}
                                atualizacao={atualizacao}
                                localizacao={local || "Sem posição"}
                                mapa={{ origem: mission.origin || "", destino: mission.destination || "", local, horario: quando, km: fallbackProgress.traveledKm }}
                                itens={[
                                    { rotulo: "CNPJ", valor: cadastro?.cnpj },
                                    { rotulo: "Contato", valor: cadastro?.contactName },
                                    { rotulo: "E-mail", valor: cadastro?.email },
                                    { rotulo: "Telefone", valor: cadastro?.phone },
                                    { rotulo: "Endereço", valor: endereco, largo: true },
                                    { rotulo: "Placa", valor: mission.clientVehicle?.plate },
                                    { rotulo: "Veículo", valor: carga },
                                    { rotulo: "Ano", valor: mission.clientVehicle?.year },
                                    { rotulo: "Cor", valor: mission.clientVehicle?.color },
                                    { rotulo: "Motorista", valor: getAgentDisplayName(mission.driver_name) },
                                    { rotulo: "Telefone do motorista", valor: mission.driver_phone },
                                    { rotulo: "Motorista 2", valor: getAgentDisplayName(mission.driver_name_2) },
                                    { rotulo: "Telefone 2", valor: mission.driver_phone_2 },
                                    { rotulo: "Origem", valor: mission.origin, largo: true },
                                    { rotulo: "Destino", valor: mission.destination, largo: true },
                                ]}
                            />
                        );
                    })()}>
                    <Vehicle3DCard
                        cliente={String((mission as any).originalClientName || mission.client || '')}
                        nome={mission.client}
                        placa={mission.clientVehicle?.plate}
                        modelo={mission.clientVehicle?.model}
                        motorista={getAgentDisplayName(mission.driver_name)}
                        telefone={mission.driver_phone}
                        atualizacao={(() => {
                            const live = pickLiveMissionUpdate(lastLog, mission);
                            const dt = live.at ? new Date(live.at) : null;
                            const dateStr = dt && !Number.isNaN(dt.getTime()) ? formatDateTimeBR(dt) : '';
                            if (!dateStr && !live.text) return '';
                            return live.text ? dateStr + ' · ' + live.text : dateStr;
                        })()}
                        onChamar={mission.driver_phone ? () => handleWhatsAppContact(mission.driver_phone, mission.driver_name) : undefined}
                    />
                    </PainelSuspensoOs>
                </div>

                <div className="os-escolta sm:col-span-1 xl:col-span-2 min-w-0">
                    <PainelSuspensoOs painel={(() => {
                        const veiculo = mission.vehicle || mission.vehicleData;
                        const modelo = [veiculo?.brand, veiculo?.model].map((parte) => String(parte || "").trim()).filter((parte) => parte && parte !== "---").join(" ");
                        const nomes = [mission.agent1, mission.agent2].filter((nome): nome is string => !!nome && nome !== "---" && getAgentDisplayName(nome) !== "-");
                        const itens: { rotulo: string; valor?: string | null; largo?: boolean }[] = [
                            { rotulo: "Tipo", valor: mission.mission_type ? String(mission.mission_type) : "" },
                            { rotulo: "Placa", valor: mission.vehicleId },
                            { rotulo: "Viatura", valor: modelo },
                            { rotulo: "OS do fornecedor", valor: hideProviderInfo ? "" : mission.vendor_os_number },
                        ];
                        nomes.forEach((nome, indice) => {
                            itens.push({ rotulo: "Agente " + (indice + 1), valor: nome.trim() });
                            itens.push({ rotulo: "Telefone " + (indice + 1), valor: agentPhonesMap?.[nome] });
                        });
                        if (!hideProviderInfo && [MissionStatus.ORIGIN, MissionStatus.IN_TRANSIT].includes(mission.status as MissionStatus)) {
                            itens.push({ rotulo: "Situação", valor: "Em operação" });
                        }
                        return (
                            <FichaOs
                                titulo={hideProviderInfo ? "Escolta" : "Fornecedor"}
                                nome={hideProviderInfo ? "Escolta" : (formatProviderName(mission.provider) || "Pendente")}
                                itens={itens}
                            />
                        );
                    })()}>
                    <EscortCinematic3DCard
                        fornecedor={hideProviderInfo ? "" : (formatProviderName(mission.provider) || "PENDENTE")}
                        tipo={mission.mission_type ? String(mission.mission_type).toUpperCase() : ""}
                        velada={!!mission.mission_type && String(mission.mission_type).toUpperCase().includes("VELADA")}
                        placa={mission.vehicleId && mission.vehicleId !== "---" ? mission.vehicleId : ""}
                        modelo={(() => {
                            const veiculo = mission.vehicle || mission.vehicleData;
                            return [veiculo?.brand, veiculo?.model]
                                .map((parte) => String(parte || "").trim())
                                .filter((parte) => parte && parte !== "---")
                                .join(" ");
                        })()}
                        agentes={[mission.agent1, mission.agent2]
                            .filter((nome): nome is string => !!nome && nome !== "---" && getAgentDisplayName(nome) !== "-")
                            .map((nome) => ({
                                nome: nome.trim(),
                                temTelefone: !!(agentPhonesMap?.[nome] && agentPhonesMap[nome] !== "---"),
                                onChamar: () => handleWhatsAppContact(agentPhonesMap?.[nome], nome),
                            }))}
                        emOperacao={[MissionStatus.ORIGIN, MissionStatus.IN_TRANSIT].includes(mission.status as MissionStatus)}
                        onCobrar={!hideProviderInfo ? handleCopyChargeUpdate : undefined}
                        cobrado={chargeCopied}
                        testId={`button-cobrar-atualizacao-${mission.id}`}
                    />
                    </PainelSuspensoOs>
                </div>
                
                <div className="os-rota sm:col-span-2 xl:col-span-3 p-2 flex flex-col justify-center relative bg-gray-50/20 min-w-0">
                    <MapaNoturnoOs
                        origem={mission.origin || ''}
                        destino={mission.destination || ''}
                        ultimaLocal={(() => {
                            const finalAddress = locationInfo.needsGeocode ? resolvedAddress : locationInfo.displayText;
                            if (locationInfo.needsGeocode && !resolvedAddress) return 'Resolvendo endereço...';
                            return finalAddress || '';
                        })()}
                        horario={(() => {
                            const live = pickLiveMissionUpdate(lastLog, mission);
                            const dt = live.at ? new Date(live.at) : null;
                            return dt && !Number.isNaN(dt.getTime()) ? formatDateTimeBR(dt) : '';
                        })()}
                        kmPercorrido={fallbackProgress.traveledKm}
                        kmTotal={fallbackProgress.plannedKm}
                        atual={locationInfo.coords}
                        aoAmpliar={() => {
                            const url = 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + encodeURIComponent(mission.origin || '') + '&destination=' + encodeURIComponent(mission.destination || '');
                            window.open(url, '_blank', 'noopener,noreferrer');
                        }}
                    />
                        <MissionRouteProgressBar
                            missionId={mission.id}
                            origin={mission.origin}
                            destination={mission.destination}
                            currentCoords={locationInfo.coords}
                            isActive={isTrackingActive}
                            fallback={fallbackProgress}
                            plannedKmLabel={displayPlannedKm}
                        />
                </div>

                {mostraColunaFinanceira && <div className="os-col-fin sm:col-span-1 xl:col-span-1 p-1 flex flex-col justify-center border-l border-r border-gray-100 min-w-[108px] shrink-0">
                    {!hideFinancialInfo && (isDirector || canSeeBillingSummary) && !hideProviderInfo && (
                        <div className="os-fin" data-testid={`resumo-financeiro-${mission.id}`}>
                            <p className="os-fin-titulo"><Coins size={12} /> Financeiro</p>
                            <div className="os-fin-card os-fin-card--receita">
                                <span className="os-fin-ico" aria-hidden="true"><BarChart3 size={14} /></span>
                                <div className="os-fin-texto">
                                    <small>Faturamento {mission.billing_approved ? '(Auditado)' : isAdjustedRevenue ? '(Salvo)' : '(Projetado)'}</small>
                                    <strong>{formatCurrency(displayRevenue)}</strong>
                                </div>
                            </div>
                            <div className="os-fin-card os-fin-card--custo">
                                <span className="os-fin-ico" aria-hidden="true"><Database size={14} /></span>
                                <div className="os-fin-texto">
                                    <small>Fornecedor {mission.billing_approved ? '(Auditado)' : isAdjustedCost ? '(Salvo)' : '(Projetado)'}</small>
                                    {(mission as any).is_same_os && displayCost === 0 ? (
                                        <strong className="os-fin-mesma" title="Custo zerado: missão compartilha OS principal (reaproveitamento)">Mesma OS</strong>
                                    ) : (
                                        <strong>{formatCurrency(displayCost)}</strong>
                                    )}
                                </div>
                            </div>
                            {(() => {
                                const margin = profitMargin;
                                const isNegative = margin < 0;
                                const isLow = margin >= 0 && margin < 20;
                                const anel = Math.max(0, Math.min(100, margin));
                                const margemTxt = margin.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
                                return (
                                    <div className={`os-fin-card os-fin-card--margem ${isNegative ? 'os-fin-card--neg' : isLow ? 'os-fin-card--baixa' : ''}`}>
                                        <span className="os-fin-anel" style={{ ['--p']: `${anel}%` } as React.CSSProperties} aria-hidden="true" />
                                        <div className="os-fin-texto">
                                            <strong>{margemTxt}%</strong>
                                            <small>{isNegative ? 'Prejuízo' : 'Margem'}</small>
                                        </div>
                                        <span className="os-fin-barras" aria-hidden="true"><i /><i /><i /><i /></span>
                                    </div>
                                );
                            })()}
                            <div
                                className={`os-fin-status ${auditResult?.isInconsistent ? 'os-fin-status--divergente' : mission.billing_approved ? 'os-fin-status--auditado' : pendingApproval?.hasPartial ? 'os-fin-status--falta' : hasBeenVerified ? 'os-fin-status--salvo' : 'os-fin-status--pendente'}`}
                                title={auditResult?.isInconsistent ? auditResult.reason : pendingApproval ? `Aguardando: ${pendingApproval.missing.join(', ')}` : ''}
                            >
                                {auditResult?.isInconsistent ? (
                                    <><AlertOctagon size={13} /> Divergente</>
                                ) : mission.billing_approved ? (
                                    <><ShieldCheck size={13} /> Auditado</>
                                ) : pendingApproval?.hasPartial ? (
                                    <><Clock size={13} /> Falta: {pendingApproval.missing.join(', ')} ({pendingApproval.waitingDays}d)</>
                                ) : hasBeenVerified ? (
                                    <><ShieldCheck size={13} /> Salvo</>
                                ) : (
                                    <><Clock size={13} /> Pendente</>
                                )}
                            </div>
                        </div>
                    )}
                    {!hideFinancialInfo && hideProviderInfo && financials && (
                        <div className="flex flex-col gap-1" data-testid={`client-billing-${mission.id}`}>
                           <div className="rounded-lg p-1.5 shadow-sm border" style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', borderColor: '#86efac' }}>
                               <p className="text-[9px] font-black text-green-600 uppercase tracking-wider leading-none mb-0.5">Faturamento</p>
                               <p className="text-[13px] font-black text-green-800 font-mono leading-none tracking-tight">{formatCurrency(financials.client.base)}</p>
                           </div>
                           <div className={`rounded-lg p-1.5 shadow-sm border ${financials.client.extraHrVal > 0 ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-200'}`}>
                               <p className="text-[9px] font-black text-amber-700 uppercase tracking-wider leading-none mb-0.5">Hora Extra</p>
                               <p className={`text-[12px] font-black font-mono leading-none ${financials.client.extraHrVal > 0 ? 'text-amber-800' : 'text-gray-400'}`}>{formatCurrency(financials.client.extraHrVal)}</p>
                               {financials.client.excessHours > 0 && <p className="text-[9px] font-bold text-amber-500 mt-0.5">+{formatExcessTime(financials.client.excessHours)}</p>}
                           </div>
                           <div className={`rounded-lg p-1.5 shadow-sm border ${financials.client.extraKmVal > 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                               <p className="text-[9px] font-black text-blue-600 uppercase tracking-wider leading-none mb-0.5">Km Extra</p>
                               <p className={`text-[12px] font-black font-mono leading-none ${financials.client.extraKmVal > 0 ? 'text-blue-800' : 'text-gray-400'}`}>{formatCurrency(financials.client.extraKmVal)}</p>
                           </div>
                           <div className={`rounded-lg p-1.5 shadow-sm border relative ${financials.tollValue > 0 ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200'}`}>
                               <p className="text-[9px] font-black text-purple-600 uppercase tracking-wider leading-none mb-0.5">Pedágio</p>
                               <p className={`text-[12px] font-black font-mono leading-none ${financials.tollValue > 0 ? 'text-purple-800' : 'text-gray-400'}`}>{formatCurrency(financials.tollValue)}</p>
                               {(() => {
                                   if (tollConfirmation) {
                                       const dt = tollConfirmation.date ? new Date(tollConfirmation.date) : null;
                                       const dtStr = dt && !isNaN(dt.getTime()) ? formatDateTimeBR(dt) : '—';
                                       const label = tollConfirmation.hasToll ? `Pedágio confirmado (R$ ${tollConfirmation.value.toFixed(2)}) por ${tollConfirmation.user} em ${dtStr}` : `Pedágio confirmado como ZERO por ${tollConfirmation.user} em ${dtStr}`;
                                       return (
                                           <span title={label} className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-green-600 text-white flex items-center justify-center border border-white shadow" data-testid={`badge-toll-confirmed-${mission.id}`}>
                                               <Check size={9} strokeWidth={4} />
                                           </span>
                                       );
                                   }
                                   if (mission.status === MissionStatus.COMPLETED && !mission.billing_approved) {
                                       return (
                                           <span title="Pedágio ainda não confirmado manualmente — operacional precisa validar antes do faturamento" className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-500 text-white flex items-center justify-center border border-white shadow animate-pulse" data-testid={`badge-toll-unconfirmed-${mission.id}`}>
                                               <AlertTriangle size={9} strokeWidth={3} />
                                           </span>
                                       );
                                   }
                                   return null;
                               })()}
                           </div>
                           <div className="rounded-lg p-1.5 shadow-sm border border-green-400" style={{ background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)' }}>
                               <p className="text-[9px] font-black text-green-700 uppercase tracking-wider leading-none mb-0.5">Valor Total</p>
                               <p className="text-[12px] font-black text-green-900 font-mono leading-none tracking-tight">{formatCurrency(financials.client.base + financials.client.extraHrVal + financials.client.extraKmVal + financials.tollValue)}</p>
                           </div>
                        </div>
                    )}
                </div>}

                <div className="sm:col-span-1 xl:col-span-1 py-1 px-1 flex items-center justify-center border-l border-gray-100 bg-white shrink-0">
                    <div className="grid grid-cols-3 gap-1.5 w-fit justify-items-center"><button onClick={() => onViewMap(mission)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100 transition-all duration-200 hover:bg-blue-600 hover:text-white hover:shadow-sm active:scale-95" title="Abrir Status (Modal Interno)"><Map size={14} /></button>
                        {!hideProviderInfo && (<>
                        <button onClick={(e) => { e.stopPropagation(); if (mission.mapLink) window.open(mission.mapLink, '_blank'); else alert('Nenhuma localização salva nesta OS.'); }} className={`w-8 h-8 flex items-center justify-center rounded-xl border transition-all duration-200 hover:shadow-sm active:scale-95 ${mission.mapLink ? 'bg-orange-50 text-orange-600 border-orange-100 hover:bg-orange-600 hover:text-white' : 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'}`} title={mission.mapLink ? "Abrir Última Localização (Google Maps)" : "Sem localização salva"}><MapPin size={14} /></button>
                        {isVeladaMission(mission) && <LiveTrackPanel mission={mission} compact />}
                        <button onClick={() => onUpdate(mission)} className={`w-8 h-8 flex items-center justify-center rounded-xl border transition-all duration-200 hover:shadow-sm active:scale-95 ${canEditMission ? 'bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-600 hover:text-white' : 'bg-gray-50 text-gray-400 border-gray-100 hover:bg-gray-200 hover:text-gray-600'}`} title={canEditMission ? "Editar Missão" : "Visualizar Detalhes"}>{canEditMission ? <Pencil size={14}/> : <Eye size={14}/>}</button>
                        <button type="button" onClick={() => setOccurrenceOpen(true)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-orange-50 text-orange-700 border border-orange-200 transition-all duration-200 hover:bg-orange-600 hover:text-white hover:shadow-sm active:scale-95" title="Registrar ocorrência desta OS" data-testid={`button-occurrence-${mission.id}`}><AlertTriangle size={14} /></button>
                        <MissionHandoverNoteButton missionId={mission.id} note={handoverNote} onSaved={(saved) => onHandoverNoteSaved?.(saved)} />
                        
                        {!hideFinancialInfo && (isDirector || canEditMission) && onOpenFinancials && (
                            <button onClick={() => onOpenFinancials(mission)} className={`flex items-center justify-center rounded-md transition-all duration-200 hover:shadow-sm active:scale-95 border ${mission.billing_approved ? 'w-7 h-7 bg-blue-600 text-white border-blue-700' : pendingApproval?.hasPartial ? 'h-7 px-1.5 gap-1 bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200' : 'w-7 h-7 bg-green-50 text-green-700 border-green-200 hover:bg-green-600 hover:text-white'}`} title={mission.billing_approved ? "Faturamento Aprovado - Visualizar" : pendingApproval?.hasPartial ? `Aguardando: ${pendingApproval.missing.join(', ')} (${pendingApproval.waitingDays}d)` : "Conferência e Aprovação de Faturamento"}>
                                <Calculator size={14} />
                                {pendingApproval?.hasPartial && <span className="text-[9px] font-black text-gray-500 leading-none whitespace-nowrap">{pendingApproval.missing[0]} ({pendingApproval.waitingDays}d)</span>}
                            </button>
                        )}
                        
                        <button onClick={() => onCopyEmail(mission)} disabled={isSendingEmail === mission.id} className={`w-8 h-8 flex items-center justify-center rounded-xl border transition-all duration-200 hover:shadow-sm active:scale-95 ${isSendingEmail === mission.id ? 'bg-blue-100 text-blue-600 border-blue-200 animate-pulse cursor-wait' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-600 hover:text-white'}`} title="Enviar E-mail ao Cliente" data-testid={`btn-email-client-${mission.id}`}>{isSendingEmail === mission.id ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}</button>
                        <button onClick={() => onCopy(mission)} className={`w-8 h-8 flex items-center justify-center rounded-xl border transition-all duration-200 hover:shadow-sm active:scale-95 ${copiedId === mission.id ? 'bg-green-100 text-green-700 border-green-200' : 'bg-[#25D366]/10 text-[#25D366] border-[#25D366]/20 hover:bg-[#25D366] hover:text-white'}`} title="Copiar Relatório WhatsApp">{copiedId === mission.id ? <Check size={14} strokeWidth={3}/> : <WhatsAppIcon size={14}/>}</button>
                        {onViewHistory && isDirector && (<button onClick={(e) => { e.stopPropagation(); onViewHistory(mission); }} className="w-8 h-8 flex items-center justify-center rounded-xl bg-purple-50 text-purple-600 border border-purple-200 transition-all duration-200 hover:bg-purple-600 hover:text-white hover:shadow-sm active:scale-95" title="Histórico Detalhado (Auditoria)"><FileSearch size={14} /></button>)}</>)}
                        <button onClick={() => hasEvidence ? setShowEvidenceModal(true) : setShowUploadModal(true)} className={`w-8 h-8 flex items-center justify-center rounded-xl border transition-all duration-200 hover:shadow-sm active:scale-95 ${hasEvidence ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-600 hover:text-white' : requiresEvidence ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-600 hover:text-white animate-pulse' : 'bg-cyan-50 text-cyan-600 border-cyan-200 hover:bg-cyan-600 hover:text-white'}`} title={hasEvidence ? 'Ver Evidência' : 'Anexar Print / Evidência (Ctrl+V para colar)'} data-testid={`button-upload-evidence-${mission.id}`}>
                            {hasEvidence ? <Image size={14} /> : <Camera size={14} />}
                        </button>
                        {onPrint && (<button onClick={handlePrintClick} className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-50 text-gray-700 border border-gray-200 transition-all duration-200 hover:bg-gray-700 hover:text-white hover:shadow-sm active:scale-95" title="Imprimir Folha de Missão (PDF) e Copiar Texto"><Printer size={14} /></button>)}
                        {onFullReport && (<button onClick={() => onFullReport(mission)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-amber-50 text-amber-700 border border-amber-200 transition-all duration-200 hover:bg-amber-600 hover:text-white hover:shadow-sm active:scale-95" title="Relatório Completo PDF (Timeline + Auditoria)"><FileText size={14} /></button>)}
                        {onOperationalReport && (<button onClick={() => onOperationalReport(mission)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-red-50 text-red-700 border border-red-200 transition-all duration-200 hover:bg-red-700 hover:text-white hover:shadow-sm active:scale-95" title="Relatório Operacional" data-testid={`button-op-report-${mission.id}`}><Briefcase size={14} /></button>)}
                        {onActionPlan && (<button type="button" onClick={() => onActionPlan(mission)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-[#e8eef4] text-[#0d3b66] border border-[#0d3b66]/30 transition-all duration-200 hover:bg-[#0d3b66] hover:text-white hover:shadow-sm active:scale-95" title="Relatório da Missão" data-testid={`button-os-action-plan-${mission.id}`}><ClipboardList size={14} /></button>)}
                        {isDirector && !hideProviderInfo && (<button onClick={() => onDelete(mission)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-red-50 text-red-600 border-red-100 transition-all duration-200 hover:bg-red-600 hover:text-white hover:shadow-sm active:scale-95" title="Excluir Missão"><Trash2 size={14}/></button>)}
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
                                <p className="text-[12px] font-bold text-gray-400">{mission.id} — {mission.client}</p>
                            </div>
                        </div>
                        <button onClick={() => { setShowUploadModal(false); pendingFiles.forEach(f => URL.revokeObjectURL(f.preview)); setPendingFiles([]); }} className="p-2 hover:bg-gray-200 rounded-full transition-all" data-testid="button-close-upload-modal"><X size={18} /></button>
                    </div>
                    <div className="p-4 space-y-4">
                        <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center bg-gray-50/50 focus-within:border-cyan-400 transition-colors">
                            <Camera size={32} className="mx-auto text-gray-400 mb-2" />
                            <p className="text-sm font-bold text-gray-700">Cole o print aqui (Ctrl+V)</p>
                            <p className="text-[12px] text-gray-400 mt-1">ou selecione um arquivo abaixo</p>
                        </div>
                        <div className="flex gap-2">
                            <input ref={uploadFileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelectInModal} data-testid={`input-evidence-file-${mission.id}`} />
                            <button onClick={() => uploadFileInputRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg text-xs font-bold text-gray-700 transition-all" data-testid={`button-select-file-${mission.id}`}>
                                <Upload size={14} /> Selecionar Arquivo
                            </button>
                        </div>
                        {pendingFiles.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-[12px] font-black text-gray-500 uppercase">{pendingFiles.length} imagem(ns) pronta(s)</p>
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
                                <p className="text-[12px] font-bold text-gray-400">{mission.id} — {mission.client}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {!hideProviderInfo && (
                                <button onClick={() => { setShowEvidenceModal(false); setShowUploadModal(true); }} className="px-3 py-1.5 bg-cyan-100 text-cyan-700 rounded-lg text-[12px] font-black uppercase hover:bg-cyan-200 transition-all flex items-center gap-1.5" data-testid="button-add-more-evidence"><Camera size={12} /> Adicionar</button>
                            )}
                            <button onClick={() => setShowEvidenceModal(false)} className="p-2 hover:bg-gray-200 rounded-full transition-all" data-testid="button-close-evidence-modal"><X size={18} /></button>
                        </div>
                    </div>
                    <div className="p-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px]">
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
                            <div key={idx} className="border border-gray-200 rounded-xl overflow-hidden shadow-sm cursor-pointer" onClick={() => setFullScreenImage(ev.url)} data-testid={`evidence-image-${idx}`}>
                                <img src={ev.url} alt={`Evidência ${idx + 1}`} className="w-full object-contain max-h-[60vh] bg-gray-100" />
                                <div className="p-2 bg-gray-50 flex items-center justify-between text-[11px]">
                                    <span className="font-bold text-gray-500">Enviado por <span className="text-gray-800 font-black">{ev.uploadedBy}</span></span>
                                    <span className="font-bold text-gray-400">{formatDateTime(ev.uploadedAt)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {occurrenceOpen && !hideProviderInfo && (
            <MissionOccurrenceDialog
                missionId={mission.id}
                canWrite={canEditMission}
                onClose={() => setOccurrenceOpen(false)}
                onSaved={(count) => setOccurrenceCount(count)}
            />
        )}
        {fullScreenImage && (
            <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setFullScreenImage(null)} data-testid="fullscreen-evidence-overlay">
                <button onClick={(e) => { e.stopPropagation(); setFullScreenImage(null); }} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all z-10" data-testid="button-close-fullscreen-evidence"><X size={24} /></button>
                <img src={fullScreenImage} alt="Evidência ampliada" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
            </div>
        )}
        </>
    );
};

const MissionCard = memo(MissionCardComponent);
export default MissionCard;
