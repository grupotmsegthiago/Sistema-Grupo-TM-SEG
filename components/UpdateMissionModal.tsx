import { formatDateBR, formatIsoDateBR, formatTimeAuditBR, formatDateTimeBR, formatTimeBR } from '../lib/dateUtils';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Mission, MissionStatus, ProviderData, Agent, Vehicle, User as UserType, ClientPriceTable, ClientVehicleDB } from '../types';
import { authFetch } from '../lib/authFetch';
import { supabase, MISSION_UPDATES_BROADCAST_CHANNEL } from '../lib/supabase';
import { logAction } from '../lib/logger';
import { clientFuzzyFilter, extractCityFromAddress } from '../lib/financialUtils';
import { generateContent } from '../lib/gemini';
import { optimizeImageForAI } from '../lib/imageForAI';
import { withTimeout, TimeoutError } from '../lib/promiseTimeout';
import { showWhatsappCopyPopup } from '../lib/whatsappCopyFlow';
import { hasExplicitUpdatePrint, shouldSendClientGroupWhatsApp } from '../lib/clientGroupUpdateFilter';
import { resolveStatusForSaveSubmit, statusToRestoreOnFinalizeCancel } from '../lib/missionSaveStatus';
import { isVeladaPassThroughTerminal, shouldDowngradeCompletedToPending } from '../lib/veladaFinalize';
import {
  buildMonitoringWhatsAppReport,
  formatAgentShortName,
  parseMonitoringCityFromLocationName,
} from '../lib/monitoringWhatsAppReport';
import {
  computeScaledCanvasSize,
  createBrandedFallbackPhoto,
  dataUrlToBlob,
  loadStampImage,
  stampBrandOnImageBlob,
  stampBrandOverlays,
  waitUntil,
} from '../lib/brandPhotoStamp';
import type { PrintPipelineTimings } from '../lib/printPipelineTypes';
import DhlOccurrenceReportModal from './DhlOccurrenceReportModal';
import { useNotification } from '../lib/NotificationContext';
import { autoCalculateMissionCommissions } from '../lib/rh/commissionAuto';
import { 
  X, Activity, MapPin, Flag, Truck, Plus, Save, 
  Layers, Navigation, History, 
  Calculator, Clock, Trash2, UserCheck, CarFront, DollarSign, AlertCircle, Info, ShieldAlert, AlertTriangle,
  Loader2, Search, ChevronDown, UserPlus, Package, ShieldCheck, Check, BadgeCheck, Sparkles,
  Milestone, Timer, Calendar, Globe, Briefcase, Zap, TrendingUp, RefreshCw, User, Phone, CheckCircle2, Mail,
  ExternalLink, Radar, ArrowRightLeft, TableProperties, Gauge, XCircle, CalendarClock, CircleDot,
  ClipboardList, UserX, FileText
} from 'lucide-react';
import { useLoadScript, Autocomplete, GoogleMap, Marker } from '@react-google-maps/api';
import { googleMapsApiKey, libraries, googleMapsLoadConfig } from '../lib/maps';
import { extractCoordinates } from '../lib/utils';
import { fetchRouteProgress, normalizeProgressDestination, resolveRouteProgressPct } from '../lib/routeProgress';
import DhlIntakeTimeline from './DhlIntakeTimeline';
import TollConfirmationDialog from './TollConfirmationDialog';
import { tollPersistencePair } from '../lib/toll/clientTollBilling';

// Importação dos formulários para modo modal/cadastro rápido
import ProviderForm from './ProviderForm';
import VehicleForm from './VehicleForm';
import ProviderAgentForm from './ProviderAgentForm';
import ClientVehicleForm from './ClientVehicleForm';
import ClientVehicleList from './ClientVehicleList';

declare const google: any;

const parseNumber = (value: string | number | undefined | null): number => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    let str = String(value).trim();
    if (str.includes(',') && str.includes('.')) {
        const lastComma = str.lastIndexOf(',');
        const lastDot = str.lastIndexOf('.');
        if (lastComma > lastDot) {
            str = str.replace(/\./g, '').replace(',', '.');
        } else {
            str = str.replace(/,/g, '');
        }
    } else if (str.includes(',')) {
        str = str.replace(',', '.');
    }
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
};

const LABEL_CLASS = "text-[9px] font-black text-gray-400 uppercase mb-1 block tracking-widest";
const INPUT_CLASS = "w-full p-2.5 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:ring-2 focus:ring-red-500/10 focus:border-red-500 outline-none transition-all uppercase";
const DROPDOWN_ITEM_CLASS = "w-full flex items-center justify-between p-3 text-[11px] font-bold hover:bg-red-50 border-b border-gray-50 uppercase text-gray-700 transition-colors text-left";

// ── Envio automático ao grupo de WhatsApp do cliente ────────────────────────
// O destino é resolvido no BACKEND pelo cadastro do cliente (whatsapp_group_id).
// Fire-and-forget: nunca bloqueia o salvamento da OS.
async function sendUpdateToClientGroup(
    clientName: string,
    message: string,
    photo: Blob | null,
    missionId?: string,
    requirePhoto = false,
): Promise<{ sent: boolean; skipped?: boolean; error?: string }> {
    try {
        if (!clientName || !message) return { sent: false, skipped: true, error: 'cliente ou mensagem ausente' };
        if (requirePhoto && !photo) {
            return { sent: false, error: 'foto obrigatória ausente para envio ao grupo' };
        }
        let imageBase64: string | undefined;
        if (photo) {
            imageBase64 = await new Promise<string>((resolve, reject) => {
                const fr = new FileReader();
                fr.onload = () => resolve(String(fr.result));
                fr.onerror = () => reject(fr.error);
                fr.readAsDataURL(photo);
            });
        }
        const resp = await authFetch('/api/whatsapp/send-group', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientName, message, imageBase64, missionId, requireImage: requirePhoto }),
        });
        const data = await resp.json().catch(() => null);
        if (resp.ok && data?.sent) return { sent: true };
        if (data?.skipped) {
            return {
                sent: false,
                skipped: true,
                error: data?.reason || 'cliente sem grupo WhatsApp configurado',
            };
        }
        return { sent: false, error: data?.error || data?.detail?.message || `HTTP ${resp.status}` };
    } catch (e: any) {
        return { sent: false, error: e?.message || 'falha de rede' };
    }
}

interface UpdateMissionModalProps {
    isOpen: boolean;
    onClose: () => void;
    mission: Mission | null;
    currentUser: UserType | null;
    onSuccess: (reportText?: string) => void;
    hideProviderInfo?: boolean;
}

// Formata uma data para o value do <input type="datetime-local"> (hora LOCAL).
const toLocalDateTimeInput = (d: Date): string => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

interface FinalizeTableSuggestion {
    name: string;
    meta: string;
    best?: boolean;
    current?: boolean;
}

export interface FinalizeConfirmPayload {
    endKm: number | null;
    iso: string;
    endTravelIso: string | null;
    odometerPrintUrl: string | null;
}

// Fornecedores ATIVA e TM SEG enviam o KM final só DEPOIS da missão na conclusão.
// Evidência do encerramento é obrigatória para TODOS os status terminais.
export const isOdometerExemptProvider = (providerName?: string): boolean => {
    const raw = (providerName || '').toUpperCase();
    const tokens = raw.split(/[^A-Z0-9]+/).filter(Boolean);
    const collapsed = raw.replace(/\s+/g, '');
    return tokens.includes('ATIVA') || collapsed.includes('TMSEG') || collapsed.includes('TMSECURITY');
};

interface OdometerAiResult {
    concluido: boolean;
    km_extraido: string | null;
    divergencia: boolean;
    justificativa: string;
}

interface FinalizeChecklistDialogProps {
    isOpen: boolean;
    kind: 'completed' | 'cancelled' | 'refused';
    osLabel: string;
    providerName: string;
    dateLabel: string;
    isDhl: boolean;
    destinationAddress: string;
    mapLink: string;
    originCity: string;
    destCity: string;
    appliedTableName: string;
    isRaio: boolean;
    raioFranchiseKm: number;
    startKm: number;
    defaultEndKm: string;
    franchiseKm: number;
    suggestions: FinalizeTableSuggestion[];
    defaultDateTime: string;
    minDateTime?: string;
    missionId: string;
    onConfirm: (payload: FinalizeConfirmPayload) => void;
    onCancel: () => void;
}

const FinalizeChecklistDialog: React.FC<FinalizeChecklistDialogProps> = ({
    isOpen, kind, osLabel, providerName, dateLabel, isDhl, destinationAddress, mapLink,
    originCity, destCity, appliedTableName, isRaio, raioFranchiseKm, startKm, defaultEndKm,
    franchiseKm, suggestions, defaultDateTime, minDateTime, missionId, onConfirm, onCancel,
}) => {
    const isCompleted = kind === 'completed';
    const isCancelled = kind === 'cancelled';
    const isRefused = kind === 'refused';
    const [endKm, setEndKm] = useState(defaultEndKm);
    const [dt, setDt] = useState(defaultDateTime);
    const [endTravelDt, setEndTravelDt] = useState(defaultDateTime);
    const [chkAddress, setChkAddress] = useState(false);
    const [chkCities, setChkCities] = useState(false);
    const [chkTable, setChkTable] = useState(false);
    const [raioAnswer, setRaioAnswer] = useState<'yes' | 'no' | null>(null);
    const [raioRealKm, setRaioRealKm] = useState('');
    const [err, setErr] = useState('');
    // Trava de duplo-clique: o onConfirm do pai roda uma estimativa de pedágio
    // por IA (vários segundos) antes de fechar o dialog. Sem feedback, o operador
    // clicava "Finalizar" várias vezes. Esta flag desabilita o botão no 1º clique.
    const [submitting, setSubmitting] = useState(false);

    // Auditoria do hodômetro por IA (somente conclusão).
    const [odoFile, setOdoFile] = useState<File | null>(null);
    const [odoPreview, setOdoPreview] = useState<string>('');
    const [odoUrl, setOdoUrl] = useState<string>('');
    const [odoUploading, setOdoUploading] = useState(false);
    const [odoChecking, setOdoChecking] = useState(false);
    const [odoResult, setOdoResult] = useState<OdometerAiResult | null>(null);
    const [odoValidatedKm, setOdoValidatedKm] = useState<number | null>(null);
    const [odoErr, setOdoErr] = useState('');
    const [odoConfirmed, setOdoConfirmed] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setEndKm(defaultEndKm);
            setDt(defaultDateTime);
            setEndTravelDt(defaultDateTime);
            setChkAddress(false);
            setChkCities(false);
            setChkTable(false);
            setRaioAnswer(null);
            setRaioRealKm('');
            setErr('');
            setSubmitting(false);
            setOdoFile(null);
            setOdoPreview('');
            setOdoUrl('');
            setOdoUploading(false);
            setOdoChecking(false);
            setOdoResult(null);
            setOdoValidatedKm(null);
            setOdoErr('');
            setOdoConfirmed(false);
        }
    }, [isOpen, defaultEndKm, defaultDateTime]);

    if (!isOpen) return null;

    const endKmNum = (() => {
        const s = (endKm || '').toString().trim();
        if (s === '') return null;
        const n = parseFloat(s.replace(',', '.'));
        return isNaN(n) ? null : n;
    })();
    const traveled = endKmNum != null && startKm >= 0 ? Math.max(0, endKmNum - startKm) : 0;
    const kmMismatch = isCompleted && franchiseKm > 0 && traveled > franchiseKm;

    // Fornecedores ATIVA e TM SEG mandam o KM final só depois — para eles o
    // KM final e o print do hodômetro NÃO são obrigatórios na conclusão.
    const odometerExempt = isOdometerExemptProvider(providerName);
    const veladaPassThrough = isVeladaPassThroughTerminal({
        odometerExempt,
        kind: isCompleted ? 'completed' : isCancelled ? 'cancelled' : 'refused',
    });

    // Evidência obrigatória em todo status terminal (Concluída, Cancelada, Recusada).
    // Na conclusão, ATIVA/TM SEG ainda podem omitir KM final; evidência é sempre exigida.
    const evidenceOk = !!odoUrl;

    const validateOdometer = async (file: File, targetKm: number | null) => {
        if (targetKm == null || targetKm <= 0) { setOdoErr('Informe o KM final antes de validar o print.'); return; }
        setOdoChecking(true); setOdoErr(''); setOdoResult(null); setOdoConfirmed(false);
        try {
            // Reduz/comprime só a cópia enviada à IA (o print salvo como
            // evidência continua em qualidade original) — leitura muito mais rápida.
            const aiImage = await optimizeImageForAI(file);
            const prompt = `Você é um auditor de frotas. Analise a imagem do PAINEL/HODÔMETRO de um veículo e compare com o valor de KM FINAL informado pelo operador: ${targetKm}.
Tarefas:
1. Identifique se a imagem mostra de fato um hodômetro/painel de veículo (campo "concluido": true se for um hodômetro legível, false caso contrário).
2. Extraia o número do hodômetro exibido na imagem (campo "km_extraido", apenas dígitos, sem pontos; null se ilegível).
3. Compare o valor extraído com o KM FINAL informado (${targetKm}). Se forem diferentes (tolerância de 2 km), "divergencia": true.
4. Escreva uma justificativa curta em português (campo "justificativa").
Responda ESTRITAMENTE em JSON puro, sem markdown, no formato: {"concluido": boolean, "km_extraido": string|null, "divergencia": boolean, "justificativa": string}`;
            // Timeout de 30s: se o Gemini travar, a tela NÃO fica presa no spinner.
            // A validação por IA é apenas um apoio — a OS pode ser concluída mesmo
            // que ela falhe (o print já está salvo como evidência).
            const raw = await withTimeout(
                generateContent({
                    contents: { parts: [ { inlineData: { mimeType: aiImage.mimeType, data: aiImage.data } }, { text: prompt } ] },
                    config: { responseMimeType: 'application/json' },
                }),
                30_000,
                'A validação por IA demorou demais',
            );
            let txt = (raw || '').trim();
            if (txt.startsWith('```')) txt = txt.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
            const parsed = JSON.parse(txt) as OdometerAiResult;
            setOdoResult(parsed);
            setOdoValidatedKm(targetKm);
            if (!parsed.concluido) setOdoErr('A imagem não parece ser um hodômetro legível. Cole um print válido do painel.');
        } catch (e: any) {
            const timedOut = e instanceof TimeoutError;
            setOdoErr(timedOut
                ? 'A validação por IA demorou demais e foi interrompida. O print já está salvo — você pode concluir a OS normalmente.'
                : 'Não foi possível validar o print com a IA. O print já está salvo — você pode concluir a OS normalmente.');
        } finally {
            setOdoChecking(false);
        }
    };

    const handleOdometerImage = async (file: File) => {
        if (!file || !file.type.startsWith('image/')) { setOdoErr('O arquivo deve ser uma imagem.'); return; }
        setOdoErr(''); setOdoResult(null); setOdoConfirmed(false); setOdoValidatedKm(null);
        setOdoFile(file);
        const localPreview = URL.createObjectURL(file);
        setOdoPreview(localPreview);
        setOdoUploading(true);
        try {
            const ext = (file.name.split('.').pop() || 'png').toLowerCase();
            const folder = isCompleted ? 'odometer' : isRefused ? 'refused' : 'cancelled';
            const path = `${folder}/${missionId}/${Date.now()}.${ext}`;
            const { error: upErr } = await supabase.storage.from('mission-evidence').upload(path, file, { upsert: true, contentType: file.type });
            if (upErr) throw upErr;
            const { data: pub } = supabase.storage.from('mission-evidence').getPublicUrl(path);
            const publicUrl = pub?.publicUrl || '';
            setOdoUrl(publicUrl);
            try {
                await supabase.from('system_logs').insert({
                    entity: 'MissionEvidence',
                    entity_id: missionId,
                    action_type: isCompleted ? 'odometer_print' : isRefused ? 'refused_status_evidence' : 'cancel_status_evidence',
                    details: JSON.stringify({
                        fileName: file.name, filePath: path, publicUrl,
                        terminalStatus: kind,
                        uploadedAt: new Date().toISOString(),
                        context: `Checklist de ${isCompleted ? 'conclusão' : isRefused ? 'recusa' : 'cancelamento'}`,
                    }),
                    created_at: new Date().toISOString(),
                });
            } catch (logErr) { console.warn('[TerminalEvidence] Falha ao registrar log:', logErr); }
        } catch (e: any) {
            setOdoErr('Falha ao enviar o print. Tente novamente.');
            setOdoUploading(false);
            return;
        }
        setOdoUploading(false);
        if (isCompleted && endKmNum != null && endKmNum > 0) {
            await validateOdometer(file, endKmNum);
        }
    };

    // Etapas visíveis nesta OS (para a barra de progresso).
    const steps = isRefused
        ? { refused: true }
        : {
            address: true,
            raio: isRaio,
            cities: true,
            km: isCompleted,
            cancel: isCancelled,
        };
    const totalSteps = Object.values(steps).filter(Boolean).length;
    const rawDoneSteps =
        (isRefused
            ? (evidenceOk && dt ? 1 : 0)
            : 0) +
        (!isRefused && chkAddress ? 1 : 0) +
        (!isRefused && steps.raio && raioAnswer ? 1 : 0) +
        (!isRefused && chkCities ? 1 : 0) +
        (steps.km && (endKmNum != null && endKmNum > 0 && (!kmMismatch || chkTable) && evidenceOk) ? 1 : 0) +
        (steps.cancel && dt && endTravelDt && endKmNum != null && endKmNum > 0 && evidenceOk ? 1 : 0);
    // Fornecedores isentos (ATIVA / TM SEG) na conclusão/cancelamento velada:
    // KM opcional; hora + evidência obrigatórios (hodômetro entra depois).
    const essentialDone = isRefused
        ? (evidenceOk && !!dt)
        : isCompleted
            ? (!!dt && evidenceOk)
            : isCancelled && veladaPassThrough
                ? (!!dt && !!endTravelDt && evidenceOk)
                : (!!dt && !!endTravelDt && endKmNum != null && endKmNum > 0 && evidenceOk);
    const doneSteps = veladaPassThrough ? (essentialDone ? totalSteps : 0) : rawDoneSteps;
    const progressPct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;
    const allDone = veladaPassThrough ? essentialDone : rawDoneSteps >= totalSteps;

    const handleConfirm = () => {
        if (isRefused) {
            if (endKmNum != null && endKmNum > 0 && startKm > 0 && endKmNum < startKm) {
                setErr(`KM final não pode ser menor que o KM inicial (${startKm}).`);
                return;
            }
            if (!evidenceOk) { setErr('Cole ou anexe a evidência do encerramento (obrigatório).'); return; }
            if (!dt) { setErr('Informe a data e a hora exata da recusa.'); return; }
        } else if (!veladaPassThrough) {
            if (!isRefused && !chkAddress) { setErr('Confirme o endereço de destino final.'); return; }
            if (isRaio && !raioAnswer) { setErr('Responda se a viatura rodou o raio.'); return; }
            if (isRaio && raioAnswer === 'no' && (raioRealKm || '').trim() === '') { setErr('Informe o raio realmente rodado (km).'); return; }
            if (!chkCities) { setErr('Confirme as cidades e a tabela aplicada.'); return; }
        }

        if (isCompleted) {
            if (!odometerExempt) {
                if (endKmNum == null || endKmNum <= 0) { setErr('Informe o KM final.'); return; }
            }
            if (endKmNum != null && startKm > 0 && endKmNum < startKm) { setErr(`KM final não pode ser menor que o KM inicial (${startKm}).`); return; }
            if (!odometerExempt) {
                if (kmMismatch && !chkTable) { setErr('O KM rodado não bate com a tabela. Confirme a ciência da tabela aplicada.'); return; }
            }
            if (!evidenceOk) { setErr('Cole ou anexe a evidência do encerramento (obrigatório).'); return; }
            if (!dt) { setErr('Informe a data e a hora exata da finalização.'); return; }
        } else if (isCancelled) {
            if (!dt) { setErr('Informe a data e a hora do cancelamento.'); return; }
            if (!endTravelDt) { setErr('Informe a data de fim de viagem.'); return; }
            if (!veladaPassThrough) {
                if (endKmNum == null || endKmNum <= 0) { setErr('Informe o KM final.'); return; }
            }
            if (endKmNum != null && endKmNum > 0 && startKm > 0 && endKmNum < startKm) {
                setErr(`KM final não pode ser menor que o KM inicial (${startKm}).`);
                return;
            }
            if (!evidenceOk) { setErr('Cole ou anexe a evidência do cancelamento (obrigatório).'); return; }
        }

        const parsed = new Date(dt);
        if (isNaN(parsed.getTime())) { setErr('Data/hora inválida.'); return; }
        const endTravelParsed = endTravelDt ? new Date(endTravelDt) : null;

        if (submitting) return;
        setSubmitting(true);
        onConfirm({
            endKm: endKmNum,
            iso: parsed.toISOString(),
            endTravelIso: isCancelled && endTravelParsed && !isNaN(endTravelParsed.getTime()) ? endTravelParsed.toISOString() : null,
            odometerPrintUrl: evidenceOk ? (odoUrl || null) : null,
        });
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 p-4 overflow-y-auto" data-testid="dialog-finalize-confirm">
            <div className="my-6 w-full max-w-[600px] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
                {/* Header */}
                <div className="flex items-center gap-3 border-b border-slate-100 bg-white px-5 py-4">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${isCompleted ? 'bg-emerald-500 text-white' : isRefused ? 'bg-red-800 text-white' : 'bg-red-500 text-white'}`}>
                        {isCompleted ? <ShieldCheck className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-base font-extrabold leading-tight text-slate-900" data-testid="text-finalize-title">
                            {isCompleted ? 'Finalizar Missão' : isRefused ? 'Recusar Missão' : 'Cancelar Missão'}{isDhl ? ' DHL' : ''}
                        </h2>
                        <p className="truncate text-xs text-slate-500" data-testid="text-finalize-subtitle">
                            {osLabel}{providerName ? ` · Fornecedor: ${providerName}` : ''}{dateLabel ? ` · ${dateLabel}` : ''}
                        </p>
                    </div>
                    <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${isCompleted ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : isRefused ? 'bg-red-100 text-red-900 ring-red-300' : 'bg-red-50 text-red-700 ring-red-200'}`}>
                        <CircleDot className="h-3 w-3" /> {isCompleted ? 'Em conferência' : isRefused ? 'Recusa' : 'Cancelamento'}
                    </span>
                </div>

                {/* Progress */}
                <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                        <div className={`h-full rounded-full transition-all ${isCompleted ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${progressPct}%` }} />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-500" data-testid="text-finalize-progress">{doneSteps} de {totalSteps} verificados</span>
                </div>

                <div className="space-y-3 p-5">
                    {!isRefused && (
                    <>
                    {/* 1 - Endereço destino final */}
                    <FinSection n={1} done={chkAddress} icon={<MapPin className="h-4 w-4" />} title="Endereço de destino final">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <p className="text-[13px] font-medium text-slate-800" data-testid="text-destination-address">
                                {destinationAddress || 'Endereço de destino não informado'}
                            </p>
                            {mapLink && (
                                <a href={mapLink} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white" data-testid="link-open-map">
                                    <ExternalLink className="h-3.5 w-3.5" /> Abrir link do mapa
                                </a>
                            )}
                        </div>
                        <FinCheck label="Confirmo o endereço de destino final" checked={chkAddress} onToggle={() => setChkAddress(v => !v)} testId="check-address" />
                    </FinSection>

                    {/* 2 - Destino RAIO */}
                    {isRaio && (
                        <FinSection n={2} warn icon={<Radar className="h-4 w-4" />} title="Destino definido como RAIO">
                            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                                    <p className="text-[13px] font-medium text-amber-900">
                                        Esta OS foi cadastrada com destino por <b>raio de {raioFranchiseKm} km</b>. Confirme se a viatura realmente rodou esse raio.
                                    </p>
                                </div>
                                <p className="mt-3 text-xs font-semibold text-amber-900">A viatura rodou o raio de {raioFranchiseKm} km?</p>
                                <div className="mt-2 flex gap-2">
                                    <button type="button" onClick={() => { setRaioAnswer('yes'); setRaioRealKm(''); }} className={`flex-1 rounded-md border px-3 py-2 text-xs font-bold ${raioAnswer === 'yes' ? 'border-emerald-400 bg-emerald-600 text-white' : 'border-emerald-300 bg-white text-emerald-700'}`} data-testid="button-raio-yes">
                                        Sim, rodou o raio
                                    </button>
                                    <button type="button" onClick={() => setRaioAnswer('no')} className={`flex-1 rounded-md border px-3 py-2 text-xs font-bold ${raioAnswer === 'no' ? 'border-red-400 bg-red-600 text-white' : 'border-red-300 bg-white text-red-700'}`} data-testid="button-raio-no">
                                        Não — ajustar
                                    </button>
                                </div>
                                {raioAnswer === 'no' && (
                                    <div className="mt-3 rounded-md border border-red-200 bg-white p-2.5">
                                        <label className="text-[11px] font-semibold uppercase tracking-wide text-red-600">Ajustar raio realmente rodado (km)</label>
                                        <input value={raioRealKm} onChange={e => setRaioRealKm(e.target.value)} inputMode="decimal" placeholder="Ex: 62" className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-semibold text-slate-800 outline-none focus:border-red-400" data-testid="input-raio-real-km" />
                                    </div>
                                )}
                            </div>
                        </FinSection>
                    )}

                    {/* 3 - Confirmar cidades + tabela */}
                    <FinSection n={3} icon={<ArrowRightLeft className="h-4 w-4" />} title="Confirmar origem e destino">
                        <div className="grid grid-cols-2 gap-2">
                            <FinCityBox label="Cidade de origem (início da SM)" value={originCity || '—'} />
                            <FinCityBox label="Cidade de fim (link do mapa)" value={destCity || '—'} mapLink={mapLink} />
                        </div>
                        <div className="mt-2 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                            <TableProperties className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                            <p className="text-[12px] font-medium text-blue-900">
                                Lembrete: verifique se a <b>tabela aplicada</b> nesta OS está correta —
                                <span className="font-bold"> {appliedTableName || 'tabela não identificada'}</span>.
                            </p>
                        </div>
                        <FinCheck label="Confirmo as cidades e a tabela aplicada" checked={chkCities} onToggle={() => setChkCities(v => !v)} testId="check-cities" />
                    </FinSection>
                    </>
                    )}

                    {/* Recusa — hora + KM + evidência (sem checklist de endereço) */}
                    {isRefused && (
                        <FinSection n={1} danger icon={<UserX className="h-4 w-4" />} title="Recusar missão — hora e evidência obrigatórios">
                            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                                <p className="text-[12px] font-medium text-red-900">
                                    Para registrar a <b>Recusada</b>, confirme a hora exata do encerramento e anexe a evidência no sistema. O KM final é opcional (use quando a viatura já tiver saído).
                                </p>
                                <div className="mt-3">
                                    <label className="text-[10px] font-semibold uppercase tracking-wide text-red-600">KM final (opcional)</label>
                                    <input value={endKm} onChange={e => { setEndKm(e.target.value); setOdoResult(null); setOdoValidatedKm(null); setOdoConfirmed(false); }} inputMode="decimal" placeholder="Ex: 123456" className="mt-1 w-full rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-red-500" data-testid="input-confirm-end-km" />
                                </div>
                                <div className="mt-2">
                                    <label className="text-[10px] font-semibold uppercase tracking-wide text-red-600">Data e hora exata da recusa *</label>
                                    <input type="datetime-local" step={1} value={dt} min={minDateTime} onChange={e => setDt(e.target.value)} className="mt-1 w-full rounded-md border border-red-300 bg-white px-2.5 py-2 text-sm font-bold text-slate-800 outline-none focus:border-red-500" data-testid="input-confirm-real-time" />
                                </div>
                            </div>
                            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <p className="text-[12px] font-bold text-slate-800">Evidência do encerramento (obrigatório)</p>
                                <p className="mt-1 text-[11px] font-medium text-slate-500">Cole o print (Ctrl+V) ou anexe foto/comprovante do encerramento.</p>
                                <div tabIndex={0} onPaste={(e) => { const item = Array.from(e.clipboardData.items).find(it => it.type.startsWith('image/')); const file = item?.getAsFile(); if (file) { e.preventDefault(); handleOdometerImage(file); } }} className="mt-2 flex min-h-[64px] cursor-text flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-white p-3 text-center outline-none focus:border-red-500" data-testid="dropzone-terminal-evidence">
                                    {odoPreview ? (<img src={odoPreview} alt="Evidência" className="max-h-44 rounded-md border border-slate-200" />) : (<p className="text-[11px] font-semibold text-slate-400">Clique aqui e tecle Ctrl+V para colar</p>)}
                                    <label className="mt-1 inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-white"><Plus className="h-3.5 w-3.5" /> Anexar imagem<input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleOdometerImage(f); e.currentTarget.value=''; }} /></label>
                                </div>
                                {(odoUploading || odoChecking) && (<div className="mt-2 flex items-center gap-2 text-[12px] font-semibold text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Enviando evidência...</div>)}
                                {odoErr && (<div className="mt-2 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-600"><AlertTriangle size={13} /> {odoErr}</div>)}
                                {odoUrl && !odoUploading && (<div className="mt-2 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-2 text-[11px] font-bold text-emerald-800">Evidência salva no sistema.</div>)}
                            </div>
                        </FinSection>
                    )}

                    {/* 4 - KM rodado x KM da tabela (somente conclusão) */}
                    {isCompleted && (
                        <FinSection n={4} warn={kmMismatch} icon={<Gauge className="h-4 w-4" />} title="KM rodado x KM da tabela">
                            <div className="mb-2">
                                <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">KM final {odometerExempt ? '(opcional)' : '(obrigatório)'}</label>
                                <input value={endKm} onChange={e => { setEndKm(e.target.value); setOdoResult(null); setOdoValidatedKm(null); setOdoConfirmed(false); }} inputMode="decimal" placeholder="Ex: 123456" className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500" data-testid="input-confirm-end-km" />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <FinStat label="KM rodado (real)" value={`${traveled} km`} />
                                <FinStat label="KM da tabela (franquia)" value={franchiseKm > 0 ? `${franchiseKm} km` : '—'} />
                            </div>

                            {endKmNum != null && startKm > 0 && endKmNum < startKm && (
                                <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3" data-testid="warn-end-km-below-start">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                                    <p className="text-[12px] font-medium text-red-900">
                                        O KM final digitado (<b>{endKmNum}</b>) é <b>menor</b> que o KM inicial registrado (<b>{startKm}</b>). O hodômetro não pode diminuir, por isso o KM rodado aparece como <b>0</b>. Confira o número do painel — ou ajuste o KM inicial no Financeiro, se ele estiver errado.
                                    </p>
                                </div>
                            )}

                            {/* Auditoria do hodômetro por IA */}
                            {odometerExempt ? (
                            <>
                            <div className="mt-3 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3" data-testid="note-odometer-exempt">
                                <Gauge className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                                <p className="text-[12px] font-medium text-blue-900">
                                    Fornecedor <b>{providerName}</b>: KM final pode ser enviado depois, mas a <b>evidência é obrigatória</b> agora.
                                </p>
                            </div>
                            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <div className="flex items-center gap-2">
                                    <Gauge className="h-4 w-4 text-slate-600" />
                                    <p className="text-[12px] font-bold text-slate-800">Evidência do encerramento (obrigatório)</p>
                                </div>
                                <p className="mt-1 text-[11px] font-medium text-slate-500">Cole o print (Ctrl+V) ou anexe foto/comprovante.</p>
                                <div tabIndex={0} onPaste={(e) => { const item = Array.from(e.clipboardData.items).find(it => it.type.startsWith('image/')); const file = item?.getAsFile(); if (file) { e.preventDefault(); handleOdometerImage(file); } }} className="mt-2 flex min-h-[64px] cursor-text flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-white p-3 text-center outline-none focus:border-emerald-500" data-testid="dropzone-odometer">
                                    {odoPreview ? (<img src={odoPreview} alt="Evidência" className="max-h-44 rounded-md border border-slate-200" data-testid="img-odometer-preview" />) : (<p className="text-[11px] font-semibold text-slate-400">Clique aqui e tecle Ctrl+V para colar</p>)}
                                    <label className="mt-1 inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-white" data-testid="button-odometer-attach"><Plus className="h-3.5 w-3.5" /> Anexar imagem<input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleOdometerImage(f); e.currentTarget.value=''; }} /></label>
                                </div>
                                {(odoUploading || odoChecking) && (<div className="mt-2 flex items-center gap-2 text-[12px] font-semibold text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Enviando evidência...</div>)}
                                {odoErr && (<div className="mt-2 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-600"><AlertTriangle size={13} /> {odoErr}</div>)}
                                {odoUrl && !odoUploading && (<div className="mt-2 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-2 text-[11px] font-bold text-emerald-800">Evidência salva no sistema.</div>)}
                            </div>
                            </>
                            ) : (
                            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <div className="flex items-center gap-2">
                                    <Gauge className="h-4 w-4 text-slate-600" />
                                    <p className="text-[12px] font-bold text-slate-800">Print do hodômetro (obrigatório)</p>
                                </div>
                                <p className="mt-1 text-[11px] font-medium text-slate-500">Cole o print (Ctrl+V) ou anexe a foto do painel. A conferência por IA é só um auxílio — basta anexar o print para concluir, mesmo que a IA não consiga ler.</p>
                                <div
                                    tabIndex={0}
                                    onPaste={(e) => {
                                        const item = Array.from(e.clipboardData.items).find(it => it.type.startsWith('image/'));
                                        const file = item?.getAsFile();
                                        if (file) { e.preventDefault(); handleOdometerImage(file); }
                                    }}
                                    className="mt-2 flex min-h-[64px] cursor-text flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-white p-3 text-center outline-none focus:border-emerald-500"
                                    data-testid="dropzone-odometer"
                                >
                                    {odoPreview ? (
                                        <img src={odoPreview} alt="Hodômetro" className="max-h-44 rounded-md border border-slate-200" data-testid="img-odometer-preview" />
                                    ) : (
                                        <p className="text-[11px] font-semibold text-slate-400">Clique aqui e tecle Ctrl+V para colar o print</p>
                                    )}
                                    <label className="mt-1 inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-white" data-testid="button-odometer-attach">
                                        <Plus className="h-3.5 w-3.5" /> Anexar imagem
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleOdometerImage(f); e.currentTarget.value=''; }} />
                                    </label>
                                </div>

                                {(odoUploading || odoChecking) && (
                                    <div className="mt-2 flex items-center gap-2 text-[12px] font-semibold text-slate-600" data-testid="status-odometer-loading">
                                        <Loader2 className="h-4 w-4 animate-spin" /> {odoUploading ? 'Enviando print...' : 'Validando com IA...'}
                                    </div>
                                )}

                                {odoErr && (
                                    <div className="mt-2 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-600" data-testid="text-odometer-error">
                                        <AlertTriangle size={13} /> {odoErr}
                                    </div>
                                )}

                                {odoUrl && odoResult && !odoChecking && (
                                    <div className="mt-2 space-y-2">
                                        <div className={`rounded-md border px-2.5 py-2 text-[12px] font-medium ${odoResult.divergencia ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`} data-testid="text-odometer-result">
                                            <div className="flex items-center gap-1.5 font-bold">
                                                {odoResult.divergencia ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                                                {odoResult.divergencia ? 'Divergência detectada' : 'Hodômetro confere'}
                                            </div>
                                            <p className="mt-1">{odoResult.justificativa}</p>
                                            {odoResult.km_extraido && <p className="mt-1 text-[11px] opacity-80">KM lido na imagem: <b>{odoResult.km_extraido}</b> · KM informado: <b>{endKmNum}</b></p>}
                                        </div>
                                        {odoResult.divergencia && (
                                            <FinCheck label="OK, confirmo o total do hodômetro final" checked={odoConfirmed} onToggle={() => setOdoConfirmed(v => !v)} testId="check-odometer-confirm" />
                                        )}
                                        {odoFile && (
                                            <button type="button" onClick={() => validateOdometer(odoFile, endKmNum)} className="text-[11px] font-bold text-emerald-700 underline" data-testid="button-odometer-revalidate">Revalidar com IA</button>
                                        )}
                                    </div>
                                )}
                            </div>
                            )}
                            {kmMismatch && (
                                <>
                                    <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                                        <p className="text-[12px] font-medium text-red-900">
                                            O KM rodado <b>não bate</b> com o KM da tabela. Tabelas mais prováveis para esta REGIÃO (ajuste no Financeiro, se necessário):
                                        </p>
                                    </div>
                                    {suggestions.length > 0 && (
                                        <div className="mt-2 space-y-2">
                                            {suggestions.map((s, i) => (
                                                <FinTableSuggestion key={i} title={s.name} meta={s.meta} best={s.best} current={s.current} />
                                            ))}
                                        </div>
                                    )}
                                    <FinCheck label="Estou ciente da divergência e a tabela aplicada está correta" checked={chkTable} onToggle={() => setChkTable(v => !v)} testId="check-table" />
                                </>
                            )}
                            <div className="mt-2">
                                <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Data e hora exata da finalização</label>
                                <input type="datetime-local" step={1} value={dt} min={minDateTime} onChange={e => setDt(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500" data-testid="input-confirm-real-time" />
                            </div>
                        </FinSection>
                    )}

                    {/* 5 - Cancelamento (campos obrigatórios) */}
                    {isCancelled && (
                        <FinSection n={isRaio ? 4 : 3} danger icon={<XCircle className="h-4 w-4" />} title={veladaPassThrough ? 'Cancelar missão velada — horas e evidência' : 'Missão cancelada — hora, KM e evidência obrigatórios'}>
                            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                                <div className="flex items-start gap-2">
                                    <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                                    <p className="text-[12px] font-medium text-red-900">
                                        {veladaPassThrough
                                            ? <>Fornecedor <b>{providerName}</b>: confirme as datas e anexe a evidência. O <b>KM final pode ser enviado depois</b>.</>
                                            : 'Confirme as datas, o KM final e anexe a evidência. A data do cancelamento define a cobrança de horas extras.'}
                                    </p>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                    <FinDateField label="Data do cancelamento *" value={dt} min={minDateTime} onChange={setDt} testId="input-confirm-real-time" />
                                    <FinDateField label="Data de fim de viagem *" value={endTravelDt} min={minDateTime} onChange={setEndTravelDt} testId="input-cancel-end-travel" />
                                </div>
                                <div className="mt-2">
                                    <label className="text-[10px] font-semibold uppercase tracking-wide text-red-600">KM final {veladaPassThrough ? '(opcional)' : '*'}</label>
                                    <input value={endKm} onChange={e => { setEndKm(e.target.value); setOdoResult(null); setOdoValidatedKm(null); setOdoConfirmed(false); }} inputMode="decimal" placeholder="Ex: 123456" className="mt-1 w-full rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-red-500" data-testid="input-confirm-end-km" />
                                </div>
                            </div>
                            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <p className="text-[12px] font-bold text-slate-800">Evidência do cancelamento (obrigatório)</p>
                                <p className="mt-1 text-[11px] font-medium text-slate-500">Cole o print (Ctrl+V) ou anexe foto/comprovante.</p>
                                <div tabIndex={0} onPaste={(e) => { const item = Array.from(e.clipboardData.items).find(it => it.type.startsWith('image/')); const file = item?.getAsFile(); if (file) { e.preventDefault(); handleOdometerImage(file); } }} className="mt-2 flex min-h-[64px] cursor-text flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-white p-3 text-center outline-none focus:border-red-500" data-testid="dropzone-cancel-evidence">
                                    {odoPreview ? (<img src={odoPreview} alt="Evidência" className="max-h-44 rounded-md border border-slate-200" />) : (<p className="text-[11px] font-semibold text-slate-400">Clique aqui e tecle Ctrl+V para colar</p>)}
                                    <label className="mt-1 inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-white"><Plus className="h-3.5 w-3.5" /> Anexar imagem<input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleOdometerImage(f); e.currentTarget.value=''; }} /></label>
                                </div>
                                {(odoUploading || odoChecking) && (<div className="mt-2 flex items-center gap-2 text-[12px] font-semibold text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Enviando evidência...</div>)}
                                {odoErr && (<div className="mt-2 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-600"><AlertTriangle size={13} /> {odoErr}</div>)}
                                {odoUrl && !odoUploading && (<div className="mt-2 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-2 text-[11px] font-bold text-emerald-800">Evidência salva no sistema.</div>)}
                            </div>
                        </FinSection>
                    )}

                    {err && (
                        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-600" data-testid="text-confirm-error">
                            <AlertTriangle size={14} /> {err}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4">
                    <p className="text-[11px] text-slate-500">{allDone ? 'Tudo verificado. Você já pode finalizar.' : 'Conclua todos os itens para liberar a finalização.'}</p>
                    <button type="button" onClick={onCancel} className="ml-auto rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600" data-testid="button-confirm-finalize-cancel">
                        Voltar
                    </button>
                    <button type="button" onClick={handleConfirm} disabled={!allDone || submitting} className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white transition-all active:scale-95 ${(allDone && !submitting) ? (isCompleted ? 'bg-emerald-600 hover:bg-emerald-700' : isRefused ? 'bg-red-800 hover:bg-red-900' : 'bg-red-600 hover:bg-red-700') : 'cursor-not-allowed bg-slate-300 text-slate-500'}`} data-testid="button-confirm-finalize">
                        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                        {submitting
                            ? (isCompleted ? 'Finalizando...' : isRefused ? 'Registrando recusa...' : 'Cancelando...')
                            : (isCompleted ? 'Finalizar missão' : isRefused ? 'Confirmar recusa' : 'Confirmar cancelamento')}
                    </button>
                </div>
            </div>
        </div>
    );
};

const FinSection: React.FC<{ n: number; title: string; icon: React.ReactNode; children: React.ReactNode; done?: boolean; warn?: boolean; danger?: boolean; }> = ({ n, title, icon, children, done, warn, danger }) => {
    const ring = done ? 'ring-emerald-200' : danger ? 'ring-red-200' : warn ? 'ring-amber-200' : 'ring-slate-200';
    const badge = done ? 'bg-emerald-500 text-white' : danger ? 'bg-red-500 text-white' : warn ? 'bg-amber-400 text-amber-900' : 'bg-slate-200 text-slate-600';
    return (
        <div className={`rounded-xl bg-white p-4 ring-1 ${ring}`}>
            <div className="mb-2.5 flex items-center gap-2.5">
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-extrabold ${badge}`}>
                    {done ? <CheckCircle2 className="h-4 w-4" /> : n}
                </div>
                <div className="flex items-center gap-1.5 text-slate-700">{icon}</div>
                <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            </div>
            <div className="space-y-2 pl-1">{children}</div>
        </div>
    );
};

