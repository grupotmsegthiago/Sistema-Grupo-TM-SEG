import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, Building2, Truck, Users, Search, Loader2, AlertTriangle, DollarSign, Edit, Trash2, Plus, FileSpreadsheet, MessageCircle, RefreshCw, Navigation, FileText, MapPin, CheckSquare, Square, X, Edit2, Clock, ScrollText, TrendingUp, Percent, Send, CheckCircle, ShieldCheck, ArrowRight, RotateCcw, Copy, Lock, Calendar, Check, Mail, Phone as PhoneIcon, Map as MapIcon, Hash, Fingerprint, Calculator, Target, UserCheck, XCircle } from 'lucide-react';
import { Client, ClientPriceTable } from '../types';
import { supabase } from '../lib/supabase';
import { logAction } from '../lib/logger';
import { clientFuzzyFilter } from '../lib/financialUtils';
import { generateAutoBands, suggestAutoMasterFromManualTables, type ProviderAutoMasterConfig } from '../lib/providerAutoPricing';
import { useNotification } from '../lib/NotificationContext';
import ImportClientPriceModal from './ImportClientPriceModal';
import ClientVehicleList from './ClientVehicleList';
import ClientRouteList from './ClientRouteList';
import QuoteList from './QuoteList';
import CommercialProposalModal from './CommercialProposalModal';
import ClientPriceCalculator from './ClientPriceCalculator';
import QuotePrintModal from './QuotePrintModal';
import ClientContractTab from './ClientContractTab';

interface ClientFormProps {
  onBack: () => void;
  onAddVehicle: () => void;
  onEditVehicle: (id: string) => void;
  onAddRoute: () => void;
  onEditRoute: (id: string) => void;
  onAddQuote: () => void;
  onEditQuote: (id: string) => void;
  onSave: (client: Client) => void;
  id?: string | null;
}

const REGIONS = ['NÍVEL BRASIL', 'NORTE', 'NORDESTE', 'CENTRO-OESTE', 'SUDESTE', 'SUL'];

const INPUT_CLASS = "w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-green-500/20 focus:border-red-500 text-sm transition-all font-medium";
const LABEL_CLASS = "text-[10px] font-black text-gray-500 uppercase mb-1.5 block tracking-wider";

const parseCurrency = (value: string | number): number => {
    if (value === undefined || value === null || value === '') return 0;
    if (typeof value === 'number') return value;
    let clean = value.toString().trim();
    if (clean.includes(',') && clean.includes('.')) {
        clean = clean.replace(/\./g, '').replace(',', '.');
    } else {
        clean = clean.replace(',', '.');
    }
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
};

