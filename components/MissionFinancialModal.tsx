
import React, { useState, useEffect, useMemo } from 'react';
import { Mission, ClientPriceTable, ProviderCostTable, MissionStatus, Client } from '../types';
import { supabase } from '../lib/supabase';
import { useNotification } from '../lib/NotificationContext';
import { calculateMissionFinancials, auditMissionFinancials, extractUF, UF_TO_REGION } from '../lib/financialUtils';
import { X, Calculator, Loader2, Save, CheckCircle2, TrendingUp, Landmark, Zap, RotateCcw, Building2, Briefcase, Plus, Users, MapPin, ArrowRight, BrainCircuit, AlertTriangle, AlertCircle, Edit2, Info, RefreshCw, Clock, Pencil, Lock, ShieldCheck, Camera, Image as ImageIcon, Link2, Layers } from 'lucide-react';
import ProviderCostForm from './ProviderCostForm';
import ClientPriceForm from './ClientPriceForm';
import { formatProviderName } from '../lib/utils';
import html2canvas from 'html2canvas';

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

// Parser robusto para input BRL
const parseNumber = (val: string | number | undefined | null): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    let str = String(val).trim();
    if (str.includes(',') && str.includes('.')) {
         str = str.replace(/\./g, '').replace(',', '.');
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

const LABEL_CLASS = "text-[10px] font-black text-gray-400 uppercase mb-1.5 block tracking-widest";

const MissionFinancialModal: React.FC<Props> = ({ isOpen, onClose, mission: initialMission, onUpdate }) => {
  const { showNotification } = useNotification();
  const [mission, setMission] = useState<Mission | null>(initialMission);
  const [clientTables, setClientTables] = useState<ClientPriceTable[]>([]);
  const [providerTables, setProviderTables] = useState<ProviderCostTable[]>([]);
  const [clientData, setClientData] = useState<Client | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [revenueInput, setRevenueInput] = useState('');
  const [costInput, setCostInput] = useState('');
  const [tollInput, setTollInput] = useState('');
  const [tollProviderInput, setTollProviderInput] = useState('');
  
  // Custom Unit Prices (Edição Livre)
  const [customProviderKm, setCustomProviderKm] = useState<string>('');
  const [customProviderHour, setCustomProviderHour] = useState<string>('');
  const [customProviderBase, setCustomProviderBase] = useState<string>(''); // Novo
  
  const [customClientKm, setCustomClientKm] = useState<string>('');
  const [customClientHour, setCustomClientHour] = useState<string>('');
  const [customClientBase, setCustomClientBase] = useState<string>(''); // Novo

  const [manualClientTableId, setManualClientTableId] = useState<string>('');
  const [manualProviderTableId, setManualProviderTableId] = useState<string>('');
  const [iblEnabled, setIblEnabled] = useState(false);

  const [aiMaturity, setAiMaturity] = useState(0);
  const [suggestedToll, setSuggestedToll] = useState<number | null>(null);
  const [tollSource, setTollSource] = useState<string>('');
  const [isAddCostModalOpen, setIsAddCostModalOpen] = useState(false);
  const [editCostTableId, setEditCostTableId] = useState<string | null>(null);
  const [isEditClientTableOpen, setIsEditClientTableOpen] = useState(false);
  const [editClientTableId, setEditClientTableId] = useState<string | null>(null);
  const [memoryLoaded, setMemoryLoaded] = useState(false);
  const [tollConfirmed, setTollConfirmed] = useState(false);
  const [isCalculatingToll, setIsCalculatingToll] = useState(false);
  const [tollEmbeddedInCost, setTollEmbeddedInCost] = useState(false);
  const [approvalLog, setApprovalLog] = useState<Array<{user: string; role: string; stage: string; date: string}>>([]);
  const [useSavedValues, _setUseSavedValues] = useState(false);
  const useSavedValuesRef = React.useRef(false);
  const setUseSavedValues = (val: boolean) => { useSavedValuesRef.current = val; _setUseSavedValues(val); };
  const isSavingRef = React.useRef(false);
  const [savedByInfo, setSavedByInfo] = useState<string | null>(null);

  const [editStartKm, setEditStartKm] = useState('');
  const [editEndKm, setEditEndKm] = useState('');
  const [provEditStartKm, setProvEditStartKm] = useState('');
  const [provEditEndKm, setProvEditEndKm] = useState('');
  const [provEditStartTime, setProvEditStartTime] = useState('');
  const [provEditEndTime, setProvEditEndTime] = useState('');
  const [isEditingProvOpsData, setIsEditingProvOpsData] = useState(false);
  const [revenueEditReason, setRevenueEditReason] = useState('');
  const [costEditReason, setCostEditReason] = useState('');
  const [showRevenueReasonInput, setShowRevenueReasonInput] = useState(false);
  const [showCostReasonInput, setShowCostReasonInput] = useState(false);
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [isEditingOpsData, setIsEditingOpsData] = useState(false);
  const [editOrigin, setEditOrigin] = useState('');
  const [editDestination, setEditDestination] = useState('');
  const [isEditingRoute, setIsEditingRoute] = useState(false);
  const [isSavingRoute, setIsSavingRoute] = useState(false);

  const userRoleLower = useMemo(() => {
    try { return (JSON.parse(localStorage.getItem('userData') || '{}').role || '').toLowerCase(); } catch { return ''; }
  }, []);
  const isController = userRoleLower === 'controller';
  const canEditOpsData = useMemo(() => {
    try {
      const u = JSON.parse(localStorage.getItem('userData') || '{}');
      return ['diretoria', 'administrador', 'avançado', 'avancado', 'controller'].includes(userRoleLower) || u.permissions?.includes('*');
    } catch { return false; }
  }, [userRoleLower]);
  const canEditClientData = canEditOpsData && !isController;
  

  const tollCalcMissionRef = React.useRef<string | null>(null);
  const modalContentRef = React.useRef<HTMLDivElement>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const captureModalScreenshot = async (stageName: string, userName: string): Promise<string | null> => {
    const modalEl = modalContentRef.current?.closest('.flex.flex-col') as HTMLElement;
    if (!modalEl || !mission) return null;
    try {
      setIsCapturing(true);
      await new Promise(r => setTimeout(r, 200));
      
      const canvas = await html2canvas(modalEl, {
        scale: 1,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        ignoreElements: (el) => el.getAttribute('data-html2canvas-ignore') === 'true'
      });
      
      const resizedCanvas = document.createElement('canvas');
      const maxWidth = 800;
      const ratio = Math.min(maxWidth / canvas.width, 1);
      resizedCanvas.width = canvas.width * ratio;
      resizedCanvas.height = canvas.height * ratio;
      const ctx = resizedCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(canvas, 0, 0, resizedCanvas.width, resizedCanvas.height);
      }
      
      const base64 = resizedCanvas.toDataURL('image/jpeg', 0.6);

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
          screenshot: base64
        })
      }]);
      
      return base64;
    } catch (e) {
      console.error('Erro ao capturar screenshot:', e);
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

  // Busca Inteligente de Padrões (Memória Evolutiva)
  // BLINDAGEM: Pedágio NUNCA é herdado de outras missões (IDs diferentes).
  // Se a missão atual tem toll_value salvo no banco, usa esse valor.
  // Se não tem, busca via API ou histórico automaticamente.
  const fetchHistoricalPatterns = async (currentMission: Mission, allProviderTables?: ProviderCostTable[]) => {
      if (!currentMission.client || !currentMission.origin || isSavingRef.current) return;
      try {
          const dbToll = Math.max(0, currentMission.toll_value ?? 0);
          const dbTollProv = Math.max(0, currentMission.toll_value_provider != null ? currentMission.toll_value_provider : dbToll);
          const hasRevenue = currentMission.revenue_value != null && currentMission.revenue_value > 0;
          const hasCost = currentMission.cost_value != null && currentMission.cost_value > 0;
          const hasVerifiedBy = !!currentMission.billing_verified_by;
          const hasSavedData = hasRevenue || hasCost || hasVerifiedBy;
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
             setTollConfirmed(true);
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
                 if (details.tollValue !== undefined && details.tollValue !== null) {
                     const memToll = Number(details.tollValue);
                     setTollInput(memToll.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                     setSuggestedToll(memToll);
                     setTollSource('MEMÓRIA (Rota Anterior)');
                     setTollConfirmed(false);
                     if (details.tollProviderValue !== undefined && details.tollProviderValue !== null) {
                         const memTollProv = Number(details.tollProviderValue);
                         setTollProviderInput(memTollProv.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                     } else if (memToll > 0) {
                         setTollProviderInput(memToll.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                     }
                 } else if (details.tollProviderValue !== undefined && details.tollProviderValue !== null) {
                     const memTollProv = Number(details.tollProviderValue);
                     setTollProviderInput(memTollProv.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                     setTollInput(memTollProv.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                     setSuggestedToll(memTollProv);
                     setTollSource('MEMÓRIA (Rota Anterior)');
                     setTollConfirmed(false);
                 }
                 setMemoryLoaded(true);
                 const hasCustomValues = details.customClientBase || details.customProviderBase;
                 const hasTollMemory = details.tollValue !== undefined && details.tollValue !== null && Number(details.tollValue) > 0;
                 const extraInfo = [
                     hasCustomValues ? 'valores ajustados' : null,
                     hasTollMemory ? `pedágio R$ ${Number(details.tollValue).toFixed(2)}` : null
                 ].filter(Boolean).join(' + ');
                 showNotification('Memória Evolutiva', `Tabela${extraInfo ? ` (${extraInfo})` : ''} aplicados (${memorySource === 'EXATA' ? 'mesmo fornecedor' : 'mesma rota'}).`, 'success');
             } catch (e) { console.error("Erro ao ler memória:", e); }
          }
          
      } catch (e) { console.error("Erro na IA de Padrões:", e); }
  };

  const loadData = async () => {
      if (!initialMission?.id || isSavingRef.current) return;
      userManuallyEditedRef.current = false;
      setIsLoading(true);
      try {
          const clientName = initialMission.originalClientName || initialMission.client;
          const [mRes, ctRes, ptRes, clRes] = await Promise.all([
              supabase.from('missions').select('*').eq('id', initialMission.id).single(),
              supabase.from('client_price_tables').select('*').eq('client', clientName),
              supabase.from('provider_cost_tables').select('*'),
              supabase.from('clients').select('*').ilike('name', clientName || '').single()
          ]);
          if (clRes.data) {
              setClientData(clRes.data as Client);
          } else if (clientName) {
              const { data: fuzzy } = await supabase.from('clients').select('*').ilike('name', `%${clientName.split(' ')[0]}%`).limit(1).single();
              if (fuzzy) setClientData(fuzzy as Client);
          }
          
          if (mRes.data) {
              const fullMission = { ...initialMission, ...mRes.data };
              setMission(fullMission);

              setEditStartKm(mRes.data.start_km ? String(mRes.data.start_km) : '');
              setEditEndKm(mRes.data.end_km ? String(mRes.data.end_km) : '');
              const st = mRes.data.start_time ? new Date(mRes.data.start_time) : null;
              const et = mRes.data.end_time ? new Date(mRes.data.end_time) : null;
              setEditStartTime(st ? `${st.toLocaleDateString('en-CA')}T${st.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}` : '');
              setEditEndTime(et ? `${et.toLocaleDateString('en-CA')}T${et.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}` : '');
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

              setProvEditStartKm(pStartKm ? String(pStartKm) : '');
              setProvEditEndKm(pEndKm ? String(pEndKm) : '');
              setProvEditStartTime(pStartTime ? `${pStartTime.toLocaleDateString('en-CA')}T${pStartTime.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}` : '');
              setProvEditEndTime(pEndTime ? `${pEndTime.toLocaleDateString('en-CA')}T${pEndTime.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}` : '');
              setIsEditingProvOpsData(false);

              setRevenueEditReason(loadedRevReason);
              setCostEditReason(loadedCostReason);
              setShowRevenueReasonInput(false);
              setShowCostReasonInput(false);

              const dbToll = Math.max(0, mRes.data.toll_value || 0);
              const dbTollProvider = Math.max(0, mRes.data.toll_value_provider != null ? mRes.data.toll_value_provider : dbToll);
              const savedRev = safeNumber(mRes.data.revenue_value);
              const savedCost = safeNumber(mRes.data.cost_value);
              const hasSavedData = mRes.data.billing_approved || mRes.data.billing_verified_by || savedRev > 0 || savedCost > 0;
              if (mRes.data.is_same_os) {
                  setTollInput(dbToll.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
                  setTollProviderInput('0,00');
                  setTollConfirmed(true);
                  setTollSource(dbToll === 0 ? 'MESMA OS (R$ 0,00)' : 'MESMA OS');
              } else if (mRes.data.billing_approved) {
                  setTollInput(dbToll.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
                  setTollProviderInput(dbTollProvider.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
                  setTollConfirmed(true);
                  setTollSource(dbToll === 0 ? 'APROVADO (R$ 0,00)' : 'VALOR APROVADO');
              } else if (hasSavedData || dbToll > 0) {
                  setTollInput(dbToll.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
                  setTollProviderInput(dbTollProvider.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
                  setTollConfirmed(true);
                  setTollSource(dbToll === 0 ? 'VALOR SALVO (R$ 0,00)' : 'VALOR SALVO');
              } else {
                  setTollInput('0,00');
                  setTollProviderInput('0,00');
                  setTollConfirmed(false);
                  setTollSource('CALCULANDO...');
                  autoCalculateToll(fullMission.origin, fullMission.destination, fullMission.id);
              }

              const isVendorVerified = !!(mRes.data.verified_by && mRes.data.verified_at);

              if ((mRes.data.billing_approved || isVendorVerified) && (savedRev > 0 || savedCost > 0)) {
                  const hasSeparateTollProvider = mRes.data.toll_value_provider != null;
                  const totalCost = hasSeparateTollProvider ? savedCost + dbTollProvider : savedCost;
                  if (!hasSeparateTollProvider && savedCost > 0) {
                      setTollEmbeddedInCost(true);
                  }
                  if (provOpsEdited && !isVendorVerified) {
                      setUseSavedValues(false);
                  } else {
                      setUseSavedValues(true);
                      const totalRev = savedRev + dbToll;
                      setRevenueInput(totalRev.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
                      setCostInput(totalCost.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
                  }
              }
              if (mRes.data.billing_verified_by) {
                  setSavedByInfo(`Salvo por ${mRes.data.billing_verified_by}`);
              }
              
              fetchHistoricalPatterns(fullMission, (ptRes.data || []) as ProviderCostTable[]);

              const [approvalRes, adjustmentRes] = await Promise.all([
                  supabase.from('system_logs').select('*').eq('entity', 'BillingApproval').eq('entity_id', initialMission.id).order('created_at', { ascending: true }),
                  supabase.from('system_logs').select('*').eq('entity', 'BillingAdjustment').eq('entity_id', initialMission.id).order('created_at', { ascending: false }).limit(1)
              ]);

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
                      if (details.providerTableId) setManualProviderTableId(details.providerTableId);
                      if (details.customClientBase) setCustomClientBase(details.customClientBase);
                      if (details.customClientKm) setCustomClientKm(details.customClientKm);
                      if (details.customClientHour) setCustomClientHour(details.customClientHour);
                      if (details.customProviderBase) setCustomProviderBase(details.customProviderBase);
                      if (details.customProviderKm) setCustomProviderKm(details.customProviderKm);
                      if (details.customProviderHour) setCustomProviderHour(details.customProviderHour);
                      if (details.iblEnabled !== undefined) setIblEnabled(details.iblEnabled);

                      const savedDate = new Date(adj.created_at);
                      const dateStr = savedDate.toLocaleDateString('pt-BR') + ' ' + savedDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                      setSavedByInfo(`${adj.user_name} (${dateStr})`);
                  } catch (e) { console.error('Erro ao restaurar ajustes:', e); }
              }
          }
          if (ctRes.data) setClientTables(ctRes.data as any);
          if (ptRes.data) setProviderTables(ptRes.data as any);
          
      } catch (e) { console.error(e); } finally { setIsLoading(false); }
  };

  const handleNewCostTableSuccess = async (newTableId?: string) => {
      if (!mission) return;
      const { data } = await supabase.from('provider_cost_tables').select('*');
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

  useEffect(() => { if (isOpen) loadData(); }, [isOpen]);

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
          providerOpsOverride: providerOpsOverride
      });
  }, [mission, clientTables, providerTables, clientData, manualClientTableId, manualProviderTableId, iblEnabled, tollInput, customProviderKm, customProviderHour, customClientKm, customClientHour, customClientBase, customProviderBase, providerOpsOverride]);

    const userManuallyEditedRef = React.useRef(false);

    useEffect(() => {
      if (financialData && mission) {
          const provOpsActive = !!mission.provider_ops_edited;
          const isVendorLocked = !!(mission.verified_by && mission.verified_at);
          const provTotalWithCorrectToll = financialData.provider.base + financialData.provider.extraKmVal + financialData.provider.extraHrVal + parseNumber(tollProviderInput);
          const hasCustomProviderValues = !!(customProviderBase || customProviderKm || customProviderHour);
          if (!useSavedValuesRef.current && !isSavingRef.current && !isVendorLocked) {
              setRevenueInput(financialData.client.total.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
              setCostInput(provTotalWithCorrectToll.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
          } else if (useSavedValuesRef.current && !isSavingRef.current && !userManuallyEditedRef.current) {
              const currentRev = parseNumber(revenueInput);
              const tableRev = financialData.client.total;
              if (Math.abs(currentRev - tableRev) > 1) {
                  setRevenueInput(tableRev.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
              }
              if (!isVendorLocked) {
                  const currentCost = parseNumber(costInput);
                  if (Math.abs(currentCost - provTotalWithCorrectToll) > 1) {
                      setCostInput(provTotalWithCorrectToll.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
                  }
              }
          } else if ((provOpsActive || hasCustomProviderValues) && !isSavingRef.current && !isVendorLocked) {
              setCostInput(provTotalWithCorrectToll.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
          }
          
          if (financialData.provider.tableId) {
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
    }, [financialData, memoryLoaded, mission, tollProviderInput]); 


  const handleTollChange = (val: string) => {
      const oldToll = parseNumber(tollInput);
      const newToll = parseNumber(val);
      setTollInput(val);
      setTollSource('MANUAL (Editando...)');
      setTollConfirmed(true);
      const currentRev = parseNumber(revenueInput);
      const updatedRev = currentRev - oldToll + newToll;
      setRevenueInput(updatedRev.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      if (parseNumber(tollProviderInput) === 0 && newToll > 0) {
          const oldTollProv = parseNumber(tollProviderInput);
          setTollProviderInput(val);
          const currentCost = parseNumber(costInput);
          const updatedCost = currentCost - oldTollProv + newToll;
          setCostInput(updatedCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      }
      setUseSavedValues(true);
  };

  const handleTollProviderChange = (val: string) => {
      const oldTollProv = parseNumber(tollProviderInput);
      const newTollProv = parseNumber(val);
      setTollProviderInput(val);
      setTollSource('MANUAL (Editando...)');
      setTollConfirmed(true);
      const currentCost = parseNumber(costInput);
      const updatedCost = currentCost - oldTollProv + newTollProv;
      setCostInput(updatedCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      setUseSavedValues(true);
  };

  const handleManualInput = (setter: any, val: string) => {
      setter(val);
  }

  const handleRecalculateClient = async () => {
      setCustomClientBase('');
      setCustomClientKm('');
      setCustomClientHour('');
      setUseSavedValues(false);
      userManuallyEditedRef.current = false;
      if (financialData && mission) {
          const newRevenue = financialData.client.total;
          const toll = parseNumber(tollInput);
          const revServiceOnly = newRevenue - toll;
          setRevenueInput(newRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
          
          const r2 = (v: number) => Math.round(v * 100) / 100;
          try {
              const userData = JSON.parse(localStorage.getItem('userData') || '{}');
              const userName = userData.name || 'Usuário';
              await supabase.from('missions').update({
                  revenue_value: r2(revServiceOnly),
                  toll_value: r2(toll),
                  last_update: new Date().toISOString()
              }).eq('id', mission.id);
              
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
      setCustomProviderBase('');
      setCustomProviderKm('');
      setCustomProviderHour('');
      setUseSavedValues(false);
      userManuallyEditedRef.current = false;
      if (financialData && mission) {
          const isSameOs = mission.is_same_os === true;
          const tollProv = isSameOs ? 0 : parseNumber(tollProviderInput);
          const newCost = isSameOs ? 0 : (financialData.provider.base + financialData.provider.extraKmVal + financialData.provider.extraHrVal + tollProv);
          const costServiceOnly = isSameOs ? 0 : (newCost - tollProv);
          setCostInput(newCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
          
          const r2 = (v: number) => Math.round(v * 100) / 100;
          try {
              const userData = JSON.parse(localStorage.getItem('userData') || '{}');
              const userName = userData.name || 'Usuário';
              await supabase.from('missions').update({
                  cost_value: r2(costServiceOnly),
                  toll_value_provider: r2(tollProv),
                  last_update: new Date().toISOString()
              }).eq('id', mission.id);
              
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

  const getApprovalStage = (userName: string, userRole: string): { stage: string; label: string } => {
      const nameLower = (userName || '').toLowerCase();
      const roleLower = (userRole || '').toLowerCase();
      if (nameLower.includes('daniel')) return { stage: 'auditor', label: 'Aprovado pelo Auditor' };
      if (roleLower === 'administrador' || nameLower.includes('barbara') || nameLower.includes('bárbara')) return { stage: 'financeiro', label: 'Aprovado pelo Financeiro' };
      if (roleLower === 'diretoria' || nameLower.includes('thiago')) return { stage: 'diretoria', label: 'Aprovado pela Diretoria' };
      return { stage: 'operacional', label: `Aprovado por ${userName}` };
  };

  const isSnapshotFrozen = !!(mission?.snapshot_approved_by);

  const currentApprovalStatus = useMemo(() => {
      const stages = approvalLog.map(l => l.stage);
      const hasAuditor = stages.includes('auditor');
      const hasFinanceiro = stages.includes('financeiro');
      const hasDiretoria = stages.includes('diretoria');
      const isApprovedForBilling = hasFinanceiro || hasDiretoria;
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
      try {
          const u = JSON.parse(localStorage.getItem('userData') || '{}');
          const uName = (u.name || '').toLowerCase();
          const uRole = (u.role || '').toLowerCase();
          if (uName.includes('daniel')) currentUserStage = 'auditor';
          else if (uRole === 'administrador' || uName.includes('barbara') || uName.includes('bárbara')) currentUserStage = 'financeiro';
          else if (uRole === 'diretoria' || uName.includes('thiago')) currentUserStage = 'diretoria';
      } catch {}

      let blockedForCurrentUser = false;
      let blockedMessage = '';

      if (currentUserStage === 'financeiro' && !hasAuditor) {
          blockedForCurrentUser = true;
          blockedMessage = 'Aguardando aprovação do Daniel (Auditor) antes do Financeiro.';
      }

      const lockedByDiretoria = hasDiretoria && currentUserStage !== 'diretoria' && (() => { try { const u = JSON.parse(localStorage.getItem('userData') || '{}'); const r = (u.role || '').toLowerCase(); return r !== 'controller' && r !== 'administrador'; } catch { return true; } })();

      return { hasAuditor, hasFinanceiro, hasDiretoria, isFullyApproved, isApprovedForBilling, missing, waitingDays, hasPartial, blockedForCurrentUser, blockedMessage, currentUserStage, lockedByDiretoria };
  }, [approvalLog, mission?.endTime]);

  const handleUpdate = async (approve: boolean) => {
      if (!mission) return;
      if (isSnapshotFrozen && !isController && currentApprovalStatus.currentUserStage !== 'diretoria' && currentApprovalStatus.currentUserStage !== 'financeiro') {
          showNotification('Bloqueado', `Dados Congelados — Aprovado por ${mission.snapshot_approved_by}. Somente Financeiro ou Diretoria podem editar.`, 'error');
          return;
      }
      if (currentApprovalStatus.lockedByDiretoria) {
          showNotification('Bloqueado', 'Esta OS foi aprovada pela Diretoria. Somente a Diretoria pode editar.', 'error');
          return;
      }

      const originalRevenue = (mission.revenue_value || 0) + (mission.toll_value || 0);
      const revTotal = isController ? originalRevenue : parseNumber(revenueInput);
      const costTotal = parseNumber(costInput);
      const calcRevTotal = financialData ? (financialData.client.base + financialData.client.extraKmVal + financialData.client.extraHrVal + (financialData.iblFee || 0) + parseNumber(tollInput)) : 0;
      const calcCostTotal = financialData ? (financialData.provider.base + financialData.provider.extraKmVal + financialData.provider.extraHrVal + parseNumber(tollProviderInput)) : 0;
      const revDivergent = isController ? false : Math.abs(revTotal - calcRevTotal) > 1;
      const costDivergent = Math.abs(costTotal - calcCostTotal) > 1;

      if (revDivergent && !revenueEditReason.trim()) {
          setShowRevenueReasonInput(true);
          showNotification('Motivo Obrigatório', 'O valor do cliente foi alterado manualmente. Informe o motivo da alteração.', 'error');
          return;
      }
      if (costDivergent && !costEditReason.trim()) {
          setShowCostReasonInput(true);
          showNotification('Motivo Obrigatório', 'O valor do fornecedor foi alterado manualmente. Informe o motivo da alteração.', 'error');
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

          const toll = isController ? (mission.toll_value || 0) : parseNumber(tollInput);
          let tollProv = parseNumber(tollProviderInput);
          if (tollProv === 0 && toll > 0) {
              tollProv = toll;
          }

          const revServiceOnly = revTotal - toll; 
          const costServiceOnly = costTotal - tollProv;
          
          const { stage, label } = getApprovalStage(userName, userRole);
          
          const newLog = [...approvalLog];
          if (approve) {
              if (stage === 'financeiro' && !newLog.some(l => l.stage === 'auditor')) {
                  showNotification('Bloqueado', 'A aprovação do Daniel (Auditor) é necessária antes da aprovação do Financeiro.', 'error');
                  setIsUpdating(false);
                  isSavingRef.current = false;
                  return;
              }
              const existingStages = newLog.map(l => l.stage);
              const alreadyApproved = newLog.some(l => l.stage === stage);
              if (!alreadyApproved) {
                  const logEntry = { user: userName, role: userRole, stage, date: new Date().toISOString() };
                  newLog.push(logEntry);
                  
                  await supabase.from('system_logs').insert([{
                      user_name: userName,
                      action_type: stage,
                      entity: 'BillingApproval',
                      entity_id: mission.id,
                      details: JSON.stringify(logEntry)
                  }]);
              }
          }
          
          const updatedStages = newLog.map(l => l.stage);
          const hasFinanceiro = updatedStages.includes('financeiro');
          const hasDiretoria = updatedStages.includes('diretoria');
          const isApprovedForBilling = hasFinanceiro || hasDiretoria;
          const isFullyApproved = hasDiretoria;
          
          const canReleaseBilling = stage === 'financeiro' || stage === 'diretoria';
          const shouldSnapshot = approve && canReleaseBilling && !mission.snapshot_approved_by;
          
          const r2 = (v: number) => Math.round(v * 100) / 100;
          const isSameOs = mission.is_same_os === true;
          const basePayload: any = {
              revenue_value: r2(revServiceOnly),
              cost_value: isSameOs ? 0 : r2(costServiceOnly),
              toll_value: r2(toll),
              billing_approved: isApprovedForBilling,
              last_update: new Date().toISOString()
          };
          if (approve && canReleaseBilling) {
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
                  tableId: manualClientTableId || financialData.client.tableId || null,
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
                  revenueServiceOnly: revServiceOnly,
                  costServiceOnly: costServiceOnly,
                  totalGeral: revServiceOnly + toll,
                  iblFee: financialData.iblFee || 0
              };
              basePayload.snapshot_data = snapshotObj;
              basePayload.snapshot_approved_by = userName;
              basePayload.snapshot_approved_at = snapshotNow;
          }
          const reasonFields: any = {};
          if (revDivergent && revenueEditReason.trim()) {
              reasonFields.revenue_edit_reason = `[${userName} - ${new Date().toLocaleString('pt-BR')}] ${revenueEditReason.trim()}`;
          }
          if (costDivergent && costEditReason.trim()) {
              reasonFields.cost_edit_reason = `[${userName} - ${new Date().toLocaleString('pt-BR')}] ${costEditReason.trim()}`;
          }

          const fullPayload = { ...basePayload, toll_value_provider: isSameOs ? 0 : r2(tollProv), ...reasonFields };
          let result = await supabase.from('missions').update(fullPayload).eq('id', mission.id).select('id, revenue_value, cost_value, toll_value, last_update').single();
          if (result.error && result.error.message?.includes('does not exist')) {
              const { snapshot_data, snapshot_approved_by, snapshot_approved_at, ...payloadWithoutSnapshot } = fullPayload;
              result = await supabase.from('missions').update(payloadWithoutSnapshot).eq('id', mission.id).select('id, revenue_value, cost_value, toll_value, last_update').single();
              if (result.error && result.error.message?.includes('does not exist')) {
                  const { toll_value_provider, ...payloadMin } = payloadWithoutSnapshot;
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
              if (Object.keys(reasonFields).length > 0) {
                  await supabase.from('system_logs').insert([{
                      user_name: userName,
                      action_type: 'VALUE_EDIT_REASON',
                      entity: 'Mission',
                      entity_id: mission.id,
                      details: JSON.stringify(reasonFields)
                  }]);
              }
          }
          if (result.error) throw result.error;
          if (!result.data) throw new Error('Falha na persistência: registro não retornado após UPDATE');
          
          const savedRevCheck = safeNumber(result.data.revenue_value);
          const savedTollCheck = safeNumber(result.data.toll_value);
          if (Math.abs(savedRevCheck - revServiceOnly) > 0.01 || Math.abs(savedTollCheck - toll) > 0.01) {
              console.error('[AUDIT] Divergência pós-salvamento detectada!', { esperado: { rev: revServiceOnly, toll }, banco: { rev: savedRevCheck, toll: savedTollCheck } });
          }
          
          if (isFullyApproved && manualClientTableId) {
              const missionProvNorm = (mission.provider || '').toUpperCase().trim();
              const routeKeyFull = `${mission.client}|${missionProvNorm}|${mission.origin}|${mission.destination}`.toUpperCase();
              const routeKeyBase = `${mission.client}|${mission.origin}|${mission.destination}`.toUpperCase();
              const details = JSON.stringify({
                  clientTableId: manualClientTableId,
                  providerTableId: manualProviderTableId || null,
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

          const adjustmentDetails = JSON.stringify({
              clientTableId: manualClientTableId || null,
              providerTableId: manualProviderTableId || null,
              customClientBase: customClientBase || null,
              customClientKm: customClientKm || null,
              customClientHour: customClientHour || null,
              customProviderBase: customProviderBase || null,
              customProviderKm: customProviderKm || null,
              customProviderHour: customProviderHour || null,
              iblEnabled: iblEnabled,
              revenueTotal: revTotal,
              costTotal: costTotal,
              tollValue: toll,
              tollProviderValue: tollProv
          });

          await supabase.from('system_logs').delete().eq('entity', 'BillingAdjustment').eq('entity_id', mission.id);
          await supabase.from('system_logs').insert([{
              user_name: userName,
              action_type: approve ? 'APPROVE_SAVE' : 'MANUAL_SAVE',
              entity: 'BillingAdjustment',
              entity_id: mission.id,
              details: adjustmentDetails
          }]);

          const now = new Date();
          const dateStr = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          const verifiedLabel = `${userName} (${dateStr})`;
          setSavedByInfo(verifiedLabel);

          setApprovalLog(newLog);
          
          setUseSavedValues(true);

          setMission(prev => prev ? {
              ...prev,
              revenue_value: revServiceOnly,
              cost_value: costServiceOnly,
              toll_value: toll,
              toll_value_provider: tollProv,
              billing_approved: isApprovedForBilling,
              ...(approve && canReleaseBilling ? { billing_verified_by: userName } : {}),
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
          
          if (onUpdate) onUpdate();
          window.dispatchEvent(new CustomEvent('refreshMissions'));
          if (!approve || isFullyApproved) onClose();
      } catch (e: any) { alert(e.message); } finally { setIsUpdating(false); isSavingRef.current = false; }
  };

  const filteredProviderTables = useMemo(() => {
      if (!mission?.provider) return providerTables;
      const normalizedProviderName = mission.provider.toUpperCase().trim();
      return providerTables.filter(t => t.provider?.toUpperCase().trim() === normalizedProviderName);
  }, [providerTables, mission?.provider]);

  if (!isOpen || !mission) return null;

  const isZeroCostError = financialData && financialData.provider.base === 0 && !mission.is_same_os && (financialData.realTraveledKm > 0 || financialData.durationHours > 0);
  
  const isInheritedToll = false;
  const isSavedZero = tollSource === 'VALOR SALVO (R$ 0,00)';
  const isAwaitingCheck = tollSource === 'AGUARDANDO CONFERÊNCIA';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      
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
                          const { data } = await supabase.from('client_price_tables').select('*');
                          if (data) {
                              setClientTables(data as any);
                              setCustomClientBase('');
                              setCustomClientKm('');
                              setCustomClientHour('');
                              setUseSavedValues(false);
                              if (newTableId) {
                                  setManualClientTableId(newTableId);
                              }
                              showNotification('Atualizado', 'Tabela de preço atualizada. Valores recalculados.', 'success');
                          }
                          setIsEditClientTableOpen(false);
                          setEditClientTableId(null);
                      }}
                      id={editClientTableId}
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

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[95vh] border border-gray-200 relative z-[100]">
        <header className="bg-[#0f172a] text-white p-5 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="p-2.5 bg-red-600 rounded-xl shadow-lg shrink-0"><Calculator size={24} /></div>
            <div className="min-w-0 flex-1">
                <h3 className="font-bold text-xl leading-none truncate">Auditoria de Faturamento <span className="text-gray-400 text-sm"># {mission.id}</span></h3>
                <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 mt-2">
                    <div className="flex gap-2 shrink-0">
                        <span className="bg-blue-900 text-blue-200 text-[9px] px-2 py-0.5 rounded font-bold uppercase flex items-center gap-1"><Building2 size={10}/> {mission.client}</span>
                        <span className="bg-indigo-900 text-indigo-200 text-[9px] px-2 py-0.5 rounded font-bold uppercase flex items-center gap-1"><Briefcase size={10}/> {formatProviderName(mission.provider)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase min-w-0 flex-1 overflow-hidden">
                        <MapPin size={10} className="text-red-500 shrink-0" /> 
                        {isEditingRoute ? (
                            <>
                                <input 
                                    type="text" 
                                    value={editOrigin} 
                                    onChange={e => setEditOrigin(e.target.value.toUpperCase())}
                                    className="bg-white/10 border border-white/30 rounded px-2 py-1 text-[10px] font-bold text-white uppercase flex-1 min-w-0 outline-none focus:border-red-400"
                                    placeholder="Origem"
                                    data-testid="input-edit-origin"
                                />
                                <ArrowRight size={10} className="shrink-0" />
                                <input 
                                    type="text" 
                                    value={editDestination} 
                                    onChange={e => setEditDestination(e.target.value.toUpperCase())}
                                    className="bg-white/10 border border-white/30 rounded px-2 py-1 text-[10px] font-bold text-white uppercase flex-1 min-w-0 outline-none focus:border-red-400"
                                    placeholder="Destino"
                                    data-testid="input-edit-destination"
                                />
                                <button 
                                    onClick={async () => {
                                        if (!editOrigin.trim() || !editDestination.trim()) return;
                                        setIsSavingRoute(true);
                                        try {
                                            const { error } = await supabase.from('missions').update({ 
                                                origin: editOrigin.trim(), 
                                                destination: editDestination.trim(),
                                                last_update: new Date().toISOString()
                                            }).eq('id', mission.id).select('id').single();
                                            if (error) throw error;
                                            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
                                            await supabase.from('system_logs').insert([{
                                                user_name: userData.name || 'Sistema',
                                                action_type: 'UPDATE',
                                                entity: 'Mission',
                                                entity_id: mission.id,
                                                details: JSON.stringify({ field: 'route', oldOrigin: mission.origin, newOrigin: editOrigin.trim(), oldDestination: mission.destination, newDestination: editDestination.trim() })
                                            }]);
                                            mission.origin = editOrigin.trim();
                                            mission.destination = editDestination.trim();
                                            setIsEditingRoute(false);
                                            showNotification('Rota Atualizada', `${editOrigin.trim()} → ${editDestination.trim()}`, 'success');
                                        } catch (err: any) {
                                            showNotification('Erro', err.message, 'error');
                                        }
                                        setIsSavingRoute(false);
                                    }}
                                    disabled={isSavingRoute}
                                    className="flex items-center gap-1 px-2 py-1 bg-emerald-600 text-white rounded text-[9px] font-black hover:bg-emerald-700 shrink-0"
                                    data-testid="button-save-route"
                                >
                                    {isSavingRoute ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />} OK
                                </button>
                                <button 
                                    onClick={() => setIsEditingRoute(false)}
                                    className="p-1 text-gray-400 hover:text-white shrink-0"
                                >
                                    <X size={12} />
                                </button>
                            </>
                        ) : (
                            <>
                                <span className="truncate flex-1 min-w-0">{mission.origin}</span>
                                <ArrowRight size={10} className="shrink-0" />
                                <span className="truncate flex-1 min-w-0">{mission.destination}</span>
                                {canEditOpsData && (
                                    <button 
                                        onClick={() => { setEditOrigin(mission.origin || ''); setEditDestination(mission.destination || ''); setIsEditingRoute(true); }}
                                        className="p-1 text-gray-500 hover:text-white transition-colors shrink-0"
                                        title="Editar Origem e Destino"
                                        data-testid="button-edit-route"
                                    >
                                        <Pencil size={10} />
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4 shrink-0">
            {mission.is_same_os && mission.parent_mission_id && (
              <span className="text-[9px] font-black bg-blue-600 text-white px-2 py-1 rounded uppercase flex items-center gap-1">
                <Link2 size={10} /> MÃE: {mission.parent_mission_id}
              </span>
            )}
            <button
              data-testid="btn-toggle-same-os"
              onClick={async () => {
                const newVal = !mission.is_same_os;
                if (newVal && !confirm('Marcar como MESMA OS? O custo do fornecedor será zerado.')) return;
                if (!newVal && !confirm('Desmarcar MESMA OS? O custo do fornecedor será recalculado.')) return;
                try {
                  const updateData: any = { is_same_os: newVal };
                  if (!newVal) updateData.parent_mission_id = null;
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
                  showNotification(newVal ? 'MESMA OS Ativada' : 'MESMA OS Desativada', newVal ? 'Custo do fornecedor zerado.' : 'Custo será recalculado.', 'success');
                  onUpdate();
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
            <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors"><X size={24}/></button>
          </div>
        </header>

        <div ref={modalContentRef} className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50 pb-32">
            {isSnapshotFrozen && (
                <div data-testid="snapshot-frozen-banner" className="bg-amber-50 border-2 border-amber-400 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                    <div className="bg-amber-500 p-2 rounded-lg"><Lock size={20} className="text-white" /></div>
                    <div>
                        <p className="font-bold text-amber-900 text-sm">Dados Congelados</p>
                        <p className="text-amber-700 text-xs">Aprovado por <strong>{mission.snapshot_approved_by}</strong> em {mission.snapshot_approved_at ? new Date(mission.snapshot_approved_at).toLocaleString('pt-BR') : '-'}</p>
                        <p className="text-amber-600 text-[10px] mt-0.5">Valores finais salvos. O boletim de medição reflete esta versão aprovada.</p>
                    </div>
                </div>
            )}
            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <Loader2 size={48} className="animate-spin text-red-600" />
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Sincronizando Dados...</p>
                </div>
            ) : financialData && (
                <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                    
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
                                        onClick={() => {
                                            if (financialData) {
                                                const toll = financialData.tollValue;
                                                setUseSavedValues(false);
                                                setRevenueInput((financialData.client.total).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                                                setCostInput((financialData.provider.total).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                                                setTollInput(toll.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                                                setTollProviderInput(toll.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                                                showNotification('Tabela Aplicada', 'Valores ajustados conforme tabela oficial de franquia.', 'success');
                                            }
                                        }}
                                        className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-amber-600 text-white rounded-lg text-[10px] font-black uppercase hover:bg-amber-700 transition-all shadow-sm"
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
                                        {canEditClientData && !isEditingOpsData && (
                                            <button onClick={() => setIsEditingOpsData(true)} className="flex items-center gap-1 px-2 py-1 text-[9px] font-black text-green-600 bg-green-100 rounded-lg hover:bg-green-200 uppercase tracking-wider transition-all" data-testid="button-edit-ops-data"><Edit2 size={10}/> Editar</button>
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
                                            {isEditingOpsData ? (
                                                <input type="datetime-local" value={editStartTime} onChange={e => setEditStartTime(e.target.value)} className="w-full text-xs font-bold text-gray-700 border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none" data-testid="input-start-time" />
                                            ) : (
                                                <p className="text-sm font-bold text-gray-700 font-mono">{mission.startTime ? new Date(mission.startTime).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '---'}</p>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">KM Inicial</p>
                                            {isEditingOpsData ? (
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
                                                <p className="text-sm font-bold text-gray-700 font-mono">{mission.endTime ? new Date(mission.endTime).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '---'}</p>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">KM Final</p>
                                            {isEditingOpsData ? (
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
                                        {canEditOpsData && !isEditingProvOpsData && (
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
                                                    return t ? new Date(t).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '---';
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
                                                    return t ? new Date(t).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '---';
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        
                        {/* COLUNA FATURAMENTO (CLIENTE) */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col h-full">
                            <h4 className="text-sm font-black text-blue-700 uppercase tracking-widest mb-4 flex items-center gap-2">
                                [ {mission.client} ]
                            </h4>
                            
                            <div className="mb-4">
                                <label className={LABEL_CLASS}>Tabela de Preço Aplicada</label>
                                <div className="flex gap-2">
                                    <select 
                                        className={`w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 uppercase outline-none focus:border-blue-500 ${isController ? 'pointer-events-none opacity-60' : ''}`}
                                        value={manualClientTableId || ''}
                                        onChange={(e) => { if (!isController) { setManualClientTableId(e.target.value); setCustomClientBase(''); setCustomClientKm(''); setCustomClientHour(''); setUseSavedValues(false); } }}
                                        disabled={isController}
                                    >
                                        <option value="">Automático (IA Detectando)</option>
                                        {[...clientTables].sort((a, b) => (a.operation_type || '').localeCompare(b.operation_type || '')).map(t => (
                                            <option key={t.id} value={t.id}>{t.operation_type}</option>
                                        ))}
                                    </select>
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
                                </div>
                                {/* LOG DE DETECÇÃO DA IA */}
                                <div className="mt-2 text-[9px] font-bold text-gray-400 flex items-center gap-1.5 bg-gray-50 p-2 rounded-lg border border-gray-100">
                                    <BrainCircuit size={12} className="text-blue-500" />
                                    <span>IA Detectou: {financialData.client.detectionLog}</span>
                                </div>
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
                                        <input type="text" className={`w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs font-bold text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none ${isController ? 'pointer-events-none opacity-60' : ''}`} placeholder={financialData.client.base.toFixed(2)} value={customClientBase} onChange={e => { if (!isController) handleManualInput(setCustomClientBase, e.target.value); }} readOnly={isController} />
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
                                        <input type="text" className={`w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs font-bold text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none ${isController ? 'pointer-events-none opacity-60' : ''}`} placeholder={financialData.client.unitPriceKm.toFixed(2)} value={customClientKm} onChange={e => { if (!isController) handleManualInput(setCustomClientKm, e.target.value); }} readOnly={isController} />
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
                                        <input type="text" className={`w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs font-bold text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none ${isController ? 'pointer-events-none opacity-60' : ''}`} placeholder={financialData.client.unitPriceHour.toFixed(2)} value={customClientHour} onChange={e => { if (!isController) handleManualInput(setCustomClientHour, e.target.value); }} readOnly={isController} />
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
                                {!mission.is_same_os && (
                                    <button
                                        data-testid="btn-recalculate-provider"
                                        onClick={async () => {
                                            const currentTableId = manualProviderTableId;
                                            setCustomProviderBase('');
                                            setCustomProviderKm('');
                                            setCustomProviderHour('');
                                            setUseSavedValues(false);
                                            setManualProviderTableId('');
                                            await supabase.from('system_logs').delete().eq('entity', 'BillingAdjustment').eq('entity_id', mission.id);
                                            setTimeout(() => {
                                                setManualProviderTableId(currentTableId);
                                                showNotification('Recalculado', 'Valores do fornecedor recalculados com sucesso.', 'success');
                                            }, 100);
                                        }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-[10px] font-black uppercase rounded-lg hover:bg-red-700 transition-all shadow-md active:scale-95"
                                        title="Recalcular custos do fornecedor"
                                    >
                                        <RefreshCw size={12} />
                                        Recalcular
                                    </button>
                                )}
                            </div>

                            <div className="mb-4">
                                <label className={LABEL_CLASS}>Tabela de Custo de Referência</label>
                                <div className="flex gap-2">
                                    <select 
                                        className={`w-full p-2 bg-gray-50 border rounded-lg text-xs font-bold text-gray-700 uppercase outline-none focus:border-red-500 ${isZeroCostError ? 'border-red-300 bg-red-50 text-red-900 animate-pulse' : 'border-gray-200'}`}
                                        value={manualProviderTableId || ''}
                                        onChange={(e) => { setManualProviderTableId(e.target.value); setCustomProviderBase(''); setCustomProviderKm(''); setCustomProviderHour(''); setUseSavedValues(false); }}
                                        disabled={mission.is_same_os}
                                    >
                                        <option value="">{mission.is_same_os ? 'Custo Zero (Mesma OS)' : 'IA Detectando Melhor Custo...'}</option>
                                        {!mission.is_same_os && [...filteredProviderTables].sort((a, b) => (a.operation_type || '').localeCompare(b.operation_type || '')).map(t => (
                                            <option key={t.id} value={t.id}>{t.operation_type}</option>
                                        ))}
                                    </select>
                                    {!mission.is_same_os && manualProviderTableId && (
                                        <button 
                                            onClick={() => { setEditCostTableId(manualProviderTableId); setIsAddCostModalOpen(true); }}
                                            className="p-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-all shadow-md active:scale-95"
                                            title="Editar Tabela Selecionada"
                                        >
                                            <Edit2 size={14}/>
                                        </button>
                                    )}
                                    {!mission.is_same_os && (
                                        <button 
                                            onClick={() => { setEditCostTableId(null); setIsAddCostModalOpen(true); }}
                                            className="p-2 bg-slate-900 text-white rounded-lg hover:bg-black transition-all shadow-md active:scale-95"
                                            title="Cadastrar Nova Tabela"
                                        >
                                            <Plus size={14}/>
                                        </button>
                                    )}
                                </div>
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
                                        <input type="text" className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs font-bold text-gray-700 focus:border-red-500 focus:ring-1 focus:ring-red-200 outline-none" placeholder={financialData.provider.base.toFixed(2)} value={customProviderBase} onChange={e => handleManualInput(setCustomProviderBase, e.target.value)} />
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
                                        <input type="text" className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs font-bold text-gray-700 focus:border-red-500 focus:ring-1 focus:ring-red-200 outline-none" placeholder={financialData.provider.unitCostKm.toFixed(2)} value={customProviderKm} onChange={e => handleManualInput(setCustomProviderKm, e.target.value)} />
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
                                        <input type="text" className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs font-bold text-gray-700 focus:border-red-500 focus:ring-1 focus:ring-red-200 outline-none" placeholder={financialData.provider.unitCostHour.toFixed(2)} value={customProviderHour} onChange={e => handleManualInput(setCustomProviderHour, e.target.value)} />
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
                                        onClick={() => { setTollConfirmed(true); setTollSource(`CONFERIDO (R$ ${tollInput})`); }}
                                        className="flex items-center gap-1.5 text-[10px] font-black text-white bg-orange-500 hover:bg-orange-600 px-3 py-1.5 rounded-lg border border-orange-600 animate-pulse cursor-pointer transition-colors"
                                    >
                                        <AlertTriangle size={12}/> CONFIRMAR PEDÁGIO
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
                                        className={`flex-1 bg-transparent border-none outline-none font-black text-xl text-green-900 ${isController ? 'pointer-events-none' : ''}`}
                                        value={tollInput} 
                                        onChange={e => { if (!isController) handleTollChange(e.target.value); }} 
                                        readOnly={isController}
                                        data-testid="input-toll-client"
                                    />
                                    <Building2 size={16} className="text-green-300 ml-2" />
                                </div>
                                {useSavedValues && parseNumber(tollInput) > 0 && (
                                    <span className="text-[8px] font-bold text-amber-600 mt-1 block">⚠ PEDÁGIO SALVO NA MEMÓRIA</span>
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
                        </div>
                        
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-4 bg-green-50 border border-green-100 rounded-xl relative group">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-[10px] font-black text-green-700 uppercase">Valor Final Cliente (Serviço + Pedágio)</label>
                                <button type="button" onClick={handleRecalculateClient} className={`flex items-center gap-1 text-[9px] font-bold text-green-700 hover:text-green-900 bg-green-100 hover:bg-green-200 px-2 py-0.5 rounded transition-colors ${isController ? 'hidden' : ''}`} title="Resetar para o cálculo da tabela">
                                    <RefreshCw size={10} /> Recalcular
                                </button>
                            </div>
                            {(() => {
                                const ibl = financialData.iblFee || 0;
                                const calcTotal = financialData.client.base + financialData.client.extraKmVal + financialData.client.extraHrVal + ibl + parseNumber(tollInput);
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
                                            <span className="font-black">= {formatCurrency(calcTotal)}</span>
                                        </div>
                                        {isDivergent && <span className="text-[8px] text-amber-600 font-black">⚠ Valor exibido ({formatCurrency(savedTotal)}) difere da tabela ({formatCurrency(calcTotal)}). Clique "Recalcular" para corrigir.</span>}
                                    </div>
                                );
                            })()}
                            <div className="flex items-baseline gap-2">
                                <span className="text-sm font-bold text-green-600">R$</span>
                                <input 
                                    type="text" 
                                    inputMode="decimal"
                                    className={`w-full bg-white/60 border border-green-200 rounded-lg px-2 py-1 outline-none font-black text-3xl text-green-900 font-mono focus:ring-2 focus:ring-green-400 focus:border-green-400 ${!canEditClientData ? 'pointer-events-none opacity-70' : 'cursor-text'}`}
                                    value={revenueInput} 
                                    onChange={e => { if (canEditClientData) { userManuallyEditedRef.current = true; setUseSavedValues(true); setRevenueInput(e.target.value); setShowRevenueReasonInput(true); } }}
                                    readOnly={!canEditClientData}
                                    data-testid="input-revenue-total"
                                />
                            </div>
                            <p className="text-[8px] text-green-600 font-bold mt-1 italic">{canEditClientData ? '* EDITÁVEL - DIRETORIA / ADMINISTRADOR (toque para editar)' : '* VALOR TOTAL CALCULADO BASEADO NAS FRANQUIAS E MEDIÇÃO'}</p>
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
                                    Pagamento Fornecedor (Tabela + Pedágio)
                                    {mission?.verified_by && mission?.verified_at && <Lock size={12} className="text-blue-600" />}
                                </label>
                                {!(mission?.verified_by && mission?.verified_at) && (
                                    <button type="button" onClick={handleRecalculateProvider} className="flex items-center gap-1 text-[9px] font-bold text-blue-700 hover:text-blue-900 bg-blue-100 hover:bg-blue-200 px-2 py-0.5 rounded transition-colors" title="Resetar para o cálculo da tabela">
                                        <RefreshCw size={10} /> Recalcular
                                    </button>
                                )}
                            </div>
                            {mission?.verified_by && mission?.verified_at && (
                                <div className="bg-blue-100 border border-blue-300 rounded-lg px-3 py-1.5 mb-2 flex items-center gap-2">
                                    <ShieldCheck size={14} className="text-blue-700" />
                                    <span className="text-[9px] font-black text-blue-800">VERIFICADO PELO CONTROLLER — Valor travado. Somente Diretoria pode alterar.</span>
                                </div>
                            )}
                            {(() => {
                                const calcTotal = financialData.provider.base + financialData.provider.extraKmVal + financialData.provider.extraHrVal + parseNumber(tollProviderInput);
                                const savedTotal = parseNumber(costInput);
                                const isDivergent = Math.abs(calcTotal - savedTotal) > 1;
                                return (
                                    <div className={`flex flex-col gap-1 text-[9px] font-bold mb-2 px-2 py-1.5 rounded-lg border ${isDivergent ? 'text-amber-700 bg-amber-50/80 border-amber-300' : 'text-blue-600 bg-blue-100/60 border-blue-200'}`}>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                            <span>{formatCurrency(financialData.provider.base)} <span className={isDivergent ? 'text-amber-400' : 'text-blue-400'}>(base)</span></span>
                                            <span>+ {formatCurrency(financialData.provider.extraKmVal)} <span className={isDivergent ? 'text-amber-400' : 'text-blue-400'}>(km{financialData.provider.excessKm > 0 ? `: ${financialData.provider.excessKm.toFixed(1)}×R$${financialData.provider.unitCostKm.toFixed(2)}` : ''})</span></span>
                                            <span>+ {formatCurrency(financialData.provider.extraHrVal)} <span className={isDivergent ? 'text-amber-400' : 'text-blue-400'}>(hora{financialData.provider.excessHours > 0 ? `: ${formatHoursHHMM(financialData.provider.excessHoursReal)} real → ${formatHoursHHMM(financialData.provider.excessHours)}×R$${financialData.provider.unitCostHour.toFixed(2)}` : ''})</span></span>
                                            <span>+ {formatCurrency(parseNumber(tollProviderInput))} <span className={isDivergent ? 'text-amber-400' : 'text-blue-400'}>(pedágio)</span></span>
                                            <span className="font-black">= {formatCurrency(calcTotal)}</span>
                                        </div>
                                        {isDivergent && <span className="text-[8px] text-amber-600 font-black">⚠ Valor exibido ({formatCurrency(savedTotal)}) difere da tabela ({formatCurrency(calcTotal)}). Clique "Recalcular" para corrigir.</span>}
                                    </div>
                                );
                            })()}
                            <div className="flex items-baseline gap-2">
                                <span className="text-sm font-bold text-blue-600">R$</span>
                                <input 
                                    type="text" 
                                    inputMode="decimal"
                                    className={`w-full bg-white/60 border border-blue-200 rounded-lg px-2 py-1 outline-none font-black text-3xl text-blue-900 font-mono focus:ring-2 focus:ring-blue-400 focus:border-blue-400 ${(!canEditOpsData || (mission?.verified_by && mission?.verified_at && !['diretoria', 'administrador', 'ceo', 'controller'].includes(userRoleLower))) ? 'pointer-events-none opacity-70' : 'cursor-text'}`}
                                    value={costInput} 
                                    onChange={e => { if (canEditOpsData && !(mission?.verified_by && mission?.verified_at && !['diretoria', 'administrador', 'ceo', 'controller'].includes(userRoleLower))) { userManuallyEditedRef.current = true; setUseSavedValues(true); setCostInput(e.target.value); setShowCostReasonInput(true); } }}
                                    readOnly={!canEditOpsData || !!(mission?.verified_by && mission?.verified_at && !['diretoria', 'administrador', 'ceo', 'controller'].includes(userRoleLower))}
                                    data-testid="input-cost-total"
                                />
                            </div>
                            <p className="text-[8px] text-blue-600 font-bold mt-1 italic">
                                {mission?.verified_by && mission?.verified_at
                                    ? '🔒 VALOR VERIFICADO PELO CONTROLLER — Somente Diretoria pode alterar'
                                    : canEditOpsData ? '* EDITÁVEL - DIRETORIA / ADMINISTRADOR (toque para editar)' : ''}
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
                                        <CheckCircle2 size={12} className={log.stage === 'auditor' ? 'text-amber-500' : log.stage === 'financeiro' ? 'text-blue-500' : 'text-emerald-600'} />
                                        <div>
                                            <span className="text-[10px] font-black text-gray-800">
                                                {log.stage === 'auditor' ? 'Auditor' : log.stage === 'financeiro' ? 'Financeiro' : log.stage === 'diretoria' ? 'Diretoria' : log.stage}
                                            </span>
                                            <span className="text-[9px] text-gray-500 ml-1">({log.user})</span>
                                            <p className="text-[8px] text-gray-400 font-mono">{new Date(log.date).toLocaleString('pt-BR')}</p>
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

                    <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-gray-200 z-[100] shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
                        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
                            <div className="flex gap-12 items-center">
                                <div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">Resultado Operacional Final</p>
                                    <h3 className={`text-3xl font-black font-mono tracking-tighter ${financialData.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {formatCurrency(parseNumber(revenueInput) - parseNumber(costInput))}
                                    </h3>
                                </div>
                                <div className="border-l border-gray-200 pl-12 hidden md:block">
                                    <p className="text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">Margem Líquida %</p>
                                    <h3 className="text-3xl font-black font-mono tracking-tighter text-blue-600">
                                        {financialData.marginPercent.toFixed(1)}%
                                    </h3>
                                </div>
                                {!currentApprovalStatus.isFullyApproved && (
                                    <div className="border-l border-gray-200 pl-6 hidden md:block">
                                        <p className="text-[10px] font-black text-amber-600 uppercase mb-0.5 tracking-widest">Aprovações</p>
                                        <div className="flex gap-1.5">
                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${currentApprovalStatus.hasAuditor ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-400'}`}>AUD</span>
                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${currentApprovalStatus.hasFinanceiro ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>FIN</span>
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
                                <div className="flex gap-3">
                                <button onClick={() => handleUpdate(false)} disabled={isUpdating || currentApprovalStatus.lockedByDiretoria} className={`px-6 py-3 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95 h-12 ${currentApprovalStatus.lockedByDiretoria ? 'bg-gray-200 text-gray-400 border border-gray-300 cursor-not-allowed' : 'bg-white text-slate-900 border border-slate-200 hover:bg-slate-50'}`} data-testid="button-save-adjustments">
                                    {isUpdating ? <Loader2 size={16} className="animate-spin" /> : currentApprovalStatus.lockedByDiretoria ? <Lock size={16} /> : <Save size={16} />} {currentApprovalStatus.lockedByDiretoria ? 'Bloqueado (Diretoria)' : 'Salvar Ajustes'}
                                </button>
                                <button 
                                    onClick={() => handleUpdate(true)} 
                                    disabled={isUpdating || isZeroCostError || !tollConfirmed || (mission?.status === MissionStatus.PENDING && currentApprovalStatus.currentUserStage !== 'diretoria') || currentApprovalStatus.blockedForCurrentUser || currentApprovalStatus.lockedByDiretoria} 
                                    className={`px-8 py-3 rounded-xl font-black uppercase text-xs shadow-lg flex flex-col items-center justify-center gap-1 transition-all active:scale-95 min-h-[48px] ${(isZeroCostError || !tollConfirmed || (mission?.status === MissionStatus.PENDING && currentApprovalStatus.currentUserStage !== 'diretoria')) ? 'bg-gray-400 cursor-not-allowed text-gray-200' : (currentApprovalStatus.blockedForCurrentUser || currentApprovalStatus.lockedByDiretoria) ? 'bg-amber-50 border-2 border-amber-400 text-amber-800 cursor-not-allowed shadow-amber-100' : currentApprovalStatus.hasPartial ? 'bg-gray-300 text-gray-600 border border-gray-400 cursor-pointer hover:bg-gray-400' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200'}`}
                                    data-testid="button-approve-billing"
                                >
                                    <span className="flex items-center gap-2">
                                        {isUpdating ? <Loader2 size={16} className="animate-spin" /> : (currentApprovalStatus.blockedForCurrentUser || currentApprovalStatus.lockedByDiretoria) ? <Lock size={16} className="text-amber-600" /> : <CheckCircle2 size={16} />} 
                                        {(mission?.status === MissionStatus.PENDING && currentApprovalStatus.currentUserStage !== 'diretoria')
                                            ? 'OS Pendente — Não Aprovável' 
                                            : !tollConfirmed 
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
    </div>
  );
};

export default MissionFinancialModal;