const FinCheck: React.FC<{ label: string; checked?: boolean; onToggle: () => void; testId?: string; }> = ({ label, checked, onToggle, testId }) => (
    <button type="button" onClick={onToggle} className="mt-1 flex w-full items-center gap-2 text-left text-[13px] font-medium text-slate-700" data-testid={testId}>
        <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white'}`}>
            {checked && <CheckCircle2 className="h-3.5 w-3.5" />}
        </span>
        {label}
    </button>
);

const FinCityBox: React.FC<{ label: string; value: string; mapLink?: string; }> = ({ label, value, mapLink }) => (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-0.5 text-[13px] font-bold text-slate-800">{value}</p>
        {mapLink && (
            <a href={mapLink} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600">
                <ExternalLink className="h-3 w-3" /> ver no mapa
            </a>
        )}
    </div>
);

const FinStat: React.FC<{ label: string; value: string; }> = ({ label, value }) => (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-0.5 text-lg font-extrabold text-slate-800">{value}</p>
    </div>
);

const FinTableSuggestion: React.FC<{ title: string; meta: string; best?: boolean; current?: boolean; }> = ({ title, meta, best, current }) => (
    <div className={`flex items-center gap-3 rounded-lg border p-2.5 ${best ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
        <div className="min-w-0">
            <div className="flex items-center gap-2">
                <p className="truncate text-[13px] font-bold text-slate-800">{title}</p>
                {best && <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">sugerida</span>}
                {current && <span className="rounded-full bg-slate-300 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-600">atual</span>}
            </div>
            <p className="truncate text-[11px] text-slate-500">{meta}</p>
        </div>
    </div>
);

const FinDateField: React.FC<{ label: string; value: string; min?: string; onChange: (v: string) => void; testId?: string; }> = ({ label, value, min, onChange, testId }) => (
    <div>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-red-600">{label}</label>
        <input type="datetime-local" step={1} value={value} min={min} onChange={e => onChange(e.target.value)} className="mt-1 w-full rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-red-500" data-testid={testId} />
    </div>
);

const UpdateMissionModal: React.FC<UpdateMissionModalProps> = ({ isOpen, onClose, mission, currentUser, onSuccess, hideProviderInfo = false }) => {
    const { isLoaded, loadError } = useLoadScript(googleMapsLoadConfig);
    const { showNotification } = useNotification();
    const mapsJsReady = isLoaded && !loadError && !!googleMapsApiKey;
    
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [pendingTollConfirm, setPendingTollConfirm] = useState<{ kind: 'pre-save' } | null>(null);
    const resumeSubmitRef = useRef<(() => void) | null>(null);
    const tollConfirmedRef = useRef(false);

    // Confirmação obrigatória de KM final + hora EXATA ao Concluir/Cancelar.
    // A SM só muda de status depois que o operador confirma esses valores.
    const [pendingFinalizeConfirm, setPendingFinalizeConfirm] = useState<{ kind: 'completed' | 'cancelled' | 'refused' } | null>(null);
    const finalizeConfirmedRef = useRef(false);
    // Status REAL escolhido no gate de finalização (Concluída/Cancelada). O
    // resume() do checklist re-dispara um handleUpdateSubmit CAPTURADO antes do
    // setEditData({status}) propagar, então editData.status pode estar defasado.
    // Este ref carrega a intenção do operador imune ao closure defasado.
    const pendingFinalizeStatusRef = useRef<MissionStatus | null>(null);
    const confirmedEndKmRef = useRef<number | null>(null);
    const confirmedRealTimeRef = useRef<string | null>(null);
    // Cancelamento: "Data de fim de viagem" (operacional). A data do cancelamento
    // em si vai para confirmedRealTimeRef (alimenta cancelStatusAt do recálculo).
    const confirmedEndTravelRef = useRef<string | null>(null);
    // Print do hodômetro confirmado no checklist (para relatório/foto/e-mails).
    const confirmedPrintUrlRef = useRef<string | null>(null);
    const confirmedPrintBlobRef = useRef<Blob | null>(null);
    const confirmedPrintBlobPromiseRef = useRef<Promise<Blob | null> | null>(null);
    // Relatório de fim de missão (dois botões: copiar texto / copiar foto).
    const [finalizeReport, setFinalizeReport] = useState<{ text: string; photoUrl: string | null } | null>(null);
    const [copiedReportText, setCopiedReportText] = useState(false);
    const [copiedReportPhoto, setCopiedReportPhoto] = useState(false);

    useEffect(() => {
        tollConfirmedRef.current = false;
        resumeSubmitRef.current = null;
        setPendingTollConfirm(null);
        finalizeConfirmedRef.current = false;
        pendingFinalizeStatusRef.current = null;
        confirmedEndKmRef.current = null;
        confirmedRealTimeRef.current = null;
        confirmedEndTravelRef.current = null;
        confirmedPrintUrlRef.current = null;
        confirmedPrintBlobRef.current = null;
        confirmedPrintBlobPromiseRef.current = null;
        setPendingFinalizeConfirm(null);
        // Print de atualização é estritamente da sessão: limpa ao abrir/trocar OS
        updatePrintBlobRef.current = null;
        setUpdatePrintPreview('');
    }, [mission?.id, isOpen]);
    
    // Controle de Relógio em Tempo Real
    const [isEndTimeLocked, setIsEndTimeLocked] = useState(false);

    // Permissões Administrativas
    const isCommercial = useMemo(() => {
        if (!currentUser) return false;
        const role = (currentUser.role || '').toLowerCase();
        return role === 'comercial';
    }, [currentUser]);

    // Apenas Plinio, Barbara e Simone preenchem o pedágio ao finalizar.
    // Operadores (Michele, Beatriz, Lucas, Daniel, etc.) finalizam a OS
    // sem o gate de pedágio — o valor é cobrado depois, no fluxo financeiro.
    const isTollResponsibleUser = useMemo(() => {
        if (!currentUser) return false;
        const norm = (s: string) => (s || '')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().trim();
        const name = norm(currentUser.name || currentUser.username || '');
        if (!name) return false;
        const allowedFirstNames = ['plinio', 'barbara', 'simone'];
        const firstName = name.split(/\s+/)[0];
        return allowedFirstNames.includes(firstName) || allowedFirstNames.some(n => name.includes(n));
    }, [currentUser]);

    // Financeiro (Bárbara): pode editar OS concluída/aprovada — inclusive KM final
    // de missões veladas TM SEG/ATIVA enviadas depois da conclusão.
    const isBarbaraFinance = useMemo(() => {
        if (!currentUser) return false;
        const name = (currentUser.name || currentUser.username || '').toLowerCase();
        return name.includes('barbara') || name.includes('bárbara');
    }, [currentUser]);

    const hasPrivilegedOsEdit = useMemo(() => {
        if (!currentUser) return false;
        const role = (currentUser.role || '').toLowerCase();
        return ['diretoria', 'administrador', 'avançado', 'avancado'].includes(role)
            || (currentUser.permissions && currentUser.permissions.includes('*'))
            || isBarbaraFinance;
    }, [currentUser, isBarbaraFinance]);

    const canEditRoute = useMemo(() => {
        if (!currentUser) return false;
        if (hasPrivilegedOsEdit) return true;
        const role = (currentUser.role || '').toLowerCase();
        return ['diretoria', 'administrador', 'avançado', 'avancado'].includes(role) || (currentUser.permissions && currentUser.permissions.includes('*'));
    }, [currentUser, hasPrivilegedOsEdit]);

    const isCompletedMission = mission?.status === MissionStatus.COMPLETED;
    const isBillingApproved = !!mission?.billing_approved;
    const isDiretoria = useMemo(() => {
        if (!currentUser) return false;
        const role = (currentUser.role || '').toLowerCase();
        const name = (currentUser.name || '').toLowerCase();
        if (role === 'diretoria') return true;
        if (name.includes('thiago moreira')) return true;
        if (name.includes('thiago') && !name.includes('arruda')) return true;
        if (name.includes('plinio') || name.includes('plínio')) return true;
        return false;
    }, [currentUser]);
    const canEditApproved = hasPrivilegedOsEdit;
    const canRevertStatus = hasPrivilegedOsEdit;
    const canEditTimes = hasPrivilegedOsEdit;
    const canEditEndTime = useMemo(() => {
        if (canEditTimes) return true;
        if (!currentUser) return false;
        const role = (currentUser.role || '').toLowerCase();
        return ['operacional', 'operador'].includes(role);
    }, [currentUser, canEditTimes]);

    // Listas de Dados
    const [providersList, setProvidersList] = useState<ProviderData[]>([]);
    const [vehiclesList, setVehiclesList] = useState<Vehicle[]>([]); 
    const [agentsList, setAgentsList] = useState<Agent[]>([]);
    const [allAgentsList, setAllAgentsList] = useState<Agent[]>([]);
    const [clientTables, setClientTables] = useState<ClientPriceTable[]>([]);
    const [clientVehiclesList, setClientVehiclesList] = useState<ClientVehicleDB[]>([]);
    const [dbPastDrivers, setDbPastDrivers] = useState<{name: string, phone: string}[]>([]);
    const [clientId, setClientId] = useState<number | null>(null);

    // Estados de Busca e Filtro
    const [searchProvider, setSearchTerm] = useState('');
    const [searchVehicle, setSearchVehicle] = useState('');
    const [searchAgent1, setSearchAgent1] = useState('');
    const [searchAgent2, setSearchAgent2] = useState('');
    const [searchCargoVehicle, setSearchCargoVehicle] = useState('');
    const [searchDriver, setSearchDriver] = useState('');
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

    const [quickModal, setQuickModal] = useState<'provider' | 'vehicle' | 'agent' | 'cargo' | 'browse_cargo' | null>(null);

    const [emailMissingAlert, setEmailMissingAlert] = useState<{ type: 'client' | 'provider'; name: string; entityId: string } | null>(null);
    const [quickEmailInput, setQuickEmailInput] = useState('');
    const [isSavingQuickEmail, setIsSavingQuickEmail] = useState(false);
    const [emailConfirmDialog, setEmailConfirmDialog] = useState<{ type: 'client' | 'provider' | 'both'; clientPayload?: any; providerPayload?: any } | null>(null);
    const [isSendingConfirmedEmail, setIsSendingConfirmedEmail] = useState(false);

    const [iblWarning, setIblWarning] = useState('');
    const [originalStatus, setOriginalStatus] = useState('');
    const [deslocFile, setDeslocFile] = useState<File | null>(null);
    const [deslocSending, setDeslocSending] = useState(false);
    const [dhlOccurrenceReportOpen, setDhlOccurrenceReportOpen] = useState(false);
    const [deslocExistingUrl, setDeslocExistingUrl] = useState('');
    const [mirroringFile, setMirroringFile] = useState<File | null>(null);
    const [mirroringPreview, setMirroringPreview] = useState('');
    const [mirroringSending, setMirroringSending] = useState(false);
    const [mirroringExistingUrl, setMirroringExistingUrl] = useState('');

    // Print da atualização (temporário — NUNCA vai para o Supabase/bucket).
    // Fica só em memória: blob PNG com a marca d'água da TM SEG, copiado
    // junto com o texto do formulário na hora de salvar.
    const [updatePrintPreview, setUpdatePrintPreview] = useState('');
    const [updatePrintProcessing, setUpdatePrintProcessing] = useState(false);
    const [updatePrintAiCleaned, setUpdatePrintAiCleaned] = useState(false);
    const [updatePrintTimings, setUpdatePrintTimings] = useState<PrintPipelineTimings | null>(null);
    const updatePrintBlobRef = useRef<Blob | null>(null);

    /** Pré-processa a foto do hodômetro (checklist) em paralelo ao submit — evita
     *  re-fetch + carimbo síncrono no fim da OS, que deixava o salvamento lento. */
    const prefetchConfirmedPrintBlob = (url: string) => {
        confirmedPrintBlobRef.current = null;
        confirmedPrintBlobPromiseRef.current = (async () => {
            try {
                const resp = await fetch(url);
                if (!resp.ok) return null;
                const raw = await resp.blob();
                const stamped = await stampBrandOnImageBlob(raw);
                confirmedPrintBlobRef.current = stamped;
                return stamped;
            } catch (prefetchErr) {
                console.warn('[FimDeMissao] Pré-carimbo da evidência falhou:', prefetchErr);
                return null;
            }
        })();
    };

    const SUPPORTED_PRINT_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
    const PRINT_PIPELINE_TIMEOUT_MS = 45_000;

    const base64ToBlob = (base64: string, mimeType: string): Blob => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: mimeType });
    };

    const isPrintPipelineDebug = () =>
      import.meta.env.DEV || localStorage.getItem('tmseg:print-pipeline-debug') === '1';

    /** Envia print ao pipeline server-side (multipart) e retorna imagem limpa + timings. */
    const processPrintOnServer = async (
      file: File,
    ): Promise<{ blob: Blob; cleaned: boolean; timings: PrintPipelineTimings } | null> => {
      const mime = (file.type || 'image/jpeg').toLowerCase();
      if (!SUPPORTED_PRINT_TYPES.has(mime)) {
        showNotification('Formato inválido', 'Use JPEG, PNG ou WEBP.', 'error');
        return null;
      }
      const uploadStart = performance.now();
      try {
        const token = localStorage.getItem('authToken') || '';
        const form = new FormData();
        form.append('image', file, file.name || 'print.jpg');
        const resp = await withTimeout(
          fetch('/api/gemini/clean-print', {
            method: 'POST',
            cache: 'no-store',
            headers: {
              Authorization: `Bearer ${token}`,
              'X-Print-Response': 'binary',
            },
            body: form,
          }),
          PRINT_PIPELINE_TIMEOUT_MS,
          'Timeout ao limpar print com IA',
        );
        const clientUploadMs = Math.round(performance.now() - uploadStart);
        if (!resp.ok) {
          const errBody = await resp.text().catch(() => '');
          let errMsg = `Erro ${resp.status}`;
          try {
            const parsed = errBody ? JSON.parse(errBody) : null;
            errMsg = parsed?.error || parsed?.message || errMsg;
          } catch {
            if (errBody) errMsg = errBody.slice(0, 120);
          }
          showNotification('Limpeza IA indisponível', `${errMsg}. Usando foto original.`, 'warning');
          return null;
        }

        const contentType = (resp.headers.get('Content-Type') || '').toLowerCase();
        if (contentType.startsWith('image/')) {
          const blob = await resp.blob();
          const cleaned = resp.headers.get('X-Print-Cleaned') === '1';
          let timings: PrintPipelineTimings = {
            uploadMs: clientUploadMs,
            readMs: 0,
            detectionMs: 0,
            removalMs: 0,
            logoMs: 0,
            saveMs: 0,
            totalMs: clientUploadMs,
          };
          try {
            const headerTimings = JSON.parse(resp.headers.get('X-Print-Timings') || '{}');
            timings = {
              uploadMs: headerTimings.uploadMs ?? clientUploadMs,
              readMs: headerTimings.readMs ?? 0,
              detectionMs: headerTimings.detectionMs ?? 0,
              removalMs: headerTimings.removalMs ?? 0,
              logoMs: 0,
              saveMs: headerTimings.saveMs ?? 0,
              totalMs: (headerTimings.totalMs ?? 0) + clientUploadMs,
            };
          } catch {
            // ignora parse
          }
          return { blob, cleaned, timings };
        }

        const j = await resp.json();
        if (!j?.image) return null;
        const blob = base64ToBlob(j.image, j.mimeType || 'image/png');
        const timings: PrintPipelineTimings = {
          uploadMs: j.timings?.uploadMs ?? clientUploadMs,
          readMs: j.timings?.readMs ?? 0,
          detectionMs: j.timings?.detectionMs ?? 0,
          removalMs: j.timings?.removalMs ?? 0,
          logoMs: 0,
          saveMs: j.timings?.saveMs ?? 0,
          totalMs: (j.timings?.totalMs ?? 0) + clientUploadMs,
        };
        return { blob, cleaned: !!j.cleaned, timings };
      } catch (e) {
        const msg = e instanceof TimeoutError
          ? 'A IA demorou demais. Usando foto original.'
          : 'Falha na limpeza. Usando foto original.';
        console.warn('[UpdatePrint] Pipeline server falhou (segue com foto original):', e);
        showNotification('Limpeza IA', msg, 'warning');
        return null;
      }
    };

    const applyBrandStampToBlob = async (source: Blob): Promise<{ blob: Blob; preview: string; logoMs: number }> => {
      const logoStart = performance.now();
      const photoUrl = URL.createObjectURL(source);
      try {
        const photo = await loadStampImage(photoUrl);
        const { width: canvasW, height: canvasH, scale } = computeScaledCanvasSize(photo.naturalWidth, photo.naturalHeight);
        let logo: HTMLImageElement | null = null;
        try {
          logo = await loadStampImage('/logo.png');
        } catch (logoErr) {
          console.warn('[UpdatePrint] Logo indisponível, segue sem carimbo:', logoErr);
        }
        const canvas = document.createElement('canvas');
        canvas.width = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas indisponível');
        ctx.drawImage(photo, 0, 0, photo.naturalWidth, photo.naturalHeight, 0, 0, canvasW, canvasH);
        if (logo) stampBrandOverlays(ctx, canvas.width, canvas.height, logo);
        if (scale < 1) {
          console.warn(`[UpdatePrint] Imagem reduzida de ${photo.naturalWidth}x${photo.naturalHeight} para ${canvasW}x${canvasH} (limite do navegador).`);
        }
        const blob: Blob = await new Promise((resolve, reject) =>
          canvas.toBlob(b => b ? resolve(b) : reject(new Error('Falha ao gerar PNG')), 'image/png'),
        );
        const preview = canvas.toDataURL('image/png');
        return { blob, preview, logoMs: Math.round(performance.now() - logoStart) };
      } finally {
        URL.revokeObjectURL(photoUrl);
      }
    };

    const processUpdatePrint = async (file: File) => {
      setUpdatePrintProcessing(true);
      setUpdatePrintTimings(null);
      const totalStart = performance.now();
      try {
        const processed = await processPrintOnServer(file);
        const sourceBlob = processed?.blob ?? file;
        const stamped = await applyBrandStampToBlob(sourceBlob);
        updatePrintBlobRef.current = stamped.blob;
        setUpdatePrintPreview(stamped.preview);
        setUpdatePrintAiCleaned(!!processed?.cleaned);

        if (!processed) {
          setUpdatePrintAiCleaned(false);
        }

        if (processed?.timings) {
          const timings: PrintPipelineTimings = {
            ...processed.timings,
            logoMs: stamped.logoMs,
            totalMs: Math.round(performance.now() - totalStart),
          };
          setUpdatePrintTimings(timings);
          if (isPrintPipelineDebug()) {
            console.info('[print-pipeline:client]', timings);
          }
        }
      } catch (e) {
        console.warn('[UpdatePrint] Falha ao processar print:', e);
        updatePrintBlobRef.current = null;
        setUpdatePrintPreview('');
        setUpdatePrintTimings(null);
        showNotification('Erro', 'Não foi possível processar o print colado. Tente novamente.', 'error');
      } finally {
        setUpdatePrintProcessing(false);
      }
    };

    const clearUpdatePrint = () => {
        updatePrintBlobRef.current = null;
        setUpdatePrintPreview('');
        setUpdatePrintAiCleaned(false);
        setUpdatePrintTimings(null);
    };

    const [editData, setEditData] = useState({
        provider: '', vehicleId: '', agent1: '', agent2: '',
        startKm: '', startDate: '', startTime: '', 
        endKm: '', endDate: '', endTime: '',
        manualProgress: 0,
        mapLink: '', description: '', status: MissionStatus.SOLICITED,
        origin: '', destination: '',
        missionType: 'Caracterizada',
        revenueValue: '', costValue: '', tollValue: '',
        isSameOs: false, applyCeva200km: false, applyVtc02h: false, parentMissionId: '',
        totalDistance: 0, currentLocationName: '',
        // Dados da Carga
        driver_name: '', driver_phone: '', gr_espelhamento: '',
        client_vehicle_id: '',
        client_vehicle_plate: '', client_vehicle_model: '',
        reference_number: '', billing_release: '', dhl_se_number: '', dhl_sm_number: '', dhl_deslocamento_km: ''
    });

    const [currentPreviewCoords, setCurrentPreviewCoords] = useState<{ lat: number, lng: number } | null>(null);

    /** Print colado/anexado pelo funcionário (sem foto automática de fallback). */
    const resolveExplicitUpdatePrintPhoto = async (): Promise<Blob | null> => {
        if (updatePrintProcessing) {
            await waitUntil(() => !updatePrintProcessing, 45000);
        }
        if (updatePrintBlobRef.current) return updatePrintBlobRef.current;
        if (updatePrintPreview?.startsWith('data:')) {
            try {
                return await dataUrlToBlob(updatePrintPreview);
            } catch {
                return null;
            }
        }
        return null;
    };

    /** Foto com logo + Instagram para cópia manual: print colado, preview ou mapa padrão. */
    const resolveGroupWhatsAppPhoto = async (statusLabel: string): Promise<Blob | null> => {
        const explicit = await resolveExplicitUpdatePrintPhoto();
        if (explicit) return explicit;
        try {
            return await createBrandedFallbackPhoto({
                coords: currentPreviewCoords,
                osId: mission?.id,
                status: statusLabel,
            });
        } catch (e) {
            console.warn('[WhatsApp] Falha ao gerar foto padrão TM SEG:', e);
            return null;
        }
    };

    const [parentOsSuggestions, setParentOsSuggestions] = useState<{id: string, client: string, provider: string, origin: string, destination: string, status: string}[]>([]);
    const [parentOsSearch, setParentOsSearch] = useState('');
    const [showParentOsDropdown, setShowParentOsDropdown] = useState(false);

    const updateLocRef = useRef<any>(null);
    const originAutocompleteRef = useRef<any>(null);
    const destinationAutocompleteRef = useRef<any>(null);
    const dropdownRef = useRef<HTMLFormElement>(null);

    const operationalStatuses = [
        MissionStatus.SOLICITED, MissionStatus.DOCUMENTATION, MissionStatus.SCHEDULED, 
        MissionStatus.ORIGIN, MissionStatus.IN_TRANSIT, MissionStatus.COMPLETED
    ];

    const restrictedStatuses = [MissionStatus.CANCELLED, MissionStatus.REFUSED];

    const isRequirementActive = useMemo(() => {
        return [
            MissionStatus.ORIGIN, 
            MissionStatus.IN_TRANSIT, 
            MissionStatus.COMPLETED
        ].includes(editData.status as MissionStatus);
    }, [editData.status]);

    const isOccurrenceRequired = isRequirementActive || editData.status === MissionStatus.REFUSED;
    const isGoogleLinkRequired = isRequirementActive;

    useEffect(() => {
        if (!isOpen || isEndTimeLocked) return;
        if (!canEditEndTime && mission && [MissionStatus.COMPLETED, MissionStatus.CANCELLED, MissionStatus.REFUSED, MissionStatus.PENDING].includes(mission.status as MissionStatus) && mission.endTime) return;

        // VERIFICAÇÃO DE AGENDAMENTO FUTURO
        // Se a data de início estiver no futuro, NÃO ativa o relógio de Tempo Real
        if (editData.startDate && editData.startTime) {
            const start = new Date(`${editData.startDate}T${editData.startTime}`);
            const now = new Date();
            // Adiciona margem de 1 minuto
            if (start > new Date(now.getTime() + 60000)) {
                return;
            }
        }

        const interval = setInterval(() => {
            const now = new Date();
            setEditData(prev => ({
                ...prev,
                endDate: formatIsoDateBR(now),
                endTime: formatTimeAuditBR(now)
            }));
        }, 1000);

        return () => clearInterval(interval);
    }, [isOpen, isEndTimeLocked, mission, editData.startDate, editData.startTime, canEditEndTime]);

    // Função auxiliar para validar KM (Apenas Ponto)
    const handleKmInput = (field: 'startKm' | 'endKm', value: string) => {
        let val = value.replace(/,/g, '.'); // Força ponto
        if (!/^[0-9]*\.?[0-9]*$/.test(val)) return; // Bloqueia caracteres não numéricos
        setEditData(prev => ({ ...prev, [field]: val }));
    };

    // Inteligência: Monitorar Cliente IBL e Origem Sorocaba
    useEffect(() => {
        const clientName = (mission?.client || '').toUpperCase();
        const originName = (editData.origin || '').toUpperCase();

        if (clientName.includes('IBL') && originName.includes('SOROCABA')) {
            setIblWarning('ALERTA DE PROTOCOLO: OPERAÇÕES IBL EM SOROCABA SÓ PERMITEM OS FORNECEDORES: CTS OU MACOR.');
        } else {
            setIblWarning('');
        }
    }, [mission, editData.origin]);

    // CÁLCULO DE MEDIÇÃO OPERACIONAL SINCRONIZADO
    const missionTotals = useMemo(() => {
        if (!mission) return { km: '0.0', time: '0h 0m', extraHours: 0, plannedKm: 0, traveled: 0 };
        const sKm = parseNumber(editData.startKm);
        const eKm = parseNumber(editData.endKm);
        const traveled = eKm > sKm ? (eKm - sKm) : 0;

        // REGRA LOGITECH (CEVA)
        const isLogitech = (mission.client || "").toUpperCase().includes('CEVA') && 
                           ((mission.destination || "").toUpperCase().includes('LOGITECH') || 
                            (mission as any).operation_type?.toUpperCase().includes('LOGITECH'));

        let plannedKm = mission.totalDistance || 0;
        if (plannedKm > 10000) plannedKm = plannedKm / 1000;
        if (editData.applyCeva200km || isLogitech) plannedKm = 200;
        else if (editData.applyVtc02h) plannedKm = 100;

        let totalHours = 0;
        let timeStr = '0h 0m';
        if (editData.startDate && editData.startTime && editData.endDate && editData.endTime) {
            try {
                const start = new Date(`${editData.startDate}T${editData.startTime}`);
                const end = new Date(`${editData.endDate}T${editData.endTime}`);
                const diffMs = end.getTime() - start.getTime();
                if (diffMs > 0) {
                    totalHours = diffMs / (1000 * 60 * 60);
                    const h = Math.floor(totalHours);
                    const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                    timeStr = `${h}h ${m}m`;
                }
            } catch (e) {}
        }

        let extraHours = 0;
        const cTables = [...clientTables].sort((a,b) => a.franchise_km - b.franchise_km);
        const currentTable = cTables.find(t => t.franchise_km >= plannedKm) || cTables[cTables.length - 1];
        
        if (currentTable) {
            const isFixedHoursRule = editData.applyVtc02h || 
                (currentTable.operation_type || '').toUpperCase().includes('02H') ||
                (currentTable.operation_type || '').toUpperCase().includes('02 HORAS');
            const isFixedDistRule = editData.applyCeva200km || isLogitech ||
                (currentTable.operation_type || '').toUpperCase().includes('200KM') ||
                (currentTable.operation_type || '').toUpperCase().includes('100KM');
            
            if (isFixedHoursRule) {
                totalHours = Math.min(totalHours, currentTable.franchise_hours || 3);
            }
            extraHours = Math.max(0, totalHours - (currentTable.franchise_hours || 0));
        }

        return { km: traveled.toFixed(1), time: timeStr, extraHours, plannedKm, traveled };
    }, [editData, clientTables, mission]);

    // Dados REAIS que alimentam o Checklist de Finalização (sem cálculo financeiro novo).
    const finalizeData = React.useMemo(() => {
        const isDhl = (mission?.client || '').toUpperCase().includes('DHL');
        const destinationAddress = editData.destination || mission?.destination || '';
        const originCity = extractCityFromAddress(editData.origin || mission?.origin || '');
        const destCity = extractCityFromAddress(destinationAddress);
        const destUpper = destinationAddress.toUpperCase();
        const isRaio = editData.applyCeva200km || /ACOMPANHAMENTO|RAIO/.test(destUpper);
        const raioFranchiseKm = editData.applyCeva200km || destUpper.includes('200') ? 200 : 100;

        const cTables = [...clientTables].sort((a, b) => a.franchise_km - b.franchise_km);
        const appliedTable = cTables.find(t => t.franchise_km >= missionTotals.plannedKm) || cTables[cTables.length - 1];
        const appliedTableName = appliedTable?.operation_type || '';
        const franchiseKm = appliedTable?.franchise_km || 0;

        // Sugestões (apenas GUIA): tabelas mais prováveis para a distância real.
        // A troca de tabela e o recálculo continuam no Modal Financeiro.
        const traveled = missionTotals.traveled;
        let suggestions: { name: string; meta: string; best?: boolean; current?: boolean }[] = [];
        if (isDhl && franchiseKm > 0 && traveled > franchiseKm) {
            const best = cTables.find(t => t.franchise_km >= traveled);
            suggestions = cTables
                .filter(t => t.id === best?.id || t.id === appliedTable?.id || (t.franchise_km >= traveled && t.franchise_km <= traveled * 1.5))
                .slice(0, 3)
                .map(t => ({
                    name: t.operation_type || `Tabela ${t.franchise_km}km`,
                    meta: `Franquia ${t.franchise_km}km` + (t.franchise_hours ? ` · ${t.franchise_hours}h` : ''),
                    best: t.id === best?.id,
                    current: t.id === appliedTable?.id,
                }));
        }

        return { isDhl, destinationAddress, originCity, destCity, isRaio, raioFranchiseKm, appliedTableName, franchiseKm, suggestions };
    }, [editData, mission, clientTables, missionTotals]);

    const loadMissionData = async () => {
        if (!mission) return;
        setIsLoadingData(true);
        try {
            const { data: m } = await supabase.from('missions').select('*').eq('id', mission.id).single();
            const startDT = m.start_time ? {
                date: formatIsoDateBR(new Date(m.start_time)),
                time: formatTimeAuditBR(new Date(m.start_time))
            } : { 
                date: formatIsoDateBR(),
                time: formatTimeAuditBR()
            };

            // Lógica de Data Final Inteligente:
            // Se a missão já tem data final (concluída/cancelada), usa ela.
            // Se não, verifica se a data inicial é Futura. Se for futura, deixa em branco.
            // Se for presente/passada, usa a data atual (Tempo Real).
            const now = new Date();
            const startObj = m.start_time ? new Date(m.start_time) : now;
            const isFutureStart = startObj > new Date(now.getTime() + 60000); // Buffer 1 min

            const endDT = m.end_time ? {
                date: formatIsoDateBR(new Date(m.end_time)),
                time: formatTimeAuditBR(new Date(m.end_time))
            } : (isFutureStart ? { date: '', time: '' } : { 
                date: formatIsoDateBR(),
                time: formatTimeAuditBR()
            });

            if ([MissionStatus.COMPLETED, MissionStatus.CANCELLED, MissionStatus.REFUSED, MissionStatus.PENDING].includes(m.status as MissionStatus)) {
                setIsEndTimeLocked(true);
            } else {
                setIsEndTimeLocked(false);
            }

            const coords = extractCoordinates(m.map_link || '');
            if (coords) setCurrentPreviewCoords(coords);

            const { data: clientObj } = await supabase.from('clients').select('id').eq('name', m.client).maybeSingle();
            if (clientObj) setClientId(clientObj.id);

            setOriginalStatus(m.status);
            setEditData({
                provider: m.provider || '', vehicleId: m.vehicle_id?.toString() || '',
                agent1: m.agent1 || '', agent2: m.agent2 || '',
                startKm: m.start_km?.toString() || '', startDate: startDT.date, startTime: startDT.time, 
                endKm: m.end_km?.toString() || '', endDate: endDT.date, endTime: endDT.time, 
                manualProgress: m.progress || 0,
                mapLink: (() => {
                    const raw = m.map_link || '';
                    if (!raw) return '';
                    const c = extractCoordinates(raw);
                    return c ? `https://www.google.com/maps?q=${c.lat},${c.lng}&z=17&hl=pt-BR` : raw;
                })(), description: '', status: m.status,
                origin: m.origin || '', destination: m.destination || '',
                missionType: m.mission_type || 'Caracterizada',
                revenueValue: m.revenue_value?.toString() || '',
                costValue: m.cost_value?.toString() || '',
                tollValue: m.toll_value?.toString() || '',
                isSameOs: m.is_same_os || false, parentMissionId: m.parent_mission_id || '',
                applyCeva200km: (m.destination || '').includes('200KM'),
                applyVtc02h: ((m.destination || '').includes('02H') || (m.destination || '').includes('02 HORAS')) && (m.client || '').toUpperCase().includes('VTC'),
                totalDistance: m.total_distance || 0, 
                currentLocationName: '',
                driver_name: m.driver_name || '',
                driver_phone: m.driver_phone || '',
                gr_espelhamento: m.gr_espelhamento || '',
                client_vehicle_id: m.client_vehicle?.toString() || '',
                client_vehicle_plate: mission.clientVehicle?.plate || '',
                client_vehicle_model: mission.clientVehicle?.model || '',
                reference_number: m.reference_number || '',
                billing_release: m.billing_release || '',
                dhl_se_number: m.dhl_se_number || '',
                dhl_sm_number: (m as any).dhl_sm_number || '',
                dhl_deslocamento_km: (m as any).dhl_deslocamento_km != null ? String((m as any).dhl_deslocamento_km) : ''
            });
            setDeslocExistingUrl((m as any).dhl_deslocamento_approval_url || '');

            setSearchTerm(m.provider || '');
            setSearchDriver(m.driver_name || '');
            setSearchCargoVehicle(mission.clientVehicle?.plate || '');
            setSearchAgent1(m.agent1 || '');
            setSearchAgent2(m.agent2 || '');
            setMirroringExistingUrl(m.mirroring_evidence_url || '');

            // Aguarda os auxiliares (vehicles/agents) carregarem para então
            // tentar recuperar o que o fornecedor já salvou via link DHL.
            refreshAuxData(m.client, m.provider, m.vehicle_id?.toString(), clientObj?.id)
                .then((aux) => {
                    return recoverFromDhlIntake(
                        m.id,
                        m.agent1 || '',
                        m.agent2 || '',
                        m.vehicle_id?.toString() || '',
                        m.mirroring_evidence_url || '',
                        aux?.vehicles || [],
                    );
                })
                .catch((err) => console.error('[UpdateMissionModal] refreshAuxData/recover falhou:', err));

            const currentLoc = (m.current_location || '').trim();
            const locParts = currentLoc.split('|').map((p: string) => p.trim());
            const locSegment = locParts.length > 1 ? locParts[locParts.length - 1] : currentLoc;
            const isLocUrl = /^https?:\/\//i.test(locSegment) || /maps\?q=/i.test(locSegment);
            const isLocCoordsFallback = /^LAT\s*-?\d+\.\d+,?\s*LNG\s*-?\d+\.\d+$/i.test(locSegment.trim());
            const isLocEmpty = !currentLoc || currentLoc === 'Solicitação Criada';
            const needsEnrichment = isLocEmpty || isLocUrl || isLocCoordsFallback;

            if (needsEnrichment) {
                let enrichCoords = extractCoordinates(locSegment) || coords;
                if (!enrichCoords && isLocCoordsFallback) {
                    const latM = locSegment.match(/LAT\s*(-?\d+\.\d+)/i);
                    const lngM = locSegment.match(/LNG\s*(-?\d+\.\d+)/i);
                    if (latM && lngM) enrichCoords = { lat: parseFloat(latM[1]), lng: parseFloat(lngM[1]) };
                }
                if (enrichCoords) {
                    reverseGeocode(enrichCoords.lat, enrichCoords.lng).then(async (resolvedAddr) => {
                        if (resolvedAddr && !/^LAT\s/i.test(resolvedAddr)) {
                            console.log(`[LOCATION] Auto-enriquecimento OS ${m.id}: "${resolvedAddr}"`);
                            const statusPart = locParts.length > 1 ? locParts[0] : '';
                            const newLocation = statusPart 
                                ? `${statusPart} | ${resolvedAddr.toUpperCase()}` 
                                : resolvedAddr.toUpperCase();
                            const { error } = await supabase.from('missions').update({ current_location: newLocation }).eq('id', m.id);
                            if (!error) {
                                console.log(`[LOCATION] OS ${m.id} enriquecida no banco: "${newLocation}"`);
                            }
                        }
                    }).catch(() => {});
                }
            } else if (locSegment && !isLocEmpty) {
                const cleanAddr = locSegment.replace(/\s*-?\s*BRASIL$/i, '').replace(/,\s*$/, '').trim();
                if (cleanAddr) {
                    setEditData(prev => ({ ...prev, currentLocationName: cleanAddr }));
                }
            }
        } catch (error) { console.error(error); } finally { setIsLoadingData(false); }
    };

    const fetchAllAgents = async (statusFilter?: string) => {
        let allData: any[] = [];
        let from = 0;
        const pageSize = 1000;
        while (true) {
            let query = supabase.from('agents').select('*').order('name').range(from, from + pageSize - 1);
            if (statusFilter) query = query.eq('status', statusFilter);
            const { data, error } = await query;
            if (error) throw error;
            if (data) allData = allData.concat(data);
            if (!data || data.length < pageSize) break;
            from += pageSize;
        }
        return allData;
    };

    const refreshAuxData = async (clientName: string, providerName: string, vId?: string, cId?: number) => {
        const [pRes, vRes, activeAgents, allAgents, ctRes, cvRes, dRes] = await Promise.all([
            supabase.from('providers').select('*').eq('status', 'Ativo').order('name'),
            supabase.from('vehicles').select('*').eq('status', 'Ativo'),
            fetchAllAgents('Ativo'),
            fetchAllAgents(),
            supabase.from('client_price_tables').select('*').or(clientFuzzyFilter(clientName)),
            cId ? supabase.from('client_vehicles').select('*').eq('client_id', cId).order('plate') : { data: [] },
            supabase.from('missions').select('driver_name, driver_phone').not('driver_name', 'is', null).order('created_at', { ascending: false }).limit(200)
        ]);
        
        if (pRes.data) setProvidersList(pRes.data);
        if (vRes.data) setVehiclesList(vRes.data);
        setAgentsList(activeAgents);
        setAllAgentsList(allAgents);
        if (ctRes.data) setClientTables(ctRes.data);
        if (cvRes.data) setClientVehiclesList(cvRes.data as any);
        
        if (dRes.data) {
            const unique = Array.from(new Set(dRes.data.map(d => (d.driver_name as string)?.toUpperCase().trim())))
                .map(name => {
                    const found = dRes.data.find(d => (d.driver_name as string)?.toUpperCase().trim() === name);
                    return { name: (name as string) || '', phone: (found?.driver_phone as string) || '' };
                }).filter(d => d.name !== '');
            setDbPastDrivers(unique);
        }

        const currentVId = vId || editData.vehicleId;
        const currentV = vRes.data?.find(v => v.id.toString() === currentVId);
        if (currentV) setSearchVehicle(currentV.plate);
        else setSearchVehicle('');
        return { vehicles: vRes.data || [], allAgents: allAgents || [] };
    };

    // Recupera automaticamente o que o fornecedor já salvou via link público DHL
    // (escoltistas, viatura e print do espelhamento). Preenche campos vazios da
    // OS — não sobrescreve dados já editados pelo operacional.
    const recoverFromDhlIntake = async (
        missionId: string,
        currentAgent1: string,
        currentAgent2: string,
        currentVehicleId: string,
        currentMirrorUrl: string,
        availableVehicles: any[],
    ) => {
        try {
            const r = await authFetch(`/api/dhl/intake/by-mission?missionId=${encodeURIComponent(missionId)}`);
            if (!r.ok) return;
            const j = await r.json();
            const intakes: any[] = (j?.intakes || []).filter((it: any) => it.effective_status !== 'cancelado');
            if (intakes.length === 0) return;
            // intakes vem ordenado por created_at desc no backend; mais recente primeiro
            const findFirst = (key: string) => intakes.map(it => it[key]).find(v => v && (typeof v !== 'object' || Object.keys(v || {}).length > 0));
            const a1Snap = findFirst('agent1_snapshot');
            const a2Snap = findFirst('agent2_snapshot');
            const vSnap = findFirst('vehicle_snapshot');
            const mirrorUrl = findFirst('mirror_proof_url');

            const updates: Partial<typeof editData> = {};
            const a1Name = (a1Snap?.nome || a1Snap?.name || '').toString().trim();
            const a2Name = (a2Snap?.nome || a2Snap?.name || '').toString().trim();
            if (!currentAgent1 && a1Name) { updates.agent1 = a1Name; setSearchAgent1(a1Name); }
            if (!currentAgent2 && a2Name) { updates.agent2 = a2Name; setSearchAgent2(a2Name); }

            const placa = (vSnap?.placa || '').toString().trim().toUpperCase();
            if (!currentVehicleId && placa) {
                const match = availableVehicles.find((v: any) =>
                    (v.plate || '').toString().toUpperCase().replace(/\s/g, '') === placa.replace(/\s/g, '')
                );
                if (match) {
                    updates.vehicleId = String(match.id);
                    setSearchVehicle(match.plate);
                } else {
                    // Sem correspondência em vehicles — mostra a placa no campo para
                    // o operacional cadastrar a viatura (atalho "+ veículo").
                    setSearchVehicle(placa);
                }
            }

            if (Object.keys(updates).length > 0) {
                setEditData(prev => ({ ...prev, ...updates }));
            }
            if (!currentMirrorUrl && mirrorUrl) {
                setMirroringExistingUrl(mirrorUrl);
            }
        } catch (e) {
            console.error('[UpdateMissionModal] recover DHL intake falhou:', e);
        }
    };

    const handlePlaceSelect = () => {
        const place = updateLocRef.current?.getPlace();
        if (place && place.geometry) {
            const addr = place.formatted_address || '';
            setEditData(prev => ({ 
                ...prev, currentLocationName: addr.toUpperCase(),
                mapLink: `https://www.google.com/maps?q=${place.geometry.location.lat()},${place.geometry.location.lng()}&z=17`
            }));
            setCurrentPreviewCoords({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng() });
            calculateProgressFromRoute(place.geometry.location.lat(), place.geometry.location.lng());
        }
    };

    const handleOriginSelect = () => {
        const place = originAutocompleteRef.current?.getPlace();
        if (place && place.formatted_address) {
            setEditData(prev => ({ ...prev, origin: place.formatted_address.toUpperCase() }));
        }
    };

    const handleDestinationSelect = () => {
        const place = destinationAutocompleteRef.current?.getPlace();
        if (place && place.formatted_address) {
            setEditData(prev => ({ ...prev, destination: place.formatted_address.toUpperCase() }));
        }
    };

    /** Progresso via rota Google: origem → posição atual → destino (Distance Matrix). */
    const calculateProgressFromRoute = async (currentLat: number, currentLng: number) => {
        if (!editData.origin?.trim()) {
            showNotification('Progresso', 'Informe a origem da missão para calcular o progresso.', 'warning');
            return;
        }
        const destination = normalizeProgressDestination(editData.destination || mission?.destination || '', {
            applyVtc02h: editData.applyVtc02h,
            applyCeva200km: editData.applyCeva200km,
            client: mission?.client,
        });
        if (!destination) {
            showNotification('Progresso', 'Informe o destino da missão para calcular o progresso.', 'warning');
            return;
        }
        try {
            const result = await fetchRouteProgress({
                origin: editData.origin.trim(),
                destination,
                current: `${currentLat},${currentLng}`,
            });
            if (result.success) {
                setEditData(prev => ({ ...prev, manualProgress: result.progressPct }));
                showNotification(
                    'Progresso da Rota',
                    `${result.progressPct}% — ${result.traveledKm} km de ${result.totalKm} km (origem → atual → destino)`,
                    'info',
                );
            } else {
                showNotification('Progresso', `Não foi possível calcular a rota: ${result.error || 'erro'}`, 'warning');
            }
        } catch (e) {
            console.error('[Progresso Rota]', e);
        }
    };

    const reverseGeocode = async (lat: number, lng: number, retries = 2): Promise<string> => {
        const fallbackAddress = `LAT ${lat.toFixed(6)}, LNG ${lng.toFixed(6)}`;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                if (attempt > 0) await new Promise(r => setTimeout(r, 1500 * attempt));
                const resp = await authFetch(`/api/reverse-geocode?lat=${lat}&lng=${lng}`);
                const data = await resp.json();
                if (data.success && data.address) {
                    const finalAddress = data.address;
                    setEditData(prev => ({ ...prev, currentLocationName: finalAddress }));
                    console.log(`[LOCATION] Reverse geocode: (${lat}, ${lng}) → "${finalAddress}"`);
                    return finalAddress;
                }
                console.warn('[LOCATION] Geocoder sem resultados para:', lat, lng, data.error);
            } catch (e) {
                console.error("[LOCATION] Geocoding falhou (tentativa " + (attempt + 1) + "):", e);
            }
        }
        return fallbackAddress;
    };

    const isGoogleMapsUrl = (value: string): boolean => {
        const raw = value.trim();
        if (!/^https?:\/\//i.test(raw)) return false;
        try {
            const host = new URL(raw).hostname.replace(/^www\./i, '').toLowerCase();
            return host === 'google.com'
                || host.endsWith('.google.com')
                || host === 'maps.app.goo.gl'
                || host === 'goo.gl';
        } catch {
            return /(?:google\.[^/]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(raw);
        }
    };

    const fallbackMapEmbedUrl = useMemo(() => {
        const coords = currentPreviewCoords || extractCoordinates(editData.mapLink) || extractCoordinates(editData.currentLocationName);
        if (!coords) return '';
        const latDelta = 0.018;
        const lngDelta = 0.018;
        const bbox = [
            coords.lng - lngDelta,
            coords.lat - latDelta,
            coords.lng + lngDelta,
            coords.lat + latDelta,
        ].join(',');
        return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${coords.lat},${coords.lng}`)}`;
    }, [currentPreviewCoords, editData.mapLink, editData.currentLocationName, editData.destination]);

    const fallbackMapOpenUrl = useMemo(() => {
        const query = (editData.currentLocationName || editData.mapLink || editData.destination || '').trim();
        if (editData.mapLink) return editData.mapLink;
        if (!query) return '';
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    }, [editData.currentLocationName, editData.mapLink, editData.destination]);

    const resolveTypedAddress = async (rawValue: string) => {
        const trimmed = rawValue.trim();
        if (trimmed.length < 3 || /^https?:\/\//i.test(trimmed) || extractCoordinates(trimmed)) return;

        try {
            const resp = await authFetch(`/api/geocode-address?address=${encodeURIComponent(trimmed)}`);
            const data = await resp.json();
            const loc = data?.location;
            if (data?.success && Number.isFinite(loc?.lat) && Number.isFinite(loc?.lng)) {
                const coords = { lat: Number(loc.lat), lng: Number(loc.lng) };
                const standardLink = `https://www.google.com/maps?q=${coords.lat},${coords.lng}&z=17&hl=pt-BR`;
                setCurrentPreviewCoords(coords);
                setEditData(prev => ({
                    ...prev,
                    currentLocationName: String(data.address || trimmed),
                    mapLink: standardLink,
                }));
                calculateProgressFromRoute(coords.lat, coords.lng);
                showNotification('Endereço localizado', 'Coordenadas encontradas e link do Google Maps gerado.', 'success');
            }
        } catch (e) {
            console.warn('[LOCATION] Falha ao geocodificar endereço digitado:', e);
        }
    };

    const handleLocationInputChange = async (val: string) => {
        const trimmed = val.trim();
        setEditData(prev => ({
            ...prev,
            currentLocationName: val,
            mapLink: trimmed ? prev.mapLink : '',
        }));
        const coords = extractCoordinates(val);
        if (coords) {
            const standardLink = `https://www.google.com/maps?q=${coords.lat},${coords.lng}&z=17&hl=pt-BR`;
            setCurrentPreviewCoords(coords);
            setEditData(prev => ({ ...prev, mapLink: standardLink }));
            showNotification('GPS Identificado', 'Resolvendo endereço...', 'success');
            const resolvedAddress = await reverseGeocode(coords.lat, coords.lng);
            calculateProgressFromRoute(coords.lat, coords.lng);
            const isRealAddress = resolvedAddress && !/^LAT\s/i.test(resolvedAddress);
            if (isRealAddress) {
                showNotification('GPS Identificado', `Endereço: ${resolvedAddress}. Link e localização sincronizados.`, 'success');
            } else {
                showNotification('GPS Identificado', 'Coordenadas capturadas. O endereço será resolvido ao salvar.', 'success');
            }
            return;
        }

        if (isGoogleMapsUrl(trimmed)) {
            setEditData(prev => ({ ...prev, currentLocationName: val, mapLink: trimmed }));
            setCurrentPreviewCoords(null);
            showNotification('Link Google Maps validado', 'Link salvo. Se ele não tiver coordenadas, o mapa de prévia ficará indisponível, mas a atualização poderá ser salva.', 'success');
            return;
        }

        if (trimmed.length >= 3 && !/^https?:\/\//i.test(trimmed)) {
            const searchLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
            setEditData(prev => ({ ...prev, currentLocationName: val, mapLink: searchLink }));
            setCurrentPreviewCoords(null);
        }
    };

    useEffect(() => { if (isOpen && mission) loadMissionData(); }, [isOpen, mission]);

    useEffect(() => {
        if (!editData.isSameOs || !mission?.client) { setParentOsSuggestions([]); return; }
        const fetchParentSuggestions = async () => {
            let query = supabase.from('missions').select('id, client, provider, origin, destination, status')
                .eq('client', mission.client).neq('id', mission.id).order('created_at', { ascending: false }).limit(50);
            if (editData.provider) query = query.eq('provider', editData.provider);
            const { data } = await query;
            if (data) setParentOsSuggestions(data);
        };
        fetchParentSuggestions();
    }, [editData.isSameOs, mission?.client, editData.provider, mission?.id]);

    useEffect(() => {
        if (!editData.isSameOs || !parentOsSearch || parentOsSearch.length < 2) return;
        const searchTerm = parentOsSearch.toUpperCase().replace('GTM-', '');
        const alreadyFound = parentOsSuggestions.some(s => s.id.toUpperCase().includes(searchTerm));
        if (alreadyFound) return;
        const timer = setTimeout(async () => {
            const searchId = parentOsSearch.toUpperCase().startsWith('GTM-') ? parentOsSearch.toUpperCase() : `GTM-${searchTerm}`;
            const { data } = await supabase.from('missions').select('id, client, provider, origin, destination, status')
                .ilike('id', `%${searchTerm}%`).neq('id', mission?.id || '').limit(10);
            if (data && data.length > 0) {
                setParentOsSuggestions(prev => {
                    const existing = new Set(prev.map(p => p.id));
                    const newItems = data.filter((d: any) => !existing.has(d.id));
                    return [...prev, ...newItems];
                });
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [parentOsSearch, editData.isSameOs]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setActiveDropdown(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleMirroringUpload = async () => {
        if (!mirroringFile || !mission) return;
        setMirroringSending(true);
        try {
            const ts = Date.now();
            const ext = mirroringFile.name.split('.').pop() || 'jpg';
            const filePath = `espelhamento/${mission.id}_${ts}.${ext}`;
            const { error: upErr } = await supabase.storage.from('mission-evidence').upload(filePath, mirroringFile, { upsert: true });
            if (upErr) throw upErr;
            const { data: urlData } = supabase.storage.from('mission-evidence').getPublicUrl(filePath);
            const imageUrl = urlData.publicUrl || '';

            const { error: mErr } = await supabase.from('missions').update({ mirroring_evidence_url: imageUrl }).eq('id', mission.id);
            if (mErr) { console.error('Erro ao salvar URL do espelhamento:', mErr); alert('Erro ao salvar evidência de espelhamento.'); }
            setMirroringExistingUrl(imageUrl);

            try {
                const vehiclePlate = searchVehicle || editData.client_vehicle_plate || '—';
                await authFetch('/api/email/mirroring-evidence', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        missionId: mission.id,
                        client: mission.client,
                        imageUrl,
                        vehiclePlate,
                        origin: editData.origin,
                        destination: editData.destination,
                        start_time: editData.startDate && editData.startTime ? new Date(`${editData.startDate}T${editData.startTime}`).toISOString() : '',
                        mission_type: editData.missionType,
                        senderName: JSON.parse(localStorage.getItem('userData') || '{}').name || undefined
                    })
                });
                showNotification('Evidência Enviada', 'Foto do espelhamento salva e e-mail enviado ao cliente.', 'success');
            } catch (emailErr) {
                console.error('[Email] Erro ao enviar evidência:', emailErr);
                showNotification('Evidência Salva', 'Foto salva, mas houve erro ao enviar o e-mail.', 'warning');
            }

            setMirroringFile(null);
            setMirroringPreview('');
        } catch (err: any) {
            console.error('[Mirroring]', err);
            showNotification('Erro', 'Falha ao enviar evidência: ' + (err.message || ''), 'error');
        } finally {
            setMirroringSending(false);
        }
    };

    const handleDeslocamentoUpload = async () => {
        if (!deslocFile || !mission) return;
        setDeslocSending(true);
        try {
            const ext = deslocFile.name.split('.').pop() || 'png';
            const filePath = `${mission.id}/deslocamento_${Date.now()}.${ext}`;
            const { error: upErr } = await supabase.storage.from('mission-evidence').upload(filePath, deslocFile, { contentType: deslocFile.type, upsert: true });
            if (upErr) throw upErr;
            const { data: urlData } = supabase.storage.from('mission-evidence').getPublicUrl(filePath);
            const publicUrl = urlData?.publicUrl || '';
            const { error: updErr } = await supabase.from('missions').update({ dhl_deslocamento_approval_url: publicUrl }).eq('id', mission.id);
            if (updErr) throw updErr;
            setDeslocExistingUrl(publicUrl);
            setDeslocFile(null);
            try {
                await supabase.from('system_logs').insert({
                    entity: 'MissionEvidence',
                    entity_id: mission.id,
                    action_type: 'dhl_deslocamento_print',
                    details: JSON.stringify({ fileName: deslocFile.name, filePath, publicUrl, uploadedBy: currentUser?.name || 'Sistema', uploadedAt: new Date().toISOString(), context: 'Edição da OS - Print da aprovação de deslocamento DHL' }),
                    created_at: new Date().toISOString()
                });
            } catch (logErr) { console.warn('Falha ao registrar log de print de deslocamento:', logErr); }
            showNotification('Sucesso', 'Print da aprovação de deslocamento anexado.', 'success');
        } catch (err: any) {
            console.error('[DeslocamentoPrint]', err);
            showNotification('Erro', 'Falha ao enviar print: ' + (err.message || ''), 'error');
        } finally {
            setDeslocSending(false);
        }
    };

    const handleUpdateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!mission || !currentUser) return;

        if (isCompletedMission && isBillingApproved && !canEditApproved) {
            // OS aprovada: o snapshot financeiro é IMUTÁVEL. Porém o KM de deslocamento
            // DHL é auditoria-only (alimenta apenas a coluna T da planilha SE) e o
            // requisito é que esse campo seja editável SEMPRE, inclusive em OS
            // finalizada/aprovada. Persistimos só esse campo, sem tocar em
            // revenue/cost/toll/snapshot, e bloqueamos o resto.
            const deslocKmValue = editData.dhl_deslocamento_km !== '' ? (parseFloat(editData.dhl_deslocamento_km) || 0) : null;
            const { error: deslocErr } = await supabase.from('missions').update({ dhl_deslocamento_km: deslocKmValue }).eq('id', mission.id);
            if (deslocErr) {
                showNotification('Erro', 'Falha ao salvar KM de deslocamento: ' + deslocErr.message, 'error');
                return;
            }
            showNotification('Salvo', 'KM de deslocamento atualizado. Os demais campos estão travados porque a OS já foi aprovada.', 'success');
            return;
        }

        if (isCompletedMission && editData.status !== MissionStatus.COMPLETED && !canRevertStatus && !canEditApproved) {
            showNotification('Sem Permissão', 'Apenas perfis Avançado, Administrador ou Diretoria podem reverter uma OS concluída.', 'error');
            return;
        }

        if (isCompletedMission && !canEditApproved && canRevertStatus && editData.status !== MissionStatus.COMPLETED && editData.status !== MissionStatus.IN_TRANSIT) {
            showNotification('Status Inválido', 'Uma OS concluída só pode ser revertida para "Em Viagem".', 'error');
            return;
        }

        let startIso = new Date(`${editData.startDate}T${editData.startTime}`).toISOString();

        const isTransitionToInTransit = editData.status === MissionStatus.IN_TRANSIT && 
            [MissionStatus.ORIGIN, MissionStatus.SCHEDULED, MissionStatus.DOCUMENTATION, MissionStatus.SOLICITED].includes(originalStatus as MissionStatus);
        
        if (isTransitionToInTransit && !canEditTimes) {
            const now = new Date();
            const scheduledStart = new Date(`${editData.startDate}T${editData.startTime}`);
            if (now < scheduledStart) {
                startIso = now.toISOString();
                const newDate = formatIsoDateBR(now);
                const newTime = formatTimeAuditBR(now);
                setEditData(prev => ({ ...prev, startDate: newDate, startTime: newTime }));
            }
        }
        
        let endIso = null;
        if (editData.endDate && editData.endTime) {
            endIso = new Date(`${editData.endDate}T${editData.endTime}`).toISOString();
        }
        // Hora REAL confirmada pelo operador (gate de conclusão) vira o end_time
        // oficial. Em CANCELAMENTO não gravamos end_time — o motor usa
        // _cancelStatusAt; a hora real do cancelamento vai para o recálculo via
        // body do recalc-on-cancel.
        const isCancelSubmit =
            pendingFinalizeStatusRef.current === MissionStatus.CANCELLED
            || editData.status === MissionStatus.CANCELLED;
        if (confirmedRealTimeRef.current && !isCancelSubmit) {
            endIso = confirmedRealTimeRef.current;
        }
        if (endIso && new Date(endIso) < new Date(startIso) && !canEditTimes) {
            alert("ERRO DE CRONOLOGIA: A data/hora de término não pode ser anterior ao início da missão.\n\nPor favor, verifique se a data final está correta.");
            return;
        }

        if (isGoogleLinkRequired && !editData.mapLink) {
            alert(`ERRO DE PROTOCOLO: Para o status "${editData.status}", é OBRIGATÓRIO fornecer um link válido do Google Maps ou coordenadas GPS antes de salvar.`);
            return;
        }

        if (isOccurrenceRequired && !editData.description.trim()) {
            alert(`ERRO DE PROTOCOLO: Para o status "${editData.status}", o campo OCORRÊNCIA é obrigatório.`);
            return;
        }

        const checkBlockedAgent = (agentName: string, fieldLabel: string) => {
            if (!agentName || agentName.trim() === '') return false;
            const nameUpper = agentName.trim().toUpperCase();
            const found = allAgentsList.find(a => a.name.toUpperCase() === nameUpper);
            if (found && found.status !== 'Ativo') {
                const isAcaoTrabalhista = found.status === 'Bloqueado / Ação Trabalhista';
                const extraMsg = isAcaoTrabalhista ? '\n\n⚠️ ATENÇÃO: Este agente possui AÇÃO TRABALHISTA ativa. Qualquer escalação pode gerar implicações jurídicas para a empresa.' : '';
                alert(`⛔ BLOQUEIO DE SEGURANÇA\n\nO agente "${found.name}" está com status "${found.status}" e NÃO pode ser escalado para nenhuma operação.\n\nCampo: ${fieldLabel}${extraMsg}\n\nRemova este agente ou selecione outro com status ATIVO.`);
                return true;
            }
            return false;
        };

        if (checkBlockedAgent(editData.agent1, 'Agente 1 (Líder)')) return;
        if (checkBlockedAgent(editData.agent2, 'Agente 2 (Auxiliar)')) return;

        // DHL não exige e-mail de notificação cadastrado: o fechamento da OS
        // alimenta a planilha SE / fluxo próprio da DHL, então não bloqueamos o
        // operador pedindo e-mail do cliente DHL.
        if (mission?.client && !/DHL/i.test(mission.client)) {
            const clientName = mission.client;
            let cliCheck: any = null;
            const { data: byName } = await supabase.from('clients').select('id, email, operational_email, trading_name, name, status').eq('name', clientName);
            cliCheck = byName?.find(c => c.status === 'Ativo') || byName?.[0] || null;
            if (!cliCheck) {
                const { data: byTrading } = await supabase.from('clients').select('id, email, operational_email, trading_name, name, status').eq('trading_name', clientName);
                cliCheck = byTrading?.find(c => c.status === 'Ativo') || byTrading?.[0] || null;
            }
            if (!cliCheck) {
                const { data: byIlike } = await supabase.from('clients').select('id, email, operational_email, trading_name, name, status').ilike('trading_name', clientName);
                cliCheck = byIlike?.find(c => c.status === 'Ativo') || byIlike?.[0] || null;
            }
            if (cliCheck && !(cliCheck.operational_email?.trim()) && !(cliCheck.email?.trim())) {
                setEmailMissingAlert({ type: 'client', name: mission.client, entityId: cliCheck.id });
                setQuickEmailInput('');
                return;
            }
        }
        if (editData.provider) {
            const provName = editData.provider;
            let provCheck: any = null;
            const { data: byName } = await supabase.from('providers').select('id, email, os_email, trading_name, name, status').eq('name', provName);
            provCheck = byName?.find(p => p.status === 'Ativo') || byName?.[0] || null;
            if (!provCheck) {
                const { data: byTrading } = await supabase.from('providers').select('id, email, os_email, trading_name, name, status').eq('trading_name', provName);
                provCheck = byTrading?.find(p => p.status === 'Ativo') || byTrading?.[0] || null;
            }
            if (!provCheck) {
                const { data: byIlike } = await supabase.from('providers').select('id, email, os_email, trading_name, name, status').ilike('trading_name', provName);
                provCheck = byIlike?.find(p => p.status === 'Ativo') || byIlike?.[0] || null;
            }
            if (provCheck && !(provCheck.os_email?.trim()) && !(provCheck.email?.trim())) {
                setEmailMissingAlert({ type: 'provider', name: editData.provider, entityId: provCheck.id });
                setQuickEmailInput('');
                return;
            }
        }

        // Salvar Alterações em fase inicial (Solicitada/Documentação/Agendada): operadores
        // como Beatriz e Michelle cadastram equipe sem concluir. Se Concluída/Cancelada/
        // Recusada ficou selecionada por engano, preservamos o status operacional no save.
        const saveSubmitStatus = resolveStatusForSaveSubmit({
            missionStatus: mission.status,
            editStatus: editData.status,
            originalStatus,
            finalizeConfirmed: finalizeConfirmedRef.current,
        });
        if (saveSubmitStatus !== editData.status && !finalizeConfirmedRef.current) {
            setEditData(prev => (prev.status === saveSubmitStatus ? prev : { ...prev, status: saveSubmitStatus }));
        }

        // GATE de confirmação operacional (Concluir / Cancelar / Recusar): antes de
        // mudar o status terminal, o operador PRECISA confirmar KM final, hora exata
        // e evidência no sistema.
        if (!finalizeConfirmedRef.current && !mission.billing_approved) {
            const _sKm = parseNumber(editData.startKm);
            const _eKm = parseNumber(editData.endKm);
            const _hasStart = _sKm > 0 && editData.startDate && editData.startTime;
            const _exemptOdo = isOdometerExemptProvider(editData.provider);
            const _hasEnd = (_exemptOdo ? true : (_eKm > 0 && _eKm >= _sKm)) && !!editData.endDate && !!editData.endTime;
            const _selected = saveSubmitStatus as MissionStatus;
            const _isInFlight = [MissionStatus.IN_TRANSIT, MissionStatus.ORIGIN].includes(_selected);
            const _isPending = _selected === MissionStatus.PENDING;
            const _isExplicitRevert = isCompletedMission && canRevertStatus && _selected === MissionStatus.IN_TRANSIT;
            const willComplete = !_isExplicitRevert && mission.status !== MissionStatus.COMPLETED &&
                (_selected === MissionStatus.COMPLETED || (!_exemptOdo && (_isPending || _isInFlight) && _hasStart && _hasEnd));
            const willCancel = _selected === MissionStatus.CANCELLED && mission.status !== MissionStatus.CANCELLED;
            const willRefuse = _selected === MissionStatus.REFUSED && mission.status !== MissionStatus.REFUSED;
            if (willComplete || willCancel || willRefuse) {
                resumeSubmitRef.current = () => {
                    finalizeConfirmedRef.current = true;
                    handleUpdateSubmit({ preventDefault: () => {} } as React.FormEvent);
                };
                pendingFinalizeStatusRef.current = willComplete
                    ? MissionStatus.COMPLETED
                    : willCancel
                        ? MissionStatus.CANCELLED
                        : MissionStatus.REFUSED;
                setIsEndTimeLocked(true);
                setPendingFinalizeConfirm({
                    kind: willComplete ? 'completed' : willCancel ? 'cancelled' : 'refused',
                });
                return;
            }
        }

        // GATE de pedágio (Task #45): precede QUALQUER persistência.
        // Se esta submissão vai marcar a OS como Concluída e ainda não há
        // confirmação explícita de pedágio (log TOLL_CONFIRMATION com
        // valor casando com mission.toll_value), abrimos o dialog e
        // suspendemos o submit. Após confirmação, persistimos toll_value
        // e re-disparamos o submit para gravar status/dados juntos.
        if (!tollConfirmedRef.current && !mission.billing_approved && isTollResponsibleUser) {
            const _sKm = parseNumber(editData.startKm);
            const _eKm = parseNumber(editData.endKm);
            const _hasStart = _sKm > 0 && editData.startDate && editData.startTime;
            const _exemptOdo = isOdometerExemptProvider(editData.provider);
            const _hasEnd = (_exemptOdo ? true : (_eKm > 0 && _eKm >= _sKm)) && !!editData.endDate && !!editData.endTime;
            let _fs = editData.status as MissionStatus;
            const _isPending = _fs === MissionStatus.PENDING;
            const _isInFlight = [MissionStatus.IN_TRANSIT, MissionStatus.ORIGIN].includes(_fs);
            const _isExplicitRevert = isCompletedMission && canRevertStatus && _fs === MissionStatus.IN_TRANSIT;
            if (!_exemptOdo && (_isPending || _isInFlight) && _hasStart && _hasEnd && !_isExplicitRevert) _fs = MissionStatus.COMPLETED;
            if (_fs === MissionStatus.COMPLETED && (!_hasStart || !_hasEnd)) _fs = MissionStatus.PENDING;
            const willBeCompleted = _fs === MissionStatus.COMPLETED && mission.status !== MissionStatus.COMPLETED;
            if (willBeCompleted) {
                let alreadyConfirmed = false;
                try {
                    const { data: tollLogs } = await supabase
                        .from('system_logs')
                        .select('details')
                        .eq('entity', 'MissionTollConfirmation')
                        .eq('entity_id', mission.id)
                        .order('created_at', { ascending: false })
                        .limit(1);
                    const log = tollLogs && tollLogs[0];
                    if (log) {
                        const parsed = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
                        const loggedValue = Number(parsed?.value ?? 0);
                        const dbValue = Number(mission.toll_value ?? 0);
                        if (Math.abs(loggedValue - dbValue) < 0.01) alreadyConfirmed = true;
                    }
                } catch (lookupErr) {
                    console.error('[TollConfirm] lookup falhou', lookupErr);
                }
                if (!alreadyConfirmed) {
                    resumeSubmitRef.current = () => {
                        tollConfirmedRef.current = true;
                        handleUpdateSubmit({ preventDefault: () => {} } as React.FormEvent);
                    };
                    setPendingTollConfirm({ kind: 'pre-save' });
                    return;
                }
            }
        }

        setIsUpdating(true);
        try {
            const finalDescription = editData.description.trim().toUpperCase();

            let resolvedLocationName = editData.currentLocationName || '';
            
            const isCoordsFallbackValue = /^LAT\s*-?\d+\.\d+,?\s*LNG\s*-?\d+\.\d+$/i.test(resolvedLocationName.trim());
            const isUrlValue = /^https?:\/\//i.test(resolvedLocationName.trim());
            
            if ((!resolvedLocationName || isCoordsFallbackValue || isUrlValue) && editData.mapLink) {
                const coords = extractCoordinates(editData.mapLink);
                if (coords) {
                    const geocoded = await reverseGeocode(coords.lat, coords.lng);
                    if (geocoded && !/^LAT\s/i.test(geocoded)) {
                        resolvedLocationName = geocoded;
                    } else if (!resolvedLocationName) {
                        resolvedLocationName = geocoded;
                    }
                }
            }
            
            if (!resolvedLocationName && editData.mapLink) {
                const coords = extractCoordinates(editData.mapLink);
                if (coords) {
                    resolvedLocationName = `LAT ${coords.lat.toFixed(6)}, LNG ${coords.lng.toFixed(6)}`;
                }
            }

            const locationData = {
                address: resolvedLocationName.toUpperCase(),
                mapLink: editData.mapLink,
                coordinates: extractCoordinates(editData.mapLink)
            };

            const finalLocationToSave = locationData.address 
                ? `${finalDescription}${finalDescription ? ' | ' : ''}${locationData.address}` 
                : finalDescription;
            
            let finalDestination = editData.destination;
            const isVtcClient = (mission.client || '').toUpperCase().includes('VTC');
            if (editData.applyVtc02h && isVtcClient) finalDestination = '02 HORAS DE ACOMPANHAMENTO';
            else if (editData.applyCeva200km) finalDestination = '200KM DE ACOMPANHAMENTO';

            let finalStatus = (finalizeConfirmedRef.current ? editData.status : saveSubmitStatus) as MissionStatus;
            // Gate de finalização: o resume() do checklist invoca um
            // handleUpdateSubmit capturado ANTES do setEditData({status}) ter
            // efeito, então editData.status aqui pode estar defasado (ex.:
            // "Em Viagem"). Para fornecedores isentos de hodômetro (ATIVA/TM SEG)
            // não há o auto-complete abaixo que mascarava isso nos demais — a OS
            // ficava presa sem concluir. Usamos o status REAL escolhido no gate.
            if (finalizeConfirmedRef.current && pendingFinalizeStatusRef.current) {
                finalStatus = pendingFinalizeStatusRef.current;
            }

            const sKm = parseNumber(editData.startKm);
            // KM final confirmado pelo operador (gate de conclusão) tem prioridade.
            const eKm = confirmedEndKmRef.current != null ? confirmedEndKmRef.current : parseNumber(editData.endKm);
            // Fornecedores ATIVA/TM SEG (veladas/IBL) enviam o KM depois — para eles
            // a conclusão NÃO exige KM (nem inicial nem final): o checklist de
            // finalização só pede a data/hora de fim. Exigir start_km>0 deixava a OS
            // presa (caía em PENDENTE e o status não mudava para Concluída).
            const exemptOdo = isOdometerExemptProvider(editData.provider);
            const hasStart = exemptOdo ? true : (sKm > 0 && !!editData.startDate && !!editData.startTime);
            const hasEnd = (exemptOdo ? true : (eKm > 0 && eKm >= sKm)) && !!endIso;

            const isCurrentPending = finalStatus === MissionStatus.PENDING;
            const isCurrentInFlight = [MissionStatus.IN_TRANSIT, MissionStatus.ORIGIN].includes(finalStatus);
            const isExplicitRevert = isCompletedMission && canRevertStatus && finalStatus === MissionStatus.IN_TRANSIT;

            if (!exemptOdo && (isCurrentPending || isCurrentInFlight) && hasStart && hasEnd && !isExplicitRevert) {
                finalStatus = MissionStatus.COMPLETED;
                showNotification('IA Operacional', 'Detectamos todos os dados necessários. OS concluída automaticamente.', 'success');
            }

            if (finalStatus === MissionStatus.COMPLETED && shouldDowngradeCompletedToPending({
                exemptOdo,
                finalizeConfirmed: finalizeConfirmedRef.current,
                hasStart,
                hasEnd,
            })) {
                finalStatus = MissionStatus.PENDING;
                const missing = [];
                if (!exemptOdo && (!editData.startDate || !editData.startTime)) missing.push('Hora Inicial');
                if (!editData.endDate || !editData.endTime) missing.push('Hora Final');
                if (!exemptOdo && sKm <= 0) missing.push('KM Inicial');
                if (!exemptOdo && (eKm <= 0 || eKm < sKm)) missing.push('KM Final');
                const veladaHint = exemptOdo && finalizeConfirmedRef.current
                    ? ' Informe a hora final no checklist. O hodômetro (KM) pode ser preenchido depois.'
                    : '';
                showNotification(
                    'Status Pendente',
                    (missing.length
                        ? `Faltam dados obrigatórios: ${missing.join(', ')}. A OS ficará como PENDENTE até o preenchimento completo.`
                        : `Faltam dados para concluir 100%. A OS ficará como PENDENTE.${veladaHint}`),
                    'warning',
                );
            }

            const plannedDist = missionTotals.plannedKm || 0;
            const kmRodado = eKm > sKm ? (eKm - sKm) : 0;
            const occurrenceText = (finalLocationToSave || '').toUpperCase();
            const isAtDestination = occurrenceText.includes('DESTINO') ||
                occurrenceText.includes('ENTREGUE') ||
                occurrenceText.includes('PONTO C') ||
                occurrenceText.includes('DESCARREGADO') ||
                occurrenceText.includes('FINALIZADO') ||
                occurrenceText.includes('CONCLUÍ');

            const isOdometerAnomaly = plannedDist > 0 && kmRodado > 0 && kmRodado > plannedDist * 5;
            if (isOdometerAnomaly && !isAtDestination && finalStatus !== MissionStatus.COMPLETED) {
                showNotification('Erro de Hodômetro', `KM rodado (${kmRodado.toFixed(1)}) é ${(kmRodado / plannedDist).toFixed(1)}x maior que a distância prevista (${plannedDist.toFixed(1)} KM). Verifique os valores de KM Inicial e Final.`, 'warning');
            }

            let progressValue: number;
            if (finalStatus === MissionStatus.COMPLETED || isAtDestination) {
                progressValue = 100;
            } else if (isOdometerAnomaly) {
                progressValue = editData.manualProgress;
            } else {
                const routeProgress = await resolveRouteProgressPct({
                    origin: editData.origin,
                    destination: finalDestination,
                    mapLink: editData.mapLink,
                    applyVtc02h: editData.applyVtc02h,
                    applyCeva200km: editData.applyCeva200km,
                    client: mission?.client,
                });
                const odometerPct = (kmRodado > 0 && plannedDist > 0)
                    ? Math.min(100, Math.round((kmRodado / plannedDist) * 100))
                    : 0;
                // Usa o melhor sinal disponível; não zera progresso já calculado na UI.
                const candidates = [
                    routeProgress?.progressPct ?? -1,
                    odometerPct,
                    editData.manualProgress || 0,
                    mission?.progress || 0,
                ].filter((n) => Number.isFinite(n) && n >= 0);
                progressValue = candidates.length ? Math.min(100, Math.max(...candidates)) : 0;
            }

            if (editData.provider && editData.provider.trim() !== '' && 
               finalStatus === MissionStatus.SOLICITED) {
                finalStatus = MissionStatus.DOCUMENTATION;
            }

            if (editData.provider && editData.vehicleId && editData.agent1 && editData.agent1.trim() !== '' && 
               (finalStatus === MissionStatus.SOLICITED || finalStatus === MissionStatus.DOCUMENTATION)) {
                finalStatus = MissionStatus.SCHEDULED;
            }

            const vehicleCargaId = editData.client_vehicle_id;
            
            const updateData: any = {
                status: finalStatus,
                map_link: locationData.mapLink,
                current_location: finalLocationToSave,
                last_update: new Date().toISOString(),
                updated_by: currentUser.name,
                provider: editData.provider,
                vehicle_id: parseInt(editData.vehicleId) || null,
                agent1: editData.agent1,
                agent2: editData.agent2,
                start_km: sKm || null,
                start_time: startIso,
                end_km: eKm || null,
                // Cancelamento: o motor financeiro usa _cancelStatusAt (a data do
                // cancelamento, enviada ao recalc-on-cancel). O end_time, quando
                // gravado, é apenas a "Data de fim de viagem" operacional do checklist
                // (não afeta o cálculo). Conclusão grava a hora exata confirmada.
                end_time: finalStatus === MissionStatus.CANCELLED ? (confirmedEndTravelRef.current || null) : endIso,
                is_same_os: editData.isSameOs,
                parent_mission_id: editData.isSameOs ? (editData.parentMissionId || null) : null,
                valor_zero_motivo: editData.isSameOs ? 'MESMA OS' : ((parseFloat(editData.costValue || '0') === 0) ? 'AGUARDANDO DEFINIÇÃO' : ''),
                progress: progressValue,
                driver_name: editData.driver_name.toUpperCase(),
                driver_phone: editData.driver_phone,
                gr_espelhamento: editData.gr_espelhamento,
                client_vehicle: vehicleCargaId ? parseInt(vehicleCargaId) : null,
                origin: editData.origin.toUpperCase(),
                destination: finalDestination.toUpperCase(),
                reference_number: editData.reference_number || null,
                billing_release: editData.billing_release || null,
                dhl_se_number: editData.dhl_se_number ? editData.dhl_se_number.trim().toUpperCase() : null,
                dhl_sm_number: editData.dhl_sm_number ? editData.dhl_sm_number.trim().toUpperCase() : null,
                dhl_deslocamento_km: editData.dhl_deslocamento_km !== '' ? (parseFloat(editData.dhl_deslocamento_km) || 0) : null
            };

            // REGRA PRIORITÁRIA: OS Recusada SEMPRE zera valores de cliente,
            // fornecedor e pedágio — independente do que estiver salvo. Sem
            // exceções, sem snapshot, sem aprovação.
            if (finalStatus === MissionStatus.REFUSED) {
                updateData.revenue_value = 0;
                updateData.cost_value = 0;
                updateData.toll_value = 0;
                updateData.toll_value_provider = 0;
                updateData.snapshot_data = null;
                updateData.billing_approved = false;
                updateData.valor_zero_motivo = 'OS Recusada — zerado automaticamente';
                // Constraint check_valor_zero_motivo exige edit_reason quando valor = 0.
                updateData.revenue_edit_reason = 'OS Recusada — zerado automaticamente';
                updateData.cost_edit_reason = 'OS Recusada — zerado automaticamente';
            }

            console.log(`[LOCATION] Enviando localização para OS ${mission.id}:`, {
                map_link: updateData.map_link,
                current_location: updateData.current_location,
                address: locationData.address,
                coordinates: locationData.coordinates
            });

            let saveResult: any = null;
            let saveError: any = null;
            for (let attempt = 1; attempt <= 3; attempt++) {
                const payload = attempt > 1 && saveError?.message?.includes('valor_zero_motivo') ? (() => { const d = { ...updateData }; delete d.valor_zero_motivo; return d; })() : updateData;
                const { error, data: updatedRow } = await supabase.from('missions').update(payload).eq('id', mission.id).select('id, last_update, current_location, map_link').single();
                if (!error && updatedRow) {
                    saveResult = updatedRow;
                    saveError = null;
                    break;
                }
                saveError = error;
                if (attempt < 3) {
                    console.warn(`[LOCATION] Tentativa ${attempt}/3 falhou para OS ${mission.id}, retentando...`, error?.message);
                    await new Promise(r => setTimeout(r, 1000 * attempt));
                }
            }
            if (saveError) throw saveError;
            if (!saveResult) throw new Error('Falha na persistência: registro não retornado após UPDATE');

            if (saveResult.current_location !== updateData.current_location || saveResult.map_link !== updateData.map_link) {
                console.error('[LOCATION] Divergência pós-salvamento!', {
                    enviado: { current_location: updateData.current_location, map_link: updateData.map_link },
                    banco: { current_location: saveResult.current_location, map_link: saveResult.map_link }
                });
            } else {
                console.log(`[LOCATION] OS ${mission.id} salva com sucesso — endereço: "${saveResult.current_location}", link: "${saveResult.map_link}"`);
            }

            const isRevertFromCompleted = isCompletedMission && finalStatus === MissionStatus.IN_TRANSIT;

            // Gatilho automático: ao MUDAR para Cancelada, dispara recálculo
            // server-side para aplicar a regra de cancellation_fee — assim o
            // operacional não precisa abrir o modal financeiro e apertar
            // "Recalcular". O endpoint já tem salvaguardas (OS aprovada e
            // edição manual NÃO são tocadas).
            if (finalStatus === MissionStatus.CANCELLED && mission.status !== MissionStatus.CANCELLED) {
                try {
                    const cancelIso = confirmedRealTimeRef.current;
                    const r = await authFetch(`/api/missions/${mission.id}/recalc-on-cancel`, {
                        method: 'POST',
                        ...(cancelIso ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cancelStatusAt: cancelIso }) } : {})
                    });
                    if (r.ok) {
                        const j = await r.json().catch(() => ({} as any));
                        if (j?.success) {
                            console.log(`[CANCEL RECALC] OS ${mission.id}: receita ${j.old?.revenue} → ${j.new?.revenue}, custo ${j.old?.cost} → ${j.new?.cost}`);
                        }
                    }
                } catch (e) {
                    console.warn('[CANCEL RECALC] Falha no recálculo automático:', e);
                }
            }

            // Comissão RH automática ao concluir OS (fire-and-forget).
            if (finalStatus === MissionStatus.COMPLETED && originalStatus !== MissionStatus.COMPLETED) {
                void (async () => {
                    try {
                        const { data: fresh } = await supabase
                            .from('missions')
                            .select('revenue_value, client, mission_type')
                            .eq('id', mission.id)
                            .single();
                        const result = await autoCalculateMissionCommissions(supabase, {
                            missionId: mission.id,
                            revenueValue: Number(fresh?.revenue_value ?? mission.revenue_value ?? editData.revenueValue ?? 0),
                            clientName: fresh?.client || mission.client || '',
                            serviceType: fresh?.mission_type || mission.mission_type || editData.missionType || '',
                            agentNames: [editData.agent1, editData.agent2].filter(Boolean) as string[],
                        });
                        const inserted = result.results.filter((r) => r.inserted);
                        if (inserted.length) {
                            console.log(`[RH Commission] OS ${mission.id}: ${inserted.length} comissão(ões) gerada(s)`, inserted);
                        }
                    } catch (e) {
                        console.warn('[RH Commission] Falha no cálculo automático:', e);
                    }
                })();
            }

            await supabase.from('system_logs').insert([{
                user_name: currentUser.name || 'Usuário',
                action_type: isRevertFromCompleted ? 'MISSION_STATUS_REVERT' : 'MISSION_UPDATE',
                entity: 'Mission',
                entity_id: mission.id,
                details: JSON.stringify({
                    status: finalStatus,
                    previous_status: mission.status,
                    ...(isRevertFromCompleted && { revert_reason: 'Reversão autorizada de Concluída para Em Viagem', reverted_by_role: currentUser.role }),
                    provider: editData.provider,
                    agent1: editData.agent1,
                    agent2: editData.agent2,
                    start_km: sKm || null,
                    end_km: eKm || null,
                    origin: editData.origin,
                    destination: editData.destination
                })
            }]);

            if (confirmedPrintUrlRef.current && [MissionStatus.COMPLETED, MissionStatus.CANCELLED, MissionStatus.REFUSED].includes(finalStatus as MissionStatus)) {
                try {
                    await supabase.from('system_logs').insert({
                        user_name: currentUser.name || 'Usuário',
                        entity: 'MissionEvidence',
                        entity_id: mission.id,
                        action_type: 'terminal_status_confirmed',
                        details: JSON.stringify({
                            status: finalStatus,
                            evidenceUrl: confirmedPrintUrlRef.current,
                            endKm: eKm || null,
                            confirmedAt: confirmedRealTimeRef.current || endIso,
                            uploadedBy: currentUser.name || 'Sistema',
                        }),
                        created_at: new Date().toISOString(),
                    });
                } catch (evErr) { console.warn('[TerminalEvidence] Falha ao registrar confirmação:', evErr); }
            }
            
            const dateObj = new Date(startIso);
            const dateStr = formatDateBR(dateObj);
            const timeStr = formatTimeBR(dateObj);
            
            const formatFL = formatAgentShortName;
            const cityPart = parseMonitoringCityFromLocationName(editData.currentLocationName);

            const isDHL = /DHL/i.test(mission.client || '');
            const fmtDateTime = (iso?: string) => {
                if (!iso) return '';
                try { return formatDateTimeBR(iso); } catch { return ''; }
            };
            let cachedStatusHistory: Array<{ changed_at: string; new_value: string }> | null = null;
            let dhlOriginAt = '', dhlInTransitAt = '', dhlCompletedAt = '';
            if (isDHL) {
                try {
                    const { data: statusHist } = await supabase
                        .from('mission_history')
                        .select('changed_at,new_value')
                        .eq('mission_id', mission.id)
                        .eq('field_name', 'status')
                        .order('changed_at', { ascending: false });
                    cachedStatusHistory = statusHist || null;
                    if (statusHist) {
                        const lastOf = (val: string) => (statusHist as any[]).find(h => h.new_value === val)?.changed_at;
                        dhlOriginAt = fmtDateTime(lastOf('Origem'));
                        dhlInTransitAt = fmtDateTime(lastOf('Em Viagem'));
                        dhlCompletedAt = fmtDateTime(lastOf('Concluída'));
                    }
                } catch {}
                const nowStr = fmtDateTime(new Date().toISOString());
                if (finalStatus === MissionStatus.ORIGIN && !dhlOriginAt) dhlOriginAt = nowStr;
                if (finalStatus === MissionStatus.IN_TRANSIT && !dhlInTransitAt) dhlInTransitAt = nowStr;
                if (finalStatus === MissionStatus.COMPLETED && !dhlCompletedAt) dhlCompletedAt = nowStr;
            }
            const report = isDHL ? `*ESCOLTA ARMADA*⚡️

🗒️ *SE:* ${(editData.dhl_se_number || '').toString().trim().toUpperCase()}
🚔 *VIATURA:* ${searchVehicle || ''}
🥷 *AGT 1:* ${formatFL(editData.agent1)}
🥷 *AGT 2:* ${formatFL(editData.agent2)}

👔 *CLIENTE:* DHL
🏦 *ORIGEM:* ${editData.origin?.toUpperCase() || ''}
🏭 *DESTINO:* ${(finalDestination || '').toUpperCase().replace(/\s*[—-]\s*DESTINO\s+A\s+DEFINIR\s*$/i, '').trim()}
👨‍🦰 *MOTORISTA:* ${formatFL(editData.driver_name)}
📞 *FONE:* ${editData.driver_phone || ''}
🚛 *CAVALO:* ${editData.client_vehicle_plate || ''}
🚛 *CARRETA:* ${(editData as any).client_vehicle_plate_2 || mission.clientVehicle2?.plate || ''}

🕑 *INÍCIO PREVISTO:* ${fmtDateTime(mission.createdAt)}
🕑 *CHEGADA NA ORIGEM:* ${dhlOriginAt}
🧭 *INÍCIO DE OPERAÇÃO:* ${dhlInTransitAt}
🧭 *FIM DE OPERAÇÃO:* ${dhlCompletedAt}

🖋️ *STATUS:* ${finalStatus.toUpperCase()}${finalDescription ? ' — ' + finalDescription.toUpperCase() : ''}` : buildMonitoringWhatsAppReport({
                osId: mission.id,
                status: finalStatus,
                dateStr,
                timeStr,
                operationType: editData.missionType,
                client: mission.client,
                origin: editData.origin,
                destination: finalDestination,
                vehiclePlate: editData.client_vehicle_plate,
                vehicleModel: editData.client_vehicle_model,
                driverName: editData.driver_name,
                driverPhone: editData.driver_phone,
                escortVehicle: searchVehicle,
                agent1: editData.agent1,
                agent2: editData.agent2,
                progress: progressValue,
                occurrence: finalDescription || 'SEM INFORMAÇÃO',
                locationCity: cityPart,
                mapLink: editData.mapLink,
            });

            const isNowCompleted = finalStatus === MissionStatus.COMPLETED && originalStatus !== MissionStatus.COMPLETED;

            // Quando a cópia combinada (texto+foto) dá certo, o pai NÃO pode
            // re-copiar só o texto (isso sobrescreveria a foto no clipboard).
            let combinedCopied = false;
            // Na conclusão de OS a cópia é feita mais abaixo (texto de fim de
            // missão + foto), então este bloco só roda para atualizações normais.
            // Envio automático ao grupo de WhatsApp do cliente (formulário + foto).
            // Aguarda o POST antes de fechar o modal — evita perda do envio e mostra toast.
            if (!isNowCompleted) {
                const hasPrint = hasExplicitUpdatePrint(updatePrintBlobRef.current, updatePrintPreview);
                const shouldSendGroup = shouldSendClientGroupWhatsApp({
                    finalStatus,
                    originalStatus,
                    hasExplicitPrint: hasPrint,
                    isMissionCompletion: false,
                    isDhl: isDHL,
                    occurrence: finalDescription,
                    previousOccurrence: mission.currentLocation || '',
                });
                if (shouldSendGroup) {
                    const statusLabel = `${finalStatus.toUpperCase()}${finalDescription ? ' — ' + finalDescription.toUpperCase() : ''}`;
                    // Print colado tem prioridade; sem print (só mudança de status) usa foto TM SEG.
                    const groupPhoto = await resolveGroupWhatsAppPhoto(statusLabel);
                    if (!groupPhoto) {
                        showNotification('WhatsApp', 'Não foi possível gerar a foto da atualização — grupo do cliente não recebeu a OS.', 'warning');
                    } else {
                        const r = await sendUpdateToClientGroup(mission.client || '', report, groupPhoto, mission.id, true);
                        if (r.sent) {
                            showNotification('WhatsApp', 'Atualização (formulário + foto) enviada ao grupo do cliente.', 'success');
                        } else if (r.skipped) {
                            showNotification('WhatsApp', `Grupo do cliente não configurado: ${r.error || 'cadastre o WhatsApp do cliente'}.`, 'warning');
                        } else if (r.error) {
                            showNotification('WhatsApp', `Envio automático ao grupo do cliente falhou: ${r.error}`, 'error');
                        }
                    }
                } else if (isDHL && hasPrint && !shouldSendGroup) {
                    showNotification('WhatsApp', 'Atualização registrada no sistema — NÃO enviada ao grupo DHL (cliente só recebe marcos operacionais com print).', 'info');
                }
            }

            if (!isNowCompleted) try {
                const printBlob = await resolveGroupWhatsAppPhoto(`${finalStatus.toUpperCase()}${finalDescription ? ' — ' + finalDescription.toUpperCase() : ''}`);
                if (printBlob) {
                    try {
                        // WhatsApp ignora a imagem quando texto+foto vêm juntos no
                        // clipboard. Popup guiado obrigatório: COPIAR FOTO → colar
                        // no WhatsApp → COPIAR TEXTO → colar na legenda → fecha só.
                        if (showWhatsappCopyPopup(printBlob, report)) {
                            combinedCopied = true;
                            // Print é de uso único: evita reutilização acidental num próximo salvamento
                            updatePrintBlobRef.current = null;
                            setUpdatePrintPreview('');
                        } else {
                            await navigator.clipboard.writeText(report);
                            showNotification('Relatório Copiado', 'Monitoramento copiado (este navegador não suporta copiar foto).', 'success');
                        }
                    } catch (combinedErr) {
                        console.warn('[UpdatePrint] Cópia da foto falhou, copiando só o texto:', combinedErr);
                        await navigator.clipboard.writeText(report);
                        showNotification('Relatório Copiado', 'Monitoramento copiado (a foto não pôde ser incluída neste navegador).', 'success');
                    }
                } else {
                    await navigator.clipboard.writeText(report);
                    showNotification('Relatório Copiado', 'Monitoramento formatado salvo e copiado.', 'success');
                }
            } catch (err) { console.warn(err); }

            // FIM DE MISSÃO: ao concluir, copia AUTOMATICAMENTE o relatório de
            // fechamento (texto + foto juntos, padrão WhatsApp). O diálogo com
            // botões só aparece como plano B se a cópia automática falhar
            // (ex.: Safari/iOS bloqueia cópia fora do gesto de clique).
            let finalizeAutoCopied = false;
            if (isNowCompleted) {
                let originArrivalAt = '', operationStartAt = '';
                try {
                    if (!cachedStatusHistory) {
                        const { data: marks } = await supabase
                            .from('mission_history')
                            .select('changed_at,new_value')
                            .eq('mission_id', mission.id)
                            .eq('field_name', 'status')
                            .order('changed_at', { ascending: false });
                        cachedStatusHistory = marks || null;
                    }
                    if (cachedStatusHistory) {
                        const lastOf = (val: string) => cachedStatusHistory!.find(h => h.new_value === val)?.changed_at;
                        originArrivalAt = fmtDateTime(lastOf('Origem'));
                        operationStartAt = fmtDateTime(lastOf('Em Viagem'));
                    }
                } catch {}
                const sKmN = parseNumber(editData.startKm);
                const eKmN = confirmedEndKmRef.current != null ? confirmedEndKmRef.current : parseNumber(editData.endKm);
                const totalKm = eKmN > sKmN ? eKmN - sKmN : 0;
                const finalizeReportText = `*DADOS DA MISSÃO*

*OS:* ${mission.id}
*DATA:* ${fmtDateTime(endIso || undefined) || fmtDateTime(new Date().toISOString())}

*DATA DO AGENDAMENTO:* ${fmtDateTime(mission.createdAt) || fmtDateTime(startIso)}
*DATA DA CHEGADA NA ORIGEM:* ${originArrivalAt || '—'}
*DATA DO INICIO:* ${operationStartAt || '—'}
*DATA DO FIM DE MISSÃO:* ${fmtDateTime(endIso || undefined) || '—'}

*KM INICIAL:* ${sKmN > 0 ? sKmN : '—'}
*KM FINAL:* ${eKmN > 0 ? eKmN : '—'}
*TOTAL RODADO:* ${totalKm} KM

*LINK DO FIM DE MISSÃO:* ${editData.mapLink || 'N/A'}`;

                // DHL: o fim de missão mantém o MESMO padrão "ESCOLTA ARMADA"
                // das demais atualizações (pedido do cliente), agora com o
                // campo FIM DE OPERAÇÃO preenchido. O texto interno "DADOS DA
                // MISSÃO" (com KM inicial/final) NÃO vai para o grupo da DHL
                // nem para a área de transferência — só o padrão oficial.
                const finalizeShareText = isDHL ? report : finalizeReportText;

                // Cópia automática (texto + foto juntos, padrão WhatsApp).
                // Foto: prioriza o print colado no COLAR PRINT (já com logo);
                // senão, usa o print do hodômetro confirmado no checklist.
                try {
                    const hadExplicitPrintBeforeFallback = hasExplicitUpdatePrint(updatePrintBlobRef.current, updatePrintPreview);
                    const hadOdometerEvidence = !!confirmedPrintUrlRef.current;
                    let photoBlob: Blob | null = updatePrintBlobRef.current || confirmedPrintBlobRef.current;

                    if (!photoBlob && confirmedPrintBlobPromiseRef.current) {
                        try {
                            photoBlob = await confirmedPrintBlobPromiseRef.current;
                        } catch (prefetchWaitErr) {
                            console.warn('[FimDeMissao] Espera do pré-carimbo falhou:', prefetchWaitErr);
                        }
                    }

                    if (!photoBlob && confirmedPrintUrlRef.current) {
                        try {
                            const resp = await fetch(confirmedPrintUrlRef.current);
                            if (resp.ok) {
                                photoBlob = await stampBrandOnImageBlob(await resp.blob());
                            }
                        } catch (photoErr) {
                            console.warn('[FimDeMissao] Falha ao preparar foto da evidência:', photoErr);
                        }
                    }

                    // Só gera foto de fallback (mapa TM SEG) quando há print/evidência —
                    // evita chamada lenta ao Google Static Maps em conclusões sem foto.
                    if (!photoBlob && (hadExplicitPrintBeforeFallback || hadOdometerEvidence)) {
                        photoBlob = await resolveGroupWhatsAppPhoto(`${finalStatus.toUpperCase()} — FIM DE MISSÃO`);
                    }
                    // Grupo: só envia com print colado ou evidência do hodômetro no
                    // checklist — nunca com foto automática de fallback.
                    const completionPhotoForGroup = hadExplicitPrintBeforeFallback || hadOdometerEvidence ? photoBlob : null;
                    if (shouldSendClientGroupWhatsApp({
                        finalStatus,
                        originalStatus,
                        hasExplicitPrint: !!(hadExplicitPrintBeforeFallback || hadOdometerEvidence),
                        isMissionCompletion: true,
                        isDhl: isDHL,
                        occurrence: finalDescription,
                        previousOccurrence: mission.currentLocation || '',
                    }) && completionPhotoForGroup) {
                        const r = await sendUpdateToClientGroup(mission.client || '', finalizeShareText, completionPhotoForGroup, mission.id, true);
                        if (r.sent) {
                            showNotification('WhatsApp', 'Fim de missão (formulário + foto) enviado ao grupo do cliente.', 'success');
                        } else if (r.skipped) {
                            showNotification('WhatsApp', `Grupo do cliente não configurado: ${r.error || 'cadastre o WhatsApp do cliente'}.`, 'warning');
                        } else if (r.error) {
                            showNotification('WhatsApp', `Envio automático ao grupo do cliente falhou: ${r.error}`, 'error');
                        }
                    }

                    if (photoBlob && showWhatsappCopyPopup(photoBlob, finalizeShareText)) {
                        // Popup guiado: COPIAR FOTO → COPIAR TEXTO → fecha sozinho.
                        finalizeAutoCopied = true;
                        // Print colado é de uso único
                        updatePrintBlobRef.current = null;
                        setUpdatePrintPreview('');
                    } else {
                        await navigator.clipboard.writeText(finalizeShareText);
                        finalizeAutoCopied = true;
                        showNotification('Fim de Missão copiado', 'Relatório de fim de missão copiado. É só colar no WhatsApp.', 'success');
                    }
                } catch (copyErr) {
                    console.warn('[FimDeMissao] Cópia automática falhou, abrindo diálogo:', copyErr);
                }

                if (!finalizeAutoCopied) {
                    // Plano B (ex.: iOS): diálogo com botões dentro do gesto de clique
                    setFinalizeReport({ text: finalizeShareText, photoUrl: confirmedPrintUrlRef.current });
                    setCopiedReportText(false);
                    setCopiedReportPhoto(false);
                }

                // E-mails de fim de missão em background — não bloqueia o fechamento do modal.
                const missionEndPayload = {
                    missionId: mission.id,
                    odometerPrintUrl: confirmedPrintUrlRef.current || undefined,
                    senderName: JSON.parse(localStorage.getItem('userData') || '{}').name || undefined,
                };
                void authFetch('/api/email/mission-end', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(missionEndPayload),
                }).then(() => {
                    showNotification('E-mails de Fim de Missão', 'Enviados para cliente e fornecedor.', 'success');
                }).catch((mailErr) => {
                    console.error('[Email] Erro fim de missão:', mailErr);
                });
            }

            const vehiclePlateForEmail = searchVehicle || editData.client_vehicle_plate || '—';

            const sendClientEmail = finalStatus === MissionStatus.SCHEDULED && originalStatus !== MissionStatus.SCHEDULED;
            const pendingClient = mission.email_pending_client === true;
            const hasRequiredDataForClientEmail = !!(editData.agent1 && editData.agent2 && editData.vehicleId && vehiclePlateForEmail && vehiclePlateForEmail !== '—');

            let pendingClientPayload: any = null;
            if ((sendClientEmail || pendingClient) && hasRequiredDataForClientEmail) {
                pendingClientPayload = {
                    missionId: mission.id,
                    client: mission.client,
                    origin: editData.origin,
                    destination: finalDestination,
                    start_time: startIso,
                    mission_type: editData.missionType,
                    vehiclePlate: vehiclePlateForEmail,
                    senderName: JSON.parse(localStorage.getItem('userData') || '{}').name || undefined
                };
            } else if ((sendClientEmail || pendingClient) && !hasRequiredDataForClientEmail) {
                await supabase.from('missions').update({ email_pending_client: true }).eq('id', mission.id);
                showNotification('E-mail Pendente', 'Confirmação ao cliente será enviada quando agente e veículo estiverem preenchidos.', 'warning');
            }

            const providerChanged = editData.provider && editData.provider.trim() !== '' &&
                (originalStatus === MissionStatus.SOLICITED || !mission.provider || mission.provider !== editData.provider);
            const pendingProvider = mission.email_pending_provider === true;
            let pendingProviderPayload: any = null;
            if ((providerChanged && (finalStatus === MissionStatus.DOCUMENTATION || finalStatus === MissionStatus.SOLICITED)) || pendingProvider) {
                pendingProviderPayload = {
                    missionId: mission.id,
                    provider: editData.provider,
                    vehiclePlate: vehiclePlateForEmail,
                    origin: editData.origin,
                    destination: finalDestination,
                    start_time: startIso,
                    mission_type: editData.missionType,
                    driver_name: editData.driver_name,
                    driver_phone: editData.driver_phone,
                    senderName: JSON.parse(localStorage.getItem('userData') || '{}').name || undefined
                };
            }

            if (pendingClientPayload || pendingProviderPayload) {
                const type = pendingClientPayload && pendingProviderPayload ? 'both' : pendingClientPayload ? 'client' : 'provider';
                setEmailConfirmDialog({ type, clientPayload: pendingClientPayload, providerPayload: pendingProviderPayload });
            }

            await supabase.channel(MISSION_UPDATES_BROADCAST_CHANNEL).send({
                type: 'broadcast',
                event: 'mission_updated',
                payload: {
                    missionId: mission.id,
                    status: finalStatus,
                    updatedBy: currentUser.name,
                    changeType: finalDescription || 'Atualização de Status'
                }
            });

            const senderNameForChange = JSON.parse(localStorage.getItem('userData') || '{}').name || undefined;
            const isFirstProviderAssignment = !mission.provider && editData.provider;
            const isFirstScheduling = finalStatus === MissionStatus.SCHEDULED && originalStatus !== MissionStatus.SCHEDULED;

            const providerChanges: { field: string; oldValue: string; newValue: string }[] = [];
            if (!isFirstProviderAssignment && !isFirstScheduling) {
                if (editData.provider && mission.provider && editData.provider !== mission.provider) {
                    providerChanges.push({ field: 'Fornecedor', oldValue: mission.provider, newValue: editData.provider });
                }
                if (editData.agent1 && editData.agent1 !== (mission.agent1 || '') && mission.agent1) {
                    providerChanges.push({ field: 'Agente 1 (Líder)', oldValue: mission.agent1 || '—', newValue: editData.agent1 });
                }
                if (editData.agent2 && editData.agent2 !== (mission.agent2 || '') && mission.agent2) {
                    providerChanges.push({ field: 'Agente 2 (Auxiliar)', oldValue: mission.agent2 || '—', newValue: editData.agent2 });
                }
                const vehicleChanged = editData.vehicleId && mission.vehicle_id && editData.vehicleId !== String(mission.vehicle_id || '');
                if (vehicleChanged) {
                    providerChanges.push({ field: 'Viatura', oldValue: String(mission.vehicle_id ? `ID ${mission.vehicle_id}` : '—'), newValue: searchVehicle || `ID ${editData.vehicleId}` });
                }
            }

            if (providerChanges.length > 0 && mission.client) {
                const clientSafeChanges = providerChanges.filter(c => c.field !== 'Fornecedor');
                if (clientSafeChanges.length > 0) {
                    try {
                        await authFetch('/api/email/mission-change-client', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                missionId: mission.id, client: mission.client,
                                origin: editData.origin, destination: finalDestination,
                                start_time: startIso, mission_type: editData.missionType,
                                vehiclePlate: vehiclePlateForEmail,
                                changes: clientSafeChanges, senderName: senderNameForChange
                            })
                        });
                        showNotification('E-mail de Alteração', 'Cliente notificado sobre alteração de agentes/viatura.', 'success');
                    } catch (chErr) { console.error('[Email] Erro ao enviar notificação de alteração ao cliente:', chErr); }
                }
            }

            const driverChanges: { field: string; oldValue: string; newValue: string }[] = [];
            if (editData.driver_name && mission.driver_name && editData.driver_name.toUpperCase() !== mission.driver_name.toUpperCase()) {
                driverChanges.push({ field: 'Motorista', oldValue: mission.driver_name, newValue: editData.driver_name.toUpperCase() });
            }
            if (editData.driver_phone && mission.driver_phone && editData.driver_phone !== mission.driver_phone) {
                driverChanges.push({ field: 'Tel. Motorista', oldValue: mission.driver_phone, newValue: editData.driver_phone });
            }
            if (editData.client_vehicle_id && mission.client_vehicle && editData.client_vehicle_id !== String(mission.client_vehicle)) {
                driverChanges.push({ field: 'Veículo Carga', oldValue: String(mission.client_vehicle), newValue: editData.client_vehicle_plate || editData.client_vehicle_id });
            }
            if (mission.origin && editData.origin.toUpperCase() !== mission.origin.toUpperCase()) {
                driverChanges.push({ field: 'Origem', oldValue: mission.origin, newValue: editData.origin.toUpperCase() });
            }
            if (mission.destination && finalDestination.toUpperCase() !== mission.destination.toUpperCase()) {
                driverChanges.push({ field: 'Destino', oldValue: mission.destination, newValue: finalDestination.toUpperCase() });
            }

            if (driverChanges.length > 0 && editData.provider) {
                try {
                    await authFetch('/api/email/mission-change-provider', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            missionId: mission.id, provider: editData.provider,
                            origin: editData.origin, destination: finalDestination,
                            start_time: startIso, mission_type: editData.missionType,
                            vehiclePlate: vehiclePlateForEmail,
                            changes: driverChanges, senderName: senderNameForChange
                        })
                    });
                    showNotification('E-mail de Alteração', 'Fornecedor notificado sobre alteração de motorista/dados.', 'success');
                } catch (chErr) { console.error('[Email] Erro ao enviar notificação de alteração ao fornecedor:', chErr); }
            }

            setEditData(prev => ({ ...prev, currentLocationName: '', mapLink: '' }));

            // OS recém-concluída: se a cópia automática (texto+foto) funcionou,
            // fecha o modal normalmente SEM diálogo — onSuccess(undefined) para o
            // pai não re-copiar só o texto (apagaria a foto do clipboard).
            // Se a cópia automática falhou (ex.: Safari/iOS bloqueia cópia fora do
            // gesto de clique), o diálogo "Fim de Missão concluído" foi aberto acima
            // (setFinalizeReport) como plano B: NÃO chamar onSuccess aqui, pois isso
            // fecharia o modal (desmontando o diálogo via `if (!isOpen) return null`).
            // Nesse caso o fechamento + refresh ocorrem ao clicar em "Fechar".
            // Demais atualizações seguem o fluxo normal (auto-cópia desktop).
            if (isNowCompleted) {
                if (finalizeAutoCopied) onSuccess(undefined);
            } else {
                // combinedCopied: texto+foto já estão no clipboard; passar o texto
                // faria o MissionTable re-copiar só o texto e APAGAR a foto.
                onSuccess(combinedCopied ? undefined : report);
            }
        } catch (error: any) { alert(error.message); } finally { setIsUpdating(false); }
    };

    const handleTollConfirmedAfterCompletion = async (result: { hasToll: boolean; value: number }) => {
        if (!mission) return;
        const v = result.hasToll ? result.value : 0;
        // Persistência é OBRIGATÓRIA: se falhar, propaga o erro para o
        // dialog (mantém aberto). Em sucesso, re-dispara o submit que
        // estava suspenso (toll_value já gravado, status agora pode ir
        // junto). Task #45.
        const { error } = await supabase.from('missions').update({ toll_value: v }).eq('id', mission.id);
        if (error) {
            console.error('[TollConfirm] persistência falhou', error);
            throw new Error('Não foi possível salvar o pedágio confirmado. Tente novamente.');
        }
        mission.toll_value = v;
        const resume = resumeSubmitRef.current;
        resumeSubmitRef.current = null;
        setPendingTollConfirm(null);
        if (resume) resume();
    };

    // Confirmação de KM final + hora EXATA antes de Concluir/Cancelar.
    // Grava os valores confirmados em refs (lidos pelo submit retomado) e
    // sincroniza o editData só para coerência visual. A SM segue para o
    // status final somente aqui, após a confirmação explícita do operador.
    const handleFinalizeConfirmed = async (payload: FinalizeConfirmPayload) => {
        const { endKm: km, iso, endTravelIso, odometerPrintUrl } = payload;
        const kind = pendingFinalizeConfirm?.kind;
        confirmedEndKmRef.current = km;
        confirmedRealTimeRef.current = iso;
        confirmedEndTravelRef.current = endTravelIso;
        confirmedPrintUrlRef.current = odometerPrintUrl || null;
        if (odometerPrintUrl) prefetchConfirmedPrintBlob(odometerPrintUrl);

        // Recálculo automático de pedágio (estimativa por IA / Gemini) ao
        // CONCLUIR. Não usamos a QualP aqui por custo; o endpoint
        // /api/toll/gemini-estimate usa a integração Gemini já existente.
        // Salva direto em toll_value (e toll_value_provider = 0 quando é a mesma
        // OS) sem pedir confirmação manual. OS aprovada NUNCA é tocada. Em
        // falha, mantém o gate manual de pedágio (tollConfirmedRef permanece false).
        if (mission && kind === 'completed' && !mission.billing_approved) {
            try {
                const r = await withTimeout(
                    authFetch('/api/toll/gemini-estimate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ origin: editData.origin, destination: editData.destination }),
                    }),
                    5000,
                    'Estimativa de pedágio excedeu 5s',
                );
                const j = await r.json().catch(() => ({} as any));
                if (j?.success && typeof j.tollValue === 'number') {
                    const v = Number(j.tollValue.toFixed(2));
                    const pair = tollPersistencePair(v, !!mission.is_same_os);
                    // Guarda no banco: nunca sobrescreve pedágio de OS aprovada
                    // (fecha a janela de aprovação concorrente — o snapshot
                    // financeiro congelado jamais é tocado).
                    const { error: tollErr } = await supabase.from('missions')
                        .update({ toll_value: pair.toll_value, toll_value_provider: pair.toll_value_provider })
                        .eq('id', mission.id)
                        .eq('billing_approved', false);
                    if (!tollErr) {
                        mission.toll_value = pair.toll_value;
                        (mission as any).toll_value_provider = pair.toll_value_provider;
                        tollConfirmedRef.current = true;
                        const confLabel = j.confianca === 'alta' ? 'alta' : j.confianca === 'media' ? 'média' : 'baixa';
                        showNotification(
                            'Pedágio (Estimativa IA)',
                            v === 0
                                ? 'IA não identificou pedágio nesta rota. Confirme manualmente se houver.'
                                : `Real R$ ${v.toFixed(2)} · Cliente R$ ${pair.toll_value.toFixed(2)} (${j.tollCount || 0} praça${(j.tollCount || 0) > 1 ? 's' : ''}) — estimativa IA ao concluir. Confirme manualmente. Confiança: ${confLabel}.`,
                            'info'
                        );
                        console.log(`[FIM MISSÃO] Pedágio (IA) recalculado e salvo: R$ ${v} (fornecedor R$ ${provToll})`);
                    }
                }
            } catch (e) {
                if (e instanceof TimeoutError) {
                    console.warn('[FIM MISSÃO] Estimativa de pedágio (IA) expirou — segue sem bloquear a conclusão.');
                } else {
                    console.warn('[FIM MISSÃO] Falha ao recalcular pedágio (IA):', e);
                }
            }
        }

        const d = new Date(iso);
        const endDate = formatIsoDateBR(d);
        const endTime = formatTimeAuditBR(d);
        // Cancelamento: a "Data de fim de viagem" (operacional) vira endDate/endTime.
        const et = endTravelIso ? new Date(endTravelIso) : null;
        const etDate = et ? formatIsoDateBR(et) : '';
        const etTime = et ? formatTimeAuditBR(et) : '';
        setEditData(prev => ({
            ...prev,
            ...(km != null ? { endKm: String(km) } : {}),
            ...(kind === 'completed' || kind === 'refused'
                ? { endDate, endTime }
                : (et ? { endDate: etDate, endTime: etTime } : {})),
        }));
        setPendingFinalizeConfirm(null);
        const resume = resumeSubmitRef.current;
        resumeSubmitRef.current = null;
        if (resume) resume();
    };

    const handleFinalizeCancelled = () => {
        setPendingFinalizeConfirm(null);
        resumeSubmitRef.current = null;
        finalizeConfirmedRef.current = false;
        pendingFinalizeStatusRef.current = null;
        // Destrava o relógio ao vivo que foi congelado ao abrir o gate.
        setIsEndTimeLocked(false);
        if (mission) {
            const restore = statusToRestoreOnFinalizeCancel({
                originalStatus,
                missionStatus: mission.status,
            });
            setEditData(prev => (prev.status === restore ? prev : { ...prev, status: restore }));
        }
    };

    // Atalho operacional: ao clicar em CONCLUÍDA / CANCELADA / RECUSADA numa OS ativa, abre
    // direto o checklist de finalização (mesma rota do gate em handleUpdateSubmit).
    const handleStatusButton = (s: MissionStatus) => {
        const isConclude = s === MissionStatus.COMPLETED;
        const isCancel = s === MissionStatus.CANCELLED;
        const isRefuse = s === MissionStatus.REFUSED;
        const directOK = mission && !mission.billing_approved
            && mission.status !== MissionStatus.COMPLETED
            && mission.status !== MissionStatus.CANCELLED
            && mission.status !== MissionStatus.REFUSED
            && mission.status !== s;
        if ((isConclude || isCancel || isRefuse) && directOK) {
            setEditData(prev => ({ ...prev, status: s }));
            pendingFinalizeStatusRef.current = s;
            resumeSubmitRef.current = () => {
                finalizeConfirmedRef.current = true;
                handleUpdateSubmit({ preventDefault: () => {} } as React.FormEvent);
            };
            setIsEndTimeLocked(true);
            setPendingFinalizeConfirm({
                kind: isConclude ? 'completed' : isCancel ? 'cancelled' : 'refused',
            });
            return;
        }
        setEditData({ ...editData, status: s });
    };

    const filteredProviders = providersList.filter(p => p.name.toLowerCase().includes(searchProvider.toLowerCase()));
    const filteredVehicles = vehiclesList.filter(v => v.provider === editData.provider && (v.plate.toLowerCase().includes(searchVehicle.toLowerCase()) || (v.model && v.model.toLowerCase().includes(searchVehicle.toLowerCase()))));
    const filteredAgents = allAgentsList.filter(a => a.provider === editData.provider && a.name.toLowerCase().includes((activeDropdown === 'agent1' ? searchAgent1 : searchAgent2).toLowerCase()));

    const getBlockedAgentWarning = (agentName: string) => {
        if (!agentName || agentName.trim() === '') return null;
        const nameUpper = agentName.trim().toUpperCase();
        const found = allAgentsList.find(a => a.name.toUpperCase() === nameUpper);
        if (found && found.status !== 'Ativo') return found;
        return null;
    };
    const blockedAgent1 = getBlockedAgentWarning(editData.agent1);
    const blockedAgent2 = getBlockedAgentWarning(editData.agent2);
    const filteredCargoVehicles = clientVehiclesList.filter(v => v.plate.toLowerCase().includes(searchCargoVehicle.toLowerCase()) || (v.model && v.model.toLowerCase().includes(searchCargoVehicle.toLowerCase())));
    const filteredDrivers = dbPastDrivers.filter(d => d.name.toLowerCase().includes(searchDriver.toLowerCase()));

    const handleDriverSelect = (d: {name: string, phone: string}) => {
        setEditData({ ...editData, driver_name: d.name, driver_phone: d.phone });
        setSearchDriver(d.name);
        setActiveDropdown(null);
    };

    if (!isOpen || !mission) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in">
          <div className="my-3 sm:my-0 bg-[#f8fafc] rounded-[24px] shadow-2xl w-full max-w-6xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[95vh] overflow-y-auto flex flex-col relative border border-gray-100 scrollbar-thin">
            
            {/* MODAIS DE CADASTRO RÁPIDO E BUSCA */}
            {quickModal === 'provider' && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-4xl p-6 relative">
                        <button onClick={() => setQuickModal(null)} className="absolute top-4 right-4 p-2 text-gray-400"><X size={20}/></button>
                        <ProviderForm onBack={() => setQuickModal(null)} onNavigateToVehicles={() => {}} />
                    </div>
                </div>
            )}
            {quickModal === 'vehicle' && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-4xl p-6 relative">
                        <button onClick={() => setQuickModal(null)} className="absolute top-4 right-4 p-2 text-gray-400"><X size={20}/></button>
                        <VehicleForm embedded onBack={() => setQuickModal(null)} initialProvider={editData.provider} onSuccess={() => { setQuickModal(null); refreshAuxData(mission.client, editData.provider, undefined, clientId || undefined); }} />
                    </div>
                </div>
            )}
            {quickModal === 'agent' && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-4xl p-6 relative">
                        <button onClick={() => setQuickModal(null)} className="absolute top-4 right-4 p-2 text-gray-400"><X size={20}/></button>
                        <ProviderAgentForm onBack={() => setQuickModal(null)} initialProvider={editData.provider} onSuccess={() => { setQuickModal(null); refreshAuxData(mission.client, editData.provider, undefined, clientId || undefined); }} />
                    </div>
                </div>
            )}
            {quickModal === 'cargo' && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-4xl p-6 relative shadow-2xl">
                        <button onClick={() => setQuickModal(null)} className="absolute top-4 right-4 p-2 text-gray-400 z-50 hover:bg-gray-100 rounded-full"><X size={20}/></button>
                        <ClientVehicleForm embedded onBack={() => setQuickModal(null)} initialClientId={clientId} onSuccess={(newId) => { setQuickModal(null); refreshAuxData(mission.client, editData.provider, undefined, clientId || undefined); if(newId) setEditData(prev => ({...prev, client_vehicle_id: newId})); }} />
                    </div>
                </div>
            )}
            {quickModal === 'browse_cargo' && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-5xl p-6 relative shadow-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-black uppercase flex items-center gap-2 text-red-600"><Truck size={20}/> Selecionar Veículo do Cliente</h3>
                            <button onClick={() => setQuickModal(null)} className="p-2 hover:bg-gray-100 rounded-full transition-all"><X size={20}/></button>
                        </div>
                        <ClientVehicleList 
                            embedded 
                            clientId={clientId || undefined} 
                            onAddVehicle={() => setQuickModal('cargo')}
                            onEdit={() => {}}
                            onSelect={(v) => {
                                setEditData({
                                    ...editData,
                                    client_vehicle_id: v.id.toString(),
                                    client_vehicle_plate: v.plate,
                                    client_vehicle_model: v.model
                                });
                                setSearchCargoVehicle(v.plate);
                                setQuickModal(null);
                                showNotification('Sucesso', `Veículo ${v.plate} selecionado.`, 'success');
                            }}
                        />
                    </div>
                </div>
            )}

            {emailMissingAlert && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
                        <div className="bg-red-600 p-4 flex items-center gap-3">
                            <AlertCircle size={24} className="text-white" />
                            <h3 className="text-white font-black text-sm uppercase tracking-wider">Atenção Operador</h3>
                        </div>
                        <div className="p-6">
                            <p className="text-sm text-gray-700 mb-4">
                                O <strong>{emailMissingAlert.type === 'client' ? 'Cliente' : 'Fornecedor'}</strong>{' '}
                                <span className="font-black text-red-700">{emailMissingAlert.name}</span>{' '}
                                não possui e-mail de notificação cadastrado.
                            </p>
                            <p className="text-xs text-gray-500 mb-4">Insira o(s) e-mail(s) agora para continuar (separe múltiplos com vírgula):</p>
                            <div className="relative mb-4">
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 bg-gray-50 border-2 border-red-200 rounded-xl outline-none focus:border-red-500 text-sm font-medium"
                                    placeholder={emailMissingAlert.type === 'client' ? 'op1@cliente.com.br, op2@cliente.com.br' : 'os1@fornecedor.com.br, os2@fornecedor.com.br'}
                                    value={quickEmailInput}
                                    onChange={e => setQuickEmailInput(e.target.value.toLowerCase())}
                                    data-testid="input-quick-email"
                                    autoFocus
                                />
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    disabled={isSavingQuickEmail || !quickEmailInput || !quickEmailInput.includes('@')}
                                    className="flex-1 bg-red-600 text-white py-3 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    data-testid="button-save-quick-email"
                                    onClick={async () => {
                                        setIsSavingQuickEmail(true);
                                        try {
                                            const table = emailMissingAlert.type === 'client' ? 'clients' : 'providers';
                                            const field = emailMissingAlert.type === 'client' ? 'operational_email' : 'os_email';
                                            await supabase.from(table).update({ [field]: quickEmailInput, email: quickEmailInput }).eq('id', emailMissingAlert.entityId);
                                            showNotification('Sucesso', `E-mail ${quickEmailInput} salvo com sucesso!`, 'success');
                                            setEmailMissingAlert(null);
                                            setQuickEmailInput('');
                                        } catch (err: any) {
                                            alert('Erro ao salvar e-mail: ' + err.message);
                                        } finally {
                                            setIsSavingQuickEmail(false);
                                        }
                                    }}
                                >
                                    {isSavingQuickEmail ? 'Salvando...' : 'Salvar E-mail e Continuar'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setEmailMissingAlert(null); setQuickEmailInput(''); }}
                                    className="px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-xs uppercase hover:bg-gray-200 transition-all"
                                    data-testid="button-cancel-quick-email"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {emailConfirmDialog && (
                <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
                        <div className="bg-blue-600 p-4 flex items-center gap-3">
                            <Mail size={24} className="text-white" />
                            <h3 className="text-white font-black text-sm uppercase tracking-wider">Confirmação de Envio</h3>
                        </div>
                        <div className="p-6">
                            <p className="text-sm text-gray-700 mb-2">
                                {emailConfirmDialog.type === 'both' 
                                    ? 'Deseja realmente enviar os e-mails ao cliente e ao fornecedor?' 
                                    : emailConfirmDialog.type === 'client' 
                                        ? 'Você deseja realmente enviar o e-mail ao cliente?' 
                                        : 'Você deseja realmente enviar o e-mail ao fornecedor?'}
                            </p>
                            <p className="text-xs text-gray-400 mb-5">
                                {emailConfirmDialog.clientPayload && <span className="block mb-1">📧 <strong>Cliente:</strong> {emailConfirmDialog.clientPayload.client}</span>}
                                {emailConfirmDialog.providerPayload && <span className="block">📧 <strong>Fornecedor:</strong> {emailConfirmDialog.providerPayload.provider}</span>}
                            </p>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    disabled={isSendingConfirmedEmail}
                                    className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                    data-testid="button-confirm-send-email"
                                    onClick={async () => {
                                        setIsSendingConfirmedEmail(true);
                                        try {
                                            if (emailConfirmDialog.clientPayload) {
                                                const emailRes = await authFetch('/api/email/mission-scheduled', {
                                                    method: 'POST',
                                                    body: JSON.stringify(emailConfirmDialog.clientPayload)
                                                });
                                                const emailData = await emailRes.json();
                                                if (emailData.queued) {
                                                    showNotification('E-mail na Fila', emailData.message, 'warning');
                                                } else if (emailData.success) {
                                                    showNotification('E-mail Enviado', 'Confirmação enviada ao cliente!', 'success');
                                                }
                                            }
                                            if (emailConfirmDialog.providerPayload) {
                                                const emailRes = await authFetch('/api/email/mission-solicited', {
                                                    method: 'POST',
                                                    body: JSON.stringify(emailConfirmDialog.providerPayload)
                                                });
                                                const emailData = await emailRes.json();
                                                if (emailData.queued) {
                                                    showNotification('E-mail na Fila', emailData.message, 'warning');
                                                } else if (emailData.success) {
                                                    showNotification('E-mail Enviado', 'Solicitação enviada ao fornecedor!', 'success');
                                                }
                                            }
                                        } catch (err) {
                                            console.error('[Email] Erro ao enviar e-mail confirmado:', err);
                                            showNotification('Erro', 'Falha ao enviar e-mail.', 'error');
                                        } finally {
                                            setIsSendingConfirmedEmail(false);
                                            setEmailConfirmDialog(null);
                                        }
                                    }}
                                >
                                    {isSendingConfirmedEmail ? <><Loader2 size={14} className="animate-spin" /> Enviando...</> : 'Sim, Enviar'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEmailConfirmDialog(null)}
                                    className="px-5 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-xs uppercase hover:bg-gray-200 transition-all"
                                    data-testid="button-cancel-send-email"
                                >
                                    Não Enviar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-50">
                <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-red-600 rounded-xl text-white shadow-lg"><Activity size={20}/></div>
                    <div>
                        <h3 className="text-lg font-black text-gray-900 uppercase tracking-tighter leading-none">Atualizar Missão</h3>
                        <div className="flex gap-2 mt-1.5 flex-wrap">
                            <span className="text-[10px] font-black text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 uppercase tracking-widest">{mission.id}</span>
                            <span className="text-[10px] font-black text-slate-800 bg-slate-50 px-2 py-1 rounded border border-slate-200 uppercase tracking-widest">{mission.client}</span>
                            {editData.provider && (
                                <span className="text-[10px] font-black text-slate-800 bg-white px-2 py-1 rounded border border-slate-200 uppercase tracking-widest flex items-center gap-1 shadow-sm">
                                    <Briefcase size={10} className="text-red-500" /> {editData.provider}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={20}/></button>
            </div>

            {isLoadingData ? (
                <div className="flex justify-center p-20 flex-1"><Loader2 className="animate-spin text-red-600" size={40} /></div>
            ) : (
                <form onSubmit={handleUpdateSubmit} className="p-6 space-y-6 flex-1 overflow-y-auto scrollbar-thin" ref={dropdownRef}>
                    
                    {/* STATUS E REGRAS ESPECIAIS */}
                    <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm">
                        <div className="flex justify-between items-center mb-4 px-1">
                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Fluxo Operacional</h4>
                            <div className="flex gap-3">
                                {(editData.origin.toUpperCase().includes('CEVA') || editData.origin.toUpperCase().includes('LUFT') || (mission.client && mission.client.toUpperCase().includes('CEVA')) || (mission.client && mission.client.toUpperCase().includes('LUFT'))) && (
                                    <label className={`flex items-center gap-2 px-4 py-1.5 rounded-xl border transition-all cursor-pointer ${editData.applyCeva200km ? 'bg-red-600 text-white border-red-600 shadow-lg' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                                        <input type="checkbox" className="hidden" checked={editData.applyCeva200km} onChange={e => setEditData({...editData, applyCeva200km: e.target.checked})} />
                                        <BadgeCheck size={12}/> <span className="text-[9px] font-black uppercase tracking-widest">Regra: 200KM</span>
                                    </label>
                                )}
                                {(editData.origin.toUpperCase().includes('VTC') || (mission.client && mission.client.toUpperCase().includes('VTC'))) && (
                                    <label className={`flex items-center gap-2 px-4 py-1.5 rounded-xl border transition-all cursor-pointer ${editData.applyVtc02h ? 'bg-red-600 text-white border-red-600 shadow-lg' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                                        <input type="checkbox" className="hidden" checked={editData.applyVtc02h} onChange={e => setEditData({...editData, applyVtc02h: e.target.checked})} />
                                        <Clock size={12}/> <span className="text-[9px] font-black uppercase tracking-widest">Regra: 02H</span>
                                    </label>
                                )}
                                <label className={`flex items-center gap-2 px-4 py-1.5 rounded-xl border transition-all cursor-pointer ${editData.isSameOs ? 'bg-slate-900 text-white border-black shadow-lg' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                                    <input type="checkbox" className="hidden" checked={editData.isSameOs} onChange={e => setEditData({...editData, isSameOs: e.target.checked, parentMissionId: e.target.checked ? editData.parentMissionId : ''})} />
                                    <Layers size={12}/> <span className="text-[9px] font-black uppercase tracking-widest">Mesma OS</span>
                                </label>
                            </div>
                        </div>
                        {editData.isSameOs && (
                            <div className="px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 mb-3">
                                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1.5 block">Vincular à OS Mãe (Principal)</label>
                                <div className="relative">
                                    <div className="flex items-center gap-2">
                                        <div className="relative flex-1">
                                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                            <input type="text" className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black"
                                                placeholder="Digite o nº da OS mãe (ex: GTM-1234)..."
                                                value={parentOsSearch || editData.parentMissionId}
                                                onChange={e => { setParentOsSearch(e.target.value); setShowParentOsDropdown(true); if (!e.target.value) setEditData(prev => ({...prev, parentMissionId: ''})); }}
                                                onFocus={() => setShowParentOsDropdown(true)}
                                                data-testid="input-parent-mission-update"
                                            />
                                        </div>
                                        {editData.parentMissionId && (
                                            <button type="button" onClick={() => { setEditData(prev => ({...prev, parentMissionId: ''})); setParentOsSearch(''); }} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><X size={16}/></button>
                                        )}
                                    </div>
                                    {editData.parentMissionId && (
                                        <div className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
                                            <Layers size={12} className="text-blue-600" />
                                            <span className="text-[10px] font-black text-blue-700 uppercase">OS Mãe: {editData.parentMissionId}</span>
                                        </div>
                                    )}
                                    {showParentOsDropdown && (
                                        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                            {parentOsSuggestions.filter(s => {
                                                if (!parentOsSearch) return true;
                                                const term = parentOsSearch.toLowerCase();
                                                return s.id.toLowerCase().includes(term) || s.client?.toLowerCase().includes(term) || s.provider?.toLowerCase().includes(term);
                                            }).map(s => (
                                                <button key={s.id} type="button" className={`w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 ${editData.parentMissionId === s.id ? 'bg-blue-50' : ''}`}
                                                    onClick={() => { setEditData(prev => ({...prev, parentMissionId: s.id})); setParentOsSearch(''); setShowParentOsDropdown(false); }}
                                                    data-testid={`option-parent-update-${s.id}`}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-black text-gray-900">{s.id}</span>
                                                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${s.status === 'Concluída' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{s.status}</span>
                                                    </div>
                                                    <div className="text-[9px] text-gray-500 mt-0.5">{!hideProviderInfo ? `${s.provider || 'Sem fornecedor'} • ` : ''}{s.origin?.split(',')[0]} → {s.destination?.split(',')[0]}</div>
                                                </button>
                                            ))}
                                            {parentOsSearch && !parentOsSuggestions.find(s => s.id === parentOsSearch.toUpperCase()) && (
                                                <button type="button" className="w-full text-left px-3 py-2 hover:bg-blue-50 border-t border-gray-100 text-blue-700"
                                                    onClick={() => { setEditData(prev => ({...prev, parentMissionId: parentOsSearch.toUpperCase()})); setParentOsSearch(''); setShowParentOsDropdown(false); }}
                                                >
                                                    <div className="flex items-center gap-2"><Plus size={12}/><span className="text-xs font-bold">Usar "{parentOsSearch.toUpperCase()}" como OS Mãe</span></div>
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        {isCompletedMission && isBillingApproved && !canEditApproved && (
                            <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl mb-3" data-testid="billing-approved-lock">
                                <ShieldCheck size={16} className="text-blue-600" />
                                <span className="text-[10px] font-black text-blue-700 uppercase">OS aprovada — status bloqueado</span>
                            </div>
                        )}
                        {isCompletedMission && isBillingApproved && canEditApproved && (
                            <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl mb-3" data-testid="billing-approved-diretoria">
                                <ShieldCheck size={16} className="text-green-600" />
                                <span className="text-[10px] font-black text-green-700 uppercase">{isBarbaraFinance ? 'OS aprovada — Financeiro (Bárbara) pode alterar KM e dados operacionais' : 'OS aprovada — seu perfil pode alterar'}</span>
                            </div>
                        )}
                        {isCompletedMission && !isBillingApproved && canRevertStatus && (
                            <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl mb-3" data-testid="revert-status-info">
                                <AlertTriangle size={16} className="text-amber-600" />
                                <span className="text-[10px] font-black text-amber-700 uppercase">OS Concluída — você pode reverter para Em Viagem</span>
                            </div>
                        )}
                        {isCompletedMission && !isBillingApproved && !canRevertStatus && (
                            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl mb-3" data-testid="no-revert-permission">
                                <ShieldAlert size={16} className="text-gray-500" />
                                <span className="text-[10px] font-black text-gray-500 uppercase">OS Concluída — seu perfil não permite alterar o status</span>
                            </div>
                        )}
                        <div className="flex flex-wrap gap-2 pb-4 border-b border-gray-100">
                            {operationalStatuses.map(s => {
                                const isDisabled = canEditApproved ? false
                                    : isCompletedMission && isBillingApproved ? true
                                    : isCompletedMission && !canRevertStatus ? true
                                    : isCompletedMission && canRevertStatus && s !== MissionStatus.IN_TRANSIT && s !== MissionStatus.COMPLETED ? true
                                    : false;
                                return (
                                    <button key={s} type="button" onClick={() => !isDisabled && handleStatusButton(s)} disabled={isDisabled} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all border ${editData.status === s ? 'bg-red-600 text-white border-red-600 shadow-md scale-105' : isDisabled ? 'bg-gray-100 text-gray-300 border-gray-100 cursor-not-allowed opacity-50' : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-300'}`}>{s}</button>
                                );
                            })}
                        </div>
                        <div className="mt-4 flex flex-wrap items-end gap-6">
                            <div className="flex gap-2">
                                {restrictedStatuses.map(s => {
                                    const isDisabled = canEditApproved ? false : isCompletedMission && (isBillingApproved || !canRevertStatus);
                                    return (
                                        <button key={s} type="button" onClick={() => !isDisabled && handleStatusButton(s)} disabled={isDisabled} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase transition-all border ${editData.status === s ? 'bg-gray-900 text-white border-black shadow-md' : isDisabled ? 'bg-gray-100 text-gray-300 border-gray-100 cursor-not-allowed opacity-50' : 'bg-red-50 text-red-400 border-red-100 hover:bg-red-100'}`}>{s}</button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* DADOS DA EQUIPE */}
                    <div className={`grid grid-cols-1 md:grid-cols-2 ${hideProviderInfo ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-4 p-6 bg-white border border-gray-200 rounded-[2.5rem] shadow-sm relative`}>
                        
                        {/* ALERTA INTELIGENTE IBL */}
                        {!hideProviderInfo && iblWarning && (
                            <div className="col-span-full bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase flex items-center justify-center gap-2 shadow-lg animate-pulse mb-2">
                                <ShieldAlert size={16} /> {iblWarning}
                            </div>
                        )}

                        {!hideProviderInfo && (
                        <div className="relative">
                            <label className={LABEL_CLASS}>Fornecedor Parceiro</label>
                            {isCommercial ? (
                                <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-700">
                                    <Briefcase size={14} className="text-gray-400" />
                                    {editData.provider || 'Não definido'}
                                </div>
                            ) : (
                            <div className="flex gap-1.5">
                                <div className="relative flex-1">
                                    <input type="text" className={INPUT_CLASS} placeholder="Filtrar..." value={searchProvider} onChange={e => setSearchTerm(e.target.value)} onFocus={() => setActiveDropdown('provider')} />
                                    <Search size={14} className="absolute right-3 top-3 text-gray-300" />
                                    {activeDropdown === 'provider' && (
                                        <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                                            {filteredProviders.map(p => (
                                                <button key={p.id} type="button" onClick={() => { 
                                                    const newStatus = (editData.status === MissionStatus.SOLICITED) ? MissionStatus.DOCUMENTATION : editData.status;
                                                    setEditData({...editData, provider: p.name, vehicleId: '', agent1: '', agent2: '', status: newStatus}); 
                                                    setSearchTerm(p.name); setSearchVehicle(''); setActiveDropdown(null); 
                                                }} className={DROPDOWN_ITEM_CLASS}>
                                                    <span>{p.name}</span>
                                                    <span className="bg-green-600 text-white px-2 py-1 rounded-[6px] text-[8px] font-black flex items-center gap-1 shadow-sm"><Check size={10} /> SELECIONAR</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button type="button" onClick={() => setQuickModal('provider')} className="p-2.5 bg-gray-900 text-white rounded-xl hover:bg-black transition-all shadow-md"><Plus size={18}/></button>
                            </div>
                            )}
                        </div>
                        )}

                        <div className="relative">
                            <label className={LABEL_CLASS}>Viatura (Placa)</label>
                            <div className="flex gap-1.5">
                                <div className="relative flex-1">
                                    <input type="text" className={INPUT_CLASS} placeholder={editData.provider ? "Placa..." : "Aguardando Fornecedor..."} value={searchVehicle} onChange={e => {
                                        const v = e.target.value;
                                        setSearchVehicle(v);
                                        // Ao editar manualmente, desfaz a seleção anterior se o texto
                                        // não corresponde mais à placa selecionada — assim o botão
                                        // "+ Cadastrar" reflete corretamente o estado de "sem cadastro".
                                        if (editData.vehicleId) {
                                            const sel = vehiclesList.find(vv => vv.id.toString() === editData.vehicleId);
                                            if (!sel || (sel.plate || '').toUpperCase() !== v.toUpperCase()) {
                                                setEditData(prev => ({ ...prev, vehicleId: '' }));
                                            }
                                        }
                                    }} onFocus={() => editData.provider && setActiveDropdown('vehicle')} disabled={!editData.provider} />
                                    <CarFront size={14} className="absolute right-3 top-3 text-gray-300" />
                                    {activeDropdown === 'vehicle' && editData.provider && (
                                        <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                                            {filteredVehicles.map(v => (
                                                <button key={v.id} type="button" onClick={() => { setEditData({...editData, vehicleId: v.id.toString()}); setSearchVehicle(v.plate); setActiveDropdown(null); }} className={DROPDOWN_ITEM_CLASS}>
                                                    <span>{v.plate} ({v.model})</span>
                                                    <span className="bg-green-600 text-white px-2 py-1 rounded-[6px] text-[8px] font-black flex items-center gap-1 shadow-sm"><Check size={10} /> SELECIONAR</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {(() => {
                                    const typed = (searchVehicle || '').trim();
                                    const hasMatch = typed.length > 0 && filteredVehicles.some(v => (v.plate || '').toUpperCase() === typed.toUpperCase());
                                    const noMatchTyped = typed.length > 0 && !hasMatch;
                                    return (
                                        <button
                                            type="button"
                                            disabled={!editData.provider}
                                            onClick={() => setQuickModal('vehicle')}
                                            className={`p-2.5 rounded-xl transition-all border shadow-sm disabled:opacity-50 flex items-center gap-1 ${noMatchTyped ? 'bg-yellow-400 hover:bg-yellow-500 text-gray-900 border-yellow-500 animate-pulse font-black' : 'bg-gray-100 hover:bg-gray-200 text-gray-600 border-gray-200'}`}
                                            title={noMatchTyped ? `Cadastrar nova viatura "${typed.toUpperCase()}"` : 'Cadastrar nova viatura'}
                                            data-testid="btn-add-vehicle"
                                        >
                                            <Plus size={18}/>{noMatchTyped && <span className="text-[10px] uppercase tracking-wider">Cadastrar</span>}
                                        </button>
                                    );
                                })()}
                            </div>
                        </div>

                        <div className="relative">
                            <label className={LABEL_CLASS}>Agente 1 (Líder)</label>
                            <div className="flex gap-1.5">
                                <div className="relative flex-1">
                                    <input type="text" className={`${INPUT_CLASS} ${blockedAgent1 ? '!border-red-500 !bg-red-50 !text-red-700' : ''}`} placeholder={editData.provider ? "Nome..." : "Aguardando Fornecedor..."} value={searchAgent1} onChange={e => setSearchAgent1(e.target.value)} onFocus={() => editData.provider && setActiveDropdown('agent1')} disabled={!editData.provider} />
                                    {blockedAgent1 ? <ShieldAlert size={14} className="absolute right-3 top-3 text-red-500" /> : <UserCheck size={14} className="absolute right-3 top-3 text-gray-300" />}
                                    {activeDropdown === 'agent1' && editData.provider && (
                                        <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                                            {filteredAgents.map(a => {
                                                const isBlocked = a.status !== 'Ativo';
                                                const isAcaoTrab = a.status === 'Bloqueado / Ação Trabalhista';
                                                return (
                                                    <button key={a.id} type="button" disabled={isBlocked} onClick={() => { if (!isBlocked) { setEditData({...editData, agent1: a.name}); setSearchAgent1(a.name); setActiveDropdown(null); }}} className={`${DROPDOWN_ITEM_CLASS} ${isBlocked ? '!opacity-100 !cursor-not-allowed !bg-red-50' : ''}`}>
                                                        <div className="flex flex-col items-start">
                                                            <span className={isBlocked ? 'text-red-400 line-through' : ''}>{a.name}</span>
                                                            {isAcaoTrab && <span className="text-[8px] font-black text-red-600 uppercase animate-pulse">⛔ AÇÃO TRABALHISTA — BLOQUEADO</span>}
                                                            {isBlocked && !isAcaoTrab && <span className="text-[8px] font-bold text-red-400 uppercase">BLOQUEADO</span>}
                                                        </div>
                                                        {isBlocked ? <span className="bg-red-600 text-white px-2 py-1 rounded-[6px] text-[8px] font-black flex items-center gap-1 shadow-sm"><ShieldAlert size={10} /> BLOQUEADO</span> : <span className="bg-green-600 text-white px-2 py-1 rounded-[6px] text-[8px] font-black flex items-center gap-1 shadow-sm"><Check size={10} /> SELECIONAR</span>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                                {(() => {
                                    const typed = (searchAgent1 || '').trim();
                                    const hasMatch = typed && filteredAgents.some(a => (a.name || '').toUpperCase() === typed.toUpperCase());
                                    const noMatchTyped = typed.length > 0 && !hasMatch && editData.agent1 !== typed;
                                    return (
                                        <button
                                            type="button"
                                            disabled={!editData.provider}
                                            onClick={() => setQuickModal('agent')}
                                            className={`p-2.5 rounded-xl transition-all border shadow-sm disabled:opacity-50 flex items-center gap-1 ${noMatchTyped ? 'bg-yellow-400 hover:bg-yellow-500 text-gray-900 border-yellow-500 animate-pulse font-black' : 'bg-gray-100 hover:bg-gray-200 text-gray-600 border-gray-200'}`}
                                            title={noMatchTyped ? `Cadastrar novo escoltista "${typed}"` : 'Cadastrar novo escoltista'}
                                            data-testid="btn-add-agent1"
                                        >
                                            <Plus size={18}/>{noMatchTyped && <span className="text-[10px] uppercase tracking-wider">Cadastrar</span>}
                                        </button>
                                    );
                                })()}
                            </div>
                            {blockedAgent1 && (
                                <div className={`mt-1.5 flex items-center gap-1.5 px-3 py-2 rounded-lg ${blockedAgent1.status === 'Bloqueado / Ação Trabalhista' ? 'animate-blocked-flash-3d text-white' : 'bg-red-100 border border-red-300'}`}>
                                    <ShieldAlert size={12} className={`flex-shrink-0 ${blockedAgent1.status === 'Bloqueado / Ação Trabalhista' ? 'text-white' : 'text-red-600'}`} />
                                    <span className={`text-[10px] font-black uppercase ${blockedAgent1.status === 'Bloqueado / Ação Trabalhista' ? 'text-white drop-shadow-lg' : 'text-red-700'}`}>⛔ AGENTE BLOQUEADO — Status: {blockedAgent1.status}. Não é permitido escalar este agente.</span>
                                </div>
                            )}
                        </div>

                        <div className="relative">
                            <label className={LABEL_CLASS}>Agente 2 (Auxiliar)</label>
                            <div className="flex gap-1.5">
                                <div className="relative flex-1">
                                    <input type="text" className={`${INPUT_CLASS} ${blockedAgent2 ? '!border-red-500 !bg-red-50 !text-red-700' : ''}`} placeholder={editData.provider ? "Nome..." : "Aguardando Fornecedor..."} value={searchAgent2} onChange={e => setSearchAgent2(e.target.value)} onFocus={() => editData.provider && setActiveDropdown('agent2')} disabled={!editData.provider} />
                                    {blockedAgent2 ? <ShieldAlert size={14} className="absolute right-3 top-3 text-red-500" /> : <UserCheck size={14} className="absolute right-3 top-3 text-gray-300" />}
                                    {activeDropdown === 'agent2' && editData.provider && (
                                        <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                                            {filteredAgents.map(a => {
                                                const isBlocked = a.status !== 'Ativo';
                                                const isAcaoTrab = a.status === 'Bloqueado / Ação Trabalhista';
                                                return (
                                                    <button key={a.id} type="button" disabled={isBlocked} onClick={() => { if (!isBlocked) { setEditData({...editData, agent2: a.name}); setSearchAgent2(a.name); setActiveDropdown(null); }}} className={`${DROPDOWN_ITEM_CLASS} ${isBlocked ? '!opacity-100 !cursor-not-allowed !bg-red-50' : ''}`}>
                                                        <div className="flex flex-col items-start">
                                                            <span className={isBlocked ? 'text-red-400 line-through' : ''}>{a.name}</span>
                                                            {isAcaoTrab && <span className="text-[8px] font-black text-red-600 uppercase animate-pulse">⛔ AÇÃO TRABALHISTA — BLOQUEADO</span>}
                                                            {isBlocked && !isAcaoTrab && <span className="text-[8px] font-bold text-red-400 uppercase">BLOQUEADO</span>}
                                                        </div>
                                                        {isBlocked ? <span className="bg-red-600 text-white px-2 py-1 rounded-[6px] text-[8px] font-black flex items-center gap-1 shadow-sm"><ShieldAlert size={10} /> BLOQUEADO</span> : <span className="bg-green-600 text-white px-2 py-1 rounded-[6px] text-[8px] font-black flex items-center gap-1 shadow-sm"><Check size={10} /> SELECIONAR</span>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                                {(() => {
                                    const typed = (searchAgent2 || '').trim();
                                    const hasMatch = typed && filteredAgents.some(a => (a.name || '').toUpperCase() === typed.toUpperCase());
                                    const noMatchTyped = typed.length > 0 && !hasMatch && editData.agent2 !== typed;
                                    return (
                                        <button
                                            type="button"
                                            disabled={!editData.provider}
                                            onClick={() => setQuickModal('agent')}
                                            className={`p-2.5 rounded-xl transition-all border shadow-sm disabled:opacity-50 flex items-center gap-1 ${noMatchTyped ? 'bg-yellow-400 hover:bg-yellow-500 text-gray-900 border-yellow-500 animate-pulse font-black' : 'bg-gray-100 hover:bg-gray-200 text-gray-600 border-gray-200'}`}
                                            title={noMatchTyped ? `Cadastrar novo escoltista "${typed}"` : 'Cadastrar novo escoltista'}
                                            data-testid="btn-add-agent2"
                                        >
                                            <Plus size={18}/>{noMatchTyped && <span className="text-[10px] uppercase tracking-wider">Cadastrar</span>}
                                        </button>
                                    );
                                })()}
                            </div>
                            {blockedAgent2 && (
                                <div className={`mt-1.5 flex items-center gap-1.5 px-3 py-2 rounded-lg ${blockedAgent2.status === 'Bloqueado / Ação Trabalhista' ? 'animate-blocked-flash-3d text-white' : 'bg-red-100 border border-red-300'}`}>
                                    <ShieldAlert size={12} className={`flex-shrink-0 ${blockedAgent2.status === 'Bloqueado / Ação Trabalhista' ? 'text-white' : 'text-red-600'}`} />
                                    <span className={`text-[10px] font-black uppercase ${blockedAgent2.status === 'Bloqueado / Ação Trabalhista' ? 'text-white drop-shadow-lg' : 'text-red-700'}`}>⛔ AGENTE BLOQUEADO — Status: {blockedAgent2.status}. Não é permitido escalar este agente.</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Cadastro operacional — link externo do fornecedor (todos os clientes) */}
                    {!hideProviderInfo && mission?.id && (
                        <div className="p-6 bg-white border border-gray-200 rounded-[2.5rem] shadow-sm">
                            <DhlIntakeTimeline
                                missionId={mission.id}
                                canViewSnapshots={true}
                                isDhlClient={(mission?.client || '').toUpperCase().includes('DHL')}
                                currentProvider={editData.provider}
                                savedProvider={mission.provider || ''}
                            />
                        </div>
                    )}

                    {/* DADOS DA CARGA E MOTORISTA */}
                    <div className="bg-white p-6 rounded-[2.5rem] border border-gray-200 shadow-sm space-y-5">
                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2 border-b border-gray-50 pb-3"><Package size={14} className="text-red-600"/> Dados da Carga e Condutor</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                            <div className="relative">
                                <label className={LABEL_CLASS}>Motorista</label>
                                <div className="relative">
                                    <input type="text" className={INPUT_CLASS} placeholder="Nome do condutor..." value={searchDriver} onChange={e => { setSearchDriver(e.target.value); setEditData({...editData, driver_name: e.target.value}); setActiveDropdown('driver'); }} onFocus={() => setActiveDropdown('driver')} />
                                    <User size={14} className="absolute right-3 top-3 text-gray-300" />
                                    {activeDropdown === 'driver' && filteredDrivers.length > 0 && (
                                        <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto ring-1 ring-black/5">
                                            {filteredDrivers.map((d, i) => (
                                                <button key={i} type="button" onClick={() => handleDriverSelect(d)} className={DROPDOWN_ITEM_CLASS}>
                                                    <span>{d.name}</span>
                                                    <span className="bg-green-600 text-white px-2 py-1 rounded-[6px] text-[8px] font-black flex items-center gap-1 shadow-sm"><Check size={10} /> SELECIONAR</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div><label className={LABEL_CLASS}>Contato Celular</label><input type="text" className={INPUT_CLASS} value={editData.driver_phone} onChange={e => setEditData({...editData, driver_phone: e.target.value})} /></div>
                            
                            <div className="relative">
                                <label className={LABEL_CLASS}>Placa Carga</label>
                                <div className="flex gap-1.5">
                                    <div className="relative flex-1">
                                        <input type="text" className={INPUT_CLASS} placeholder="Placa..." value={searchCargoVehicle} onChange={e => { setSearchCargoVehicle(e.target.value.toUpperCase()); setActiveDropdown('cargo_vehicle'); }} onFocus={() => setActiveDropdown('cargo_vehicle')} />
                                        <button 
                                            type="button" 
                                            onClick={() => setQuickModal('browse_cargo')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-red-600 transition-all"
                                        >
                                            <Search size={14} />
                                        </button>
                                        {activeDropdown === 'cargo_vehicle' && filteredCargoVehicles.length > 0 && (
                                            <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                                                {filteredCargoVehicles.map(v => (
                                                    <button key={v.id} type="button" onClick={() => { 
                                                        setEditData({
                                                            ...editData, 
                                                            client_vehicle_id: v.id.toString(), 
                                                            client_vehicle_plate: v.plate, 
                                                            client_vehicle_model: v.model
                                                        }); 
                                                        setSearchCargoVehicle(v.plate); 
                                                        setActiveDropdown(null); 
                                                    }} className={DROPDOWN_ITEM_CLASS}>
                                                        <span>{v.plate} ({v.model})</span>
                                                        <span className="bg-green-600 text-white px-2 py-1 rounded-[6px] text-[8px] font-black flex items-center gap-1 shadow-sm"><Check size={10} /> SELECIONAR</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <button type="button" onClick={() => setQuickModal('cargo')} className="p-2.5 bg-gray-900 text-white rounded-xl hover:bg-black transition-all shadow-md"><Plus size={18}/></button>
                                </div>
                            </div>

                            <div><label className={LABEL_CLASS}>Modelo Carga</label><input type="text" className={INPUT_CLASS} value={editData.client_vehicle_model} onChange={e => setEditData({...editData, client_vehicle_model: e.target.value.toUpperCase()})} /></div>
                            <div><label className={LABEL_CLASS}>GR / Espelhamento</label><input type="text" className={`${INPUT_CLASS} border-indigo-200 bg-indigo-50/20`} value={editData.gr_espelhamento} onChange={e => setEditData({...editData, gr_espelhamento: e.target.value.toUpperCase()})} /></div>
                            {((mission?.client || '').toUpperCase().includes('CESLOG') || (mission?.client || '').toUpperCase().includes('CESARI')) && (
                                <div><label className={LABEL_CLASS}><span className="text-purple-600 font-black">Nº Referência</span></label><input type="text" className={`${INPUT_CLASS} border-purple-300 bg-purple-50/30`} placeholder="Nº Referência CESLOG/CESARI" value={editData.reference_number} onChange={e => setEditData({...editData, reference_number: e.target.value})} data-testid="input-edit-reference-number" /></div>
                            )}
                            {((mission?.client || '').toUpperCase().includes('DHL')) && (
                                <div><label className={LABEL_CLASS}><span className="text-red-600 font-black">Nº S.E. (DHL)</span></label><input type="text" className={`${INPUT_CLASS} border-red-300 bg-yellow-50/40`} placeholder="Ex: SE-123456 / 4912345" value={editData.dhl_se_number} onChange={e => setEditData({...editData, dhl_se_number: e.target.value.toUpperCase()})} data-testid="input-edit-dhl-se-number" /></div>
                            )}
                            {isDiretoria && String(editData.dhl_se_number || mission?.dhl_se_number || '').trim() && (
                                <div className="md:col-span-2">
                                    <button
                                        type="button"
                                        onClick={() => setDhlOccurrenceReportOpen(true)}
                                        className="inline-flex items-center gap-2 rounded-xl border-2 border-[#0d3b66] bg-[#e8eef4] px-4 py-2.5 text-[11px] font-black uppercase tracking-wide text-[#0d3b66] hover:bg-[#dce6f0] transition-colors"
                                        data-testid="button-open-dhl-occurrence-report"
                                    >
                                        <FileText size={16} />
                                        Gerar Plano de Ação DHL (PDF)
                                    </button>
                                    <p className="text-[9px] text-slate-500 mt-1">Somente diretoria — inclui horários, fotos por etapa e assinatura.</p>
                                </div>
                            )}
                            {((mission?.client || '').toUpperCase().includes('DHL')) && (
                                <div><label className={LABEL_CLASS}><span className="text-amber-700 font-black">Nº SM (DHL)</span></label><input type="text" className={`${INPUT_CLASS} border-amber-300 bg-amber-50/40`} placeholder="Ex: SM-789012 (opcional)" value={editData.dhl_sm_number} onChange={e => setEditData({...editData, dhl_sm_number: e.target.value.toUpperCase()})} data-testid="input-edit-dhl-sm-number" /></div>
                            )}
                            {((mission?.client || '').toUpperCase().includes('DHL')) && (
                                <div className="md:col-span-2 p-3 rounded-xl border border-red-200 bg-red-50/30">
                                    <label className={LABEL_CLASS}><span className="text-red-600 font-black">KM Deslocamento cobrado pra DHL</span></label>
                                    <input type="number" min="0" step="1" className={`${INPUT_CLASS} border-red-300 bg-white`} placeholder="Ex: 170 (deixe vazio se não houver)" value={editData.dhl_deslocamento_km} onChange={e => setEditData({...editData, dhl_deslocamento_km: e.target.value})} data-testid="input-edit-dhl-deslocamento-km" />
                                    <p className="text-[9px] text-red-700/70 mt-1">Esse KM alimenta a coluna KM DESLOCAMENTO (T) da planilha SE.</p>
                                    <div className="mt-2">
                                        <label className="text-[9px] font-black text-red-700 uppercase tracking-widest mb-1 block">Print da aprovação DHL</label>
                                        {deslocExistingUrl && !deslocFile && (
                                            <div className="mb-2 relative inline-block">
                                                <a href={deslocExistingUrl} target="_blank" rel="noopener noreferrer">
                                                    <img src={deslocExistingUrl} alt="Aprovação deslocamento" className="h-24 rounded-lg border border-red-200 object-cover" />
                                                </a>
                                                <span className="absolute top-1 right-1 bg-red-600 text-white text-[8px] px-2 py-0.5 rounded font-black">ENVIADO</span>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) setDeslocFile(f); }} className="text-[10px]" data-testid="input-edit-dhl-deslocamento-print" />
                                            {deslocFile && (
                                                <button type="button" onClick={handleDeslocamentoUpload} disabled={deslocSending} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-[10px] font-black uppercase tracking-wider hover:bg-red-700 disabled:opacity-50" data-testid="button-save-dhl-deslocamento-print">{deslocSending ? 'Enviando...' : 'Anexar print'}</button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {((mission?.client || '').toUpperCase().includes('CEVA')) && (
                                <div><label className={LABEL_CLASS}><span className="text-teal-600 font-black">Liberação de Faturamento</span></label><input type="text" className={`${INPUT_CLASS} border-teal-300 bg-teal-50/30`} placeholder="Ex: A001, B002..." value={editData.billing_release} onChange={e => setEditData({...editData, billing_release: e.target.value.toUpperCase()})} data-testid="input-edit-billing-release" /></div>
                            )}
                        </div>

                        <div className="mt-4 pt-4 border-t border-indigo-100">
                            <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-2 block flex items-center gap-1.5">
                                <ShieldCheck size={12}/> Evidência do Espelhamento
                            </label>
                            {mirroringExistingUrl && !mirroringPreview && (
                                <div className="mb-2 relative">
                                    <a href={mirroringExistingUrl} target="_blank" rel="noopener noreferrer">
                                        <img src={mirroringExistingUrl} alt="Espelhamento" className="w-full h-32 object-cover rounded-lg border border-green-200" />
                                    </a>
                                    <span className="absolute top-1 right-1 bg-green-600 text-white text-[8px] px-2 py-0.5 rounded font-black">ENVIADO</span>
                                </div>
                            )}
                            <div className="flex gap-2 items-center">
                                <div
                                    className="flex-1 relative"
                                    tabIndex={0}
                                    onPaste={(e) => {
                                        const items = e.clipboardData?.items;
                                        if (!items) return;
                                        for (let i = 0; i < items.length; i++) {
                                            if (items[i].type.startsWith('image/')) {
                                                const file = items[i].getAsFile();
                                                if (file) {
                                                    setMirroringFile(file);
                                                    setMirroringPreview(URL.createObjectURL(file));
                                                }
                                                e.preventDefault();
                                                break;
                                            }
                                        }
                                    }}
                                >
                                    <input
                                        type="file"
                                        accept="image/*"
                                        data-testid="input-mirroring-evidence"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            setMirroringFile(file);
                                            setMirroringPreview(URL.createObjectURL(file));
                                        }}
                                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                    />
                                    {mirroringPreview ? (
                                        <div className="relative">
                                            <img src={mirroringPreview} alt="Preview" className="w-full h-24 object-cover rounded-lg border-2 border-indigo-300" />
                                            <span className="absolute top-1 left-1 bg-indigo-600 text-white text-[8px] px-2 py-0.5 rounded font-black">NOVO</span>
                                            <p className="text-[9px] text-indigo-600 font-bold mt-1 truncate">{mirroringFile?.name || 'Imagem colada'}</p>
                                        </div>
                                    ) : (
                                        <div className="border-2 border-dashed border-indigo-200 rounded-lg p-3 text-center hover:border-indigo-400 transition-colors bg-indigo-50/30 focus-within:border-indigo-400 focus-within:bg-indigo-50/50">
                                            <Package size={20} className="mx-auto text-indigo-300 mb-1"/>
                                            <p className="text-[9px] font-black text-indigo-400 uppercase">Foto do Espelhamento</p>
                                            <p className="text-[8px] text-indigo-300">Clique para selecionar ou cole (Ctrl+V)</p>
                                        </div>
                                    )}
                                </div>
                                {mirroringPreview && (
                                    <button
                                        type="button"
                                        onClick={handleMirroringUpload}
                                        disabled={mirroringSending}
                                        data-testid="btn-send-mirroring"
                                        className="px-4 py-3 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap shadow-md"
                                    >
                                        {mirroringSending ? <Loader2 size={14} className="animate-spin"/> : <ShieldCheck size={14}/>}
                                        {mirroringSending ? 'Enviando...' : 'Enviar'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* FICHA DE MEDIÇÃO OPERACIONAL */}
                    <div className="bg-white p-6 rounded-[2.5rem] border border-gray-200 shadow-sm space-y-4">
                        <div className="flex items-center gap-2 border-b border-gray-50 pb-3">
                            <Milestone size={14} className="text-blue-600"/>
                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Ficha de Medição Operacional</h4>
                        </div>
                        
                        <div className="space-y-4">
                            {/* LINHA ORIGEM (PONTO A) */}
                            <div className="flex flex-col lg:flex-row items-center gap-6 p-4 bg-gray-50/50 rounded-2xl border border-gray-100 transition-all hover:bg-white hover:shadow-sm">
                                <div className="flex-1 flex items-start gap-3 w-full">
                                    <div className="p-2.5 bg-emerald-50 rounded-xl text-emerald-600 shrink-0"><MapPin size={16}/></div>
                                    <div className="min-w-0 flex-1">
                                        <span className={LABEL_CLASS}>Origem (Ponto A)</span>
                                        {canEditRoute && mapsJsReady ? (
                                            <Autocomplete 
                                                onLoad={ref => originAutocompleteRef.current = ref} 
                                                onPlaceChanged={handleOriginSelect}
                                            >
                                                <input 
                                                    type="text" 
                                                    className="w-full bg-transparent border-none p-0 text-xs font-bold text-gray-700 uppercase focus:ring-0" 
                                                    value={editData.origin} 
                                                    onChange={e => setEditData({...editData, origin: e.target.value.toUpperCase()})}
                                                    placeholder="Selecione a Origem..."
                                                />
                                            </Autocomplete>
                                        ) : (
                                            <p className="text-xs font-bold text-gray-700 uppercase truncate" title={mission.origin}>{editData.origin}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-4 w-full lg:w-auto">
                                    <div className="flex-1 lg:w-44">
                                        <label className={LABEL_CLASS}>Data Inicial</label>
                                        <div className="relative">
                                            <input type="date" className={`${INPUT_CLASS} ${!canEditTimes ? 'opacity-60 cursor-not-allowed' : ''}`} value={editData.startDate} onChange={e => canEditTimes && setEditData({...editData, startDate: e.target.value})} disabled={!canEditTimes} />
                                            <Calendar size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                                        </div>
                                    </div>
                                    <div className="flex-1 lg:w-28">
                                        <label className={LABEL_CLASS}>Hora Inicial</label>
                                        <div className="relative">
                                            <input type="time" step="1" className={`${INPUT_CLASS} ${!canEditTimes ? 'opacity-60 cursor-not-allowed' : ''}`} value={editData.startTime} onChange={e => canEditTimes && setEditData({...editData, startTime: e.target.value})} disabled={!canEditTimes} />
                                            <Clock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                                        </div>
                                    </div>
                                    {!hideProviderInfo && (
                                    <div className="flex-1 lg:w-36">
                                        <label className={LABEL_CLASS}>KM Inicial</label>
                                        <div className="relative">
                                            <input 
                                                type="text" 
                                                inputMode="decimal"
                                                className={INPUT_CLASS} 
                                                value={editData.startKm} 
                                                onChange={e => handleKmInput('startKm', e.target.value)}
                                                placeholder="0.0"
                                            />
                                            <Navigation size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                                        </div>
                                    </div>
                                    )}
                                </div>
                            </div>

                            {/* LINHA DESTINO (PONTO C) */}
                            <div className="flex flex-col lg:flex-row items-center gap-6 p-4 bg-gray-50/50 rounded-2xl border border-gray-100 transition-all hover:bg-white hover:shadow-sm">
                                <div className="flex-1 flex items-start gap-3 w-full">
                                    <div className="p-2.5 bg-red-50 rounded-xl text-red-600 shrink-0"><Flag size={16}/></div>
                                    <div className="min-w-0 flex-1">
                                        <span className={LABEL_CLASS}>Destino (Ponto C)</span>
                                        {canEditRoute && mapsJsReady ? (
                                            <Autocomplete 
                                                onLoad={ref => destinationAutocompleteRef.current = ref} 
                                                onPlaceChanged={handleDestinationSelect}
                                            >
                                                <input 
                                                    type="text" 
                                                    className="w-full bg-transparent border-none p-0 text-xs font-bold text-gray-700 uppercase focus:ring-0" 
                                                    value={editData.destination} 
                                                    onChange={e => setEditData({...editData, destination: e.target.value.toUpperCase()})}
                                                    placeholder="Selecione o Destino..."
                                                />
                                            </Autocomplete>
                                        ) : (
                                            <p className="text-xs font-bold text-gray-700 uppercase truncate" title={editData.destination}>
                                                {editData.destination}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-4 w-full lg:w-auto items-end">
                                    <div className="flex-1 lg:w-44">
                                        <label className={LABEL_CLASS}>Data Final</label>
                                        <div className="relative">
                                            <input 
                                                type="date" 
                                                className={`transition-all ${!isEndTimeLocked ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-200'} ${INPUT_CLASS} ${!canEditEndTime ? 'opacity-60 cursor-not-allowed' : ''}`} 
                                                value={editData.endDate} 
                                                disabled={!canEditEndTime}
                                                onChange={e => {
                                                    if (!canEditEndTime) return;
                                                    setEditData({...editData, endDate: e.target.value});
                                                    setIsEndTimeLocked(true);
                                                }} 
                                            />
                                            <Calendar size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                                        </div>
                                    </div>
                                    <div className="flex-1 lg:w-28 relative">
                                        <label className={LABEL_CLASS}>Hora Final</label>
                                        <div className="relative">
                                            <input 
                                                type="time" 
                                                step="1" 
                                                className={`transition-all ${!isEndTimeLocked ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-200'} ${INPUT_CLASS} ${!canEditEndTime ? 'opacity-60 cursor-not-allowed' : ''}`} 
                                                value={editData.endTime} 
                                                disabled={!canEditEndTime}
                                                onChange={e => {
                                                    if (!canEditEndTime) return;
                                                    setEditData({...editData, endTime: e.target.value});
                                                    setIsEndTimeLocked(true);
                                                }} 
                                            />
                                            <Clock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                                        </div>
                                        {!isEndTimeLocked && (
                                            <span className="absolute -top-4 right-0 text-[7px] font-black text-indigo-600 animate-pulse uppercase">Tempo Real</span>
                                        )}
                                    </div>
                                    {canEditEndTime && (
                                    <div className="flex items-center">
                                        <button 
                                            type="button"
                                            onClick={() => setIsEndTimeLocked(!isEndTimeLocked)}
                                            className={`p-2.5 rounded-xl transition-all shadow-sm ${!isEndTimeLocked ? 'bg-indigo-600 text-white animate-pulse' : 'bg-gray-100 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600 border border-gray-200'}`}
                                            title={isEndTimeLocked ? "Ativar Horário em Tempo Real" : "Travar Horário Atual"}
                                        >
                                            {isEndTimeLocked ? <RefreshCw size={14} /> : <Zap size={14} fill="currentColor" />}
                                        </button>
                                    </div>
                                    )}
                                    {!hideProviderInfo && (
                                    <div className="flex-1 lg:w-36">
                                        <label className={LABEL_CLASS}>KM Final</label>
                                        <div className="relative">
                                            <input 
                                                type="text" 
                                                inputMode="decimal"
                                                className={INPUT_CLASS} 
                                                value={editData.endKm} 
                                                onChange={e => handleKmInput('endKm', e.target.value)}
                                                placeholder="0.0"
                                            />
                                            <Flag size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                                        </div>
                                    </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* SOFTWARE ANALYTICS E PROGRESSO INTELIGENTE */}
                    <div className="bg-slate-900 rounded-[2.5rem] p-6 text-white shadow-2xl relative overflow-hidden group border border-slate-800">
                      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform duration-500"><Calculator size={100} /></div>
                      <div className="relative z-10 flex flex-col gap-6">
                          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                              <div className="flex items-center gap-3">
                                  <div className="p-3 bg-red-600 rounded-2xl shadow-xl shadow-red-900/40"><DollarSign size={24} /></div>
                                  <div>
                                      <h4 className="text-sm font-black uppercase tracking-tight">Software Analytics</h4>
                                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.2em] mt-0.5">Rendimento Técnico em Tempo Real</p>
                                  </div>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 flex-1 max-w-2xl">
                                  <div className="flex flex-col items-end border-l border-white/10 pl-4">
                                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Dist. Prevista</span>
                                      <span className={`text-base font-black font-mono transition-all duration-300 ${editData.applyCeva200km ? 'text-red-500' : editData.applyVtc02h ? 'text-yellow-500' : 'text-blue-400'}`}>
                                          {missionTotals.plannedKm.toFixed(1)} KM
                                      </span>
                                  </div>
                                  <div className="flex flex-col items-end border-l border-white/10 pl-4">
                                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">KM Executado</span>
                                      <span className="text-base font-black font-mono text-green-400">{missionTotals.km} KM</span>
                                  </div>
                                  <div className="flex flex-col items-end border-l border-white/10 pl-4">
                                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Excedentes</span>
                                      <span className={`text-base font-black font-mono ${missionTotals.extraHours > 0 ? 'text-orange-400 animate-pulse' : 'text-slate-500'}`}>{missionTotals.extraHours.toFixed(2)} H</span>
                                  </div>
                                  <div className="flex flex-col items-end border-l border-white/10 pl-4">
                                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Cronômetro</span>
                                      <span className="text-base font-black font-mono text-white">{missionTotals.time}</span>
                                  </div>
                              </div>
                          </div>

                          <div className="bg-slate-950 p-6 rounded-3xl border border-white/5 space-y-4">
                              <div className="flex justify-between items-center">
                                  <div className="flex items-center gap-2">
                                      <TrendingUp size={16} className="text-red-500" />
                                      <h4 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                          Progresso da Viagem: {editData.manualProgress}%
                                          {missionTotals.traveled > 0 && missionTotals.plannedKm > 0 && (
                                              <span className="bg-emerald-600/20 text-emerald-400 px-2 py-0.5 rounded text-[8px] border border-emerald-500/30 font-mono">
                                                  {missionTotals.traveled.toFixed(1)} / {missionTotals.plannedKm.toFixed(1)} KM
                                              </span>
                                          )}
                                          {missionTotals.plannedKm > 0 && missionTotals.traveled > 0 && missionTotals.traveled > missionTotals.plannedKm * 5 && editData.status !== MissionStatus.COMPLETED ? (
                                              <span className="bg-amber-600/20 text-amber-400 px-2 py-0.5 rounded text-[8px] border border-amber-500/30 animate-pulse flex items-center gap-1"><AlertTriangle size={8}/> HODÔMETRO INCONSISTENTE ({(missionTotals.traveled / missionTotals.plannedKm).toFixed(1)}x)</span>
                                          ) : (
                                              <span className="bg-red-600/20 text-red-500 px-2 py-0.5 rounded text-[8px] border border-red-500/30 animate-pulse flex items-center gap-1"><Zap size={8}/> CÁLCULO AUTOMÁTICO</span>
                                          )}
                                      </h4>
                                  </div>
                              </div>
                              <div className="relative w-full h-3 bg-slate-800 rounded-full overflow-hidden shadow-inner border border-white/5">
                                  <div 
                                      className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-1000 shadow-[0_0_15px_rgba(220,38,38,0.3)]" 
                                      style={{ width: `${Math.min(100, editData.manualProgress)}%` }}
                                  ></div>
                                  {editData.manualProgress > 5 && editData.manualProgress < 95 && (
                                      <div className="absolute top-1/2 -translate-y-1/2 flex items-center" style={{ left: `${Math.min(100, editData.manualProgress)}%`, transform: 'translate(-50%, -50%)' }}>
                                          <Truck size={14} className="text-white drop-shadow-[0_0_6px_rgba(220,38,38,0.8)]" />
                                      </div>
                                  )}
                              </div>
                              <div className="flex justify-between text-[8px] font-bold uppercase tracking-widest">
                                  <span className="text-slate-600">Ponto A (Saída)</span>
                                  {(() => {
                                      const loc = mission.currentLocation || '';
                                      const parts = loc.split('|');
                                      const locationPart = parts.length > 1 ? parts[parts.length - 1].trim() : loc.trim();
                                      const cityName = locationPart ? locationPart.split(',')[0].trim() : '';
                                      return cityName ? (
                                          <span className="text-yellow-500 flex items-center gap-1" data-testid="text-last-location-city">
                                              <MapPin size={8} /> Ponto B — {cityName}
                                          </span>
                                      ) : (
                                          <span className="text-slate-600">Ponto B</span>
                                      );
                                  })()}
                                  <span className="text-slate-600">Ponto C (Chegada)</span>
                              </div>
                          </div>
                      </div>
                    </div>

                    {/* POSICIONAMENTO GEOGRÁFICO INTELIGENTE */}
                    <div className="p-5 bg-slate-900 rounded-[2.5rem] text-white space-y-4 shadow-2xl border border-slate-800">
                        <div className="flex items-center gap-2 border-b border-white/5 pb-3">
                            <Navigation size={16} className="text-red-500" />
                            <h4 className="text-[10px] font-black uppercase tracking-widest">Posicionamento Geográfico Inteligente</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                            <div className="flex flex-col gap-4">
                                <div>
                                    <label className={`text-[9px] font-black uppercase tracking-[0.2em] mb-1.5 block ${isGoogleLinkRequired ? 'text-red-400 animate-pulse underline decoration-2' : 'text-slate-400'}`}>
                                        {isGoogleLinkRequired ? 'LINK GOOGLE MAPS OBRIGATÓRIO *' : 'Localização Atual (Ponto B)'}
                                    </label>
                                    {mapsJsReady ? (
                                        <Autocomplete onLoad={ref => updateLocRef.current = ref} onPlaceChanged={handlePlaceSelect}>
                                            <input type="text" className={`w-full bg-slate-800 border rounded-xl p-3.5 text-xs font-bold outline-none transition-all ${isGoogleLinkRequired && !editData.mapLink ? 'border-red-500/50 ring-2 ring-red-500/10' : 'border-white/10 focus:ring-2 focus:ring-red-500/30'}`} placeholder="Busque a cidade ou cole link do Google Maps..." value={editData.currentLocationName} onChange={e => handleLocationInputChange(e.target.value)} onBlur={e => resolveTypedAddress(e.target.value)} />
                                        </Autocomplete>
                                    ) : (
                                        <input type="text" className={`w-full bg-slate-800 border rounded-xl p-3.5 text-xs font-bold outline-none transition-all ${isGoogleLinkRequired && !editData.mapLink ? 'border-red-500/50 ring-2 ring-red-500/10' : 'border-white/10 focus:ring-2 focus:ring-red-500/30'}`} placeholder="Digite o endereço ou cole link do Google Maps..." value={editData.currentLocationName} onChange={e => handleLocationInputChange(e.target.value)} onBlur={e => resolveTypedAddress(e.target.value)} />
                                    )}
                                    {!editData.mapLink && isGoogleLinkRequired && (
                                        <p className="text-[8px] text-red-500 font-black mt-1 uppercase flex items-center gap-1"><ShieldAlert size={10}/> Sistema bloqueado até identificar link de satélite válido</p>
                                    )}
                                    {loadError && (
                                        <p className="text-[8px] text-amber-400 font-black mt-1 uppercase flex items-center gap-1"><ShieldAlert size={10}/> Maps JS indisponível; usando mapa por link/endereço</p>
                                    )}
                                    {editData.mapLink && (
                                        <p className="text-[8px] text-green-500 font-black mt-1 uppercase flex items-center gap-1"><Globe size={10}/> Link de GPS validado com sucesso</p>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <label className={`text-[9px] font-black uppercase tracking-[0.2em] mb-1.5 block ${isOccurrenceRequired ? 'text-red-400 animate-pulse' : 'text-slate-400'}`}>Ocorrência / Status *</label>
                                    <textarea className="w-full h-full bg-slate-800 border border-white/10 rounded-2xl p-3.5 text-xs outline-none focus:ring-2 focus:ring-blue-500/30 font-medium transition-all" placeholder="Ex: EM OPERAÇÃO, SEGUE MISSÃO..." value={editData.description} onChange={e => setEditData({...editData, description: e.target.value.toUpperCase()})}></textarea>
                                </div>
                            </div>
                            <div className="flex flex-col gap-3 min-h-[350px]">
                                <div className="bg-slate-950 rounded-[2rem] border border-white/5 overflow-hidden flex-1 relative shadow-inner">
                                    {mapsJsReady && currentPreviewCoords ? (
                                        <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={currentPreviewCoords} zoom={15} options={{ disableDefaultUI: true, styles: [{ elementType: "geometry", stylers: [{ color: "#242f3e" }] }, { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] }] }}>
                                            <Marker position={currentPreviewCoords} />
                                        </GoogleMap>
                                    ) : fallbackMapEmbedUrl ? (
                                        <iframe
                                            title="Prévia do mapa"
                                            src={fallbackMapEmbedUrl}
                                            className="h-full w-full border-0"
                                            loading="lazy"
                                            referrerPolicy="no-referrer-when-downgrade"
                                        />
                                    ) : fallbackMapOpenUrl ? (
                                        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                                            <MapPin size={40} className="text-red-400" />
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">Endereço/link aceito</p>
                                            <p className="max-w-sm text-[11px] font-semibold text-slate-400">O mapa interativo do Google está indisponível neste navegador, mas o link da localização foi gerado para salvar e abrir externamente.</p>
                                            <a href={fallbackMapOpenUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-red-600 px-4 py-2 text-[10px] font-black uppercase text-white hover:bg-red-700">
                                                Abrir no Google Maps
                                            </a>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full opacity-20"><MapPin size={40}/><p className="text-[9px] font-black uppercase mt-2 text-center">Aguardando coordenadas...</p></div>
                                    )}
                                </div>
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><History size={12} className="text-red-500"/> Última informação gravada</p>
                                    <p className="text-[10px] font-bold text-slate-300 mt-1.5 italic truncate">{mission.currentLocation || 'Nenhuma ocorrência anterior'}</p>
                                </div>
                            </div>
                        </div>

                        {/* COLAR PRINT — temporário, só desta sessão (não vai para o banco/bucket) */}
                        <div className="pt-4 border-t border-white/5">
                            <label className="text-[9px] font-black uppercase tracking-[0.2em] mb-1.5 block text-slate-400">
                                Print da Atualização (opcional — copiado junto com o formulário ao salvar)
                            </label>
                            <div
                                tabIndex={0}
                                onPaste={(e) => {
                                    const item = Array.from(e.clipboardData?.items || []).find(it => it.type.startsWith('image/'));
                                    const file = item?.getAsFile();
                                    if (file) { e.preventDefault(); void processUpdatePrint(file); }
                                }}
                                className="relative flex min-h-[140px] cursor-text flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-amber-500/40 bg-slate-800/60 p-4 text-center outline-none transition-all focus:border-amber-400 hover:border-amber-400/70"
                                data-testid="dropzone-update-print"
                            >
                                {updatePrintProcessing ? (
                                    <div className="flex items-center gap-2 text-[11px] font-bold text-slate-300" data-testid="status-update-print-processing">
                                        <Loader2 className="h-4 w-4 animate-spin" /> Detectando overlays, removendo marcas e aplicando logotipo TM SEG...
                                    </div>
                                ) : updatePrintPreview ? (
                                    <>
                                        <img src={updatePrintPreview} alt="Print com logotipo TM SEG" className="max-h-56 rounded-xl border border-white/10" data-testid="img-update-print-preview" />
                                        <button
                                            type="button"
                                            onClick={clearUpdatePrint}
                                            className="mt-1 rounded-md bg-slate-700 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-200 hover:bg-slate-600"
                                            data-testid="button-update-print-remove"
                                        >
                                            Remover print
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <ClipboardList size={28} className="text-amber-500/70" />
                                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-200">Colar Print</p>
                                        <p className="text-[9px] font-bold text-slate-400">Clique aqui e cole o print (Ctrl+V)</p>
                                        <label className="mt-1 inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-slate-700 px-2.5 py-1.5 text-[10px] font-bold text-slate-200 hover:bg-slate-600" data-testid="button-update-print-attach">
                                            <Plus className="h-3.5 w-3.5" /> Anexar imagem
                                            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void processUpdatePrint(f); e.currentTarget.value = ''; }} />
                                        </label>
                                    </>
                                )}
                            </div>
                            {updatePrintPreview && !updatePrintProcessing && (
                                <div className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2" data-testid="text-update-print-ready">
                                    <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />
                                    <p className="text-[10px] font-bold text-emerald-300">{updatePrintAiCleaned
                                        ? 'Foto tratada: overlays removidos e logotipo TM SEG aplicado. Não é salva no sistema — só vai na área de transferência ao salvar.'
                                        : 'Logotipo TM SEG aplicado (nenhum overlay detectado ou limpeza indisponível). Não é salva no sistema — só vai na área de transferência ao salvar.'}</p>
                                    {(isPrintPipelineDebug() && updatePrintTimings) && (
                                        <div className="mt-2 rounded-lg border border-white/10 bg-slate-900/80 p-2 text-left font-mono text-[9px] text-slate-400" data-testid="print-pipeline-timings">
                                            <p className="font-bold text-amber-300/90 mb-1">Pipeline debug (ms)</p>
                                            <p>upload: {updatePrintTimings.uploadMs} · leitura: {updatePrintTimings.readMs} · detecção: {updatePrintTimings.detectionMs}</p>
                                            <p>remoção: {updatePrintTimings.removalMs} · logo: {updatePrintTimings.logoMs} · salvamento: {updatePrintTimings.saveMs}</p>
                                            <p className="text-emerald-400 font-bold">total: {updatePrintTimings.totalMs} ms</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/5">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                                <div className="min-w-0">
                                    <span className="text-[8px] font-black text-gray-500 uppercase block">Ponto A (Origem)</span>
                                    <span className="text-[9px] font-black text-white truncate block" title={editData.origin}>{editData.origin || '---'}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                                <div className="min-w-0">
                                    <span className="text-[8px] font-black text-gray-500 uppercase block">Ponto B (Atual)</span>
                                    <span className="text-[9px] font-black text-white truncate block" title={editData.currentLocationName}>{editData.currentLocationName || 'S/D'}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                <div className="min-w-0">
                                    <span className="text-[8px] font-black text-gray-500 uppercase block">Ponto C (Destino)</span>
                                    <span className="text-[9px] font-black text-white truncate block" title={editData.destination}>{editData.destination || '---'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RODAPÉ DE AÇÕES */}
                    <div className="pt-6 border-t border-gray-100 flex justify-end gap-3 sticky bottom-0 bg-white pb-4 px-2 shrink-0">
                        <button type="button" onClick={onClose} className="px-8 py-3 border border-gray-200 rounded-xl text-[10px] font-black text-gray-500 uppercase hover:bg-gray-50 transition-all">Cancelar</button>
                        <button type="submit" disabled={isUpdating || (isGoogleLinkRequired && !editData.mapLink)} className={`px-10 py-3 rounded-xl text-[10px] font-black shadow-lg uppercase flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 ${isGoogleLinkRequired && !editData.mapLink ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700 shadow-red-200'}`}>
                            {isUpdating ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 
                            {isGoogleLinkRequired && !editData.mapLink ? 'Link Google Obrigatório' : 'Salvar Alterações'}
                        </button>
                    </div>
                </form>
            )}
          </div>
          <TollConfirmationDialog
            isOpen={!!pendingTollConfirm}
            mission={mission}
            source="completion"
            allowClose={false}
            onConfirm={handleTollConfirmedAfterCompletion}
          />
          {pendingFinalizeConfirm && (
            <FinalizeChecklistDialog
              isOpen={!!pendingFinalizeConfirm}
              kind={pendingFinalizeConfirm.kind}
              osLabel={mission?.id ? `OS ${mission.id}` : 'OS'}
              providerName={editData.provider || ''}
              dateLabel={editData.startDate ? formatDateBR(`${editData.startDate}T12:00:00`) : ''}
              isDhl={finalizeData.isDhl}
              destinationAddress={finalizeData.destinationAddress}
              mapLink={editData.mapLink || ''}
              originCity={finalizeData.originCity}
              destCity={finalizeData.destCity}
              appliedTableName={finalizeData.appliedTableName}
              isRaio={finalizeData.isRaio}
              raioFranchiseKm={finalizeData.raioFranchiseKm}
              franchiseKm={finalizeData.franchiseKm}
              suggestions={finalizeData.suggestions}
              startKm={parseNumber(editData.startKm)}
              defaultEndKm={editData.endKm || ''}
              defaultDateTime={
                editData.endDate && editData.endTime
                  ? `${editData.endDate}T${editData.endTime}`
                  : toLocalDateTimeInput(new Date())
              }
              minDateTime={
                editData.startDate && editData.startTime && !canEditTimes
                  ? `${editData.startDate}T${editData.startTime}`
                  : undefined
              }
              missionId={mission?.id ? String(mission.id) : ''}
              onConfirm={handleFinalizeConfirmed}
              onCancel={handleFinalizeCancelled}
            />
          )}

          {finalizeReport && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4" data-testid="dialog-finalize-report">
              <div className="w-full max-w-[460px] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
                <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900">Fim de Missão concluído</h2>
                    <p className="text-xs text-slate-500">Copie o relatório para enviar no WhatsApp.</p>
                  </div>
                </div>
                <div className="p-5">
                  <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-[12px] font-medium text-slate-700" data-testid="text-finalize-report">{finalizeReport.text}</pre>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={async () => { try { await navigator.clipboard.writeText(finalizeReport.text); setCopiedReportText(true); showNotification('Texto copiado', 'Relatório de fim de missão copiado.', 'success'); } catch { showNotification('Erro', 'Não foi possível copiar o texto.', 'error'); } }}
                      className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
                      data-testid="button-copy-report-text"
                    >
                      {copiedReportText ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />} Copiar texto
                    </button>
                    <button
                      type="button"
                      disabled={!finalizeReport.photoUrl}
                      onClick={async () => {
                        if (!finalizeReport.photoUrl) return;
                        try {
                          const resp = await fetch(finalizeReport.photoUrl);
                          const blob = await resp.blob();
                          const item = new ClipboardItem({ [blob.type || 'image/png']: blob });
                          await navigator.clipboard.write([item]);
                          setCopiedReportPhoto(true);
                          showNotification('Foto copiada', 'Print do hodômetro copiado.', 'success');
                        } catch { showNotification('Erro', 'Não foi possível copiar a foto. Baixe pelo link.', 'error'); }
                      }}
                      className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-bold text-white ${finalizeReport.photoUrl ? 'bg-slate-700 hover:bg-slate-800' : 'cursor-not-allowed bg-slate-300'}`}
                      data-testid="button-copy-report-photo"
                    >
                      {copiedReportPhoto ? <Check className="h-4 w-4" /> : <CarFront className="h-4 w-4" />} Copiar foto
                    </button>
                  </div>
                  {finalizeReport.photoUrl && (
                    <a href={finalizeReport.photoUrl} target="_blank" rel="noreferrer" className="mt-2 block text-center text-[11px] font-semibold text-slate-400 underline" data-testid="link-odometer-photo">Abrir print do hodômetro</a>
                  )}
                  <button type="button" onClick={() => { setFinalizeReport(null); onSuccess(); }} className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600" data-testid="button-close-finalize-report">
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          )}
          {mission && dhlOccurrenceReportOpen && (
            <DhlOccurrenceReportModal
              mission={{ ...mission, dhl_se_number: editData.dhl_se_number || mission.dhl_se_number }}
              isOpen={dhlOccurrenceReportOpen}
              onClose={() => setDhlOccurrenceReportOpen(false)}
            />
          )}
        </div>
    );
};

export default UpdateMissionModal;
