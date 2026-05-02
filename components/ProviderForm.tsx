
import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Save, Briefcase, Truck, Loader2, Search, Calendar, FileText, AlertTriangle, CheckCircle2, MapPin, Upload, Eye, X, Trash2, DollarSign, Plus, Edit, FileSpreadsheet, TrendingUp, Percent, Lock, Phone as PhoneIcon, Mail, Hash, Fingerprint, Building2, ShieldCheck, User, RotateCcw, Check, CheckSquare, Square, Download, ScrollText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { logAction } from '../lib/logger';
import { ProviderCostTable } from '../types';
import ImportProviderCostModal from './ImportProviderCostModal';
import { useNotification } from '../lib/NotificationContext';
import ClientContractTab from './ClientContractTab';

interface ProviderFormProps {
  onBack: () => void;
  onNavigateToVehicles: () => void;
  id?: string | null;
}

const INPUT_CLASS = "w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-sm transition-all uppercase font-medium";
const LABEL_CLASS = "text-[10px] font-black text-gray-500 uppercase mb-1.5 block tracking-wider";

const ProviderForm: React.FC<ProviderFormProps> = ({ onBack, onNavigateToVehicles, id }) => {
  const { showNotification } = useNotification();
  const [activeTab, setActiveTab] = useState<'registration' | 'contracts' | 'costs'>('registration');
  const [formData, setFormData] = useState({
    name: '',
    trading_name: '',
    cnpj: '',
    type: 'Escolta Caracterizada',
    status: 'Ativo',
    contact: '',
    email: '',
    os_email: '',
    medicao_email: '',
    phone: '',
    zip_code: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    alvaraValidity: '',
    alvaraUrl: ''
  });

  const [isSearchingCnpj, setIsSearchingCnpj] = useState(false);
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [cnpjError, setCnpjError] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [osEmailInput, setOsEmailInput] = useState('');
  const [medicaoEmailInput, setMedicaoEmailInput] = useState('');

  const getEmailList = (field: 'os_email' | 'medicao_email'): string[] => {
    const val = formData[field] || '';
    return val.split(',').map(e => e.trim()).filter(Boolean);
  };
  const addEmail = (field: 'os_email' | 'medicao_email', inputVal: string, setInput: (v: string) => void) => {
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
  const removeEmail = (field: 'os_email' | 'medicao_email', emailToRemove: string) => {
    const current = getEmailList(field).filter(e => e !== emailToRemove);
    setFormData({ ...formData, [field]: current.join(', ') });
  };

  const isFinanceAdmin = currentUser && (() => {
    const r = (currentUser.role || '').toLowerCase();
    const perms = currentUser.permissions || [];
    return r === 'diretoria' || r === 'administrador' || r === 'comercial' || r === 'controller' ||
           perms.includes('*');
  })();

  const [costTables, setCostTables] = useState<ProviderCostTable[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingCostId, setEditingCostId] = useState<string | null>(null);
  
  // Reajuste Seletivo
  const [adjustmentPercent, setAdjustmentPercent] = useState('');
  const [isApplyingAdjustment, setIsApplyingAdjustment] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [selectedCostIds, setSelectedCostIds] = useState<string[]>([]);

  const [costFormData, setCostFormData] = useState({
      operation_type: '',
      activation_cost: '',
      franchise_hours: '',
      franchise_km: '',
      cost_per_extra_km: '',
      cost_per_extra_hour: '',
      cancellation_fee: ''
  });
  const [isSavingCost, setIsSavingCost] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('userData');
    if (storedUser) {
        try { setCurrentUser(JSON.parse(storedUser)); } catch (e) { console.error(e); }
    }

    if (id) {
        setIsLoading(true);
        supabase.from('providers').select('*').eq('id', id).single()
        .then(({ data }) => {
            if (data) {
                setFormData({
                    name: data.name || '',
                    trading_name: data.trading_name || '',
                    cnpj: data.cnpj || '',
                    type: data.type || 'Escolta Caracterizada',
                    status: data.status || 'Ativo',
                    contact: data.contact_name || '',
                    email: data.email || '',
                    os_email: data.os_email || '',
                    medicao_email: data.medicao_email || '',
                    phone: data.phone || '',
                    zip_code: data.zip_code || '',
                    street: data.street || '',
                    number: data.number || '',
                    complement: data.complement || '',
                    neighborhood: data.neighborhood || '',
                    city: data.city || '',
                    state: data.state || '',
                    alvaraValidity: data.alvara_validity || '',
                    alvaraUrl: data.alvara_url || ''
                });
                fetchCostTables(data.name);
            }
            setIsLoading(false);
        });
    }
  }, [id]);

  const canEditAlvara = useMemo(() => {
      if (!currentUser) return false;
      const role = (currentUser?.role || '').toLowerCase();
      return role === 'administrador' || role === 'avançado' || role === 'avancado' || role === 'diretoria';
  }, [currentUser]);

  const fetchCostTables = async (providerName: string) => {
      const { data } = await supabase.from('provider_cost_tables').select('*').eq('provider', providerName).order('franchise_km', { ascending: true });
      if (data) setCostTables(data as any);
      setSelectedCostIds([]);
  };

  const handleSelectAllCosts = () => {
      if (selectedCostIds.length === costTables.length && costTables.length > 0) setSelectedCostIds([]);
      else setSelectedCostIds(costTables.map(t => t.id));
  };

  const handleSelectCostRow = (id: string) => {
      setSelectedCostIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleApplyAdjustment = async () => {
      if (selectedCostIds.length === 0) {
          showNotification('Atenção', 'Selecione pelo menos um item da tabela para reajustar.', 'warning');
          return;
      }

      const percent = parseFloat(adjustmentPercent);
      if (isNaN(percent) || percent === 0) { showNotification('Atenção', 'Informe uma porcentagem válida.', 'warning'); return; }
      
      const msg = `APLICAR REAJUSTE DE ${percent}% NOS ${selectedCostIds.length} ITENS SELECIONADOS?\n\nIsso atualizará os custos operacionais deste fornecedor.`;
      if (!confirm(msg)) return;

      setIsApplyingAdjustment(true);
      try {
          const factor = 1 + (percent / 100);
          const now = new Date().toISOString();
          const tablesToUpdate = costTables.filter(t => selectedCostIds.includes(t.id));

          const updates = tablesToUpdate.map(table => {
              return supabase.from('provider_cost_tables').update({
                  // @ts-ignore - Colunas de backup para reversão
                  previous_activation_cost: table.activation_cost,
                  previous_cost_per_extra_km: table.cost_per_extra_km,
                  previous_cost_per_extra_hour: table.cost_per_extra_hour,
                  activation_cost: table.activation_cost * factor,
                  cost_per_extra_km: table.cost_per_extra_km * factor,
                  cost_per_extra_hour: table.cost_per_extra_hour * factor,
                  adjustment_status: true,
                  last_adjustment_date: now
              }).eq('id', table.id);
          });

          const updateResults = await Promise.all(updates);
          const failedUpdate = updateResults.find(r => r?.error);
          if (failedUpdate?.error) throw failedUpdate.error;
          await logAction('UPDATE', 'ProviderAdjustment', id || 'unknown', `Reajuste de ${percent}% aplicado ao fornecedor ${formData.name}`);
          showNotification('Sucesso', 'Reajuste aplicado com sucesso!', 'success');
          fetchCostTables(formData.name);
      } catch (e: any) {
          showNotification('Erro', 'Falha ao reajustar custos: ' + (e instanceof Error ? e.message : 'erro desconhecido'), 'error');
      } finally {
          setIsApplyingAdjustment(false);
      }
  };

  const handleUndoAdjustment = async () => {
      if (selectedCostIds.length === 0) { showNotification('Atenção', 'Selecione os itens para reverter.', 'warning'); return; }
      if (!confirm("Deseja restaurar os valores originais dos custos selecionados?")) return;
      
      setIsReverting(true);
      try {
          const tablesToRevert = costTables.filter(t => selectedCostIds.includes(t.id));
          const updates = tablesToRevert.map((table: any) => {
              return supabase.from('provider_cost_tables').update({
                  activation_cost: table.previous_activation_cost || table.activation_cost,
                  cost_per_extra_km: table.previous_cost_per_extra_km || table.cost_per_extra_km,
                  cost_per_extra_hour: table.previous_cost_per_extra_hour || table.cost_per_extra_hour,
                  previous_activation_cost: null,
                  previous_cost_per_extra_km: null,
                  previous_cost_per_extra_hour: null,
                  adjustment_status: false,
                  last_adjustment_date: null
              }).eq('id', table.id);
          });
          const undoResults = await Promise.all(updates);
          const failedUndo = undoResults.find(r => r?.error);
          if (failedUndo?.error) throw failedUndo.error;
          showNotification('Sucesso', 'Custos restaurados!', 'success');
          fetchCostTables(formData.name);
      } catch (e: any) {
          showNotification('Erro', 'Erro ao reverter: ' + (e instanceof Error ? e.message : 'erro desconhecido'), 'error');
      } finally {
          setIsReverting(false);
      }
  };

  const handleSearchCNPJ = async () => {
    const cleanCnpj = formData.cnpj.replace(/\D/g, '');
    if (cleanCnpj.length !== 14) return;
    
    setIsSearchingCnpj(true);
    try {
        const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
        if (!response.ok) {
            if (response.status === 404) throw new Error('CNPJ não localizado.');
            throw new Error('Servidor de consulta indisponível.');
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
        showNotification('Sucesso', 'Dados do CNPJ importados!', 'success');
    } catch (error: any) {
        console.error("CNPJ Lookup error", error);
        showNotification('Aviso', `Consulta CNPJ: ${error.message}. Por favor preencha manualmente.`, 'warning');
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
              }
          } catch (e) {
              console.error("CEP error", e);
          } finally {
              setIsSearchingCep(false);
          }
      }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsUploading(true);
      try {
          const fileExt = file.name.split('.').pop();
          const safeName = (formData.cnpj || 'temp').replace(/\D/g, '');
          const fileName = `alvara_${safeName}_${Date.now()}.${fileExt}`;
          const filePath = `permits/${fileName}`;

          const { error: uploadError } = await supabase.storage
              .from('documents')
              .upload(filePath, file);

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
              .from('documents')
              .getPublicUrl(filePath);

          setFormData(prev => ({ ...prev, alvaraUrl: publicUrl }));
          showNotification('Sucesso', "Documento anexado com sucesso!", 'success');
      } catch (error: any) {
          console.error(error);
          showNotification('Erro', "Erro no upload: " + (error.message || "Verifique o bucket."), 'error');
      } finally {
          setIsUploading(false);
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cnpjError) { showNotification('Erro', 'O CNPJ informado já pertence a outro fornecedor.', 'error'); return; }
    setIsSaving(true);
    try {
       const fullAddress = `${formData.street}, ${formData.number}${formData.complement ? ' - ' + formData.complement : ''}, ${formData.neighborhood}, ${formData.city} - ${formData.state}, CEP: ${formData.zip_code}`;

       const payload: any = {
            name: formData.name.toUpperCase(), 
            trading_name: formData.trading_name.toUpperCase(), 
            cnpj: formData.cnpj,
            type: formData.type, 
            status: formData.status, 
            contact_name: formData.contact,
            email: formData.email.toLowerCase(),
            os_email: formData.os_email?.toLowerCase() || null,
            medicao_email: formData.medicao_email?.toLowerCase() || null,
            phone: formData.phone,
            zip_code: formData.zip_code,
            street: formData.street.toUpperCase(),
            number: formData.number,
            complement: formData.complement.toUpperCase(),
            neighborhood: formData.neighborhood.toUpperCase(),
            city: formData.city.toUpperCase(),
            state: formData.state.toUpperCase(),
            address: fullAddress,
            alvara_validity: formData.alvaraValidity || null, 
            alvara_url: formData.alvaraUrl
       };
       if (id) {
           const { error } = await supabase.from('providers').update(payload).eq('id', id);
           if (error) throw new Error('Erro ao salvar fornecedor: ' + error.message);
           await logAction('UPDATE', 'Provider', id, `Fornecedor atualizado: ${formData.name}`);
       } else {
           payload.created_by = currentUser?.name || 'SISTEMA';
           const { error } = await supabase.from('providers').insert([payload]);
           if (error) throw error;
           await logAction('CREATE', 'Provider', 'NEW', `Fornecedor cadastrado: ${formData.name}`);
       }
       showNotification('Sucesso', 'Fornecedor salvo com sucesso!', 'success');
       onBack();
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro desconhecido';
        showNotification('Erro', msg, 'error');
    } finally { setIsSaving(false); }
  };

  const handleCostSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!formData.name) { showNotification('Atenção', 'Salve o fornecedor primeiro.', 'warning'); return; }
      setIsSavingCost(true);
      try {
          const payload = {
              provider: formData.name, 
              operation_type: costFormData.operation_type.toUpperCase(),
              activation_cost: parseFloat(costFormData.activation_cost) || 0,
              franchise_hours: parseFloat(costFormData.franchise_hours) || 0,
              franchise_km: parseFloat(costFormData.franchise_km) || 0,
              cost_per_extra_km: parseFloat(costFormData.cost_per_extra_km) || 0,
              cost_per_extra_hour: parseFloat(costFormData.cost_per_extra_hour) || 0,
              cancellation_fee: parseFloat(costFormData.cancellation_fee) || 0,
          };
          if (editingCostId) {
              const { error } = await supabase.from('provider_cost_tables').update(payload).eq('id', editingCostId);
              if (error) throw new Error('Erro ao salvar tabela de custos: ' + error.message);
          } else {
              const { error } = await supabase.from('provider_cost_tables').insert([payload]);
              if (error) throw new Error('Erro ao criar tabela de custos: ' + error.message);
          }
          
          setEditingCostId(null);
          setCostFormData({ operation_type: '', activation_cost: '', franchise_hours: '', franchise_km: '', cost_per_extra_km: '', cost_per_extra_hour: '', cancellation_fee: '' });
          fetchCostTables(formData.name);
          showNotification('Sucesso', 'Tabela de custos atualizada.', 'success');
      } catch (err) {
          const msg = err instanceof Error ? err.message : 'Erro desconhecido';
          showNotification('Erro', msg, 'error');
      } finally { setIsSavingCost(false); }
  };

  if (isLoading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-red-600"/></div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in slide-in-from-right-4 duration-300 pb-20 relative">
      <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
              <button onClick={onBack} className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"><ArrowLeft size={20} /></button>
              <h2 className="text-xl font-bold text-gray-900">{id ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h2>
          </div>
      </div>

      <div className="flex flex-wrap gap-2 bg-white p-1.5 rounded-xl w-full lg:w-fit shadow-sm border border-gray-200">
          <button onClick={() => setActiveTab('registration')} className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all uppercase ${activeTab === 'registration' ? 'bg-black text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}><Briefcase size={14} /> Dados Cadastrais</button>
          {isFinanceAdmin && id && <button onClick={() => setActiveTab('contracts')} className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all uppercase ${activeTab === 'contracts' ? 'bg-black text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}><ScrollText size={14} /> Contratos</button>}
          {isFinanceAdmin && <button onClick={() => { if (!id) { showNotification('Atenção', 'Salve primeiro.', 'warning'); return; } setActiveTab('costs'); }} className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all uppercase ${activeTab === 'costs' ? 'bg-black text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}><DollarSign size={14} /> Tabela de Custos</button>}
      </div>

      {activeTab === 'registration' && (
          <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in">
             <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
                    <ShieldCheck className="text-red-600" size={18} />
                    <h3 className="font-black text-xs uppercase text-gray-700 tracking-widest">Identificação Jurídica</h3>
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
                        <label className={LABEL_CLASS}>Tipo de Fornecedor *</label>
                        <select className={INPUT_CLASS} value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                            <option value="Escolta Caracterizada">Escolta Caracterizada</option>
                            <option value="Escolta Velada">Escolta Velada</option>
                            <option value="Pronta Resposta">Pronta Resposta</option>
                            <option value="Moto Velada">Moto Velada</option>
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL_CLASS}>Responsável (Contato) *</label>
                        <div className="relative">
                            <input type="text" className={`${INPUT_CLASS} pl-10`} required value={formData.contact} onChange={e => setFormData({...formData, contact: e.target.value.toUpperCase()})} />
                            <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL_CLASS}>Status Operacional</label>
                        <select className={INPUT_CLASS} value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                            <option value="Ativo">Ativo</option>
                            <option value="Bloqueado">Bloqueado</option>
                        </select>
                    </div>
                </div>

                {/* --- SEÇÃO ALVARÁ POLÍCIA FEDERAL --- */}
                <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 mt-6">
                     <div className="flex items-center gap-2 mb-4">
                         <FileText className="text-amber-700" size={18} />
                         <h3 className="font-black text-xs uppercase text-amber-800 tracking-widest">Documentação Regulatória (Polícia Federal)</h3>
                     </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1.5">
                             <label className={LABEL_CLASS}>Validade do Alvará</label>
                             <div className="relative">
                                 <input 
                                     type="date" 
                                     className={`${INPUT_CLASS} border-amber-300 focus:border-amber-500`} 
                                     value={formData.alvaraValidity} 
                                     onChange={e => setFormData({...formData, alvaraValidity: e.target.value})} 
                                 />
                                 <Calendar size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                             </div>
                        </div>
                        <div className="space-y-1.5">
                             <label className={LABEL_CLASS}>Documento Digital (PDF)</label>
                             <div className="flex gap-2">
                                 <input 
                                     type="text" 
                                     className={`${INPUT_CLASS} flex-1 border-amber-300 focus:border-amber-500`} 
                                     placeholder="URL ou Upload..." 
                                     value={formData.alvaraUrl} 
                                     onChange={e => setFormData({...formData, alvaraUrl: e.target.value})} 
                                     readOnly 
                                 />
                                 <label className={`p-2.5 rounded-lg border border-amber-300 bg-white hover:bg-amber-100 cursor-pointer transition-colors flex items-center justify-center shadow-sm ${isUploading ? 'opacity-50' : ''}`}>
                                     {isUploading ? <Loader2 size={20} className="animate-spin text-amber-600"/> : <Upload size={20} className="text-amber-600"/>}
                                     <input type="file" className="hidden" accept="application/pdf,image/*" onChange={handleFileUpload} disabled={isUploading} />
                                 </label>
                                 {formData.alvaraUrl && (
                                     <a href={formData.alvaraUrl} target="_blank" rel="noopener noreferrer" className="p-2.5 rounded-lg border border-amber-300 bg-white hover:bg-amber-100 transition-colors flex items-center justify-center shadow-sm text-amber-600">
                                         <Eye size={20} />
                                     </a>
                                 )}
                             </div>
                        </div>
                     </div>
                </div>
             </div>

             <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
                    <MapPin className="text-red-600" size={18} />
                    <h3 className="font-black text-xs uppercase text-gray-700 tracking-widest">Localização e Contato</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-x-6 gap-y-4">
                    <div className="space-y-1.5">
                        <label className={LABEL_CLASS}>E-mail Comercial {!(formData.name.toUpperCase().includes('ATIVA') || formData.name.toUpperCase().includes('TM SEG') || formData.name.toUpperCase().includes('TMSEG')) && '*'}</label>
                        <div className="relative">
                            <input type="email" className={`${INPUT_CLASS} pl-10`} required={!(formData.name.toUpperCase().includes('ATIVA') || formData.name.toUpperCase().includes('TM SEG') || formData.name.toUpperCase().includes('TMSEG'))} value={formData.email} onChange={e => setFormData({...formData, email: e.target.value.toLowerCase()})} />
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        </div>
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                        <label className={LABEL_CLASS}>E-mail Recebimento (OS)</label>
                        <div className="flex gap-1.5">
                            <div className="relative flex-1">
                                <input type="text" className={`${INPUT_CLASS} pl-10 pr-10`} placeholder="Digite o e-mail..." value={osEmailInput} onChange={e => setOsEmailInput(e.target.value.toLowerCase())} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEmail('os_email', osEmailInput, setOsEmailInput))} onPaste={e => { e.preventDefault(); const text = e.clipboardData.getData('text'); addEmail('os_email', text, setOsEmailInput); }} data-testid="input-os-email" />
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-500" size={16} />
                            </div>
                            <button type="button" onClick={() => addEmail('os_email', osEmailInput, setOsEmailInput)} className="p-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors shadow-sm" data-testid="btn-add-os-email"><Plus size={16}/></button>
                        </div>
                        {getEmailList('os_email').length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {getEmailList('os_email').map(em => (
                                    <span key={em} className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-50 border border-orange-200 rounded-full text-[10px] font-bold text-orange-700">
                                        {em}
                                        <button type="button" onClick={() => removeEmail('os_email', em)} className="ml-0.5 text-orange-400 hover:text-red-600"><X size={12}/></button>
                                    </span>
                                ))}
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
                            <button type="button" onClick={() => addEmail('medicao_email', medicaoEmailInput, setMedicaoEmailInput)} className="p-2.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors shadow-sm" data-testid="btn-add-medicao-email"><Plus size={16}/></button>
                        </div>
                        {getEmailList('medicao_email').length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {getEmailList('medicao_email').map(em => (
                                    <span key={em} className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 border border-green-200 rounded-full text-[10px] font-bold text-green-700">
                                        {em}
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
                        <label className={LABEL_CLASS}>CEP (Busca Automática)</label>
                        <div className="relative">
                            <input type="text" className={`${INPUT_CLASS} pl-10 font-mono`} value={formData.zip_code} onChange={e => { setFormData({...formData, zip_code: e.target.value}); handleCepLookup(e.target.value); }} />
                            <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-red-500" />
                            {isSearchingCep && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" size={16} />}
                        </div>
                    </div>
                    <div className="space-y-1.5 md:col-span-1">
                        <label className={LABEL_CLASS}>UF</label>
                        <input type="text" className={INPUT_CLASS} value={formData.state} onChange={e => setFormData({...formData, state: e.target.value.toUpperCase()})} maxLength={2} />
                    </div>
                    <div className="space-y-1.5 md:col-span-3">
                        <label className={LABEL_CLASS}>Logradouro (Rua/Avenida)</label>
                        <input type="text" className={INPUT_CLASS} value={formData.street} onChange={e => setFormData({...formData, street: e.target.value.toUpperCase()})} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL_CLASS}>Número</label>
                        <div className="relative">
                            <input type="text" className={`${INPUT_CLASS} pl-10`} value={formData.number} onChange={e => setFormData({...formData, number: e.target.value})} />
                            <Hash size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
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
                    <button type="button" onClick={onBack} className="px-8 py-3 border border-gray-300 rounded-xl text-sm font-bold text-gray-600 uppercase hover:bg-gray-50 transition-colors">Cancelar</button>
                    <button type="submit" disabled={isSaving || isUploading} className="flex items-center gap-2 px-8 py-3 bg-red-600 text-white rounded-xl text-sm font-black hover:bg-red-700 shadow-xl transition-all uppercase disabled:opacity-50">
                        {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Salvar Fornecedor
                    </button>
                </div>
             </div>
          </form>
      )}

      {activeTab === 'costs' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6 animate-in fade-in">
              <div className="flex flex-col md:flex-row justify-between items-center border-b border-gray-100 pb-4 gap-4">
                  <div className="flex items-center gap-2 text-gray-800">
                      <div className="p-2 bg-green-50 rounded-lg text-green-700"><DollarSign size={20} /></div>
                      <h3 className="font-bold text-sm uppercase tracking-wide">Tabelas de Custo ({formData.name})</h3>
                  </div>
                  <button onClick={() => setIsImportModalOpen(true)} className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg text-xs font-black uppercase border border-indigo-200 hover:bg-indigo-100 transition-colors flex items-center gap-1.5"><FileSpreadsheet size={16} /> Importar Custos (IA)</button>
              </div>

              {/* PAINEL DE REAJUSTE SELETIVO (IGUAL AO CLIENTE) */}
              <div className="p-6 rounded-2xl shadow-xl border bg-gradient-to-r from-gray-900 via-gray-800 to-indigo-950 border-indigo-900/40 text-white">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                      <div className="flex items-center gap-4">
                          <div className="p-3 bg-white/10 rounded-full border border-white/20"><TrendingUp className="text-yellow-400" size={24}/></div>
                          <div>
                              <h3 className="font-bold text-base uppercase tracking-tighter">Reajuste Seletivo de Custos</h3>
                              <p className="text-[10px] text-white/80 uppercase font-bold tracking-widest mt-1">
                                  {selectedCostIds.length > 0 ? `Ações em ${selectedCostIds.length} itens marcados` : 'Marque os itens abaixo para reajustar'}
                              </p>
                          </div>
                      </div>
                      <div className="flex items-center gap-4 w-full md:w-auto">
                          <div className="relative flex-1 md:w-32">
                              <input type="number" placeholder="%" className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-red-500 font-black text-white text-lg text-center" value={adjustmentPercent} onChange={e => setAdjustmentPercent(e.target.value)} />
                              <Percent size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30" />
                          </div>
                          <button onClick={handleApplyAdjustment} disabled={isApplyingAdjustment || !adjustmentPercent || selectedCostIds.length === 0} className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-black text-xs uppercase shadow-lg transition-all disabled:opacity-50 flex items-center gap-2">
                            {isApplyingAdjustment ? <Loader2 size={16} className="animate-spin" /> : <TrendingUp size={16} />} Reajustar Selecionados
                          </button>
                          <button onClick={handleUndoAdjustment} disabled={isReverting || selectedCostIds.length === 0} className="bg-white/10 hover:bg-white/20 text-white px-4 py-3 rounded-xl border border-white/20 text-[10px] font-black uppercase flex items-center gap-2 transition-all" title="Restaurar backup do reajuste"><RotateCcw size={14} /> Reverter</button>
                      </div>
                  </div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                  <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">{editingCostId ? <Edit size={14}/> : <Plus size={14}/>} {editingCostId ? 'Editar Custo' : 'Adicionar Novo Custo'}</h4>
                  <form onSubmit={handleCostSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="md:col-span-2">
                              <label className={LABEL_CLASS}>Operação / Rota</label>
                              <input required type="text" className="w-full p-2 border rounded text-xs uppercase font-bold" value={costFormData.operation_type} onChange={e => setCostFormData({...costFormData, operation_type: e.target.value})} placeholder="Ex: CARACTERIZADA - SUDESTE" />
                          </div>
                          <div className="relative">
                              <label className={LABEL_CLASS}>Custo Base (Acionamento)</label>
                              <input required type="number" step="0.01" className={`w-full p-2 border rounded text-xs font-bold text-red-600 ${!isFinanceAdmin ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={costFormData.activation_cost} onChange={e => setCostFormData({...costFormData, activation_cost: e.target.value})} readOnly={!isFinanceAdmin} />
                              {!isFinanceAdmin && <Lock size={12} className="absolute right-2 top-2.5 text-gray-400" />}
                          </div>
                          <div>
                              <label className={LABEL_CLASS}>KM Franquia</label>
                              <input required type="number" className="w-full p-2 border rounded text-xs" value={costFormData.franchise_km} onChange={e => setCostFormData({...costFormData, franchise_km: e.target.value})} />
                          </div>
                          <div>
                              <label className={LABEL_CLASS}>Horas Franquia</label>
                              <input required type="number" className="w-full p-2 border rounded text-xs" value={costFormData.franchise_hours} onChange={e => setCostFormData({...costFormData, franchise_hours: e.target.value})} />
                          </div>
                          <div className="relative">
                              <label className={LABEL_CLASS}>KM Extra</label>
                              <input required type="number" step="0.01" className={`w-full p-2 border rounded text-xs ${!isFinanceAdmin ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={costFormData.cost_per_extra_km} onChange={e => setCostFormData({...costFormData, cost_per_extra_km: e.target.value})} readOnly={!isFinanceAdmin} />
                              {!isFinanceAdmin && <Lock size={12} className="absolute right-2 top-2.5 text-gray-400" />}
                          </div>
                          <div className="relative">
                              <label className={LABEL_CLASS}>Hora Extra</label>
                              <input required type="number" step="0.01" className={`w-full p-2 border rounded text-xs ${!isFinanceAdmin ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={costFormData.cost_per_extra_hour} onChange={e => setCostFormData({...costFormData, cost_per_extra_hour: e.target.value})} readOnly={!isFinanceAdmin} />
                              {!isFinanceAdmin && <Lock size={12} className="absolute right-2 top-2.5 text-gray-400" />}
                          </div>
                          <div>
                              <label className={LABEL_CLASS}>Taxa Cancelamento</label>
                              <input type="number" step="0.01" className="w-full p-2 border rounded text-xs" value={costFormData.cancellation_fee} onChange={e => setCostFormData({...costFormData, cancellation_fee: e.target.value})} />
                          </div>
                      </div>
                      <div className="flex justify-end gap-2">
                          {editingCostId && <button type="button" onClick={() => setEditingCostId(null)} className="px-4 py-1.5 border rounded text-xs font-bold text-gray-500">Cancelar</button>}
                          <button type="submit" disabled={isSavingCost} className="px-4 py-1.5 bg-black text-white text-xs font-bold rounded hover:bg-gray-800 flex items-center gap-2">
                              {isSavingCost ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar Custo
                          </button>
                      </div>
                  </form>
              </div>

              <div className="overflow-x-auto border border-gray-200 rounded-xl shadow-sm bg-white">
                <table className="w-full text-left border-collapse table-auto">
                    <thead className="bg-gray-100 text-gray-600 font-bold uppercase text-[10px] tracking-widest">
                        <tr>
                            <th className="pl-4 py-3 w-8">
                                <button onClick={handleSelectAllCosts} className="flex items-center text-gray-400">
                                    {selectedCostIds.length === costTables.length && costTables.length > 0 ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} />}
                                </button>
                            </th>
                            <th className="p-4">Operação / Rota</th>
                            <th className="p-4 text-right">Custo Base</th>
                            <th className="p-4 text-center">Franquias</th>
                            <th className="p-4 text-right">KM Extra</th>
                            <th className="p-4 text-right">Hora Extra</th>
                            <th className="p-4 text-center">Reajuste</th>
                            <th className="p-4 text-right w-16">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {costTables.length === 0 ? (
                            <tr><td colSpan={8} className="p-10 text-center text-gray-400 italic text-xs">Nenhum custo cadastrado para este fornecedor.</td></tr>
                        ) : (
                            costTables.map((table: any) => (
                                <tr key={table.id} className={`text-[11px] transition-all ${selectedCostIds.includes(table.id) ? 'bg-blue-50/50' : table.adjustment_status ? 'bg-green-50/30' : 'hover:bg-gray-50/50'}`}>
                                    <td className="pl-4 py-2">
                                        <button onClick={() => handleSelectCostRow(table.id)}>
                                            {selectedCostIds.includes(table.id) ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} />}
                                        </button>
                                    </td>
                                    <td className={`p-4 font-bold uppercase ${table.adjustment_status ? 'text-green-800' : 'text-gray-700'}`}>{table.operation_type}</td>
                                    <td className={`p-4 text-right font-black font-mono ${table.adjustment_status ? 'text-green-700' : 'text-red-600'}`}>R$ {(table.activation_cost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    <td className="p-4 text-center text-gray-500">{table.franchise_km}KM / {table.franchise_hours}H</td>
                                    <td className="p-4 text-right font-bold text-gray-700">R$ {(table.cost_per_extra_km || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    <td className="p-4 text-right font-bold text-gray-700">R$ {(table.cost_per_extra_hour || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    <td className="p-4 text-center">
                                        {table.adjustment_status ? (
                                            <div className="flex flex-col items-center gap-0.5">
                                                <span className="bg-green-600 text-white px-1.5 py-0.5 rounded text-[8px] font-black uppercase flex items-center gap-1 shadow-sm"><Check size={8} strokeWidth={4} /> Ativo</span>
                                                {table.last_adjustment_date && (
                                                    <span className="text-[7px] text-green-700 font-bold flex items-center gap-0.5"><Calendar size={7} /> {new Date(table.last_adjustment_date).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-gray-300 font-bold uppercase text-[8px]">Pendente</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex justify-end gap-1">
                                            <button onClick={() => {
                                                setEditingCostId(table.id);
                                                setCostFormData({
                                                    operation_type: table.operation_type,
                                                    activation_cost: table.activation_cost.toString(),
                                                    franchise_hours: table.franchise_hours.toString(),
                                                    franchise_km: table.franchise_km.toString(),
                                                    cost_per_extra_km: table.cost_per_extra_km.toString(),
                                                    cost_per_extra_hour: table.cost_per_extra_hour.toString(),
                                                    cancellation_fee: (table.cancellation_fee || 0).toString()
                                                });
                                            }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Edit size={14} /></button>
                                            <button onClick={async () => { if(confirm("Excluir custo?")) { const delRes = await supabase.from('provider_cost_tables').delete().eq('id', table.id); if (delRes.error) { showNotification('Erro', 'Erro ao excluir tabela de custo: ' + delRes.error.message, 'error'); return; } await logAction('DELETE', 'ProviderCostTable', table.id, `Tabela de custo excluída: ${table.provider || 'N/A'} — ${table.origin || '?'} → ${table.destination || '?'} (R$ ${table.cost?.toFixed(2) || '0.00'})`); fetchCostTables(formData.name); } }} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
                                        </div>
                                    </td>
                                </tr> 
                            ))
                        )}
                    </tbody>
                </table>
              </div>
          </div>
      )}

      {activeTab === 'contracts' && id && (
          <ClientContractTab
            clientId={id}
            clientName={formData.name}
            tradingName={formData.trading_name}
            cnpj={formData.cnpj}
            rgIe=""
            contactName={formData.contact}
            email={formData.email || formData.os_email}
            phone={formData.phone}
            street={formData.street}
            number={formData.number}
            complement={formData.complement}
            neighborhood={formData.neighborhood}
            city={formData.city}
            state={formData.state}
            zipCode={formData.zip_code}
            isProvider={true}
          />
      )}

      {isImportModalOpen && (
          <ImportProviderCostModal 
            onClose={() => setIsImportModalOpen(false)} 
            onSuccess={() => fetchCostTables(formData.name)} 
            fixedProviderName={formData.name} 
          />
      )}
    </div>
  );
};

export default ProviderForm;