const ClientForm: React.FC<ClientFormProps> = ({ 
    onBack, 
    onAddVehicle, onEditVehicle, 
    onAddRoute, onEditRoute, 
    onAddQuote, onEditQuote, 
    onSave, id 
}) => {
  const { showNotification } = useNotification();
  const [activeTab, setActiveTab] = useState<'registration' | 'costs' | 'cancellation' | 'vehicles' | 'routes' | 'quotes' | 'contracts'>('registration');
  const [cancellationDrafts, setCancellationDrafts] = useState<Record<string, string>>({});
  const [savingCancellationId, setSavingCancellationId] = useState<string | null>(null);
  const [cancellationSearch, setCancellationSearch] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    trading_name: '', 
    cnpj: '',
    rg_ie: '',
    contact: '',
    email: '',
    phone: '',
    zip_code: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    operational_email: '',
    medicao_email: '',
    status: 'Ativo',
    whatsapp_group_id: '',
    full_extra_hour_after_16_min: false,
    adjustment_2026_applied: false,
    proposal_2026_sent: false,
    is_prospect: false,
    issuer_company: '',
    nf_service_description: '',
    nf_municipal_service_code: '',
    nf_municipal_service_name: ''
  });
  
  const [osEmailInput, setOsEmailInput] = useState('');
  const [medicaoEmailInput, setMedicaoEmailInput] = useState('');
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [isSearchingCnpj, setIsSearchingCnpj] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [duplicateError, setDuplicateError] = useState('');
  
  const [priceTables, setPriceTables] = useState<ClientPriceTable[]>([]);
  const getEmailList = (field: 'operational_email' | 'medicao_email'): string[] => {
    const val = formData[field] || '';
    return val.split(',').map(e => e.trim()).filter(Boolean);
  };
  const addEmail = (field: 'operational_email' | 'medicao_email', inputVal: string, setInput: (v: string) => void) => {
    const raw = inputVal.trim().toLowerCase();
    if (!raw) return;
    const emails = raw.split(/[\s,;]+/).map(e => e.trim()).filter(e => e && e.includes('@'));
    if (emails.length === 0) return;
    const current = getEmailList(field);
    const newEmails = emails.filter(e => !current.includes(e));
    if (newEmails.length === 0) { setInput(''); return; }
    setFormData({ ...formData, [field]: [...current, ...newEmails].join(', ') });
    setInput('');
  };
  const removeEmail = (field: 'operational_email' | 'medicao_email', emailToRemove: string) => {
    const current = getEmailList(field).filter(e => e !== emailToRemove);
    setFormData({ ...formData, [field]: current.join(', ') });
  };

  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [priceRegion, setPriceRegion] = useState('');
  const [priceDescription, setPriceDescription] = useState('');

  const [priceFormData, setPriceFormData] = useState({
      activation_fee: '',
      franchise_hours: '',
      franchise_km: '',
      price_per_extra_km: '',
      price_per_extra_hour: ''
  });
  const [isSavingPrice, setIsSavingPrice] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [quickQuoteTable, setQuickQuoteTable] = useState<ClientPriceTable | null>(null);

  // States para Reajuste e Seleção
  const [adjustmentPercent, setAdjustmentPercent] = useState('');
  const [isApplyingAdjustment, setIsApplyingAdjustment] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [selectedPriceIds, setSelectedPriceIds] = useState<string[]>([]);
  const [priceSearch, setPriceSearch] = useState<string>('');
  
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [clients, setClientsList] = useState<Client[]>([]);
  const [copySourceClientId, setCopySourceClientId] = useState('');

  // Motor de Precificação Automática (cópia da lógica de ProviderForm, com REGIÃO)
  const AUTO_MASTER_PREFIX = '__AUTO_MASTER__';
  const buildMasterOpType = (region: string) => `${AUTO_MASTER_PREFIX} ${region}`.toUpperCase().trim();
  const parseMasterRegion = (opType: string | null | undefined): string | null => {
    const s = (opType || '').toUpperCase().trim();
    if (!s.startsWith(AUTO_MASTER_PREFIX)) return null;
    return s.substring(AUTO_MASTER_PREFIX.length).trim() || null;
  };
  const [autoMasterRegion, setAutoMasterRegion] = useState<string>('SUDESTE');
  const [autoMasterForm, setAutoMasterForm] = useState({
      baseActivationValue: '',
      baseKmAllowance: '100',
      baseHourAllowance: '3',
      extraKmValue: '',
      extraHourValue: '',
  });
  const [autoMasterRows, setAutoMasterRows] = useState<any[]>([]);
  const [isSavingMaster, setIsSavingMaster] = useState(false);
  const [isMaterializingBands, setIsMaterializingBands] = useState(false);
  const [showAutoPreview, setShowAutoPreview] = useState(false);
  const [lastSuggestionInfo, setLastSuggestionInfo] = useState<string | null>(null);

  const fetchClientData = async () => {
    if (id) {
        setIsLoading(true);
        try {
            const { data, error } = await supabase.from('clients').select('*').eq('id', id).single();
            if (error) throw error;
            if (data) {
                setFormData({
                    name: data.name || '',
                    trading_name: data.trading_name || '',
                    cnpj: data.cnpj || '',
                    rg_ie: data.rg_ie || '',
                    contact: data.contact_name || '',
                    email: data.email || '',
                    phone: data.phone || '',
                    zip_code: data.zip_code || '',
                    street: data.street || '',
                    number: data.number || '',
                    complement: data.complement || '',
                    neighborhood: data.neighborhood || '',
                    city: data.city || '',
                    state: data.state || '',
                    operational_email: data.operational_email || '',
                    medicao_email: data.medicao_email || '',
                    status: data.status || 'Ativo',
                    whatsapp_group_id: data.whatsapp_group_id || '',
                    full_extra_hour_after_16_min: !!data.full_extra_hour_after_16_min,
                    adjustment_2026_applied: !!data.adjustment_2026_applied,
                    proposal_2026_sent: !!data.proposal_2026_sent,
                    is_prospect: !!data.is_prospect,
                    issuer_company: data.issuer_company || '',
                    nf_service_description: data.nf_service_description || '',
                    nf_municipal_service_code: data.nf_municipal_service_code || '',
                    nf_municipal_service_name: data.nf_municipal_service_name || ''
                });
                fetchPriceTables(data.name);
            }
        } catch (error) {
            console.error('Erro ao carregar dados do cliente:', error);
        } finally {
            setIsLoading(false);
        }
    }
  };

  useEffect(() => {
    const storedUser = localStorage.getItem('userData');
    if (storedUser) {
        try { setCurrentUser(JSON.parse(storedUser)); } catch (e) { console.error(e); }
    }
    fetchClientData();
    supabase.from('clients').select('id, name, trading_name').eq('status', 'Ativo').order('name')
        .then(({ data }) => data && setClientsList(data as any));
  }, [id]);

  const handleSearchCNPJ = async () => {
    const cleanCnpj = formData.cnpj.replace(/\D/g, '');
    if (cleanCnpj.length !== 14) return;
    
    setIsSearchingCnpj(true);
    try {
        const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
        if (!response.ok) {
            if (response.status === 404) throw new Error('Este CNPJ não foi localizado na Receita Federal.');
            throw new Error(`Servidor da Receita Federal indisponível (Status: ${response.status})`);
        }
        const data = await response.json();
        
        setFormData(prev => ({
            ...prev,
            name: data.razao_social || prev.name,
            trading_name: data.nome_fantasia || data.razao_social || prev.trading_name,
            zip_code: data.cep || prev.zip_code,
            street: data.logradouro || prev.street,
            neighborhood: data.bairro || prev.neighborhood,
            city: data.municipio || prev.city,
            state: data.uf || prev.state,
            number: data.numero || prev.number,
            contact: data.qsa?.[0]?.nome_socio || prev.contact
        }));
        showNotification('Sucesso', 'Dados do CNPJ importados com sucesso!', 'success');
    } catch (error: any) {
        console.error("CNPJ Lookup error", error);
        showNotification('Aviso', `Consulta CNPJ: ${error.message}. Por favor, preencha manualmente.`, 'warning');
    } finally {
        setIsSearchingCnpj(false);
    }
  };

  const handleCepLookup = async (cep: string) => {
      const cleanCep = cep.replace(/\D/g, '');
      if (cleanCep.length === 8) {
          setIsSearchingCep(true);
          try {
              const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
              const data = await res.json();
              if (!data.erro) {
                  setFormData(prev => ({
                      ...prev,
                      street: data.logradouro,
                      neighborhood: data.bairro,
                      city: data.localidade,
                      state: data.uf,
                      zip_code: cleanCep
                  }));
                  showNotification('Endereço Encontrado', `${data.logradouro}, ${data.bairro}`, 'success');
              } else {
                  showNotification('Aviso', 'CEP não localizado.', 'warning');
              }
          } catch (e) {
              console.error("CEP error", e);
              showNotification('Erro', 'Falha ao buscar CEP.', 'error');
          } finally {
              setIsSearchingCep(false);
          }
      }
  };

  const isFinanceAdmin = currentUser && (() => {
      const r = (currentUser.role || '').toLowerCase();
      const perms = currentUser.permissions || [];
      return r === 'diretoria' || r === 'administrador' || r === 'comercial' ||
             perms.includes('*');
  })();

  const canEditOsEmail = currentUser && (() => {
      const r = (currentUser.role || '').toLowerCase();
      const n = (currentUser.name || '').toUpperCase();
      return r === 'diretoria' || r === 'administrador' || 
             n.includes('DANIEL') || n.includes('MICHELLE') || n.includes('THIAGO');
  })();

  const fetchPriceTables = async (clientName: string) => {
      const { data } = await supabase.from('client_price_tables').select('*').or(clientFuzzyFilter(clientName)).order('franchise_km', { ascending: true });
      if (data) {
          const masters: any[] = [];
          const regular: any[] = [];
          (data as any[]).forEach(r => {
              if (parseMasterRegion(r.operation_type)) masters.push(r);
              else regular.push(r);
          });
          setPriceTables(regular as any);
          setAutoMasterRows(masters);
      }
      setSelectedPriceIds([]); 
  };

  // Sincroniza o formulário do motor com a região selecionada (carrega master existente)
  useEffect(() => {
      const existing = autoMasterRows.find(r => parseMasterRegion(r.operation_type) === autoMasterRegion);
      if (existing) {
          setAutoMasterForm({
              baseActivationValue: existing.activation_fee != null ? String(existing.activation_fee) : '',
              baseKmAllowance: existing.franchise_km != null ? String(existing.franchise_km) : '100',
              baseHourAllowance: existing.franchise_hours != null ? String(existing.franchise_hours) : '3',
              extraKmValue: existing.price_per_extra_km != null ? String(existing.price_per_extra_km) : '',
              extraHourValue: existing.price_per_extra_hour != null ? String(existing.price_per_extra_hour) : '',
          });
      } else {
          setAutoMasterForm({ baseActivationValue: '', baseKmAllowance: '100', baseHourAllowance: '3', extraKmValue: '', extraHourValue: '' });
      }
      setLastSuggestionInfo(null);
      setShowAutoPreview(false);
  }, [autoMasterRegion, autoMasterRows]);

  const canEditAutoMaster = (() => {
      if (!currentUser) return false;
      const r = (currentUser?.role || '').toLowerCase();
      return r === 'diretoria' || r === 'administrador' || r === 'financeiro' || r === 'comercial';
  })();

  const autoMasterConfig: ProviderAutoMasterConfig = {
      baseActivationValue: parseFloat(autoMasterForm.baseActivationValue) || 0,
      baseKmAllowance: parseFloat(autoMasterForm.baseKmAllowance) || 0,
      baseHourAllowance: parseFloat(autoMasterForm.baseHourAllowance) || 0,
      extraKmValue: parseFloat(autoMasterForm.extraKmValue) || 0,
      extraHourValue: parseFloat(autoMasterForm.extraHourValue) || 0,
  };

  const autoPreviewBands = (() => {
      const cfg = autoMasterConfig;
      if (cfg.baseActivationValue <= 0 || cfg.baseKmAllowance <= 0) return [];
      return generateAutoBands(cfg);
  })();

  const currentMasterRow = autoMasterRows.find(r => parseMasterRegion(r.operation_type) === autoMasterRegion);
  const autoMasterEnabled = !!currentMasterRow;

  const handleSuggestAutoMaster = () => {
      if (!canEditAutoMaster) { showNotification('Sem permissão', 'Apenas diretoria/administrador/financeiro/comercial pode configurar o motor automático.', 'error'); return; }
      // Filtra tabelas manuais pela região selecionada (prefixo "<REGIÃO> - ...")
      const prefix = `${autoMasterRegion} - `.toUpperCase();
      const sample = priceTables.filter(t => (t.operation_type || '').toUpperCase().startsWith(prefix));
      // Adapta para o formato esperado pelo helper (que espera campos do provider)
      const adapted = sample.map(t => ({
          operation_type: t.operation_type,
          activation_cost: t.activation_fee,
          franchise_km: t.franchise_km,
          franchise_hours: t.franchise_hours,
          cost_per_extra_km: t.price_per_extra_km,
          cost_per_extra_hour: t.price_per_extra_hour,
      }));
      const suggestion = suggestAutoMasterFromManualTables(adapted);
      if (!suggestion) {
          showNotification('Sem dados', `Não há tabelas manuais para a região ${autoMasterRegion} cadastradas.`, 'warning');
          return;
      }
      const { config, sampleCount } = suggestion;
      setAutoMasterForm({
          baseActivationValue: config.baseActivationValue ? String(config.baseActivationValue) : '',
          baseKmAllowance: config.baseKmAllowance ? String(config.baseKmAllowance) : '100',
          baseHourAllowance: config.baseHourAllowance ? String(config.baseHourAllowance) : '3',
          extraKmValue: config.extraKmValue ? String(config.extraKmValue) : '',
          extraHourValue: config.extraHourValue ? String(config.extraHourValue) : '',
      });
      setLastSuggestionInfo(`Sugestão calculada a partir da mediana de ${sampleCount} tabela${sampleCount > 1 ? 's' : ''} manual${sampleCount > 1 ? 'is' : ''} da região ${autoMasterRegion}. Revise antes de salvar.`);
      showNotification('Sugestão pronta', `Valores pré-preenchidos com a mediana de ${sampleCount} tabela${sampleCount > 1 ? 's' : ''}. Revise e ajuste antes de ativar.`, 'success');
  };

  const handleSaveAutoMaster = async () => {
      if (!id || !formData.name) { showNotification('Atenção', 'Salve o cliente primeiro.', 'warning'); return; }
      if (!canEditAutoMaster) { showNotification('Sem permissão', 'Apenas diretoria/administrador/financeiro/comercial pode configurar o motor automático.', 'error'); return; }
      if (!autoMasterRegion) { showNotification('Atenção', 'Selecione uma região.', 'warning'); return; }
      const cfg = autoMasterConfig;
      if (cfg.baseActivationValue <= 0 || cfg.baseKmAllowance <= 0 || cfg.baseHourAllowance <= 0 || cfg.extraKmValue < 0 || cfg.extraHourValue < 0) {
          showNotification('Atenção', 'Preencha as 5 variáveis mestre com valores positivos.', 'warning');
          return;
      }
      setIsSavingMaster(true);
      try {
          const opType = buildMasterOpType(autoMasterRegion);
          const payload: any = {
              client: formData.name,
              operation_type: opType,
              activation_fee: cfg.baseActivationValue,
              franchise_km: cfg.baseKmAllowance,
              franchise_hours: cfg.baseHourAllowance,
              price_per_extra_km: cfg.extraKmValue,
              price_per_extra_hour: cfg.extraHourValue,
          };
          if (currentMasterRow) {
              const { error } = await supabase.from('client_price_tables').update(payload).eq('id', currentMasterRow.id);
              if (error) throw error;
          } else {
              const { error } = await supabase.from('client_price_tables').insert([payload]);
              if (error) throw error;
          }
          await logAction('UPDATE', 'ClientAutoMaster', formData.name, `Motor Auto Cliente — ${formData.name} / ${autoMasterRegion}: base R$${cfg.baseActivationValue}, ${cfg.baseKmAllowance}km/${cfg.baseHourAllowance}h, +R$${cfg.extraKmValue}/km, +R$${cfg.extraHourValue}/h`);
          setLastSuggestionInfo(null);
          showNotification('Sucesso', `Configuração mestre salva para ${autoMasterRegion}.`, 'success');
          fetchPriceTables(formData.name);
      } catch (err: any) {
          showNotification('Erro', 'Falha ao salvar configuração mestre: ' + (err?.message || 'erro desconhecido'), 'error');
      } finally {
          setIsSavingMaster(false);
      }
  };

  const handleDisableAutoMaster = async () => {
      if (!currentMasterRow) return;
      if (!canEditAutoMaster) { showNotification('Sem permissão', 'Apenas diretoria/administrador/financeiro/comercial pode alterar.', 'error'); return; }
      if (!confirm(`Desligar o motor automático para a região ${autoMasterRegion}? As tabelas manuais continuarão sendo usadas.`)) return;
      try {
          const { error } = await supabase.from('client_price_tables').delete().eq('id', currentMasterRow.id);
          if (error) throw error;
          await logAction('DELETE', 'ClientAutoMaster', formData.name, `Motor Auto Cliente desligado: ${formData.name} / ${autoMasterRegion}`);
          showNotification('Sucesso', `Motor automático desligado para ${autoMasterRegion}.`, 'success');
          fetchPriceTables(formData.name);
      } catch (err: any) {
          showNotification('Erro', 'Falha ao desligar: ' + (err?.message || 'erro desconhecido'), 'error');
      }
  };

  const handleMaterializeBands = async () => {
      if (!formData.name) { showNotification('Atenção', 'Salve o cliente primeiro.', 'warning'); return; }
      if (!canEditAutoMaster) { showNotification('Sem permissão', 'Apenas diretoria/administrador/financeiro/comercial pode gerar tabelas.', 'error'); return; }
      const cfg = autoMasterConfig;
      if (cfg.baseActivationValue <= 0 || cfg.baseKmAllowance <= 0) {
          showNotification('Atenção', 'Configure as variáveis mestre antes de gerar as tabelas.', 'warning');
          return;
      }
      const bands = generateAutoBands(cfg);
      if (bands.length === 0) { showNotification('Atenção', 'Nenhuma faixa para salvar.', 'warning'); return; }
      if (!confirm(`Salvar as ${bands.length} faixas como tabelas de preço para "${formData.name}" na região ${autoMasterRegion}?\n\nTabelas anteriores com nome "${autoMasterRegion} - <KM>KM" (faixas automáticas) serão substituídas.`)) return;
      setIsMaterializingBands(true);
      try {
          // Limpa faixas anteriores: tanto o formato novo "REGIÃO - 100KM" quanto o legado "REGIÃO - AUTO 100KM".
          const { data: oldRows } = await supabase
              .from('client_price_tables')
              .select('id, operation_type')
              .eq('client', formData.name)
              .like('operation_type', `${autoMasterRegion} - %KM`);
          const oldIds = (oldRows || [])
              .filter(r => /^\s*[A-ZÇÃÊÉÁÍÓÚ\-]+\s+-\s+(AUTO\s+)?\d+KM\s*$/i.test(r.operation_type || ''))
              .map(r => r.id);
          if (oldIds.length > 0) {
              await supabase.from('client_price_tables').delete().in('id', oldIds);
          }
          const rows = bands.map(b => ({
              client: formData.name,
              operation_type: `${autoMasterRegion} - ${b.kmFaixa}KM`,
              activation_fee: b.valorBase,
              franchise_km: b.kmFaixa,
              franchise_hours: b.franquiaHoras,
              price_per_extra_km: cfg.extraKmValue,
              price_per_extra_hour: cfg.extraHourValue,
          }));
          const { error } = await supabase.from('client_price_tables').insert(rows);
          if (error) throw error;
          await logAction('CREATE', 'ClientPriceTable', formData.name, `Geradas ${rows.length} tabelas AUTO (${autoMasterRegion}) para o cliente ${formData.name}`);
          showNotification('Sucesso', `${rows.length} tabelas AUTO geradas para ${autoMasterRegion}.`, 'success');
          fetchPriceTables(formData.name);
      } catch (err: any) {
          showNotification('Erro', 'Falha ao gerar tabelas: ' + (err?.message || 'erro desconhecido'), 'error');
      } finally {
          setIsMaterializingBands(false);
      }
  };

  const handleApplyAnnualAdjustment = async () => {
      if (selectedPriceIds.length === 0) {
          showNotification('Atenção', 'Selecione pelo menos um item da tabela para reajustar.', 'warning');
          return;
      }

      const tablesToUpdate = priceTables.filter(t => selectedPriceIds.includes(t.id));
      const alreadyAdjusted = tablesToUpdate.filter(t => t.adjustment_status);
      if (alreadyAdjusted.length > 0) {
          const names = alreadyAdjusted.map(t => t.operation_type).join('\n');
          if (!confirm(`AVISO DE DUPLICIDADE:\n\nOs seguintes itens já constam como reajustados:\n${names}\n\nDeseja reajustar novamente?`)) {
              return;
          }
      }

      const percent = parseFloat(adjustmentPercent);
      if (isNaN(percent) || percent === 0) { showNotification('Atenção', 'Informe uma porcentagem válida.', 'warning'); return; }
      
      const msg = `APLICAR REAJUSTE DE ${percent}% NOS ${selectedPriceIds.length} ITENS SELECIONADOS?\n\nDeseja continuar?`;
      if (!confirm(msg)) return;

      setIsApplyingAdjustment(true);
      try {
          const factor = 1 + (percent / 100);
          const now = new Date().toISOString();

          const updates = tablesToUpdate.map(table => {
              return supabase.from('client_price_tables').update({
                  previous_activation_fee: table.activation_fee,
                  previous_price_per_extra_km: table.price_per_extra_km,
                  previous_price_per_extra_hour: table.price_per_extra_hour,
                  activation_fee: table.activation_fee * factor,
                  price_per_extra_km: table.price_per_extra_km * factor,
                  price_per_extra_hour: table.price_per_extra_hour * factor,
                  adjustment_status: true,
                  last_adjustment_date: now
              }).eq('id', table.id);
          });

          const updateResults = await Promise.all(updates);
          const failedUpdate = updateResults.find(r => r?.error);
          if (failedUpdate?.error) throw failedUpdate.error;
          
          if (id) {
              const flagRes = await supabase.from('clients').update({ adjustment_2026_applied: true }).eq('id', id);
              if (flagRes.error) throw flagRes.error;
              setFormData(prev => ({ ...prev, adjustment_2026_applied: true }));
          }

          await logAction('UPDATE', 'AnnualAdjustment', id || 'unknown', `Reajuste aplicado.`);
          fetchPriceTables(formData.name);
      } catch (e) {
          const msg = e instanceof Error ? e.message : 'Erro desconhecido';
          showNotification('Erro', 'Erro ao aplicar reajuste: ' + msg, 'error');
      } finally {
          setIsApplyingAdjustment(false);
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (duplicateError) return;
    setIsSaving(true);
    try {
      const fullAddress = `${formData.street}, ${formData.number}${formData.complement ? ' - ' + formData.complement : ''}, ${formData.neighborhood}, ${formData.city} - ${formData.state}, CEP: ${formData.zip_code}`;

      const payload: any = {
        name: formData.name, 
        trading_name: formData.trading_name, 
        cnpj: formData.cnpj,
        rg_ie: formData.rg_ie,
        contact_name: formData.contact, 
        email: formData.email, 
        phone: formData.phone,
        zip_code: formData.zip_code,
        street: formData.street,
        number: formData.number,
        complement: formData.complement,
        neighborhood: formData.neighborhood,
        city: formData.city,
        state: formData.state,
        address: fullAddress,
        operational_email: formData.operational_email?.toLowerCase() || null,
        medicao_email: formData.medicao_email?.toLowerCase() || null,
        status: formData.status, 
        whatsapp_group_id: formData.whatsapp_group_id || null,
        full_extra_hour_after_16_min: formData.full_extra_hour_after_16_min,
        adjustment_2026_applied: formData.adjustment_2026_applied,
        proposal_2026_sent: formData.proposal_2026_sent,
        is_prospect: formData.is_prospect,
        issuer_company: formData.issuer_company || null,
        nf_service_description: formData.nf_service_description?.trim() || null,
        nf_municipal_service_code: formData.nf_municipal_service_code?.trim() || null,
        nf_municipal_service_name: formData.nf_municipal_service_name?.trim() || null
      };

      if (id) {
          let { error: updErr } = await supabase.from('clients').update(payload).eq('id', id);
          if (updErr && updErr.code === '42703') {
            const { operational_email, ...safePayload } = payload;
            const res2 = await supabase.from('clients').update(safePayload).eq('id', id);
            updErr = res2.error;
          }
          if (updErr) throw updErr;
          await logAction('UPDATE', 'Client', id, `Cliente atualizado: ${formData.name}`);
      } else {
          payload.created_by = currentUser?.name || 'SISTEMA';
          let { error: insErr } = await supabase.from('clients').insert([payload]).select();
          if (insErr && insErr.code === '42703') {
            const { operational_email, ...safePayload } = payload;
            safePayload.created_by = currentUser?.name || 'SISTEMA';
            const res2 = await supabase.from('clients').insert([safePayload]).select();
            insErr = res2.error;
          }
          if (insErr) throw insErr;
          await logAction('CREATE', 'Client', 'NEW', `Cliente cadastrado: ${formData.name}`);
      }
      onBack();
    } catch (error) { 
        console.error(error);
        const msg = error instanceof Error ? error.message : 'Erro desconhecido';
        showNotification('Erro', 'Erro ao salvar cliente: ' + msg, 'error');
    } finally { setIsSaving(false); }
  };

  const handlePriceSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!formData.name) { showNotification('Atenção', 'Salve o cliente primeiro.', 'warning'); return; }
      setIsSavingPrice(true);
      try {
          const finalOpType = `${priceRegion} - ${priceDescription}`.toUpperCase();
          const payload = {
              client: formData.name, operation_type: finalOpType,
              activation_fee: parseCurrency(priceFormData.activation_fee),
              franchise_hours: parseCurrency(priceFormData.franchise_hours),
              franchise_km: parseCurrency(priceFormData.franchise_km),
              price_per_extra_km: parseCurrency(priceFormData.price_per_extra_km),
              price_per_extra_hour: parseCurrency(priceFormData.price_per_extra_hour),
          };
          if (editingPriceId) {
              const { error } = await supabase.from('client_price_tables').update(payload).eq('id', editingPriceId);
              if (error) throw new Error('Erro ao salvar tabela de preço: ' + error.message);
          } else {
              const { error } = await supabase.from('client_price_tables').insert([payload]);
              if (error) throw new Error('Erro ao criar tabela de preço: ' + error.message);
          }
          
          setEditingPriceId(null);
          setPriceRegion(''); setPriceDescription('');
          setPriceFormData({ activation_fee: '', franchise_hours: '', franchise_km: '', price_per_extra_km: '', price_per_extra_hour: '' });
          fetchPriceTables(formData.name);
      } catch (err) {
          const msg = err instanceof Error ? err.message : 'Erro desconhecido';
          showNotification('Erro', msg, 'error');
      } finally { setIsSavingPrice(false); }
  };

  const handleEditPrice = (table: ClientPriceTable) => {
      setEditingPriceId(table.id);
      const parts = table.operation_type.split(' - ');
      let region = ''; let desc = table.operation_type;
      if (parts.length > 1 && REGIONS.includes(parts[0])) { region = parts[0]; desc = parts.slice(1).join(' - '); }
      setPriceRegion(region); setPriceDescription(desc);
      setPriceFormData({
          activation_fee: table.activation_fee.toString(), 
          franchise_hours: table.franchise_hours.toString(),
          franchise_km: table.franchise_km.toString(), 
          price_per_extra_km: table.price_per_extra_km.toString(),
          price_per_extra_hour: table.price_per_extra_hour.toString()
      });
  };

  const handleCopyPriceTable = async () => {
    if (!copySourceClientId || !formData.name) return;
    const sourceClient = clients.find(c => c.id.toString() === copySourceClientId);
    if (!sourceClient) return;
    if (!confirm(`Deseja copiar o tarifário de "${sourceClient.name}" para "${formData.name}"?`)) return;
    setIsSavingPrice(true);
    try {
        const { data: sourceTables, error: fetchError } = await supabase.from('client_price_tables').select('*').or(clientFuzzyFilter(sourceClient.name));
        if (fetchError) throw fetchError;
        if (!sourceTables || sourceTables.length === 0) {
            showNotification('Atenção', 'O cliente de origem não possui tabelas de preço.', 'warning');
            return;
        }
        const newTables = sourceTables.map((t: any) => ({
            client: formData.name, operation_type: t.operation_type, activation_fee: t.activation_fee,
            franchise_hours: t.franchise_hours, franchise_km: t.franchise_km, price_per_extra_km: t.price_per_extra_km,
            price_per_extra_hour: t.price_per_extra_hour, regional_costs: t.regional_costs
        }));
        const { error: insertError } = await supabase.from('client_price_tables').insert(newTables);
        if (insertError) throw insertError;
        showNotification('Sucesso', 'Tarifário copiado com sucesso!', 'success');
        fetchPriceTables(formData.name);
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erro desconhecido';
        showNotification('Erro', 'Erro ao copiar: ' + msg, 'error');
    } finally { setIsSavingPrice(false); setCopySourceClientId(''); }
  };

  const handleUndoAdjustment = async () => {
      if (selectedPriceIds.length === 0) { showNotification('Atenção', 'Selecione pelo menos um item para reverter.', 'warning'); return; }
      if (!confirm(`REVERTER REAJUSTE: Deseja restaurar os valores originais dos itens selecionados?`)) return;
      setIsReverting(true);
      try {
          const tablesToRevert = priceTables.filter(t => selectedPriceIds.includes(t.id) && t.adjustment_status);
          const updates = tablesToRevert.map(table => {
              return supabase.from('client_price_tables').update({
                  activation_fee: table.previous_activation_fee || table.activation_fee,
                  price_per_extra_km: table.previous_price_per_extra_km || table.price_per_extra_km,
                  price_per_extra_hour: table.previous_price_per_extra_hour || table.price_per_extra_hour,
                  previous_activation_fee: null, previous_price_per_extra_km: null, previous_price_per_extra_hour: null,
                  adjustment_status: false, last_adjustment_date: null
              }).eq('id', table.id);
          });
          const undoResults = await Promise.all(updates);
          const failedUndo = undoResults.find(r => r?.error);
          if (failedUndo?.error) throw failedUndo.error;
          showNotification('Sucesso', 'Reajuste revertido!', 'success');
          fetchPriceTables(formData.name);
      } catch (e) {
          const msg = e instanceof Error ? e.message : 'Erro desconhecido';
          showNotification('Erro', 'Erro ao reverter: ' + msg, 'error');
      } finally { setIsReverting(false); }
  };

  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const handleBulkDeletePrices = async () => {
      if (selectedPriceIds.length === 0) { showNotification('Atenção', 'Selecione pelo menos um item para excluir.', 'warning'); return; }
      if (!confirm(`EXCLUIR ${selectedPriceIds.length} tabela(s) de preço selecionada(s)?\n\nEsta ação não pode ser desfeita.`)) return;
      setIsBulkDeleting(true);
      try {
          const ids = [...selectedPriceIds];
          const { error } = await supabase.from('client_price_tables').delete().in('id', ids);
          if (error) throw error;
          await logAction('DELETE', 'ClientPriceTable', ids.join(','), `Exclusão em massa: ${ids.length} tabelas de preço do cliente ${formData.name}`);
          showNotification('Sucesso', `${ids.length} tabela(s) excluída(s).`, 'success');
          setSelectedPriceIds([]);
          fetchPriceTables(formData.name);
      } catch (e) {
          const msg = e instanceof Error ? e.message : 'Erro desconhecido';
          showNotification('Erro', 'Erro ao excluir: ' + msg, 'error');
      } finally { setIsBulkDeleting(false); }
  };

  const handleSelectAllPrices = () => {
      if (selectedPriceIds.length === priceTables.length && priceTables.length > 0) setSelectedPriceIds([]);
      else setSelectedPriceIds(priceTables.map(t => t.id));
  };

  const handleSelectPriceRow = (id: string) => {
      setSelectedPriceIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  if (isLoading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-red-600" /></div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in slide-in-from-right-4 duration-300 relative pb-20">
      {isImportModalOpen && <ImportClientPriceModal onClose={() => setIsImportModalOpen(false)} onSuccess={() => fetchPriceTables(formData.name)} fixedClientName={formData.name} />}
      {quickQuoteTable && (
          <QuotePrintModal 
              quote={{
                  id: 'COTAÇÃO', client_id: parseInt(id || '0'), client_name: formData.trading_name || formData.name,
                  origin: '', destination: '', total_km: quickQuoteTable.franchise_km, total_hours: quickQuoteTable.franchise_hours,
                  total_value: quickQuoteTable.activation_fee, status: 'Rascunho', created_at: new Date().toISOString(), created_by: JSON.parse(localStorage.getItem('userData') || '{}').name || '',
                  contract_details: `Operação: ${quickQuoteTable.operation_type}\nAcionamento: R$ ${(quickQuoteTable.activation_fee ?? 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\nFranquia KM: ${quickQuoteTable.franchise_km} km\nFranquia Horas: ${quickQuoteTable.franchise_hours}h\nKM Excedente: R$ ${(quickQuoteTable.price_per_extra_km ?? 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\nHora Excedente: R$ ${(quickQuoteTable.price_per_extra_hour ?? 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\nValidade da Proposta: 5 dias.`
              }} 
              onClose={() => setQuickQuoteTable(null)} 
          />
      )}
      {isProposalModalOpen && (
          <CommercialProposalModal 
            onClose={() => { setIsProposalModalOpen(false); fetchClientData(); }} 
            clientName={formData.trading_name || formData.name} 
            priceTables={priceTables} 
            contactName={formData.contact} 
            email={formData.email} 
            cnpj={formData.cnpj} 
            rg_ie={formData.rg_ie}
            zip_code={formData.zip_code}
            street={formData.street}
            number={formData.number}
            complement={formData.complement}
            neighborhood={formData.neighborhood}
            city={formData.city}
            state={formData.state}
            address={`${formData.street}, ${formData.number}, ${formData.city}-${formData.state}`} 
          />
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"><ArrowLeft size={20} /></button>
            <div>
                <h2 className="text-xl font-bold text-gray-900" data-testid="text-client-form-title">{id ? 'Editar Cliente' : 'Novo Cliente'}</h2>
                {id && formData.name && (
                    <p className="text-sm text-gray-600 font-semibold mt-0.5 uppercase tracking-wide" data-testid="text-client-form-name">{formData.name}</p>
                )}
            </div>
        </div>
        {isFinanceAdmin && <div className="flex gap-3">
            <button onClick={() => setShowCalculator(!showCalculator)} className={`px-6 py-2.5 rounded-xl text-sm font-black flex items-center gap-2 shadow-xl transition-all uppercase border ${showCalculator ? 'bg-red-600 text-white border-red-700' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>
                <Calculator size={18} /> Simulador Comercial
            </button>
            {id && <button onClick={() => setIsProposalModalOpen(true)} className="bg-black text-white px-6 py-2.5 rounded-xl text-sm font-black flex items-center gap-2 shadow-xl hover:bg-gray-800 transition-all uppercase"><ScrollText size={18} /> Gerar Contrato / Proposta</button>}
        </div>}
      </div>

      {showCalculator && (
          <div className="animate-in slide-in-from-top-4 duration-300">
              <ClientPriceCalculator clientName={formData.name} clientId={id || '0'} priceTables={priceTables} />
          </div>
      )}

      <div className="flex flex-wrap gap-2 bg-white p-1.5 rounded-xl w-full lg:w-fit shadow-sm border border-gray-200">
          {[ { id: 'registration', label: 'Dados Cadastrais', icon: Users }, { id: 'contracts', label: 'Contratos', icon: ScrollText }, { id: 'costs', label: 'Tabela de Preços', icon: DollarSign }, { id: 'cancellation', label: 'Cancelamento', icon: XCircle }, { id: 'vehicles', label: 'Veículos (Carga)', icon: Truck }, { id: 'routes', label: 'Rotas Fixas', icon: Navigation }, { id: 'quotes', label: 'Cotações', icon: FileText } ].filter(tab => {
              if (tab.id === 'registration') return true;
              if (tab.id === 'contracts') return !!id && isFinanceAdmin;
              return isFinanceAdmin;
          }).map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all uppercase ${activeTab === tab.id ? 'bg-black text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}><tab.icon size={14} /> {tab.label}</button>
          ))}
      </div>

      {activeTab === 'registration' && (
          <form onSubmit={handleSubmit} className="space-y-6">
             <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="text-red-600" size={18} />
                        <h3 className="font-black text-xs uppercase text-gray-700 tracking-widest">Identificação Jurídica</h3>
                    </div>
                    
                    <div className="flex items-center gap-4 bg-gray-100 p-1 rounded-xl border border-gray-200">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-2">Perfil Comercial:</span>
                        <button 
                            type="button"
                            onClick={() => setFormData({...formData, is_prospect: false})}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${!formData.is_prospect ? 'bg-green-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <UserCheck size={14} /> Cliente Efetivo
                        </button>
                        <button 
                            type="button"
                            onClick={() => setFormData({...formData, is_prospect: true})}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${formData.is_prospect ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <Target size={14} /> Prospecção / Lead
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-1.5">
                        <label className={LABEL_CLASS}>CPF / CNPJ *</label>
                        <div className="relative">
                            <input 
                                type="text" 
                                className={`${INPUT_CLASS} pl-10 pr-12`} 
                                required 
                                value={formData.cnpj} 
                                onChange={e => setFormData({...formData, cnpj: e.target.value})}
                                onBlur={handleSearchCNPJ}
                            />
                            <Fingerprint className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <button 
                                type="button" 
                                onClick={handleSearchCNPJ}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                                disabled={isSearchingCnpj}
                            >
                                {isSearchingCnpj ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                            </button>
                        </div>
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                        <label className={LABEL_CLASS}>Razão Social *</label>
                        <div className="relative">
                            <input type="text" className={`${INPUT_CLASS} pl-10`} required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value.toUpperCase()})} />
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL_CLASS}>Nome Fantasia</label>
                        <input type="text" className={INPUT_CLASS} value={formData.trading_name} onChange={e => setFormData({...formData, trading_name: e.target.value.toUpperCase()})} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL_CLASS}>RG / Inscrição Estadual (Opcional)</label>
                        <input type="text" className={INPUT_CLASS} value={formData.rg_ie} onChange={e => setFormData({...formData, rg_ie: e.target.value.toUpperCase()})} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL_CLASS}>Representante Legal (Contato) *</label>
                        <div className="relative">
                            <input type="text" className={`${INPUT_CLASS} pl-10`} required value={formData.contact} onChange={e => setFormData({...formData, contact: e.target.value})} />
                            <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL_CLASS}>Status Operacional</label>
                        <select className={INPUT_CLASS} value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} data-testid="select-client-status">
                            <option value="Ativo">Ativo</option>
                            <option value="Inativo">Inativo</option>
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL_CLASS}>Empresa Emissora (NF / Asaas)</label>
                        <select className={INPUT_CLASS} value={formData.issuer_company} onChange={e => setFormData({...formData, issuer_company: e.target.value})} data-testid="select-client-issuer-company">
                            <option value="">Selecione...</option>
                            <option value="TM GESTÃO">TM GESTÃO — CNPJ 60.485.843/0001-57</option>
                            <option value="TM SEGURANÇA">TM SEGURANÇA — CNPJ 60.508.931/0001-27</option>
                            <option value="TM SECURITY">TM SECURITY — CNPJ 60.508.931/0001-27</option>
                        </select>
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                        <label className={LABEL_CLASS}>Descrição padrão do serviço (NF-e deste cliente)</label>
                        <textarea
                            className={INPUT_CLASS}
                            rows={2}
                            value={formData.nf_service_description}
                            onChange={e => setFormData({...formData, nf_service_description: e.target.value})}
                            placeholder="Ex.: Ref. aos Serviços de Intermediação de Escolta Armada — contrato XYZ"
                            maxLength={250}
                            data-testid="input-client-nf-service-description"
                        />
                        <span className="text-[10px] text-gray-400">Quando preenchido, sobrescreve a descrição padrão da empresa emissora. Use para evitar erros do tipo NFe003 (descrição do serviço municipal).</span>
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL_CLASS}>Código serviço municipal (NF)</label>
                        <input
                            type="text"
                            className={INPUT_CLASS}
                            value={formData.nf_municipal_service_code}
                            onChange={e => setFormData({...formData, nf_municipal_service_code: e.target.value})}
                            placeholder="Ex.: 07930"
                            data-testid="input-client-nf-municipal-service-code"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL_CLASS}>Nome serviço municipal (NF)</label>
                        <input
                            type="text"
                            className={INPUT_CLASS}
                            value={formData.nf_municipal_service_name}
                            onChange={e => setFormData({...formData, nf_municipal_service_name: e.target.value})}
                            placeholder="Ex.: 07930 - Monitoramento e rastreamento..."
                            maxLength={200}
                            data-testid="input-client-nf-municipal-service-name"
                        />
                    </div>
                    <div className="space-y-1.5 flex items-end">
                        <label className="group relative w-full cursor-pointer">
                            <input 
                                 type="checkbox" 
                                 className="peer hidden" 
                                 checked={formData.full_extra_hour_after_16_min} 
                                 onChange={e => setFormData({...formData, full_extra_hour_after_16_min: e.target.checked})} 
                            />
                            <div className={`relative overflow-hidden rounded-xl border px-3 py-2 transition-all duration-300 ease-out active:scale-95 ${
                                formData.full_extra_hour_after_16_min 
                                ? 'bg-slate-900 border-slate-800 shadow-[0_0_20px_rgba(16,185,129,0.3)]' 
                                : 'bg-white border-gray-200 shadow-[0_4px_0_0_rgba(0,0,0,0.05)] hover:border-gray-300'
                            }`}>
                                <div className="flex items-center justify-between relative z-10">
                                    <div className="flex items-center gap-3">
                                         <div className={`flex h-8 w-8 items-center justify-center rounded-lg shadow-inner transition-all duration-300 ${
                                             formData.full_extra_hour_after_16_min 
                                             ? 'bg-emerald-600 text-white shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]' 
                                             : 'bg-gray-100 text-gray-400'
                                         }`}>
                                             <Clock size={16} strokeWidth={3} className={formData.full_extra_hour_after_16_min ? "animate-pulse" : ""} />
                                         </div>
                                         <div className="flex flex-col">
                                             <span className={`text-[9px] font-black uppercase tracking-widest transition-colors ${
                                                 formData.full_extra_hour_after_16_min ? 'text-emerald-400' : 'text-gray-400'
                                             }`}>
                                                 Regra 15 Min
                                             </span>
                                             <span className={`text-xs font-bold uppercase transition-colors ${
                                                 formData.full_extra_hour_after_16_min ? 'text-white' : 'text-gray-600'
                                             }`}>
                                                 {formData.full_extra_hour_after_16_min ? 'Hora Cheia (Habilitado)' : 'Desativado'}
                                             </span>
                                         </div>
                                    </div>
                                    <div className={`h-3 w-3 rounded-full border transition-all duration-300 ${
                                        formData.full_extra_hour_after_16_min 
                                        ? 'border-emerald-500 bg-emerald-500 shadow-[0_0_10px_#10b981]' 
                                        : 'border-gray-300 bg-transparent'
                                    }`}></div>
                                </div>
                                {/* Glow Effect */}
                                {formData.full_extra_hour_after_16_min && (
                                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-transparent to-transparent opacity-50" />
                                )}
                            </div>
                        </label>
                    </div>
                </div>
             </div>

             <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
                    <MapIcon className="text-red-600" size={18} />
                    <h3 className="font-black text-xs uppercase text-gray-700 tracking-widest">Localização e Contato</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-x-6 gap-y-4">
                    <div className="space-y-1.5">
                        <label className={LABEL_CLASS}>E-mail Contratual</label>
                        <div className="relative">
                            <input type="email" className={`${INPUT_CLASS} pl-10`} value={formData.email} onChange={e => setFormData({...formData, email: e.target.value.toLowerCase()})} />
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        </div>
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                        <label className={LABEL_CLASS}>E-mail Operacional (OS)</label>
                        {canEditOsEmail ? (
                          <>
                            <div className="flex gap-1.5">
                                <div className="relative flex-1">
                                    <input type="text" className={`${INPUT_CLASS} pl-10 pr-10`} placeholder="Digite o e-mail..." value={osEmailInput} onChange={e => setOsEmailInput(e.target.value.toLowerCase())} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEmail('operational_email', osEmailInput, setOsEmailInput))} onPaste={e => { e.preventDefault(); const text = e.clipboardData.getData('text'); addEmail('operational_email', text, setOsEmailInput); }} data-testid="input-operational-email" />
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-500" size={16} />
                                </div>
                                <button type="button" onClick={() => addEmail('operational_email', osEmailInput, setOsEmailInput)} className="p-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors shadow-sm"><Plus size={16}/></button>
                            </div>
                            {getEmailList('operational_email').length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                    {getEmailList('operational_email').map(em => (
                                        <span key={em} className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg text-[11px] font-bold">
                                            <Mail size={10}/> {em}
                                            <button type="button" onClick={() => removeEmail('operational_email', em)} className="ml-0.5 text-orange-400 hover:text-red-600"><X size={12}/></button>
                                        </span>
                                    ))}
                                </div>
                            )}
                          </>
                        ) : (
                          <div>
                            {getEmailList('operational_email').length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                    {getEmailList('operational_email').map(em => (
                                        <span key={em} className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg text-[11px] font-bold">
                                            <Mail size={10}/> {em}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-gray-400 italic mt-1">Sem permissão para editar</p>
                            )}
                          </div>
                        )}
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                        <label className={LABEL_CLASS}>E-mail Medição</label>
                        <div className="flex gap-1.5">
                            <div className="relative flex-1">
                                <input type="text" className={`${INPUT_CLASS} pl-10 pr-10`} placeholder="Digite o e-mail..." value={medicaoEmailInput} onChange={e => setMedicaoEmailInput(e.target.value.toLowerCase())} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEmail('medicao_email', medicaoEmailInput, setMedicaoEmailInput))} onPaste={e => { e.preventDefault(); const text = e.clipboardData.getData('text'); addEmail('medicao_email', text, setMedicaoEmailInput); }} data-testid="input-medicao-email" />
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-green-500" size={16} />
                            </div>
                            <button type="button" onClick={() => addEmail('medicao_email', medicaoEmailInput, setMedicaoEmailInput)} className="p-2.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors shadow-sm"><Plus size={16}/></button>
                        </div>
                        {getEmailList('medicao_email').length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {getEmailList('medicao_email').map(em => (
                                    <span key={em} className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-lg text-[11px] font-bold">
                                        <Mail size={10}/> {em}
                                        <button type="button" onClick={() => removeEmail('medicao_email', em)} className="ml-0.5 text-green-400 hover:text-red-600"><X size={12}/></button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL_CLASS}>Telefone / WhatsApp</label>
                        <div className="relative">
                            <input type="text" className={`${INPUT_CLASS} pl-10`} value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                            <PhoneIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL_CLASS}>CEP</label>
                        <div className="relative">
                            <input 
                                type="text" 
                                className={`${INPUT_CLASS} pl-10 font-mono`} 
                                value={formData.zip_code} 
                                onChange={e => { 
                                    setFormData({...formData, zip_code: e.target.value}); 
                                    if(e.target.value.replace(/\D/g, '').length === 8) handleCepLookup(e.target.value); 
                                }} 
                                onBlur={(e) => handleCepLookup(e.target.value)}
                                maxLength={9}
                                placeholder="00000-000"
                            />
                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-red-500" size={16} />
                            {isSearchingCep && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" size={16} />}
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL_CLASS}>UF</label>
                        <input type="text" className={INPUT_CLASS} value={formData.state} onChange={e => setFormData({...formData, state: e.target.value.toUpperCase()})} maxLength={2} />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                        <label className={LABEL_CLASS}>Logradouro *</label>
                        <input type="text" className={INPUT_CLASS} required value={formData.street} onChange={e => setFormData({...formData, street: e.target.value.toUpperCase()})} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL_CLASS}>Número *</label>
                        <div className="relative">
                            <input type="text" className={`${INPUT_CLASS} pl-10`} required value={formData.number} onChange={e => setFormData({...formData, number: e.target.value})} />
                            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL_CLASS}>Complemento</label>
                        <input type="text" className={INPUT_CLASS} value={formData.complement} onChange={e => setFormData({...formData, complement: e.target.value.toUpperCase()})} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL_CLASS}>Bairro</label>
                        <input type="text" className={INPUT_CLASS} value={formData.neighborhood} onChange={e => setFormData({...formData, neighborhood: e.target.value.toUpperCase()})} />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                        <label className={LABEL_CLASS}>Cidade</label>
                        <input type="text" className={INPUT_CLASS} value={formData.city} onChange={e => setFormData({...formData, city: e.target.value.toUpperCase()})} />
                    </div>
                </div>
                
                <div className="pt-6 border-t border-gray-100 flex justify-end gap-3">
                    <button type="submit" disabled={isSaving} className="flex items-center gap-2 px-8 py-3 bg-red-600 text-white rounded-xl text-sm font-black hover:bg-red-700 shadow-xl transition-all uppercase">
                        {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Finalizar e Salvar Cliente
                    </button>
                </div>
             </div>
          </form>
      )}

      {activeTab === 'costs' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-center border-b border-gray-100 pb-4 gap-4">
                  <div className="flex items-center gap-2 text-gray-800">
                      <div className="p-2 bg-green-50 rounded-lg text-green-700"><DollarSign size={20} /></div>
                      <h3 className="font-bold text-sm uppercase tracking-wide">Tabelas de Preço</h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 bg-gray-50 p-2 rounded-xl border border-gray-200">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Cópia de Tabela:</span>
                    <select className="p-2 border rounded-lg text-[10px] font-bold uppercase bg-white" value={copySourceClientId} onChange={(e) => setCopySourceClientId(e.target.value)}>
                        <option value="">Selecione Cliente Origem...</option>
                        {clients.filter(c => c.id.toString() !== id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button onClick={handleCopyPriceTable} disabled={!copySourceClientId || isSavingPrice} className="bg-indigo-600 text-white px-3 py-2 rounded-lg text-[10px] font-black uppercase hover:bg-indigo-700 transition-all flex items-center gap-1.5 disabled:opacity-50"><Copy size={12}/> Copiar Tarifário</button>
                    <div className="h-6 w-px bg-gray-300 mx-1"></div>
                    <button onClick={() => setIsImportModalOpen(true)} className="bg-white text-indigo-700 px-3 py-2 rounded-lg text-[10px] font-black uppercase border border-indigo-200 hover:bg-indigo-50 transition-colors flex items-center gap-1.5"><FileSpreadsheet size={14} /> Importar (IA)</button>
                  </div>
              </div>
              
              {/* Motor de Precificação Automática — Cliente (por REGIÃO) */}
              <div className={`rounded-2xl border-2 p-5 ${autoMasterEnabled ? 'border-emerald-300 bg-gradient-to-br from-emerald-50 to-white' : 'border-gray-200 bg-gray-50'}`} data-testid="card-client-auto-master">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${autoMasterEnabled ? 'bg-emerald-600 text-white' : 'bg-gray-300 text-gray-600'}`}>
                              <TrendingUp size={18} />
                          </div>
                          <div>
                              <h4 className="font-black text-sm uppercase tracking-wide text-gray-800">Configuração de Cálculo Padrão</h4>
                              <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">
                                  {autoMasterEnabled ? `Motor ativo para ${autoMasterRegion} — tabelas manuais desta região serão ignoradas` : 'Defina a REGIÃO e 5 variáveis para ativar o cálculo automático por faixa'}
                              </p>
                          </div>
                      </div>
                      <div className="flex items-center gap-2">
                          {autoMasterEnabled && (
                              <span className="text-[10px] font-black px-2 py-1 rounded-full bg-emerald-600 text-white uppercase tracking-widest">Ativo · {autoMasterRegion}</span>
                          )}
                          {autoMasterEnabled && canEditAutoMaster && (
                              <button type="button" onClick={handleDisableAutoMaster} className="text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50" data-testid="button-disable-client-auto-master">Desligar</button>
                          )}
                      </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                      <div>
                          <label className={LABEL_CLASS}>Região</label>
                          <select disabled={!canEditAutoMaster} value={autoMasterRegion} onChange={e => setAutoMasterRegion(e.target.value)} className="w-full p-2 border rounded text-xs font-bold bg-white uppercase" data-testid="select-client-auto-region">
                              {REGIONS.map(r => <option key={r} value={r}>{r}{autoMasterRows.some(m => parseMasterRegion(m.operation_type) === r) ? ' ✓' : ''}</option>)}
                          </select>
                      </div>
                      <div>
                          <label className={LABEL_CLASS}>Valor Base (Acionamento)</label>
                          <input type="number" step="0.01" disabled={!canEditAutoMaster} value={autoMasterForm.baseActivationValue} onChange={e => setAutoMasterForm({...autoMasterForm, baseActivationValue: e.target.value})} className="w-full p-2 border rounded text-xs font-bold text-emerald-700 bg-white" placeholder="900.00" data-testid="input-client-auto-base-activation" />
                      </div>
                      <div>
                          <label className={LABEL_CLASS}>KM Franquia Base</label>
                          <input type="number" disabled={!canEditAutoMaster} value={autoMasterForm.baseKmAllowance} onChange={e => setAutoMasterForm({...autoMasterForm, baseKmAllowance: e.target.value})} className="w-full p-2 border rounded text-xs font-bold bg-white" placeholder="100" data-testid="input-client-auto-base-km" />
                      </div>
                      <div>
                          <label className={LABEL_CLASS}>Horas Franquia Base</label>
                          <input type="number" disabled={!canEditAutoMaster} value={autoMasterForm.baseHourAllowance} onChange={e => setAutoMasterForm({...autoMasterForm, baseHourAllowance: e.target.value})} className="w-full p-2 border rounded text-xs font-bold bg-white" placeholder="3" data-testid="input-client-auto-base-hr" />
                      </div>
                      <div>
                          <label className={LABEL_CLASS}>Valor KM Extra</label>
                          <input type="number" step="0.01" disabled={!canEditAutoMaster} value={autoMasterForm.extraKmValue} onChange={e => setAutoMasterForm({...autoMasterForm, extraKmValue: e.target.value})} className="w-full p-2 border rounded text-xs font-bold bg-white" placeholder="2.50" data-testid="input-client-auto-extra-km" />
                      </div>
                      <div>
                          <label className={LABEL_CLASS}>Valor Hora Extra</label>
                          <input type="number" step="0.01" disabled={!canEditAutoMaster} value={autoMasterForm.extraHourValue} onChange={e => setAutoMasterForm({...autoMasterForm, extraHourValue: e.target.value})} className="w-full p-2 border rounded text-xs font-bold bg-white" placeholder="40.00" data-testid="input-client-auto-extra-hr" />
                      </div>
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mt-4 pt-3 border-t border-gray-200">
                      <div className="flex items-center gap-3 flex-wrap">
                          <button type="button" onClick={() => setShowAutoPreview(v => !v)} disabled={autoPreviewBands.length === 0} className="text-[11px] font-black uppercase tracking-widest text-indigo-700 hover:underline disabled:opacity-40 flex items-center gap-1" data-testid="button-toggle-client-auto-preview">
                              {showAutoPreview ? 'Ocultar' : 'Ver'} faixas geradas ({autoPreviewBands.length})
                          </button>
                          <button type="button" onClick={handleSuggestAutoMaster} disabled={!canEditAutoMaster} className="text-[11px] font-black uppercase tracking-widest px-3 py-2 rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5" title={`Pré-preenche os 5 campos com a mediana das tabelas manuais da região ${autoMasterRegion}`} data-testid="button-suggest-client-auto-master">
                              <TrendingUp size={12}/> Sugerir a partir das tabelas atuais
                          </button>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                          {autoMasterEnabled && (
                              <button type="button" onClick={handleMaterializeBands} disabled={!canEditAutoMaster || isMaterializingBands || autoPreviewBands.length === 0} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2" data-testid="button-materialize-client-bands" title={`Cria 30 tabelas manuais (${autoMasterRegion} - AUTO 100KM, ...) para aparecer ao vincular no cliente/rota.`}>
                                  {isMaterializingBands ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar Faixas como Tabelas
                              </button>
                          )}
                          <button type="button" onClick={handleSaveAutoMaster} disabled={!canEditAutoMaster || isSavingMaster} className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-xs font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2" data-testid="button-save-client-auto-master">
                              {isSavingMaster ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} {autoMasterEnabled ? 'Atualizar' : 'Ativar Motor'}
                          </button>
                      </div>
                  </div>

                  {lastSuggestionInfo && (
                      <p className="text-[10px] font-bold text-indigo-700 mt-2 flex items-center gap-1" data-testid="text-client-suggestion-info">
                          <TrendingUp size={10}/> {lastSuggestionInfo}
                      </p>
                  )}

                  {!canEditAutoMaster && (
                      <p className="text-[10px] font-bold text-amber-700 mt-2 flex items-center gap-1"><Lock size={10}/> Somente diretoria/administrador/financeiro/comercial podem editar.</p>
                  )}

                  {showAutoPreview && autoPreviewBands.length > 0 && (
                      <div className="mt-3 max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
                          <table className="w-full text-[11px]">
                              <thead className="bg-gray-100 sticky top-0">
                                  <tr className="text-gray-600 font-black uppercase">
                                      <th className="p-2 text-left">Faixa KM</th>
                                      <th className="p-2 text-center">Horas</th>
                                      <th className="p-2 text-right">Valor Base</th>
                                      <th className="p-2 text-right">+ R$/km extra</th>
                                      <th className="p-2 text-right">+ R$/h extra</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                  {autoPreviewBands.map(b => (
                                      <tr key={b.kmFaixa}>
                                          <td className="p-2 font-bold">{b.kmFaixa} km</td>
                                          <td className="p-2 text-center">{b.franquiaHoras}h</td>
                                          <td className="p-2 text-right font-mono">R$ {b.valorBase.toFixed(2)}</td>
                                          <td className="p-2 text-right">R$ {autoMasterConfig.extraKmValue.toFixed(2)}</td>
                                          <td className="p-2 text-right">R$ {autoMasterConfig.extraHourValue.toFixed(2)}</td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>
                  )}
              </div>

              <div className="p-6 rounded-2xl shadow-xl border bg-gradient-to-r from-gray-900 via-gray-800 to-red-950 border-red-900/40 text-white">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                      <div className="flex items-center gap-4">
                          <div className="p-3 bg-white/10 rounded-full border border-white/20"><TrendingUp className="text-yellow-400" size={24}/></div>
                          <div>
                              <h3 className="font-bold text-base uppercase tracking-tighter">Reajuste Seletivo</h3>
                              <p className="text-[10px] text-white/80 uppercase font-bold tracking-widest mt-1">
                                  {selectedPriceIds.length > 0 ? `Ações em ${selectedPriceIds.length} itens marcados` : 'Marque os itens abaixo para reajustar'}
                              </p>
                          </div>
                      </div>
                      <div className="flex items-center gap-4 w-full md:w-auto">
                          <div className="relative flex-1 md:w-32">
                              <input type="number" placeholder="%" className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-red-500 font-black text-white text-lg text-center" value={adjustmentPercent} onChange={e => setAdjustmentPercent(e.target.value)} />
                              <Percent size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30" />
                          </div>
                          <button onClick={handleApplyAnnualAdjustment} disabled={isApplyingAdjustment || !adjustmentPercent || selectedPriceIds.length === 0} className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-black text-xs uppercase shadow-lg transition-all disabled:opacity-50 flex items-center gap-2">
                            {isApplyingAdjustment ? <Loader2 size={16} className="animate-spin" /> : <TrendingUp size={16} />} Reajustar Selecionados
                          </button>
                          <button onClick={handleUndoAdjustment} disabled={isReverting} className="bg-white/10 hover:bg-white/20 text-white px-4 py-3 rounded-xl border border-white/20 text-[10px] font-black uppercase flex items-center gap-2 transition-all" title="Restaurar backup do reajuste"><RotateCcw size={14} /> Reverter</button>
                          <button onClick={handleBulkDeletePrices} disabled={isBulkDeleting || selectedPriceIds.length === 0} className="bg-red-700 hover:bg-red-600 text-white px-4 py-3 rounded-xl border border-red-900/40 text-[10px] font-black uppercase flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed" title="Excluir os itens marcados" data-testid="button-bulk-delete-prices">
                            {isBulkDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Excluir Selecionados {selectedPriceIds.length > 0 ? `(${selectedPriceIds.length})` : ''}
                          </button>
                      </div>
                  </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">{editingPriceId ? <Edit size={14}/> : <Plus size={14}/>} {editingPriceId ? 'Editar Regra' : 'Adicionar Nova Regra'}</h4>
                <form onSubmit={handlePriceSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-1"><label className={LABEL_CLASS}>Região</label><select required className="w-full p-2 border rounded text-xs font-bold bg-white uppercase" value={priceRegion} onChange={e => setPriceRegion(e.target.value)}><option value="">Selecione...</option>{REGIONS.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                    <div className="md:col-span-2"><label className={LABEL_CLASS}>Descrição</label><input required type="text" className="w-full p-2 border rounded text-xs font-bold uppercase" value={priceDescription} onChange={e => setPriceDescription(e.target.value)} /></div>
                    <div>
                        <label className={LABEL_CLASS}>Acionamento</label>
                        <div className="relative">
                            <input required type="text" className={`w-full p-2 border rounded text-xs font-bold ${!isFinanceAdmin ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={priceFormData.activation_fee} onChange={e => setPriceFormData({...priceFormData, activation_fee: e.target.value})} readOnly={!isFinanceAdmin} />
                            {!isFinanceAdmin && <Lock size={12} className="absolute right-2 top-2.5 text-gray-400" />}
                        </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div><label className={LABEL_CLASS}>Franquia KM</label><input required type="text" className="w-full p-2 border rounded text-xs" value={priceFormData.franchise_km} onChange={e => setPriceFormData({...priceFormData, franchise_km: e.target.value})} /></div>
                    <div><label className={LABEL_CLASS}>Franquia Horas</label><input required type="text" className="w-full p-2 border rounded text-xs" value={priceFormData.franchise_hours} onChange={e => setPriceFormData({...priceFormData, franchise_hours: e.target.value})} /></div>
                    <div>
                        <label className={LABEL_CLASS}>KM Extra</label>
                        <div className="relative">
                            <input required type="text" className={`w-full p-2 border rounded text-xs ${!isFinanceAdmin ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={priceFormData.price_per_extra_km} onChange={e => setPriceFormData({...priceFormData, price_per_extra_km: e.target.value})} readOnly={!isFinanceAdmin} />
                            {!isFinanceAdmin && <Lock size={12} className="absolute right-2 top-2.5 text-gray-400" />}
                        </div>
                    </div>
                    <div>
                        <label className={LABEL_CLASS}>Hora Extra</label>
                        <div className="relative">
                            <input required type="text" className={`w-full p-2 border rounded text-xs ${!isFinanceAdmin ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={priceFormData.price_per_extra_hour} onChange={e => setPriceFormData({...priceFormData, price_per_extra_hour: e.target.value})} readOnly={!isFinanceAdmin} />
                            {!isFinanceAdmin && <Lock size={12} className="absolute right-2 top-2.5 text-gray-400" />}
                        </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2"><button type="submit" disabled={isSavingPrice} className="px-4 py-1.5 bg-black text-white text-xs font-bold rounded hover:bg-gray-800 flex items-center gap-2">{isSavingPrice ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar Regra</button></div>
                </form>
              </div>
              
              <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl">
                <Search size={14} className="text-gray-400" />
                <input
                    type="text"
                    value={priceSearch}
                    onChange={e => setPriceSearch(e.target.value)}
                    placeholder="Buscar por rota, região, descrição..."
                    className="flex-1 outline-none text-xs font-bold uppercase placeholder:normal-case placeholder:font-normal placeholder:text-gray-400"
                    data-testid="input-search-price"
                />
                {priceSearch && (
                    <button onClick={() => setPriceSearch('')} className="text-[10px] font-bold text-gray-500 hover:text-red-600 uppercase" data-testid="button-clear-price-search">Limpar</button>
                )}
                <span className="text-[10px] font-bold text-gray-400 uppercase">
                    {priceSearch ? `${priceTables.filter(t => (t.operation_type || '').toLowerCase().includes(priceSearch.toLowerCase())).length} / ${priceTables.length}` : `${priceTables.length} itens`}
                </span>
              </div>

              <div className="overflow-x-auto border border-gray-200 rounded-2xl shadow-sm">
                <table className="w-full text-left border-collapse table-auto">
                    <thead className="bg-gray-100 text-gray-600 font-bold uppercase">
                        <tr className="text-[10px]">
                            <th className="pl-4 py-3 w-8"><button onClick={handleSelectAllPrices} className="flex items-center text-gray-400">{selectedPriceIds.length === priceTables.length && priceTables.length > 0 ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} />}</button></th>
                            <th className="p-2">Operação / Rota</th>
                            <th className="p-2 text-right">Acionamento</th>
                            <th className="p-2 text-center">Franquia</th>
                            <th className="p-2 text-right">KM Exc.</th>
                            <th className="p-2 text-right">Hora Exc.</th>
                            <th className="p-2 text-center">Reajuste</th>
                            <th className="p-2 text-right w-16">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {priceTables.filter(t => !priceSearch || (t.operation_type || '').toLowerCase().includes(priceSearch.toLowerCase())).length === 0 && priceSearch && (
                            <tr><td colSpan={8} className="p-6 text-center text-gray-400 italic text-xs">Nenhuma tabela encontrada para "{priceSearch}"</td></tr>
                        )}
                        {priceTables.filter(t => !priceSearch || (t.operation_type || '').toLowerCase().includes(priceSearch.toLowerCase())).map((table) => (
                            <tr key={table.id} className={`text-[11px] transition-all ${selectedPriceIds.includes(table.id) ? 'bg-blue-50/50' : table.adjustment_status ? 'bg-green-50/30' : 'hover:bg-gray-50/30'}`}>
                                <td className="pl-4 py-2"><button onClick={() => handleSelectPriceRow(table.id)}>{selectedPriceIds.includes(table.id) ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} />}</button></td>
                                <td className={`p-2 font-bold uppercase ${table.adjustment_status ? 'text-green-800' : 'text-gray-700'}`}>{table.operation_type}</td>
                                <td className={`p-2 text-right font-mono font-black ${table.adjustment_status ? 'text-green-700' : 'text-gray-900'}`}>R$ {(table.activation_fee ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                <td className="p-2 text-center text-gray-500">{table.franchise_km}km / {table.franchise_hours}h</td>
                                <td className="p-2 text-right text-red-600 font-bold">R$ {(table.price_per_extra_km ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                <td className="p-2 text-right text-blue-600 font-bold">R$ {(table.price_per_extra_hour ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                <td className="p-2 text-center">
                                    {table.adjustment_status ? (
                                        <div className="flex flex-col items-center gap-0.5">
                                            <span className="bg-green-600 text-white px-1.5 py-0.5 rounded text-[8px] font-black uppercase flex items-center gap-1 shadow-sm"><Check size={8} strokeWidth={4} /> Reajustado</span>
                                            {table.last_adjustment_date && (
                                                <span className="text-[7px] text-green-700 font-bold flex items-center gap-0.5"><Calendar size={7} /> {new Date(table.last_adjustment_date).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-gray-300 font-bold uppercase text-[8px]">Pendente</span>
                                    )}
                                </td>
                                <td className="p-2 text-right"><div className="flex justify-end gap-1"><button onClick={() => setQuickQuoteTable(table)} className="p-1 text-green-600 hover:bg-green-50 rounded" title="Gerar Proposta"><FileText size={12} /></button><button onClick={() => handleEditPrice(table)} className="p-1 text-blue-600 hover:bg-blue-50 rounded"><Edit size={12} /></button><button onClick={async () => { if(confirm("Excluir?")) { await supabase.from('client_price_tables').delete().eq('id', table.id); await logAction('DELETE', 'ClientPriceTable', table.id, `Tabela de preço excluída: ${table.client || 'N/A'} — ${table.origin || '?'} → ${table.destination || '?'} (R$ ${table.price?.toFixed(2) || '0.00'})`); fetchPriceTables(formData.name); } }} className="p-1 text-red-600 hover:bg-red-50 rounded"><Trash2 size={12} /></button></div></td>
                            </tr> 
                        ))}
                    </tbody>
                </table>
              </div>
          </div>
      )}
      {activeTab === 'cancellation' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-center border-b border-gray-100 pb-4 gap-4">
                  <div className="flex items-center gap-2 text-gray-800">
                      <div className="p-2 bg-red-50 rounded-lg text-red-700"><XCircle size={20} /></div>
                      <div>
                          <h3 className="font-bold text-sm uppercase tracking-wide">Tabela de Cancelamento</h3>
                          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">Valor cobrado quando o cliente cancela a OS — uma linha por região/rota</p>
                      </div>
                  </div>
                  <div className="relative w-full md:w-72">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="text" placeholder="Filtrar por operação / rota..." className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-xs font-bold uppercase" value={cancellationSearch} onChange={e => setCancellationSearch(e.target.value)} data-testid="input-cancellation-search" />
                  </div>
              </div>

              <div className="bg-red-50/60 border border-red-100 rounded-xl p-4 text-[11px] text-red-900 font-bold uppercase tracking-wider flex items-start gap-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>As linhas abaixo são as mesmas da Tabela de Preços. Edite o valor de cancelamento por rota e clique em salvar.</span>
              </div>

              <div className="overflow-x-auto border border-gray-200 rounded-2xl shadow-sm">
                  <table className="w-full text-left border-collapse table-auto">
                      <thead className="bg-gray-100 text-gray-600 font-bold uppercase">
                          <tr className="text-[10px]">
                              <th className="p-2">Operação / Rota</th>
                              <th className="p-2 text-right">Acionamento</th>
                              <th className="p-2 text-center">Franquia</th>
                              <th className="p-2 text-right w-48">Valor Cancelamento (R$)</th>
                              <th className="p-2 text-right w-16">Ações</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                          {priceTables.filter(t => (t.operation_type || '').toLowerCase().includes(cancellationSearch.toLowerCase())).map((table) => {
                              const draft = cancellationDrafts[table.id];
                              const currentValue = draft !== undefined ? draft : (table.cancellation_fee ?? 0).toString();
                              const isDirty = draft !== undefined && parseCurrency(draft) !== (table.cancellation_fee ?? 0);
                              const isSaving = savingCancellationId === table.id;
                              return (
                                  <tr key={table.id} className="text-[11px] hover:bg-gray-50/30">
                                      <td className="p-2 font-bold uppercase text-gray-700">{table.operation_type}</td>
                                      <td className="p-2 text-right font-mono font-black text-gray-900">R$ {(table.activation_fee ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                      <td className="p-2 text-center text-gray-500">{table.franchise_km}km / {table.franchise_hours}h</td>
                                      <td className="p-2 text-right">
                                          <div className="relative">
                                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-400">R$</span>
                                              <input
                                                  type="text"
                                                  className={`w-full pl-7 pr-2 py-1.5 border rounded text-xs font-bold text-right text-red-700 ${isFinanceAdmin ? 'border-gray-300 bg-white' : 'bg-gray-100 cursor-not-allowed border-gray-200'} ${isDirty ? 'border-amber-400 bg-amber-50' : ''}`}
                                                  value={currentValue}
                                                  onChange={e => setCancellationDrafts({ ...cancellationDrafts, [table.id]: e.target.value })}
                                                  readOnly={!isFinanceAdmin}
                                                  data-testid={`input-cancellation-${table.id}`}
                                              />
                                          </div>
                                      </td>
                                      <td className="p-2 text-right">
                                          <button
                                              disabled={!isDirty || isSaving || !isFinanceAdmin}
                                              onClick={async () => {
                                                  if (!isFinanceAdmin) return;
                                                  setSavingCancellationId(table.id);
                                                  try {
                                                      const newValue = parseCurrency(draft ?? '');
                                                      const { error } = await supabase.from('client_price_tables').update({ cancellation_fee: newValue }).eq('id', table.id);
                                                      if (error) throw error;
                                                      await logAction('UPDATE', 'ClientPriceTable', table.id, `Valor de cancelamento atualizado: ${table.client || 'N/A'} — ${table.operation_type} → R$ ${newValue.toFixed(2)}`);
                                                      const newDrafts = { ...cancellationDrafts };
                                                      delete newDrafts[table.id];
                                                      setCancellationDrafts(newDrafts);
                                                      await fetchPriceTables(formData.name);
                                                      showNotification('Cancelamento atualizado.', 'success');
                                                  } catch (e: any) {
                                                      showNotification('Erro ao salvar cancelamento: ' + (e.message || e), 'error');
                                                  } finally {
                                                      setSavingCancellationId(null);
                                                  }
                                              }}
                                              className="p-1.5 text-white bg-green-600 hover:bg-green-700 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                                              title="Salvar valor de cancelamento"
                                              data-testid={`button-save-cancellation-${table.id}`}
                                          >
                                              {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                          </button>
                                      </td>
                                  </tr>
                              );
                          })}
                          {priceTables.length === 0 && (
                              <tr><td colSpan={5} className="p-6 text-center text-gray-400 text-xs font-bold uppercase">Nenhuma linha na tabela de preços deste cliente. Cadastre primeiro em Tabela de Preços.</td></tr>
                          )}
                      </tbody>
                  </table>
              </div>
          </div>
      )}
      {activeTab === 'vehicles' && <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"><ClientVehicleList onAddVehicle={onAddVehicle} onEdit={onEditVehicle} clientId={id ? parseInt(id) : undefined} embedded={true} /></div>}
      {activeTab === 'contracts' && id && (
          <ClientContractTab
            clientId={id}
            clientName={formData.name}
            tradingName={formData.trading_name}
            cnpj={formData.cnpj}
            rgIe={formData.rg_ie}
            contactName={formData.contact}
            email={formData.email}
            phone={formData.phone}
            street={formData.street}
            number={formData.number}
            complement={formData.complement}
            neighborhood={formData.neighborhood}
            city={formData.city}
            state={formData.state}
            zipCode={formData.zip_code}
          />
      )}
      {activeTab === 'routes' && <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"><ClientRouteList onAdd={onAddRoute} onEdit={onEditRoute} clientName={formData.name} embedded={true} /></div>}
      {activeTab === 'quotes' && <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"><QuoteList onAdd={onAddQuote} onEdit={onEditQuote} clientName={formData.name} embedded={true} /></div>}
    </div>
  );
};

export default ClientForm;