
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Save, MapPin, Flag, FileText, Building2, Ruler, Loader2, Plus, X, Navigation, Calendar, ShieldCheck, DollarSign, Calculator, Briefcase, TrendingUp, TrendingDown, ArrowRight, Check, ChevronDown, Package, Info, Siren, Clock, Tag, Layers, Truck, Search, User, Phone, AlertCircle, CheckCircle2, Zap, Shield, ShieldAlert, Paperclip, Image, Trash2, Clipboard } from 'lucide-react';
import { MissionStatus, Client, ClientRoute, ClientPriceTable, ProviderData, ProviderCostTable, ClientVehicleDB } from '../types';
import { supabase } from '../lib/supabase';
import { logAction } from '../lib/logger';
import { useNotification } from '../lib/NotificationContext';

// Importação dos formulários para modo modal
import ClientForm from './ClientForm';
import ProviderForm from './ProviderForm';
import ClientRouteForm from './ClientRouteForm';
import ClientVehicleForm from './ClientVehicleForm';
import { formatProviderName } from '../lib/utils';
import { extractUF, UF_TO_REGION } from '../lib/financialUtils';

const INPUT_CLASS = "w-full bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-red-500/10 focus:border-red-500 text-sm h-11 transition-all text-gray-700 pl-12 pr-4";
const LABEL_CLASS = "text-[10px] font-black text-gray-400 uppercase mb-1.5 block tracking-widest";
const SELECT_CLASS = "w-full bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-red-500/10 focus:border-red-500 text-sm h-11 transition-all text-gray-700 pl-12 pr-10 appearance-none cursor-pointer";
const DROPDOWN_ITEM_CLASS = "w-full text-left p-3 text-[11px] font-bold hover:bg-red-50 border-b border-gray-50 uppercase text-gray-700 transition-colors flex items-center gap-2";

const CITY_MAP: Record<string, { uf: string, region: string }> = {
    'BRASILIA': { uf: 'DF', region: 'CENTRO-OESTE' },
    'GOIANIA': { uf: 'GO', region: 'CENTRO-OESTE' },
    'APARECIDA DE GOIANIA': { uf: 'GO', region: 'CENTRO-OESTE' },
    'CUIABA': { uf: 'MT', region: 'CENTRO-OESTE' },
    'CAMPO GRANDE': { uf: 'MS', region: 'CENTRO-OESTE' },
    'ANAPOLIS': { uf: 'GO', region: 'CENTRO-OESTE' },
    'SINOP': { uf: 'MT', region: 'CENTRO-OESTE' },
    'RONDONOPOLIS': { uf: 'MT', region: 'CENTRO-OESTE' },
    'JUNDIAI': { uf: 'SP', region: 'SUDESTE' },
    'CAMPINAS': { uf: 'SP', region: 'SUDESTE' },
    'CAJAMAR': { uf: 'SP', region: 'SUDESTE' },
    'SANTOS': { uf: 'SP', region: 'SUDESTE' },
    'GUARULHOS': { uf: 'SP', region: 'SUDESTE' },
    'SAO PAULO': { uf: 'SP', region: 'SUDESTE' },
    'RIO DE JANEIRO': { uf: 'RJ', region: 'SUDESTE' },
    'DUQUE DE CAXIAS': { uf: 'RJ', region: 'SUDESTE' },
    'BETIM': { uf: 'MG', region: 'SUDESTE' },
    'CONTAGEM': { uf: 'MG', region: 'SUDESTE' },
    'PALHOCA': { uf: 'SC', region: 'SUL' },
    'FLORIANOPOLIS': { uf: 'SC', region: 'SUL' },
    'ITAJAI': { uf: 'SC', region: 'SUL' },
    'CURITIBA': { uf: 'PR', region: 'SUL' },
    'PORTO ALEGRE': { uf: 'RS', region: 'SUL' }
};

