
import React, { useState, useEffect, useMemo } from 'react';
import { Mission, ClientPriceTable, ProviderCostTable, MissionStatus, Client } from '../types';
import { supabase } from '../lib/supabase';
import { useNotification } from '../lib/NotificationContext';
import { calculateMissionFinancials, auditMissionFinancials } from '../lib/financialUtils';
import { X, Calculator, Loader2, Save, CheckCircle2, TrendingUp, Landmark, Zap, RotateCcw, Building2, Briefcase, Plus, Users, MapPin, ArrowRight, BrainCircuit, AlertTriangle, AlertCircle, Edit2, Info, RefreshCw } from 'lucide-react';
import ProviderCostForm from './ProviderCostForm';
import ClientPriceForm from './ClientPriceForm';
import { formatProviderName } from '../lib/utils';

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
  const [useSavedValues, _setUseSavedValues] = useState(false);
  const useSavedValuesRef = React.useRef(false);
  const setUseSavedValues = (val: boolean) => { useSavedValuesRef.current = val; _setUseSavedValues(val); };

  const [editStartKm, setEditStartKm] = useState('');
  const [editEndKm, setEditEndKm] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [isEditingOpsData, setIsEditingOpsData] = useState(false);

  const canEditOpsData = useMemo(() => {
    try {
      const u = JSON.parse(localStorage.getItem('userData') || '{}');
      const roleLower = (u.role || '').toLowerCase();
      return ['diretoria', 'administrador'].includes(roleLower) || u.permissions?.includes('*');
    } catch { return false; }
  }, []);
  

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000); 
    return () => clearInterval(timer);
  }, []);

  // Busca Inteligente de Padrões (Memória Evolutiva)
  // BLINDAGEM: Pedágio NUNCA é herdado de outras missões (IDs diferentes).
  // Se a missão atual tem toll_value salvo no banco, usa esse valor.
  // Se não tem, inicia como ZERO e exige conferência humana.
  const fetchHistoricalPatterns = async (currentMission: Mission) => {
      if (!currentMission.client || !currentMission.origin) return;
      try {
          const dbToll = currentMission.toll_value ?? 0;
          const dbTollProv = currentMission.toll_value_provider != null ? currentMission.toll_value_provider : dbToll;
          const hasRevenue = currentMission.revenue_value != null && currentMission.revenue_value > 0;
          if (currentMission.billing_approved && currentMission.toll_value !== null && currentMission.toll_value !== undefined) {
             setSuggestedToll(dbToll);
             setTollSource(dbToll === 0 ? 'APROVADO (R$ 0,00)' : 'VALOR APROVADO');
             setTollInput(dbToll.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
             setTollProviderInput(dbTollProv.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
             setTollConfirmed(true);
          } else if (dbToll > 0 || hasRevenue) {
             setSuggestedToll(dbToll);
             setTollSource(dbToll === 0 ? 'VALOR SALVO (R$ 0,00)' : 'VALOR SALVO');
             setTollInput(dbToll.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
             setTollProviderInput(dbTollProv.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
             setTollConfirmed(true);
          } else {
             setSuggestedToll(0);
             setTollSource('AGUARDANDO CONFERÊNCIA');
             setTollInput('0,00');
             setTollProviderInput('0,00');
             setTollConfirmed(false);
          }

          setAiMaturity(0);

          // Busca Memória de Tabela (Pattern Matching no Logs) - apenas para tabelas, NÃO para pedágio
          const routeKey = `${currentMission.client}|${currentMission.origin}|${currentMission.destination}`.toUpperCase();
          const { data: memLogs } = await supabase
            .from('system_logs')
            .select('details')
            .eq('entity', 'BillingPattern')
            .ilike('details', `%${routeKey}%`)
            .order('created_at', { ascending: false })
            .limit(1);

          if (memLogs && memLogs.length > 0) {
             try {
                 const details = JSON.parse(memLogs[0].details);
                 if (details.clientTableId) {
                     setManualClientTableId(details.clientTableId);
                     showNotification('Memória Evolutiva', 'Tabela aplicada com base em aprovação anterior.', 'success');
                 }
                 if (details.providerTableId) {
                     setManualProviderTableId(details.providerTableId);
                 }
                 if (details.tollValue !== undefined && details.tollValue !== null && !currentMission.billing_approved && !(dbToll > 0 || hasRevenue)) {
                     const memToll = Number(details.tollValue);
                     setTollInput(memToll.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
                     setSuggestedToll(memToll);
                     setTollSource('MEMÓRIA (Rota Anterior)');
                     setTollConfirmed(false);
                 }
                 setMemoryLoaded(true);
             } catch (e) { console.error("Erro ao ler memória:", e); }
          }
          
      } catch (e) { console.error("Erro na IA de Padrões:", e); }
  };

  const loadData = async () => {
      if (!initialMission?.id) return;
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

              const dbToll = mRes.data.toll_value || 0;
              const dbTollProvider = mRes.data.toll_value_provider != null ? mRes.data.toll_value_provider : dbToll;
              const savedRev = safeNumber(mRes.data.revenue_value);
              const savedCost = safeNumber(mRes.data.cost_value);
              if (mRes.data.billing_approved) {
                  setTollInput(dbToll.toLocaleString('pt-BR', {minimumFractionDigits: 2}));
                  setTollProviderInput(dbTollProvider.toLocaleString('pt-BR', {minimumFractionDigits: 2}));
                  setTollConfirmed(true);
                  setTollSource(dbToll === 0 ? 'APROVADO (R$ 0,00)' : 'VALOR APROVADO');
              } else if (dbToll > 0 || savedRev > 0) {
                  setTollInput(dbToll.toLocaleString('pt-BR', {minimumFractionDigits: 2}));
                  setTollProviderInput(dbTollProvider.toLocaleString('pt-BR', {minimumFractionDigits: 2}));
                  setTollConfirmed(true);
                  setTollSource(dbToll === 0 ? 'VALOR SALVO (R$ 0,00)' : 'VALOR SALVO');
              } else {
                  setTollInput('0,00');
                  setTollProviderInput('0,00');
                  setTollConfirmed(false);
                  setTollSource('AGUARDANDO CONFERÊNCIA');
              }

              if (savedRev > 0 || savedCost > 0) {
                  setUseSavedValues(true);
                  const totalRev = savedRev + dbToll;
                  const totalCost = savedCost + dbTollProvider;
                  setRevenueInput(totalRev.toLocaleString('pt-BR', {minimumFractionDigits: 2}));
                  setCostInput(totalCost.toLocaleString('pt-BR', {minimumFractionDigits: 2}));
              }
              
              fetchHistoricalPatterns(fullMission);
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
          if (newTableId) {
              setManualProviderTableId(newTableId);
              showNotification('Atualizado', 'Nova tabela selecionada automaticamente.', 'success');
          }
      }
      setIsAddCostModalOpen(false);
  };

  const handleSaveOpsData = async () => {
      if (!mission) return;
      setIsUpdating(true);
      try {
          const updatePayload: any = {};
          if (editStartKm) updatePayload.start_km = parseFloat(editStartKm) || null;
          if (editEndKm) updatePayload.end_km = parseFloat(editEndKm) || null;
          if (editStartTime) updatePayload.start_time = new Date(editStartTime).toISOString();
          if (editEndTime) updatePayload.end_time = new Date(editEndTime).toISOString();
          updatePayload.last_update = new Date().toISOString();
          updatePayload.updated_by = JSON.parse(localStorage.getItem('userData') || '{}').name;

          const { error } = await supabase.from('missions').update(updatePayload).eq('id', mission.id);
          if (error) throw error;

          const updated = { ...mission, ...updatePayload, startKm: updatePayload.start_km, endKm: updatePayload.end_km, startTime: updatePayload.start_time, endTime: updatePayload.end_time, lastUpdate: updatePayload.last_update };
          setMission(updated);
          setIsEditingOpsData(false);
          showNotification('Salvo', 'Dados operacionais atualizados com sucesso.', 'success');
          if (onUpdate) onUpdate();
      } catch (e: any) {
          showNotification('Erro', e.message || 'Falha ao salvar dados operacionais.', 'error');
      } finally { setIsUpdating(false); }
  };

  useEffect(() => { if (isOpen) loadData(); }, [isOpen]);

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
          customProviderBase: customProviderBase ? parseNumber(customProviderBase) : undefined
      });
  }, [mission, clientTables, providerTables, clientData, manualClientTableId, manualProviderTableId, iblEnabled, tollInput, customProviderKm, customProviderHour, customClientKm, customClientHour, customClientBase, customProviderBase]);

    useEffect(() => {
      if (financialData && mission) {
          if (!useSavedValuesRef.current) {
              setRevenueInput(financialData.client.total.toLocaleString('pt-BR', {minimumFractionDigits: 2}));
              setCostInput(financialData.provider.total.toLocaleString('pt-BR', {minimumFractionDigits: 2}));
          }
          
          if (financialData.provider.tableId) {
              if (!manualProviderTableId && !memoryLoaded) {
                  setManualProviderTableId(financialData.provider.tableId);
              }
              if (manualProviderTableId && financialData.provider.tableId !== manualProviderTableId && financialData.provider.detectionLog.includes('CEVA Jundiaí')) {
                  setManualProviderTableId(financialData.provider.tableId);
              }
          }
          if (financialData.client.tableId) {
              if (!manualClientTableId && !memoryLoaded) {
                  setManualClientTableId(financialData.client.tableId);
              }
              if (manualClientTableId && financialData.client.tableId !== manualClientTableId && financialData.client.detectionLog.includes('CEVA Jundiaí')) {
                  setManualClientTableId(financialData.client.tableId);
              }
          }
      }
    }, [financialData, memoryLoaded, mission]); 


  const handleTollChange = (val: string) => {
      const oldToll = parseNumber(tollInput);
      const newToll = parseNumber(val);
      setTollInput(val);
      setTollSource('MANUAL (Editando...)');
      setTollConfirmed(true);
      if (useSavedValuesRef.current) {
          const currentRev = parseNumber(revenueInput);
          setRevenueInput((currentRev - oldToll + newToll).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
      }
  };

  const handleTollProviderChange = (val: string) => {
      const oldTollProv = parseNumber(tollProviderInput);
      const newTollProv = parseNumber(val);
      setTollProviderInput(val);
      setTollSource('MANUAL (Editando...)');
      setTollConfirmed(true);
      if (useSavedValuesRef.current) {
          const currentCost = parseNumber(costInput);
          setCostInput((currentCost - oldTollProv + newTollProv).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
      }
  };

  const handleManualInput = (setter: any, val: string) => {
      setter(val);
  }

  const handleRecalculateClient = () => {
      setCustomClientBase('');
      setCustomClientKm('');
      setCustomClientHour('');
      setUseSavedValues(false);
      showNotification('Recalculado', 'Valores do cliente restaurados para a tabela original.', 'info');
  };

  const handleRecalculateProvider = () => {
      setCustomProviderBase('');
      setCustomProviderKm('');
      setCustomProviderHour('');
      setUseSavedValues(false);
      showNotification('Recalculado', 'Valores do fornecedor restaurados para a tabela original.', 'info');
  };

  const handleUpdate = async (approve: boolean) => {
      if (!mission) return;
      setIsUpdating(true);
      try {
          const toll = parseNumber(tollInput);
          const tollProv = parseNumber(tollProviderInput);
          const revTotal = parseNumber(revenueInput);
          const costTotal = parseNumber(costInput);

          const revServiceOnly = revTotal - toll; 
          const costServiceOnly = costTotal - tollProv;
          
          const basePayload = {
              revenue_value: revServiceOnly,
              cost_value: costServiceOnly,
              toll_value: toll,
              billing_approved: approve,
              billing_verified_by: JSON.parse(localStorage.getItem('userData') || '{}').name,
              last_update: new Date().toISOString()
          };

          let { error } = await supabase.from('missions').update({ ...basePayload, toll_value_provider: tollProv }).eq('id', mission.id);
          if (error && error.message?.includes('toll_value_provider')) {
              const fallback = await supabase.from('missions').update(basePayload).eq('id', mission.id);
              error = fallback.error;
          }
          if (error) throw error;
          
          if (approve && manualClientTableId) {
              const routeKey = `${mission.client}|${mission.origin}|${mission.destination}`.toUpperCase();
              const details = JSON.stringify({
                  clientTableId: manualClientTableId,
                  providerTableId: manualProviderTableId || null,
                  tollValue: toll,
                  routeKey
              });
              
              await supabase.from('system_logs').delete().eq('entity', 'BillingPattern').ilike('details', `%${routeKey}%`);
              
              await supabase.from('system_logs').insert([{
                  user_name: 'IA_MEMORY',
                  action_type: 'UPDATE',
                  entity: 'BillingPattern',
                  entity_id: mission.id,
                  details: details
              }]);
          }

          showNotification('Sucesso', approve ? 'Faturamento Aprovado e Memória Atualizada!' : 'Ajustes Salvos', 'success');
          
          if (onUpdate) onUpdate();
          onClose();
      } catch (e: any) { alert(e.message); } finally { setIsUpdating(false); }
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
                              if (newTableId) {
                                  setManualClientTableId(newTableId);
                                  showNotification('Atualizado', 'Tabela de preço salva e selecionada.', 'success');
                              }
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
                        <span className="truncate flex-1 min-w-0">{mission.origin}</span>
                        <ArrowRight size={10} className="shrink-0" />
                        <span className="truncate flex-1 min-w-0">{mission.destination}</span>
                    </div>
                </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors ml-4 shrink-0"><X size={24}/></button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50 pb-32">
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
                                                setRevenueInput((financialData.client.total).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
                                                setCostInput((financialData.provider.total).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
                                                setTollInput(toll.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
                                                setTollProviderInput(toll.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
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
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5"><MapPin size={12}/> Dados Operacionais</p>
                                {canEditOpsData && !isEditingOpsData && (
                                    <button onClick={() => setIsEditingOpsData(true)} className="flex items-center gap-1 px-2 py-1 text-[9px] font-black text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 uppercase tracking-wider transition-all" data-testid="button-edit-ops-data"><Edit2 size={10}/> Editar</button>
                                )}
                                {isEditingOpsData && (
                                    <div className="flex gap-2">
                                        <button onClick={() => setIsEditingOpsData(false)} className="px-2 py-1 text-[9px] font-black text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 uppercase tracking-wider">Cancelar</button>
                                        <button onClick={handleSaveOpsData} disabled={isUpdating} className="flex items-center gap-1 px-3 py-1 text-[9px] font-black text-white bg-green-600 rounded-lg hover:bg-green-700 uppercase tracking-wider disabled:opacity-50" data-testid="button-save-ops-data">{isUpdating ? <Loader2 size={10} className="animate-spin"/> : <Save size={10}/>} Salvar</button>
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">Hora Inicial</p>
                                    {isEditingOpsData ? (
                                        <input type="datetime-local" value={editStartTime} onChange={e => setEditStartTime(e.target.value)} className="w-full text-xs font-bold text-gray-700 border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" data-testid="input-start-time" />
                                    ) : (
                                        <p className="text-sm font-bold text-gray-700 font-mono">{mission.startTime ? new Date(mission.startTime).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '---'}</p>
                                    )}
                                </div>
                                <div>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">KM Inicial</p>
                                    {isEditingOpsData ? (
                                        <input type="number" step="0.1" value={editStartKm} onChange={e => setEditStartKm(e.target.value)} placeholder="0" className="w-full text-xs font-bold text-gray-700 border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" data-testid="input-start-km" />
                                    ) : (
                                        <p className="text-sm font-bold text-gray-700 font-mono">{mission.startKm ? `${safeNumber(mission.startKm).toLocaleString('pt-BR')} km` : '---'}</p>
                                    )}
                                </div>
                                <div>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">Hora Final</p>
                                    {isEditingOpsData ? (
                                        <input type="datetime-local" value={editEndTime} onChange={e => setEditEndTime(e.target.value)} className="w-full text-xs font-bold text-gray-700 border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" data-testid="input-end-time" />
                                    ) : (
                                        <p className="text-sm font-bold text-gray-700 font-mono">{mission.endTime ? new Date(mission.endTime).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '---'}</p>
                                    )}
                                </div>
                                <div>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">KM Final</p>
                                    {isEditingOpsData ? (
                                        <input type="number" step="0.1" value={editEndKm} onChange={e => setEditEndKm(e.target.value)} placeholder="0" className="w-full text-xs font-bold text-gray-700 border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" data-testid="input-end-km" />
                                    ) : (
                                        <p className="text-sm font-bold text-gray-700 font-mono">{mission.endKm ? `${safeNumber(mission.endKm).toLocaleString('pt-BR')} km` : '---'}</p>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-dashed border-gray-200">
                                <div className="bg-indigo-50 rounded-lg px-3 py-2">
                                    <p className="text-[9px] font-bold text-indigo-400 uppercase mb-0.5">Duração Total</p>
                                    <p className="text-sm font-black text-indigo-800 font-mono" data-testid="text-total-duration">
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
                                <div className="bg-indigo-50 rounded-lg px-3 py-2">
                                    <p className="text-[9px] font-bold text-indigo-400 uppercase mb-0.5">KM Rodado</p>
                                    <p className="text-sm font-black text-indigo-800 font-mono" data-testid="text-total-km">
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
                                        className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 uppercase outline-none focus:border-blue-500"
                                        value={manualClientTableId || ''}
                                        onChange={(e) => { setManualClientTableId(e.target.value); }}
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

                            <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 grid grid-cols-3 gap-2 mb-4">
                                <div>
                                    <p className="text-[8px] font-black text-gray-400 uppercase">Base (Saída)</p>
                                    <div className="flex items-center gap-1">
                                        <span className="text-[8px] text-gray-400">R$</span>
                                        <input 
                                            type="text" 
                                            className="w-16 bg-transparent border-b border-gray-300 text-sm font-bold text-gray-800 focus:border-blue-500 outline-none"
                                            placeholder={financialData.client.base.toFixed(2)}
                                            value={customClientBase}
                                            onChange={e => handleManualInput(setCustomClientBase, e.target.value)}
                                        />
                                        {customClientBase && <span className="text-[7px] text-blue-600 font-bold bg-blue-50 px-1 rounded uppercase">Ajustado</span>}
                                    </div>
                                </div>
                                <div className="border-l border-gray-200 pl-2">
                                    <p className="text-[8px] font-black text-gray-400 uppercase">Extra KM</p>
                                    <div className="flex flex-col">
                                        <span className={`text-xs font-bold ${financialData.client.extraKmVal > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                            {financialData.client.extraKmVal > 0 ? '+' : ''}{formatCurrency(financialData.client.extraKmVal)}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <span className="text-[8px] text-gray-400">R$</span>
                                            <input 
                                                type="text" 
                                                className="w-16 bg-transparent border-b border-gray-300 text-[9px] font-bold text-gray-600 focus:border-blue-500 outline-none"
                                                placeholder={financialData.client.unitPriceKm.toFixed(2)}
                                                value={customClientKm}
                                                onChange={e => handleManualInput(setCustomClientKm, e.target.value)}
                                            />
                                            {customClientKm && <span className="text-[7px] text-blue-600 font-bold">Ajust</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="border-l border-gray-200 pl-2">
                                    <p className="text-[8px] font-black text-gray-400 uppercase">Extra Hora</p>
                                    <div className="flex flex-col">
                                        <span className={`text-xs font-bold ${financialData.client.extraHrVal > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                            {financialData.client.extraHrVal > 0 ? '+' : ''}{formatCurrency(financialData.client.extraHrVal)}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <span className="text-[8px] text-gray-400">R$</span>
                                            <input 
                                                type="text" 
                                                className="w-16 bg-transparent border-b border-gray-300 text-[9px] font-bold text-gray-600 focus:border-blue-500 outline-none"
                                                placeholder={financialData.client.unitPriceHour.toFixed(2)}
                                                value={customClientHour}
                                                onChange={e => handleManualInput(setCustomClientHour, e.target.value)}
                                            />
                                            {customClientHour && <span className="text-[7px] text-blue-600 font-bold">Ajust</span>}
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>

                        {/* COLUNA CUSTO (FORNECEDOR) */}
                        <div className={`bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col h-full relative ${isZeroCostError ? 'ring-2 ring-red-500' : ''}`}>
                            <h4 className="text-sm font-black text-red-700 uppercase tracking-widest mb-4 flex items-center gap-2">
                                [ {formatProviderName(mission.provider)} ]
                            </h4>

                            <div className="mb-4">
                                <label className={LABEL_CLASS}>Tabela de Custo de Referência</label>
                                <div className="flex gap-2">
                                    <select 
                                        className={`w-full p-2 bg-gray-50 border rounded-lg text-xs font-bold text-gray-700 uppercase outline-none focus:border-red-500 ${isZeroCostError ? 'border-red-300 bg-red-50 text-red-900 animate-pulse' : 'border-gray-200'}`}
                                        value={manualProviderTableId || ''}
                                        onChange={(e) => { setManualProviderTableId(e.target.value); }}
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

                            <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 grid grid-cols-3 gap-2 mb-4">
                                <div>
                                    <p className="text-[8px] font-black text-gray-400 uppercase">Custo Base</p>
                                    <div className="flex items-center gap-1">
                                        <span className="text-[8px] text-gray-400">R$</span>
                                        <input 
                                            type="text" 
                                            className={`w-16 bg-transparent border-b border-gray-300 text-sm font-bold ${financialData.provider.base === 0 && !mission.is_same_os ? 'text-red-500' : 'text-gray-800'} focus:border-red-500 outline-none`}
                                            placeholder={financialData.provider.base.toFixed(2)}
                                            value={customProviderBase}
                                            onChange={e => handleManualInput(setCustomProviderBase, e.target.value)}
                                        />
                                        {customProviderBase && <span className="text-[7px] text-red-600 font-bold bg-red-50 px-1 rounded uppercase">Ajust</span>}
                                    </div>
                                    {financialData.providerMult > 1 && <p className="text-[8px] text-red-500 font-bold font-mono">(Aplicado x{financialData.providerMult})</p>}
                                </div>
                                <div className="border-l border-gray-200 pl-2">
                                    <p className="text-[8px] font-black text-gray-400 uppercase">Custo KM+</p>
                                    <div className="flex flex-col">
                                        <span className={`text-xs font-bold ${financialData.provider.extraKmVal > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                            +{formatCurrency(financialData.provider.extraKmVal)}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <span className="text-[8px] text-gray-400">R$</span>
                                            <input 
                                                type="text" 
                                                className="w-16 bg-transparent border-b border-gray-300 text-[9px] font-bold text-gray-600 focus:border-red-500 outline-none"
                                                placeholder={financialData.provider.unitCostKm.toFixed(2)}
                                                value={customProviderKm}
                                                onChange={e => handleManualInput(setCustomProviderKm, e.target.value)}
                                            />
                                            {customProviderKm && <span className="text-[7px] text-red-600 font-bold">Ajust</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="border-l border-gray-200 pl-2">
                                    <p className="text-[8px] font-black text-gray-400 uppercase">Custo HR+</p>
                                    <div className="flex flex-col">
                                        <span className={`text-xs font-bold ${financialData.provider.extraHrVal > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                            +{formatCurrency(financialData.provider.extraHrVal)}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <span className="text-[8px] text-gray-400">R$</span>
                                            <input 
                                                type="text" 
                                                className="w-16 bg-transparent border-b border-gray-300 text-[9px] font-bold text-gray-600 focus:border-red-500 outline-none"
                                                placeholder={financialData.provider.unitCostHour.toFixed(2)}
                                                value={customProviderHour}
                                                onChange={e => handleManualInput(setCustomProviderHour, e.target.value)}
                                            />
                                            {customProviderHour && <span className="text-[7px] text-red-600 font-bold">Ajust</span>}
                                        </div>
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
                                {tollConfirmed && (
                                    <div className="flex items-center gap-1.5 text-[10px] font-black text-white bg-green-600 px-2 py-1 rounded-lg border border-green-700">
                                        <CheckCircle2 size={12}/> {tollSource || 'CONFIRMADO'}
                                    </div>
                                )}
                                {!tollConfirmed && (
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
                                <div className="relative bg-green-50 border border-green-200 rounded-xl p-3 flex items-center">
                                    <span className="text-sm font-bold text-green-500 mr-2">R$</span>
                                    <input 
                                        type="text" 
                                        className="flex-1 bg-transparent border-none outline-none font-black text-xl text-green-900" 
                                        value={tollInput} 
                                        onChange={e => handleTollChange(e.target.value)} 
                                        data-testid="input-toll-client"
                                    />
                                    <Building2 size={16} className="text-green-300 ml-2" />
                                </div>
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
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-4 bg-green-50 border border-green-100 rounded-xl relative group">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-[10px] font-black text-green-700 uppercase">Valor Final Cliente (Serviço + Pedágio)</label>
                                <button type="button" onClick={handleRecalculateClient} className="flex items-center gap-1 text-[9px] font-bold text-green-700 hover:text-green-900 bg-green-100 hover:bg-green-200 px-2 py-0.5 rounded transition-colors" title="Resetar para o cálculo da tabela">
                                    <RefreshCw size={10} /> Recalcular
                                </button>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] font-bold text-green-600 mb-2 bg-green-100/60 px-2 py-1.5 rounded-lg border border-green-200">
                                <span>{formatCurrency(financialData.client.base)} <span className="text-green-400">(base)</span></span>
                                <span>+ {formatCurrency(financialData.client.extraKmVal)} <span className="text-green-400">(km)</span></span>
                                <span>+ {formatCurrency(financialData.client.extraHrVal)} <span className="text-green-400">(hora)</span></span>
                                <span>+ {formatCurrency(parseNumber(tollInput))} <span className="text-green-400">(pedágio)</span></span>
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-sm font-bold text-green-600">R$</span>
                                <input 
                                    type="text" 
                                    inputMode="decimal"
                                    className={`w-full bg-white/60 border border-green-200 rounded-lg px-2 py-1 outline-none font-black text-3xl text-green-900 font-mono focus:ring-2 focus:ring-green-400 focus:border-green-400 ${!canEditOpsData ? 'pointer-events-none opacity-70' : 'cursor-text'}`}
                                    value={revenueInput} 
                                    onChange={e => { if (canEditOpsData) { setUseSavedValues(true); setRevenueInput(e.target.value); } }}
                                    readOnly={!canEditOpsData}
                                    data-testid="input-revenue-total"
                                />
                            </div>
                            <p className="text-[8px] text-green-600 font-bold mt-1 italic">{canEditOpsData ? '* EDITÁVEL - DIRETORIA / ADMINISTRADOR (toque para editar)' : '* VALOR TOTAL CALCULADO BASEADO NAS FRANQUIAS E MEDIÇÃO'}</p>
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

                        <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl relative group">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-[10px] font-black text-blue-700 uppercase">Pagamento Fornecedor (Tabela + Pedágio)</label>
                                <button type="button" onClick={handleRecalculateProvider} className="flex items-center gap-1 text-[9px] font-bold text-blue-700 hover:text-blue-900 bg-blue-100 hover:bg-blue-200 px-2 py-0.5 rounded transition-colors" title="Resetar para o cálculo da tabela">
                                    <RefreshCw size={10} /> Recalcular
                                </button>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] font-bold text-blue-600 mb-2 bg-blue-100/60 px-2 py-1.5 rounded-lg border border-blue-200">
                                <span>{formatCurrency(financialData.provider.base)} <span className="text-blue-400">(base)</span></span>
                                <span>+ {formatCurrency(financialData.provider.extraKmVal)} <span className="text-blue-400">(km)</span></span>
                                <span>+ {formatCurrency(financialData.provider.extraHrVal)} <span className="text-blue-400">(hora)</span></span>
                                <span>+ {formatCurrency(parseNumber(tollProviderInput))} <span className="text-blue-400">(pedágio)</span></span>
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-sm font-bold text-blue-600">R$</span>
                                <input 
                                    type="text" 
                                    inputMode="decimal"
                                    className={`w-full bg-white/60 border border-blue-200 rounded-lg px-2 py-1 outline-none font-black text-3xl text-blue-900 font-mono focus:ring-2 focus:ring-blue-400 focus:border-blue-400 ${!canEditOpsData ? 'pointer-events-none opacity-70' : 'cursor-text'}`}
                                    value={costInput} 
                                    onChange={e => { if (canEditOpsData) { setUseSavedValues(true); setCostInput(e.target.value); } }}
                                    readOnly={!canEditOpsData}
                                    data-testid="input-cost-total"
                                />
                            </div>
                            <p className="text-[8px] text-blue-600 font-bold mt-1 italic">{canEditOpsData ? '* EDITÁVEL - DIRETORIA / ADMINISTRADOR (toque para editar)' : ''}</p>
                        </div>
                    </div>

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
                            </div>
                            <div className="flex gap-3 w-full md:w-auto shrink-0">
                                <button onClick={() => handleUpdate(false)} disabled={isUpdating} className="px-6 py-3 bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95 h-12">
                                    {isUpdating ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salvar Ajustes
                                </button>
                                <button onClick={() => handleUpdate(true)} disabled={isUpdating || isZeroCostError || !tollConfirmed} className={`px-8 py-3 rounded-xl font-black uppercase text-xs shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 h-12 ${(isZeroCostError || !tollConfirmed) ? 'bg-gray-400 cursor-not-allowed text-gray-200' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200'}`}>
                                    {isUpdating ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} {!tollConfirmed ? 'Confirme o Pedágio' : 'Finalizar & Aprovar Faturamento'}
                                </button>
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
