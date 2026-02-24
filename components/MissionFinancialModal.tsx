
import React, { useState, useEffect, useMemo } from 'react';
import { Mission, ClientPriceTable, ProviderCostTable, MissionStatus } from '../types';
import { supabase } from '../lib/supabase';
import { useNotification } from '../lib/NotificationContext';
import { calculateMissionFinancials } from '../lib/financialUtils';
import { X, Calculator, Loader2, Save, CheckCircle2, TrendingUp, Landmark, Zap, RotateCcw, Building2, Briefcase, Plus, Users, MapPin, ArrowRight, BrainCircuit, AlertTriangle, AlertCircle, Edit2, Info, RefreshCw } from 'lucide-react';
import ProviderCostForm from './ProviderCostForm';
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
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [revenueInput, setRevenueInput] = useState('');
  const [costInput, setCostInput] = useState('');
  const [tollInput, setTollInput] = useState('');
  
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
  const [memoryLoaded, setMemoryLoaded] = useState(false);
  
  // Flag para indicar que os dados vieram do banco e não do cálculo
  const [isLoadedFromDB, setIsLoadedFromDB] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000); 
    return () => clearInterval(timer);
  }, []);

  // Busca Inteligente de Padrões (Memória Evolutiva)
  const fetchHistoricalPatterns = async (currentMission: Mission) => {
      if (!currentMission.client || !currentMission.origin) return;
      try {
          // PROTOCOLO DE VALIDAÇÃO DE NULIDADE:
          // Se o valor já existe no objeto (vido do banco), respeita ele ABSOLUTAMENTE.
          if (currentMission.toll_value !== null && currentMission.toll_value !== undefined) {
             setSuggestedToll(currentMission.toll_value);
             if (currentMission.toll_value === 0) {
                 setTollSource('VALOR SALVO (R$ 0,00)');
             } else {
                 setTollSource('VALOR GRAVADO');
             }
             setTollInput(currentMission.toll_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
             return; 
          }

          // 1. Busca Pedágio Exato da Rota (Alta Prioridade)
          const { data: exactRoute } = await supabase
            .from('missions')
            .select('toll_value, id, updated_by')
            .eq('client', currentMission.client)
            .eq('origin', currentMission.origin)
            .eq('destination', currentMission.destination)
            .neq('id', currentMission.id)
            .order('last_update', { ascending: false })
            .limit(1)
            .maybeSingle();

          let avgToll = 0;
          let sourceLabel = '';
          let confidence = 0;
          let isManualFromOther = false;

          if (exactRoute && exactRoute.toll_value !== null) {
              avgToll = exactRoute.toll_value;
              sourceLabel = 'PEDÁGIO INSERIDO MANUAL EM OUTRA OS';
              confidence = 100;
              isManualFromOther = true;
          } else {
              // 2. Busca Média Regional
              const { data: history } = await supabase
                .from('missions')
                .select('toll_value')
                .eq('client', currentMission.client)
                .eq('billing_approved', true)
                .gt('toll_value', 0)
                .limit(50);
              
              if (history && history.length > 0) {
                  const totalToll = history.reduce((acc, h) => acc + (h.toll_value || 0), 0);
                  avgToll = totalToll / history.length;
                  sourceLabel = 'MÉDIA REGIONAL';
                  confidence = Math.min(80, (history.length * 2));
              }
          }

          setSuggestedToll(avgToll);
          setTollSource(sourceLabel);
          setTollInput(avgToll.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
          
          if (isManualFromOther) {
               showNotification('Memória de Rota', `Valor herdado de ajuste manual anterior: R$ ${avgToll.toFixed(2)}`, 'info');
          } else if (avgToll > 0) {
               showNotification('IA Logística', `Pedágio estimado: ${sourceLabel}`, 'info');
          }

          setAiMaturity(confidence);

          // 2. Busca Memória de Tabela (Pattern Matching no Logs)
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
                 setMemoryLoaded(true);
             } catch (e) { console.error("Erro ao ler memória:", e); }
          }
          
      } catch (e) { console.error("Erro na IA de Padrões:", e); }
  };

  const loadData = async () => {
      if (!initialMission?.id) return;
      setIsLoading(true);
      try {
          const [mRes, ctRes, ptRes] = await Promise.all([
              supabase.from('missions').select('*').eq('id', initialMission.id).single(),
              supabase.from('client_price_tables').select('*').eq('client', initialMission.originalClientName || initialMission.client),
              supabase.from('provider_cost_tables').select('*')
          ]);
          
          if (mRes.data) {
              const fullMission = { ...initialMission, ...mRes.data };
              setMission(fullMission);
              
              const dbToll = mRes.data.toll_value !== null ? mRes.data.toll_value : 0;
              setTollInput(dbToll.toLocaleString('pt-BR', {minimumFractionDigits: 2}));
              
              // Se já existem valores salvos e a missão foi aprovada, carrega como verdade absoluta
              // Se tiver revenue_value > 0 mesmo sem aprovação, também carregamos para não perder trabalho em progresso
              if ((mRes.data.revenue_value && mRes.data.revenue_value > 0) || (mRes.data.cost_value && mRes.data.cost_value > 0)) {
                  // O input deve exibir o TOTAL (Serviço + Pedágio)
                  const savedTotalRev = (mRes.data.revenue_value || 0) + dbToll;
                  const savedTotalCost = (mRes.data.cost_value || 0) + dbToll;
                  
                  setRevenueInput(savedTotalRev.toLocaleString('pt-BR', {minimumFractionDigits: 2}));
                  setCostInput(savedTotalCost.toLocaleString('pt-BR', {minimumFractionDigits: 2}));
                  setIsLoadedFromDB(true);
              } else {
                  setIsLoadedFromDB(false);
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

  useEffect(() => { if (isOpen) loadData(); }, [isOpen]);

  const financialData = useMemo(() => {
      if (!mission) return null;
      const currentToll = parseNumber(tollInput);
      const missionWithToll = { ...mission, toll_value: currentToll };

      return calculateMissionFinancials(missionWithToll, clientTables, providerTables, undefined, currentTime, {
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
  }, [mission, clientTables, providerTables, currentTime, manualClientTableId, manualProviderTableId, iblEnabled, tollInput, customProviderKm, customProviderHour, customClientKm, customClientHour, customClientBase, customProviderBase]);

  useEffect(() => {
      if (financialData && mission) {
          // Se os dados NÃO foram carregados do banco (é um novo cálculo), atualiza os inputs com a projeção
          if (!isLoadedFromDB) {
              setRevenueInput(financialData.client.total.toLocaleString('pt-BR', {minimumFractionDigits: 2}));
              setCostInput(financialData.provider.total.toLocaleString('pt-BR', {minimumFractionDigits: 2}));
          }
          
          if (!manualProviderTableId && financialData.provider.tableId && !memoryLoaded) {
              setManualProviderTableId(financialData.provider.tableId);
          }
          if (!manualClientTableId && financialData.client.tableId && !memoryLoaded) {
              setManualClientTableId(financialData.client.tableId);
          }
      }
  }, [financialData, memoryLoaded, isLoadedFromDB]); 

  // CORREÇÃO AUTOMÁTICA DE CONSISTÊNCIA removida para inputs manuais, mas mantemos
  // a lógica de que se o usuário mudar algo, isLoadedFromDB vira false.

  const handleTollChange = (val: string) => {
      setTollInput(val);
      setTollSource('MANUAL (Editando...)');
      setIsLoadedFromDB(false);
  };

  const handleManualInput = (setter: any, val: string) => {
      setter(val);
      setIsLoadedFromDB(false);
  }

  const handleRecalculateClient = () => {
      setCustomClientBase('');
      setCustomClientKm('');
      setCustomClientHour('');
      setIsLoadedFromDB(false); 
      showNotification('Recalculado', 'Valores do cliente restaurados para a tabela original.', 'info');
  };

  const handleRecalculateProvider = () => {
      setCustomProviderBase('');
      setCustomProviderKm('');
      setCustomProviderHour('');
      setIsLoadedFromDB(false);
      showNotification('Recalculado', 'Valores do fornecedor restaurados para a tabela original.', 'info');
  };

  const handleUpdate = async (approve: boolean) => {
      if (!mission) return;
      setIsUpdating(true);
      try {
          const toll = parseNumber(tollInput);
          const revTotal = parseNumber(revenueInput);
          const costTotal = parseNumber(costInput);

          // CORREÇÃO: Ao salvar, o valor_recebido/valor_pago no banco deve ser APENAS o serviço.
          // O total que o usuário vê é (Serviço + Pedágio).
          const revServiceOnly = revTotal - toll; 
          const costServiceOnly = costTotal - toll;
          
          const payload = {
              revenue_value: revServiceOnly,
              cost_value: costServiceOnly,
              toll_value: toll,
              billing_approved: approve,
              billing_verified_by: JSON.parse(localStorage.getItem('userData') || '{}').name,
              last_update: new Date().toISOString()
          };
          
          const { error } = await supabase.from('missions').update(payload).eq('id', mission.id);
          if (error) throw error;
          
          // MEMÓRIA EVOLUTIVA
          if (approve && manualClientTableId) {
              const routeKey = `${mission.client}|${mission.origin}|${mission.destination}`.toUpperCase();
              const details = JSON.stringify({
                  clientTableId: manualClientTableId,
                  providerTableId: manualProviderTableId || null,
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
  
  const isInheritedToll = tollSource === 'PEDÁGIO INSERIDO MANUAL EM OUTRA OS';
  const isSavedZero = tollSource === 'VALOR SALVO (R$ 0,00)';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      
      {isAddCostModalOpen && (
          <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in zoom-in-95">
              <div className="bg-white rounded-2xl w-full max-w-3xl p-6 relative shadow-2xl border-2 border-red-100">
                  <div className="flex justify-between items-center mb-6 border-b pb-4">
                      <h3 className="font-black text-lg text-red-700 uppercase flex items-center gap-2">
                          <Zap size={20} /> Cadastro de Tabela Rápido
                      </h3>
                      <button onClick={() => setIsAddCostModalOpen(false)} className="p-2 bg-gray-100 rounded-full hover:bg-red-50 text-gray-500 hover:text-red-500 transition-colors">
                          <X size={20}/>
                      </button>
                  </div>
                  <ProviderCostForm 
                      onBack={() => setIsAddCostModalOpen(false)} 
                      onSuccess={handleNewCostTableSuccess}
                      fixedProviderName={mission.provider} 
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
                    
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-wrap gap-6 items-center justify-between">
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
                                 {formatCurrency(financialData.tollValue)}
                             </p>
                             <span className="text-[8px] text-gray-400 font-bold uppercase mt-1 block">{tollSource}</span>
                        </div>
                        <div className="flex-1 min-w-[120px] text-right">
                             <p className={LABEL_CLASS}>Status da OS</p>
                             <p className="text-lg font-bold text-gray-600 uppercase">{mission.status}</p>
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
                                <select 
                                    className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 uppercase outline-none focus:border-blue-500"
                                    value={manualClientTableId || ''}
                                    onChange={(e) => { setManualClientTableId(e.target.value); setIsLoadedFromDB(false); }}
                                >
                                    <option value="">Automático (IA Detectando)</option>
                                    {clientTables.map(t => (
                                        <option key={t.id} value={t.id}>{t.operation_type}</option>
                                    ))}
                                </select>
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

                            <div className="mt-auto">
                                <div className="p-4 bg-green-50 border border-green-100 rounded-xl relative group">
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-[10px] font-black text-green-700 uppercase">Valor Final (Serviço + Pedágio)</label>
                                        <button type="button" onClick={handleRecalculateClient} className="flex items-center gap-1 text-[9px] font-bold text-green-700 hover:text-green-900 bg-green-100 hover:bg-green-200 px-2 py-0.5 rounded transition-colors" title="Resetar para o cálculo da tabela">
                                            <RefreshCw size={10} /> Recalcular
                                        </button>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-sm font-bold text-green-600">R$</span>
                                        <input 
                                            type="text" 
                                            className="w-full bg-transparent border-none outline-none font-black text-3xl text-green-900 font-mono" 
                                            value={revenueInput} 
                                            onChange={e => { setRevenueInput(e.target.value); setIsLoadedFromDB(false); }} 
                                        />
                                    </div>
                                    {isLoadedFromDB ? (
                                        <p className="text-[8px] text-green-600 font-bold mt-1 uppercase flex items-center gap-1"><CheckCircle2 size={8}/> Valor Salvo</p>
                                    ) : (
                                        <p className="text-[8px] text-green-600 font-bold mt-1 italic">* VALOR TOTAL CALCULADO BASEADO NAS FRANQUIAS E MEDIÇÃO</p>
                                    )}
                                </div>

                                <div className="mt-3 flex items-center justify-between px-2">
                                    <label className="text-[10px] font-black text-blue-700 uppercase">Taxa IBL (12%):</label>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-blue-600">{financialData.iblFee > 0 ? formatCurrency(financialData.iblFee) : '---'}</span>
                                        <button 
                                            onClick={() => { setIblEnabled(!iblEnabled); setIsLoadedFromDB(false); }} 
                                            className={`w-8 h-4 rounded-full transition-colors relative ${iblEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                                        >
                                            <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${iblEnabled ? 'translate-x-4' : ''}`}></div>
                                        </button>
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
                                        onChange={(e) => { setManualProviderTableId(e.target.value); setIsLoadedFromDB(false); }}
                                        disabled={mission.is_same_os}
                                    >
                                        <option value="">{mission.is_same_os ? 'Custo Zero (Mesma OS)' : 'IA Detectando Melhor Custo...'}</option>
                                        {!mission.is_same_os && filteredProviderTables.map(t => (
                                            <option key={t.id} value={t.id}>{t.operation_type}</option>
                                        ))}
                                    </select>
                                    {!mission.is_same_os && (
                                        <button 
                                            onClick={() => setIsAddCostModalOpen(true)}
                                            className="p-2 bg-slate-900 text-white rounded-lg hover:bg-black transition-all shadow-md active:scale-95"
                                            title="Cadastrar Nova Tabela"
                                        >
                                            <Plus size={14}/>
                                        </button>
                                    )}
                                </div>
                                {/* LOG DE DETECÇÃO DA IA */}
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

                            <div className="mt-auto">
                                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl relative group">
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-[10px] font-black text-blue-700 uppercase">Pagamento Fornecedor (Tabela + Pedágio)</label>
                                        <button type="button" onClick={handleRecalculateProvider} className="flex items-center gap-1 text-[9px] font-bold text-blue-700 hover:text-blue-900 bg-blue-100 hover:bg-blue-200 px-2 py-0.5 rounded transition-colors" title="Resetar para o cálculo da tabela">
                                            <RefreshCw size={10} /> Recalcular
                                        </button>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-sm font-bold text-blue-600">R$</span>
                                        <input 
                                            type="text" 
                                            className="w-full bg-transparent border-none outline-none font-black text-3xl text-blue-900 font-mono" 
                                            value={costInput} 
                                            onChange={e => { setCostInput(e.target.value); setIsLoadedFromDB(false); }} 
                                        />
                                        {isLoadedFromDB && <span className="text-[9px] bg-white border border-blue-200 text-blue-600 px-1 rounded uppercase font-bold">Ajustado</span>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-inner">
                        <div className="flex justify-between items-center mb-1.5">
                            <label className={LABEL_CLASS}>Pedágio / Despesas de Rota</label>
                            {aiMaturity > 0 && (
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Confiança IA: {aiMaturity}%</span>
                                    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-500" style={{ width: `${aiMaturity}%` }}></div>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        <div className="relative bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center">
                            <span className="text-sm font-bold text-slate-400 mr-2">R$</span>
                            <input 
                                type="text" 
                                className="flex-1 bg-transparent border-none outline-none font-black text-xl text-slate-800" 
                                value={tollInput} 
                                onChange={e => handleTollChange(e.target.value)} 
                            />
                            <Landmark size={20} className="text-gray-300 ml-2" />
                            
                            {/* ESTADO DO PEDÁGIO: AVISOS CRÍTICOS */}
                            {tollSource === 'VALOR SALVO (R$ 0,00)' && (
                                <div className="flex items-center gap-1.5 text-[10px] font-black text-white bg-green-600 px-2 py-1 rounded-lg border border-green-700 ml-2">
                                    <CheckCircle2 size={12}/> {tollSource}
                                </div>
                            )}
                            
                            {isInheritedToll && (
                                <div className="flex items-center gap-1.5 text-[10px] font-black text-red-700 bg-red-50 px-2 py-1 rounded-lg border border-red-200 ml-2 animate-pulse">
                                    <BrainCircuit size={12} className="fill-current"/> {tollSource}
                                </div>
                            )}

                            {!isInheritedToll && !isSavedZero && tollSource && (
                                <div className="flex items-center gap-1.5 text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100 ml-2">
                                    <BrainCircuit size={12} className="fill-current"/> {tollSource}
                                </div>
                            )}

                            <div className="flex items-center gap-1.5 text-[10px] font-black text-orange-600 bg-orange-50 px-2 py-1 rounded-lg border border-orange-100 ml-2">
                                <Zap size={12} className="fill-current"/> SOMA AUTOMÁTICA
                            </div>
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
                                <button onClick={() => handleUpdate(true)} disabled={isUpdating || isZeroCostError} className={`px-8 py-3 rounded-xl font-black uppercase text-xs shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 h-12 ${isZeroCostError ? 'bg-gray-400 cursor-not-allowed text-gray-200' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200'}`}>
                                    {isUpdating ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Finalizar & Aprovar Faturamento
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