const normalizeStr = (str: string) => (str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

interface MissionFormProps {
  onBack: () => void;
  onSaveAndContinue: (missionId: string) => void;
  onAddClient: () => void;
}

const MissionForm: React.FC<MissionFormProps> = ({ onBack, onSaveAndContinue }) => {
  const { showNotification } = useNotification();
  const [osId, setOsId] = useState("GTM-....");
  const [canViewFinancials, setCanViewFinancials] = useState(false);
  
  const now = new Date();
  const defaultDate = now.toLocaleDateString('en-CA'); 
  const defaultTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const [formData, setFormData] = useState({
    client: '', provider: '', origin: '', destination: '', totalDistance: '', estimatedTime: '',
    scheduledDate: defaultDate, scheduledTime: defaultTime, missionType: 'Caracterizada', 
    revenueValue: '', costValue: '', tollValue: '0', applyCeva200km: false, applyVtc02h: false, isSameOs: false, parentMissionId: '',
    clientVehicleId: '', clientVehiclePlate: '', clientVehicleModel: '',
    clientVehicleId2: '', clientVehiclePlate2: '', clientVehicleModel2: '',
    driver_name: '', driver_phone: '', startKm: '',
    driver_name_2: '', driver_phone_2: ''
  });
  
  const [isSaving, setIsSaving] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calcDetails, setCalcDetails] = useState('');
  const [dbClients, setDbClients] = useState<Client[]>([]);
  const [dbProviders, setDbProviders] = useState<ProviderData[]>([]);
  const [dbClientVehicles, setDbClientVehicles] = useState<ClientVehicleDB[]>([]);
  const [dbPastDrivers, setDbPastDrivers] = useState<{name: string, phone: string}[]>([]);
  const [clientRoutes, setClientRoutes] = useState<ClientRoute[]>([]);
  const [clientPriceTables, setClientPriceTables] = useState<ClientPriceTable[]>([]);
  const [providerCostTables, setProviderCostTables] = useState<ProviderCostTable[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [manualRevenueTableId, setManualRevenueTableId] = useState('');
  const [manualCostTableId, setManualCostTableId] = useState('');
  const [routeSearchTerm, setRouteSearchTerm] = useState('');
  const [vehicleSearchTerm, setVehicleSearchTerm] = useState('');
  const [vehicleSearchTerm2, setVehicleSearchTerm2] = useState('');
  const [driverSearchTerm, setDriverSearchTerm] = useState('');
  const [showSecondVehicle, setShowSecondVehicle] = useState(false);
  
  // Provider Search
  const [providerSearchTerm, setProviderSearchTerm] = useState('');
  
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isProviderModalOpen, setIsProviderModalOpen] = useState(false);
  const [isRouteModalOpen, setIsRouteModalOpen] = useState(false);
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [parentOsSuggestions, setParentOsSuggestions] = useState<{id: string, client: string, provider: string, origin: string, destination: string, start_time: string, status: string}[]>([]);
  const [parentOsSearch, setParentOsSearch] = useState('');
  const [showParentOsDropdown, setShowParentOsDropdown] = useState(false);

  const [evidenceFiles, setEvidenceFiles] = useState<{ file: File; preview: string }[]>([]);
  const [expandedEvidence, setExpandedEvidence] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inteligência de Software: Restrição IBL/Sorocaba
  const [iblWarning, setIblWarning] = useState('');

  useEffect(() => {
    const storedUser = localStorage.getItem('userData');
    if (storedUser) {
        try {
            const user = JSON.parse(storedUser);
            const role = (user.role || "").toLowerCase();
            const allowed = ['diretoria', 'administrador'].includes(role) || (user.permissions && user.permissions.includes('*'));
            setCanViewFinancials(allowed);
        } catch (e) { console.error(e); }
    }
    generateId();
    loadBasicData();
    fetchPastDrivers();

    const handleClickOutside = (event: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
            setActiveDropdown(null);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);

    const handlePaste = (e: ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
                const file = items[i].getAsFile();
                if (file) {
                    const preview = URL.createObjectURL(file);
                    setEvidenceFiles(prev => [...prev, { file, preview }]);
                }
                break;
            }
        }
    };
    document.addEventListener('paste', handlePaste);

    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('paste', handlePaste);
    };
  }, []);

  useEffect(() => {
    if (!formData.isSameOs || !formData.client) { setParentOsSuggestions([]); return; }
    const fetchSuggestions = async () => {
      let query = supabase.from('missions').select('id, client, provider, origin, destination, start_time, status, parent_mission_id')
        .eq('client', formData.client).is('parent_mission_id', null).order('created_at', { ascending: false }).limit(50);
      if (formData.provider) query = query.eq('provider', formData.provider);
      const { data } = await query;
      if (data) setParentOsSuggestions(data);
    };
    fetchSuggestions();
  }, [formData.isSameOs, formData.client, formData.provider]);

  const handleEvidenceFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      Array.from(files).forEach(file => {
          if (file.type.startsWith('image/')) {
              const preview = URL.createObjectURL(file);
              setEvidenceFiles(prev => [...prev, { file, preview }]);
          }
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeEvidence = (index: number) => {
      setEvidenceFiles(prev => {
          URL.revokeObjectURL(prev[index].preview);
          return prev.filter((_, i) => i !== index);
      });
  };

  const uploadEvidences = async (missionId: string) => {
      if (evidenceFiles.length === 0) return;
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      for (let i = 0; i < evidenceFiles.length; i++) {
          const { file } = evidenceFiles[i];
          const ext = file.name.split('.').pop() || 'png';
          const filePath = `${missionId}/${Date.now()}_${i}.${ext}`;
          const { error: uploadError } = await supabase.storage.from('mission-evidence').upload(filePath, file, { contentType: file.type, upsert: false });
          if (uploadError) {
              if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('not found')) {
                  console.error('Bucket mission-evidence não existe. Crie no painel Supabase.');
              } else {
                  console.error('Erro upload evidência:', uploadError.message);
              }
              continue;
          }
          const { data: urlData } = supabase.storage.from('mission-evidence').getPublicUrl(filePath);
          await supabase.from('system_logs').insert({
              entity: 'MissionEvidence',
              entity_id: missionId,
              action_type: 'evidence_upload',
              details: JSON.stringify({
                  fileName: file.name,
                  filePath,
                  publicUrl: urlData?.publicUrl || '',
                  uploadedBy: userData.name || 'Sistema',
                  uploadedAt: new Date().toISOString(),
                  context: 'Criação da OS - Evidência de solicitação do cliente'
              }),
              created_at: new Date().toISOString()
          });
      }
  };

  // Inteligência: Monitorar Cliente IBL e Origem Sorocaba
  useEffect(() => {
      const clientName = (formData.client || '').toUpperCase();
      const originName = (formData.origin || '').toUpperCase();

      if (clientName.includes('IBL') && originName.includes('SOROCABA')) {
          setIblWarning('ALERTA DE PROTOCOLO: OPERAÇÕES IBL EM SOROCABA SÓ PERMITEM OS FORNECEDORES: CTS OU MACOR.');
      } else {
          setIblWarning('');
      }
  }, [formData.client, formData.origin]);

  const loadBasicData = async () => {
    // ALTERAÇÃO: Carregar fornecedores que NÃO ESTEJAM BLOQUEADOS (ao invés de apenas 'Ativo')
    // Isso permite que fornecedores com 'Alvará Vencido' apareçam na lista para seleção
    const [clientsRes, providersRes] = await Promise.all([
         supabase.from('clients').select('id, name, trading_name').eq('status', 'Ativo').order('trading_name', { ascending: true }),
         supabase.from('providers').select('id, name, trading_name').neq('status', 'Bloqueado').order('name', { ascending: true })
    ]);
    if (clientsRes.data) setDbClients(clientsRes.data as any);
    if (providersRes.data) setDbProviders(providersRes.data as any);
  };

  const fetchPastDrivers = async () => {
      try {
          const { data } = await supabase.from('missions').select('driver_name, driver_phone').not('driver_name', 'is', null).order('created_at', { ascending: false }).limit(200);
          if (data) {
              const unique = Array.from(new Set(data.map(d => (d.driver_name as string)?.toUpperCase().trim())))
                .map(name => {
                    const found = data.find(d => (d.driver_name as string)?.toUpperCase().trim() === name);
                    return { name: (name as string) || '', phone: (found?.driver_phone as string) || '' };
                }).filter(d => d.name !== '');
              setDbPastDrivers(unique);
          }
      } catch (e) { console.error(e); }
  };

  const fetchClientVehicles = async (clientName: string) => {
      try {
          const { data: clientObj } = await supabase.from('clients').select('id').eq('name', clientName).maybeSingle();
          if (clientObj) {
              const { data: vehicles } = await supabase.from('client_vehicles').select('*').eq('client_id', clientObj.id).order('plate');
              if (vehicles) setDbClientVehicles(vehicles as any);
          }
      } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (formData.client) {
        supabase.from('client_routes').select('*').eq('client', formData.client).order('name').then(({ data }) => { if (data) setClientRoutes(data as any); });
        supabase.from('client_price_tables').select('*').eq('client', formData.client).order('operation_type').then(({ data }) => { if (data) setClientPriceTables(data as any); });
        fetchClientVehicles(formData.client);
    } else { setClientRoutes([]); setClientPriceTables([]); setDbClientVehicles([]); }
  }, [formData.client]);

  useEffect(() => {
      if (formData.provider) {
          supabase.from('provider_cost_tables').select('*').eq('provider', formData.provider).order('operation_type').then(({ data }) => { if (data) setProviderCostTables(data as any); });
      } else { setProviderCostTables([]); }
  }, [formData.provider]);

  const generateId = async () => {
      const { data } = await supabase.from('missions').select('id').order('created_at', { ascending: false }).limit(300);
      let maxNum = 0;
      if (data) {
          data.forEach(m => {
              const parts = m.id.split('-');
              if (parts.length > 1) {
                  const num = parseInt(parts[1]);
                  if (!isNaN(num) && num > maxNum) maxNum = num;
              }
          });
      }
      const nextNum = maxNum + 1;
      const generated = `GTM-${nextNum.toString().padStart(4, '0')}`;
      setOsId(generated);
      return generated;
  };

  const findBestTable = (tables: any[], dist: number, locationKeywords: string[], clientRuleKeyword?: string, providerName?: string, originAddress?: string) => {
      if (!tables || tables.length === 0) return null;
      const normalizedTables = tables.map(t => ({ ...t, normOp: normalizeStr(t.operation_type || '') }));

      if (clientRuleKeyword) {
          const ruleMatch = normalizedTables.find(t => t.normOp.includes(normalizeStr(clientRuleKeyword)));
          if (ruleMatch) return { table: ruleMatch, reason: `REGRA PRIORITÁRIA: ${clientRuleKeyword}` };
      }

      const providerUpper = normalizeStr(providerName || '');
      const isSpecialProvider = providerUpper.includes('ATIVA') || providerUpper.includes('TM SEG') || providerUpper.includes('TMSEG');

      const originUF = extractUF(originAddress || '') || locationKeywords[1] || '';
      const originRegion = UF_TO_REGION[originUF] || locationKeywords[2] || '';
      const originCity = locationKeywords[0] || '';

      const scored = normalizedTables.map(t => {
          let score = 0;
          let reason = 'GENÉRICO';

          if (isSpecialProvider) {
              const isNivelBrasil = t.normOp.includes('NIVEL BRASIL') || t.normOp.includes('ARMADO') || t.normOp.includes('ARMADOS');
              if (!isNivelBrasil) {
                  score -= 1000;
              }
          }

          if (originCity.length > 3 && t.normOp.includes(originCity)) {
              score += 3000;
              reason = `CIDADE: ${originCity}`;
          }

          if (t.normOp.includes('EXCETO')) {
              if (originUF === 'MG' && t.normOp.includes('EXCETO MG')) { score -= 5000; reason = 'BLOQUEADO (EXCETO MG)'; }
              if (originUF === 'ES' && t.normOp.includes('EXCETO') && t.normOp.includes('ES')) { score -= 5000; reason = 'BLOQUEADO (EXCETO ES)'; }
          }

          if (originUF && (originUF === 'MG' || originUF === 'ES')) {
              if (t.normOp.includes('MG') && t.normOp.includes('ES') && !t.normOp.includes('EXCETO')) {
                  score += 2000;
                  reason = `UF ESPECÍFICO: ${originUF}`;
              }
          }

          if (originUF && t.normOp.includes(originUF) && !t.normOp.includes('EXCETO')) {
              score += 1500;
              if (reason === 'GENÉRICO') reason = `UF: ${originUF}`;
          }

          if (originRegion && t.normOp.includes(originRegion)) {
              score += 800;
              if (reason === 'GENÉRICO') reason = `REGIÃO: ${originRegion}`;
          }

          if (t.franchise_km >= dist) {
              score += 50;
          } else {
              score -= 10;
          }

          return { ...t, score, reason };
      });

      const valid = scored.filter(t => t.score > -1000).sort((a, b) => b.score - a.score);
      if (valid.length === 0) {
          const fallback = normalizedTables.sort((a, b) => a.franchise_km - b.franchise_km);
          const best = fallback.find(t => t.franchise_km >= dist) || fallback[fallback.length - 1];
          return { table: best, reason: "FAIXA KM (FALLBACK)" };
      }

      const topScore = valid[0].score;
      const bestGroup = valid.filter(t => t.score >= topScore - 20);
      const sortedByKm = bestGroup.sort((a, b) => a.franchise_km - b.franchise_km);
      const exactCover = sortedByKm.find(t => t.franchise_km >= dist);
      const bestTable = exactCover || sortedByKm[sortedByKm.length - 1];
      return { table: bestTable, reason: bestTable.reason || "MELHOR MATCH" };
  };

  const calculatePricing = useCallback(async (route: ClientRoute, providerOverride?: string, revTableId?: string, cstTableId?: string, flags?: { ceva200km: boolean, vtc02h: boolean, isSameOs: boolean }) => {
      if (!formData.client || !route) return;
      setIsCalculating(true);
      let details: string[] = [];
      let revenue = 0;
      let cost = 0;

      const realDist = parseFloat(route.distance) || 0;
      const originUpper = normalizeStr(route.origin);
      const originCity = originUpper.split(',')[0].trim();
      const geoInfo = CITY_MAP[originCity] || { uf: '', region: '' };
      const locationKeywords = [originCity, geoInfo.uf, geoInfo.region];
      const activeProvider = providerOverride !== undefined ? providerOverride : formData.provider;
      const currentFlags = flags || { ceva200km: formData.applyCeva200km, vtc02h: formData.applyVtc02h, isSameOs: formData.isSameOs };

      const isLogitech = (formData.client || '').toUpperCase().includes('CEVA') && (route.name.toUpperCase().includes('LOGITECH') || route.destination.toUpperCase().includes('LOGITECH'));

      let effectiveDist = realDist;
      let forceKeyword: string | undefined = undefined;
      const isSpecialRuleActive = currentFlags.vtc02h || currentFlags.ceva200km || isLogitech;

      if (currentFlags.vtc02h) { effectiveDist = 100; forceKeyword = '100KM'; } 
      else if (currentFlags.ceva200km || isLogitech) { effectiveDist = 200; forceKeyword = isLogitech ? 'LOGITECH' : '200KM'; }

      try {
          let revTable: any = null;
          if (revTableId) {
              revTable = clientPriceTables.find(t => t.id.toString() === revTableId);
              if (revTable) details.push(`FAT (MANUAL): ${revTable.operation_type}`);
          } else {
              const result = findBestTable(clientPriceTables, effectiveDist, locationKeywords, forceKeyword, undefined, route.origin);
              if (result) { revTable = result.table; details.push(`FAT (${result.reason.split(':')[0]}): ${revTable.operation_type}`); }
          }
          if (revTable) {
              revenue = revTable.activation_fee;
              const revTableName = (revTable.operation_type || '').toUpperCase();
              const isFixedPriceRevTable = revTableName.includes('LOGITECH') || revTableName.includes('200KM') || revTableName.includes('200 KM') || revTableName.includes('100KM') || revTableName.includes('100 KM');
              if (!isSpecialRuleActive && !isFixedPriceRevTable && realDist > revTable.franchise_km) revenue += (realDist - revTable.franchise_km) * (revTable.price_per_extra_km || 0);
          }

          let cstTable: any = null;
          if (currentFlags.isSameOs) { cost = 0; details.push(`CUSTO: ZERADO (MESMA OS)`); } 
          else {
              if (cstTableId) {
                  cstTable = providerCostTables.find(t => t.id.toString() === cstTableId);
                  if (cstTable) details.push(`CUSTO (MANUAL): ${cstTable.operation_type}`);
              } else if (activeProvider) {
                  let currentCostTables = providerCostTables;
                  if (providerOverride && providerOverride !== formData.provider) {
                      const { data } = await supabase.from('provider_cost_tables').select('*').eq('provider', providerOverride);
                      if (data) currentCostTables = data as any;
                  }
                  const result = findBestTable(currentCostTables, effectiveDist, locationKeywords, forceKeyword, activeProvider, route.origin);
                  if (result) { cstTable = result.table; details.push(`CUSTO (${result.reason.split(':')[0]}): ${cstTable.operation_type}`); }
              }
              if (cstTable) {
                  cost = cstTable.activation_cost;
                  const cstTableName = (cstTable.operation_type || '').toUpperCase();
                  const isFixedPriceCstTable = cstTableName.includes('LOGITECH') || cstTableName.includes('200KM') || cstTableName.includes('200 KM') || cstTableName.includes('100KM') || cstTableName.includes('100 KM');
                  if (!isSpecialRuleActive && !isFixedPriceCstTable && realDist > cstTable.franchise_km) cost += (realDist - cstTable.franchise_km) * (cstTable.cost_per_extra_km || 0);
              }
          }

          let finalDestination = route.destination;
          if (currentFlags.vtc02h) finalDestination = '02 HORAS DE ACOMPANHAMENTO';
          else if (currentFlags.ceva200km) finalDestination = '200KM DE ACOMPANHAMENTO';

          setFormData(prev => ({
              ...prev, provider: activeProvider, revenueValue: revenue.toFixed(2), costValue: cost.toFixed(2),
              totalDistance: realDist.toString(), origin: route.origin, destination: finalDestination,
              estimatedTime: isSpecialRuleActive ? (currentFlags.vtc02h ? '2 horas' : isLogitech ? '3 horas' : '4 horas') : `${Math.max(2, Math.ceil(realDist / 45))} horas`
          }));
          setCalcDetails(details.join(' | '));
          if (revTable) setManualRevenueTableId(revTable.id.toString());
          if (cstTable) setManualCostTableId(cstTable.id.toString());
      } finally { setIsCalculating(false); }
  }, [formData.client, formData.provider, formData.applyCeva200km, formData.applyVtc02h, formData.isSameOs, clientPriceTables, providerCostTables]);

  const [isCalculatingToll, setIsCalculatingToll] = useState(false);
  const [tollDetails, setTollDetails] = useState<{ count: number; tolls: any[] } | null>(null);

  const calculateTollFromAPI = async (origin: string, destination: string): Promise<{ value: number; count: number; tolls: any[]; apiError?: string; distance?: number; duration?: string; provider?: string } | null> => {
      try {
          setIsCalculatingToll(true);
          const resp = await fetch('/api/toll/calculate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ origin, destination }),
          });
          if (!resp.ok) return null;
          const data = await resp.json();
          if (data.success && data.tollValue > 0) {
              return { value: data.tollValue, count: data.tollCount, tolls: data.tolls || [], distance: data.distance, duration: data.duration, provider: data.provider };
          }
          if (data.apiError) {
              return { value: 0, count: 0, tolls: [], apiError: data.apiError };
          }
          return null;
      } catch (e) {
          console.error('Erro ao consultar API de pedágio:', e);
          return null;
      } finally {
          setIsCalculatingToll(false);
      }
  };

  const handleRouteSelect = async (route: ClientRoute) => {
      setSelectedRouteId(route.id.toString());
      setRouteSearchTerm(route.name);
      setActiveDropdown(null);
      setTollDetails(null);
      
      let suggestedToll = 0;
      let tollSource = '';

      if (route.toll_cost && route.toll_cost > 0) {
          suggestedToll = route.toll_cost;
          tollSource = 'fixed';
          showNotification('IA Logística', `Pedágio de R$ ${suggestedToll.toFixed(2)} aplicado via cadastro de rota fixa.`, 'success');
      } else {
          try {
              const { data: lastMission } = await supabase
                  .from('missions')
                  .select('toll_value')
                  .eq('client', formData.client)
                  .eq('origin', route.origin)
                  .eq('destination', route.destination)
                  .eq('status', MissionStatus.COMPLETED)
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle();
              
              if (lastMission && lastMission.toll_value && lastMission.toll_value > 0) {
                  suggestedToll = lastMission.toll_value;
                  tollSource = 'history';
                  showNotification('Aprendizado de Máquina', `Sugestão de R$ ${suggestedToll.toFixed(2)} identificada no histórico desta rota.`, 'info');
              }
          } catch (e) { console.error(e); }
      }

      setFormData(prev => ({ ...prev, tollValue: suggestedToll.toString() }));
      calculatePricing(route);

      if (tollSource !== 'fixed') {
          const apiResult = await calculateTollFromAPI(route.origin, route.destination);
          if (apiResult) {
              if (apiResult.apiError) {
                  showNotification('API Pedágio', apiResult.apiError, 'error');
              } else if (apiResult.value > 0) {
                  setTollDetails({ count: apiResult.count, tolls: apiResult.tolls });
                  if (tollSource !== 'history' || Math.abs(apiResult.value - suggestedToll) > 1) {
                      setFormData(prev => ({ ...prev, tollValue: apiResult.value.toFixed(2) }));
                      const providerLabel = apiResult.provider === 'rotasbrasil' ? 'Rotas Brasil' : 'API Pedágio';
                      showNotification(providerLabel, `R$ ${apiResult.value.toFixed(2)} calculado automaticamente (${apiResult.count} praça${apiResult.count > 1 ? 's' : ''} - Veículo leve 2 eixos).`, 'success');
                  }
              }
          }
      }
  };

  const handleVehicleSelect = (v: ClientVehicleDB) => {
      setFormData(prev => ({ 
          ...prev, 
          clientVehicleId: v.id.toString(), 
          clientVehiclePlate: v.plate, 
          clientVehicleModel: v.model 
      }));
      setVehicleSearchTerm(v.plate);
      setActiveDropdown(null);
  };

  const handleVehicleSelect2 = (v: ClientVehicleDB) => {
      setFormData(prev => ({ 
          ...prev, 
          clientVehicleId2: v.id.toString(), 
          clientVehiclePlate2: v.plate, 
          clientVehicleModel2: v.model 
      }));
      setVehicleSearchTerm2(v.plate);
      setActiveDropdown(null);
  };

  const handleDriverSelect = (d: {name: string, phone: string}) => {
      setFormData(prev => ({ ...prev, driver_name: d.name, driver_phone: d.phone }));
      setDriverSearchTerm(d.name);
      setActiveDropdown(null);
  };

  const handleManualTableChange = (type: 'rev' | 'cst', val: string) => {
      const route = clientRoutes.find(r => r.id.toString() === selectedRouteId);
      if (!route) return;
      if (type === 'rev') { setManualRevenueTableId(val); calculatePricing(route, undefined, val, manualCostTableId); } 
      else { setManualCostTableId(val); calculatePricing(route, undefined, manualRevenueTableId, val); }
  };

  const handleProviderSelection = (newProviderName: string) => {
      const upper = (newProviderName || '').toUpperCase();
      const isVeladaKeywords = ['TM SEGURANÇA', 'TM SEGURANCA', 'ATIVA'];
      const nextType = isVeladaKeywords.some(k => upper.includes(k)) ? 'Velada' : 'Caracterizada';
      
      setProviderSearchTerm(newProviderName);
      
      const route = clientRoutes.find(r => r.id.toString() === selectedRouteId);
      if(route) { 
          calculatePricing(route, newProviderName, manualRevenueTableId, ''); 
          setFormData(prev => ({ ...prev, provider: newProviderName, missionType: nextType })); 
      } else { 
          setFormData(prev => ({ ...prev, provider: newProviderName, missionType: nextType })); 
      }
      setActiveDropdown(null);
  };

  // Função auxiliar para validar KM (Apenas Ponto)
  const handleKmInput = (value: string) => {
      let val = value.replace(/,/g, '.'); // Força ponto
      if (!/^[0-9]*\.?[0-9]*$/.test(val)) return; // Bloqueia caracteres não numéricos
      setFormData(prev => ({ ...prev, startKm: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.client || !selectedRouteId) return alert("Selecione cliente e rota.");

    const scheduledDateTime = new Date(`${formData.scheduledDate}T${formData.scheduledTime}:00`);
    const now = new Date();
    const toleranceMs = 5 * 60 * 1000;
    if (scheduledDateTime.getTime() < now.getTime() - toleranceMs) {
        return alert("Não é possível agendar uma missão no passado. Ajuste a data e horário para um momento futuro.");
    }

    setIsSaving(true);
    try {
        let attempts = 0, saved = false, finalId = '';
        const nowIso = new Date().toISOString();
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        
        while (attempts < 10 && !saved) {
            finalId = await generateId();
            const scheduledIso = scheduledDateTime.toISOString();
            
            const vehicleId = formData.clientVehicleId;
            
            const { error } = await supabase.from('missions').insert([{
                id: finalId, client: formData.client, provider: formData.provider || null,
                origin: formData.origin, destination: formData.destination, status: MissionStatus.SOLICITED,
                last_update: nowIso, created_at: nowIso, updated_by: userData.name,
                total_distance: parseFloat(formData.totalDistance), start_time: scheduledIso,
                mission_type: formData.missionType || 'Caracterizada', 
                revenue_value: parseFloat(formData.revenueValue) || 0, cost_value: formData.isSameOs ? 0 : (parseFloat(formData.costValue) || 0),
                toll_value: parseFloat(formData.tollValue) || 0,
                ...(formData.isSameOs ? { is_same_os: true, parent_mission_id: formData.parentMissionId || null } : {}), current_location: 'Solicitação Criada',
                client_vehicle: vehicleId ? parseInt(vehicleId) : null,
                client_vehicle_2: formData.clientVehicleId2 ? parseInt(formData.clientVehicleId2) : null,
                driver_name: (formData.driver_name || '').toUpperCase(),
                driver_phone: formData.driver_phone,
                driver_name_2: formData.driver_name_2 ? (formData.driver_name_2 || '').toUpperCase() : null,
                driver_phone_2: formData.driver_phone_2 || null,
                start_km: parseFloat(formData.startKm) || null
            }]);
            if (!error) saved = true; else if (error.code === '23505') attempts++; else throw error;
        }
        await uploadEvidences(finalId);

        const vehiclePlate = formData.clientVehicleId 
            ? (dbClientVehicles.find(v => v.id.toString() === formData.clientVehicleId)?.plate || '—') 
            : '—';
        const scheduledIso = scheduledDateTime.toISOString();

        if (formData.provider) {
            try {
                const provRes = await fetch('/api/email/mission-solicited', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        missionId: finalId,
                        provider: formData.provider,
                        vehiclePlate,
                        origin: formData.origin,
                        destination: formData.destination,
                        start_time: scheduledIso,
                        mission_type: formData.missionType,
                        driver_name: formData.driver_name,
                        driver_phone: formData.driver_phone,
                        senderName: userData.name || undefined
                    })
                });
                const provData = await provRes.json();
                if (provData.queued) {
                    showNotification('E-mail na Fila', provData.message, 'warning');
                }
            } catch (emailErr) { console.error('[Email] Erro ao enviar solicitação ao fornecedor na criação:', emailErr); }
        }

        try {
            const clientRes = await fetch('/api/email/mission-scheduled', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    missionId: finalId,
                    client: formData.client,
                    origin: formData.origin,
                    destination: formData.destination,
                    start_time: scheduledIso,
                    mission_type: formData.missionType,
                    vehiclePlate,
                    senderName: userData.name || undefined
                })
            });
            const clientData = await clientRes.json();
            if (clientData.queued) {
                showNotification('E-mail na Fila', clientData.message, 'warning');
            }
        } catch (emailErr) { console.error('[Email] Erro ao enviar confirmação ao cliente na criação:', emailErr); }

        onSaveAndContinue(finalId);
    } catch (e: any) { alert("Erro ao salvar: " + e.message); } finally { setIsSaving(false); }
  };

  const filteredRoutes = clientRoutes.filter(r => 
      normalizeStr(r.name).includes(normalizeStr(routeSearchTerm)) || 
      normalizeStr(r.origin).includes(normalizeStr(routeSearchTerm)) || 
      normalizeStr(r.destination).includes(normalizeStr(routeSearchTerm))
  );

  const filteredVehicles = dbClientVehicles.filter(v => 
      (v.plate || '').includes(vehicleSearchTerm.toUpperCase())
  );

  const filteredVehicles2 = dbClientVehicles.filter(v => 
      (v.plate || '').includes(vehicleSearchTerm2.toUpperCase()) &&
      v.id.toString() !== formData.clientVehicleId
  );

  const filteredDrivers = dbPastDrivers.filter(d => 
      (d.name || '').includes(driverSearchTerm.toUpperCase())
  );

  const filteredProviders = dbProviders.filter(p => 
     formatProviderName(p.name, p.trading_name).includes(providerSearchTerm.toUpperCase())
  );

  const isVtcClient = (formData.client || '').toUpperCase().includes('VTC');

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-in fade-in">
      {isClientModalOpen && (<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in zoom-in-95"><div className="bg-[#f8fafc] rounded-2xl w-full max-w-5xl p-6 relative shadow-2xl overflow-y-auto max-h-[95vh]"><button onClick={() => setIsClientModalOpen(false)} className="absolute top-6 right-6 p-2 bg-white rounded-full shadow-sm hover:bg-red-50 text-gray-400 hover:text-red-600 transition-all z-10"><X size={20}/></button><ClientForm onBack={() => setIsClientModalOpen(false)} onSave={() => { setIsClientModalOpen(false); loadBasicData(); }} onAddVehicle={() => {}} onEditVehicle={() => {}} onAddRoute={() => {}} onEditRoute={() => {}} onAddQuote={() => {}} onEditQuote={() => {}} /></div></div>)}
      {isProviderModalOpen && (<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in zoom-in-95"><div className="bg-[#f8fafc] rounded-2xl w-full max-w-5xl p-6 relative shadow-2xl overflow-y-auto max-h-[95vh]"><button onClick={() => setIsProviderModalOpen(false)} className="absolute top-6 right-6 p-2 bg-white rounded-full shadow-sm hover:bg-red-50 text-gray-400 hover:text-red-600 transition-all z-10"><X size={20}/></button><ProviderForm onBack={() => setIsProviderModalOpen(false)} onNavigateToVehicles={() => {}} /></div></div>)}
      {isRouteModalOpen && (<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in zoom-in-95"><div className="bg-[#f8fafc] rounded-2xl w-full max-w-5xl p-6 relative shadow-2xl overflow-y-auto max-h-[95vh]"><button onClick={() => setIsRouteModalOpen(false)} className="absolute top-6 right-6 p-2 bg-white rounded-full shadow-sm hover:bg-red-50 text-gray-400 hover:text-red-600 transition-all z-10"><X size={20}/></button><ClientRouteForm onSuccess={(newRouteId) => { setIsRouteModalOpen(false); if (formData.client) { supabase.from('client_routes').select('*').eq('client', formData.client).order('name').then(({ data }) => { if (data) { setClientRoutes(data as any); const newRoute = data.find((r: any) => r.id.toString() === newRouteId); if (newRoute) handleRouteSelect(newRoute); } }); } }} /></div></div>)}
      {isVehicleModalOpen && (<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in zoom-in-95"><div className="bg-[#f8fafc] rounded-2xl w-full max-w-5xl p-6 relative shadow-2xl overflow-y-auto max-h-[95vh]"><button onClick={() => setIsVehicleModalOpen(false)} className="absolute top-6 right-6 p-2 bg-white rounded-full shadow-sm hover:bg-red-50 text-gray-400 hover:text-red-600 transition-all z-10"><X size={20}/></button><ClientVehicleForm embedded onBack={() => setIsVehicleModalOpen(false)} onSuccess={() => { setIsVehicleModalOpen(false); if(formData.client) fetchClientVehicles(formData.client); }} /></div></div>)}

      <div className="flex items-center justify-between"><div className="flex items-center gap-4"><button onClick={onBack} className="p-2.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm"><ArrowLeft size={20} /></button><div className="flex items-center gap-3"><h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Nova Ordem de Serviço</h2><span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-[10px] font-black rounded-md">{osId}</span></div></div></div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden" ref={dropdownRef}>
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between"><div className="flex items-center gap-2"><FileText size={18} className="text-red-700" /><h3 className="font-bold text-xs uppercase tracking-widest text-gray-600">Dados da Solicitação</h3></div><label className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 cursor-pointer transition-all ${formData.isSameOs ? 'bg-black border-black text-white shadow-md' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}><input type="checkbox" className="hidden" checked={formData.isSameOs} onChange={e => { const checked = e.target.checked; setFormData(prev => ({ ...prev, isSameOs: checked, parentMissionId: checked ? prev.parentMissionId : '' })); const route = clientRoutes.find(r => r.id.toString() === selectedRouteId); if (route) calculatePricing(route, undefined, manualRevenueTableId, '', { ceva200km: formData.applyCeva200km, vtc02h: checked, isSameOs: checked }); }} /><Layers size={14} className={formData.isSameOs ? 'text-white' : 'text-gray-400'} /><span className="text-[10px] font-black uppercase tracking-wider">Mesma OS (Custo Zero)</span></label></div>
          {formData.isSameOs && (
            <div className="px-4 py-3 bg-slate-50 border-b border-gray-100">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1.5 block">Vincular à OS Mãe (Principal)</label>
              <div className="relative">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black"
                      placeholder="Digite o nº da OS mãe (ex: GTM-1234) ou busque..."
                      value={parentOsSearch || formData.parentMissionId}
                      onChange={e => { setParentOsSearch(e.target.value); setShowParentOsDropdown(true); if (!e.target.value) setFormData(prev => ({...prev, parentMissionId: ''})); }}
                      onFocus={() => setShowParentOsDropdown(true)}
                      data-testid="input-parent-mission-id"
                    />
                  </div>
                  {formData.parentMissionId && (
                    <button type="button" onClick={() => { setFormData(prev => ({...prev, parentMissionId: ''})); setParentOsSearch(''); }} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><X size={16}/></button>
                  )}
                </div>
                {formData.parentMissionId && (
                  <div className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
                    <Layers size={12} className="text-blue-600" />
                    <span className="text-[10px] font-black text-blue-700 uppercase">OS Mãe: {formData.parentMissionId}</span>
                    {(() => { const p = parentOsSuggestions.find(s => s.id === formData.parentMissionId); return p ? <span className="text-[9px] text-blue-500 ml-1">({p.client} → {p.origin?.split(',')[0]} / {p.destination?.split(',')[0]})</span> : null; })()}
                  </div>
                )}
                {showParentOsDropdown && formData.isSameOs && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    {parentOsSuggestions.filter(s => {
                      if (!parentOsSearch) return true;
                      const term = parentOsSearch.toLowerCase();
                      return s.id.toLowerCase().includes(term) || s.client?.toLowerCase().includes(term) || s.provider?.toLowerCase().includes(term);
                    }).map(s => (
                      <button key={s.id} type="button" className={`w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 transition-colors ${formData.parentMissionId === s.id ? 'bg-blue-50' : ''}`}
                        onClick={() => { setFormData(prev => ({...prev, parentMissionId: s.id})); setParentOsSearch(''); setShowParentOsDropdown(false); }}
                        data-testid={`option-parent-${s.id}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-gray-900">{s.id}</span>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${s.status === 'Concluída' ? 'bg-green-100 text-green-700' : s.status === 'Em Viagem' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{s.status}</span>
                        </div>
                        <div className="text-[9px] text-gray-500 mt-0.5">{s.client} • {s.provider || 'Sem fornecedor'}</div>
                        <div className="text-[9px] text-gray-400">{s.origin?.split(',')[0]} → {s.destination?.split(',')[0]}</div>
                      </button>
                    ))}
                    {parentOsSuggestions.length === 0 && <div className="px-3 py-4 text-center text-xs text-gray-400">Nenhuma OS encontrada para este cliente</div>}
                    {parentOsSearch && !parentOsSuggestions.find(s => s.id === parentOsSearch) && (
                      <button type="button" className="w-full text-left px-3 py-2 hover:bg-blue-50 border-t border-gray-100 text-blue-700"
                        onClick={() => { setFormData(prev => ({...prev, parentMissionId: parentOsSearch.toUpperCase()})); setParentOsSearch(''); setShowParentOsDropdown(false); }}
                      >
                        <div className="flex items-center gap-2"><Plus size={12}/><span className="text-xs font-bold">Usar "{parentOsSearch.toUpperCase()}" como OS Mãe</span></div>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="p-8 space-y-8">
              <div className="relative group"><label className={LABEL_CLASS}>Tipo de Operação *</label><div className="relative"><select className={SELECT_CLASS} value={formData.missionType} onChange={e => setFormData({...formData, missionType: e.target.value})}><option value="Caracterizada">Escolta Caracterizada</option><option value="Velada">Escolta Velada</option></select><Siren size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" /><ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" /></div></div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="relative">
                    <label className={LABEL_CLASS}>1. Selecione o Cliente *</label>
                    <div className="flex flex-col gap-3">
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <select required className={SELECT_CLASS} value={formData.client} onChange={e => {
                                    const clientName = e.target.value;
                                    const isVTC = (clientName || '').toUpperCase().includes('VTC');
                                    setFormData(prev => {
                                        const next = {
                                            ...prev, 
                                            client: clientName, 
                                            applyVtc02h: isVTC, 
                                            clientVehicleId: '', 
                                            clientVehiclePlate: '', 
                                            clientVehicleModel: '', 
                                            clientVehicleId2: '',
                                            clientVehiclePlate2: '',
                                            clientVehicleModel2: '',
                                            driver_name: '', 
                                            driver_phone: '',
                                            driver_name_2: '',
                                            driver_phone_2: ''
                                        };
                                        const route = clientRoutes.find(r => r.id.toString() === selectedRouteId);
                                        if (route) {
                                            setTimeout(() => calculatePricing(route, undefined, '', '', {
                                                ceva200km: next.applyCeva200km,
                                                vtc02h: next.applyVtc02h,
                                                isSameOs: next.isSameOs
                                            }), 100);
                                        }
                                        return next;
                                    });
                                    if (isVTC) {
                                        showNotification('Inteligência Comercial', 'Cliente VTC detectado: Verifique a Regra de 02 Horas.', 'info');
                                    }
                                }}><option value="">Selecione...</option>{dbClients.map(c => <option key={c.id} value={c.name}>{c.trading_name || c.name}</option>)}</select>
                                <Building2 size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                            </div>
                            <button type="button" onClick={() => setIsClientModalOpen(true)} className="p-3 bg-gray-900 text-white rounded-lg hover:bg-black transition-all shadow-md active:scale-95"><Plus size={20} /></button>
                        </div>

                        {isVtcClient && (
                            <div className={`p-4 rounded-xl border-2 transition-all duration-300 animate-in slide-in-from-top-2 ${!formData.applyVtc02h ? 'bg-red-50 border-red-500 animate-pulse' : 'bg-blue-50 border-blue-600'}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${!formData.applyVtc02h ? 'bg-red-500 text-white' : 'bg-blue-600 text-white'}`}>
                                            {!formData.applyVtc02h ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
                                        </div>
                                        <div>
                                            <p className={`text-[10px] font-black uppercase tracking-widest ${!formData.applyVtc02h ? 'text-red-700' : 'text-blue-800'}`}>Atenção: Regra 02 Horas</p>
                                            <p className={`text-[9px] font-bold ${!formData.applyVtc02h ? 'text-red-600' : 'text-blue-600'}`}>
                                                {!formData.applyVtc02h ? 'ESTA OPÇÃO É OBRIGATÓRIA PARA ACIONAMENTOS VTC' : 'REGRA APLICADA COM SUCESSO'}
                                            </p>
                                        </div>
                                    </div>
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            const nextVal = !formData.applyVtc02h;
                                            setFormData(prev => ({ ...prev, applyVtc02h: nextVal }));
                                            const route = clientRoutes.find(r => r.id.toString() === selectedRouteId);
                                            if (route) calculatePricing(route, undefined, manualRevenueTableId, '', { ceva200km: formData.applyCeva200km, vtc02h: nextVal, isSameOs: formData.isSameOs });
                                        }}
                                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase shadow-md transition-all active:scale-95 ${!formData.applyVtc02h ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-blue-600 text-white'}`}
                                    >
                                        {!formData.applyVtc02h ? 'ATIVAR AGORA' : 'DESATIVAR'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                  </div>

                  <div className="relative">
                    <label className={LABEL_CLASS}>2. Veículo de Carga (Placa)</label>
                    <div className="flex gap-1.5">
                        <div className="relative flex-1">
                            <input type="text" className={INPUT_CLASS} placeholder={formData.client ? "Buscar veículo..." : "Aguardando Cliente..."} value={vehicleSearchTerm} onChange={e => { setVehicleSearchTerm(e.target.value.toUpperCase()); setActiveDropdown('vehicle'); }} onFocus={() => formData.client && setActiveDropdown('vehicle')} disabled={!formData.client} />
                            <Truck size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                            {activeDropdown === 'vehicle' && formData.client && filteredVehicles.length > 0 && (
                                <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto ring-1 ring-black/5">
                                    {filteredVehicles.map(v => (
                                        <button key={v.id} type="button" onClick={() => handleVehicleSelect(v)} className={DROPDOWN_ITEM_CLASS}>{v.plate} ({v.model})</button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button type="button" disabled={!formData.client} onClick={() => setIsVehicleModalOpen(true)} className="p-2.5 bg-gray-100 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-200 transition-all shadow-sm active:scale-95 disabled:opacity-50"><Plus size={18} /></button>
                    </div>
                  </div>

                  <div className="relative">
                    <label className={LABEL_CLASS}>Motorista</label>
                    <div className="relative">
                        <input 
                            type="text" 
                            className={INPUT_CLASS} 
                            placeholder="Nome do condutor..." 
                            value={driverSearchTerm} 
                            onChange={e => { setDriverSearchTerm(e.target.value.toUpperCase()); setFormData({...formData, driver_name: e.target.value}); setActiveDropdown('driver'); }} 
                            onFocus={() => setActiveDropdown('driver')}
                        />
                        <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        {activeDropdown === 'driver' && filteredDrivers.length > 0 && (
                            <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto ring-1 ring-black/5">
                                {filteredDrivers.map((d, i) => (
                                    <button key={i} type="button" onClick={() => { handleDriverSelect(d); }} className={DROPDOWN_ITEM_CLASS}>{d.name}</button>
                                ))}
                            </div>
                        )}
                    </div>
                  </div>

                  <div className="relative">
                    <label className={LABEL_CLASS}>Telefone Motorista</label>
                    <div className="relative">
                        <input type="text" className={INPUT_CLASS} placeholder="(00) 00000-0000" value={formData.driver_phone} onChange={e => setFormData({...formData, driver_phone: e.target.value})} />
                        <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
              </div>

              {!showSecondVehicle && formData.client && (
                  <div className="flex justify-center">
                      <button type="button" onClick={() => setShowSecondVehicle(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-[11px] font-black uppercase tracking-wider hover:bg-blue-100 transition-all active:scale-95" data-testid="button-add-vehicle-2">
                          <Plus size={14} /> Adicionar 2° Veículo de Carga
                      </button>
                  </div>
              )}

              {showSecondVehicle && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 bg-blue-50/50 rounded-xl border border-blue-100 relative">
                      <button type="button" onClick={() => { setShowSecondVehicle(false); setFormData(prev => ({ ...prev, clientVehicleId2: '', clientVehiclePlate2: '', clientVehicleModel2: '', driver_name_2: '', driver_phone_2: '' })); setVehicleSearchTerm2(''); }} className="absolute top-3 right-3 p-1.5 bg-white rounded-full border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200 transition-all shadow-sm" data-testid="button-remove-vehicle-2"><X size={14} /></button>
                      <div className="col-span-full"><span className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5"><Truck size={12} /> 2° Veículo de Carga</span></div>
                      
                      <div className="relative">
                          <label className={LABEL_CLASS}>Placa do 2° Veículo</label>
                          <div className="flex gap-1.5">
                              <div className="relative flex-1">
                                  <input type="text" className={INPUT_CLASS} placeholder="Buscar veículo..." value={vehicleSearchTerm2} onChange={e => { setVehicleSearchTerm2(e.target.value.toUpperCase()); setActiveDropdown('vehicle2'); }} onFocus={() => formData.client && setActiveDropdown('vehicle2')} disabled={!formData.client} data-testid="input-vehicle-2" />
                                  <Truck size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" />
                                  {activeDropdown === 'vehicle2' && formData.client && filteredVehicles2.length > 0 && (
                                      <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto ring-1 ring-black/5">
                                          {filteredVehicles2.map(v => (
                                              <button key={v.id} type="button" onClick={() => handleVehicleSelect2(v)} className={DROPDOWN_ITEM_CLASS}>{v.plate} ({v.model})</button>
                                          ))}
                                      </div>
                                  )}
                              </div>
                              <button type="button" disabled={!formData.client} onClick={() => setIsVehicleModalOpen(true)} className="p-2.5 bg-gray-100 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-200 transition-all shadow-sm active:scale-95 disabled:opacity-50"><Plus size={18} /></button>
                          </div>
                      </div>

                      <div className="relative">
                          <label className={LABEL_CLASS}>Motorista do 2° Veículo</label>
                          <div className="relative">
                              <input type="text" className={INPUT_CLASS} placeholder="Nome do 2° condutor..." value={formData.driver_name_2} onChange={e => setFormData({...formData, driver_name_2: e.target.value.toUpperCase()})} data-testid="input-driver-name-2" />
                              <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400" />
                          </div>
                      </div>

                      <div className="relative">
                          <label className={LABEL_CLASS}>Telefone do 2° Motorista</label>
                          <div className="relative">
                              <input type="text" className={INPUT_CLASS} placeholder="(00) 00000-0000" value={formData.driver_phone_2} onChange={e => setFormData({...formData, driver_phone_2: e.target.value})} data-testid="input-driver-phone-2" />
                              <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" />
                          </div>
                      </div>
                  </div>
              )}

              <div className="relative"><label className={LABEL_CLASS}>3. Selecione a Rota Cadastrada *</label><div className="flex gap-2"><div className="relative flex-1"><input type="text" required className={INPUT_CLASS} placeholder={formData.client ? "Buscar rota (Ex: PERUS)..." : "Aguardando Cliente..."} value={routeSearchTerm} onChange={e => { setRouteSearchTerm(e.target.value); setActiveDropdown('route'); }} onFocus={() => formData.client && setActiveDropdown('route')} disabled={!formData.client} /><Navigation size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-red-600 opacity-50 pointer-events-none" />{activeDropdown === 'route' && formData.client && filteredRoutes.length > 0 && (<div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-64 overflow-y-auto ring-1 ring-black/5">{filteredRoutes.map(r => (<div key={r.id} onClick={() => handleRouteSelect(r)} className="p-3 border-b border-gray-50 hover:bg-red-50 cursor-pointer transition-colors group"><p className="font-bold text-xs text-gray-800 uppercase group-hover:text-red-700">{r.name}</p><p className="text-[10px] text-gray-400 font-medium uppercase mt-0.5">{r.origin.split(',')[0]} x {r.destination.split(',')[0]} | {r.distance} KM</p></div>))}</div>)}</div><button type="button" disabled={!formData.client} onClick={() => setIsRouteModalOpen(true)} className="p-3 bg-red-700 text-white rounded-lg hover:bg-red-800 transition-all shadow-md active:scale-95 disabled:opacity-50"><Plus size={20} /></button></div></div>

              {calcDetails && (<div className="flex items-center gap-2 p-3 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-black uppercase tracking-tight border border-blue-100 shadow-sm"><Info size={14} className="shrink-0"/> {calcDetails}</div>)}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div className="space-y-4"><div className="relative"><label className={LABEL_CLASS}>Origem (Ponto A)</label><input type="text" readOnly className={`${INPUT_CLASS} bg-gray-50 font-black uppercase font-medium`} value={formData.origin} /><MapPin size={18} className="absolute left-4 bottom-3 text-gray-300 pointer-events-none" /></div><div className="relative"><label className={LABEL_CLASS}>Destino (Ponto B)</label><input type="text" readOnly className={`${INPUT_CLASS} bg-gray-50 font-black uppercase font-medium`} value={formData.destination} /><Flag size={18} className="absolute left-4 bottom-3 text-gray-300 pointer-events-none" /></div></div><div className="bg-gray-900 rounded-2xl p-6 text-white flex flex-col justify-center items-center relative overflow-hidden group border border-gray-800 shadow-lg"><div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform"><Ruler size={100}/></div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Distância Prevista</p><div className="flex items-baseline gap-1"><span className="text-4xl font-black">{formData.totalDistance || '-'}</span><span className="text-sm font-bold text-gray-500">KM</span></div>{isCalculating && <Loader2 size={16} className="animate-spin text-red-500 mt-4"/>}</div></div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-gray-50 rounded-2xl border border-gray-200">
                  <div className="space-y-4">
                      <div className="flex flex-col gap-3">
                          <label className={LABEL_CLASS}>Regras Específicas de Faturamento</label>
                          <div className="flex flex-wrap gap-2">
                              {!isVtcClient && (
                                <label className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 cursor-pointer transition-all ${formData.applyVtc02h ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                                    <input type="checkbox" className="hidden" checked={formData.applyVtc02h} onChange={e => {
                                        const checked = e.target.checked;
                                        setFormData(prev => ({ ...prev, applyVtc02h: checked }));
                                        const route = clientRoutes.find(r => r.id.toString() === selectedRouteId);
                                        if (route) calculatePricing(route, undefined, manualRevenueTableId, '', { ceva200km: formData.applyCeva200km, vtc02h: checked, isSameOs: formData.isSameOs });
                                    }} />
                                    <Clock size={14} className={formData.applyVtc02h ? 'text-white' : 'text-gray-400'} />
                                    <span className="text-[10px] font-black uppercase tracking-wider">Regra 02 Horas (VTC)</span>
                                </label>
                              )}
                              <label className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 cursor-pointer transition-all ${formData.applyCeva200km ? 'bg-orange-600 border-orange-600 text-white shadow-md' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                                  <input type="checkbox" className="hidden" checked={formData.applyCeva200km} onChange={e => {
                                      const checked = e.target.checked;
                                      setFormData(prev => ({ ...prev, applyCeva200km: checked }));
                                      const route = clientRoutes.find(r => r.id.toString() === selectedRouteId);
                                      if (route) calculatePricing(route, undefined, manualRevenueTableId, '', { ceva200km: checked, vtc02h: formData.applyVtc02h, isSameOs: formData.isSameOs });
                                  }} />
                                  <TrendingUp size={14} className={formData.applyCeva200km ? 'text-white' : 'text-gray-400'} />
                                  <span className="text-[10px] font-black uppercase tracking-wider">Regra 200KM</span>
                              </label>
                          </div>
                      </div>
                      <div><label className={LABEL_CLASS}>Confirmar Tabela de Faturamento (Cliente)</label><div className="relative"><select className={SELECT_CLASS} value={manualRevenueTableId} onChange={e => handleManualTableChange('rev', e.target.value)} disabled={!selectedRouteId}><option value="">Aguardando rota...</option>{clientPriceTables.map(t => ( <option key={t.id} value={t.id}> {t.operation_type} {canViewFinancials ? `(Base: R$${t.activation_fee})` : ''} </option> ))}</select><Tag size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-green-500 opacity-50 pointer-events-none" /><ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" /></div></div>
                  </div>
                  <div className="space-y-4 flex flex-col justify-end">
                      <div><label className={LABEL_CLASS}>Confirmar Tabela de Custo (Fornecedor)</label><div className="relative"><select className={SELECT_CLASS} value={manualCostTableId} onChange={e => handleManualTableChange('cst', e.target.value)} disabled={!selectedRouteId || !formData.provider || formData.isSameOs}><option value="">{formData.isSameOs ? 'CUSTO ZERADO (MESMA OS)' : formData.provider ? 'Selecione a tabela...' : 'Selecione o Fornecedor primeiro'}</option>{providerCostTables.map(t => ( <option key={t.id} value={t.id}> {t.operation_type} {canViewFinancials ? `(Base: R$${t.activation_cost})` : ''} </option> ))}</select><Tag size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-red-500 opacity-50 pointer-events-none" /><ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" /></div></div>
                  </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-gray-100">
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                      <label className={LABEL_CLASS}>Pedágio Estimado</label>
                      <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">R$</span>
                          <input 
                            type="number" step="0.01" 
                            className={`w-full bg-white border border-gray-200 rounded-lg py-2 pl-9 pr-10 text-lg font-black text-gray-700 outline-none focus:ring-2 focus:ring-indigo-500/20 ${isCalculatingToll ? 'opacity-50' : ''}`}
                            value={formData.tollValue}
                            onChange={e => setFormData({...formData, tollValue: e.target.value})}
                            disabled={isCalculatingToll}
                            data-testid="input-toll-value"
                          />
                          <span title={isCalculatingToll ? "Consultando API de pedágio..." : "Valor calculado via API de Pedágio"} className="absolute right-3 top-1/2 -translate-y-1/2">
                              {isCalculatingToll ? <Loader2 size={16} className="text-indigo-500 animate-spin" /> : <Zap size={16} className="text-yellow-500 animate-pulse" />}
                          </span>
                      </div>
                      <p className="text-[8px] text-gray-400 font-bold uppercase mt-1.5 flex items-center gap-1">
                          <Info size={8}/>
                          {isCalculatingToll ? 'Calculando pedágio via API...' : tollDetails ? `${tollDetails.count} praça${tollDetails.count > 1 ? 's' : ''} de pedágio na rota (Veículo leve 2 eixos)` : 'Valor preenchido via Memória Evolutiva / API Pedágio'}
                      </p>
                      {tollDetails && tollDetails.tolls.length > 0 && (
                          <div className="mt-2 max-h-28 overflow-y-auto">
                              {tollDetails.tolls.map((t: any, i: number) => (
                                  <div key={i} className="flex items-center justify-between text-[9px] font-bold text-gray-500 py-0.5 border-b border-gray-100 last:border-0">
                                      <span className="truncate mr-2">{t.nome}{t.concessionaria ? ` — ${t.concessionaria}` : ''}{t.rodovia ? ` (${t.rodovia})` : ''}</span>
                                      <span className="text-gray-700 whitespace-nowrap">R$ {(t.valorDinheiro || 0).toFixed(2)}</span>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>

                  <div className="md:col-span-2 relative">
                    {/* ALERTA INTELIGENTE IBL */}
                    {iblWarning && (
                        <div className="absolute -top-12 left-0 right-0 bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase flex items-center justify-center gap-2 shadow-lg animate-pulse z-10">
                            <ShieldAlert size={16} /> {iblWarning}
                        </div>
                    )}

                    <label className={LABEL_CLASS}>4. Fornecedor (Parceiro de Escolta)</label>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                className={INPUT_CLASS}
                                placeholder="Filtrar Fornecedor..."
                                value={providerSearchTerm}
                                onChange={e => {
                                    setProviderSearchTerm(e.target.value);
                                    setActiveDropdown('provider');
                                }}
                                onFocus={() => setActiveDropdown('provider')}
                            />
                            <Briefcase size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                            <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />

                            {activeDropdown === 'provider' && (
                                <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto ring-1 ring-black/5">
                                    {filteredProviders.map(p => (
                                        <button 
                                            key={p.id} 
                                            type="button" 
                                            onClick={() => handleProviderSelection(p.name)} 
                                            className={DROPDOWN_ITEM_CLASS}
                                        >
                                            <span className="flex items-center gap-2">
                                                <Shield size={14} className="text-red-500" />
                                                {formatProviderName(p.name, p.trading_name)}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button type="button" onClick={() => setIsProviderModalOpen(true)} className="p-3 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-all shadow-sm active:scale-95"><Plus size={20} /></button>
                    </div>
                  </div>
              </div>

              {canViewFinancials && (<div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100 animate-in fade-in"><div className="bg-green-50/50 p-6 rounded-2xl border border-green-100 group shadow-sm"><div className="flex items-center justify-between mb-3"><label className="text-[10px] font-black text-green-700 uppercase tracking-widest">Faturamento Previsto</label><TrendingUp size={16} className="text-green-400" /></div><div className="relative"><span className="absolute left-0 top-1/2 -translate-y-1/2 text-lg font-black text-green-400">R$</span><input type="number" step="0.01" className="w-full pl-8 bg-transparent outline-none text-2xl font-black text-green-900" placeholder="0.00" value={formData.revenueValue} onChange={e => setFormData({...formData, revenueValue: e.target.value})} /></div></div><div className={`p-6 rounded-2xl border group shadow-sm transition-all ${formData.isSameOs ? 'bg-gray-900 border-black ring-2 ring-black/10' : 'bg-red-50/50 border-red-100'}`}><div className="flex items-center justify-between mb-3"><label className={`text-[10px] font-black uppercase tracking-widest ${formData.isSameOs ? 'text-gray-400' : 'text-red-700'}`}>Custo Previsto {formData.isSameOs && '(MESMA OS)'}</label><TrendingDown size={16} className={formData.isSameOs ? 'text-gray-500' : 'text-red-400'} /></div><div className="relative"><span className={`absolute left-0 top-1/2 -translate-y-1/2 text-lg font-black ${formData.isSameOs ? 'text-slate-700' : 'text-green-400'}`}>R$</span><input type="number" step="0.01" className={`w-full pl-8 bg-transparent outline-none text-2xl font-black ${formData.isSameOs ? 'text-white cursor-not-allowed' : 'text-green-900'}`} placeholder="0.00" value={formData.isSameOs ? '0.00' : formData.costValue} onChange={e => !formData.isSameOs && setFormData({...formData, costValue: e.target.value})} readOnly={formData.isSameOs} /></div></div></div>)}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6"><div className="relative"><label className={LABEL_CLASS}>Tempo Estimado</label><div className="relative"><input type="text" readOnly className={`${INPUT_CLASS} bg-gray-50`} value={formData.estimatedTime} /><Clock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" /></div></div><div className="relative"><label className={LABEL_CLASS}>Data do Agendamento *</label><div className="relative"><input type="date" required className={INPUT_CLASS} value={formData.scheduledDate} onChange={e => setFormData({...formData, scheduledDate: e.target.value})} /><Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" /></div></div><div className="relative"><label className={LABEL_CLASS}>Horário *</label><div className="relative"><input type="time" required className={INPUT_CLASS} value={formData.scheduledTime} onChange={e => setFormData({...formData, scheduledTime: e.target.value})} /><Clock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" /></div></div></div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="relative">
                  <label className={LABEL_CLASS}>KM Inicial</label>
                  <div className="relative">
                      <input 
                          type="text" 
                          inputMode="decimal"
                          className={INPUT_CLASS} 
                          value={formData.startKm} 
                          onChange={e => handleKmInput(e.target.value)} 
                          placeholder="0.0"
                      />
                      <Navigation size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-gray-100 space-y-4">
                <div>
                    <div className="flex items-center gap-2 mb-3">
                        <Paperclip size={16} className="text-gray-500" />
                        <span className={LABEL_CLASS + " mb-0"}>Evidência da Solicitação (Print / Imagem)</span>
                    </div>
                    <div 
                        className="border-2 border-dashed border-gray-200 rounded-xl p-4 bg-gray-50/50 hover:border-red-300 hover:bg-red-50/20 transition-all cursor-pointer"
                        onClick={() => fileInputRef.current?.click()}
                        data-testid="evidence-drop-zone"
                    >
                        <input 
                            ref={fileInputRef} 
                            type="file" 
                            accept="image/*" 
                            multiple 
                            className="hidden" 
                            onChange={handleEvidenceFileSelect} 
                        />
                        <div className="flex flex-col items-center gap-2 text-gray-400">
                            <div className="flex items-center gap-3">
                                <Image size={20} />
                                <span className="text-xs font-bold uppercase">Clique para selecionar ou use Ctrl+V para colar um print</span>
                                <Clipboard size={16} />
                            </div>
                            <span className="text-[10px] text-gray-300">PNG, JPG — Evidencie que o cliente solicitou esta demanda</span>
                        </div>
                    </div>
                    {evidenceFiles.length > 0 && (
                        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                            {evidenceFiles.map((ev, idx) => (
                                <div key={idx} className="relative group rounded-lg overflow-hidden border border-gray-200 shadow-sm cursor-pointer" onClick={() => setExpandedEvidence(ev.preview)} data-testid={`evidence-thumbnail-${idx}`}>
                                    <img src={ev.preview} alt={`Evidência ${idx + 1}`} className="w-full h-32 object-cover" />
                                    <button 
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); removeEvidence(idx); }}
                                        className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                        data-testid={`button-remove-evidence-${idx}`}
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 flex items-center justify-between">
                                        <span className="text-[9px] text-white font-bold">EVIDÊNCIA {idx + 1}</span>
                                        <span className="text-[8px] text-white/70">Clique para ampliar</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {expandedEvidence && (
                        <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4 animate-in fade-in" onClick={() => setExpandedEvidence(null)} data-testid="evidence-fullscreen-modal">
                            <button type="button" onClick={() => setExpandedEvidence(null)} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all z-10" data-testid="button-close-evidence">
                                <X size={24} />
                            </button>
                            <img src={expandedEvidence} alt="Evidência ampliada" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
                        </div>
                    )}
                </div>
                <div className="flex justify-end gap-3"><button type="button" onClick={onBack} className="px-8 py-3 bg-white text-gray-500 rounded-xl font-bold uppercase text-xs hover:bg-gray-100 border border-gray-200 transition-all">Cancelar</button><button type="submit" disabled={isSaving} className="px-10 py-3 bg-orange-500 text-black rounded-xl font-black uppercase text-sm shadow-lg hover:bg-orange-600 flex items-center gap-2 transition-all active:scale-95">{isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Gerar Ordem de Serviço</button></div>
              </div>
          </form>
      </div>
    </div>
  );
};

export default MissionForm;
