
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Mission, ClientPriceTable, ProviderCostTable, MissionStatus, Client } from '../types';
import { supabase } from '../lib/supabase';
import { useLoadScript, Autocomplete } from '@react-google-maps/api';
import { googleMapsLoadConfig } from '../lib/maps';
import { authFetch } from '../lib/authFetch';
import { useNotification } from '../lib/NotificationContext';
import { calculateMissionFinancials, auditMissionFinancials, extractUF, UF_TO_REGION, clientFuzzyFilter, clientNameShort, clientTableMatchesMission, fetchClientPriceTables, isIntentionalBillingOverride, extractCityFromAddress } from '../lib/financialUtils';
import {
  isDhlSupplyClient,
  validateDhlTableName,
  computeDhlBand,
  setDhlCorrectionsCache,
  getDhlCorrectionStatsByRegion,
  findDhlCorrectionSource,
  type DhlCorrectionRecord,
} from '../lib/dhlAutoTableSelector';
import { X, Calculator, Loader2, Save, CheckCircle2, TrendingUp, Landmark, Zap, RotateCcw, Building2, Briefcase, Plus, Users, MapPin, ArrowRight, BrainCircuit, AlertTriangle, AlertCircle, Edit2, Info, RefreshCw, Clock, Pencil, Lock, ShieldCheck, Camera, Image as ImageIcon, Link2, Layers, Scale, Sparkles, Navigation, History, Settings2, FileText, Copy } from 'lucide-react';
import { suggestPriceTable } from '../lib/gemini';
import ProviderCostForm from './ProviderCostForm';
import ClientPriceForm from './ClientPriceForm';
import TollConfirmationDialog from './TollConfirmationDialog';
import { formatProviderName } from '../lib/utils';
import { copyTextAsync } from '../lib/clipboard';
import { buildAuditSummaryData, type AuditSummaryData } from '../lib/auditSummaryBuilder';
import AuditSummaryPanel from './AuditSummaryPanel';
import { formatDateTimeBR, formatNowDateTimeBR, formatDateBR, formatTimeBR } from '../lib/dateUtils';
import { useRealtimeRefresh } from '../lib/RealtimeProvider';
import html2canvas from 'html2canvas';
import FilterableSelect, { type FilterableSelectOption } from './FilterableSelect';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  mission: Mission | null;
  onUpdate?: () => void;
}

const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'R$ 0,00';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const safeNumber = (val: any): number => {
    if (val === null || val === undefined || val === '') return 0;
    const n = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'));
    return isNaN(n) ? 0 : n;
};

const r2money = (v: number) => Math.round(v * 100) / 100;

/** OS filha Mesma OS: custo do fornecedor sempre zero no banco. */
async function zeroSameOsProviderCostInDb(missionId: string): Promise<boolean> {
    const payload: Record<string, unknown> = {
        cost_value: 0,
        toll_value_provider: 0,
        displacement_value_provider: 0,
        last_update: new Date().toISOString(),
    };
    let { error } = await supabase.from('missions').update(payload).eq('id', missionId);
    if (error?.message?.includes('does not exist')) {
        const { toll_value_provider, displacement_value_provider, ...minimal } = payload;
        ({ error } = await supabase.from('missions').update(minimal).eq('id', missionId));
    }
    return !error;
}

function broadcastMissionRefresh() {
    try { window.dispatchEvent(new CustomEvent('refreshMissions')); } catch {}
}

// Parser robusto para input BRL
const parseNumber = (val: string | number | undefined | null): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    let str = String(val).trim();
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
    const clean = str.replace(/[^\d.,-]/g, '');
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
};

const formatHoursHHMM = (decimalHours: number): string => {
    const h = Math.floor(decimalHours);
    const m = Math.round((decimalHours - h) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

// OS 5046: o motor automático gera uma tabela sintética com id "auto-...".
// Esse id NÃO deve ser persistido nem tratado como seleção manual (senão o motor
// se desligaria por engano ao reabrir). Retorna o id real ou null.
const sanitizeProviderTableId = (id: any): string | null =>
    (id && !String(id).startsWith('auto-')) ? String(id) : null;

const LABEL_CLASS = "text-[10px] font-black text-gray-400 uppercase mb-1.5 block tracking-widest";

const BillingPeriodOverridePanel: React.FC<{
    mission: Mission | null;
    setMission: React.Dispatch<React.SetStateAction<Mission | null>>;
    showNotification: (t: string, m: string, k?: any) => void;
}> = ({ mission, setMission, showNotification }) => {
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const toLocalInput = (iso?: string | null) => {
        if (!iso) return '';
        const d = new Date(iso);
        const tzOff = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - tzOff).toISOString().slice(0, 16);
    };
    const [overrideDate, setOverrideDate] = useState<string>(toLocalInput(mission?.billing_period_override));
    const [excluded, setExcluded] = useState<boolean>(mission?.exclude_from_billing === true);

    React.useEffect(() => {
        setOverrideDate(toLocalInput(mission?.billing_period_override));
        setExcluded(mission?.exclude_from_billing === true);
    }, [mission?.id, mission?.billing_period_override, mission?.exclude_from_billing]);

    if (!mission) return null;
    const hasOverride = !!mission.billing_period_override;
    const isExcluded = mission.exclude_from_billing === true;
    const badge = isExcluded
        ? { text: 'Removida do boletim', cls: 'bg-red-100 text-red-700 border-red-300' }
        : hasOverride
            ? { text: 'Data manual no boletim', cls: 'bg-indigo-100 text-indigo-700 border-indigo-300' }
            : null;

    const handleSave = async () => {
        setSaving(true);
        try {
            const isoOverride = overrideDate ? new Date(overrideDate).toISOString() : null;
            const { error } = await supabase
                .from('missions')
                .update({ billing_period_override: isoOverride, exclude_from_billing: excluded })
                .eq('id', mission.id);
            if (error) {
                if (/column .* does not exist/i.test(error.message)) {
                    showNotification('Migração pendente', 'Rode o SQL em migrations/2026_05_08_billing_overrides.sql no Supabase antes de usar este controle.', 'error');
                } else {
                    showNotification('Erro', 'Falha ao salvar: ' + error.message, 'error');
                }
                return;
            }
            setMission(prev => prev ? { ...prev, billing_period_override: isoOverride, exclude_from_billing: excluded } : prev);
            showNotification('Sucesso', 'Configuração do boletim atualizada.', 'success');
            setOpen(false);
            window.dispatchEvent(new CustomEvent('refreshMissions'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div data-testid="billing-override-panel" className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <button
                type="button"
                data-testid="button-toggle-billing-override"
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-gray-50 rounded-xl"
            >
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Boletim de Medição — Inclusão Manual</span>
                    {badge && (
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.text}</span>
                    )}
                </div>
                <span className="text-[10px] text-gray-400">{open ? 'fechar' : 'abrir'}</span>
            </button>
            {open && (
                <div className="px-4 pb-4 pt-1 space-y-3 border-t border-gray-100">
                    <p className="text-[11px] text-gray-500">
                        Por padrão, esta OS aparece no boletim do mês da viagem. Use os controles abaixo só para casos especiais — não afeta o restante do sistema.
                    </p>
                    <div>
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1">Considerar nesta data (opcional)</label>
                        <div className="flex gap-2 items-center">
                            <input
                                data-testid="input-billing-period-override"
                                type="datetime-local"
                                value={overrideDate}
                                onChange={e => setOverrideDate(e.target.value)}
                                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm flex-1"
                            />
                            {overrideDate && (
                                <button
                                    type="button"
                                    data-testid="button-clear-billing-override"
                                    onClick={() => setOverrideDate('')}
                                    className="text-[10px] text-gray-500 hover:text-gray-800 underline"
                                >limpar</button>
                            )}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">
                            Se preenchido, o boletim usa esta data em vez da data da viagem ({mission.start_time ? formatDateBR(mission.start_time) : '-'}).
                        </p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                            data-testid="checkbox-exclude-from-billing"
                            type="checkbox"
                            checked={excluded}
                            onChange={e => setExcluded(e.target.checked)}
                            className="w-4 h-4"
                        />
                        <span className="text-xs text-gray-700">Não incluir esta OS em nenhum boletim de medição</span>
                    </label>
                    <div className="flex justify-end pt-1">
                        <button
                            type="button"
                            data-testid="button-save-billing-override"
                            disabled={saving}
                            onClick={handleSave}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-50"
                        >
                            {saving ? 'Salvando…' : 'Salvar configuração'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// Botão de engrenagem + popover para TROCAR a tabela de preço (cliente) ou de
// custo (fornecedor) de uma OS específica, diretamente nos campos de Receita e
// Custo. A seleção atualiza o cálculo na hora (preview) e o botão "Aplicar e
// Salvar" persiste no banco via handleUpdate, propagando em tempo real.
const TableSwapControl: React.FC<{
    kind: 'client' | 'provider';
    accent: 'green' | 'blue';
    options: FilterableSelectOption[];
    value: string;
    onSelect: (id: string) => void;
    onApply: () => void | Promise<void>;
    disabled: boolean;
    isApplying: boolean;
    previewTotal: number;
}> = ({ kind, accent, options, value, onSelect, onApply, disabled, isApplying, previewTotal }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);
    const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const btnAccent = accent === 'green'
        ? 'text-green-700 bg-green-100 hover:bg-green-200 border-green-300'
        : 'text-blue-700 bg-blue-100 hover:bg-blue-200 border-blue-300';
    const applyAccent = accent === 'green'
        ? 'bg-green-600 hover:bg-green-700'
        : 'bg-blue-600 hover:bg-blue-700';
    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className={`flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded border transition-colors ${btnAccent}`}
                title={kind === 'client' ? 'Trocar tabela de preço do cliente' : 'Trocar tabela de custo do fornecedor'}
                data-testid={`button-swap-table-${kind}`}
            >
                <Settings2 size={10} /> Trocar Tabela
            </button>
            {open && (
                <div
                    className="absolute right-0 z-[60] mt-1 w-80 bg-white rounded-xl border border-gray-200 shadow-2xl p-3"
                    onClick={e => e.stopPropagation()}
                    data-testid={`popover-swap-table-${kind}`}
                >
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-700 mb-2">
                        {kind === 'client' ? 'Tabela de Preço (Cliente)' : 'Tabela de Custo (Fornecedor)'}
                    </p>
                    <FilterableSelect
                        value={value}
                        onChange={onSelect}
                        options={options}
                        disabled={disabled}
                        accentColor={accent === 'green' ? 'blue' : 'red'}
                        placeholder="Selecione a tabela…"
                        data-testid={`select-swap-table-${kind}`}
                    />
                    <div className="mt-2 flex items-center justify-between text-[10px] font-bold text-gray-500">
                        <span>{kind === 'client' ? 'Novo valor cliente:' : 'Novo custo fornecedor:'}</span>
                        <span className="text-sm font-black text-gray-900" data-testid={`text-swap-preview-${kind}`}>{fmt(previewTotal)}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                        <button
                            type="button"
                            disabled={disabled || isApplying}
                            onClick={async () => { await onApply(); setOpen(false); }}
                            className={`flex-1 px-3 py-2 rounded-lg text-[10px] font-black uppercase text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1 ${applyAccent}`}
                            data-testid={`button-apply-swap-table-${kind}`}
                        >
                            {isApplying ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                            {isApplying ? 'Salvando…' : 'Aplicar e Salvar'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="px-3 py-2 rounded-lg text-[10px] font-black uppercase text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
                            data-testid={`button-cancel-swap-table-${kind}`}
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const MissionFinancialModal: React.FC<Props> = ({ isOpen, onClose, mission: initialMission, onUpdate }) => {
  const { showNotification } = useNotification();
  const [mission, setMission] = useState<Mission | null>(initialMission);
  const [clientTables, setClientTables] = useState<ClientPriceTable[]>([]);
  const [providerTables, setProviderTables] = useState<ProviderCostTable[]>([]);
  // Lista de fornecedores (id, name, trading_name) para resolver apelidos
  // razão social x nome fantasia (ex: ARMADA REAL vs CENTURIÃO - PE).
  const [providersList, setProvidersList] = useState<Array<{ id: string; name: string; trading_name?: string | null }>>([]);
  // Apelidos normalizados do fornecedor da OS atual (razão social + nome fantasia)
  const [providerAliases, setProviderAliases] = useState<string[]>([]);
  const [clientData, setClientData] = useState<Client | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [revenueInput, setRevenueInput] = useState('');
  const [costInput, setCostInput] = useState('');
  const [tollInput, setTollInput] = useState('');
  const [tollProviderInput, setTollProviderInput] = useState('');
  const [displacementInput, setDisplacementInput] = useState('');
  const [displacementProviderInput, setDisplacementProviderInput] = useState('');
  // KM de deslocamento autorizado pela DHL (dhl_deslocamento_km, digitado no
  // "Atualizar Missão"). Vira cobrança automática via o campo aditivo
  // "Deslocamento Aprovado (Cobrado)" — mesma via do pedágio.
  const dhlDeslocKmRef = React.useRef(0);
  const dhlDeslocAutoAppliedRef = React.useRef(false);
  const [dhlDeslocInfo, setDhlDeslocInfo] = useState<{ km: number; clientRate: number; clientVal: number } | null>(null);
  
  // Custom Unit Prices (Edição Livre)
  const [customProviderKm, setCustomProviderKm] = useState<string>('');
  const [customProviderHour, setCustomProviderHour] = useState<string>('');
  const [customProviderBase, setCustomProviderBase] = useState<string>(''); // Novo
  
  const [customClientKm, setCustomClientKm] = useState<string>('');
  const [customClientHour, setCustomClientHour] = useState<string>('');
  const [customClientBase, setCustomClientBase] = useState<string>(''); // Novo

  const [manualClientTableId, setManualClientTableId] = useState<string>('');
  const [manualProviderTableId, setManualProviderTableId] = useState<string>('');
  // Task #111: memória de correções DHL — cache de registros recentes e ref
  // com a última sugestão emitida pelo motor (para detectar override).
  const [dhlCorrections, setDhlCorrections] = useState<DhlCorrectionRecord[]>([]);
  const dhlEngineSuggestionRef = useRef<{
    tableId: string | null;
    matchLevel: string;
    region: string;
    band: number;
    originCity: string;
    destCity: string;
    originUF: string;
  } | null>(null);
  const [iblEnabled, setIblEnabled] = useState(false);
  const [linkedMissions, setLinkedMissions] = useState<Array<{id: string; origin: string; destination: string; status: string; is_same_os: boolean; revenue_value: number; cost_value: number; start_time: string}>>([]);

  const [aiMaturity, setAiMaturity] = useState(0);
  const [suggestedToll, setSuggestedToll] = useState<number | null>(null);
  const [tollSource, setTollSource] = useState<string>('');
  const [isAddCostModalOpen, setIsAddCostModalOpen] = useState(false);
  const [editCostTableId, setEditCostTableId] = useState<string | null>(null);
  const [isEditClientTableOpen, setIsEditClientTableOpen] = useState(false);
  const [editClientTableId, setEditClientTableId] = useState<string | null>(null);
  const [memoryLoaded, setMemoryLoaded] = useState(false);
  const [tollConfirmed, setTollConfirmed] = useState(false);
  const [showTollConfirmDialog, setShowTollConfirmDialog] = useState(false);
  const [tollConfirmAutoOpened, setTollConfirmAutoOpened] = useState(false);
  const [isCalculatingToll, setIsCalculatingToll] = useState(false);
  const [tollEmbeddedInCost, setTollEmbeddedInCost] = useState(false);
  const [approvalLog, setApprovalLog] = useState<Array<{user: string; role: string; stage: string; date: string}>>([]);
  // Histórico permanente de alterações pós-aprovação (Data / Quem / Mudanças / Observação)
  const [editHistory, setEditHistory] = useState<Array<{user: string; date: string; changes: string[]; note: string}>>([]);
  const [editObservation, setEditObservation] = useState('');
  // Histórico financeiro (FINANCIAL_RECALC + billing_override) por OS, com filtro por período.
  const [finHistory, setFinHistory] = useState<Array<any>>([]);
  const [finHistLoading, setFinHistLoading] = useState(false);
  const [finHistStart, setFinHistStart] = useState('');
  const [finHistEnd, setFinHistEnd] = useState('');
  const [finHistOpen, setFinHistOpen] = useState(false);
  const [systemCalculatedCost, setSystemCalculatedCost] = useState<number | null>(null);
  const [systemCalculatedRevenue, setSystemCalculatedRevenue] = useState<number | null>(null);
  const [controllerSavedCost, setControllerSavedCost] = useState<number | null>(null);
  const [controllerSavedRevenue, setControllerSavedRevenue] = useState<number | null>(null);
  const [controllerSaveInfo, setControllerSaveInfo] = useState<{user: string; date: string} | null>(null);
  const [useSavedValues, _setUseSavedValues] = useState(false);
  const useSavedValuesRef = React.useRef(false);
  const setUseSavedValues = (val: boolean) => { useSavedValuesRef.current = val; _setUseSavedValues(val); };
  const isSavingRef = React.useRef(false);
  const userManuallyEditedRef = React.useRef(false);
  const dbValuesLoadedRef = React.useRef(false);
  const staleAutoResyncDoneRef = React.useRef<string | null>(null);
  const [savedByInfo, setSavedByInfo] = useState<string | null>(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [showAuditSummary, setShowAuditSummary] = useState(false);
  const [auditSummaryData, setAuditSummaryData] = useState<AuditSummaryData | null>(null);
  const [auditSummaryEditText, setAuditSummaryEditText] = useState('');
  const [auditSummaryView, setAuditSummaryView] = useState<'visual' | 'text'>('visual');
  const [auditSummaryLoading, setAuditSummaryLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{
    clientSuggestion: { tableId: string; tableName: string; reason: string } | null;
    providerSuggestion: { tableId: string; tableName: string; reason: string } | null;
  } | null>(null);

  const [editStartKm, setEditStartKm] = useState('');
  const [editEndKm, setEditEndKm] = useState('');
  const [provEditStartKm, setProvEditStartKm] = useState('');
  const [provEditEndKm, setProvEditEndKm] = useState('');
  const [provEditStartTime, setProvEditStartTime] = useState('');
  const [provEditEndTime, setProvEditEndTime] = useState('');
  const [isEditingProvOpsData, setIsEditingProvOpsData] = useState(false);
  const [showRecalcProviderDialog, setShowRecalcProviderDialog] = useState(false);
  const [revenueEditReason, setRevenueEditReason] = useState('');
  const [costEditReason, setCostEditReason] = useState('');
  const [showRevenueReasonInput, setShowRevenueReasonInput] = useState(false);
  const [showCostReasonInput, setShowCostReasonInput] = useState(false);
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [isEditingOpsData, setIsEditingOpsData] = useState(false);
  const [editOrigin, setEditOrigin] = useState('');
  const { isLoaded: isMapsLoaded } = useLoadScript(googleMapsLoadConfig);

  /** Calcula KM rodoviário origem→destino (Directions no browser ou /api/distance-matrix no servidor). */
  const fetchRouteDistanceKm = async (originRaw: string, destinationRaw: string): Promise<number | null> => {
    const origin = String(originRaw || '').trim();
    const destination = String(destinationRaw || '').trim();
    if (!origin || !destination) return null;

    if (isMapsLoaded && (window as any).google?.maps) {
      try {
        const ds = new (window as any).google.maps.DirectionsService();
        const result: any = await new Promise((resolve, reject) => {
          ds.route({
            origin: origin + ', Brasil',
            destination: destination + ', Brasil',
            travelMode: (window as any).google.maps.TravelMode.DRIVING,
            unitSystem: (window as any).google.maps.UnitSystem.METRIC,
            region: 'br',
          }, (res: any, status: string) => {
            if (status === 'OK') resolve(res);
            else reject(new Error('Directions status: ' + status));
          });
        });
        const legs = result?.routes?.[0]?.legs || [];
        const totalMeters = legs.reduce((acc: number, l: any) => acc + (l?.distance?.value || 0), 0);
        if (totalMeters > 0) {
          return Math.round((totalMeters / 1000) * 100) / 100;
        }
      } catch (geoErr) {
        console.warn('[RouteDistance] Directions no browser falhou:', geoErr);
      }
    }

    try {
      const res = await authFetch(`/api/distance-matrix?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`);
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (json?.success && Number(json.distanceKm) > 0) {
        return Number(json.distanceKm);
      }
      console.warn('[RouteDistance] API retornou:', json?.error || res.status);
    } catch (apiErr) {
      console.warn('[RouteDistance] fallback /api/distance-matrix falhou:', apiErr);
    }
    return null;
  };
  const originAutocompleteRef = useRef<any>(null);
  const destinationAutocompleteRef = useRef<any>(null);
  const [editDestination, setEditDestination] = useState('');
  const [isEditingRoute, setIsEditingRoute] = useState(false);
  const [isSavingRoute, setIsSavingRoute] = useState(false);
  // KM manual: permite sobrescrever o valor "banded" (100/200/300...) vindo da
  // criação da OS. Quando preenchido, o save usa este valor em vez de recalcular
  // pela Directions API.
  const [editKmManual, setEditKmManual] = useState('');
  const [disableKmAutoCalc, setDisableKmAutoCalc] = useState(false);
  // Desliga o CAP de distância das regras fixas (200KM/100KM/ACOMPANHAMENTO e
  // tabela de franquia fixa) para reconhecer o KM CHEIO rodado e cobrar o
  // excedente nas tabelas aplicadas. NÃO troca a tabela soberana; só remove o
  // teto de distância. Persiste por OS no BillingAdjustment (entity_id).
  const [disableFixedKmRule, setDisableFixedKmRule] = useState(false);

  const userRoleLower = useMemo(() => {
    try { return (JSON.parse(localStorage.getItem('userData') || '{}').role || '').toLowerCase(); } catch { return ''; }
  }, []);
  const userNameLower = useMemo(() => {
    try { const u = JSON.parse(localStorage.getItem('userData') || '{}'); return ((u.name || u.username || '') as string).toLowerCase(); } catch { return ''; }
  }, []);
  // Financeiro (Bárbara): liberação permanente para editar e aprovar faturamento,
  // inclusive OS verificadas pelo Controller ou já salvas/aprovadas.
  const isBarbaraFinance = useMemo(() => {
    return userNameLower.includes('barbara') || userNameLower.includes('bárbara');
  }, [userNameLower]);
  const canEditVerifiedProviderTotal = isBarbaraFinance
    || ['diretoria', 'administrador', 'ceo', 'controller'].includes(userRoleLower);
  const isControllerRole = userRoleLower === 'controller';
  const isProviderTotalLockedByController = !!(mission?.verified_by && mission?.verified_at && !canEditVerifiedProviderTotal);
  // MODO EDIÇÃO TOTAL: Barbara e Thiago podem destravar TODOS os campos da OS
  // (operacional, cliente, fornecedor, financeiro), inclusive em OS aprovadas.
  // O acionamento é registrado em system_logs (MissionEditHistory).
  const canActivateFullEdit = useMemo(() => {
    return userRoleLower === 'administrador' || userRoleLower === 'diretoria'
      || userNameLower.includes('barbara') || userNameLower.includes('bárbara') || userNameLower.includes('thiago')
      || userNameLower.includes('simone')
      || userNameLower.includes('plinio') || userNameLower.includes('plínio');
  }, [userRoleLower, userNameLower]);
  // OS 5046: libera a troca da TABELA DE CUSTO mesmo com o Motor Automático ativo
  // para os responsáveis pela auditoria (Thiago Moreira, Simone, Barbara) e
  // diretoria/admin. Ao selecionar uma tabela, o motor é desligado para esta
  // missão (ver autoEngineActive em lib/financialUtils.ts) e o valor da tabela
  // escolhida passa a valer. Usa "thiago moreira" (não só "thiago") para não
  // pegar o comercial Thiago Arruda.
  const canOverrideAutoProvider = useMemo(() => {
    return userRoleLower === 'administrador' || userRoleLower === 'diretoria' || userRoleLower === 'controller'
      || userNameLower.includes('barbara') || userNameLower.includes('bárbara')
      || userNameLower.includes('thiago moreira')
      || userNameLower.includes('simone');
  }, [userRoleLower, userNameLower]);
  // Auditoria (mesma equipe: Thiago Moreira, Simone, Barbara + diretoria/admin)
  // pode ABRIR para edição a TABELA DE PREÇO (cliente) e a TABELA DE CUSTO
  // (fornecedor) mesmo depois do faturamento SALVO ou APROVADO, sem precisar
  // ligar a EDIÇÃO TOTAL. Isso apenas destrava o campo; NÃO recalcula nem
  // sobrescreve valores por conta própria (os snapshots de OS aprovadas seguem
  // protegidos no fluxo de salvar/aprovar).
  const canEditTablesEvenIfLocked = canOverrideAutoProvider;
  const [fullEditMode, setFullEditMode] = useState(false);
  // isController: identifica o cargo Controller para travas de edição.
  // Quando EDIÇÃO TOTAL está ligada, o gate de Controller é suspenso para
  // que TODOS os campos (cliente, pedágio, etc.) fiquem editáveis.
  const isController = userRoleLower === 'controller' && !fullEditMode && !isBarbaraFinance;

  const canEditOpsData = useMemo(() => {
    if (fullEditMode) return true;
    if (isBarbaraFinance) return true;
    try {
      const u = JSON.parse(localStorage.getItem('userData') || '{}');
      if (userNameLower.includes('plinio') || userNameLower.includes('plínio')) return true;
      return ['diretoria', 'administrador', 'avançado', 'avancado', 'controller'].includes(userRoleLower) || u.permissions?.includes('*');
    } catch { return false; }
  }, [userRoleLower, userNameLower, fullEditMode, isBarbaraFinance]);
  const canEditEndTimeOnly = useMemo(() => {
    return canEditOpsData || ['operacional', 'operador'].includes(userRoleLower) || fullEditMode;
  }, [canEditOpsData, userRoleLower, fullEditMode]);
  const canEditClientData = (canEditOpsData && !isController) || fullEditMode;
  // Controller pode ajustar o valor total do fornecedor mesmo após verificação.
  const canEditProviderCostTotal = canEditOpsData && (fullEditMode || !isProviderTotalLockedByController || isControllerRole);

  // TRAVA PÓS-SALVAMENTO: assim que alguém salva ou aprova um faturamento,
  // todos os campos editáveis são bloqueados em todas as telas. Diretoria,
  // administrador e CEO podem destravar manualmente para corrigir algo.
  const isBillingLocked = !!(mission?.billing_verified_by || mission?.billing_approved || mission?.snapshot_approved_by);
  const isPlinio = userNameLower.includes('plinio') || userNameLower.includes('plínio');
  const canUnlockBilling = ['diretoria', 'administrador', 'ceo'].includes(userRoleLower) || isPlinio || isBarbaraFinance;
  // ADMINISTRADOR (ex: Barbara) tem liberação permanente: pode editar OS aprovada
  // a qualquer momento. O sistema registra cada alteração no histórico permanente.
  const isAdminFullAccess = userRoleLower === 'administrador' || fullEditMode || isPlinio || isBarbaraFinance;
  const isDirectorAccess = userRoleLower === 'diretoria' || userRoleLower === 'administrador';
  const [unlockOverride, setUnlockOverride] = useState(false);
  useEffect(() => { setUnlockOverride(false); setEditObservation(''); setFullEditMode(false); setTollConfirmAutoOpened(false); setDisableFixedKmRule(false); staleAutoResyncDoneRef.current = null; }, [mission?.id]);
  useEffect(() => { if (!isOpen) { setFullEditMode(false); setUnlockOverride(false); setEditObservation(''); setShowTollConfirmDialog(false); setTollConfirmAutoOpened(false); } }, [isOpen]);
  const isEffectivelyLocked = isBillingLocked && !unlockOverride && !isAdminFullAccess;
  const canEditOpsEvenIfLocked = isBarbaraFinance || !isEffectivelyLocked;
  // Task #143: o número grande (VALOR FINAL cliente/fornecedor) e o breakdown
  // da memória de cálculo devem ACOMPANHAR a tabela escolhida sempre que o
  // usuário tem permissão de trocar a tabela mesmo numa OS travada
  // (auditoria via canEditTablesEvenIfLocked, EDIÇÃO TOTAL ou override de
  // auto-fornecedor). Sem isso, o seletor de tabela ficava editável mas o
  // número grande continuava preso ao valor salvo — parecia que "trocou a
  // tabela e nada mudou". A recálculo acontece SÓ na tela (estado React);
  // nenhuma escrita no banco/snapshot é disparada por trocar a tabela numa OS
  // travada — a persistência continua exclusiva do fluxo de Salvar/Aprovar.
  const lockAllowsRecalc = !isEffectivelyLocked || canEditTablesEvenIfLocked || fullEditMode;

  // Confirmação obrigatória de pedágio: ao abrir o modal sem pedágio confirmado,
  // exige resposta explícita do operador (Sim com valor / Não, sem pedágio).
  // Não dispara para faturamentos já aprovados/travados nem para Controller.
  // Só é exigido quando a missão está Concluída ou Cancelada — em outros status
  // (Pendente, Em Andamento, etc.) o operador pode lançar pedágio à vontade
  // sem o bloqueio do diálogo.
  useEffect(() => {
    if (!isOpen || !mission || isController) return;
    if (isEffectivelyLocked) return;
    if (tollConfirmed || tollConfirmAutoOpened || showTollConfirmDialog) return;
    if (isCalculatingToll) return;
    const status = (mission.status || '').trim();
    const requiresToll = status === 'Concluída' || status === 'Cancelada';
    if (!requiresToll) return;
    const hasApprovedToll = !!mission.billing_approved && mission.toll_value != null;
    if (hasApprovedToll) return;
    const t = setTimeout(() => {
      setShowTollConfirmDialog(true);
      setTollConfirmAutoOpened(true);
    }, 600);
    return () => clearTimeout(t);
  }, [isOpen, mission?.id, mission?.status, tollConfirmed, tollConfirmAutoOpened, showTollConfirmDialog, isCalculatingToll, isController, isEffectivelyLocked, mission?.billing_approved, mission?.toll_value]);

  const applyTollConfirmation = async (result: { hasToll: boolean; value: number }) => {
    const v = result.hasToll ? result.value : 0;
    const formatted = v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const prevToll = parseNumber(tollInput);
    const prevTollProv = parseNumber(tollProviderInput);
    // Valor do pedágio do fornecedor: espelha o cliente quando ainda não havia
    // pedágio de fornecedor distinto; caso contrário preserva o valor existente.
    const newTollProv = (prevTollProv <= 0 || prevTollProv === prevToll) ? v : prevTollProv;

    // Persiste o pedágio direto na OS para que a confirmação fique salva
    // mesmo sem passar pelo fluxo de "Salvar Ajustes". toll_value e
    // toll_value_provider são aditivos (revenue_value/cost_value seguem
    // sendo apenas o serviço), então não tocamos receita/custo aqui.
    if (mission?.id) {
        const r2 = (n: number) => Math.round(n * 100) / 100;
        const isSameOs = mission.is_same_os === true;
        const payload: any = {
            toll_value: r2(v),
            toll_value_provider: isSameOs ? 0 : r2(newTollProv),
            last_update: new Date().toISOString(),
        };
        let { error } = await supabase.from('missions').update(payload).eq('id', mission.id);
        if (error && error.message?.includes('does not exist')) {
            const { toll_value_provider, ...minimal } = payload;
            ({ error } = await supabase.from('missions').update(minimal).eq('id', mission.id));
        }
        if (error) {
            console.error('[TollConfirm] falha ao salvar pedágio na OS', error);
            throw new Error(`Não foi possível salvar o pedágio na OS: ${error.message}`);
        }
        try { window.dispatchEvent(new Event('refreshMissions')); } catch {}
    }

    setTollInput(formatted);
    if (!isSameOs && (prevTollProv <= 0 || prevTollProv === prevToll)) {
        setTollProviderInput(formatted);
        const currentCost = parseNumber(costInput);
        const updatedCost = currentCost - prevTollProv + v;
        setCostInput(updatedCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    } else if (isSameOs) {
        setTollProviderInput('0,00');
        setCostInput('0,00');
    }
    const currentRev = parseNumber(revenueInput);
    const updatedRev = currentRev - prevToll + v;
    setRevenueInput(updatedRev.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setTollConfirmed(true);
    setTollSource(result.hasToll ? `CONFIRMADO (R$ ${formatted})` : 'CONFIRMADO SEM PEDÁGIO');
    setShowTollConfirmDialog(false);
  };

  

  const tollCalcMissionRef = React.useRef<string | null>(null);
  const modalContentRef = React.useRef<HTMLDivElement>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const captureModalScreenshot = async (stageName: string, userName: string): Promise<string | null> => {
    if (!mission) return null;
    const contentEl = modalContentRef.current;
    if (!contentEl) {
      console.warn('[Screenshot] modalContentRef não encontrado');
      return null;
    }
    try {
      setIsCapturing(true);
      await new Promise(r => setTimeout(r, 300));

      const originalScrollTop = contentEl.scrollTop;
      const originalOverflow = contentEl.style.overflow;
      const originalMaxH = contentEl.style.maxHeight;
      const originalH = contentEl.style.height;

      contentEl.scrollTop = 0;
      contentEl.style.overflow = 'visible';
      contentEl.style.maxHeight = 'none';
      contentEl.style.height = 'auto';

      await new Promise(r => setTimeout(r, 100));
      
      const canvas = await html2canvas(contentEl, {
        scale: 0.75,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#f9fafb',
        logging: false,
        windowWidth: contentEl.scrollWidth,
        windowHeight: contentEl.scrollHeight,
        ignoreElements: (el) => el.getAttribute('data-html2canvas-ignore') === 'true'
      });

      contentEl.style.overflow = originalOverflow;
      contentEl.style.maxHeight = originalMaxH;
      contentEl.style.height = originalH;
      contentEl.scrollTop = originalScrollTop;

      const maxWidth = 600;
      const maxHeight = 4000;
      let finalW = canvas.width;
      let finalH = canvas.height;
      if (finalW > maxWidth) {
        const r = maxWidth / finalW;
        finalW = maxWidth;
        finalH = Math.round(canvas.height * r);
      }
      if (finalH > maxHeight) {
        finalH = maxHeight;
      }
      
      const resizedCanvas = document.createElement('canvas');
      resizedCanvas.width = finalW;
      resizedCanvas.height = finalH;
      const ctx = resizedCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(canvas, 0, 0, finalW, finalH);
      }
      
      let base64 = resizedCanvas.toDataURL('image/jpeg', 0.45);

      const sizeKB = Math.round(base64.length * 0.75 / 1024);
      if (sizeKB > 800) {
        base64 = resizedCanvas.toDataURL('image/jpeg', 0.25);
      }
      
      const finalSizeKB = Math.round(base64.length * 0.75 / 1024);
      if (finalSizeKB > 2000) {
        console.warn(`[Screenshot] Imagem muito grande (${finalSizeKB}KB), salvando metadados sem print`);
        await supabase.from('system_logs').insert([{
          user_name: userName,
          action_type: 'APPROVAL_SCREENSHOT',
          entity: 'BillingApproval',
          entity_id: mission.id,
          details: JSON.stringify({
            stage: stageName,
            user: userName,
            date: new Date().toISOString(),
            missionId: mission.id,
            screenshot: null,
            error: `Imagem excedeu limite de tamanho (${finalSizeKB}KB)`
          })
        }]);
        return null;
      }

      const { error: insertError } = await supabase.from('system_logs').insert([{
        user_name: userName,
        action_type: 'APPROVAL_SCREENSHOT',
        entity: 'BillingApproval',
        entity_id: mission.id,
        details: JSON.stringify({
          stage: stageName,
          user: userName,
          date: new Date().toISOString(),
          missionId: mission.id,
          screenshot: base64,
          sizeKB: finalSizeKB
        })
      }]);
      
      if (insertError) {
        console.error('[Screenshot] Erro ao salvar no banco:', insertError);
        showNotification('Atenção', `Print de aprovação não foi salvo: ${insertError.message}`, 'error');
        return null;
      }
      
      console.log(`[Screenshot] Captura salva com sucesso (${finalSizeKB}KB) - ${stageName}`);
      return base64;
    } catch (e: any) {
      console.error('[Screenshot] Erro ao capturar:', e);
      showNotification('Atenção', 'Não foi possível capturar o print de aprovação. Os dados financeiros foram salvos normalmente.', 'error');
      try {
        await supabase.from('system_logs').insert([{
          user_name: userName,
          action_type: 'APPROVAL_SCREENSHOT',
          entity: 'BillingApproval',
          entity_id: mission.id,
          details: JSON.stringify({
            stage: stageName,
            user: userName,
            date: new Date().toISOString(),
            missionId: mission.id,
            screenshot: null,
            error: e?.message || 'Falha na captura'
          })
        }]);
      } catch {}
      return null;
    } finally {
      setIsCapturing(false);
    }
  };
  
  const autoCalculateToll = async (origin: string, destination: string, missionId?: string) => {
    setTollInput('0,00');
    setTollProviderInput('0,00');
    setSuggestedToll(0);
    setTollSource('INSERIR MANUAL');
    setTollConfirmed(false);
    setIsCalculatingToll(false);
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000); 
    return () => clearInterval(timer);
  }, []);

  // Task #111: carrega correções DHL recentes (últimos 90 dias) e popula
  // o cache do dhlAutoTableSelector para que selectDhlClientTable possa
  // priorizar a tabela escolhida pelo auditor em missões parecidas.
  useEffect(() => {
    if (!isOpen) return;
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
    supabase
      .from('system_logs')
      .select('id, details, created_at, user_name, entity_id')
      .eq('entity', 'DhlTableCorrection')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (error) {
          console.warn('[DHL Memória] Falha ao carregar correções:', error.message);
          return;
        }
        const records: DhlCorrectionRecord[] = [];
        for (const row of (data || []) as any[]) {
          try {
            const d = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
            if (!d || !d.chosenTableId) continue;
            records.push({
              region: String(d.region || ''),
              band: Number(d.band || 0),
              originCity: String(d.originCity || ''),
              destCity: String(d.destCity || ''),
              chosenTableId: String(d.chosenTableId),
              createdAt: row.created_at || new Date().toISOString(),
              logId: row.id ?? null,
              // Task #116: preserva OS de origem e auditor que aplicou a correção.
              missionId: d.missionId ? String(d.missionId) : (row.entity_id ? String(row.entity_id) : null),
              userName: row.user_name ? String(row.user_name) : null,
            });
          } catch { /* ignore */ }
        }
        setDhlCorrections(records);
        setDhlCorrectionsCache(records);
      });
  }, [isOpen]);

  // Busca Inteligente de Padrões (Memória Evolutiva)
  // BLINDAGEM: Pedágio NUNCA é herdado de outras missões (IDs diferentes).
  // Se a missão atual tem toll_value salvo no banco, usa esse valor.
  // Se não tem, busca via API ou histórico automaticamente.
  const fetchHistoricalPatterns = async (currentMission: Mission, allProviderTables?: ProviderCostTable[]) => {
      if (!currentMission.client || !currentMission.origin || isSavingRef.current) return;
      try {
          const dbToll = Math.max(0, currentMission.toll_value ?? 0);
          // Pedágio do FORNECEDOR vem ESTRITAMENTE de toll_value_provider; se nulo, é 0.
          // NUNCA herda dbToll (pedágio do cliente) — isso gerava o "pedágio fantasma"
          // que inflava o custo do fornecedor ao reabrir a auditoria.
          const dbTollProv = Math.max(0, currentMission.toll_value_provider != null ? currentMission.toll_value_provider : 0);
          const hasRevenue = currentMission.revenue_value != null && currentMission.revenue_value > 0;
          const hasCost = currentMission.cost_value != null && currentMission.cost_value > 0;
          const hasVerifiedBy = !!currentMission.billing_verified_by;
          const hasApproved = !!currentMission.billing_approved;
          const hasSavedData = hasRevenue || hasCost || hasVerifiedBy || hasApproved;
          if (currentMission.billing_approved && currentMission.toll_value !== null && currentMission.toll_value !== undefined) {
             setSuggestedToll(dbToll);
             setTollSource(dbToll === 0 ? 'APROVADO (R$ 0,00)' : 'VALOR APROVADO');
             setTollInput(dbToll.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
             setTollProviderInput(dbTollProv.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
             setTollConfirmed(true);
          } else if (dbToll > 0 || hasSavedData) {
             setSuggestedToll(dbToll);
             setTollSource(dbToll === 0 ? 'VALOR SALVO (R$ 0,00)' : 'VALOR SALVO');
             setTollInput(dbToll.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
             setTollProviderInput(dbTollProv.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
             // Não marca como confirmado automaticamente: a confirmação explícita
             // (TOLL_CONFIRMATION em system_logs) é carregada em useEffect próprio.
          } else {
             setSuggestedToll(0);
             setTollInput('0,00');
             setTollProviderInput('0,00');
             setTollConfirmed(false);
             setTollSource('CALCULANDO...');
             autoCalculateToll(currentMission.origin, currentMission.destination, currentMission.id);
          }

          setAiMaturity(0);

          if (hasSavedData || currentMission.billing_approved) {
              return;
          }

          const providerNorm = (currentMission.provider || '').toUpperCase().trim();
          const routeKeyFull = `${currentMission.client}|${providerNorm}|${currentMission.origin}|${currentMission.destination}`.toUpperCase();
          const routeKeyBase = `${currentMission.client}|${currentMission.origin}|${currentMission.destination}`.toUpperCase();

          const { data: memLogsFull } = await supabase
            .from('system_logs')
            .select('details')
            .eq('entity', 'BillingPattern')
            .ilike('details', `%${routeKeyFull}%`)
            .order('created_at', { ascending: false })
            .limit(1);

          let memLogs = memLogsFull;
          let memorySource = 'EXATA';
          if (!memLogs || memLogs.length === 0) {
              const { data: memLogsFallback } = await supabase
                .from('system_logs')
                .select('details')
                .eq('entity', 'BillingPattern')
                .ilike('details', `%${routeKeyBase}%`)
                .order('created_at', { ascending: false })
                .limit(1);
              memLogs = memLogsFallback;
              memorySource = 'ROTA';
          }

          if (memLogs && memLogs.length > 0) {
             try {
                 const details = JSON.parse(memLogs[0].details);
                 if (details.clientTableId) {
                     const memClientTable = clientTables.find(t => t.id.toString() === details.clientTableId);
                     const originUF = extractUF(currentMission.origin || '');
                     const originRegion = (UF_TO_REGION[originUF] || '').toUpperCase();
                     const tableOp = (memClientTable?.operation_type || '').toUpperCase();
                     const tableRegions = ['SUDESTE', 'SUL', 'CENTRO-OESTE', 'NORDESTE', 'NORTE'];
                     const tableRegion = tableRegions.find(r => tableOp.includes(r)) || '';
                     const regionCompatible = !tableRegion || !originRegion || tableRegion === originRegion;
                     if (regionCompatible) {
                         setManualClientTableId(details.clientTableId);
                     }
                 }
                 if (details.providerTableId) {
                     const tablesToCheck = allProviderTables || providerTables;
                     const memProvTable = tablesToCheck.find(t => t.id === details.providerTableId);
                     const memProvNorm = (memProvTable?.provider || '').toUpperCase().trim();
                     if (memProvTable && memProvNorm === providerNorm) {
                         setManualProviderTableId(details.providerTableId);
                     }
                 }
                 if (details.customClientBase) setCustomClientBase(details.customClientBase);
                 if (details.customClientKm) setCustomClientKm(details.customClientKm);
                 if (details.customClientHour) setCustomClientHour(details.customClientHour);
                 if (details.customProviderBase) setCustomProviderBase(details.customProviderBase);
                 if (details.customProviderKm) setCustomProviderKm(details.customProviderKm);
                 if (details.customProviderHour) setCustomProviderHour(details.customProviderHour);
                 // BLINDAGEM: Pedágio NUNCA mais é herdado de outras OS via memória.
                 // O usuário deve confirmar manualmente o pedágio em cada OS.
                 // Histórico continua disponível apenas como consulta (não aplicado).
                 setMemoryLoaded(true);
                 const hasCustomValues = details.customClientBase || details.customProviderBase;
                 const extraInfo = hasCustomValues ? ' (valores ajustados)' : '';
                 showNotification('Memória Evolutiva', `Tabela${extraInfo} aplicada (${memorySource === 'EXATA' ? 'mesmo fornecedor' : 'mesma rota'}). Pedágio precisa ser confirmado manualmente.`, 'success');
             } catch (e) { console.error("Erro ao ler memória:", e); }
          }
          
      } catch (e) { console.error("Erro na IA de Padrões:", e); }
  };

  const loadData = async () => {
      if (!initialMission?.id || isSavingRef.current) return;
      userManuallyEditedRef.current = false;
      dbValuesLoadedRef.current = false;
      staleAutoResyncDoneRef.current = null;
      setUseSavedValues(false);
      setIsLoading(true);
      // Reseta apelidos do fornecedor para evitar carry-over de uma OS
      // anterior caso a busca atual não encontre nenhum match.
      setProvidersList([]);
      setProviderAliases([]);
      try {
          const clientName = initialMission.originalClientName || initialMission.client;
          const ctShort = clientNameShort(clientName);
          const providerName = (initialMission.provider || '').trim();
          // Resolve apelidos do fornecedor (razão social x nome fantasia)
          // ANTES de buscar tabelas de custo, para que cadastros sob qualquer
          // dos dois nomes apareçam (ex: tabela cadastrada como CENTURIÃO
          // sendo usada por OS que referencia ARMADA REAL).
          let aliasesForQuery: string[] = [];
          if (providerName) {
              const firstToken = providerName.split(/[\s,.\-\/]+/).find((w: string) => w.length > 2) || providerName;
              const { data: provMatches } = await supabase
                  .from('providers')
                  .select('id, name, trading_name')
                  .or(`name.ilike.%${firstToken}%,trading_name.ilike.%${firstToken}%`);
              if (provMatches && provMatches.length > 0) {
                  const normAlias = (s: string) => (s || '')
                      .toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                      .replace(/[.,\/&\-]/g, ' ').replace(/\s+/g, ' ').trim();
                  const target = normAlias(providerName);
                  // Filtra apenas o fornecedor cuja razão social OU nome fantasia
                  // bate exatamente com o nome usado na OS, e coleta seus dois apelidos.
                  const exact = provMatches.find((p: any) => normAlias(p.name) === target || normAlias(p.trading_name || '') === target);
                  const picks = exact ? [exact] : provMatches;
                  const set = new Set<string>();
                  for (const p of picks as any[]) {
                      if (p.name) set.add(p.name);
                      if (p.trading_name) set.add(p.trading_name);
                  }
                  aliasesForQuery = Array.from(set);
                  setProvidersList(picks as any);
                  setProviderAliases(Array.from(set).map(normAlias));
              }
          }
          // Monta a query de provider_cost_tables expandindo a busca para
          // todos os apelidos do fornecedor.
          let ptQuery = supabase.from('provider_cost_tables').select('*');
          if (aliasesForQuery.length > 0) {
              // Faz uma busca por OR de ilike em cada apelido (usa o primeiro
              // token de cada para tolerar variações). Vírgulas em valores
              // quebram .or() — então tokenizamos.
              const tokens = aliasesForQuery
                  .map(a => a.split(/[\s,.\-\/]+/).find((w: string) => w.length > 2) || a)
                  .filter((v, i, arr) => arr.indexOf(v) === i);
              const orExpr = tokens.map(t => `provider.ilike.%${t}%`).join(',');
              if (orExpr) ptQuery = ptQuery.or(orExpr);
          } else if (providerName) {
              const firstToken = providerName.split(/[\s,.\-\/]+/).find((w: string) => w.length > 2) || providerName;
              ptQuery = ptQuery.ilike('provider', `%${firstToken}%`);
          }
          const [mRes, ctRes, ptRes, clRes] = await Promise.all([
              supabase.from('missions').select('*').eq('id', initialMission.id).single(),
              fetchClientPriceTables(supabase, clientName).then((rows) => ({ data: rows, error: null })).catch((e: any) => ({ data: null, error: e })),
              ptQuery,
              supabase.from('clients').select('*').ilike('name', `%${ctShort}%`).single()
          ]);
          if (clRes.data) {
              setClientData(clRes.data as Client);
          } else if (clientName) {
              const { data: fuzzy } = await supabase.from('clients').select('*').ilike('name', `%${clientName.split(' ')[0]}%`).limit(1).single();
              if (fuzzy) setClientData(fuzzy as Client);
          }
          
          if (mRes.data) {
              const d = mRes.data;
              // Corrige legado: filha Mesma OS não pode ter custo de fornecedor salvo.
              if (d.is_same_os) {
                  const legacyCost = safeNumber(d.cost_value);
                  const legacyTollProv = safeNumber(d.toll_value_provider);
                  const legacyDispProv = safeNumber(d.displacement_value_provider);
                  if (legacyCost > 0 || legacyTollProv > 0 || legacyDispProv > 0) {
                      const fixed = await zeroSameOsProviderCostInDb(d.id);
                      if (fixed) {
                          d.cost_value = 0;
                          d.toll_value_provider = 0;
                          d.displacement_value_provider = 0;
                          broadcastMissionRefresh();
                      }
                  }
              }
              // OS CANCELADA: busca o horário do cancelamento (mission_history)
              // para o motor cobrar as horas extras quando cancelada DEPOIS da
              // franquia. Sem isso, o motor trata como "cancelada antes" e zera
              // KM e horas, cobrando apenas a base (acionamento mínimo).
              let cancelStatusAt: string | null = (initialMission as any)._cancelStatusAt || null;
              if (d.status === 'Cancelada' && !cancelStatusAt) {
                  try {
                      const { data: histRows } = await supabase
                          .from('mission_history')
                          .select('changed_at, new_value')
                          .eq('mission_id', d.id)
                          .eq('field_name', 'status')
                          .order('changed_at', { ascending: true });
                      for (const h of (histRows || []) as any[]) {
                          if ((h.new_value || '').toString().toLowerCase().includes('cancel')) cancelStatusAt = h.changed_at;
                      }
                  } catch {}
              }

              let loadedRevReason = mRes.data.revenue_edit_reason || '';
              let loadedCostReason = mRes.data.cost_edit_reason || '';
              if (!loadedRevReason && !loadedCostReason) {
                  const { data: reasonLog } = await supabase.from('system_logs')
                      .select('details')
                      .eq('entity', 'Mission')
                      .eq('entity_id', initialMission.id)
                      .eq('action_type', 'VALUE_EDIT_REASON')
                      .order('created_at', { ascending: false })
                      .limit(1)
                      .single();
                  if (reasonLog?.details) {
                      try {
                          const parsed = typeof reasonLog.details === 'string' ? JSON.parse(reasonLog.details) : reasonLog.details;
                          if (parsed.revenue_edit_reason) loadedRevReason = parsed.revenue_edit_reason;
                          if (parsed.cost_edit_reason) loadedCostReason = parsed.cost_edit_reason;
                      } catch {}
                  }
              }

              const fullMission = {
                  ...initialMission,
                  ...d,
                  _cancelStatusAt: cancelStatusAt,
                  startKm: d.start_km ?? initialMission.startKm,
                  endKm: d.end_km ?? initialMission.endKm,
                  startTime: d.start_time ?? initialMission.startTime,
                  endTime: d.end_time ?? initialMission.endTime,
                  totalDistance: d.total_distance ?? initialMission.totalDistance,
                  revenue_edit_reason: loadedRevReason || d.revenue_edit_reason,
                  cost_edit_reason: loadedCostReason || d.cost_edit_reason,
              };
              setMission(fullMission);

              // Se origem/destino existem mas KM previsto está zerado, recalcula automaticamente.
              if (
                  !mRes.data.is_same_os
                  && mRes.data.status !== MissionStatus.CANCELLED
                  && mRes.data.origin
                  && mRes.data.destination
                  && safeNumber(mRes.data.total_distance) <= 0
              ) {
                  void (async () => {
                      const km = await fetchRouteDistanceKm(String(mRes.data.origin), String(mRes.data.destination));
                      if (km != null && km > 0) {
                          await supabase.from('missions').update({ total_distance: km, last_update: new Date().toISOString() }).eq('id', initialMission.id);
                          setMission((prev) => prev ? { ...prev, totalDistance: km, total_distance: km } : prev);
                          setMemoryLoaded(false);
                      }
                  })();
              }

              setEditStartKm(mRes.data.start_km ? String(mRes.data.start_km) : '');
              setEditEndKm(mRes.data.end_km ? String(mRes.data.end_km) : '');
              const st = mRes.data.start_time ? new Date(mRes.data.start_time) : null;
              const et = mRes.data.end_time ? new Date(mRes.data.end_time) : null;
              setEditStartTime(st ? `${st.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })}T${st.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', timeZone: 'America/Sao_Paulo' })}` : '');
              setEditEndTime(et ? `${et.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })}T${et.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', timeZone: 'America/Sao_Paulo' })}` : '');
              setIsEditingOpsData(false);

              let provOpsEdited = mRes.data.provider_ops_edited === true;
              let pStartKm = provOpsEdited && mRes.data.provider_start_km != null ? mRes.data.provider_start_km : mRes.data.start_km;
              let pEndKm = provOpsEdited && mRes.data.provider_end_km != null ? mRes.data.provider_end_km : mRes.data.end_km;
              let pStartTime: Date | null = provOpsEdited && mRes.data.provider_start_time ? new Date(mRes.data.provider_start_time) : st;
              let pEndTime: Date | null = provOpsEdited && mRes.data.provider_end_time ? new Date(mRes.data.provider_end_time) : et;

              if (!provOpsEdited) {
                  const { data: provOpsLog } = await supabase.from('system_logs')
                      .select('details')
                      .eq('entity', 'Mission')
                      .eq('entity_id', initialMission.id)
                      .eq('action_type', 'PROVIDER_OPS_UPDATE')
                      .order('created_at', { ascending: false })
                      .limit(1)
                      .single();
                  if (provOpsLog?.details) {
                      try {
                          const parsed = typeof provOpsLog.details === 'string' ? JSON.parse(provOpsLog.details) : provOpsLog.details;
                          if (parsed.provider_ops_edited) {
                              provOpsEdited = true;
                              if (parsed.provider_start_km != null) pStartKm = parsed.provider_start_km;
                              if (parsed.provider_end_km != null) pEndKm = parsed.provider_end_km;
                              if (parsed.provider_start_time) pStartTime = new Date(parsed.provider_start_time);
                              if (parsed.provider_end_time) pEndTime = new Date(parsed.provider_end_time);
                              fullMission.provider_ops_edited = true;
                              fullMission.provider_start_km = parsed.provider_start_km;
                              fullMission.provider_end_km = parsed.provider_end_km;
                              fullMission.provider_start_time = parsed.provider_start_time;
                              fullMission.provider_end_time = parsed.provider_end_time;
                              setMission(fullMission);
                          }
                      } catch {}
                  }
              }

              setProvEditStartKm(pStartKm ? String(pStartKm) : '');
              setProvEditEndKm(pEndKm ? String(pEndKm) : '');
              setProvEditStartTime(pStartTime ? `${pStartTime.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })}T${pStartTime.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', timeZone: 'America/Sao_Paulo' })}` : '');
              setProvEditEndTime(pEndTime ? `${pEndTime.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })}T${pEndTime.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', timeZone: 'America/Sao_Paulo' })}` : '');
              setIsEditingProvOpsData(false);

              setRevenueEditReason(loadedRevReason);
              setCostEditReason(loadedCostReason);
              setShowRevenueReasonInput(false);
              setShowCostReasonInput(false);

              const dbToll = Math.max(0, mRes.data.toll_value || 0);
              // Pedágio do FORNECEDOR vem ESTRITAMENTE de toll_value_provider; se nulo, é 0.
              // NUNCA herda dbToll (pedágio do cliente) — era o "pedágio fantasma" que
              // inflava o custo do fornecedor (savedCost + dbTollProvider) ao abrir a OS.
              const dbTollProvider = Math.max(0, mRes.data.toll_value_provider != null ? mRes.data.toll_value_provider : 0);
              const dbDisp = Math.max(0, mRes.data.displacement_value || 0);
              const dbDispProvider = Math.max(0, mRes.data.displacement_value_provider || 0);
              setDisplacementInput(dbDisp.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
              setDisplacementProviderInput((mRes.data.is_same_os ? 0 : dbDispProvider).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
              dhlDeslocKmRef.current = Math.max(0, Number((mRes.data as any).dhl_deslocamento_km) || 0);
              dhlDeslocAutoAppliedRef.current = false;
              setDhlDeslocInfo(null);
              const savedRev = safeNumber(mRes.data.revenue_value);
              const savedCost = safeNumber(mRes.data.cost_value);
              const hasSavedData = mRes.data.billing_approved || mRes.data.billing_verified_by || savedRev > 0 || savedCost > 0;
              if (mRes.data.is_same_os) {
                  setTollInput(dbToll.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
                  setTollProviderInput('0,00');
                  setTollSource(dbToll === 0 ? 'MESMA OS (R$ 0,00) — confirmar' : 'MESMA OS — confirmar');
              } else if (mRes.data.billing_approved) {
                  setTollInput(dbToll.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
                  setTollProviderInput(dbTollProvider.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
                  setTollConfirmed(true);
                  setTollSource(dbToll === 0 ? 'APROVADO (R$ 0,00)' : 'VALOR APROVADO');
              } else if (hasSavedData || dbToll > 0) {
                  setTollInput(dbToll.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
                  setTollProviderInput(dbTollProvider.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
                  // Não marca confirmado automaticamente: depende de TOLL_CONFIRMATION
                  // explícito em system_logs (carregado abaixo) ou nova confirmação via dialog.
                  setTollSource(dbToll === 0 ? 'VALOR SALVO (R$ 0,00) — confirmação pendente' : 'VALOR SALVO — confirmação pendente');
              } else {
                  setTollInput('0,00');
                  setTollProviderInput('0,00');
                  setTollConfirmed(false);
                  setTollSource('CALCULANDO...');
                  autoCalculateToll(fullMission.origin, fullMission.destination, fullMission.id);
              }

              const isVendorVerified = !!(mRes.data.verified_by && mRes.data.verified_at);

              const intentionalRevOverride = isIntentionalBillingOverride(loadedRevReason);
              const intentionalCostOverride = isIntentionalBillingOverride(loadedCostReason);
              if (intentionalRevOverride || intentionalCostOverride) {
                  userManuallyEditedRef.current = true;
                  setUseSavedValues(true);
              }
              if (hasSavedData) {
                  const isSameOsMission = mRes.data.is_same_os === true;
                  const hasSeparateTollProvider = mRes.data.toll_value_provider != null;
                  if (!isSameOsMission && !hasSeparateTollProvider && savedCost > 0) {
                      setTollEmbeddedInCost(true);
                  }
                  const hasVerifiedOrApproved = !!(mRes.data.billing_verified_by || mRes.data.billing_approved);
                  if (savedRev > 0 || (savedRev === 0 && hasVerifiedOrApproved)) {
                      const revTotal = savedRev + dbToll + dbDisp;
                      setRevenueInput(revTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                  }
                  if (isSameOsMission) {
                      setCostInput('0,00');
                  } else if (savedCost > 0 || (savedCost === 0 && hasVerifiedOrApproved)) {
                      const costTotal = savedCost + dbTollProvider + dbDispProvider;
                      setCostInput(costTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                  }
                  dbValuesLoadedRef.current = true;
              }
              if (mRes.data.billing_verified_by) {
                  setSavedByInfo(`Salvo por ${mRes.data.billing_verified_by}`);
                  dbValuesLoadedRef.current = true;
              }
              
              fetchHistoricalPatterns(fullMission, (ptRes.data || []) as ProviderCostTable[]);

              const [approvalRes, adjustmentRes, editHistRes, tollConfRes] = await Promise.all([
                  supabase.from('system_logs').select('*').eq('entity', 'BillingApproval').eq('entity_id', initialMission.id).order('created_at', { ascending: true }),
                  supabase.from('system_logs').select('*').eq('entity', 'BillingAdjustment').eq('entity_id', initialMission.id).order('created_at', { ascending: false }).limit(1),
                  supabase.from('system_logs').select('*').eq('entity', 'MissionEditHistory').eq('entity_id', initialMission.id).order('created_at', { ascending: false }),
                  supabase.from('system_logs').select('details, created_at, user_name').eq('entity', 'MissionTollConfirmation').eq('entity_id', initialMission.id).order('created_at', { ascending: false }).limit(1)
              ]);

              // Task #45: confirmação explícita de pedágio é restaurada apenas
              // se houver TOLL_CONFIRMATION em system_logs casando com o valor
              // atual da OS. Mudança de toll_value invalida a confirmação
              // antiga e força nova resposta Sim/Não no dialog.
              if (!mRes.data.billing_approved && !mRes.data.is_same_os) {
                  const tollLog = tollConfRes.data && tollConfRes.data[0];
                  if (tollLog) {
                      try {
                          const parsed = typeof tollLog.details === 'string' ? JSON.parse(tollLog.details) : tollLog.details;
                          const loggedValue = Number(parsed?.value ?? 0);
                          const dbValue = Number(mRes.data.toll_value ?? 0);
                          if (Math.abs(loggedValue - dbValue) < 0.01) {
                              setTollConfirmed(true);
                              setTollSource(`CONFIRMADO por ${tollLog.user_name || parsed?.user || 'usuário'}`);
                          }
                      } catch {}
                  }
              }

              if (editHistRes.data && editHistRes.data.length > 0) {
                  const hist = editHistRes.data.map((l: any) => {
                      try {
                          const p = JSON.parse(l.details);
                          return {
                              user: l.user_name || p.user || '',
                              date: p.date || l.created_at,
                              changes: Array.isArray(p.changes) ? p.changes : [],
                              note: p.note || ''
                          };
                      } catch {
                          return { user: l.user_name || '', date: l.created_at, changes: [], note: '' };
                      }
                  });
                  setEditHistory(hist);
              } else {
                  setEditHistory([]);
              }

              const logData = approvalRes.data;
              if (logData && logData.length > 0) {
                  setApprovalLog(logData.map((l: any) => {
                      try { return JSON.parse(l.details); } catch { return { user: l.user_name, role: '', stage: l.action_type, date: l.created_at }; }
                  }));
              }

              if (adjustmentRes.data && adjustmentRes.data.length > 0) {
                  const adj = adjustmentRes.data[0];
                  try {
                      const details = JSON.parse(adj.details);
                      if (details.clientTableId) {
                          const adjClientTable = (ctRes.data || []).find((t: any) => t.id.toString() === details.clientTableId);
                          const adjTableOp = (adjClientTable?.operation_type || '').toUpperCase();
                          const adjOriginUF = extractUF(fullMission.origin || '');
                          const adjOriginRegion = (UF_TO_REGION[adjOriginUF] || '').toUpperCase();
                          const adjTableRegions = ['SUDESTE', 'SUL', 'CENTRO-OESTE', 'NORDESTE', 'NORTE'];
                          const adjTableRegion = adjTableRegions.find(r => adjTableOp.includes(r)) || '';
                          if (!adjTableRegion || !adjOriginRegion || adjTableRegion === adjOriginRegion) {
                              setManualClientTableId(details.clientTableId);
                          }
                      }
                      if (details.providerTableId && !String(details.providerTableId).startsWith('auto-')) setManualProviderTableId(details.providerTableId);
                      if (details.customClientBase) setCustomClientBase(details.customClientBase);
                      if (details.customClientKm) setCustomClientKm(details.customClientKm);
                      if (details.customClientHour) setCustomClientHour(details.customClientHour);
                      if (details.customProviderBase) setCustomProviderBase(details.customProviderBase);
                      if (details.customProviderKm) setCustomProviderKm(details.customProviderKm);
                      if (details.customProviderHour) setCustomProviderHour(details.customProviderHour);
                      if (details.iblEnabled !== undefined) setIblEnabled(details.iblEnabled);
                      if (details.disableFixedKmRule !== undefined) setDisableFixedKmRule(!!details.disableFixedKmRule);

                      if (details.systemCalculatedCost != null) setSystemCalculatedCost(details.systemCalculatedCost);
                      if (details.systemCalculatedRevenue != null) setSystemCalculatedRevenue(details.systemCalculatedRevenue);
                      if (details.costTotal != null) setControllerSavedCost(details.costTotal);
                      if (details.revenueTotal != null) setControllerSavedRevenue(details.revenueTotal);

                      const dateStr = formatDateTimeBR(adj.created_at);
                      setSavedByInfo(`${adj.user_name} (${dateStr})`);
                      setControllerSaveInfo({ user: adj.user_name, date: dateStr });
                  } catch (e) { console.error('Erro ao restaurar ajustes:', e); }
              }
          }
          if (mRes.data) {
              const linkedQueries = [];
              linkedQueries.push(
                  supabase.from('missions')
                      .select('id,origin,destination,status,is_same_os,revenue_value,cost_value,start_time,parent_mission_id')
                      .eq('parent_mission_id', initialMission.id)
              );
              if (mRes.data.parent_mission_id) {
                  linkedQueries.push(
                      supabase.from('missions')
                          .select('id,origin,destination,status,is_same_os,revenue_value,cost_value,start_time,parent_mission_id')
                          .eq('id', mRes.data.parent_mission_id)
                  );
                  linkedQueries.push(
                      supabase.from('missions')
                          .select('id,origin,destination,status,is_same_os,revenue_value,cost_value,start_time,parent_mission_id')
                          .eq('parent_mission_id', mRes.data.parent_mission_id)
                          .neq('id', initialMission.id)
                  );
              }
              const linkedResults = await Promise.all(linkedQueries);
              const allLinked: any[] = [];
              const seenIds = new Set<string>();
              for (const r of linkedResults) {
                  for (const m of (r.data || [])) {
                      if (!seenIds.has(m.id)) {
                          seenIds.add(m.id);
                          allLinked.push(m);
                      }
                  }
              }
              setLinkedMissions(allLinked);
          }

          if (ctRes.data) setClientTables(ctRes.data as any);
          if (ptRes.data) setProviderTables(ptRes.data as any);
          
      } catch (e) { console.error(e); } finally { setIsLoading(false); }
  };

  const loadFinancialHistory = async () => {
      if (!mission?.id) return;
      setFinHistLoading(true);
      try {
          const params = new URLSearchParams();
          if (finHistStart) params.append('startDate', finHistStart);
          if (finHistEnd) params.append('endDate', finHistEnd);
          const qs = params.toString();
          const res = await authFetch(`/api/missions/${mission.id}/financial-history${qs ? `?${qs}` : ''}`);
          if (res.ok) {
              const json = await res.json();
              setFinHistory(json.items || []);
          } else {
              setFinHistory([]);
          }
      } catch (e) {
          console.error('[FinancialHistory] erro ao carregar:', e);
          setFinHistory([]);
      } finally {
          setFinHistLoading(false);
      }
  };

  useEffect(() => {
      if (finHistOpen && mission?.id) {
          loadFinancialHistory();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finHistOpen, mission?.id]);

  const handleNewCostTableSuccess = async (newTableId?: string) => {
      if (!mission) return;
      const provName = (mission.provider || '').trim();
      let ptRefreshQuery = supabase.from('provider_cost_tables').select('*');
      // Usa apelidos (razão social + nome fantasia) se já resolvidos, para
      // que tabelas cadastradas sob qualquer apelido sejam recarregadas.
      const refreshAliases: string[] = [];
      for (const p of providersList) {
          if (p.name) refreshAliases.push(p.name);
          if (p.trading_name) refreshAliases.push(p.trading_name);
      }
      if (refreshAliases.length > 0) {
          const tokens = refreshAliases
              .map(a => a.split(/[\s,.\-\/]+/).find((w: string) => w.length > 2) || a)
              .filter((v, i, arr) => arr.indexOf(v) === i);
          const orExpr = tokens.map(t => `provider.ilike.%${t}%`).join(',');
          if (orExpr) ptRefreshQuery = ptRefreshQuery.or(orExpr);
      } else if (provName) {
          const firstToken = provName.split(/[\s,.\-\/]+/).find((w: string) => w.length > 2) || provName;
          ptRefreshQuery = ptRefreshQuery.ilike('provider', `%${firstToken}%`);
      }
      const { data } = await ptRefreshQuery;
      if (data) {
          setProviderTables(data as any);
          setCustomProviderBase('');
          setCustomProviderKm('');
          setCustomProviderHour('');
          setUseSavedValues(false);
          if (newTableId) {
              setManualProviderTableId(newTableId);
          }
          showNotification('Atualizado', 'Tabela de custo atualizada. Valores recalculados.', 'success');
      }
      setIsAddCostModalOpen(false);
  };

  const handleSaveOpsData = async () => {
      if (!mission) return;
      if (isSnapshotFrozen) {
          const u = JSON.parse(localStorage.getItem('userData') || '{}');
          const uRole = (u.role || '').toLowerCase();
          const uName = (u.name || '').toLowerCase();
          const isPrivileged = uRole === 'administrador' || uRole === 'diretoria' || uName.includes('barbara') || uName.includes('bárbara') || uName.includes('thiago');
          if (!isPrivileged) {
              showNotification('Bloqueado', `Dados Congelados — Aprovado por ${mission.snapshot_approved_by}`, 'error');
              return;
          }
      }
      setIsUpdating(true);
      isSavingRef.current = true;
      try {
          const updatePayload: any = {};
          if (editStartKm) updatePayload.start_km = parseFloat(editStartKm) || null;
          if (editEndKm) updatePayload.end_km = parseFloat(editEndKm) || null;
          if (editStartTime) updatePayload.start_time = new Date(editStartTime).toISOString();
          if (editEndTime) updatePayload.end_time = new Date(editEndTime).toISOString();
          updatePayload.last_update = new Date().toISOString();
          updatePayload.updated_by = JSON.parse(localStorage.getItem('userData') || '{}').name;

          const hasEndKm = updatePayload.end_km && updatePayload.end_km > 0;
          const hasEndTime = updatePayload.end_time;
          const currentStatus = mission.status;
          const pendingStatuses = ['Pendente', 'Em Trânsito', 'Em trânsito', 'Na Origem'];
          if (hasEndKm && hasEndTime && pendingStatuses.includes(currentStatus)) {
              updatePayload.status = 'Concluída';
          }

          const { error, data: confirmedRow } = await supabase.from('missions').update(updatePayload).eq('id', mission.id).select('id, start_km, end_km, status, last_update').single();
          if (error) throw error;
          if (!confirmedRow) throw new Error('Falha na persistência: registro não retornado após UPDATE');

          await supabase.from('system_logs').insert([{
              user_name: updatePayload.updated_by || 'Usuário',
              action_type: 'OPS_UPDATE',
              entity: 'Mission',
              entity_id: mission.id,
              details: JSON.stringify({
                  start_km: updatePayload.start_km || null,
                  end_km: updatePayload.end_km || null,
                  start_time: updatePayload.start_time || null,
                  end_time: updatePayload.end_time || null,
                  status_changed: updatePayload.status ? `${currentStatus} → ${updatePayload.status}` : null
              })
          }]);

          const updated = { ...mission, ...updatePayload, startKm: updatePayload.start_km, endKm: updatePayload.end_km, startTime: updatePayload.start_time, endTime: updatePayload.end_time, lastUpdate: updatePayload.last_update, status: updatePayload.status || mission.status };
          setMission(updated);
          setIsEditingOpsData(false);
          if (!mission.provider_ops_edited) {
              setProvEditStartKm(updatePayload.start_km ? String(updatePayload.start_km) : provEditStartKm);
              setProvEditEndKm(updatePayload.end_km ? String(updatePayload.end_km) : provEditEndKm);
              setProvEditStartTime(updatePayload.start_time ? editStartTime : provEditStartTime);
              setProvEditEndTime(updatePayload.end_time ? editEndTime : provEditEndTime);
          }
          showNotification('Salvo', updatePayload.status === 'Concluída' ? 'Dados salvos e missão concluída automaticamente.' : 'Dados do cliente atualizados com sucesso.', 'success');
          if (onUpdate) onUpdate();
      } catch (e: any) {
          showNotification('Erro', e.message || 'Falha ao salvar dados operacionais.', 'error');
      } finally { setIsUpdating(false); isSavingRef.current = false; }
  };

  const handleSaveProvOpsData = async () => {
      if (!mission) return;
      if (isSnapshotFrozen) {
          const u = JSON.parse(localStorage.getItem('userData') || '{}');
          const uRole = (u.role || '').toLowerCase();
          const uName = (u.name || '').toLowerCase();
          const isPrivileged = uRole === 'administrador' || uRole === 'diretoria' || uRole === 'controller' || uName.includes('barbara') || uName.includes('bárbara') || uName.includes('thiago');
          if (!isPrivileged) {
              showNotification('Bloqueado', `Dados Congelados — Aprovado por ${mission.snapshot_approved_by}. Somente Financeiro ou Diretoria podem editar.`, 'error');
              return;
          }
      }
      setIsUpdating(true);
      isSavingRef.current = true;
      try {
          const userName = JSON.parse(localStorage.getItem('userData') || '{}').name || 'Usuário';
          const provData: any = {
              provider_start_km: provEditStartKm ? parseFloat(provEditStartKm) || null : null,
              provider_end_km: provEditEndKm ? parseFloat(provEditEndKm) || null : null,
              provider_start_time: provEditStartTime ? new Date(provEditStartTime).toISOString() : null,
              provider_end_time: provEditEndTime ? new Date(provEditEndTime).toISOString() : null
          };

          let columnsExist = true;
          const { error } = await supabase.from('missions').update({
              provider_start_km: provData.provider_start_km,
              provider_end_km: provData.provider_end_km,
              provider_start_time: provData.provider_start_time,
              provider_end_time: provData.provider_end_time,
              provider_ops_edited: true,
              last_update: new Date().toISOString(),
              updated_by: userName
          }).eq('id', mission.id);

          if (error && error.message?.includes('does not exist')) {
              columnsExist = false;
          } else if (error) {
              throw error;
          }

          await supabase.from('system_logs').insert([{
              user_name: userName,
              action_type: 'PROVIDER_OPS_UPDATE',
              entity: 'Mission',
              entity_id: mission.id,
              details: JSON.stringify({ ...provData, provider_ops_edited: true, columns_exist: columnsExist })
          }]);

          if (!columnsExist) {
              await supabase.from('missions').update({
                  last_update: new Date().toISOString(),
                  updated_by: userName
              }).eq('id', mission.id);
          }

          setMission({ ...mission, ...provData, provider_ops_edited: true });
          setIsEditingProvOpsData(false);
          setUseSavedValues(false);
          showNotification('Salvo', columnsExist 
              ? 'Dados do fornecedor atualizados com sucesso.' 
              : 'Dados do fornecedor registrados no log. Execute a migração SQL para persistência completa.',
              columnsExist ? 'success' : 'info');
          if (onUpdate) onUpdate();
      } catch (e: any) {
          showNotification('Erro', e.message || 'Falha ao salvar dados do fornecedor.', 'error');
      } finally { setIsUpdating(false); isSavingRef.current = false; }
  };

  useEffect(() => { if (isOpen) loadData(); }, [isOpen, initialMission?.id]);

  useRealtimeRefresh('missions', () => {
      if (isOpen && !isSavingRef.current) loadData();
  });

  useEffect(() => {
      const onRefresh = () => {
          if (isOpen && !isSavingRef.current) loadData();
      };
      window.addEventListener('refreshMissions', onRefresh);
      return () => window.removeEventListener('refreshMissions', onRefresh);
  }, [isOpen]);

  const providerOpsOverride = useMemo(() => {
      if (!mission?.provider_ops_edited) return undefined;
      const getKm = (val: any) => typeof val === 'number' ? val : parseFloat(String(val || '0').replace(',', '.'));
      const pStartKm = mission.provider_start_km != null ? getKm(mission.provider_start_km) : getKm(mission.startKm || (mission as any).start_km);
      const pEndKm = mission.provider_end_km != null ? getKm(mission.provider_end_km) : getKm(mission.endKm || (mission as any).end_km);
      const pHasValidKms = pStartKm > 0 && pEndKm > 0 && pEndKm >= pStartKm;
      const pDistanceKm = pHasValidKms ? (pEndKm - pStartKm) : safeNumber(mission.totalDistance);

      const pStartTime = mission.provider_start_time ? new Date(mission.provider_start_time) : (mission.startTime ? new Date(mission.startTime) : null);
      const pEndTime = mission.provider_end_time ? new Date(mission.provider_end_time) : (mission.endTime ? new Date(mission.endTime) : null);
      let pDurationHours = 0;
      if (pStartTime && pEndTime) {
          pDurationHours = Math.max(0, (pEndTime.getTime() - pStartTime.getTime()) / (1000 * 60 * 60));
      }
      return { distanceKm: pDistanceKm, durationHours: pDurationHours };
  }, [mission]);

  const financialData = useMemo(() => {
      if (!mission) return null;
      const currentToll = parseNumber(tollInput);
      const missionWithToll = { ...mission, toll_value: currentToll };

      return calculateMissionFinancials(missionWithToll, clientTables, providerTables, clientData, currentTime, {
          clientTableId: manualClientTableId || undefined,
          providerTableId: manualProviderTableId || undefined,
          forceIblFee: iblEnabled,
          customClientUnitKm: customClientKm ? parseNumber(customClientKm) : undefined,
          customClientUnitHour: customClientHour ? parseNumber(customClientHour) : undefined,
          customProviderUnitKm: customProviderKm ? parseNumber(customProviderKm) : undefined,
          customProviderUnitHour: customProviderHour ? parseNumber(customProviderHour) : undefined,
          customClientBase: customClientBase ? parseNumber(customClientBase) : undefined,
          customProviderBase: customProviderBase ? parseNumber(customProviderBase) : undefined,
          disableFixedKmRule: disableFixedKmRule || undefined,
          providerOpsOverride: providerOpsOverride
      }, providersList);
  }, [mission, clientTables, providerTables, clientData, manualClientTableId, manualProviderTableId, iblEnabled, tollInput, customProviderKm, customProviderHour, customClientKm, customClientHour, customClientBase, customProviderBase, disableFixedKmRule, providerOpsOverride, providersList]);

  // Task #111: registra a última sugestão emitida pelo motor DHL (quando
  // não há override manual) — usada para detectar quando o auditor troca
  // a tabela sugerida e gravar a correção em system_logs.
  // Movido para depois do `financialData` para evitar TDZ ("Cannot access
  // 'financialData' before initialization") quando o array de dependências
  // é avaliado durante o render.
  useEffect(() => {
    const log = financialData?.client?.detectionLog || '';
    const m = log.match(/^DHL Auto \[(exact_route|region_band|region_any_km|memory_route|memory_region|none)\]:/);
    if (!m || !mission) {
      dhlEngineSuggestionRef.current = null;
      return;
    }
    if (manualClientTableId) return; // sugestão original já foi substituída por override
    const matchLevel = m[1];
    const originUF = extractUF(mission.origin || '');
    const region = UF_TO_REGION[originUF] || '';
    const band = computeDhlBand(financialData?.realTraveledKm || 0);
    const normalizeCity = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
    dhlEngineSuggestionRef.current = {
      tableId: financialData?.client?.tableId ? String(financialData.client.tableId) : null,
      matchLevel,
      region,
      band,
      originCity: normalizeCity(extractCityFromAddress(mission.origin || '')),
      destCity: normalizeCity(extractCityFromAddress(mission.destination || '')),
      originUF,
    };
  }, [financialData?.client?.detectionLog, financialData?.client?.tableId, financialData?.realTraveledKm, manualClientTableId, mission]);

    useEffect(() => {
      if (financialData && mission && !isLoading) {
          const fmtBR = (v: number) => v.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
          // Total da MEMÓRIA DE CÁLCULO — mesma expressão exibida na linha
          // "base + km + hora + IBL + pedágio = total": serviço (já com IBL) + pedágio.
          // O número grande deve ser cópia fiel deste valor.
          const autoClientTotal = financialData.client.serviceTotal + parseNumber(tollInput) + parseNumber(displacementInput);
          const autoProviderTotal = mission.is_same_os
              ? 0
              : financialData.provider.serviceTotal + parseNumber(tollProviderInput) + parseNumber(displacementProviderInput);

          const canAutoFill = !dbValuesLoadedRef.current && !userManuallyEditedRef.current && !isSavingRef.current;
          if (canAutoFill) {
              setRevenueInput(fmtBR(autoClientTotal));
              setCostInput(fmtBR(autoProviderTotal));
          }

          // Task #133: o número grande acompanha o cálculo quando o valor salvo
          // ficou defasado. Overrides intencionais (edição manual divergente) são
          // preservados via isIntentionalBillingOverride — ver bloco canResyncSaved.
          // Task #133 + auto-resync: alinha o número grande ao cálculo quando o valor
          // salvo ficou defasado (ex.: motor evoluiu após "Salvamento manual confirmado").
          // Preserva overrides INTENCIONAIS (edição manual divergente, desconto, etc.).
          const revIntentional = isIntentionalBillingOverride(mission.revenue_edit_reason);
          const costIntentional = isIntentionalBillingOverride(mission.cost_edit_reason);
          const canResyncSaved = dbValuesLoadedRef.current && !isSavingRef.current && lockAllowsRecalc && !isEffectivelyLocked;

          if (canResyncSaved) {
              const currentRev = parseNumber(revenueInput);
              const needRev = !revIntentional && autoClientTotal > 0 && Math.abs(currentRev - autoClientTotal) > 1;
              if (needRev) {
                  setRevenueInput(fmtBR(autoClientTotal));
              }
              const currentCost = parseNumber(costInput);
              const needCost = !mission.is_same_os && !costIntentional && !userManuallyEditedRef.current && !isControllerRole
                  && autoProviderTotal > 0 && Math.abs(currentCost - autoProviderTotal) > 1;
              if (needCost) {
                  setCostInput(fmtBR(autoProviderTotal));
              } else if (mission.is_same_os && currentCost !== 0) {
                  setCostInput('0,00');
              }

              // Persiste automaticamente no banco (uma vez por abertura) para não exigir
              // clique em "Restaurar Auto" nem novo Salvar só por regra de cálculo atualizada.
              if ((needRev || needCost) && staleAutoResyncDoneRef.current !== mission.id) {
                  staleAutoResyncDoneRef.current = mission.id;
                  const r2 = (v: number) => Math.round(v * 100) / 100;
                  const revServiceOnly = financialData.client.serviceTotal;
                  const costServiceOnly = mission.is_same_os ? 0 : financialData.provider.serviceTotal;
                  const toll = parseNumber(tollInput);
                  const tollProv = mission.is_same_os ? 0 : parseNumber(tollProviderInput);
                  const payload: Record<string, unknown> = {
                      last_update: new Date().toISOString(),
                  };
                  if (needRev) {
                      payload.revenue_value = r2(revServiceOnly);
                      payload.revenue_edit_reason = '';
                  }
                  if (needCost) {
                      payload.cost_value = r2(costServiceOnly);
                      payload.cost_edit_reason = '';
                  }
                  if (!mission.billing_verified_by && (needRev || needCost)) {
                      payload.billing_verified_by = null;
                  }
                  (async () => {
                      try {
                          const { error } = await supabase.from('missions').update(payload).eq('id', mission.id);
                          if (error) throw error;
                          setMission((prev) => prev ? {
                              ...prev,
                              ...(needRev ? { revenue_value: payload.revenue_value as number, revenue_edit_reason: '' } : {}),
                              ...(needCost ? { cost_value: payload.cost_value as number, cost_edit_reason: '' } : {}),
                          } : prev);
                          await supabase.from('system_logs').insert([{
                              user_name: 'Sistema',
                              action_type: 'AUTO_RESYNC_BILLING',
                              entity: 'Mission',
                              entity_id: mission.id,
                              details: JSON.stringify({
                                  revenue: needRev ? r2(revServiceOnly) : null,
                                  cost: needCost ? r2(costServiceOnly) : null,
                                  toll: r2(toll),
                                  tollProvider: r2(tollProv),
                                  clientExcessKm: financialData.client.excessKm,
                                  clientExtraKmVal: r2(financialData.client.extraKmVal),
                              }),
                          }]);
                          showNotification(
                              'Cálculo atualizado',
                              'Valor salvo anteriormente foi alinhado automaticamente ao cálculo da tabela.',
                              'success',
                          );
                      } catch (e) {
                          console.warn('[Auto-resync billing] Falha ao persistir:', e);
                      }
                  })();
              }
          }

          // Motor automático é fonte oficial: se está ativo e o valor salvo
          // no banco diverge do calculado, sobrescreve o costInput para
          // refletir o cálculo correto na tela (R$ 533 + R$ 367,24 + pedágio).
          // Roda mesmo com a OS travada — o operador continua precisando
          // destravar/usar EDIÇÃO TOTAL para salvar, mas o valor exibido
          // passa a ser o do motor, evitando o "R$ 0,00" remanescente de
          // gravações antigas (anteriores ao motor).
          // Só não roda durante salvamento ou logo após edição manual.
          if (financialData.autoEngine?.active && !mission.is_same_os && !userManuallyEditedRef.current && !isSavingRef.current && !isControllerRole) {
              const engineCostTotal = financialData.provider.serviceTotal + parseNumber(tollProviderInput) + parseNumber(displacementProviderInput);
              const currentCostInput = parseNumber(costInput);
              if (engineCostTotal > 0 && Math.abs(currentCostInput - engineCostTotal) > 1) {
                  setCostInput(engineCostTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
              }
          }

          const isCevaLogitech = financialData.client?.detectionLog?.includes('LOGITECH SOBERANA');
          // Regra: depois de salvo/aprovado, NUNCA sobrescrever valores do banco
          // por recálculo automático (mesmo no caso especial CEVA/Logitech).
          if (isCevaLogitech && dbValuesLoadedRef.current && !userManuallyEditedRef.current && !isSavingRef.current && lockAllowsRecalc) {
              const fmt = (v: number) => v.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
              const calcRevTotal = financialData.client.total + parseNumber(displacementInput);
              const currentInput = parseNumber(revenueInput);
              if (calcRevTotal > 0 && Math.abs(currentInput - calcRevTotal) > 1) {
                  setRevenueInput(fmt(calcRevTotal));
              }
              const calcToll = financialData.tollValue || 0;
              const currentToll = parseNumber(tollInput);
              if (calcToll > 0 && Math.abs(currentToll - calcToll) > 0.5) {
                  setTollInput(fmt(calcToll));
                  setTollProviderInput(fmt(calcToll));
              }
              const calcCostTotal = financialData.provider.total + parseNumber(displacementProviderInput);
              const currentCostInput = parseNumber(costInput);
              if (!mission.is_same_os && !isControllerRole && calcCostTotal > 0 && Math.abs(currentCostInput - calcCostTotal) > 1) {
                  setCostInput(fmt(calcCostTotal));
              }
          }
          
          // OS 5046: nunca guardar o id sintético "auto-..." (gerado pelo motor
          // automático) em manualProviderTableId — isso desligaria o motor por
          // engano. Só persistimos ids de tabelas REAIS selecionadas.
          if (financialData.provider.tableId && !String(financialData.provider.tableId).startsWith('auto-')) {
              if (!manualProviderTableId) {
                  setManualProviderTableId(financialData.provider.tableId);
              }
              if (manualProviderTableId && financialData.provider.tableId !== manualProviderTableId && financialData.provider.detectionLog.includes('CEVA Jundiaí')) {
                  setManualProviderTableId(financialData.provider.tableId);
              }
          }
          if (financialData.client.tableId) {
              if (!manualClientTableId) {
                  setManualClientTableId(financialData.client.tableId);
              }
          }
      }
    }, [financialData, memoryLoaded, mission, tollProviderInput, displacementInput, displacementProviderInput, useSavedValues, isLoading, isEffectivelyLocked, lockAllowsRecalc, revenueInput, costInput, tollInput, showNotification]); 

    // KM de deslocamento autorizado pela DHL: o campo dhl_deslocamento_km
    // (digitado no "Atualizar Missão") vira cobrança automática pelo campo
    // aditivo "Deslocamento Aprovado (Cobrado)" — mesma via do pedágio.
    // Cliente paga km × R$/km excedente da tabela aplicada; fornecedor
    // recebe km × R$/km excedente da tabela de custo (0 se MESMA OS).
    // NÃO toca: revenue/cost de serviço, OS travada/aprovada (snapshot
    // imutável), override manual (userManuallyEditedRef) nem valor de
    // deslocamento já salvo/digitado (> 0). Nesses casos apenas exibe a
    // sugestão com botão APLICAR (quando destravado).
    useEffect(() => {
        if (!financialData || isLoading) return;
        const km = dhlDeslocKmRef.current;
        if (!(km > 0)) { if (dhlDeslocInfo) setDhlDeslocInfo(null); return; }
        let clientRate = financialData.client.unitPriceKm || 0;
        // Tabelas DHL fixas (ex: SUL - RAIO SC 200KM) têm price_per_extra_km = 0.
        // Para o KM de deslocamento autorizado vale a taxa FIXA por UF de origem
        // do boletim DHL (coluna AA): SC/RS = R$ 7,35; demais UFs = R$ 6,90.
        const isDhlClient = (mission?.client || '').toUpperCase().includes('DHL');
        if (isDhlClient && clientRate <= 0) {
            const ufOrigem = extractUF(mission?.origin || '');
            clientRate = (ufOrigem === 'SC' || ufOrigem === 'RS') ? 7.35 : 6.90;
        }
        const clientVal = Math.round(km * clientRate * 100) / 100;
        if (!dhlDeslocInfo || dhlDeslocInfo.clientVal !== clientVal) {
            setDhlDeslocInfo({ km, clientRate, clientVal });
        }
        if (dhlDeslocAutoAppliedRef.current) return;
        if (isEffectivelyLocked || isSavingRef.current) return;
        if (parseNumber(displacementInput) > 0) {
            // Já existe deslocamento salvo/digitado — não sobrescrever.
            dhlDeslocAutoAppliedRef.current = true;
            return;
        }
        if (clientVal <= 0) return;
        dhlDeslocAutoAppliedRef.current = true;
        const fmtBR = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        // Cobrança automática SÓ no lado do cliente. O deslocamento do fornecedor é
        // sempre manual: só entra se o fornecedor cobrar algo (digitado pelo operador).
        setDisplacementInput(fmtBR(clientVal));
        if (userManuallyEditedRef.current) {
            // Com valor manual salvo, o efeito de sync do número grande não roda —
            // então somamos o deslocamento direto no Valor Final do cliente.
            const currentRev = parseNumber(revenueInput);
            setRevenueInput(fmtBR(currentRev + clientVal));
        }
    }, [financialData, isLoading, mission, displacementInput, revenueInput, isEffectivelyLocked, dhlDeslocInfo]);

    // Auto-recálculo: quando o usuário mexer em qualquer parâmetro (tabela, base/km/hora customizados,
    // IBL, override do fornecedor) após o carregamento inicial, liberamos os refs para que o autofill
    // acima atualize sozinho os totais — eliminando a necessidade de clicar em "Recalcular".
    const paramsBaselineRef = React.useRef(false);
    useEffect(() => {
        if (isLoading) {
            paramsBaselineRef.current = false;
            return;
        }
        if (!paramsBaselineRef.current) {
            paramsBaselineRef.current = true;
            return;
        }
        // Quando o faturamento está travado (já salvo/aprovado) e não houve destravamento,
        // não permitimos que o auto-recálculo sobrescreva os valores salvos no banco.
        // Task #143: se o usuário tem permissão de trocar a tabela mesmo travado
        // (lockAllowsRecalc), liberamos os refs para que o número grande/breakdown
        // acompanhem a nova tabela na tela — sem gravar nada no banco.
        if (!lockAllowsRecalc) {
            return;
        }
        dbValuesLoadedRef.current = false;
        userManuallyEditedRef.current = false;
    }, [manualClientTableId, manualProviderTableId, customClientBase, customClientKm, customClientHour, customProviderBase, customProviderKm, customProviderHour, iblEnabled, providerOpsOverride, isLoading, isEffectivelyLocked, lockAllowsRecalc]);


  const handleTollChange = (val: string) => {
      const oldToll = parseNumber(tollInput);
      const newToll = parseNumber(val);
      setTollInput(val);
      setTollSource('MANUAL (Editando — confirme abaixo)');
      // Edição manual NÃO conta como confirmação explícita: o usuário precisa
      // responder Sim/Não no dialog para liberar a aprovação (Task #45).
      setTollConfirmed(false);
      if (!userManuallyEditedRef.current) {
          const currentRev = parseNumber(revenueInput);
          const updatedRev = currentRev - oldToll + newToll;
          setRevenueInput(updatedRev.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      }
      if (!mission?.is_same_os && parseNumber(tollProviderInput) === 0 && newToll > 0) {
          const oldTollProv = parseNumber(tollProviderInput);
          setTollProviderInput(val);
          const currentCost = parseNumber(costInput);
          const updatedCost = currentCost - oldTollProv + newToll;
          setCostInput(updatedCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      }
      setUseSavedValues(true);
  };

  const handleTollProviderChange = (val: string) => {
      if (mission?.is_same_os) return;
      const oldTollProv = parseNumber(tollProviderInput);
      const newTollProv = parseNumber(val);
      setTollProviderInput(val);
      setTollSource('MANUAL (Editando — confirme abaixo)');
      // Edição manual NÃO conta como confirmação (Task #45).
      setTollConfirmed(false);
      const currentCost = parseNumber(costInput);
      const updatedCost = currentCost - oldTollProv + newTollProv;
      setCostInput(updatedCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      setUseSavedValues(true);
  };

  // Deslocamento Aprovado (Cobrado): valor aditivo que espelha o comportamento
  // do pedágio — entra no número grande (Valor Final) e em todos os relatórios.
  const handleDisplacementChange = (val: string) => {
      const oldDisp = parseNumber(displacementInput);
      const newDisp = parseNumber(val);
      setDisplacementInput(val);
      if (!userManuallyEditedRef.current) {
          const currentRev = parseNumber(revenueInput);
          const updatedRev = currentRev - oldDisp + newDisp;
          setRevenueInput(updatedRev.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      }
      // Deslocamento do fornecedor NÃO espelha o do cliente: é cobrança exclusiva
      // do faturamento cliente. O fornecedor só recebe se digitarem no campo dele.
      setUseSavedValues(true);
  };

  const handleDisplacementProviderChange = (val: string) => {
      const oldDispProv = parseNumber(displacementProviderInput);
      const newDispProv = parseNumber(val);
      setDisplacementProviderInput(val);
      const currentCost = parseNumber(costInput);
      const updatedCost = currentCost - oldDispProv + newDispProv;
      setCostInput(updatedCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      setUseSavedValues(true);
  };

  const handleManualInput = (setter: any, val: string) => {
      setter(val);
  }

  const handleRecalculateClient = async () => {
      // Regra: faturamento salvo/aprovado nunca pode ser sobrescrito por recálculo.
      // Só permite recalcular após destravamento manual (diretoria/admin/CEO).
      if (isEffectivelyLocked) {
          showNotification('Faturamento travado', 'Destrave o faturamento antes de recalcular os valores do cliente.', 'error');
          return;
      }
      setCustomClientBase('');
      setCustomClientKm('');
      setCustomClientHour('');
      setUseSavedValues(false);
      userManuallyEditedRef.current = false;
      dbValuesLoadedRef.current = false;
      setMission(prev => prev ? { ...prev, revenue_edit_reason: '', cost_edit_reason: '', billing_verified_by: null } : prev);
      if (financialData && mission) {
          const toll = parseNumber(tollInput);
          const revServiceOnly = financialData.client.serviceTotal;
          const newRevenue = revServiceOnly + toll;
          setRevenueInput(newRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
          
          const r2 = (v: number) => Math.round(v * 100) / 100;
          try {
              const userData = JSON.parse(localStorage.getItem('userData') || '{}');
              const userName = userData.name || 'Usuário';
              const recalcPayload: any = {
                  revenue_value: r2(revServiceOnly),
                  toll_value: r2(toll),
                  billing_verified_by: null,
                  last_update: new Date().toISOString()
              };
              if (r2(revServiceOnly) === 0) {
                  recalcPayload.revenue_edit_reason = `[${userName} - ${formatNowDateTimeBR()}] Recalculado pelo sistema (valor zero)`;
              } else {
                  recalcPayload.revenue_edit_reason = '';
              }
              recalcPayload.cost_edit_reason = '';
              const { data: currentClient, error: fetchErr } = await supabase.from('missions').select('last_update').eq('id', mission.id).single();
              if (fetchErr) throw fetchErr;
              if (currentClient?.last_update && mission.last_update && currentClient.last_update !== mission.last_update) {
                  showNotification('Conflito', 'Outro usuário alterou esta OS, recarregue.', 'error');
                  return;
              }
              const recalcRes = await supabase.from('missions').update(recalcPayload).eq('id', mission.id);
              if (recalcRes.error) throw recalcRes.error;
              
              await supabase.from('system_logs').insert([{
                  user_name: userName,
                  action_type: 'RECALCULATE_CLIENT',
                  entity: 'Mission',
                  entity_id: mission.id,
                  details: JSON.stringify({
                      newRevenue: r2(revServiceOnly),
                      toll: r2(toll),
                      total: r2(newRevenue),
                      extraKm: financialData.client.excessKm,
                      extraKmVal: r2(financialData.client.extraKmVal),
                      extraHr: financialData.client.excessHours,
                      extraHrVal: r2(financialData.client.extraHrVal),
                      base: r2(financialData.client.base),
                      table: financialData.client.tableId
                  })
              }]);
              showNotification('Recalculado e Salvo', 'Valores do cliente atualizados na tabela e salvos no banco.', 'success');
          } catch (e) {
              console.error('Erro ao salvar recálculo cliente:', e);
              showNotification('Recalculado', 'Valores restaurados na tela, mas houve erro ao salvar no banco.', 'error');
          }
      }
  };

  const handleRecalculateProvider = async () => {
      // Regra: faturamento salvo/aprovado nunca pode ser sobrescrito por recálculo.
      // Só permite recalcular após destravamento manual (diretoria/admin/CEO).
      if (isEffectivelyLocked) {
          showNotification('Faturamento travado', 'Destrave o faturamento antes de recalcular os valores do fornecedor.', 'error');
          return;
      }
      setCustomProviderBase('');
      setCustomProviderKm('');
      setCustomProviderHour('');
      setUseSavedValues(false);
      userManuallyEditedRef.current = false;
      dbValuesLoadedRef.current = false;
      setMission(prev => prev ? { ...prev, revenue_edit_reason: '', cost_edit_reason: '', billing_verified_by: null } : prev);
      if (financialData && mission) {
          const isSameOs = mission.is_same_os === true;
          const tollProv = isSameOs ? 0 : parseNumber(tollProviderInput);
          const costServiceOnly = isSameOs ? 0 : financialData.provider.serviceTotal;
          const newCost = isSameOs ? 0 : (costServiceOnly + tollProv);
          setCostInput(newCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
          
          const r2 = (v: number) => Math.round(v * 100) / 100;
          try {
              const userData = JSON.parse(localStorage.getItem('userData') || '{}');
              const userName = userData.name || 'Usuário';
              const recalcProvPayload: any = {
                  cost_value: r2(costServiceOnly),
                  toll_value_provider: r2(tollProv),
                  billing_verified_by: null,
                  last_update: new Date().toISOString()
              };
              if (r2(costServiceOnly) === 0) {
                  recalcProvPayload.cost_edit_reason = `[${userName} - ${formatNowDateTimeBR()}] Recalculado pelo sistema (valor zero)`;
              } else {
                  recalcProvPayload.cost_edit_reason = '';
              }
              recalcProvPayload.revenue_edit_reason = '';
              const { data: currentProv, error: fetchProvErr } = await supabase.from('missions').select('last_update').eq('id', mission.id).single();
              if (fetchProvErr) throw fetchProvErr;
              if (currentProv?.last_update && mission.last_update && currentProv.last_update !== mission.last_update) {
                  showNotification('Conflito', 'Outro usuário alterou esta OS, recarregue.', 'error');
                  return;
              }
              const recalcProvRes = await supabase.from('missions').update(recalcProvPayload).eq('id', mission.id);
              if (recalcProvRes.error) throw recalcProvRes.error;
              
              await supabase.from('system_logs').insert([{
                  user_name: userName,
                  action_type: 'RECALCULATE_PROVIDER',
                  entity: 'Mission',
                  entity_id: mission.id,
                  details: JSON.stringify({
                      newCost: r2(costServiceOnly),
                      tollProvider: r2(tollProv),
                      total: r2(newCost),
                      extraKm: financialData.provider.excessKm,
                      extraKmVal: r2(financialData.provider.extraKmVal),
                      extraHr: financialData.provider.excessHours,
                      extraHrVal: r2(financialData.provider.extraHrVal),
                      base: r2(financialData.provider.base),
                      table: financialData.provider.tableId
                  })
              }]);
              showNotification('Recalculado e Salvo', 'Valores do fornecedor atualizados na tabela e salvos no banco.', 'success');
          } catch (e) {
              console.error('Erro ao salvar recálculo fornecedor:', e);
              showNotification('Recalculado', 'Valores restaurados na tela, mas houve erro ao salvar no banco.', 'error');
          }
      }
  };

  // Recálculo SÍNCRONO do número grande (VALOR FINAL cliente/fornecedor) no
  // momento exato em que o usuário troca a "Tabela de Preço/Custo Aplicada".
  // Não dependemos mais só do encadeamento de effects (autofill + guardas de
  // lock), que em OS já SALVA/APROVADA podia deixar o número grande "congelado"
  // no valor antigo enquanto a memória de cálculo (breakdown) já mudava. Aqui
  // recalculamos na hora, com a tabela escolhida, e escrevemos direto no input
  // exibido. É SÓ TELA: nada é gravado no banco — a persistência continua
  // exclusiva do fluxo de Salvar/Aprovar, e o snapshot imutável de OS aprovada
  // nunca é tocado por trocar a tabela.
  const recalcBigNumbersOnTableSwap = (opts: { clientTableId?: string; providerTableId?: string }) => {
      if (!mission) return;
      const currentToll = parseNumber(tollInput);
      const fin = calculateMissionFinancials({ ...mission, toll_value: currentToll }, clientTables, providerTables, clientData, currentTime, {
          clientTableId: (opts.clientTableId ?? manualClientTableId) || undefined,
          providerTableId: (opts.providerTableId ?? manualProviderTableId) || undefined,
          forceIblFee: iblEnabled,
          disableFixedKmRule: disableFixedKmRule || undefined,
          providerOpsOverride: providerOpsOverride,
      }, providersList);
      if (!fin) return;
      const fmtBR = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (opts.clientTableId !== undefined) {
          const total = fin.client.serviceTotal + parseNumber(tollInput) + parseNumber(displacementInput);
          setRevenueInput(fmtBR(total));
      }
      if (opts.providerTableId !== undefined) {
          const total = fin.provider.serviceTotal + parseNumber(tollProviderInput) + parseNumber(displacementProviderInput);
          setCostInput(fmtBR(total));
      }
  };

  // Troca rápida da TABELA DE PREÇO do cliente (campo Receita). Define a tabela
  // manual, limpa overrides e flags de verificação/edição para que o cálculo
  // automático refaça o total com a nova tabela. O autofill (effect de params)
  // atualiza o revenueInput sozinho; "Aplicar e Salvar" chama handleUpdate.
  const swapClientTable = (id: string) => {
      setManualClientTableId(id);
      setCustomClientBase(''); setCustomClientKm(''); setCustomClientHour('');
      setUseSavedValues(false);
      userManuallyEditedRef.current = false;
      dbValuesLoadedRef.current = false;
      if (!(isBillingLocked && canEditTablesEvenIfLocked)) {
          setMission(prev => prev ? { ...prev, revenue_edit_reason: '', cost_edit_reason: '', billing_verified_by: null } : prev);
          if (mission) {
              supabase.from('missions')
                  .update({ revenue_edit_reason: '', cost_edit_reason: '', billing_verified_by: null })
                  .eq('id', mission.id)
                  .then(({ error }) => { if (error) console.error('Erro ao limpar flags (troca tabela cliente):', error); });
          }
      }
      recalcBigNumbersOnTableSwap({ clientTableId: id });
  };

  // Troca rápida da TABELA DE CUSTO do fornecedor (campo Custo). Mesma lógica do
  // cliente, aplicada aos parâmetros do fornecedor.
  const swapProviderTable = (id: string) => {
      setManualProviderTableId(id);
      setCustomProviderBase(''); setCustomProviderKm(''); setCustomProviderHour('');
      setUseSavedValues(false);
      userManuallyEditedRef.current = false;
      dbValuesLoadedRef.current = false;
      if (!(isBillingLocked && canEditTablesEvenIfLocked)) {
          setMission(prev => prev ? { ...prev, revenue_edit_reason: '', cost_edit_reason: '', billing_verified_by: null } : prev);
          if (mission) {
              supabase.from('missions')
                  .update({ revenue_edit_reason: '', cost_edit_reason: '', billing_verified_by: null })
                  .eq('id', mission.id)
                  .then(({ error }) => { if (error) console.error('Erro ao limpar flags (troca tabela fornecedor):', error); });
          }
      }
      recalcBigNumbersOnTableSwap({ providerTableId: id });
  };

  const getApprovalStage = (userName: string, userRole: string): { stage: string; label: string } => {
      const nameLower = (userName || '').toLowerCase();
      const roleLower = (userRole || '').toLowerCase();
      if (nameLower.includes('daniel') || nameLower.includes('michelle')) return { stage: 'auditor', label: 'Aprovado pelo Auditor' };
      if (roleLower === 'administrador' || nameLower.includes('barbara') || nameLower.includes('bárbara')) return { stage: 'financeiro', label: 'Aprovado pelo Financeiro' };
      if (roleLower === 'diretoria' || nameLower.includes('thiago')) return { stage: 'diretoria', label: 'Aprovado pela Diretoria' };
      if (roleLower === 'controller') return { stage: 'controller', label: 'Aprovado pelo Controller' };
      return { stage: 'operacional', label: `Aprovado por ${userName}` };
  };

  const isSnapshotFrozen = !!(mission?.snapshot_approved_by);

  const currentApprovalStatus = useMemo(() => {
      const stages = approvalLog.map(l => l.stage);
      const hasAuditor = stages.includes('auditor');
      const hasFinanceiro = stages.includes('financeiro');
      const hasDiretoria = stages.includes('diretoria');
      const hasController = stages.includes('controller');
      const isApprovedForBilling = hasFinanceiro || hasDiretoria || hasController || (mission?.billing_approved === true);
      const isFullyApproved = hasDiretoria;
      const missing: string[] = [];
      if (!hasDiretoria) {
          if (!hasFinanceiro) {
              if (!hasAuditor) missing.push('Daniel');
              missing.push('Barbara');
          }
          missing.push('Diretoria');
      }
      let waitingDays = 0;
      if (approvalLog.length > 0) {
          const lastDate = approvalLog.reduce((latest, l) => {
              const d = new Date(l.date).getTime();
              return d > latest ? d : latest;
          }, 0);
          waitingDays = Math.floor((Date.now() - lastDate) / (1000 * 60 * 60 * 24));
      } else if (mission?.endTime) {
          waitingDays = Math.floor((Date.now() - new Date(mission.endTime).getTime()) / (1000 * 60 * 60 * 24));
      }
      const hasPartial = (hasAuditor || hasFinanceiro) && !isFullyApproved;

      let currentUserStage = '';
      let isPrivilegedReapprover = false;
      try {
          const u = JSON.parse(localStorage.getItem('userData') || '{}');
          const uName = (u.name || '').toLowerCase();
          const uRole = (u.role || '').toLowerCase();
          // Usuários com poder permanente de editar e re-aprovar a qualquer momento.
          isPrivilegedReapprover = uName.includes('daniel') || uName.includes('michelle')
              || uName.includes('barbara') || uName.includes('bárbara')
              || uName.includes('thiago') || uName.includes('plinio') || uName.includes('plínio');
          if (uName.includes('plinio') || uName.includes('plínio')) currentUserStage = 'diretoria';
          else if (uName.includes('daniel') || uName.includes('michelle')) currentUserStage = 'auditor';
          else if (uRole === 'administrador' || uName.includes('barbara') || uName.includes('bárbara')) currentUserStage = 'financeiro';
          else if (uRole === 'diretoria' || uName.includes('thiago')) currentUserStage = 'diretoria';
          else if (uRole === 'controller') currentUserStage = 'controller';
      } catch {}

      let blockedForCurrentUser = false;
      let blockedMessage = '';
      // Financeiro (Bárbara/administrador) pode aprovar qualquer OS independente da aprovação prévia do Auditor.

      const lockedByDiretoria = hasDiretoria && currentUserStage !== 'diretoria' && !isPrivilegedReapprover && (() => { try { const u = JSON.parse(localStorage.getItem('userData') || '{}'); const r = (u.role || '').toLowerCase(); return r !== 'controller' && r !== 'administrador'; } catch { return true; } })();

      return { hasAuditor, hasFinanceiro, hasDiretoria, hasController, isFullyApproved, isApprovedForBilling, missing, waitingDays, hasPartial, blockedForCurrentUser, blockedMessage, currentUserStage, lockedByDiretoria, isPrivilegedReapprover };
  }, [approvalLog, mission?.endTime]);

  const applyOfficialTableToDb = async () => {
      if (!mission || !financialData) return;
      setIsUpdating(true);
      isSavingRef.current = true;
      try {
          const toll = parseNumber(tollInput);
          const tollProv = mission.is_same_os ? 0 : (parseNumber(tollProviderInput) || toll);
          const displacement = parseNumber(displacementInput);
          const dispProv = mission.is_same_os ? 0 : parseNumber(displacementProviderInput);
          const revService = r2money(financialData.client.serviceTotal);
          const costService = mission.is_same_os ? 0 : r2money(financialData.provider.serviceTotal);
          const revTotal = revService + toll + displacement;
          const costTotal = costService + tollProv + dispProv;
          const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

          setUseSavedValues(false);
          userManuallyEditedRef.current = false;
          setRevenueInput(fmt(revTotal));
          setCostInput(fmt(costTotal));

          const userData = JSON.parse(localStorage.getItem('userData') || '{}');
          const userName = userData.name || 'Sistema';
          const stamp = `[${userName} - ${formatNowDateTimeBR()}]`;
          const payload: Record<string, unknown> = {
              revenue_value: revService,
              cost_value: costService,
              toll_value: r2money(toll),
              displacement_value: r2money(displacement),
              toll_value_provider: r2money(tollProv),
              displacement_value_provider: r2money(dispProv),
              revenue_edit_reason: `${stamp} Tabela oficial aplicada automaticamente`,
              last_update: new Date().toISOString(),
              billing_verified_by: userName,
          };
          if (!mission.is_same_os) {
              payload.cost_edit_reason = `${stamp} Tabela oficial aplicada automaticamente`;
          }

          let { error } = await supabase.from('missions').update(payload).eq('id', mission.id);
          if (error?.message?.includes('does not exist')) {
              const { toll_value_provider, displacement_value, displacement_value_provider, ...minimal } = payload;
              ({ error } = await supabase.from('missions').update(minimal).eq('id', mission.id));
          }
          if (error) throw error;

          dbValuesLoadedRef.current = true;
          showNotification('Tabela Aplicada', 'Valores gravados conforme tabela oficial de franquia.', 'success');
          broadcastMissionRefresh();
          onUpdate?.();
          await loadData();
      } catch (e: any) {
          showNotification('Erro', e.message || 'Falha ao aplicar tabela oficial.', 'error');
      } finally {
          setIsUpdating(false);
          isSavingRef.current = false;
      }
  };

  const handleUpdate = async (approve: boolean) => {
      if (!mission) return;
      if (isSnapshotFrozen && !isController && currentApprovalStatus.currentUserStage !== 'diretoria' && currentApprovalStatus.currentUserStage !== 'financeiro' && currentApprovalStatus.currentUserStage !== 'controller') {
          showNotification('Bloqueado', `Dados Congelados — Aprovado por ${mission.snapshot_approved_by}. Somente Financeiro, Controller ou Diretoria podem editar.`, 'error');
          return;
      }
      if (currentApprovalStatus.lockedByDiretoria && !isBarbaraFinance) {
          showNotification('Bloqueado', 'Esta OS foi aprovada pela Diretoria. Somente a Diretoria pode editar.', 'error');
          return;
      }
      // Gate de pedágio (Task #45): a aprovação requer confirmação manual
      // explícita, mesmo para reaprovação privilegiada ou OS bloqueada.
      // Confirma cruzando com system_logs (TOLL_CONFIRMATION) e o valor
      // do input atual, sem confiar apenas em estado local.
      // Só é exigido quando a missão está Concluída ou Cancelada.
      const missionStatusTrim = (mission.status || '').trim();
      const requiresTollGate = missionStatusTrim === 'Concluída' || missionStatusTrim === 'Cancelada';
      if (approve && !mission.billing_approved && requiresTollGate && !isBarbaraFinance) {
          if (!tollConfirmed) {
              setShowTollConfirmDialog(true);
              showNotification('Pedágio Não Confirmado', 'Confirme se há ou não pedágio antes de aprovar.', 'error');
              return;
          }
          try {
              const inputToll = parseNumber(tollInput);
              const { data: tollLogs } = await supabase
                  .from('system_logs')
                  .select('details')
                  .eq('entity', 'MissionTollConfirmation')
                  .eq('entity_id', mission.id)
                  .order('created_at', { ascending: false })
                  .limit(1);
              const log = tollLogs && tollLogs[0];
              let matched = false;
              if (log) {
                  const parsed = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
                  const loggedValue = Number(parsed?.value ?? 0);
                  if (Math.abs(loggedValue - inputToll) < 0.01) matched = true;
              }
              if (!matched) {
                  setTollConfirmed(false);
                  setShowTollConfirmDialog(true);
                  showNotification('Pedágio Não Confirmado', 'O valor exibido não corresponde à última confirmação registrada. Confirme novamente.', 'error');
                  return;
              }
          } catch (e) {
              console.error('[TollConfirm] verificação pré-aprovação falhou', e);
              showNotification('Erro', 'Não foi possível validar a confirmação de pedágio. Tente novamente.', 'error');
              return;
          }
      }

      const originalRevenue = (mission.revenue_value || 0) + (mission.toll_value || 0) + ((mission as any).displacement_value || 0);
      const isSameOs = mission.is_same_os === true;
      const revTotal = isController ? originalRevenue : parseNumber(revenueInput);
      const costTotal = isSameOs ? 0 : parseNumber(costInput);
      const toll = isController ? (mission.toll_value || 0) : parseNumber(tollInput);
      const tollProv = isSameOs ? 0 : (parseNumber(tollProviderInput) || toll);
      const displacement = isController ? ((mission as any).displacement_value || 0) : parseNumber(displacementInput);
      const dispProv = isSameOs ? 0 : parseNumber(displacementProviderInput);
      const calcRevTotal = financialData ? (financialData.client.serviceTotal + toll + displacement) : 0;
      const calcCostTotal = financialData ? (financialData.provider.serviceTotal + tollProv + dispProv) : 0;
      const revDivergent = isController ? false : Math.abs(revTotal - calcRevTotal) > 1;
      const costDivergent = !isSameOs && Math.abs(costTotal - calcCostTotal) > 1;
      // Task #66 — quando o motor automático de fornecedor está ativo, qualquer
      // divergência (> 1 centavo) entre o custo salvo (sem pedágio) e a sugestão
      // do motor deve obrigar o operador a informar o motivo, garantindo
      // rastreabilidade real das exceções na aba "Edições Manuais".
      const autoEngineActive = !!financialData?.autoEngine?.active;
      const autoEngineSuggestedCost = autoEngineActive ? (financialData!.autoEngine!.totalCost || 0) : null;
      const savedCostServiceOnly = costTotal - tollProv - dispProv;
      const autoEngineDivergent = autoEngineActive
          && !isSameOs
          && autoEngineSuggestedCost !== null
          && Math.abs(savedCostServiceOnly - autoEngineSuggestedCost) > 0.01;

      if (revDivergent && !revenueEditReason.trim()) {
          setShowRevenueReasonInput(true);
          showNotification('Motivo Obrigatório', 'O valor do cliente foi alterado manualmente. Informe o motivo da alteração.', 'error');
          return;
      }
      if ((costDivergent || autoEngineDivergent) && !costEditReason.trim()) {
          setShowCostReasonInput(true);
          showNotification(
              'Motivo Obrigatório',
              autoEngineDivergent
                  ? `O custo informado (R$ ${savedCostServiceOnly.toFixed(2)}) diverge da sugestão do motor automático (R$ ${(autoEngineSuggestedCost || 0).toFixed(2)}). Informe o motivo para registrar a exceção.`
                  : 'O valor do fornecedor foi alterado manualmente. Informe o motivo da alteração.',
              'error'
          );
          return;
      }

      // Detecta se a OS já estava aprovada e quais valores mudaram nesta edição.
      // Quando há mudança em OS já aprovada, exige uma OBSERVAÇÃO curta que será
      // gravada no histórico permanente da OS (MissionEditHistory).
      const wasAlreadyApproved = !!(mission.billing_approved || mission.snapshot_approved_by);
      const origRevenueService = mission.revenue_value || 0;
      const origCost = mission.cost_value || 0;
      const origToll = mission.toll_value || 0;
      const origTollProv = (mission as any).toll_value_provider || 0;
      const origDisp = (mission as any).displacement_value || 0;
      const origDispProv = (mission as any).displacement_value_provider || 0;
      const newRevenueService = revTotal - toll - displacement;
      const newCostService = costTotal - tollProv - dispProv;
      const detectedChanges: string[] = [];
      if (Math.abs(origRevenueService - newRevenueService) > 0.01) detectedChanges.push(`Serviço Cliente: R$ ${origRevenueService.toFixed(2)} → R$ ${newRevenueService.toFixed(2)}`);
      if (Math.abs(origCost - newCostService) > 0.01) detectedChanges.push(`Serviço Fornecedor: R$ ${origCost.toFixed(2)} → R$ ${newCostService.toFixed(2)}`);
      if (Math.abs(origToll - toll) > 0.01) detectedChanges.push(`Pedágio Cliente: R$ ${origToll.toFixed(2)} → R$ ${toll.toFixed(2)}`);
      if (Math.abs(origTollProv - tollProv) > 0.01) detectedChanges.push(`Pedágio Fornecedor: R$ ${origTollProv.toFixed(2)} → R$ ${tollProv.toFixed(2)}`);
      if (Math.abs(origDisp - displacement) > 0.01) detectedChanges.push(`Deslocamento Cliente: R$ ${origDisp.toFixed(2)} → R$ ${displacement.toFixed(2)}`);
      if (Math.abs(origDispProv - dispProv) > 0.01) detectedChanges.push(`Deslocamento Fornecedor: R$ ${origDispProv.toFixed(2)} → R$ ${dispProv.toFixed(2)}`);
      const requiresPostApprovalNote = wasAlreadyApproved && detectedChanges.length > 0 && !approve;
      if (requiresPostApprovalNote && !editObservation.trim()) {
          showNotification('Observação Obrigatória', 'OS já aprovada. Descreva brevemente o motivo da alteração para registrar no histórico.', 'error');
          return;
      }

      setIsUpdating(true);
      isSavingRef.current = true;
      try {
          const userData = JSON.parse(localStorage.getItem('userData') || '{}');
          const userName = userData.name || 'Usuário';
          const userRole = userData.role || '';
          
          const { stage: captureStage } = getApprovalStage(userName, userRole);
          await captureModalScreenshot(approve ? captureStage : 'save', userName);

          const revServiceOnly = revTotal - toll - displacement; 
          const costServiceOnly = costTotal - tollProv - dispProv;
          
          const { stage, label } = getApprovalStage(userName, userRole);
          
          const newLog = [...approvalLog];
          if (approve) {
              // Re-aprovação permitida para usuários privilegiados (Plinio, Barbara, Daniel, Thiago):
              // atualiza o carimbo do estágio com o nome e a data mais recente.
              const uNameLow = (userName || '').toLowerCase();
              const allowReapprove = uNameLow.includes('plinio') || uNameLow.includes('plínio')
                  || uNameLow.includes('barbara') || uNameLow.includes('bárbara')
                  || uNameLow.includes('daniel') || uNameLow.includes('michelle')
                  || uNameLow.includes('thiago');
              const existingIdx = newLog.findIndex(l => l.stage === stage);
              const logEntry = { user: userName, role: userRole, stage, date: new Date().toISOString() };
              if (existingIdx < 0) {
                  newLog.push(logEntry);
                  await supabase.from('system_logs').insert([{
                      user_name: userName,
                      action_type: stage,
                      entity: 'BillingApproval',
                      entity_id: mission.id,
                      details: JSON.stringify(logEntry)
                  }]);
              } else if (allowReapprove) {
                  newLog[existingIdx] = logEntry;
                  await supabase.from('system_logs').insert([{
                      user_name: userName,
                      action_type: `${stage}_reapproval`,
                      entity: 'BillingApproval',
                      entity_id: mission.id,
                      details: JSON.stringify({ ...logEntry, reapproved: true })
                  }]);
              }
          }
          
          const updatedStages = newLog.map(l => l.stage);
          const hasFinanceiro = updatedStages.includes('financeiro');
          const hasDiretoria = updatedStages.includes('diretoria');
          const hasController = updatedStages.includes('controller');
          const isApprovedForBilling = hasFinanceiro || hasDiretoria || hasController || (mission.billing_approved === true);
          const isFullyApproved = hasDiretoria;
          
          const canReleaseBilling = stage === 'financeiro' || stage === 'diretoria' || stage === 'controller';
          const shouldSnapshot = approve && canReleaseBilling && !mission.snapshot_approved_by;
          
          const r2 = (v: number) => Math.round(v * 100) / 100;
          const isSameOs = mission.is_same_os === true;
          const existingSnapshot = mission.snapshot_data && typeof mission.snapshot_data === 'object' && Object.keys(mission.snapshot_data).length > 0;
          const basePayload: any = {
              revenue_value: r2(revServiceOnly),
              cost_value: isSameOs ? 0 : r2(costServiceOnly),
              toll_value: r2(toll),
              displacement_value: r2(displacement),
              billing_approved: isApprovedForBilling,
              last_update: new Date().toISOString(),
          };
          if (approve && canReleaseBilling) {
              basePayload.billing_verified_by = userName;
          }
          if (!basePayload.billing_verified_by) {
              basePayload.billing_verified_by = userName;
          }

          if (shouldSnapshot && financialData) {
              const usedTable = clientTables.find((t: any) => t.id.toString() === (manualClientTableId || financialData.client.tableId));
              const snapshotNow = new Date().toISOString();
              const snapshotObj = {
                  route: mission.origin && mission.destination
                      ? `${(mission.origin || '').split(',')[0].trim()} X ${(mission.destination || '').split(',')[0].trim()}`
                      : (usedTable?.route_name || '-'),
                  tableName: usedTable?.operation_type || '-',
                  clientTableId: manualClientTableId || financialData.client.tableId || null,
                  providerTableId: sanitizeProviderTableId(manualProviderTableId || financialData.provider.tableId),
                  activationFee: usedTable?.activation_fee ?? financialData.client.base,
                  franchiseKm: usedTable?.franchise_km ?? 0,
                  franchiseHours: usedTable?.franchise_hours ?? 0,
                  unitKm: usedTable?.price_per_extra_km ?? 0,
                  unitHr: usedTable?.price_per_extra_hour ?? 0,
                  kmTotal: financialData.realTraveledKm,
                  kmExtraQtd: financialData.client.excessKm,
                  kmExtraTotal: financialData.client.extraKmVal,
                  hrExtraQtd: financialData.client.excessHours,
                  hrExtraTotal: financialData.client.extraHrVal,
                  durationHours: financialData.durationHours,
                  tollVal: toll,
                  tollProvider: tollProv,
                  displacementVal: displacement,
                  displacementProvider: isSameOs ? 0 : dispProv,
                  systemCalculatedRevenue: r2(calcRevTotal),
                  systemCalculatedCost: r2(calcCostTotal),
                  revenueServiceOnly: r2(revServiceOnly),
                  costServiceOnly: r2(costServiceOnly),
                  totalGeral: r2(revServiceOnly + toll + displacement),
                  iblFee: financialData.iblFee || 0
              };
              basePayload.snapshot_data = snapshotObj;
              basePayload.snapshot_approved_by = userName;
              basePayload.snapshot_approved_at = snapshotNow;
          }
          const reasonFields: any = {};
          if (revDivergent && revenueEditReason.trim()) {
              reasonFields.revenue_edit_reason = `[${userName} - ${formatNowDateTimeBR()}] ${revenueEditReason.trim()}`;
          }
          if ((costDivergent || autoEngineDivergent) && costEditReason.trim()) {
              const prefix = autoEngineDivergent
                  ? `[${userName} - ${formatNowDateTimeBR()}] [DIVERGENTE DO MOTOR AUTO R$ ${(autoEngineSuggestedCost || 0).toFixed(2)}]`
                  : `[${userName} - ${formatNowDateTimeBR()}]`;
              reasonFields.cost_edit_reason = `${prefix} ${costEditReason.trim()}`;
          }
          if (r2(revServiceOnly) === 0 && !reasonFields.revenue_edit_reason) {
              reasonFields.revenue_edit_reason = `[${userName} - ${formatNowDateTimeBR()}] Valor zero confirmado`;
          }
          if (r2(costServiceOnly) === 0 && !reasonFields.cost_edit_reason) {
              reasonFields.cost_edit_reason = `[${userName} - ${formatNowDateTimeBR()}] Valor zero confirmado`;
          }
          // Proteção contra reversão pelo /api/recalculate-all:
          // QUALQUER clique em "Salvar Ajustes" trava a OS contra o
          // recalculador automático. Se houve divergência ou edição manual
          // explícita, a mensagem detalha; caso contrário, marca apenas que
          // foi um salvamento manual confirmado pelo usuário. Isso garante
          // que abrir a tela de Missões novamente NUNCA reverta o valor.
          const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          const stamp = `[${userName} - ${formatNowDateTimeBR()}]`;
          if (!reasonFields.revenue_edit_reason) {
              reasonFields.revenue_edit_reason = revDivergent
                  ? `${stamp} Edição manual (sem justificativa) — receita salva: ${brl(r2(revServiceOnly))} | sistema sugeria: ${brl(r2(calcRevTotal))}`
                  : `${stamp} Salvamento manual confirmado — receita: ${brl(r2(revServiceOnly))}`;
          }
          if (!reasonFields.cost_edit_reason) {
              if (costDivergent || autoEngineDivergent) {
                  const sysHint = autoEngineDivergent
                      ? `motor auto sugeria: ${brl(autoEngineSuggestedCost || 0)}`
                      : `sistema sugeria: ${brl(r2(calcCostTotal))}`;
                  reasonFields.cost_edit_reason = `${stamp} Edição manual (sem justificativa) — custo salvo: ${brl(r2(costServiceOnly))} | ${sysHint}`;
              } else {
                  reasonFields.cost_edit_reason = `${stamp} Salvamento manual confirmado — custo: ${brl(r2(costServiceOnly))}`;
              }
          }

          const fullPayload = { ...basePayload, toll_value_provider: isSameOs ? 0 : r2(tollProv), displacement_value_provider: isSameOs ? 0 : r2(dispProv), ...reasonFields };
          let result = await supabase.from('missions').update(fullPayload).eq('id', mission.id).select('id, revenue_value, cost_value, toll_value, last_update').single();
          if (!result.error && shouldSnapshot && basePayload.snapshot_data) {
              await supabase.from('system_logs').insert([{
                  user_name: userName,
                  action_type: 'SNAPSHOT',
                  entity: 'BillingSnapshot',
                  entity_id: mission.id,
                  details: JSON.stringify({ ...basePayload.snapshot_data, approved_by: userName, approved_at: basePayload.snapshot_approved_at })
              }]);
          }
          if (result.error && (result.error.message?.includes('does not exist') || result.error.message?.includes('check_snapshot_not_empty'))) {
              const { snapshot_data, snapshot_approved_by, snapshot_approved_at, ...payloadWithoutSnapshot } = fullPayload;
              delete payloadWithoutSnapshot.snapshot_data;
              result = await supabase.from('missions').update(payloadWithoutSnapshot).eq('id', mission.id).select('id, revenue_value, cost_value, toll_value, last_update').single();
              if (result.error && (result.error.message?.includes('does not exist') || result.error.message?.includes('check_snapshot_not_empty'))) {
                  const { toll_value_provider, displacement_value, displacement_value_provider, snapshot_data: _sd, ...payloadMin } = payloadWithoutSnapshot;
                  delete payloadMin.snapshot_data;
                  result = await supabase.from('missions').update(payloadMin).eq('id', mission.id).select('id, revenue_value, cost_value, toll_value, last_update').single();
              }
              if (snapshot_data && !result.error) {
                  await supabase.from('system_logs').insert([{
                      user_name: userName,
                      action_type: 'SNAPSHOT',
                      entity: 'BillingSnapshot',
                      entity_id: mission.id,
                      details: JSON.stringify({ ...snapshot_data, approved_by: snapshot_approved_by, approved_at: snapshot_approved_at })
                  }]);
              }
          }
          if (result.error) throw result.error;
          if (!result.data) throw new Error('Falha na persistência: registro não retornado após UPDATE');

          // Task #66 — VALUE_EDIT_REASON sempre é gravado quando há divergência
          // (do motor automático ou da tabela manual), garantindo que a aba
          // "Edições Manuais" sempre tenha o motivo registrado.
          if (Object.keys(reasonFields).length > 0) {
              try {
                  await supabase.from('system_logs').insert([{
                      user_name: userName,
                      action_type: 'VALUE_EDIT_REASON',
                      entity: 'Mission',
                      entity_id: mission.id,
                      details: JSON.stringify({
                          ...reasonFields,
                          autoEngineActive,
                          autoEngineSuggestedCost,
                          savedCostServiceOnly: r2(costServiceOnly),
                          autoEngineDivergent,
                      })
                  }]);
              } catch (logErr) {
                  console.warn('[Task #66] Falha ao gravar VALUE_EDIT_REASON', logErr);
              }
          }

          // Task #55 — Audit log do motor auto quando ativo
          if (financialData?.autoEngine?.active && !isSameOs) {
              try {
                  await supabase.from('system_logs').insert([{
                      user_name: userName,
                      action_type: 'FINANCIAL_RECALC',
                      entity: 'Mission',
                      entity_id: mission.id,
                      details: JSON.stringify({
                          source: 'provider_auto_engine',
                          bandKm: financialData.autoEngine.bandKm,
                          bandHours: financialData.autoEngine.bandHours,
                          realKm: financialData.autoEngine.realKm,
                          goldenHours: financialData.autoEngine.durationHours,
                          effectiveStart: financialData.autoEngine.effectiveStartIso,
                          end: financialData.autoEngine.endIso,
                          suggestedTotal: financialData.autoEngine.totalCost,
                          savedCost: r2(costServiceOnly),
                          divergent: Math.abs(financialData.autoEngine.totalCost - costServiceOnly) > 0.01,
                          timestamp: new Date().toISOString(),
                      }),
                  }]);
              } catch (logErr) {
                  console.warn('[Task #55] Falha ao gravar audit FINANCIAL_RECALC', logErr);
              }
          }
          
          const savedRevCheck = safeNumber(result.data.revenue_value);
          const savedTollCheck = safeNumber(result.data.toll_value);
          if (Math.abs(savedRevCheck - revServiceOnly) > 0.01 || Math.abs(savedTollCheck - toll) > 0.01) {
              console.error('[AUDIT] Divergência pós-salvamento detectada!', { esperado: { rev: revServiceOnly, toll }, banco: { rev: savedRevCheck, toll: savedTollCheck } });
          }

          if (!shouldSnapshot && mission.snapshot_approved_by && mission.snapshot_data) {
              const existingSnap = mission.snapshot_data as any;
              const usedTableNow = clientTables.find((t: any) => t.id.toString() === (manualClientTableId || financialData?.client.tableId));
              const newClientTableId = manualClientTableId || financialData?.client.tableId || null;
              const newActivationFee = usedTableNow?.activation_fee ?? financialData?.client.base ?? existingSnap.activationFee ?? 0;
              const newFranchiseKm = usedTableNow?.franchise_km ?? existingSnap.franchiseKm ?? 0;
              const newFranchiseHours = usedTableNow?.franchise_hours ?? existingSnap.franchiseHours ?? 0;
              const newUnitKm = usedTableNow?.price_per_extra_km ?? existingSnap.unitKm ?? 0;
              const newUnitHr = usedTableNow?.price_per_extra_hour ?? existingSnap.unitHr ?? 0;
              const newKmExtraQtd = financialData?.client.excessKm ?? existingSnap.kmExtraQtd ?? 0;
              const newKmExtraTotal = financialData?.client.extraKmVal ?? existingSnap.kmExtraTotal ?? 0;
              const newHrExtraQtd = financialData?.client.excessHours ?? existingSnap.hrExtraQtd ?? 0;
              const newHrExtraTotal = financialData?.client.extraHrVal ?? existingSnap.hrExtraTotal ?? 0;
              const newDurationHours = financialData?.durationHours ?? existingSnap.durationHours ?? 0;
              const newTableName = usedTableNow?.operation_type ?? existingSnap.tableName ?? '-';

              const revenueChanged = existingSnap.revenueServiceOnly !== revServiceOnly;
              const costChanged = existingSnap.costServiceOnly !== costServiceOnly;
              const tollChanged = existingSnap.tollVal !== toll;
              const tollProvChanged = existingSnap.tollProvider !== tollProv;
              const dispChanged = (existingSnap.displacementVal || 0) !== displacement;
              const dispProvChanged = (existingSnap.displacementProvider || 0) !== dispProv;
              const tableChanged = String(existingSnap.clientTableId || '') !== String(newClientTableId || '');
              const breakdownChanged = (
                  r2(existingSnap.activationFee || 0) !== r2(newActivationFee) ||
                  (existingSnap.franchiseKm || 0) !== newFranchiseKm ||
                  (existingSnap.franchiseHours || 0) !== newFranchiseHours ||
                  r2(existingSnap.unitKm || 0) !== r2(newUnitKm) ||
                  r2(existingSnap.unitHr || 0) !== r2(newUnitHr) ||
                  r2(existingSnap.kmExtraTotal || 0) !== r2(newKmExtraTotal) ||
                  r2(existingSnap.hrExtraTotal || 0) !== r2(newHrExtraTotal)
              );

              if (revenueChanged || costChanged || tollChanged || tollProvChanged || dispChanged || dispProvChanged || tableChanged || breakdownChanged) {
                  const updatedSnap = {
                      ...existingSnap,
                      // valores financeiros
                      revenueServiceOnly: r2(revServiceOnly),
                      costServiceOnly: r2(costServiceOnly),
                      tollVal: r2(toll),
                      tollProvider: r2(tollProv),
                      displacementVal: r2(displacement),
                      displacementProvider: r2(dispProv),
                      totalGeral: r2(revServiceOnly + toll + displacement),
                      // tabela e breakdown atual — mantém o snapshot
                      // alinhado com a tabela escolhida na auditoria
                      clientTableId: newClientTableId,
                      providerTableId: sanitizeProviderTableId(manualProviderTableId || financialData?.provider.tableId || existingSnap.providerTableId),
                      tableName: newTableName,
                      activationFee: r2(newActivationFee),
                      franchiseKm: newFranchiseKm,
                      franchiseHours: newFranchiseHours,
                      unitKm: r2(newUnitKm),
                      unitHr: r2(newUnitHr),
                      kmExtraQtd: newKmExtraQtd,
                      kmExtraTotal: r2(newKmExtraTotal),
                      hrExtraQtd: newHrExtraQtd,
                      hrExtraTotal: r2(newHrExtraTotal),
                      durationHours: newDurationHours,
                      snapshot_resynced_at: new Date().toISOString(),
                      snapshot_resynced_by: userName,
                  };
                  const snapUpdRes = await supabase.from('missions').update({ snapshot_data: updatedSnap }).eq('id', mission.id);
                  if (snapUpdRes.error) {
                      console.error('[Snapshot Update] Falha ao sincronizar snapshot:', snapUpdRes.error);
                      showNotification('Erro', 'OS salva, mas falha ao sincronizar snapshot: ' + snapUpdRes.error.message, 'error');
                      return;
                  }
              }
          }
          
          if (isFullyApproved && manualClientTableId) {
              const missionProvNorm = (mission.provider || '').toUpperCase().trim();
              const routeKeyFull = `${mission.client}|${missionProvNorm}|${mission.origin}|${mission.destination}`.toUpperCase();
              const routeKeyBase = `${mission.client}|${mission.origin}|${mission.destination}`.toUpperCase();
              const details = JSON.stringify({
                  clientTableId: manualClientTableId,
                  providerTableId: sanitizeProviderTableId(manualProviderTableId),
                  tollValue: toll,
                  tollProviderValue: tollProv,
                  customClientBase: customClientBase || null,
                  customClientKm: customClientKm || null,
                  customClientHour: customClientHour || null,
                  customProviderBase: customProviderBase || null,
                  customProviderKm: customProviderKm || null,
                  customProviderHour: customProviderHour || null,
                  provider: missionProvNorm,
                  routeKeyFull,
                  routeKey: routeKeyBase
              });
              
              await supabase.from('system_logs').delete().eq('entity', 'BillingPattern').ilike('details', `%${routeKeyFull}%`);
              await supabase.from('system_logs').delete().eq('entity', 'BillingPattern').ilike('details', `%${routeKeyBase}%`);
              
              await supabase.from('system_logs').insert([{
                  user_name: 'IA_MEMORY',
                  action_type: 'UPDATE',
                  entity: 'BillingPattern',
                  entity_id: mission.id,
                  details: details
              }]);
          }

          const sysCalcCost = calcCostTotal;
          const sysCalcRevenue = calcRevTotal;
          const adjustmentDetails = JSON.stringify({
              clientTableId: manualClientTableId || financialData?.client.tableId || null,
              providerTableId: sanitizeProviderTableId(manualProviderTableId || financialData?.provider.tableId),
              clientTableName: financialData?.client.tableName || null,
              providerTableName: financialData?.provider.tableName || null,
              customClientBase: customClientBase || null,
              customClientKm: customClientKm || null,
              customClientHour: customClientHour || null,
              customProviderBase: customProviderBase || null,
              customProviderKm: customProviderKm || null,
              customProviderHour: customProviderHour || null,
              disableFixedKmRule: disableFixedKmRule,
              iblEnabled: iblEnabled,
              revenueTotal: r2(revTotal),
              costTotal: r2(costTotal),
              tollValue: r2(toll),
              tollProviderValue: r2(tollProv),
              systemCalculatedRevenue: r2(sysCalcRevenue),
              systemCalculatedCost: r2(sysCalcCost),
              revenueDivergent: revDivergent,
              costDivergent: costDivergent
          });

          const adjDelRes = await supabase.from('system_logs').delete().eq('entity', 'BillingAdjustment').eq('entity_id', mission.id);
          if (adjDelRes.error) {
              console.error('[BillingAdjustment Delete] Falha:', adjDelRes.error);
              showNotification('Erro', 'OS salva, mas falhou ao limpar log de ajuste anterior: ' + adjDelRes.error.message, 'error');
          }
          const adjInsRes = await supabase.from('system_logs').insert([{
              user_name: userName,
              action_type: approve ? 'APPROVE_SAVE' : 'MANUAL_SAVE',
              entity: 'BillingAdjustment',
              entity_id: mission.id,
              details: adjustmentDetails
          }]);
          if (adjInsRes.error) {
              console.error('[BillingAdjustment Insert] Falha ao registrar log:', adjInsRes.error);
              showNotification('Erro', 'OS salva, mas falhou ao registrar log de ajuste: ' + adjInsRes.error.message, 'error');
          }

          // Histórico permanente de alterações da OS (Data / Quem / Mudanças /
          // Observação). Acumulativo: nunca apaga registros anteriores. Gravado
          // sempre que houver alteração de valor após uma aprovação prévia.
          if (wasAlreadyApproved && detectedChanges.length > 0) {
              const nowIso = new Date().toISOString();
              const histPayload = {
                  user: userName,
                  role: userRole,
                  date: nowIso,
                  changes: detectedChanges,
                  note: editObservation.trim() || (approve ? 'Reaprovação' : ''),
                  approve
              };
              const histRes = await supabase.from('system_logs').insert([{
                  user_name: userName,
                  action_type: approve ? 'POST_APPROVAL_REAPPROVE' : 'POST_APPROVAL_EDIT',
                  entity: 'MissionEditHistory',
                  entity_id: mission.id,
                  details: JSON.stringify(histPayload)
              }]);
              if (histRes.error) {
                  console.error('[MissionEditHistory Insert] Falha ao registrar histórico:', histRes.error);
              } else {
                  setEditHistory(prev => [{ user: userName, date: nowIso, changes: detectedChanges, note: histPayload.note }, ...prev]);
                  setEditObservation('');
              }
          }

          const dateStr = formatNowDateTimeBR();
          const verifiedLabel = `${userName} (${dateStr})`;
          setSavedByInfo(verifiedLabel);

          setApprovalLog(newLog);
          
          setUseSavedValues(true);
          dbValuesLoadedRef.current = true;
          userManuallyEditedRef.current = true;

          setMission(prev => prev ? {
              ...prev,
              revenue_value: revServiceOnly,
              cost_value: costServiceOnly,
              toll_value: toll,
              toll_value_provider: tollProv,
              billing_approved: isApprovedForBilling,
              billing_verified_by: userName,
              ...(shouldSnapshot ? { snapshot_data: basePayload.snapshot_data, snapshot_approved_by: userName, snapshot_approved_at: basePayload.snapshot_approved_at } : {}),
              last_update: basePayload.last_update,
              ...(reasonFields.revenue_edit_reason ? { revenue_edit_reason: reasonFields.revenue_edit_reason } : {}),
              ...(reasonFields.cost_edit_reason ? { cost_edit_reason: reasonFields.cost_edit_reason } : {})
          } : prev);

          if (approve) {
              const snapshotMsg = shouldSnapshot ? ' 🔒 Dados Congelados!' : '';
              if (isFullyApproved) {
                  showNotification('Sucesso', `Faturamento Finalizado pela Diretoria!${snapshotMsg}`, 'success');
              } else if (isApprovedForBilling) {
                  showNotification('Sucesso', `Aprovado para Faturamento por ${userName}!${snapshotMsg} Aguardando Diretoria.`, 'success');
              } else {
                  showNotification('Sucesso', `${label} — Aguardando demais aprovações`, 'success');
              }
          } else {
              showNotification('Sucesso', `Ajustes Salvos por ${userName}`, 'success');
          }
          
          const resultado = revServiceOnly - costServiceOnly - toll - displacement;
          if (resultado < 0) {
              try {
                  await authFetch(`/api/missions/${mission.id}/loss-alert-email`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                          missionId: mission.id,
                          client: mission.client,
                          provider: mission.provider,
                          origin: mission.origin,
                          destination: mission.destination,
                          revenueTotal: r2(revServiceOnly),
                          costTotal: r2(costServiceOnly),
                          toll: r2(toll),
                          tollProvider: r2(tollProv),
                          resultado: r2(resultado),
                          userName,
                      })
                  });
                  console.log(`[Loss Alert] Email de prejuízo enviado para OS ${mission.id} — Resultado: R$ ${resultado.toFixed(2)}`);
              } catch (lossErr) {
                  console.warn('[Loss Alert] Falha ao enviar email:', lossErr);
              }
          }

          if (onUpdate) onUpdate();
          window.dispatchEvent(new CustomEvent('refreshMissions'));
          if (!approve || isFullyApproved) onClose();
      } catch (e: any) {
          console.error('[SAVE ERROR]', e?.message, e?.details, e?.hint);
          const msg = e instanceof Error ? e.message : (e?.message || 'Erro desconhecido');
          showNotification('Erro', `Erro ao salvar: ${msg}`, 'error');
      } finally { setIsUpdating(false); isSavingRef.current = false; }
  };

  const filteredProviderTables = useMemo(() => {
      if (!mission?.provider) return providerTables;
      const norm = (s: string) => (s || '')
          .toUpperCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[.,\/&\-]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      const target = norm(mission.provider);
      if (!target) return providerTables;
      // Conjunto de chaves aceitas: o nome da OS + todos os apelidos do
      // fornecedor (razão social e nome fantasia).
      const acceptedExact = new Set<string>([target, ...providerAliases]);
      // 1) match exato (em qualquer apelido)
      const exact = providerTables.filter(t => acceptedExact.has(norm(t.provider || '')));
      if (exact.length) return exact;
      // 2) um contém o outro — testando contra o nome da OS e contra cada apelido
      const contains = providerTables.filter(t => {
          const tp = norm(t.provider || '');
          if (tp.length <= 2) return false;
          if (tp.includes(target) || target.includes(tp)) return true;
          for (const a of providerAliases) {
              if (a.length > 2 && (tp.includes(a) || a.includes(tp))) return true;
          }
          return false;
      });
      if (contains.length) return contains;
      // 3) compartilha pelo menos uma palavra significativa (>2 chars)
      const allWords = new Set<string>();
      [target, ...providerAliases].forEach(s => s.split(' ').filter(w => w.length > 2).forEach(w => allWords.add(w)));
      if (allWords.size === 0) return providerTables;
      return providerTables.filter(t => {
          const tp = norm(t.provider || '');
          if (tp.length <= 2) return false;
          for (const w of allWords) { if (tp.includes(w)) return true; }
          return false;
      });
  }, [providerTables, mission?.provider, providerAliases]);

  const handleAiSuggest = async () => {
      if (!mission || aiLoading) return;
      setAiLoading(true);
      setAiSuggestion(null);
      try {
          const originUF = extractUF(mission.origin || '');
          const region = UF_TO_REGION[originUF] || '';
          const totalKm = safeNumber(mission.totalDistance);
          const agentCount = financialData?.agentCount || 1;

          const clientTablesForAi = clientTables.map(t => ({
              id: String(t.id),
              operation_type: t.operation_type || '',
              activation_fee: t.activation_fee || 0,
              franchise_km: t.franchise_km || 0,
              franchise_hours: t.franchise_hours || 0,
              price_per_extra_km: t.price_per_extra_km || 0,
              price_per_extra_hour: t.price_per_extra_hour || 0,
          }));

          const providerTablesForAi = filteredProviderTables.map(t => ({
              id: String(t.id),
              operation_type: t.operation_type || '',
              activation_cost: t.activation_cost || 0,
              franchise_km: t.franchise_km || 0,
              franchise_hours: t.franchise_hours || 0,
              cost_per_extra_km: t.cost_per_extra_km || 0,
              cost_per_extra_hour: t.cost_per_extra_hour || 0,
          }));

          const result = await suggestPriceTable({
              mission: {
                  origin: mission.origin || '',
                  destination: mission.destination || '',
                  totalKm,
                  missionType: mission.mission_type || 'CARACTERIZADA',
                  client: mission.client || '',
                  provider: mission.provider || '',
                  agentCount,
                  originUF,
                  region,
              },
              clientTables: clientTablesForAi,
              providerTables: providerTablesForAi,
          });

          setAiSuggestion(result);
      } catch (err) {
          console.error('AI Suggest error:', err);
          setAiSuggestion(null);
      } finally {
          setAiLoading(false);
      }
  };

  if (!isOpen || !mission) return null;

  const isZeroCostError = financialData && financialData.provider.base === 0 && !mission.is_same_os && (financialData.realTraveledKm > 0 || financialData.durationHours > 0);
  
  const missionStatusTrim = (mission?.status || '').trim();
  const requiresTollGate = missionStatusTrim === 'Concluída' || missionStatusTrim === 'Cancelada';
  const footerRevTotal = parseNumber(revenueInput);
  const footerCostTotal = parseNumber(costInput);
  const footerProfit = footerRevTotal - footerCostTotal;
  const footerMarginPct = footerRevTotal > 0 ? (footerProfit / footerRevTotal) * 100 : 0;

  const openAuditSummaryPanel = async () => {
    if (!mission || auditSummaryLoading) return;
    setShowAuditSummary(true);
    setAuditSummaryLoading(true);
    setAuditSummaryData(null);
    setAuditSummaryEditText('');
    setAuditSummaryView('visual');
    try {
      const token = localStorage.getItem('authToken');
      const settingsHeaders = token ? { Authorization: `Bearer ${token}` } : {};
      let summarySettings: { aiPromptPrefix?: string; temperature?: number; maxOutputTokens?: number } | null = null;
      try {
        const sRes = await fetch('/api/admin/system-settings/audit-summary', { headers: settingsHeaders });
        const sJson = await sRes.json();
        if (sJson?.ok && sJson.settings) summarySettings = sJson.settings;
      } catch { /* usa padrão embutido */ }

      const clientTable = clientTables.find(t => String(t.id) === String(manualClientTableId));
      const providerTable = providerTables.find(t => String(t.id) === String(manualProviderTableId));
      const tradingName =
        providersList.find(p => p.trading_name && p.trading_name.trim())?.trading_name?.trim() ||
        formatProviderName(mission.provider);
      const data = await buildAuditSummaryData({
        mission,
        providerTradingName: tradingName,
        clientTableLabel: clientTable?.operation_type,
        providerTableLabel: providerTable?.operation_type,
        includeDirectorSection: isDirectorAccess,
        withAiSummary: isDirectorAccess,
        revenueTotal: footerRevTotal,
        costTotal: footerCostTotal,
        marginPct: footerMarginPct,
        aiPromptPrefix: summarySettings?.aiPromptPrefix,
        aiTemperature: summarySettings?.temperature,
        aiMaxOutputTokens: summarySettings?.maxOutputTokens,
      });
      setAuditSummaryData(data);
      setAuditSummaryEditText(data.whatsappText);
    } catch (e) {
      console.error('[auditSummary]', e);
      showNotification('Erro', 'Não foi possível gerar o resumo da auditoria.', 'error');
      setShowAuditSummary(false);
    } finally {
      setAuditSummaryLoading(false);
    }
  };

  const copyAuditSummary = () => {
    const text = (auditSummaryEditText || auditSummaryData?.whatsappText || '').trim();
    if (!text) return;
    void copyTextAsync(text).then(ok => {
      if (!ok) {
        showNotification('Erro', 'Não foi possível copiar o resumo.', 'error');
        return;
      }
      showNotification('Sucesso', 'Resumo da auditoria copiado!', 'success');
    });
  };
  
  const isInheritedToll = false;
  const isSavedZero = tollSource === 'VALOR SALVO (R$ 0,00)';
  const isAwaitingCheck = tollSource === 'AGUARDANDO CONFERÊNCIA';

  return (
    <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center overflow-y-auto bg-black/80 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in">
      
      {showAuditSummary && (
          <div className="absolute inset-0 z-[125] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setShowAuditSummary(false)}>
              <div
                  className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col border border-gray-200"
                  onClick={e => e.stopPropagation()}
                  data-testid="panel-audit-summary"
              >
                  <div className="bg-[#0f172a] text-white px-5 py-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 bg-emerald-600 rounded-xl shrink-0"><FileText size={18} /></div>
                          <div className="min-w-0">
                              <h4 className="font-black text-sm uppercase tracking-wide">Resumo da Auditoria</h4>
                              <p className="text-[10px] text-gray-400 truncate">OS {mission.id}{isDirectorAccess ? ' · bloco diretoria incluído' : ''}</p>
                          </div>
                      </div>
                      <button type="button" onClick={() => setShowAuditSummary(false)} className="p-2 rounded-full hover:bg-white/10 shrink-0">
                          <X size={18} />
                      </button>
                  </div>

                  <div className="px-4 py-2 border-b bg-white flex gap-2">
                      <button
                          type="button"
                          onClick={() => setAuditSummaryView('visual')}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase ${auditSummaryView === 'visual' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                      >
                          Visual
                      </button>
                      <button
                          type="button"
                          onClick={() => setAuditSummaryView('text')}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase ${auditSummaryView === 'text' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                      >
                          Texto / WhatsApp
                      </button>
                  </div>

                  <div className="flex-1 overflow-auto p-4 bg-slate-100/80">
                      {auditSummaryLoading ? (
                          <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
                              <Loader2 size={28} className="animate-spin text-emerald-600" />
                              <p className="text-xs font-bold uppercase tracking-widest">Montando resumo{isDirectorAccess ? ' e IA' : ''}…</p>
                          </div>
                      ) : auditSummaryView === 'text' ? (
                          <textarea
                              className="w-full min-h-[320px] border border-gray-300 rounded-xl p-4 text-xs font-mono leading-relaxed bg-white"
                              value={auditSummaryEditText}
                              onChange={e => setAuditSummaryEditText(e.target.value)}
                              data-testid="textarea-audit-summary-edit"
                          />
                      ) : auditSummaryData ? (
                          <AuditSummaryPanel data={auditSummaryData.display} />
                      ) : null}
                  </div>

                  <div className="px-4 py-3 border-t bg-white flex flex-wrap gap-2 justify-end">
                      <button
                          type="button"
                          onClick={() => setShowAuditSummary(false)}
                          className="px-4 py-2 rounded-xl text-[10px] font-black uppercase text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                      >
                          Fechar
                      </button>
                      <button
                          type="button"
                          onClick={copyAuditSummary}
                          disabled={auditSummaryLoading || !(auditSummaryEditText || auditSummaryData?.whatsappText)}
                          className="px-4 py-2 rounded-xl text-[10px] font-black uppercase text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                          data-testid="btn-copy-audit-summary"
                      >
                          <Copy size={12} /> Copiar Resumo
                      </button>
                      {isDirectorAccess && (
                          <button
                              type="button"
                              onClick={() => void openAuditSummaryPanel()}
                              disabled={auditSummaryLoading}
                              className="px-4 py-2 rounded-xl text-[10px] font-black uppercase text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                          >
                              <Sparkles size={12} /> Atualizar IA
                          </button>
                      )}
                  </div>
              </div>
          </div>
      )}

      {isCapturing && (
          <div className="absolute inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="bg-white rounded-2xl px-8 py-6 flex items-center gap-4 shadow-2xl border-2 border-blue-200 animate-pulse">
                  <Camera size={28} className="text-blue-600" />
                  <div>
                      <p className="text-sm font-black text-blue-800 uppercase">Capturando Print...</p>
                      <p className="text-[10px] text-gray-500">Registrando tela para auditoria</p>
                  </div>
              </div>
          </div>
      )}

      {screenshotPreview && (
          <div className="absolute inset-0 z-[115] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={() => setScreenshotPreview(null)}>
              <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[95vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-emerald-50 to-blue-50">
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-emerald-100 rounded-lg"><Camera size={18} className="text-emerald-700" /></div>
                          <div>
                              <p className="text-sm font-black text-gray-800 uppercase">Print da Aprovacao</p>
                              <p className="text-[10px] text-gray-500">Registro visual no momento da aprovacao - {mission.id}</p>
                          </div>
                      </div>
                      <button onClick={() => setScreenshotPreview(null)} className="p-2 rounded-full hover:bg-gray-100 transition-colors">
                          <X size={20} className="text-gray-500" />
                      </button>
                  </div>
                  <div className="flex-1 overflow-auto p-4 bg-gray-100">
                      <img src={screenshotPreview} alt="Print da aprovação" className="w-full rounded-xl border border-gray-300 shadow-lg" />
                  </div>
                  <div className="p-3 border-t bg-white flex justify-end">
                      <a href={screenshotPreview} download={`print_${mission.id}_${Date.now()}.jpg`} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors" data-testid="btn-download-screenshot">
                          <Save size={14} /> Baixar Imagem
                      </a>
                  </div>
              </div>
          </div>
      )}

      {isEditClientTableOpen && (
          <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in zoom-in-95">
              <div className="bg-white rounded-2xl w-full max-w-3xl p-6 relative shadow-2xl border-2 border-blue-100">
                  <div className="flex justify-between items-center mb-6 border-b pb-4">
                      <h3 className="font-black text-lg text-blue-700 uppercase flex items-center gap-2">
                          <Zap size={20} /> {editClientTableId ? 'Editar Tabela de Preço' : 'Cadastro de Tabela de Preço'}
                      </h3>
                      <button onClick={() => setIsEditClientTableOpen(false)} className="p-2 bg-gray-100 rounded-full hover:bg-blue-50 text-gray-500 hover:text-blue-500 transition-colors">
                          <X size={20}/>
                      </button>
                  </div>
                  <ClientPriceForm 
                      onBack={() => { setIsEditClientTableOpen(false); setEditClientTableId(null); }} 
                      onSuccess={async (newTableId?: string) => {
                          const missionClient = mission?.originalClientName || mission?.client || '';
                          const data = missionClient ? await fetchClientPriceTables(supabase, missionClient) : [];
                          if (data.length > 0) {
                              setClientTables(data as any);
                              setCustomClientBase('');
                              setCustomClientKm('');
                              setCustomClientHour('');
                              setUseSavedValues(false);
                              const effectiveClientTableId = newTableId || manualClientTableId;
                              if (newTableId) {
                                  setManualClientTableId(newTableId);
                              }
                              // O número grande (VALOR FINAL CLIENTE) precisa ACOMPANHAR os
                              // preços recém-editados da tabela. Quando a OS tem edição manual
                              // ou aprovação (userManuallyEditedRef=true), o autofill não roda e
                              // o número ficava "congelado" mesmo com a memória de cálculo já
                              // refletindo os novos valores. Recalculamos SÓ o número do cliente,
                              // usando a tabela fresca (`data`, pois setClientTables ainda não
                              // refletiu no estado), sem tocar no fornecedor (preserva o override
                              // do controller) e só quando há permissão de recálculo
                              // (lockAllowsRecalc) — snapshot travado sem permissão fica intacto.
                              if (lockAllowsRecalc && mission) {
                                  try {
                                      const fin = calculateMissionFinancials(
                                          { ...mission, toll_value: parseNumber(tollInput) },
                                          data as any, providerTables, clientData, currentTime,
                                          {
                                              clientTableId: effectiveClientTableId || undefined,
                                              providerTableId: manualProviderTableId || undefined,
                                              forceIblFee: iblEnabled,
                                              disableFixedKmRule: disableFixedKmRule || undefined,
                                              providerOpsOverride,
                                          },
                                          providersList,
                                      );
                                      if (fin) {
                                          const total = fin.client.serviceTotal + parseNumber(tollInput) + parseNumber(displacementInput);
                                          setRevenueInput(total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                                      }
                                  } catch (e) {
                                      console.warn('[Tabela Cliente] Falha ao recalcular número grande após edição da tabela:', e);
                                  }
                              }
                              showNotification('Atualizado', 'Tabela de preço atualizada. Valores recalculados.', 'success');
                          }
                          setIsEditClientTableOpen(false);
                          setEditClientTableId(null);
                      }}
                      id={editClientTableId}
                      defaultClient={!editClientTableId ? (clientData?.name || mission?.originalClientName || mission?.client || '') : undefined}
                  />
              </div>
          </div>
      )}

      {isAddCostModalOpen && (
          <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in zoom-in-95">
              <div className="bg-white rounded-2xl w-full max-w-3xl p-6 relative shadow-2xl border-2 border-red-100">
                  <div className="flex justify-between items-center mb-6 border-b pb-4">
                      <h3 className="font-black text-lg text-red-700 uppercase flex items-center gap-2">
                          <Zap size={20} /> {editCostTableId ? 'Editar Tabela de Custo' : 'Cadastro de Tabela Rápido'}
                      </h3>
                      <button onClick={() => setIsAddCostModalOpen(false)} className="p-2 bg-gray-100 rounded-full hover:bg-red-50 text-gray-500 hover:text-red-500 transition-colors">
                          <X size={20}/>
                      </button>
                  </div>
                  <ProviderCostForm 
                      onBack={() => { setIsAddCostModalOpen(false); setEditCostTableId(null); }} 
                      onSuccess={handleNewCostTableSuccess}
                      id={editCostTableId}
                      fixedProviderName={editCostTableId ? undefined : mission.provider}
                      defaultOperationType={editCostTableId ? undefined : (() => {
                          const extractCity = (addr: string) => {
                              if (!addr) return '';
                              const parts = addr.split(',')[0].split('-')[0].trim();
                              return parts.toUpperCase();
                          };
                          const originCity = extractCity(mission.origin || '');
                          const destCity = extractCity(mission.destination || '');
                          const region = financialData?.detectedRegion || '';
                          const prefix = region ? `${region.toUpperCase()} - ` : '';
                          if (originCity && destCity) return `${prefix}${originCity} X ${destCity}`;
                          return mission.mission_type?.toUpperCase() || 'CARACTERIZADA';
                      })()}
                  />
              </div>
          </div>
      )}

      <div className="my-3 sm:my-0 bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[95vh] border border-gray-200 relative z-[100]">
        <header className="bg-[#0f172a] text-white p-5 flex flex-col gap-3 shrink-0">
          <div className="flex flex-col xl:flex-row xl:justify-between xl:items-start gap-3">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="p-2.5 bg-red-600 rounded-xl shadow-lg shrink-0"><Calculator size={24} /></div>
              <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-xl leading-tight truncate">
                    Auditoria de Faturamento
                    <span className="text-gray-400 text-sm font-normal"> # {mission.id}</span>
                    {isDhlSupplyClient(mission.originalClientName || mission.client) && (mission as any).dhl_se_number && (
                      <span
                        data-testid="text-dhl-se-number"
                        className="ml-2 align-middle text-amber-300 text-xs font-bold bg-amber-900/40 border border-amber-500/40 px-2 py-0.5 rounded"
                        title="Número da S.E. DHL"
                      >
                        S.E. {String((mission as any).dhl_se_number).trim()}
                      </span>
                    )}
                  </h3>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="bg-blue-900 text-blue-200 text-[9px] px-2 py-0.5 rounded font-bold uppercase flex items-center gap-1" title={mission.client}><Building2 size={10}/> <span className="truncate max-w-[180px]">{mission.client}</span></span>
                      <span className="bg-indigo-900 text-indigo-200 text-[9px] px-2 py-0.5 rounded font-bold uppercase flex items-center gap-1" title={formatProviderName(mission.provider)}><Briefcase size={10}/> <span className="truncate max-w-[180px]">{formatProviderName(mission.provider)}</span></span>
                  </div>
              </div>
            </div>
          <div className="flex flex-wrap items-center gap-2 xl:shrink-0">
            {mission.is_same_os && mission.parent_mission_id && (
              <span data-testid="chip-is-child" className="text-[9px] font-black bg-blue-600 text-white px-2 py-1 rounded uppercase flex items-center gap-1">
                <Link2 size={10} /> FILHA DE: {mission.parent_mission_id}
              </span>
            )}
            {!mission.is_same_os && !mission.parent_mission_id && (() => {
              const childCount = linkedMissions.filter(lm => lm.is_same_os).length;
              if (childCount === 0) return null;
              return (
                <span data-testid="chip-is-parent" className="text-[9px] font-black bg-amber-500 text-white px-2 py-1 rounded uppercase flex items-center gap-1">
                  <Layers size={10} /> MÃE ({childCount} {childCount === 1 ? 'vinculada' : 'vinculadas'})
                </span>
              );
            })()}
            <button
              data-testid="btn-toggle-same-os"
              onClick={async () => {
                const newVal = !mission.is_same_os;
                if (newVal && !confirm('Marcar como MESMA OS? O custo do fornecedor será zerado.')) return;
                if (!newVal && !confirm('Desmarcar MESMA OS? O custo do fornecedor será recalculado.')) return;
                try {
                  const updateData: any = { is_same_os: newVal };
                  if (!newVal) updateData.parent_mission_id = null;
                  if (newVal) {
                    updateData.cost_value = 0;
                    updateData.toll_value_provider = 0;
                    updateData.displacement_value_provider = 0;
                  }
                  await supabase.from('missions').update(updateData).eq('id', mission.id);
                  const userData = JSON.parse(localStorage.getItem('user') || '{}');
                  await supabase.from('system_logs').insert([{
                    user_name: userData.name || 'Sistema',
                    action_type: 'UPDATE',
                    entity: 'Mission',
                    entity_id: mission.id,
                    details: JSON.stringify({ field: 'is_same_os', oldValue: mission.is_same_os, newValue: newVal })
                  }]);
                  mission.is_same_os = newVal;
                  if (!newVal) mission.parent_mission_id = undefined;
                  if (newVal) {
                    mission.cost_value = 0;
                    (mission as any).toll_value_provider = 0;
                    (mission as any).displacement_value_provider = 0;
                    setCostInput('0,00');
                    setTollProviderInput('0,00');
                  }
                  broadcastMissionRefresh();
                  showNotification(newVal ? 'MESMA OS Ativada' : 'MESMA OS Desativada', newVal ? 'Custo do fornecedor zerado.' : 'Custo será recalculado.', 'success');
                  onUpdate();
                  await loadData();
                } catch (err: any) {
                  showNotification('Erro', err.message, 'error');
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all shadow-md active:scale-95 ${
                mission.is_same_os 
                  ? 'bg-black text-white hover:bg-gray-800' 
                  : 'bg-white/10 text-gray-300 hover:bg-white/20 border border-white/20'
              }`}
              title={mission.is_same_os ? 'Missão marcada como Mesma OS (custo zero)' : 'Clique para marcar como Mesma OS'}
            >
              <Layers size={12} />
              {mission.is_same_os ? 'MESMA OS ✓' : 'MESMA OS'}
            </button>
            {canActivateFullEdit && (
              <button
                data-testid="btn-toggle-full-edit"
                onClick={async () => {
                  const turningOn = !fullEditMode;
                  if (turningOn && !confirm('Ativar MODO EDIÇÃO TOTAL? Todos os campos da OS ficarão editáveis. A ação será registrada no histórico permanente.')) return;
                  setFullEditMode(turningOn);
                  if (turningOn) {
                    try {
                      const u = JSON.parse(localStorage.getItem('userData') || '{}');
                      await supabase.from('system_logs').insert([{
                        user_name: u.name || u.username || 'Sistema',
                        action_type: 'FULL_EDIT_MODE_ENABLED',
                        entity: 'MissionEditHistory',
                        entity_id: mission.id,
                        details: JSON.stringify({ enabledBy: u.name || u.username, role: u.role || '', at: new Date().toISOString(), missionId: mission.id })
                      }]);
                    } catch (e) { console.warn('Falha ao registrar Modo Edição Total:', e); }
                    showNotification('Modo Edição Total', 'Todos os campos liberados. Cada alteração será registrada.', 'success');
                  } else {
                    showNotification('Modo Edição Total Desligado', 'Travas padrão restauradas.', 'info');
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all shadow-md active:scale-95 ${
                  fullEditMode
                    ? 'bg-amber-500 text-white hover:bg-amber-600 ring-2 ring-amber-300'
                    : 'bg-white/10 text-amber-200 hover:bg-white/20 border border-amber-400/40'
                }`}
                title={fullEditMode ? 'Modo Edição Total ATIVO — clique para desligar' : 'Liberar edição de TODOS os campos da OS (Barbara/Thiago)'}
              >
                {fullEditMode ? <ShieldCheck size={12}/> : <Lock size={12}/>}
                {fullEditMode ? 'EDIÇÃO TOTAL ✓' : 'EDIÇÃO TOTAL'}
              </button>
            )}
            <button
              type="button"
              data-testid="btn-audit-summary"
              onClick={() => void openAuditSummaryPanel()}
              disabled={auditSummaryLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all shadow-md active:scale-95 bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60"
              title="Gerar resumo operacional da OS para copiar (WhatsApp/e-mail)"
            >
              {auditSummaryLoading ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
              Resumo
            </button>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors"><X size={24}/></button>
          </div>
          </div>

          {/* Origem / Destino / KM total — empilhados para evitar corte de texto */}
          <div className="bg-[#13151f] border border-gray-800 rounded-md p-3 space-y-2">
              {isEditingRoute ? (
                  <>
                      <div className="flex items-start gap-2">
                          <MapPin size={14} className="text-red-500 mt-2 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Origem</label>
                              {isMapsLoaded ? (
                                  <Autocomplete
                                      onLoad={ref => (originAutocompleteRef.current = ref)}
                                      onPlaceChanged={() => {
                                          const place = originAutocompleteRef.current?.getPlace();
                                          if (place && place.formatted_address) {
                                              setEditOrigin(place.formatted_address.toUpperCase());
                                          }
                                      }}
                                      options={{ componentRestrictions: { country: 'br' } }}
                                  >
                                      <input
                                          type="text"
                                          value={editOrigin}
                                          onChange={e => setEditOrigin(e.target.value.toUpperCase())}
                                          className="w-full bg-white/10 border border-white/30 rounded px-2 py-1.5 text-sm font-bold text-white uppercase outline-none focus:border-red-400 mt-0.5"
                                          placeholder="Buscar endereço de origem..."
                                          data-testid="input-edit-origin"
                                      />
                                  </Autocomplete>
                              ) : (
                                  <input
                                      type="text"
                                      value={editOrigin}
                                      onChange={e => setEditOrigin(e.target.value.toUpperCase())}
                                      className="w-full bg-white/10 border border-white/30 rounded px-2 py-1.5 text-sm font-bold text-white uppercase outline-none focus:border-red-400 mt-0.5"
                                      placeholder="Origem"
                                      data-testid="input-edit-origin"
                                  />
                              )}
                          </div>
                      </div>
                      <div className="flex items-start gap-2">
                          <MapPin size={14} className="text-green-500 mt-2 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Destino</label>
                              {isMapsLoaded ? (
                                  <Autocomplete
                                      onLoad={ref => (destinationAutocompleteRef.current = ref)}
                                      onPlaceChanged={() => {
                                          const place = destinationAutocompleteRef.current?.getPlace();
                                          if (place && place.formatted_address) {
                                              setEditDestination(place.formatted_address.toUpperCase());
                                          }
                                      }}
                                      options={{ componentRestrictions: { country: 'br' } }}
                                  >
                                      <input
                                          type="text"
                                          value={editDestination}
                                          onChange={e => setEditDestination(e.target.value.toUpperCase())}
                                          className="w-full bg-white/10 border border-white/30 rounded px-2 py-1.5 text-sm font-bold text-white uppercase outline-none focus:border-red-400 mt-0.5"
                                          placeholder="Buscar endereço de destino..."
                                          data-testid="input-edit-destination"
                                      />
                                  </Autocomplete>
                              ) : (
                                  <input
                                      type="text"
                                      value={editDestination}
                                      onChange={e => setEditDestination(e.target.value.toUpperCase())}
                                      className="w-full bg-white/10 border border-white/30 rounded px-2 py-1.5 text-sm font-bold text-white uppercase outline-none focus:border-red-400 mt-0.5"
                                      placeholder="Destino"
                                      data-testid="input-edit-destination"
                                  />
                              )}
                          </div>
                      </div>
                      {/* KM manual + toggle para desabilitar o cálculo automático (regra 100/200/300...) */}
                      <div className="flex items-start gap-2">
                          <Navigation size={14} className="text-amber-400 mt-2 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">KM Total {disableKmAutoCalc ? '(Manual)' : '(será recalculado pelo Google)'}</label>
                              <div className="flex items-center gap-2 mt-0.5">
                                  <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={editKmManual}
                                      onChange={e => setEditKmManual(e.target.value)}
                                      disabled={!disableKmAutoCalc}
                                      placeholder={disableKmAutoCalc ? 'Digite o KM exato' : 'Recalculo automático ativo'}
                                      className={`w-40 bg-white/10 border border-white/30 rounded px-2 py-1.5 text-sm font-bold text-white outline-none focus:border-amber-400 ${!disableKmAutoCalc ? 'opacity-50 cursor-not-allowed' : ''}`}
                                      data-testid="input-edit-km-manual"
                                  />
                                  <label className="flex items-center gap-1.5 text-[10px] font-bold text-gray-300 cursor-pointer select-none">
                                      <input
                                          type="checkbox"
                                          checked={disableKmAutoCalc}
                                          onChange={e => setDisableKmAutoCalc(e.target.checked)}
                                          className="w-3.5 h-3.5 accent-amber-500"
                                          data-testid="checkbox-disable-km-auto"
                                      />
                                      DESABILITAR REGRA AUTOMÁTICA (100/200/300...) — USAR KM MANUAL
                                  </label>
                              </div>
                          </div>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                          <button
                              onClick={async () => {
                                  if (!editOrigin.trim() || !editDestination.trim()) return;
                                  setIsSavingRoute(true);
                                  try {
                                      // OS Cancelada: força KM = 0 (regra do negócio).
                                      const isCancelledStatus = mission.status === MissionStatus.CANCELLED;
                                      // Modo manual: usa o valor digitado, sem chamar a API.
                                      let newDistanceKm: number | null = null;
                                      if (isCancelledStatus) {
                                          newDistanceKm = 0;
                                      } else if (disableKmAutoCalc) {
                                          const v = parseFloat((editKmManual || '').replace(',', '.'));
                                          newDistanceKm = isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
                                      } else {
                                          newDistanceKm = await fetchRouteDistanceKm(editOrigin.trim(), editDestination.trim());
                                          if (newDistanceKm === null) {
                                              showNotification('KM não calculado', 'Não foi possível calcular a distância. Marque KM manual ou tente novamente.', 'error');
                                          }
                                      }

                                      const updatePayload: any = {
                                          origin: editOrigin.trim(),
                                          destination: editDestination.trim(),
                                          last_update: new Date().toISOString()
                                      };
                                      // Persiste o KM mesmo quando for 0 (caso CANCELADA ou manual = 0).
                                      if (newDistanceKm !== null && newDistanceKm >= 0 && (isCancelledStatus || disableKmAutoCalc || newDistanceKm > 0)) {
                                          updatePayload.total_distance = newDistanceKm;
                                      }

                                      const { error } = await supabase.from('missions').update(updatePayload).eq('id', mission.id).select('id').single();
                                      if (error) throw error;
                                      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
                                      await supabase.from('system_logs').insert([{
                                          user_name: userData.name || 'Sistema',
                                          action_type: 'UPDATE',
                                          entity: 'Mission',
                                          entity_id: mission.id,
                                          details: JSON.stringify({ field: 'route', oldOrigin: mission.origin, newOrigin: editOrigin.trim(), oldDestination: mission.destination, newDestination: editDestination.trim(), newDistanceKm, cancelled: isCancelledStatus, manual: disableKmAutoCalc })
                                      }]);
                                      mission.origin = editOrigin.trim();
                                      mission.destination = editDestination.trim();
                                      if (newDistanceKm !== null && newDistanceKm >= 0 && (isCancelledStatus || disableKmAutoCalc || newDistanceKm > 0)) {
                                          (mission as any).totalDistance = newDistanceKm;
                                          (mission as any).total_distance = newDistanceKm;
                                      }
                                      setIsEditingRoute(false);
                                      // Limpa overrides manuais para forçar o auto-match com a nova rota
                                      setManualClientTableId('');
                                      setManualProviderTableId('');
                                      setCustomClientBase(''); setCustomClientKm(''); setCustomClientHour('');
                                      setCustomProviderBase(''); setCustomProviderKm(''); setCustomProviderHour('');
                                      setMemoryLoaded(false);
                                      const kmMsg = newDistanceKm !== null && newDistanceKm >= 0 ? ` (${newDistanceKm.toFixed(2)} km)` : '';
                                      showNotification('Rota Atualizada', `${editOrigin.trim()} → ${editDestination.trim()}${kmMsg}`, 'success');
                                      // Recarrega o modal por completo (tabelas de cliente/fornecedor reavaliadas para a nova rota)
                                      await loadData();
                                      // Atualiza listas por trás SEM fechar o modal (onUpdate fecharia).
                                      try { window.dispatchEvent(new CustomEvent('refreshMissions')); } catch {}
                                  } catch (err: any) {
                                      showNotification('Erro', err.message, 'error');
                                  }
                                  setIsSavingRoute(false);
                              }}
                              disabled={isSavingRoute}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded text-xs font-black hover:bg-emerald-700"
                              data-testid="button-save-route"
                          >
                              {isSavingRoute ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar
                          </button>
                          <button
                              onClick={() => setIsEditingRoute(false)}
                              className="flex items-center gap-1 px-3 py-1.5 text-gray-300 hover:text-white border border-white/20 rounded text-xs"
                          >
                              <X size={12} /> Cancelar
                          </button>
                      </div>
                  </>
              ) : (
                  <>
                      <div className="flex items-start gap-2.5">
                          <MapPin size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-2">
                              <span className="font-black text-sm text-gray-200 uppercase tracking-wider whitespace-nowrap">Origem:</span>
                              <span className="text-sm text-gray-100 break-words font-medium" data-testid="text-route-origin">{mission.origin || '—'}</span>
                          </div>
                      </div>
                      <div className="flex items-start gap-2.5">
                          <MapPin size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-2">
                              <span className="font-black text-sm text-gray-200 uppercase tracking-wider whitespace-nowrap">Destino:</span>
                              <span className="text-sm text-gray-100 break-words font-medium" data-testid="text-route-destination">{mission.destination || '—'}</span>
                          </div>
                      </div>
                      <div className="flex items-center gap-2.5 border-t border-gray-800 pt-2 mt-1">
                          <Navigation size={16} className="text-amber-400 flex-shrink-0" />
                          <span className="font-black text-sm text-gray-200 uppercase tracking-wider">KM total:</span>
                          <span className="text-lg font-black text-white tracking-tight" data-testid="text-route-totalkm">
                              {((mission.status === MissionStatus.CANCELLED) ? 0 : (mission.totalDistance || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-bold text-gray-400">km</span>
                              {mission.status === MissionStatus.CANCELLED && (mission.totalDistance || 0) > 0 && (
                                  <span className="ml-2 text-[9px] font-black bg-red-600 text-white px-1.5 py-0.5 rounded uppercase" title="OS Cancelada: KM forçado para 0">CANCELADA → KM 0</span>
                              )}
                          </span>
                          {(() => {
                              const uf = extractUF(mission.origin || '');
                              const region = UF_TO_REGION[uf] || '';
                              if (!region) return null;
                              return (
                                  <span
                                      className="ml-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-500/20 border border-indigo-400/40 text-indigo-200 text-[11px] font-black uppercase tracking-wider"
                                      title={`Região detectada pela UF de origem (${uf})`}
                                      data-testid="badge-route-region"
                                  >
                                      <span className="text-[9px] font-bold text-indigo-300/80">REGIÃO</span>
                                      <span className="text-white">{region}</span>
                                      <span className="text-[9px] font-bold text-indigo-300/80">({uf})</span>
                                  </span>
                              );
                          })()}
                          {canEditOpsData && !isEffectivelyLocked && (
                              <button
                                  onClick={() => {
                                      setEditOrigin(mission.origin || '');
                                      setEditDestination(mission.destination || '');
                                      const curKm = safeNumber((mission as any).totalDistance);
                                      setEditKmManual(curKm > 0 ? curKm.toString() : '');
                                      setDisableKmAutoCalc(false);
                                      setIsEditingRoute(true);
                                  }}
                                  className="ml-auto p-1.5 text-gray-500 hover:text-white transition-colors rounded hover:bg-white/10"
                                  title="Editar Origem e Destino"
                                  data-testid="button-edit-route"
                              >
                                  <Pencil size={12} />
                              </button>
                          )}
                      </div>
                  </>
              )}
              {lockAllowsRecalc && (
                  <div className="border-t border-gray-800 pt-2 mt-1">
                      <label className="flex items-start gap-2 cursor-pointer select-none" title="Reconhece o KM cheio executado, cobrando o excedente acima da franquia nas tabelas aplicadas. Não troca a tabela; apenas remove o teto de distância.">
                          <input
                              type="checkbox"
                              checked={disableFixedKmRule}
                              onChange={e => setDisableFixedKmRule(e.target.checked)}
                              className="w-3.5 h-3.5 accent-amber-500 mt-0.5 flex-shrink-0"
                              data-testid="checkbox-disable-fixed-km-rule"
                          />
                          <span className="text-[10px] font-bold text-amber-300 leading-tight">
                              RECONHECER KM CHEIO RODADO (desmarcar regra de 200KM / franquia fixa)
                              <span className="block text-[9px] font-medium text-gray-400 mt-0.5">
                                  Cobra o excedente acima da franquia nas tabelas aplicadas. Não troca a tabela; só remove o teto de distância.
                              </span>
                          </span>
                      </label>
                  </div>
              )}
          </div>
        </header>

        <div ref={modalContentRef} className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50 pb-32">
            {isSnapshotFrozen && (
                <div data-testid="snapshot-frozen-banner" className="bg-amber-50 border-2 border-amber-400 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                    <div className="bg-amber-500 p-2 rounded-lg"><Lock size={20} className="text-white" /></div>
                    <div>
                        <p className="font-bold text-amber-900 text-sm">Dados Congelados</p>
                        <p className="text-amber-700 text-xs">Aprovado por <strong>{mission.snapshot_approved_by}</strong> em {mission.snapshot_approved_at ? formatDateTimeBR(mission.snapshot_approved_at) : '-'}</p>
                        <p className="text-amber-600 text-[10px] mt-0.5">Valores finais salvos. O boletim de medição reflete esta versão aprovada.</p>
                    </div>
                </div>
            )}
            {isBillingLocked && !isSnapshotFrozen && (
                <div data-testid="billing-locked-banner" className={`border-2 rounded-xl p-4 flex items-center gap-3 shadow-sm ${unlockOverride ? 'bg-orange-50 border-orange-400' : 'bg-blue-50 border-blue-400'}`}>
                    <div className={`p-2 rounded-lg ${unlockOverride ? 'bg-orange-500' : 'bg-blue-600'}`}><Lock size={20} className="text-white" /></div>
                    <div className="flex-1">
                        <p className={`font-bold text-sm ${unlockOverride ? 'text-orange-900' : 'text-blue-900'}`}>
                            {unlockOverride ? 'Edição desbloqueada temporariamente' : 'Faturamento bloqueado para edição'}
                        </p>
                        <p className={`text-xs ${unlockOverride ? 'text-orange-700' : 'text-blue-700'}`}>
                            {mission.billing_verified_by ? <>Salvo por <strong>{mission.billing_verified_by}</strong>{mission.billing_verified_at ? ` em ${formatDateTimeBR(mission.billing_verified_at)}` : ''}.</> : 'Valores aprovados/salvos.'} {unlockOverride ? 'Os campos estão editáveis somente nesta sessão.' : 'Os campos só podem ser alterados após destravar.'}
                        </p>
                    </div>
                    {canUnlockBilling && (
                        <button
                            onClick={() => setUnlockOverride(v => !v)}
                            className={`px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider shadow-sm transition-all ${unlockOverride ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-white text-blue-700 border-2 border-blue-300 hover:bg-blue-100'}`}
                            data-testid="button-toggle-billing-lock"
                        >
                            {unlockOverride ? 'Travar de novo' : 'Destravar para editar'}
                        </button>
                    )}
                </div>
            )}
            <BillingPeriodOverridePanel mission={mission} setMission={setMission} showNotification={showNotification} />

            {linkedMissions.length > 0 && (() => {
                const isCurrentParent = !mission.is_same_os && !mission.parent_mission_id && linkedMissions.some(lm => lm.is_same_os);
                const isCurrentChild = mission.is_same_os && !!mission.parent_mission_id;
                const children = linkedMissions.filter(lm => lm.is_same_os && lm.id !== mission.parent_mission_id);
                const parentMission = mission.parent_mission_id ? linkedMissions.find(lm => lm.id === mission.parent_mission_id) : null;
                const totalGroupRevenue = (isCurrentParent ? safeNumber(mission.revenue_value) : 0) + linkedMissions.reduce((s, lm) => s + safeNumber(lm.revenue_value), 0);
                const totalGroupCost = (isCurrentParent ? safeNumber(mission.cost_value) : 0);
                return (
                <div data-testid="linked-missions-section" className={`rounded-xl p-4 shadow-sm border-2 ${isCurrentParent ? 'bg-amber-50/80 border-amber-400' : 'bg-indigo-50 border-indigo-200'}`}>
                    {isCurrentParent && (
                        <div className="flex items-center gap-2 mb-3 bg-amber-600 text-white px-3 py-2 rounded-lg">
                            <Layers size={16} />
                            <span className="text-xs font-black uppercase tracking-wider">ESTA OS É A OS MÃE</span>
                            <span className="text-[9px] bg-amber-800 px-2 py-0.5 rounded-full ml-auto font-bold">{children.length} filha{children.length !== 1 ? 's' : ''} vinculada{children.length !== 1 ? 's' : ''}</span>
                        </div>
                    )}
                    {isCurrentChild && parentMission && (
                        <div className="flex items-center gap-2 mb-3 bg-blue-600 text-white px-3 py-2 rounded-lg">
                            <Link2 size={16} />
                            <span className="text-xs font-black uppercase tracking-wider">ESTA OS É FILHA (MESMA OS)</span>
                            <span className="text-[9px] bg-blue-800 px-2 py-0.5 rounded-full ml-auto font-bold">MÃE: {parentMission.id}</span>
                        </div>
                    )}
                    {!isCurrentParent && !isCurrentChild && (
                        <div className="flex items-center gap-2 mb-3">
                            <div className="bg-indigo-600 p-1.5 rounded-lg"><Layers size={14} className="text-white" /></div>
                            <p className="font-black text-indigo-900 text-xs uppercase tracking-wider">
                                OS Vinculadas ({linkedMissions.length})
                            </p>
                        </div>
                    )}
                    <div className="space-y-2 max-h-[250px] overflow-y-auto">
                        {linkedMissions.map((lm) => {
                            const isParent = lm.id === mission.parent_mission_id;
                            const lmCost = lm.is_same_os ? 0 : safeNumber(lm.cost_value);
                            const lmRevenue = safeNumber(lm.revenue_value);
                            const lmMargin = lmRevenue - lmCost;
                            return (
                            <div key={lm.id} data-testid={`linked-mission-${lm.id}`} className={`p-2.5 rounded-lg border text-xs ${isParent ? 'bg-amber-50 border-amber-300' : lm.is_same_os ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200'}`}>
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className="font-black text-gray-800 shrink-0">{lm.id}</span>
                                        {isParent && <span className="text-[8px] font-black bg-amber-600 text-white px-1.5 py-0.5 rounded uppercase shrink-0">MÃE</span>}
                                        {lm.is_same_os && !isParent && <span className="text-[8px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded uppercase shrink-0">MESMA OS</span>}
                                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0 ${lm.status === 'Concluída' ? 'bg-green-100 text-green-700' : lm.status === 'Cancelada' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{lm.status}</span>
                                    </div>
                                    <span className="text-gray-400 text-[9px] shrink-0">{lm.start_time ? formatTimeBR(lm.start_time, '--:--') : '--:--'}</span>
                                </div>
                                <div className="flex items-center justify-between mt-1.5">
                                    <span className="text-gray-500 truncate text-[10px]" title={`${lm.origin} → ${lm.destination}`}>
                                        {(lm.origin || '').split(',')[0]} → {(lm.destination || '').split(',')[0]}
                                    </span>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <div className="text-right">
                                            <span className="text-[8px] text-gray-400 block">Receita</span>
                                            <span className="text-green-700 font-bold">{formatCurrency(lmRevenue)}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[8px] text-gray-400 block">Custo</span>
                                            <span className={`font-bold ${lm.is_same_os ? 'text-gray-400' : 'text-red-600'}`}>{lm.is_same_os ? 'R$ 0,00' : formatCurrency(lmCost)}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[8px] text-gray-400 block">Margem</span>
                                            <span className={`font-bold ${lmMargin >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(lmMargin)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            );
                        })}
                    </div>
                    {isCurrentParent && children.length > 0 && (
                        <div className="mt-3 pt-3 border-t-2 border-amber-300">
                            <div className="flex items-center justify-between text-[10px]">
                                <span className="font-black text-amber-800 uppercase">Consolidado do Grupo (Mãe + {children.length} filha{children.length !== 1 ? 's' : ''})</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 mt-2">
                                <div className="bg-green-100 rounded-lg p-2 text-center">
                                    <p className="text-[8px] font-bold text-green-600 uppercase">Receita Total</p>
                                    <p className="text-sm font-black text-green-800">{formatCurrency(totalGroupRevenue)}</p>
                                </div>
                                <div className="bg-red-100 rounded-lg p-2 text-center">
                                    <p className="text-[8px] font-bold text-red-600 uppercase">Custo (só mãe)</p>
                                    <p className="text-sm font-black text-red-800">{formatCurrency(totalGroupCost)}</p>
                                </div>
                                <div className={`rounded-lg p-2 text-center ${(totalGroupRevenue - totalGroupCost) >= 0 ? 'bg-emerald-100' : 'bg-red-100'}`}>
                                    <p className={`text-[8px] font-bold uppercase ${(totalGroupRevenue - totalGroupCost) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Margem Grupo</p>
                                    <p className={`text-sm font-black ${(totalGroupRevenue - totalGroupCost) >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>{formatCurrency(totalGroupRevenue - totalGroupCost)}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                );
            })()}
            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <Loader2 size={48} className="animate-spin text-red-600" />
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Sincronizando Dados...</p>
                </div>
            ) : financialData && (
                <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                    
                    {!financialData.hasClientTable && (
                        <div className="bg-red-50 border-2 border-red-400 rounded-xl p-4 shadow-md" data-testid="alert-no-client-table">
                            <div className="flex items-start gap-3">
                                <div className="p-2 bg-red-100 rounded-lg shrink-0"><AlertTriangle size={20} className="text-red-700" /></div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-black text-red-800 uppercase tracking-wider mb-1">Erro: Cliente sem Tabela de Preços</p>
                                    <p className="text-[10px] text-red-700 font-bold leading-relaxed">O cálculo automático de faturamento foi desativado pois não existe tabela de preços cadastrada para este cliente. Cadastre uma tabela em "Tabelas de Preço" antes de faturar.</p>
                                </div>
                            </div>
                        </div>
                    )}
                    {!financialData.hasProviderTable && !mission.is_same_os && (
                        <div className="bg-orange-50 border-2 border-orange-400 rounded-xl p-4 shadow-md" data-testid="alert-no-provider-table">
                            <div className="flex items-start gap-3">
                                <div className="p-2 bg-orange-100 rounded-lg shrink-0"><AlertTriangle size={20} className="text-orange-700" /></div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-black text-orange-800 uppercase tracking-wider mb-1">Aviso: Fornecedor sem Tabela de Custo</p>
                                    <p className="text-[10px] text-orange-700 font-bold leading-relaxed">Não existe tabela de custo cadastrada para este fornecedor. O custo será calculado como zero até que uma tabela seja cadastrada.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {(() => {
                        const audit = auditMissionFinancials(mission, clientTables, providerTables, clientData);
                        if (!audit.isInconsistent) return null;
                        return (
                            <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-4 shadow-md" data-testid="audit-alert-franchise">
                                <div className="flex items-start gap-3">
                                    <div className="p-2 bg-amber-100 rounded-lg shrink-0"><AlertTriangle size={20} className="text-amber-700" /></div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-black text-amber-800 uppercase tracking-wider mb-1">Cálculo Fora da Regra de Franquia</p>
                                        <p className="text-[10px] text-amber-700 font-bold leading-relaxed">{audit.reason}</p>
                                        <div className="flex items-center gap-3 mt-3">
                                            <div className="flex items-center gap-2 text-[10px]">
                                                <span className="font-bold text-gray-500">Salvo:</span>
                                                <span className="font-black text-red-700">{formatCurrency(audit.storedRevenue)}</span>
                                            </div>
                                            <span className="text-gray-300">→</span>
                                            <div className="flex items-center gap-2 text-[10px]">
                                                <span className="font-bold text-gray-500">Tabela Oficial:</span>
                                                <span className="font-black text-green-700">{formatCurrency(audit.calculatedRevenue)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => applyOfficialTableToDb()}
                                        disabled={isUpdating}
                                        className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-amber-600 text-white rounded-lg text-[10px] font-black uppercase hover:bg-amber-700 transition-all shadow-sm disabled:opacity-50"
                                        data-testid="button-apply-official-table"
                                    >
                                        <RefreshCw size={12} /> Aplicar Tabela Oficial
                                    </button>
                                </div>
                            </div>
                        );
                    })()}

                    {financialData?.isMinimumActivationRule && (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3" data-testid="minimum-activation-rule-info">
                            <Info size={16} className="text-blue-600 shrink-0" />
                            <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Regra de Acionamento Mínimo Ativa: Distância ≤200km e Tempo ≤2h — Valor travado no acionamento base, sem extras.</p>
                        </div>
                    )}

                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                        <div className="flex flex-wrap gap-6 items-center justify-between">
                            <div className="flex-1 min-w-[120px]">
                                 <p className={LABEL_CLASS}>KM Real Executado</p>
                                 <p className="text-2xl font-black text-gray-800 font-mono">
                                     {financialData.realTraveledKm.toFixed(1)} <span className="text-sm text-gray-400">KM</span>
                                 </p>
                            </div>
                            <div className="flex-1 min-w-[120px]">
                                 <p className={LABEL_CLASS}>KM Previsto (Rota)</p>
                                 <p className="text-2xl font-bold text-blue-600 font-mono">
                                     {safeNumber(mission.totalDistance).toFixed(1)} <span className="text-sm text-blue-300">KM</span>
                                 </p>
                            </div>
                            <div className="flex-1 min-w-[120px]">
                                 <p className={LABEL_CLASS}>Tempo de Operação</p>
                                 <p className="text-2xl font-black text-gray-800 font-mono">
                                     {financialData.durationHours.toFixed(2)} <span className="text-sm text-gray-400">H</span>
                                 </p>
                                 <span className="text-[8px] text-gray-400 font-bold uppercase mt-1 block">Início: {financialData.effectiveStartLabel}</span>
                            </div>
                            <div className="flex-1 min-w-[120px]">
                                 <p className={LABEL_CLASS}>Equipe Alocada</p>
                                 <div className="flex items-center gap-2">
                                    <span className={`text-sm font-black px-2 py-1 rounded w-fit uppercase ${financialData.providerMult === 2 ? 'bg-orange-100 text-orange-700' : 'bg-indigo-50 text-indigo-700'}`}>
                                        {financialData.agentCount > 1 ? `${financialData.agentCount} AGENTES` : '1 AGENTE'}
                                        {financialData.providerMult === 2 && ' (x2)'}
                                    </span>
                                    {financialData.agentCount > 1 && <Users size={16} className="text-orange-600"/>}
                                 </div>
                            </div>
                            <div className="flex-1 min-w-[120px]">
                                 <p className={LABEL_CLASS}>Pedágio / Despesas</p>
                                 <p className="text-2xl font-black text-red-600 font-mono">
                                     {formatCurrency(parseNumber(tollInput))}
                                 </p>
                                 <span className="text-[8px] text-gray-400 font-bold uppercase mt-1 block">{tollSource}{parseNumber(tollProviderInput) !== parseNumber(tollInput) ? ` | Forn: ${formatCurrency(parseNumber(tollProviderInput))}` : ''}</span>
                            </div>
                            <div className="flex-1 min-w-[120px] text-right">
                                 <p className={LABEL_CLASS}>Status da OS</p>
                                 <p className="text-lg font-bold text-gray-600 uppercase">{mission.status}</p>
                            </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-gray-100">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-green-50/50 border border-green-200 rounded-xl p-3">
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-[10px] font-black text-green-700 uppercase tracking-widest flex items-center gap-1.5"><MapPin size={12}/> Dados Cliente</p>
                                        {(canEditClientData || canEditEndTimeOnly) && canEditOpsEvenIfLocked && !isEditingOpsData && (
                                            <button onClick={() => setIsEditingOpsData(true)} className="flex items-center gap-1 px-2 py-1 text-[9px] font-black text-green-600 bg-green-100 rounded-lg hover:bg-green-200 uppercase tracking-wider transition-all" data-testid="button-edit-ops-data"><Edit2 size={10}/> {canEditClientData ? 'Editar' : 'Editar Data/Hora'}</button>
                                        )}
                                        {isEditingOpsData && (
                                            <div className="flex gap-2">
                                                <button onClick={() => setIsEditingOpsData(false)} className="px-2 py-1 text-[9px] font-black text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 uppercase tracking-wider">Cancelar</button>
                                                <button onClick={handleSaveOpsData} disabled={isUpdating} className="flex items-center gap-1 px-3 py-1 text-[9px] font-black text-white bg-green-600 rounded-lg hover:bg-green-700 uppercase tracking-wider disabled:opacity-50" data-testid="button-save-ops-data">{isUpdating ? <Loader2 size={10} className="animate-spin"/> : <Save size={10}/>} Salvar</button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">Hora Inicial</p>
                                            {isEditingOpsData && canEditOpsData ? (
                                                <input type="datetime-local" value={editStartTime} onChange={e => setEditStartTime(e.target.value)} className="w-full text-xs font-bold text-gray-700 border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none" data-testid="input-start-time" />
                                            ) : (
                                                <p className="text-sm font-bold text-gray-700 font-mono">{mission.startTime ? formatDateTimeBR(mission.startTime) : '---'}</p>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">KM Inicial</p>
                                            {isEditingOpsData && canEditOpsData ? (
                                                <input type="number" step="0.1" value={editStartKm} onChange={e => setEditStartKm(e.target.value)} placeholder="0" className="w-full text-xs font-bold text-gray-700 border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none" data-testid="input-start-km" />
                                            ) : (
                                                <p className="text-sm font-bold text-gray-700 font-mono">{mission.startKm ? `${safeNumber(mission.startKm).toLocaleString('pt-BR')} km` : '---'}</p>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">Hora Final</p>
                                            {isEditingOpsData ? (
                                                <input type="datetime-local" value={editEndTime} onChange={e => setEditEndTime(e.target.value)} className="w-full text-xs font-bold text-gray-700 border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none" data-testid="input-end-time" />
                                            ) : (
                                                <p className="text-sm font-bold text-gray-700 font-mono">{mission.endTime ? formatDateTimeBR(mission.endTime) : '---'}</p>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">KM Final</p>
                                            {isEditingOpsData && canEditOpsData ? (
                                                <input type="number" step="0.1" value={editEndKm} onChange={e => setEditEndKm(e.target.value)} placeholder="0" className="w-full text-xs font-bold text-gray-700 border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none" data-testid="input-end-km" />
                                            ) : (
                                                <p className="text-sm font-bold text-gray-700 font-mono">{mission.endKm ? `${safeNumber(mission.endKm).toLocaleString('pt-BR')} km` : '---'}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-dashed border-green-200">
                                        <div className="bg-green-100 rounded-lg px-3 py-1.5">
                                            <p className="text-[8px] font-bold text-green-500 uppercase mb-0.5">Duração</p>
                                            <p className="text-xs font-black text-green-800 font-mono" data-testid="text-total-duration">
                                                {(() => {
                                                    if (!mission.startTime || !mission.endTime) return '---';
                                                    const diffMs = new Date(mission.endTime).getTime() - new Date(mission.startTime).getTime();
                                                    if (diffMs <= 0) return '---';
                                                    const h = Math.floor(diffMs / 3600000);
                                                    const m = Math.floor((diffMs % 3600000) / 60000);
                                                    return `${h.toString().padStart(2,'0')}h${m.toString().padStart(2,'0')}min`;
                                                })()}
                                            </p>
                                        </div>
                                        <div className="bg-green-100 rounded-lg px-3 py-1.5">
                                            <p className="text-[8px] font-bold text-green-500 uppercase mb-0.5">KM Rodado</p>
                                            <p className="text-xs font-black text-green-800 font-mono" data-testid="text-total-km">
                                                {(() => {
                                                    const sk = safeNumber(mission.startKm);
                                                    const ek = safeNumber(mission.endKm);
                                                    if (sk <= 0 || ek <= 0) return '---';
                                                    return `${(ek - sk).toLocaleString('pt-BR')} km`;
                                                })()}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-3">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest flex items-center gap-1.5"><Briefcase size={12}/> Dados Fornecedor</p>
                                            {mission.provider_ops_edited && (
                                                <span className="text-[8px] font-black text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">EDITADO</span>
                                            )}
                                            {!mission.provider_ops_edited && (
                                                <span className="text-[8px] font-bold text-blue-400 bg-blue-100 px-1.5 py-0.5 rounded-full">CÓPIA CLIENTE</span>
                                            )}
                                        </div>
                                        {canEditOpsData && canEditOpsEvenIfLocked && !isEditingProvOpsData && (
                                            <button onClick={() => setIsEditingProvOpsData(true)} className="flex items-center gap-1 px-2 py-1 text-[9px] font-black text-blue-600 bg-blue-100 rounded-lg hover:bg-blue-200 uppercase tracking-wider transition-all" data-testid="button-edit-prov-ops-data"><Edit2 size={10}/> Editar</button>
                                        )}
                                        {isEditingProvOpsData && (
                                            <div className="flex gap-2">
                                                <button onClick={() => setIsEditingProvOpsData(false)} className="px-2 py-1 text-[9px] font-black text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 uppercase tracking-wider">Cancelar</button>
                                                <button onClick={handleSaveProvOpsData} disabled={isUpdating} className="flex items-center gap-1 px-3 py-1 text-[9px] font-black text-white bg-blue-600 rounded-lg hover:bg-blue-700 uppercase tracking-wider disabled:opacity-50" data-testid="button-save-prov-ops-data">{isUpdating ? <Loader2 size={10} className="animate-spin"/> : <Save size={10}/>} Salvar</button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">Hora Inicial</p>
                                            {isEditingProvOpsData ? (
                                                <input type="datetime-local" value={provEditStartTime} onChange={e => setProvEditStartTime(e.target.value)} className="w-full text-xs font-bold text-gray-700 border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" data-testid="input-prov-start-time" />
                                            ) : (
                                                <p className="text-sm font-bold text-gray-700 font-mono">{(() => {
                                                    const t = mission.provider_ops_edited && mission.provider_start_time ? mission.provider_start_time : mission.startTime;
                                                    return t ? formatDateTimeBR(t) : '---';
                                                })()}</p>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">KM Inicial</p>
                                            {isEditingProvOpsData ? (
                                                <input type="number" step="0.1" value={provEditStartKm} onChange={e => setProvEditStartKm(e.target.value)} placeholder="0" className="w-full text-xs font-bold text-gray-700 border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" data-testid="input-prov-start-km" />
                                            ) : (
                                                <p className="text-sm font-bold text-gray-700 font-mono">{(() => {
                                                    const k = mission.provider_ops_edited && mission.provider_start_km != null ? mission.provider_start_km : mission.startKm;
                                                    return k ? `${safeNumber(k).toLocaleString('pt-BR')} km` : '---';
                                                })()}</p>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">Hora Final</p>
                                            {isEditingProvOpsData ? (
                                                <input type="datetime-local" value={provEditEndTime} onChange={e => setProvEditEndTime(e.target.value)} className="w-full text-xs font-bold text-gray-700 border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" data-testid="input-prov-end-time" />
                                            ) : (
                                                <p className="text-sm font-bold text-gray-700 font-mono">{(() => {
                                                    const t = mission.provider_ops_edited && mission.provider_end_time ? mission.provider_end_time : mission.endTime;
                                                    return t ? formatDateTimeBR(t) : '---';
                                                })()}</p>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">KM Final</p>
                                            {isEditingProvOpsData ? (
                                                <input type="number" step="0.1" value={provEditEndKm} onChange={e => setProvEditEndKm(e.target.value)} placeholder="0" className="w-full text-xs font-bold text-gray-700 border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" data-testid="input-prov-end-km" />
                                            ) : (
                                                <p className="text-sm font-bold text-gray-700 font-mono">{(() => {
                                                    const k = mission.provider_ops_edited && mission.provider_end_km != null ? mission.provider_end_km : mission.endKm;
                                                    return k ? `${safeNumber(k).toLocaleString('pt-BR')} km` : '---';
                                                })()}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-dashed border-blue-200">
                                        <div className="bg-blue-100 rounded-lg px-3 py-1.5">
                                            <p className="text-[8px] font-bold text-blue-500 uppercase mb-0.5">Duração</p>
                                            <p className="text-xs font-black text-blue-800 font-mono" data-testid="text-prov-total-duration">
                                                {(() => {
                                                    const sTime = mission.provider_ops_edited && mission.provider_start_time ? mission.provider_start_time : mission.startTime;
                                                    const eTime = mission.provider_ops_edited && mission.provider_end_time ? mission.provider_end_time : mission.endTime;
                                                    if (!sTime || !eTime) return '---';
                                                    const diffMs = new Date(eTime).getTime() - new Date(sTime).getTime();
                                                    if (diffMs <= 0) return '---';
                                                    const h = Math.floor(diffMs / 3600000);
                                                    const m = Math.floor((diffMs % 3600000) / 60000);
                                                    return `${h.toString().padStart(2,'0')}h${m.toString().padStart(2,'0')}min`;
                                                })()}
                                            </p>
                                        </div>
                                        <div className="bg-blue-100 rounded-lg px-3 py-1.5">
                                            <p className="text-[8px] font-bold text-blue-500 uppercase mb-0.5">KM Rodado</p>
                                            <p className="text-xs font-black text-blue-800 font-mono" data-testid="text-prov-total-km">
                                                {(() => {
                                                    const sk = safeNumber(mission.provider_ops_edited && mission.provider_start_km != null ? mission.provider_start_km : mission.startKm);
                                                    const ek = safeNumber(mission.provider_ops_edited && mission.provider_end_km != null ? mission.provider_end_km : mission.endKm);
                                                    if (sk <= 0 || ek <= 0) return '---';
                                                    return `${(ek - sk).toLocaleString('pt-BR')} km`;
                                                })()}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {aiSuggestion && (
                        <div className="mb-4 bg-amber-50 border border-amber-300 rounded-xl p-4 animate-in slide-in-from-top-2" data-testid="ai-suggestion-card">
                            <div className="flex items-center gap-2 mb-3">
                                <Sparkles size={16} className="text-amber-600" />
                                <span className="text-sm font-black text-amber-800 uppercase tracking-wide">Sugestão da IA</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                                {aiSuggestion.clientSuggestion && (
                                    <div className="bg-white/80 rounded-lg p-3 border border-blue-200">
                                        <p className="text-[10px] font-black text-blue-600 uppercase mb-1">Cliente</p>
                                        <p className="text-xs font-bold text-gray-800">{aiSuggestion.clientSuggestion.tableName}</p>
                                        <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">{aiSuggestion.clientSuggestion.reason}</p>
                                    </div>
                                )}
                                {aiSuggestion.providerSuggestion && (
                                    <div className="bg-white/80 rounded-lg p-3 border border-red-200">
                                        <p className="text-[10px] font-black text-red-600 uppercase mb-1">Fornecedor</p>
                                        <p className="text-xs font-bold text-gray-800">{aiSuggestion.providerSuggestion.tableName}</p>
                                        <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">{aiSuggestion.providerSuggestion.reason}</p>
                                    </div>
                                )}
                                {!aiSuggestion.clientSuggestion && !aiSuggestion.providerSuggestion && (
                                    <div className="col-span-2 text-center py-2">
                                        <p className="text-xs text-gray-500">Não foi possível gerar uma sugestão. Verifique se existem tabelas cadastradas.</p>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center justify-between">
                                <p className="text-[9px] text-amber-600 italic">Sugestão gerada por IA — confirme antes de aplicar</p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setAiSuggestion(null)}
                                        className="px-3 py-1.5 bg-gray-200 text-gray-700 text-[10px] font-bold rounded-lg hover:bg-gray-300 transition-all active:scale-95"
                                        data-testid="button-ai-ignore"
                                    >
                                        Ignorar
                                    </button>
                                    {(aiSuggestion.clientSuggestion || aiSuggestion.providerSuggestion) && (
                                        <button
                                            onClick={() => {
                                                if (aiSuggestion.clientSuggestion) {
                                                    setManualClientTableId(aiSuggestion.clientSuggestion.tableId);
                                                    setCustomClientBase(''); setCustomClientKm(''); setCustomClientHour('');
                                                    setUseSavedValues(false);
                                                }
                                                if (aiSuggestion.providerSuggestion) {
                                                    setManualProviderTableId(aiSuggestion.providerSuggestion.tableId);
                                                    setCustomProviderBase(''); setCustomProviderKm(''); setCustomProviderHour('');
                                                    setUseSavedValues(false);
                                                }
                                                userManuallyEditedRef.current = false;
                                                setAiSuggestion(null);
                                            }}
                                            className="px-3 py-1.5 bg-purple-600 text-white text-[10px] font-bold rounded-lg hover:bg-purple-700 transition-all shadow-md active:scale-95"
                                            data-testid="button-ai-apply"
                                        >
                                            <span className="flex items-center gap-1"><CheckCircle2 size={12} /> Aplicar</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        
                        {/* COLUNA FATURAMENTO (CLIENTE) */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col h-full">
                            <h4 className="text-sm font-black text-blue-700 uppercase tracking-widest mb-4 flex items-center gap-2">
                                [ {mission.client} ]
                            </h4>
                            
                            <div className="mb-4">
                                <label className={LABEL_CLASS}>Tabela de Preço Aplicada</label>
                                <div className="flex gap-2">
                                    {(() => {
                                        const missionClientName = mission.originalClientName || mission.client || '';
                                        // Esconde linhas de configuração do motor automático (operation_type que começa com "__AUTO_MASTER__")
                                        const isMasterRow = (t: any) => /^__AUTO_MASTER__/i.test((t.operation_type || '').trim());
                                        const onlyThisClient = clientTables.filter(t => {
                                            if (isMasterRow(t)) return false;
                                            return clientTableMatchesMission(t.client || '', missionClientName);
                                        });
                                        const list = onlyThisClient.length > 0 ? onlyThisClient : clientTables.filter(t => !isMasterRow(t));
                                        const options: FilterableSelectOption[] = [
                                            { value: '', label: 'Automático (IA Detectando)' },
                                            ...[...list].sort((a, b) => (a.operation_type || '').localeCompare(b.operation_type || '', 'pt-BR', { numeric: true, sensitivity: 'base' })).map(t => {
                                                const isDhl = isDhlSupplyClient(t.client);
                                                const dhlBad = isDhl && !validateDhlTableName(t.operation_type).valid;
                                                const prefix = dhlBad ? '⚠️ ' : '';
                                                const label = onlyThisClient.length > 0 ? t.operation_type : `${t.operation_type} — ${t.client}`;
                                                return {
                                                    value: String(t.id),
                                                    label,
                                                    prefix,
                                                    title: dhlBad ? 'Tabela DHL fora do padrão — não é sugerida automaticamente' : undefined,
                                                };
                                            }),
                                        ];
                                        const handleChange = (newTableId: string) => {
                                            if ((isController || isEffectivelyLocked) && !canEditTablesEvenIfLocked) return;
                                            // Task #111: registra correção do auditor quando troca a sugestão do motor DHL.
                                            try {
                                                const sug = dhlEngineSuggestionRef.current;
                                                // "Só abrir o campo, sem regravar": numa OS travada (salva/aprovada)
                                                // a auditoria pode abrir/trocar a tabela só para visualizar; não
                                                // registramos correção na memória do motor DHL até o Salvar explícito.
                                                if (
                                                    mission &&
                                                    newTableId &&
                                                    !(isBillingLocked && canEditTablesEvenIfLocked) &&
                                                    isDhlSupplyClient(mission.originalClientName || mission.client) &&
                                                    sug &&
                                                    sug.region &&
                                                    String(sug.tableId || '') !== String(newTableId)
                                                ) {
                                                    const chosen = clientTables.find(t => String(t.id) === String(newTableId));
                                                    const suggested = sug.tableId ? clientTables.find(t => String(t.id) === String(sug.tableId)) : null;
                                                    const userName = (() => { try { const u = JSON.parse(localStorage.getItem('userData') || '{}'); return (u.name || u.username || 'auditor') as string; } catch { return 'auditor'; } })();
                                                    const payload = {
                                                        missionId: mission.id,
                                                        region: sug.region,
                                                        band: sug.band,
                                                        originUF: sug.originUF,
                                                        originCity: sug.originCity,
                                                        destCity: sug.destCity,
                                                        suggestedTableId: sug.tableId,
                                                        suggestedTableOp: suggested?.operation_type || null,
                                                        suggestedMatchLevel: sug.matchLevel,
                                                        chosenTableId: String(newTableId),
                                                        chosenTableOp: chosen?.operation_type || null,
                                                        date: new Date().toISOString(),
                                                    };
                                                    supabase.from('system_logs').insert([{
                                                        user_name: userName,
                                                        action_type: 'DHL_TABLE_CORRECTION',
                                                        entity: 'DhlTableCorrection',
                                                        entity_id: mission.id,
                                                        details: JSON.stringify(payload),
                                                    }]).select('id').then(({ data: insData, error }) => {
                                                        if (error) {
                                                            console.warn('[DHL Memória] Falha ao registrar correção:', error.message);
                                                            return;
                                                        }
                                                        const newLogId = (insData && insData[0]?.id) ?? null;
                                                        const updated: DhlCorrectionRecord[] = [
                                                            {
                                                                region: payload.region,
                                                                band: payload.band,
                                                                originCity: payload.originCity,
                                                                destCity: payload.destCity,
                                                                chosenTableId: payload.chosenTableId,
                                                                createdAt: payload.date,
                                                                logId: newLogId,
                                                                // Task #116: rastreabilidade da nova correção.
                                                                missionId: String(payload.missionId),
                                                                userName: userName,
                                                            },
                                                            ...dhlCorrections,
                                                        ];
                                                        setDhlCorrections(updated);
                                                        setDhlCorrectionsCache(updated);
                                                    });
                                                }
                                            } catch (err) {
                                                console.warn('[DHL Memória] Erro ao capturar correção:', err);
                                            }
                                            setManualClientTableId(newTableId);
                                            setCustomClientBase(''); setCustomClientKm(''); setCustomClientHour('');
                                            setUseSavedValues(false);
                                            userManuallyEditedRef.current = false;
                                            // "Só abrir o campo, sem regravar": quando a auditoria troca a tabela
                                            // numa OS já SALVA/APROVADA (lock ativo), a mudança fica apenas em
                                            // estado local; nada é regravado no banco até o Salvar/Aprovar explícito,
                                            // preservando billing_verified_by e os snapshots imutáveis.
                                            if (!(isBillingLocked && canEditTablesEvenIfLocked)) {
                                                setMission(prev => prev ? { ...prev, revenue_edit_reason: '', cost_edit_reason: '', billing_verified_by: null } : prev);
                                                if (mission) {
                                                    supabase.from('missions').update({ revenue_edit_reason: '', cost_edit_reason: '', billing_verified_by: null }).eq('id', mission.id).then(res => {
                                                        if (res.error) {
                                                            console.error('[Tabela Cliente] Falha ao limpar verificação:', res.error);
                                                            showNotification('Erro', 'Não foi possível atualizar a tabela de preço: ' + res.error.message, 'error');
                                                        }
                                                    });
                                                }
                                            }
                                            recalcBigNumbersOnTableSwap({ clientTableId: newTableId });
                                        };
                                        return (
                                            <FilterableSelect
                                                value={manualClientTableId || ''}
                                                onChange={handleChange}
                                                options={options}
                                                disabled={(isController || isEffectivelyLocked) && !canEditTablesEvenIfLocked}
                                                accentColor="blue"
                                                data-testid="select-client-table"
                                            />
                                        );
                                    })()}
                                    {manualClientTableId && (
                                        <button 
                                            onClick={() => { setEditClientTableId(manualClientTableId); setIsEditClientTableOpen(true); }}
                                            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md active:scale-95"
                                            title="Editar Tabela Selecionada"
                                            data-testid="button-edit-client-table"
                                        >
                                            <Edit2 size={14}/>
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => { setEditClientTableId(null); setIsEditClientTableOpen(true); }}
                                        className="p-2 bg-slate-900 text-white rounded-lg hover:bg-black transition-all shadow-md active:scale-95"
                                        title="Cadastrar Nova Tabela"
                                        data-testid="button-add-client-table"
                                    >
                                        <Plus size={14}/>
                                    </button>
                                    <button
                                        onClick={handleAiSuggest}
                                        disabled={aiLoading}
                                        className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all shadow-md active:scale-95 disabled:opacity-50"
                                        title="Sugerir Tabela com IA"
                                        data-testid="button-ai-suggest"
                                    >
                                        {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                    </button>
                                </div>
                                {/* LOG DE DETECÇÃO DA IA */}
                                <div className="mt-2 text-[9px] font-bold text-gray-400 flex items-center gap-1.5 bg-gray-50 p-2 rounded-lg border border-gray-100">
                                    <BrainCircuit size={12} className="text-blue-500" />
                                    <span>IA Detectou: {financialData.client.detectionLog}</span>
                                </div>
                                {/* Task #108/#111/#116: badge do motor DHL (exact_route / region_band / region_any_km / memory_route / memory_region / none) */}
                                {(() => {
                                    const log = financialData.client.detectionLog || '';
                                    const m = log.match(/^DHL Auto \[(exact_route|region_band|region_any_km|memory_route|memory_region|none)\]:\s*(.+)$/);
                                    if (!m) return null;
                                    const level = m[1];
                                    const reason = m[2];
                                    const styles =
                                        level === 'memory_route' || level === 'memory_region'
                                            ? 'bg-purple-50 text-purple-800 border-purple-300'
                                            : level === 'exact_route'
                                            ? 'bg-blue-50 text-blue-800 border-blue-300'
                                            : level === 'region_band'
                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                            : level === 'region_any_km'
                                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                                            : 'bg-gray-100 text-gray-700 border-gray-300';
                                    const prefix =
                                        level === 'memory_route'
                                            ? 'IA DHL — Memória do Auditor (rota)'
                                            : level === 'memory_region'
                                            ? 'IA DHL — Memória do Auditor (região)'
                                            : level === 'exact_route'
                                            ? 'IA DHL — Rota Exata'
                                            : level === 'region_band'
                                            ? 'IA DHL — Sugestão por Proximidade'
                                            : level === 'region_any_km'
                                            ? 'IA DHL — Proximidade Regional (fallback de KM)'
                                            : 'DHL — Sem tabela encontrada';

                                    // Task #116: para sugestões vindas da memória, descobre qual OS
                                    // gerou aquela correção (mesma região/faixa, idealmente mesma rota
                                    // e mesma tabela escolhida) para mostrar tooltip + link.
                                    let source: DhlCorrectionRecord | null = null;
                                    if ((level === 'memory_route' || level === 'memory_region') && mission) {
                                        const originUF = extractUF(mission.origin || '');
                                        const region = UF_TO_REGION[originUF] || '';
                                        const band = computeDhlBand(financialData?.realTraveledKm || 0);
                                        const chosenId = financialData?.client?.tableId ? String(financialData.client.tableId) : null;
                                        source = findDhlCorrectionSource(
                                            level as 'memory_route' | 'memory_region',
                                            region,
                                            band,
                                            extractCityFromAddress(mission.origin || ''),
                                            extractCityFromAddress(mission.destination || ''),
                                            chosenId,
                                        );
                                    }

                                    const fmtDate = (iso?: string | null) => iso ? formatDateTimeBR(iso) : '';

                                    const tooltip = source
                                        ? `Sugestão veio da OS ${source.missionId || '(sem ID)'}`
                                          + (source.userName ? ` — correção aplicada por ${source.userName}` : '')
                                          + (source.createdAt ? ` em ${fmtDate(source.createdAt)}` : '')
                                          + (mission && source.missionId && String(source.missionId) !== String(mission.id)
                                              ? ' • Clique para abrir em outra aba'
                                              : '')
                                        : undefined;

                                    const canOpen = !!(source && source.missionId && mission && String(source.missionId) !== String(mission.id));
                                    const openSourceMission = () => {
                                        if (!canOpen) return;
                                        try {
                                            const url = `${window.location.origin}/?page=missions&openMission=${encodeURIComponent(String(source!.missionId))}`;
                                            window.open(url, '_blank', 'noopener,noreferrer');
                                        } catch { /* ignore */ }
                                    };

                                    return (
                                        <div
                                            className={`mt-2 text-[10px] font-black uppercase tracking-wide flex items-center gap-1.5 p-2 rounded-lg border ${styles} ${canOpen ? 'cursor-pointer hover:brightness-95 active:scale-[0.99] transition-all' : ''}`}
                                            data-testid={`badge-dhl-auto-${level}`}
                                            title={tooltip}
                                            onClick={canOpen ? openSourceMission : undefined}
                                            role={canOpen ? 'button' : undefined}
                                            tabIndex={canOpen ? 0 : undefined}
                                            onKeyDown={canOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSourceMission(); } } : undefined}
                                        >
                                            <Sparkles size={12} />
                                            <span>{prefix}: {reason}</span>
                                            {source && (
                                                <span className="ml-auto flex items-center gap-1 normal-case font-bold opacity-80">
                                                    <span data-testid={`text-dhl-memory-source-${level}`}>
                                                        OS {source.missionId || '—'}
                                                        {source.userName ? ` • ${source.userName}` : ''}
                                                        {source.createdAt ? ` • ${fmtDate(source.createdAt)}` : ''}
                                                    </span>
                                                    {canOpen && <Link2 size={10} />}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })()}
                                {/* Task #111/#115: painel "Memória DHL" — estatísticas por região nos
                                    últimos 30 dias e lista das correções mais recentes com botão para
                                    o auditor remover (apaga a linha em system_logs e atualiza o cache
                                    do dhlAutoTableSelector imediatamente). */}
                                {isDhlSupplyClient(mission.originalClientName || mission.client) && (() => {
                                    const stats = getDhlCorrectionStatsByRegion(30);
                                    const entries = Object.entries(stats).sort((a, b) => b[1] - a[1]);
                                    const total = entries.reduce((s, [, n]) => s + n, 0);
                                    const recent = dhlCorrections.slice(0, 15);
                                    const handleForget = (rec: DhlCorrectionRecord) => {
                                        if (!rec.logId) {
                                            showNotification('Aviso', 'Esta correção ainda não foi sincronizada — reabra o modal antes de removê-la.', 'info');
                                            return;
                                        }
                                        if (!window.confirm('Esquecer esta correção DHL? Ela não vai mais influenciar as próximas sugestões.')) return;
                                        supabase.from('system_logs').delete().eq('id', rec.logId).then(({ error }) => {
                                            if (error) {
                                                console.warn('[DHL Memória] Falha ao remover correção:', error.message);
                                                showNotification('Erro', 'Não foi possível remover esta correção: ' + error.message, 'error');
                                                return;
                                            }
                                            const updated = dhlCorrections.filter(c => String(c.logId ?? '') !== String(rec.logId));
                                            setDhlCorrections(updated);
                                            setDhlCorrectionsCache(updated);
                                            showNotification('Memória DHL', 'Correção esquecida com sucesso.', 'success');
                                        });
                                    };
                                    return (
                                        <div
                                            className="mt-2 p-2 rounded-lg border border-purple-100 bg-purple-50/60"
                                            data-testid="panel-dhl-correction-stats"
                                        >
                                            <div className="flex items-center gap-1.5 text-[10px] font-black text-purple-700 uppercase tracking-wide">
                                                <BrainCircuit size={12} />
                                                <span>Memória DHL — Correções nos últimos 30 dias ({total})</span>
                                            </div>
                                            {entries.length === 0 ? (
                                                <p className="text-[9px] text-purple-500 mt-1">Sem correções registradas no período.</p>
                                            ) : (
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {entries.map(([region, count]) => (
                                                        <span
                                                            key={region}
                                                            className="text-[9px] font-bold text-purple-800 bg-white border border-purple-200 px-1.5 py-0.5 rounded"
                                                            data-testid={`stat-dhl-region-${region}`}
                                                        >
                                                            {region}: {count}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            {recent.length > 0 && (
                                                <div className="mt-2 pt-2 border-t border-purple-200">
                                                    <div className="text-[9px] font-black text-purple-700 uppercase tracking-wide mb-1">
                                                        Correções recentes (últimas {recent.length})
                                                    </div>
                                                    <ul className="space-y-1 max-h-44 overflow-y-auto pr-1" data-testid="list-dhl-corrections">
                                                        {recent.map((rec, idx) => {
                                                            const chosenTable = clientTables.find(t => String(t.id) === String(rec.chosenTableId));
                                                            const tableLabel = chosenTable?.operation_type || `Tabela #${rec.chosenTableId}`;
                                                            const when = rec.createdAt ? formatDateTimeBR(rec.createdAt) : '—';
                                                            const route = (rec.originCity || rec.destCity)
                                                                ? `${rec.originCity || '?'} → ${rec.destCity || '?'}`
                                                                : 'Rota não informada';
                                                            const key = rec.logId != null ? String(rec.logId) : `${rec.createdAt}-${idx}`;
                                                            return (
                                                                <li
                                                                    key={key}
                                                                    className="flex items-start gap-2 bg-white border border-purple-200 rounded p-1.5"
                                                                    data-testid={`item-dhl-correction-${key}`}
                                                                >
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="text-[9px] text-purple-500 font-bold">{when}</div>
                                                                        <div className="text-[10px] font-bold text-purple-900 truncate" title={route}>{route}</div>
                                                                        <div className="text-[9px] text-purple-700">
                                                                            <span className="font-bold">{rec.region || '—'}</span>
                                                                            <span> · {rec.band || 0}km</span>
                                                                        </div>
                                                                        <div className="text-[9px] text-purple-800 truncate" title={tableLabel}>
                                                                            → {tableLabel}
                                                                        </div>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleForget(rec)}
                                                                        className="shrink-0 text-[9px] font-black uppercase px-2 py-1 rounded bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 active:scale-95 transition-all"
                                                                        title="Esquecer esta correção"
                                                                        data-testid={`button-forget-dhl-correction-${key}`}
                                                                    >
                                                                        Esquecer
                                                                    </button>
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>

                            {financialData.client.tableName && (
                                <div className="mb-4">
                                    <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded text-[9px] font-black uppercase border border-blue-100 flex items-center gap-1 w-fit">
                                        <CheckCircle2 size={10}/> {financialData.client.tableName}
                                    </span>
                                </div>
                            )}

                            <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 mb-4">
                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <div>
                                        <p className="text-[8px] font-black text-blue-400 uppercase">Acionamento</p>
                                        <p className="text-sm font-black text-blue-700">{formatCurrency(financialData.client.base)}</p>
                                    </div>
                                    <div className="border-l border-blue-200">
                                        <p className="text-[8px] font-black text-blue-400 uppercase">Franquia KM</p>
                                        <p className="text-sm font-black text-blue-700">{financialData.client.franchiseKm} km</p>
                                    </div>
                                    <div className="border-l border-blue-200">
                                        <p className="text-[8px] font-black text-blue-400 uppercase">Hora Franquia</p>
                                        <p className="text-sm font-black text-blue-700">{financialData.client.franchiseHours}h</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-blue-200 text-center">
                                    <div>
                                        <p className="text-[8px] font-black text-blue-400 uppercase">Km Excedente</p>
                                        <p className="text-xs font-black text-blue-700">R$ {financialData.client.unitPriceKm.toFixed(2)}</p>
                                    </div>
                                    <div className="border-l border-blue-200">
                                        <p className="text-[8px] font-black text-blue-400 uppercase">Hora Excedente</p>
                                        <p className="text-xs font-black text-blue-700">R$ {financialData.client.unitPriceHour.toFixed(2)}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-0 mb-4 rounded-xl border border-gray-200 overflow-hidden">
                                <div className="bg-gray-50 p-3 flex flex-col justify-between">
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Base (Saída)</p>
                                        <p className="text-lg font-black text-gray-800 mt-1">
                                            <span className="text-[10px] font-semibold text-gray-400 mr-0.5">R$</span>
                                            {financialData.client.base.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-200">
                                        <span className="text-[10px] text-gray-400">R$</span>
                                        <input type="text" className={`w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs font-bold text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none ${(isController || isEffectivelyLocked) ? 'pointer-events-none opacity-60' : ''}`} placeholder={financialData.client.base.toFixed(2)} value={customClientBase} onChange={e => { if (!isController && !isEffectivelyLocked) handleManualInput(setCustomClientBase, e.target.value); }} readOnly={isController || isEffectivelyLocked} />
                                        {customClientBase && <span className="text-[8px] text-blue-600 font-bold bg-blue-50 px-1 py-0.5 rounded shrink-0">AJUST</span>}
                                    </div>
                                </div>
                                <div className="bg-gray-50 p-3 border-l border-gray-200 flex flex-col justify-between">
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Extra KM</p>
                                        <p className={`text-lg font-black mt-1 ${financialData.client.extraKmVal > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                                            +{formatCurrency(financialData.client.extraKmVal)}
                                        </p>
                                        <p className="text-[9px] text-gray-400 font-mono leading-tight mt-0.5">
                                            {financialData.client.excessKm.toFixed(1)}km × R${financialData.client.unitPriceKm.toFixed(2)}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-200">
                                        <span className="text-[10px] text-gray-400">R$</span>
                                        <input type="text" className={`w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs font-bold text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none ${(isController || isEffectivelyLocked) ? 'pointer-events-none opacity-60' : ''}`} placeholder={financialData.client.unitPriceKm.toFixed(2)} value={customClientKm} onChange={e => { if (!isController && !isEffectivelyLocked) handleManualInput(setCustomClientKm, e.target.value); }} readOnly={isController || isEffectivelyLocked} />
                                        {customClientKm && <span className="text-[8px] text-blue-600 font-bold shrink-0">AJUST</span>}
                                    </div>
                                </div>
                                <div className="bg-gray-50 p-3 border-l border-gray-200 flex flex-col justify-between">
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Extra Hora</p>
                                        <p className={`text-lg font-black mt-1 ${financialData.client.extraHrVal > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                                            +{formatCurrency(financialData.client.extraHrVal)}
                                        </p>
                                        <p className="text-[9px] text-gray-400 font-mono leading-tight mt-0.5">
                                            {formatHoursHHMM(financialData.client.excessHoursReal)} real
                                        </p>
                                        {financialData.client.excessHours !== financialData.client.excessHoursReal && financialData.client.excessHours > 0 && (
                                            <p className="text-[8px] text-blue-500 font-bold mt-0.5">Cobrado: {formatHoursHHMM(financialData.client.excessHours)} × R${financialData.client.unitPriceHour.toFixed(2)}</p>
                                        )}
                                        {financialData.client.excessHours === financialData.client.excessHoursReal && (
                                            <p className="text-[9px] text-gray-400 font-mono leading-tight">{formatHoursHHMM(financialData.client.excessHours)} × R${financialData.client.unitPriceHour.toFixed(2)}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-200">
                                        <span className="text-[10px] text-gray-400">R$</span>
                                        <input type="text" className={`w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs font-bold text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none ${(isController || isEffectivelyLocked) ? 'pointer-events-none opacity-60' : ''}`} placeholder={financialData.client.unitPriceHour.toFixed(2)} value={customClientHour} onChange={e => { if (!isController && !isEffectivelyLocked) handleManualInput(setCustomClientHour, e.target.value); }} readOnly={isController || isEffectivelyLocked} />
                                        {customClientHour && <span className="text-[8px] text-blue-600 font-bold shrink-0">AJUST</span>}
                                    </div>
                                </div>
                            </div>

                        </div>

                        {/* COLUNA CUSTO (FORNECEDOR) */}
                        <div className={`bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col h-full relative ${isZeroCostError ? 'ring-2 ring-red-500' : ''}`}>
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-sm font-black text-red-700 uppercase tracking-widest flex items-center gap-2">
                                    [ {formatProviderName(mission.provider)} ]
                                </h4>
                                {!mission.is_same_os && !isEffectivelyLocked && (
                                    <button
                                        data-testid="btn-recalculate-provider"
                                        onClick={() => setShowRecalcProviderDialog(true)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-[10px] font-black uppercase rounded-lg hover:bg-red-700 transition-all shadow-md active:scale-95"
                                        title="Recalcular custos do fornecedor"
                                    >
                                        <RefreshCw size={12} />
                                        Recalcular
                                    </button>
                                )}
                                {showRecalcProviderDialog && (
                                    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in" onClick={() => setShowRecalcProviderDialog(false)}>
                                        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
                                            <h3 className="text-base font-black text-gray-900 uppercase tracking-widest mb-2">Recalcular pagamento do fornecedor</h3>
                                            <p className="text-xs text-gray-600 mb-5">Escolha como você quer recalcular o custo desta OS.</p>
                                            <div className="flex flex-col gap-3">
                                                <button
                                                    data-testid="btn-recalc-and-reset"
                                                    onClick={async () => {
                                                        setShowRecalcProviderDialog(false);
                                                        const currentTableId = manualProviderTableId;
                                                        setCustomProviderBase('');
                                                        setCustomProviderKm('');
                                                        setCustomProviderHour('');
                                                        setUseSavedValues(false);
                                                        userManuallyEditedRef.current = false;
                                                        setMission(prev => prev ? { ...prev, revenue_edit_reason: '', cost_edit_reason: '', billing_verified_by: null } : prev);
                                                        setManualProviderTableId('');
                                                        if (mission) {
                                                            await supabase.from('missions').update({ revenue_edit_reason: '', cost_edit_reason: '', billing_verified_by: null }).eq('id', mission.id);
                                                            await supabase.from('system_logs').delete().eq('entity', 'BillingAdjustment').eq('entity_id', mission.id);
                                                        }
                                                        setTimeout(() => {
                                                            setManualProviderTableId(currentTableId);
                                                            showNotification('Recalculado', 'Dados zerados. Sistema refez o cálculo automaticamente.', 'success');
                                                        }, 100);
                                                    }}
                                                    className="w-full text-left px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-md transition-all"
                                                >
                                                    <div className="text-sm font-black uppercase tracking-wider">Recalcular e Zerar dados</div>
                                                    <div className="text-[11px] font-medium opacity-90 mt-0.5">Apaga edições manuais e refaz todo o cálculo a partir das tabelas.</div>
                                                </button>
                                                <button
                                                    data-testid="btn-recalc-manual-adjust"
                                                    onClick={() => {
                                                        setShowRecalcProviderDialog(false);
                                                        setUseSavedValues(false);
                                                        userManuallyEditedRef.current = true;
                                                        showNotification('Ajuste Manual', 'Edite os campos de custo abaixo. Ao clicar em Salvar Ajustes, os valores serão preservados.', 'info');
                                                    }}
                                                    className="w-full text-left px-4 py-3 bg-slate-900 hover:bg-black text-white rounded-xl shadow-md transition-all"
                                                >
                                                    <div className="text-sm font-black uppercase tracking-wider">Ajuste Manual</div>
                                                    <div className="text-[11px] font-medium opacity-90 mt-0.5">Mantém os valores e libera edição livre dos campos abaixo.</div>
                                                </button>
                                                <button
                                                    onClick={() => setShowRecalcProviderDialog(false)}
                                                    className="w-full px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900 uppercase tracking-widest mt-1"
                                                >
                                                    Cancelar
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="mb-4">
                                <label className={LABEL_CLASS}>Tabela de Custo de Referência</label>
                                {financialData.autoEngine?.active && (
                                    <div className="mb-2 p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-800 uppercase tracking-widest flex items-center gap-1.5">
                                        <Zap size={11}/> Motor Automático ATIVO — tabelas manuais ignoradas
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    {(() => {
                                        const placeholderLabel = financialData.autoEngine?.active
                                            ? `AUTO ${financialData.autoEngine.bandKm}KM / ${financialData.autoEngine.bandHours}h`
                                            : (mission.is_same_os ? 'Custo Zero (Mesma OS)' : 'IA Detectando Melhor Custo...');
                                        const options: FilterableSelectOption[] = [
                                            { value: '', label: placeholderLabel },
                                            ...(!mission.is_same_os && (!financialData.autoEngine?.active || fullEditMode || canOverrideAutoProvider)
                                                ? [...filteredProviderTables]
                                                    .filter(t => !/^__AUTO_MASTER__/i.test((t.operation_type || '').trim()))
                                                    .sort((a, b) => (a.operation_type || '').localeCompare(b.operation_type || '', 'pt-BR', { numeric: true, sensitivity: 'base' }))
                                                    .map(t => ({ value: String(t.id), label: t.operation_type || '' }))
                                                : []),
                                        ];
                                        const handleChange = (val: string) => {
                                            if (isEffectivelyLocked && !fullEditMode && !canEditTablesEvenIfLocked) return;
                                            if (financialData.autoEngine?.active && !fullEditMode && !canOverrideAutoProvider) return;
                                            setManualProviderTableId(val);
                                            setCustomProviderBase(''); setCustomProviderKm(''); setCustomProviderHour('');
                                            setUseSavedValues(false);
                                            userManuallyEditedRef.current = false;
                                            // "Só abrir o campo, sem regravar": numa OS já SALVA/APROVADA a troca da
                                            // tabela de custo pela auditoria fica apenas em estado local até o
                                            // Salvar/Aprovar explícito (preserva snapshots imutáveis).
                                            if (!(isBillingLocked && canEditTablesEvenIfLocked)) {
                                                setMission(prev => prev ? { ...prev, revenue_edit_reason: '', cost_edit_reason: '', billing_verified_by: null } : prev);
                                                if (mission) supabase.from('missions').update({ revenue_edit_reason: '', cost_edit_reason: '', billing_verified_by: null }).eq('id', mission.id);
                                            }
                                            recalcBigNumbersOnTableSwap({ providerTableId: val });
                                        };
                                        // EDIÇÃO TOTAL (Barbara/Thiago/Simone/diretoria/admin) destrava o
                                        // seletor mesmo em MESMA OS, motor auto ativo ou faturamento travado.
                                        // OS 5046: a auditoria (canOverrideAutoProvider) também pode trocar a
                                        // tabela com o motor auto ATIVO, sem precisar de EDIÇÃO TOTAL.
                                        const autoBlocksSelector = !!financialData.autoEngine?.active && !canOverrideAutoProvider;
                                        const providerSelectorDisabled = !fullEditMode && (mission.is_same_os || (isEffectivelyLocked && !canEditTablesEvenIfLocked) || autoBlocksSelector);
                                        return (
                                            <FilterableSelect
                                                value={(!fullEditMode && financialData.autoEngine?.active) ? '' : (manualProviderTableId || '')}
                                                onChange={handleChange}
                                                options={options}
                                                placeholder={placeholderLabel}
                                                disabled={providerSelectorDisabled}
                                                accentColor="red"
                                                buttonClassName={`w-full p-2 bg-gray-50 border rounded-lg text-xs font-bold text-gray-700 uppercase outline-none focus:border-red-500 flex items-center justify-between gap-2 ${isZeroCostError ? 'border-red-300 bg-red-50 text-red-900 animate-pulse' : 'border-gray-200 hover:border-gray-300'} ${providerSelectorDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                                                data-testid="select-provider-table"
                                            />
                                        );
                                    })()}
                                    {(!mission.is_same_os || fullEditMode) && manualProviderTableId && (
                                        <button 
                                            onClick={() => { setEditCostTableId(manualProviderTableId); setIsAddCostModalOpen(true); }}
                                            className="p-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-all shadow-md active:scale-95"
                                            title="Editar Tabela Selecionada"
                                        >
                                            <Edit2 size={14}/>
                                        </button>
                                    )}
                                    {(!mission.is_same_os || fullEditMode) && (
                                        <button 
                                            onClick={() => { setEditCostTableId(null); setIsAddCostModalOpen(true); }}
                                            className="p-2 bg-slate-900 text-white rounded-lg hover:bg-black transition-all shadow-md active:scale-95"
                                            title="Cadastrar Nova Tabela"
                                        >
                                            <Plus size={14}/>
                                        </button>
                                    )}
                                    {!mission.is_same_os && (
                                        <button
                                            onClick={handleAiSuggest}
                                            disabled={aiLoading}
                                            className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all shadow-md active:scale-95 disabled:opacity-50"
                                            title="Sugerir Tabela com IA"
                                            data-testid="button-ai-suggest-provider"
                                        >
                                            {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                        </button>
                                    )}
                                </div>
                                {mission.is_same_os && (
                                    <div
                                        data-testid="alert-same-os-provider-table-unused"
                                        className="mt-2 p-2.5 rounded-lg bg-blue-50 border border-blue-300 text-[10px] font-black text-blue-800 uppercase tracking-wide flex items-start gap-2"
                                    >
                                        <Info size={14} className="text-blue-600 shrink-0 mt-0.5" />
                                        <span>
                                            TABELA NÃO UTILIZADA, POR SER A MESMA OS - {mission.parent_mission_id || '—'}
                                        </span>
                                    </div>
                                )}
                                <div className="mt-2 text-[9px] font-bold text-gray-400 flex items-center gap-1.5 bg-gray-50 p-2 rounded-lg border border-gray-100">
                                    <BrainCircuit size={12} className="text-red-500" />
                                    <span>IA Detectou: {financialData.provider.detectionLog}</span>
                                </div>
                            </div>

                            {isZeroCostError && (
                                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-[10px] text-red-700 leading-relaxed font-medium animate-in slide-in-from-top-2">
                                    <div className="flex items-center gap-1.5 font-black mb-1.5 text-red-800 uppercase">
                                         <AlertTriangle size={14} className="text-red-600" /> Erro de Cálculo: Base Zerada
                                    </div>
                                    O custo base está vindo zerado. 
                                    <br/><strong className="text-red-900">Motivo:</strong> A tabela de custo para o fornecedor <u>{formatProviderName(mission.provider)}</u> não foi localizada ou o vínculo está corrompido para esta quilometragem.
                                    <br/><br/>
                                    👉 Por favor, selecione a tabela manualmente no campo acima ou clique no botão <strong>(+)</strong> para cadastrar.
                                </div>
                            )}

                            <div className="bg-red-50/50 p-3 rounded-xl border border-red-100 mb-4">
                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <div>
                                        <p className="text-[8px] font-black text-red-400 uppercase">Acionamento</p>
                                        <p className="text-sm font-black text-red-700">{formatCurrency(financialData.provider.base)}</p>
                                    </div>
                                    <div className="border-l border-red-200">
                                        <p className="text-[8px] font-black text-red-400 uppercase">Franquia KM</p>
                                        <p className="text-sm font-black text-red-700">{financialData.provider.franchiseKm} km</p>
                                    </div>
                                    <div className="border-l border-red-200">
                                        <p className="text-[8px] font-black text-red-400 uppercase">Hora Franquia</p>
                                        <p className="text-sm font-black text-red-700">{financialData.provider.franchiseHours}h</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-red-200 text-center">
                                    <div>
                                        <p className="text-[10px] font-black text-red-400 uppercase">Km Excedente</p>
                                        <p className="text-sm font-black text-red-700">R$ {financialData.provider.unitCostKm.toFixed(2)}</p>
                                    </div>
                                    <div className="border-l border-red-200">
                                        <p className="text-[10px] font-black text-red-400 uppercase">Hora Excedente</p>
                                        <p className="text-sm font-black text-red-700">R$ {financialData.provider.unitCostHour.toFixed(2)}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Task #55 — Painel de Cálculo Sugerido pelo motor automático */}
                            {financialData.autoEngine?.active && (
                                <div className="mb-4 p-4 rounded-xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-white" data-testid="panel-auto-engine">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1.5 bg-emerald-600 text-white rounded-lg"><Calculator size={14}/></div>
                                            <div>
                                                <p className="text-[11px] font-black text-emerald-800 uppercase tracking-widest">Cálculo do Motor Automático</p>
                                                <p className="text-[9px] text-emerald-600 font-bold">Faixa {financialData.autoEngine.bandKm}KM / Franquia {financialData.autoEngine.bandHours}h (Regra de Ouro)</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-1 rounded uppercase tracking-wider">Aplicado automaticamente</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const engineTotal = financialData.provider.serviceTotal + parseNumber(tollProviderInput) + parseNumber(displacementProviderInput);
                                                    if (engineTotal <= 0) return;
                                                    if (canUnlockBilling && isBillingLocked) setUnlockOverride(true);
                                                    userManuallyEditedRef.current = false;
                                                    setCostInput(engineTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                                                    setCostEditReason('');
                                                    showNotification('Recalculado', `Pagamento do fornecedor atualizado para R$ ${engineTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (motor automático).`, 'success');
                                                }}
                                                className="px-2 py-1 rounded text-[9px] font-black text-white bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 uppercase tracking-wider shadow-sm flex items-center gap-1"
                                                data-testid="button-auto-engine-recalc"
                                                title="Recalcular pagamento do fornecedor com o valor do motor automático (destrava se necessário)"
                                            >
                                                <RefreshCw size={10} /> Recalcular
                                            </button>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
                                        <div className="bg-white rounded-lg p-2 border border-emerald-100">
                                            <p className="text-emerald-500 font-black uppercase">KM real</p>
                                            <p className="text-emerald-900 font-black text-sm font-mono">{financialData.autoEngine.realKm.toFixed(1)}</p>
                                        </div>
                                        <div className="bg-white rounded-lg p-2 border border-emerald-100">
                                            <p className="text-emerald-500 font-black uppercase">Duração</p>
                                            <p className="text-emerald-900 font-black text-sm font-mono">{formatHoursHHMM(financialData.autoEngine.durationHours)}</p>
                                        </div>
                                        <div className="bg-white rounded-lg p-2 border border-emerald-100">
                                            <p className="text-emerald-500 font-black uppercase">+KM</p>
                                            <p className="text-emerald-900 font-black text-sm font-mono">{financialData.autoEngine.extraKm.toFixed(1)} → R$ {financialData.autoEngine.extraKmValue.toFixed(2)}</p>
                                        </div>
                                        <div className="bg-white rounded-lg p-2 border border-emerald-100">
                                            <p className="text-emerald-500 font-black uppercase">+Horas</p>
                                            <p className="text-emerald-900 font-black text-sm font-mono">{formatHoursHHMM(financialData.autoEngine.extraHours)} → R$ {financialData.autoEngine.extraHourValue.toFixed(2)}</p>
                                        </div>
                                    </div>
                                    <div className="mt-3 pt-3 border-t border-emerald-200 flex items-center justify-between">
                                        <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Custo Total Calculado</p>
                                        <p className="text-xl font-black text-emerald-700 font-mono">R$ {financialData.autoEngine.totalCost.toFixed(2)}</p>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-3 gap-0 mb-4 rounded-xl border border-gray-200 overflow-hidden">
                                <div className="bg-gray-50 p-3 flex flex-col justify-between">
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Custo Base</p>
                                        <p className={`text-lg font-black mt-1 ${financialData.provider.base === 0 && !mission.is_same_os ? 'text-red-500' : 'text-gray-800'}`}>
                                            <span className="text-[10px] font-semibold text-gray-400 mr-0.5">R$</span>
                                            {financialData.provider.base.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                        </p>
                                        {financialData.providerMult > 1 && <p className="text-[9px] text-red-500 font-bold font-mono mt-0.5">(x{financialData.providerMult})</p>}
                                    </div>
                                    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-200">
                                        <span className="text-[10px] text-gray-400">R$</span>
                                        <input type="text" className={`w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs font-bold text-gray-700 focus:border-red-500 focus:ring-1 focus:ring-red-200 outline-none ${isEffectivelyLocked ? 'pointer-events-none opacity-60' : ''}`} placeholder={financialData.provider.base.toFixed(2)} value={customProviderBase} onChange={e => { if (!isEffectivelyLocked) handleManualInput(setCustomProviderBase, e.target.value); }} readOnly={isEffectivelyLocked} />
                                        {customProviderBase && <span className="text-[8px] text-red-600 font-bold bg-red-50 px-1 py-0.5 rounded shrink-0">AJUST</span>}
                                    </div>
                                </div>
                                <div className="bg-gray-50 p-3 border-l border-gray-200 flex flex-col justify-between">
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Custo KM+</p>
                                        <p className={`text-lg font-black mt-1 ${financialData.provider.extraKmVal > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                                            +{formatCurrency(financialData.provider.extraKmVal)}
                                        </p>
                                        <p className="text-[9px] text-gray-400 font-mono leading-tight mt-0.5">
                                            {financialData.provider.excessKm.toFixed(1)}km × R${financialData.provider.unitCostKm.toFixed(2)}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-200">
                                        <span className="text-[10px] text-gray-400">R$</span>
                                        <input type="text" className={`w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs font-bold text-gray-700 focus:border-red-500 focus:ring-1 focus:ring-red-200 outline-none ${isEffectivelyLocked ? 'pointer-events-none opacity-60' : ''}`} placeholder={financialData.provider.unitCostKm.toFixed(2)} value={customProviderKm} onChange={e => { if (!isEffectivelyLocked) handleManualInput(setCustomProviderKm, e.target.value); }} readOnly={isEffectivelyLocked} />
                                        {customProviderKm && <span className="text-[8px] text-red-600 font-bold shrink-0">AJUST</span>}
                                    </div>
                                </div>
                                <div className="bg-gray-50 p-3 border-l border-gray-200 flex flex-col justify-between">
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Custo HR+</p>
                                        <p className={`text-lg font-black mt-1 ${financialData.provider.extraHrVal > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                                            +{formatCurrency(financialData.provider.extraHrVal)}
                                        </p>
                                        <p className="text-[9px] text-gray-400 font-mono leading-tight mt-0.5">
                                            {formatHoursHHMM(financialData.provider.excessHoursReal)} real
                                        </p>
                                        {financialData.provider.excessHours !== financialData.provider.excessHoursReal && financialData.provider.excessHours > 0 && (
                                            <p className="text-[8px] text-blue-500 font-bold mt-0.5">Cobrado: {formatHoursHHMM(financialData.provider.excessHours)} × R${financialData.provider.unitCostHour.toFixed(2)}</p>
                                        )}
                                        {financialData.provider.excessHours === financialData.provider.excessHoursReal && (
                                            <p className="text-[9px] text-gray-400 font-mono leading-tight">{formatHoursHHMM(financialData.provider.excessHours)} × R${financialData.provider.unitCostHour.toFixed(2)}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-200">
                                        <span className="text-[10px] text-gray-400">R$</span>
                                        <input type="text" className={`w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs font-bold text-gray-700 focus:border-red-500 focus:ring-1 focus:ring-red-200 outline-none ${isEffectivelyLocked ? 'pointer-events-none opacity-60' : ''}`} placeholder={financialData.provider.unitCostHour.toFixed(2)} value={customProviderHour} onChange={e => { if (!isEffectivelyLocked) handleManualInput(setCustomProviderHour, e.target.value); }} readOnly={isEffectivelyLocked} />
                                        {customProviderHour && <span className="text-[8px] text-red-600 font-bold shrink-0">AJUST</span>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-inner">
                        <div className="flex justify-between items-center mb-3">
                            <label className={LABEL_CLASS}>Pedágio / Despesas de Rota</label>
                            <div className="flex items-center gap-2">
                                {aiMaturity > 0 && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Confiança IA: {aiMaturity}%</span>
                                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-indigo-500" style={{ width: `${aiMaturity}%` }}></div>
                                        </div>
                                    </div>
                                )}
                                {isCalculatingToll && (
                                    <div className="flex items-center gap-1.5 text-[10px] font-black text-white bg-indigo-600 px-2 py-1 rounded-lg border border-indigo-700">
                                        <Loader2 size={12} className="animate-spin"/> CALCULANDO...
                                    </div>
                                )}
                                {!isCalculatingToll && tollConfirmed && (
                                    <div className="flex items-center gap-1.5 text-[10px] font-black text-white bg-green-600 px-2 py-1 rounded-lg border border-green-700">
                                        <CheckCircle2 size={12}/> {tollSource || 'CONFIRMADO'}
                                    </div>
                                )}
                                {!isCalculatingToll && !tollConfirmed && (
                                    <button
                                        onClick={() => setShowTollConfirmDialog(true)}
                                        className="flex items-center gap-1.5 text-[10px] font-black text-white bg-orange-500 hover:bg-orange-600 px-3 py-1.5 rounded-lg border border-orange-600 animate-pulse cursor-pointer transition-colors"
                                        data-testid="button-open-toll-confirmation"
                                    >
                                        <AlertTriangle size={12}/> CONFIRMAR PEDÁGIO
                                    </button>
                                )}
                                {!isCalculatingToll && tollConfirmed && !isEffectivelyLocked && (
                                    <button
                                        onClick={() => setShowTollConfirmDialog(true)}
                                        className="flex items-center gap-1.5 text-[10px] font-black text-indigo-700 hover:text-indigo-900 px-2 py-1 rounded-lg border border-indigo-200 hover:bg-indigo-50"
                                        data-testid="button-reconfirm-toll"
                                        title="Reconfirmar / ver histórico de pedágio"
                                    >
                                        <History size={12}/> HISTÓRICO
                                    </button>
                                )}
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[9px] font-black text-green-700 uppercase mb-1 block">Pedágio Cliente</label>
                                <div className={`relative bg-green-50 border border-green-200 rounded-xl p-3 flex items-center ${isController ? 'opacity-70' : ''}`}>
                                    <span className="text-sm font-bold text-green-500 mr-2">R$</span>
                                    <input 
                                        type="text" 
                                        className={`flex-1 bg-transparent border-none outline-none font-black text-xl text-green-900 ${(isController || isEffectivelyLocked) ? 'pointer-events-none' : ''}`}
                                        value={tollInput} 
                                        onChange={e => { if (!isController && !isEffectivelyLocked) handleTollChange(e.target.value); }} 
                                        readOnly={isController || isEffectivelyLocked}
                                        data-testid="input-toll-client"
                                    />
                                    <Building2 size={16} className="text-green-300 ml-2" />
                                </div>
                                {useSavedValues && parseNumber(tollInput) > 0 && (
                                    <span className="text-[8px] font-bold text-amber-600 mt-1 block">⚠ PEDÁGIO SALVO NA MEMÓRIA</span>
                                )}
                            </div>
                            <div>
                                <label className="text-[9px] font-black text-green-700 uppercase mb-1 block">Deslocamento Aprovado (Cobrado) — Cliente</label>
                                <div className={`relative bg-green-50 border border-green-200 rounded-xl p-3 flex items-center ${isController ? 'opacity-70' : ''}`}>
                                    <span className="text-sm font-bold text-green-500 mr-2">R$</span>
                                    <input 
                                        type="text" 
                                        className={`flex-1 bg-transparent border-none outline-none font-black text-xl text-green-900 ${(isController || isEffectivelyLocked) ? 'pointer-events-none' : ''}`}
                                        value={displacementInput} 
                                        onChange={e => { if (!isController && !isEffectivelyLocked) handleDisplacementChange(e.target.value); }} 
                                        readOnly={isController || isEffectivelyLocked}
                                        data-testid="input-displacement-client"
                                    />
                                    <Building2 size={16} className="text-green-300 ml-2" />
                                </div>
                                {useSavedValues && parseNumber(displacementInput) > 0 && (
                                    <span className="text-[8px] font-bold text-amber-600 mt-1 block">⚠ DESLOCAMENTO SALVO NA MEMÓRIA</span>
                                )}
                                {dhlDeslocInfo && dhlDeslocInfo.clientVal > 0 && (
                                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                                        <span className="text-[8px] font-bold text-emerald-700" data-testid="text-dhl-desloc-client">
                                            KM DHL AUTORIZADO: {dhlDeslocInfo.km.toLocaleString('pt-BR')} km × R$ {dhlDeslocInfo.clientRate.toFixed(2)} = {formatCurrency(dhlDeslocInfo.clientVal)}
                                        </span>
                                        {!isController && !isEffectivelyLocked && Math.abs(parseNumber(displacementInput) - dhlDeslocInfo.clientVal) > 0.01 && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const fmtBR = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                                    if (userManuallyEditedRef.current) {
                                                        // Valor manual salvo: soma o deslocamento direto no Valor Final,
                                                        // já que o handle abaixo não mexe no número grande nesse modo.
                                                        const oldDisp = parseNumber(displacementInput);
                                                        const currentRev = parseNumber(revenueInput);
                                                        setRevenueInput(fmtBR(currentRev - oldDisp + dhlDeslocInfo.clientVal));
                                                    }
                                                    handleDisplacementChange(fmtBR(dhlDeslocInfo.clientVal));
                                                }}
                                                className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[8px] font-black uppercase tracking-wider hover:bg-emerald-700"
                                                data-testid="button-apply-dhl-desloc"
                                            >
                                                Aplicar
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="text-[9px] font-black text-blue-700 uppercase mb-1 block">Pedágio Fornecedor</label>
                                <div className="relative bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center">
                                    <span className="text-sm font-bold text-blue-500 mr-2">R$</span>
                                    <input 
                                        type="text" 
                                        className="flex-1 bg-transparent border-none outline-none font-black text-xl text-blue-900" 
                                        value={tollProviderInput} 
                                        onChange={e => handleTollProviderChange(e.target.value)}
                                        data-testid="input-toll-provider"
                                    />
                                    <Briefcase size={16} className="text-blue-300 ml-2" />
                                </div>
                                {tollEmbeddedInCost && (
                                    <span className="text-[8px] font-bold text-amber-600 mt-1 block">⚠ PEDÁGIO JÁ INCLUSO NO CUSTO SALVO</span>
                                )}
                                {!tollEmbeddedInCost && useSavedValues && (
                                    <span className="text-[8px] font-bold text-amber-600 mt-1 block">⚠ PEDÁGIO SALVO NA MEMÓRIA</span>
                                )}
                            </div>
                            <div>
                                <label className="text-[9px] font-black text-blue-700 uppercase mb-1 block">Deslocamento Aprovado (Cobrado) — Fornecedor</label>
                                <div className="relative bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center">
                                    <span className="text-sm font-bold text-blue-500 mr-2">R$</span>
                                    <input 
                                        type="text" 
                                        className="flex-1 bg-transparent border-none outline-none font-black text-xl text-blue-900" 
                                        value={displacementProviderInput} 
                                        onChange={e => handleDisplacementProviderChange(e.target.value)}
                                        data-testid="input-displacement-provider"
                                    />
                                    <Briefcase size={16} className="text-blue-300 ml-2" />
                                </div>
                                {useSavedValues && parseNumber(displacementProviderInput) > 0 && (
                                    <span className="text-[8px] font-bold text-amber-600 mt-1 block">⚠ DESLOCAMENTO SALVO NA MEMÓRIA</span>
                                )}
                                {dhlDeslocInfo && dhlDeslocInfo.clientVal > 0 && (
                                    <span className="text-[8px] font-bold text-slate-500 mt-1 block" data-testid="text-dhl-desloc-provider">
                                        Manual: preencha só se o fornecedor cobrar o deslocamento.
                                    </span>
                                )}
                            </div>
                        </div>
                        
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-4 bg-green-50 border border-green-100 rounded-xl relative group">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-[10px] font-black text-green-700 uppercase">Valor Final Cliente (Serviço + Pedágio + Deslocamento)</label>
                                <div className="flex items-center gap-2">
                                {(() => {
                                    const calcTotalBtn = financialData ? (financialData.client.total + parseNumber(displacementInput)) : 0;
                                    const inputValBtn = parseNumber(revenueInput);
                                    const isManualValueBtn = inputValBtn > 0 && calcTotalBtn > 0 && Math.abs(inputValBtn - calcTotalBtn) > 1;
                                    // Faturamento travado (salvo/aprovado): nunca oferecer "Restaurar Auto".
                                    if (isEffectivelyLocked) return (
                                        <span className="text-[9px] font-bold text-gray-600 bg-gray-200 px-2 py-0.5 rounded flex items-center gap-1" title="Faturamento salvo/aprovado — valores travados">
                                            <Lock size={10} /> Travado
                                        </span>
                                    );
                                    if (!isManualValueBtn || isController) return (
                                        <span className="text-[9px] font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded flex items-center gap-1" title="Recálculo automático ativo">
                                            <RefreshCw size={10} /> Auto
                                        </span>
                                    );
                                    return (
                                        <button type="button" onClick={handleRecalculateClient} className="flex items-center gap-1 text-[9px] font-bold text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-2 py-0.5 rounded transition-colors" title="Redefinir para o cálculo da tabela">
                                            <RefreshCw size={10} /> Restaurar Auto
                                        </button>
                                    );
                                })()}
                                {!isController && (() => {
                                    const missionClientName = mission.originalClientName || mission.client || '';
                                    const isMasterRow = (t: any) => /^__AUTO_MASTER__/i.test((t.operation_type || '').trim());
                                    const onlyThisClient = clientTables.filter(t => {
                                        if (isMasterRow(t)) return false;
                                        return clientTableMatchesMission(t.client || '', missionClientName);
                                    });
                                    const list = onlyThisClient.length > 0 ? onlyThisClient : clientTables.filter(t => !isMasterRow(t));
                                    const swapOptions: FilterableSelectOption[] = [
                                        { value: '', label: 'Automático (IA Detectando)' },
                                        ...[...list].sort((a, b) => (a.operation_type || '').localeCompare(b.operation_type || '', 'pt-BR', { numeric: true, sensitivity: 'base' })).map(t => {
                                            const isDhl = isDhlSupplyClient(t.client);
                                            const dhlBad = isDhl && !validateDhlTableName(t.operation_type).valid;
                                            return {
                                                value: String(t.id),
                                                label: onlyThisClient.length > 0 ? t.operation_type : `${t.operation_type} — ${t.client}`,
                                                prefix: dhlBad ? '⚠️ ' : '',
                                                title: dhlBad ? 'Tabela DHL fora do padrão — não é sugerida automaticamente' : undefined,
                                            };
                                        }),
                                    ];
                                    return (
                                        <TableSwapControl
                                            kind="client"
                                            accent="green"
                                            options={swapOptions}
                                            value={manualClientTableId || ''}
                                            onSelect={swapClientTable}
                                            onApply={() => handleUpdate(false)}
                                            disabled={isEffectivelyLocked && !canEditTablesEvenIfLocked}
                                            isApplying={isUpdating}
                                            previewTotal={financialData ? (financialData.client.total + parseNumber(displacementInput)) : 0}
                                        />
                                    );
                                })()}
                                </div>
                            </div>
                            {(() => {
                                const ibl = financialData.iblFee || 0;
                                const calcTotal = financialData.client.serviceTotal + parseNumber(tollInput) + parseNumber(displacementInput);
                                const savedTotal = parseNumber(revenueInput);
                                const isDivergent = Math.abs(calcTotal - savedTotal) > 1;
                                return (
                                    <div className={`flex flex-col gap-1 text-[9px] font-bold mb-2 px-2 py-1.5 rounded-lg border ${isDivergent ? 'text-amber-700 bg-amber-50/80 border-amber-300' : 'text-green-600 bg-green-100/60 border-green-200'}`}>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                            <span>{formatCurrency(financialData.client.base)} <span className={isDivergent ? 'text-amber-400' : 'text-green-400'}>(base)</span></span>
                                            <span>+ {formatCurrency(financialData.client.extraKmVal)} <span className={isDivergent ? 'text-amber-400' : 'text-green-400'}>(km{financialData.client.excessKm > 0 ? `: ${financialData.client.excessKm.toFixed(1)}×R$${financialData.client.unitPriceKm.toFixed(2)}` : ''})</span></span>
                                            <span>+ {formatCurrency(financialData.client.extraHrVal)} <span className={isDivergent ? 'text-amber-400' : 'text-green-400'}>(hora{financialData.client.excessHours > 0 ? `: ${formatHoursHHMM(financialData.client.excessHoursReal)} real → ${formatHoursHHMM(financialData.client.excessHours)}×R$${financialData.client.unitPriceHour.toFixed(2)}` : ''})</span></span>
                                            {ibl > 0 && <span>+ {formatCurrency(ibl)} <span className={isDivergent ? 'text-amber-400' : 'text-green-400'}>(IBL 12%)</span></span>}
                                            <span>+ {formatCurrency(parseNumber(tollInput))} <span className={isDivergent ? 'text-amber-400' : 'text-green-400'}>(pedágio)</span></span>
                                            <span>+ {formatCurrency(parseNumber(displacementInput))} <span className={isDivergent ? 'text-amber-400' : 'text-green-400'}>(deslocamento)</span></span>
                                            <span className="font-black">= {formatCurrency(calcTotal)}</span>
                                        </div>

                                    </div>
                                );
                            })()}
                            {(() => {
                                const calcTotal = financialData ? (financialData.client.serviceTotal + parseNumber(tollInput) + parseNumber(displacementInput)) : 0;
                                const inputVal = parseNumber(revenueInput);
                                const isManualValue = inputVal > 0 && calcTotal > 0 && Math.abs(inputVal - calcTotal) > 1;
                                return (
                                    <>
                                        <div className="flex items-baseline gap-2">
                                            <span className={`text-sm font-bold ${isManualValue ? 'text-amber-600' : 'text-green-600'}`}>
                                                {isManualValue ? '✍️ R$' : 'R$'}
                                            </span>
                                            <input 
                                                type="text" 
                                                inputMode="decimal"
                                                className={`w-full bg-white/60 border rounded-lg px-2 py-1 outline-none font-black text-3xl font-mono focus:ring-2 ${isManualValue ? 'border-amber-400 text-amber-900 focus:ring-amber-400 focus:border-amber-400 bg-amber-50/40' : 'border-green-200 text-green-900 focus:ring-green-400 focus:border-green-400'} ${!canEditClientData ? 'pointer-events-none opacity-70' : 'cursor-text'}`}
                                                value={revenueInput} 
                                                onChange={e => { if (canEditClientData) { userManuallyEditedRef.current = true; setUseSavedValues(true); setRevenueInput(e.target.value); setShowRevenueReasonInput(true); } }}
                                                readOnly={!canEditClientData}
                                                data-testid="input-revenue-total"
                                            />
                                        </div>
                                        <p className={`text-[8px] font-bold mt-1 italic ${isManualValue ? 'text-amber-600' : 'text-green-600'}`}>
                                            {isManualValue 
                                                ? `✍️ VALOR MANUAL — Cálculo automático: ${formatCurrency(calcTotal)}`
                                                : (canEditClientData ? '* EDITÁVEL - DIRETORIA / ADMINISTRADOR (toque para editar)' : '* VALOR TOTAL CALCULADO BASEADO NAS FRANQUIAS E MEDIÇÃO')}
                                        </p>
                                    </>
                                );
                            })()}
                            {(showRevenueReasonInput || revenueEditReason) && (
                                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                                    <label className="text-[9px] font-black text-amber-700 uppercase mb-1 block flex items-center gap-1"><AlertCircle size={10}/> Motivo da Alteração (Cliente)</label>
                                    <textarea
                                        className="w-full text-xs font-bold text-gray-700 border border-amber-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-amber-400/20 focus:border-amber-400 outline-none bg-white resize-none"
                                        rows={2}
                                        placeholder="Informe o motivo da alteração do valor..."
                                        value={revenueEditReason}
                                        onChange={e => setRevenueEditReason(e.target.value)}
                                        data-testid="input-revenue-edit-reason"
                                    />
                                    {mission.revenue_edit_reason && (
                                        <p className="text-[8px] text-gray-500 mt-1 italic">Último registro: {mission.revenue_edit_reason}</p>
                                    )}
                                </div>
                            )}
                            <div className="mt-3 flex items-center justify-between px-1 pt-2 border-t border-green-200">
                                <label className="text-[10px] font-black text-blue-700 uppercase">Taxa IBL (12%):</label>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-blue-600">{financialData.iblFee > 0 ? formatCurrency(financialData.iblFee) : '---'}</span>
                                    <button 
                                        onClick={() => { setIblEnabled(!iblEnabled); }} 
                                        className={`w-8 h-4 rounded-full transition-colors relative ${iblEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                                    >
                                        <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${iblEnabled ? 'translate-x-4' : ''}`}></div>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className={`p-4 ${mission?.verified_by && mission?.verified_at ? 'bg-blue-50 border-2 border-blue-300' : 'bg-blue-50 border border-blue-100'} rounded-xl relative group`}>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-[10px] font-black text-blue-700 uppercase flex items-center gap-1">
                                    Pagamento Fornecedor (Tabela + Pedágio + Deslocamento)
                                    {mission?.verified_by && mission?.verified_at && <Lock size={12} className="text-blue-600" />}
                                </label>
                                <div className="flex items-center gap-2">
                                {(!mission?.verified_by || !mission?.verified_at || canEditVerifiedProviderTotal) && (() => {
                                    const calcCostBtn = financialData ? (financialData.provider.serviceTotal + parseNumber(tollProviderInput) + parseNumber(displacementProviderInput)) : 0;
                                    const inputCostBtn = parseNumber(costInput);
                                    const isManualCostBtn = inputCostBtn > 0 && calcCostBtn > 0 && Math.abs(inputCostBtn - calcCostBtn) > 1;
                                    // Faturamento travado (salvo/aprovado): nunca oferecer "Restaurar Auto".
                                    if (isEffectivelyLocked) return (
                                        <span className="text-[9px] font-bold text-gray-600 bg-gray-200 px-2 py-0.5 rounded flex items-center gap-1" title="Faturamento salvo/aprovado — valores travados">
                                            <Lock size={10} /> Travado
                                        </span>
                                    );
                                    if (!isManualCostBtn) return (
                                        <span className="text-[9px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded flex items-center gap-1" title="Recálculo automático ativo">
                                            <RefreshCw size={10} /> Auto
                                        </span>
                                    );
                                    return (
                                        <button type="button" onClick={handleRecalculateProvider} className="flex items-center gap-1 text-[9px] font-bold text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-2 py-0.5 rounded transition-colors" title="Redefinir para o cálculo da tabela">
                                            <RefreshCw size={10} /> Restaurar Auto
                                        </button>
                                    );
                                })()}
                                {(!mission?.verified_by || !mission?.verified_at || canEditVerifiedProviderTotal) && !mission.is_same_os && (() => {
                                    const swapOptions: FilterableSelectOption[] = [
                                        { value: '', label: 'IA Detectando Melhor Custo...' },
                                        ...[...filteredProviderTables]
                                            .filter(t => !/^__AUTO_MASTER__/i.test((t.operation_type || '').trim()))
                                            .sort((a, b) => (a.operation_type || '').localeCompare(b.operation_type || '', 'pt-BR', { numeric: true, sensitivity: 'base' }))
                                            .map(t => ({ value: String(t.id), label: t.operation_type || '' })),
                                    ];
                                    return (
                                        <TableSwapControl
                                            kind="provider"
                                            accent="blue"
                                            options={swapOptions}
                                            value={manualProviderTableId || ''}
                                            onSelect={swapProviderTable}
                                            onApply={() => handleUpdate(false)}
                                            disabled={(isEffectivelyLocked && !fullEditMode && !canEditTablesEvenIfLocked) || (!!financialData.autoEngine?.active && !fullEditMode && !canOverrideAutoProvider)}
                                            isApplying={isUpdating}
                                            previewTotal={financialData ? (financialData.provider.serviceTotal + parseNumber(tollProviderInput) + parseNumber(displacementProviderInput)) : 0}
                                        />
                                    );
                                })()}
                                </div>
                            </div>
                            {mission?.verified_by && mission?.verified_at && !canEditVerifiedProviderTotal && (
                                <div className="bg-blue-100 border border-blue-300 rounded-lg px-3 py-1.5 mb-2 flex items-center gap-2">
                                    <ShieldCheck size={14} className="text-blue-700" />
                                    <span className="text-[9px] font-black text-blue-800">VERIFICADO PELO CONTROLLER — Valor travado. Somente Diretoria/Controller podem alterar.</span>
                                </div>
                            )}
                            {(() => {
                                const currentCalcCost = financialData.provider.serviceTotal + parseNumber(tollProviderInput) + parseNumber(displacementProviderInput);
                                const currentSavedCost = parseNumber(costInput);
                                const sysRef = systemCalculatedCost ?? currentCalcCost;
                                const controllerRef = controllerSavedCost ?? currentSavedCost;
                                const hasDivergence = Math.abs(sysRef - controllerRef) > 1 && controllerSavedCost != null;
                                const diffValue = controllerRef - sysRef;
                                const diffPercent = sysRef > 0 ? ((diffValue / sysRef) * 100) : 0;
                                const isOvercharge = diffValue > 0;
                                if (!hasDivergence) return null;
                                return (
                                    <div data-testid="audit-cost-comparison" className={`mb-2 p-3 rounded-xl border-2 ${isOvercharge ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-300'}`}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className={`p-1.5 rounded-lg ${isOvercharge ? 'bg-red-100' : 'bg-green-100'}`}>
                                                <Scale size={14} className={isOvercharge ? 'text-red-700' : 'text-green-700'} />
                                            </div>
                                            <span className={`text-[9px] font-black uppercase tracking-wider ${isOvercharge ? 'text-red-800' : 'text-green-800'}`}>
                                                Auditoria de Custo — {isOvercharge ? 'Valor acima do calculado' : 'Valor abaixo do calculado'}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-[9px]">
                                            <div className="bg-white/80 rounded-lg p-2 border border-gray-200">
                                                <p className="font-bold text-gray-500 uppercase mb-0.5">Sistema calculou</p>
                                                <p className="font-black text-gray-900 text-sm">{formatCurrency(sysRef)}</p>
                                                <p className="text-gray-400 text-[8px]">Cálculo automático (tabela)</p>
                                            </div>
                                            <div className={`rounded-lg p-2 border ${isOvercharge ? 'bg-red-100/80 border-red-200' : 'bg-green-100/80 border-green-200'}`}>
                                                <p className={`font-bold uppercase mb-0.5 ${isOvercharge ? 'text-red-600' : 'text-green-600'}`}>Controller salvou</p>
                                                <p className={`font-black text-sm ${isOvercharge ? 'text-red-900' : 'text-green-900'}`}>{formatCurrency(controllerRef)}</p>
                                                {controllerSaveInfo && <p className={`text-[8px] ${isOvercharge ? 'text-red-400' : 'text-green-400'}`}>{controllerSaveInfo.user} — {controllerSaveInfo.date}</p>}
                                            </div>
                                        </div>
                                        <div className={`mt-2 flex items-center justify-center gap-2 py-1.5 rounded-lg ${isOvercharge ? 'bg-red-200/60' : 'bg-green-200/60'}`}>
                                            <span className={`text-xs font-black ${isOvercharge ? 'text-red-800' : 'text-green-800'}`}>
                                                Diferença: {isOvercharge ? '+' : ''}{formatCurrency(diffValue)} ({isOvercharge ? '+' : ''}{diffPercent.toFixed(1)}%)
                                            </span>
                                        </div>
                                        <p className={`text-[8px] mt-1.5 font-bold ${isOvercharge ? 'text-red-500' : 'text-green-500'}`}>
                                            {isOvercharge 
                                                ? '⚠ Valor salvo é MAIOR que o cálculo do sistema. Verificar se houve erro do fornecedor (cobrança indevida) ou ajuste justificado pelo controller.'
                                                : '✓ Valor salvo é MENOR que o cálculo do sistema. O controller aplicou um desconto/correção.'}
                                        </p>
                                    </div>
                                );
                            })()}
                            {(() => {
                                const calcTotal = financialData.provider.serviceTotal + parseNumber(tollProviderInput) + parseNumber(displacementProviderInput);
                                const savedTotal = parseNumber(costInput);
                                const isDivergent = Math.abs(calcTotal - savedTotal) > 1;
                                return (
                                    <div className={`flex flex-col gap-1 text-[9px] font-bold mb-2 px-2 py-1.5 rounded-lg border ${isDivergent ? 'text-amber-700 bg-amber-50/80 border-amber-300' : 'text-blue-600 bg-blue-100/60 border-blue-200'}`}>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                            <span>{formatCurrency(financialData.provider.base)} <span className={isDivergent ? 'text-amber-400' : 'text-blue-400'}>(base)</span></span>
                                            <span>+ {formatCurrency(financialData.provider.extraKmVal)} <span className={isDivergent ? 'text-amber-400' : 'text-blue-400'}>(km{financialData.provider.excessKm > 0 ? `: ${financialData.provider.excessKm.toFixed(1)}×R$${financialData.provider.unitCostKm.toFixed(2)}` : ''})</span></span>
                                            <span>+ {formatCurrency(financialData.provider.extraHrVal)} <span className={isDivergent ? 'text-amber-400' : 'text-blue-400'}>(hora{financialData.provider.excessHours > 0 ? `: ${formatHoursHHMM(financialData.provider.excessHoursReal)} real → ${formatHoursHHMM(financialData.provider.excessHours)}×R$${financialData.provider.unitCostHour.toFixed(2)}` : ''})</span></span>
                                            <span>+ {formatCurrency(parseNumber(tollProviderInput))} <span className={isDivergent ? 'text-amber-400' : 'text-blue-400'}>(pedágio)</span></span>
                                            <span>+ {formatCurrency(parseNumber(displacementProviderInput))} <span className={isDivergent ? 'text-amber-400' : 'text-blue-400'}>(deslocamento)</span></span>
                                            <span className="font-black">= {formatCurrency(calcTotal)}</span>
                                        </div>

                                    </div>
                                );
                            })()}
                            <div className="flex items-baseline gap-2">
                                <span className="text-sm font-bold text-blue-600">R$</span>
                                <input 
                                    type="text" 
                                    inputMode="decimal"
                                    className={`w-full bg-white/60 border border-blue-200 rounded-lg px-2 py-1 outline-none font-black text-3xl text-blue-900 font-mono focus:ring-2 focus:ring-blue-400 focus:border-blue-400 ${!canEditProviderCostTotal ? 'pointer-events-none opacity-70' : 'cursor-text'}`}
                                    value={costInput} 
                                    onChange={e => { if (canEditProviderCostTotal) { userManuallyEditedRef.current = true; setUseSavedValues(true); setCostInput(e.target.value); setShowCostReasonInput(true); } }}
                                    readOnly={!canEditProviderCostTotal}
                                    data-testid="input-cost-total"
                                />
                            </div>
                            <p className="text-[8px] text-blue-600 font-bold mt-1 italic">
                                {mission?.verified_by && mission?.verified_at
                                    ? (canEditVerifiedProviderTotal
                                        ? (isControllerRole
                                            ? '✓ CONTROLLER — Você pode ajustar o valor do fornecedor'
                                            : '✓ VALOR VERIFICADO PELO CONTROLLER — Diretoria/Controller podem ajustar')
                                        : '🔒 VALOR VERIFICADO PELO CONTROLLER — Somente Diretoria/Controller podem alterar')
                                    : canEditProviderCostTotal ? '* EDITÁVEL - CONTROLLER / DIRETORIA / ADMINISTRADOR (toque para editar)' : ''}
                            </p>
                            {(showCostReasonInput || costEditReason) && (
                                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                                    <label className="text-[9px] font-black text-amber-700 uppercase mb-1 block flex items-center gap-1"><AlertCircle size={10}/> Motivo da Alteração (Fornecedor)</label>
                                    <textarea
                                        className="w-full text-xs font-bold text-gray-700 border border-amber-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-amber-400/20 focus:border-amber-400 outline-none bg-white resize-none"
                                        rows={2}
                                        placeholder="Informe o motivo da alteração do valor..."
                                        value={costEditReason}
                                        onChange={e => setCostEditReason(e.target.value)}
                                        data-testid="input-cost-edit-reason"
                                    />
                                    {mission.cost_edit_reason && (
                                        <p className="text-[8px] text-gray-500 mt-1 italic">Último registro: {mission.cost_edit_reason}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {approvalLog.length > 0 && (
                        <div className="mx-4 mb-4 p-3 bg-gradient-to-r from-emerald-50 to-blue-50 rounded-xl border border-emerald-200">
                            <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-2">Histórico de Aprovações</p>
                            <div className="flex flex-wrap gap-2">
                                {approvalLog.map((log, i) => (
                                    <div key={i} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-emerald-200 shadow-sm" data-testid={`approval-log-${i}`}>
                                        <CheckCircle2 size={12} className={log.stage === 'auditor' ? 'text-amber-500' : log.stage === 'financeiro' ? 'text-blue-500' : log.stage === 'controller' ? 'text-purple-500' : 'text-emerald-600'} />
                                        <div>
                                            <span className="text-[10px] font-black text-gray-800">
                                                {log.stage === 'auditor' ? 'Auditor' : log.stage === 'financeiro' ? 'Financeiro' : log.stage === 'diretoria' ? 'Diretoria' : log.stage === 'controller' ? 'Controller' : log.stage}
                                            </span>
                                            <span className="text-[9px] text-gray-500 ml-1">({log.user})</span>
                                            <p className="text-[8px] text-gray-400 font-mono">{formatDateTimeBR(log.date)}</p>
                                        </div>
                                        <button
                                            onClick={async () => {
                                                const { data } = await supabase.from('system_logs')
                                                    .select('details')
                                                    .eq('entity', 'BillingApproval')
                                                    .eq('entity_id', mission.id)
                                                    .eq('action_type', 'APPROVAL_SCREENSHOT')
                                                    .order('created_at', { ascending: false });
                                                if (data) {
                                                    const match = data.find(d => {
                                                        try { const p = JSON.parse(d.details); return p.stage === log.stage; } catch { return false; }
                                                    });
                                                    if (match) {
                                                        try { setScreenshotPreview(JSON.parse(match.details).screenshot); } catch {}
                                                    } else {
                                                        showNotification('Sem Print', 'Nenhum print de tela encontrado para esta aprovação.', 'error');
                                                    }
                                                }
                                            }}
                                            className="p-1 rounded-md hover:bg-emerald-100 transition-colors ml-1"
                                            title="Ver print da aprovação"
                                            data-testid={`btn-view-screenshot-${log.stage}`}
                                        >
                                            <Camera size={12} className="text-emerald-600" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-1.5 mt-2">
                                <div className={`h-1.5 flex-1 rounded-full ${currentApprovalStatus.hasAuditor ? 'bg-amber-400' : 'bg-gray-200'}`} title="Auditor" />
                                <div className={`h-1.5 flex-1 rounded-full ${currentApprovalStatus.hasFinanceiro ? 'bg-blue-400' : 'bg-gray-200'}`} title="Financeiro" />
                                <div className={`h-1.5 flex-1 rounded-full ${currentApprovalStatus.hasDiretoria ? 'bg-emerald-500' : 'bg-gray-200'}`} title="Diretoria" />
                            </div>
                            {currentApprovalStatus.isFullyApproved && (
                                <p className="text-[9px] font-black text-emerald-600 uppercase mt-1.5 tracking-wider">Faturamento 100% Aprovado</p>
                            )}
                        </div>
                    )}

                    {/* Histórico Financeiro: FINANCIAL_RECALC + billing_override (Task #47) */}
                    <div className="mx-4 mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200" data-testid="panel-financial-history">
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <button
                                type="button"
                                onClick={() => setFinHistOpen(v => !v)}
                                className="text-[10px] font-black text-slate-700 uppercase tracking-widest flex items-center gap-1.5 hover:text-slate-900"
                                data-testid="button-toggle-financial-history"
                            >
                                <History size={12} /> Histórico Financeiro {finHistory.length > 0 ? `(${finHistory.length})` : ''}
                                <span className="text-[9px] font-bold text-slate-400 normal-case">— recálculos, ajustes e aprovações</span>
                            </button>
                            {finHistOpen && (
                                <button
                                    type="button"
                                    onClick={loadFinancialHistory}
                                    className="text-[9px] font-black text-slate-600 hover:text-slate-900 flex items-center gap-1"
                                    data-testid="button-refresh-financial-history"
                                    title="Atualizar"
                                >
                                    <RefreshCw size={10} /> Atualizar
                                </button>
                            )}
                        </div>

                        {finHistOpen && (
                            <>
                                <div className="flex flex-wrap items-end gap-2 mb-3 p-2 bg-white rounded-lg border border-slate-200">
                                    <div className="flex flex-col">
                                        <label className="text-[9px] font-black text-slate-500 uppercase">Início</label>
                                        <input
                                            type="date"
                                            value={finHistStart}
                                            onChange={e => setFinHistStart(e.target.value)}
                                            className="text-[11px] border border-slate-300 rounded px-1.5 py-1"
                                            data-testid="input-financial-history-start"
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <label className="text-[9px] font-black text-slate-500 uppercase">Fim</label>
                                        <input
                                            type="date"
                                            value={finHistEnd}
                                            onChange={e => setFinHistEnd(e.target.value)}
                                            className="text-[11px] border border-slate-300 rounded px-1.5 py-1"
                                            data-testid="input-financial-history-end"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={loadFinancialHistory}
                                        className="px-2.5 py-1 bg-slate-800 text-white text-[10px] font-black uppercase rounded hover:bg-slate-900"
                                        data-testid="button-apply-financial-history-filter"
                                    >
                                        Filtrar
                                    </button>
                                    {(finHistStart || finHistEnd) && (
                                        <button
                                            type="button"
                                            onClick={() => { setFinHistStart(''); setFinHistEnd(''); setTimeout(loadFinancialHistory, 0); }}
                                            className="px-2 py-1 text-slate-500 text-[10px] font-bold uppercase rounded hover:bg-slate-100"
                                            data-testid="button-clear-financial-history-filter"
                                        >
                                            Limpar
                                        </button>
                                    )}
                                    <span className="ml-auto text-[9px] text-slate-400 font-mono">OS #{mission.id}</span>
                                </div>

                                {finHistLoading ? (
                                    <div className="flex items-center gap-2 text-slate-500 text-xs py-3 justify-center">
                                        <Loader2 size={12} className="animate-spin" /> Carregando histórico…
                                    </div>
                                ) : finHistory.length === 0 ? (
                                    <p className="text-[11px] italic text-slate-500 py-2 text-center" data-testid="text-financial-history-empty">
                                        Nenhuma alteração financeira registrada para esta OS{(finHistStart || finHistEnd) ? ' no período selecionado' : ''}.
                                    </p>
                                ) : (
                                    <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
                                        {finHistory.map((h, idx) => {
                                            const fmtVal = (v: any) => {
                                                if (v === null || v === undefined) return '—';
                                                if (typeof v === 'number') return formatCurrency(v);
                                                if (typeof v === 'boolean') return v ? 'SIM' : 'NÃO';
                                                if (typeof v === 'object') return 'snapshot';
                                                return String(v);
                                            };
                                            const fields = ['revenue_value', 'cost_value', 'toll_value', 'toll_value_provider', 'billing_approved', 'snapshot_data'];
                                            const before = h.before || {};
                                            const after = h.after || {};
                                            const changedFields = fields.filter(f => {
                                                const b = before[f];
                                                const a = after[f];
                                                if (b === undefined && a === undefined) return false;
                                                if (typeof b === 'number' && typeof a === 'number') return Math.abs(b - a) > 0.005;
                                                return JSON.stringify(b ?? null) !== JSON.stringify(a ?? null);
                                            });
                                            return (
                                                <div key={h.id || idx} className="bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm" data-testid={`financial-history-${idx}`}>
                                                    <div className="flex items-center justify-between gap-2 mb-1.5">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase shrink-0 ${h.action_type === 'FINANCIAL_RECALC' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                                                                {h.action_type === 'FINANCIAL_RECALC' ? 'RECÁLCULO' : 'OVERRIDE'}
                                                            </span>
                                                            <span className="text-[10px] font-black text-gray-800 uppercase truncate">{h.user_name}</span>
                                                        </div>
                                                        <span className="text-[9px] text-gray-500 font-mono shrink-0">{formatDateTimeBR(h.created_at)}</span>
                                                    </div>
                                                    {h.source && (
                                                        <p className="text-[9px] text-slate-500 font-mono mb-1 truncate" title={h.source}>Origem: {h.source}</p>
                                                    )}
                                                    {changedFields.length > 0 ? (
                                                        <ul className="text-[10px] text-gray-700 font-mono space-y-0.5">
                                                            {changedFields.map(f => (
                                                                <li key={f} className="leading-tight">
                                                                    • <span className="font-black">{f}</span>: <span className="text-red-600">{fmtVal(before[f])}</span> → <span className="text-emerald-700">{fmtVal(after[f])}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    ) : (
                                                        <p className="text-[10px] text-slate-500 italic">Sem alteração de valores (registro de auditoria).</p>
                                                    )}
                                                    {h.reason && (
                                                        <p className="text-[10px] italic text-amber-800 bg-amber-50 border-l-2 border-amber-300 pl-2 py-0.5 mt-1">
                                                            Motivo: {h.reason}
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Histórico permanente de alterações pós-aprovação */}
                    {editHistory.length > 0 && (
                        <div className="mx-4 mb-4 p-3 bg-amber-50 rounded-xl border border-amber-200" data-testid="panel-edit-history">
                            <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                <History size={12} /> Histórico de Alterações ({editHistory.length})
                            </p>
                            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                                {editHistory.map((h, i) => (
                                    <div key={i} className="bg-white px-3 py-2 rounded-lg border border-amber-200 shadow-sm" data-testid={`edit-history-${i}`}>
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <span className="text-[10px] font-black text-gray-800 uppercase">{h.user}</span>
                                            <span className="text-[9px] text-gray-500 font-mono">{formatDateTimeBR(h.date)}</span>
                                        </div>
                                        {h.changes.length > 0 && (
                                            <ul className="text-[10px] text-gray-700 font-mono space-y-0.5 mb-1">
                                                {h.changes.map((c, j) => (
                                                    <li key={j} className="leading-tight">• {c}</li>
                                                ))}
                                            </ul>
                                        )}
                                        {h.note && (
                                            <p className="text-[10px] italic text-amber-800 bg-amber-50 border-l-2 border-amber-300 pl-2 py-0.5 mt-1">
                                                Obs: {h.note}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Observação obrigatória ao alterar OS já aprovada */}
                    {isBillingLocked && !isEffectivelyLocked && (
                        <div className="mx-4 mb-4 p-3 bg-amber-50 rounded-xl border-2 border-amber-300" data-testid="panel-edit-observation">
                            <label className="text-[10px] font-black text-amber-800 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                <AlertCircle size={12} /> Observação da Alteração (obrigatória ao salvar mudança em OS aprovada)
                            </label>
                            <textarea
                                className="w-full text-xs font-bold text-gray-800 border border-amber-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 outline-none bg-white resize-none"
                                rows={2}
                                placeholder="Descreva o motivo da alteração (será salvo no histórico permanente da OS)..."
                                value={editObservation}
                                onChange={e => setEditObservation(e.target.value)}
                                data-testid="input-edit-observation"
                            />
                        </div>
                    )}

                    <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-gray-200 z-[100] shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
                        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
                            <div className="flex flex-wrap gap-4 md:gap-12 items-center justify-center md:justify-start">
                                <div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">Resultado Operacional Final</p>
                                    <h3 className={`text-3xl font-black font-mono tracking-tighter ${footerProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {formatCurrency(footerProfit)}
                                    </h3>
                                </div>
                                <div className="border-l border-gray-200 pl-4 md:pl-12">
                                    <p className="text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">Margem Líquida %</p>
                                    <h3 className="text-xl md:text-3xl font-black font-mono tracking-tighter text-blue-600">
                                        {footerMarginPct.toFixed(1)}%
                                    </h3>
                                </div>
                                {!currentApprovalStatus.isFullyApproved && (
                                    <div className="border-l border-gray-200 pl-4 md:pl-6">
                                        <p className="text-[10px] font-black text-amber-600 uppercase mb-0.5 tracking-widest">Aprovações</p>
                                        <div className="flex gap-1.5">
                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${currentApprovalStatus.hasAuditor ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-400'}`}>AUD</span>
                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${currentApprovalStatus.hasFinanceiro ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>FIN</span>
                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${currentApprovalStatus.hasController ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-400'}`}>CTR</span>
                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${currentApprovalStatus.hasDiretoria ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>DIR</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col gap-1.5 w-full md:w-auto shrink-0">
                                {savedByInfo && (
                                    <div className="flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5" data-testid="saved-by-indicator">
                                        <Save size={11} className="text-emerald-600" />
                                        <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wide">Salvo por {savedByInfo}</span>
                                    </div>
                                )}
                                <div className="flex flex-col sm:flex-row gap-3">
                                <button onClick={() => handleUpdate(false)} disabled={isUpdating || (currentApprovalStatus.lockedByDiretoria && !isBarbaraFinance) || isEffectivelyLocked} className={`px-6 py-3 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95 h-12 ${((currentApprovalStatus.lockedByDiretoria && !isBarbaraFinance) || isEffectivelyLocked) ? 'bg-gray-200 text-gray-400 border border-gray-300 cursor-not-allowed' : 'bg-white text-slate-900 border border-slate-200 hover:bg-slate-50'}`} title={isEffectivelyLocked ? 'Faturamento travado — destrave para editar' : ''} data-testid="button-save-adjustments">
                                    {isUpdating ? <Loader2 size={16} className="animate-spin" /> : (currentApprovalStatus.lockedByDiretoria && !isBarbaraFinance) ? <Lock size={16} /> : <Save size={16} />} {(currentApprovalStatus.lockedByDiretoria && !isBarbaraFinance) ? 'Bloqueado (Diretoria)' : 'Salvar Ajustes'}
                                </button>
                                <button 
                                    onClick={() => handleUpdate(true)} 
                                    disabled={isUpdating || (requiresTollGate && !tollConfirmed && !isBarbaraFinance) || (!currentApprovalStatus.isPrivilegedReapprover && (isZeroCostError || (mission?.status === MissionStatus.PENDING && currentApprovalStatus.currentUserStage !== 'diretoria') || currentApprovalStatus.blockedForCurrentUser || currentApprovalStatus.lockedByDiretoria))} 
                                    className={`px-8 py-3 rounded-xl font-black uppercase text-xs shadow-lg flex flex-col items-center justify-center gap-1 transition-all active:scale-95 min-h-[48px] ${requiresTollGate && !tollConfirmed && !isBarbaraFinance ? 'bg-gray-400 cursor-not-allowed text-gray-200' : currentApprovalStatus.isPrivilegedReapprover ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200' : (isZeroCostError || (mission?.status === MissionStatus.PENDING && currentApprovalStatus.currentUserStage !== 'diretoria')) ? 'bg-gray-400 cursor-not-allowed text-gray-200' : (currentApprovalStatus.blockedForCurrentUser || currentApprovalStatus.lockedByDiretoria) ? 'bg-amber-50 border-2 border-amber-400 text-amber-800 cursor-not-allowed shadow-amber-100' : currentApprovalStatus.hasPartial ? 'bg-gray-300 text-gray-600 border border-gray-400 cursor-pointer hover:bg-gray-400' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200'}`}
                                    data-testid="button-approve-billing"
                                >
                                    <span className="flex items-center gap-2">
                                        {isUpdating ? <Loader2 size={16} className="animate-spin" /> : (!currentApprovalStatus.isPrivilegedReapprover && (currentApprovalStatus.blockedForCurrentUser || currentApprovalStatus.lockedByDiretoria)) ? <Lock size={16} className="text-amber-600" /> : <CheckCircle2 size={16} />} 
                                        {currentApprovalStatus.isPrivilegedReapprover && currentApprovalStatus.isFullyApproved
                                            ? 'Re-Aprovar Faturamento'
                                            : (mission?.status === MissionStatus.PENDING && currentApprovalStatus.currentUserStage !== 'diretoria')
                                            ? 'OS Pendente — Não Aprovável' 
                                            : requiresTollGate && !tollConfirmed && !isBarbaraFinance 
                                                ? 'Confirme o Pedágio' 
                                                : currentApprovalStatus.lockedByDiretoria
                                                    ? 'Bloqueado — Somente Diretoria'
                                                    : currentApprovalStatus.blockedForCurrentUser
                                                        ? 'Aprovação Pendente'
                                                        : currentApprovalStatus.isFullyApproved 
                                                            ? 'Já Aprovado (Completo)' 
                                                            : 'Aprovar Faturamento'}
                                    </span>
                                    {currentApprovalStatus.blockedForCurrentUser && !isZeroCostError && tollConfirmed && mission?.status !== MissionStatus.PENDING && (
                                        <span className="text-[9px] font-bold text-amber-600 normal-case">
                                            {currentApprovalStatus.blockedMessage}
                                        </span>
                                    )}
                                    {!currentApprovalStatus.blockedForCurrentUser && currentApprovalStatus.hasPartial && !isZeroCostError && tollConfirmed && mission?.status !== MissionStatus.PENDING && (
                                        <span className="text-[9px] font-bold text-gray-500 normal-case">
                                            Aguardando: {currentApprovalStatus.missing.join(', ')} ({currentApprovalStatus.waitingDays}d)
                                        </span>
                                    )}
                                </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
      </div>
      <TollConfirmationDialog
        isOpen={showTollConfirmDialog}
        mission={mission}
        initialValue={tollInput}
        source="financial_modal"
        allowClose={true}
        onClose={() => { setShowTollConfirmDialog(false); setTollConfirmAutoOpened(true); }}
        onConfirm={applyTollConfirmation}
      />
    </div>
  );
};

export default MissionFinancialModal;
