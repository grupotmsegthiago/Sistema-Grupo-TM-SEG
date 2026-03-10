
import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Save, Truck, Shield, Search, Loader2, Database, AlertTriangle, Radio, Palette, Hash, Trash2, Plus } from 'lucide-react';
import { API_BRASIL_CONFIG } from '../constants';
import { VehicleStatus, VehicleTechnology } from '../types';
import { supabase } from '../lib/supabase';
import { logAction } from '../lib/logger';
import { useNotification } from '../lib/NotificationContext';

const INPUT_CLASS = "w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none text-base transition-all uppercase font-medium";
const LABEL_CLASS = "text-xs font-bold text-gray-500 uppercase mb-1 block tracking-wider";

interface VehicleFormProps {
  onBack: () => void;
  id?: string | null;
  initialProvider?: string;
  onSuccess?: () => void;
  embedded?: boolean;
}

const VehicleForm: React.FC<VehicleFormProps> = ({ onBack, id, initialProvider, onSuccess, embedded = false }) => {
  const { showNotification } = useNotification();
  const [formData, setFormData] = useState({
    plate: '', brand: '', model: '', year: new Date().getFullYear().toString(),
    provider: '', type: 'Escolta Leve', status: VehicleStatus.Ativo, color: '',
    chassi: '', state: '', tracker_type: '', tracker_id: ''
  });

  const [customTrackerName, setCustomTrackerName] = useState('');
  const [providers, setProviders] = useState<string[]>([]);
  const [dbTechnologies, setDbTechnologies] = useState<VehicleTechnology[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDirector, setIsDirector] = useState(false);
  const [apiUsage, setApiUsage] = useState(0);
  const [duplicateError, setDuplicateError] = useState('');

  const isTrackerRequired = useMemo(() => {
      const p = (formData.provider || "").toUpperCase();
      if (!p) return true;
      return !(p.includes('TM SEG') || p.includes('ATIVA'));
  }, [formData.provider]);

  const handleProviderChange = (val: string) => {
    setFormData(prev => ({ ...prev, provider: val }));
  };

  const handleDelete = async () => {
    if (!id || !confirm(`TEM CERTEZA? Inativar a viatura placa ${formData.plate}?\n\nO registro será mantido no banco de dados mas ficará com status INATIVO.`)) return;
    setIsDeleting(true);
    try {
        const { error } = await supabase.from('vehicles').update({ status: 'Inativo' }).eq('id', id);
        if (error) throw error;
        await logAction('UPDATE', 'Vehicle', id, `Viatura ${formData.plate} inativada.`);
        showNotification('Sucesso', 'Viatura inativada com sucesso.', 'success');
        onBack();
    } catch (e: any) {
        console.error(e);
        alert('Erro ao inativar: ' + (e.message || "Erro desconhecido"));
    } finally {
        setIsDeleting(false);
    }
  };

  useEffect(() => {
    const storedUser = localStorage.getItem('userData');
    if (storedUser) {
        const user = JSON.parse(storedUser);
        const role = (user.role || '').toLowerCase();
        if (role === 'diretoria' || user.permissions?.includes('*')) {
            setIsDirector(true);
        }
    }

    async function loadData() {
        try {
            const { data: providerData } = await supabase.from('providers').select('name').eq('status', 'Ativo').order('name');
            if (providerData) setProviders(providerData.map(p => p.name));
            
            const { data: techData } = await supabase.from('vehicle_technologies').select('*').order('name');
            if (techData) setDbTechnologies(techData);

            if (initialProvider) setFormData(prev => ({ ...prev, provider: initialProvider }));
            
            if (id) {
                const { data: vehicleData } = await supabase.from('vehicles').select('*').eq('id', id).single();
                if (vehicleData) {
                    const knownTechNames = (techData || []).map(t => t.name.toUpperCase());
                    const isKnownTech = knownTechNames.includes(vehicleData.tracker_type?.toUpperCase() || '');

                    setFormData({
                        plate: vehicleData.plate, brand: vehicleData.brand || '', model: vehicleData.model,
                        year: vehicleData.year, provider: vehicleData.provider, status: vehicleData.status as VehicleStatus,
                        type: vehicleData.type || 'Escolta Leve', color: vehicleData.color || '',
                        chassi: vehicleData.chassi || '', state: vehicleData.state || '',
                        tracker_type: vehicleData.tracker_type ? (isKnownTech ? vehicleData.tracker_type : 'OUTRA') : '', 
                        tracker_id: vehicleData.tracker_id || ''
                    });
                    if (!isKnownTech && vehicleData.tracker_type) setCustomTrackerName(vehicleData.tracker_type);
                }
            }
            
            const now = new Date();
            const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            const { count } = await supabase.from('api_usage_logs').select('*', { count: 'exact', head: true }).gte('created_at', firstDayOfMonth);
            if (count !== null) setApiUsage(count);
        } catch (error) { console.error(error); }
    }
    loadData();
  }, [initialProvider, id]);

  const checkDuplicate = async (plateVal: string) => {
      const cleanPlate = plateVal.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      if (cleanPlate.length < 7) return;
      try {
          let query = supabase.from('vehicles').select('id, model, provider').eq('plate', cleanPlate);
          if (id) query = query.neq('id', id);
          const { data } = await query.maybeSingle();
          if (data) { setDuplicateError(`PLACA DUPLICADA: Já cadastrada em ${data.provider}.`); } 
          else { setDuplicateError(''); }
      } catch (e) { console.error(e); }
  };

  const handleSearchPlate = async () => {
    const cleanPlate = formData.plate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    await checkDuplicate(cleanPlate);
    if (duplicateError) return;
    if (cleanPlate.length !== 7) return;
    
    setIsSearching(true);
    try {
        const { data: existingVehicle } = await supabase
            .from('vehicles')
            .select('id, plate, brand, model, color, year, state, chassi')
            .eq('plate', cleanPlate)
            .maybeSingle();

        const { data: existingClientVehicle } = await supabase
            .from('client_vehicles')
            .select('id, plate, brand, model, color, year, state, chassi')
            .eq('plate', cleanPlate)
            .maybeSingle();

        const cached = existingVehicle || existingClientVehicle;
        if (cached) {
            setFormData(prev => ({
                ...prev,
                plate: cached.plate || cleanPlate,
                brand: cached.brand || prev.brand,
                model: cached.model || prev.model,
                color: cached.color || prev.color,
                year: cached.year || prev.year,
                state: cached.state || prev.state,
                chassi: cached.chassi || prev.chassi
            }));
            showNotification('Dados Locais', 'Placa encontrada no banco de dados. API não consumida.', 'success');
            setIsSearching(false);
            return;
        }

        const url = `${API_BRASIL_CONFIG.BASE_URL}/${cleanPlate}/${API_BRASIL_CONFIG.TOKEN}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); 

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) throw new Error('Falha de Autenticação na API de Placas.');
            if (response.status === 429) throw new Error('Limite de consultas excedido.');
            throw new Error(`Servidor indisponível (${response.status})`);
        }

        const data = await response.json();
        if (data.error) throw new Error(data.mensagemRetorno || 'Veículo não encontrado.');
        
        setFormData(prev => ({
            ...prev, plate: data.placa || cleanPlate, brand: data.MARCA || data.marca || '', model: data.MODELO || data.modelo || '',
            color: data.cor || prev.color, year: data.anoModelo || data.ano || prev.year,
            state: data.uf || prev.state, chassi: data.chassi || ''
        }));
        
        await supabase.from('api_usage_logs').insert({ service: 'wdapi', plate: cleanPlate });
        setApiUsage(prev => prev + 1);
        showNotification('Sucesso', 'Dados do veículo importados via API.', 'success');
    } catch (error: any) { 
        console.error("Plate Lookup Error:", error);
        showNotification('Aviso', `Consulta de Placa: ${error.message}. Preencha manualmente.`, 'warning'); 
    } finally { setIsSearching(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (duplicateError) { alert("Erro: Placa já existe."); return; }
    
    if (isTrackerRequired) {
        if (!formData.tracker_type || !formData.tracker_id || (formData.tracker_type === 'OUTRA' && !customTrackerName)) {
            alert("ERRO: O rastreador e o ID do terminal são obrigatórios para este fornecedor.");
            return;
        }
    }

    setIsSaving(true);
    try {
        const finalTrackerType = formData.tracker_type === 'OUTRA' ? customTrackerName : formData.tracker_type;
        const payload = {
            plate: formData.plate.toUpperCase(), 
            brand: formData.brand.toUpperCase(),
            model: formData.model.toUpperCase(), 
            year: formData.year, 
            provider: formData.provider, 
            status: formData.status, 
            type: formData.type, 
            color: formData.color.toUpperCase(), 
            chassi: formData.chassi.toUpperCase(), 
            state: formData.state.toUpperCase(),
            tracker_type: finalTrackerType || null, 
            tracker_id: formData.tracker_id.toUpperCase() || null
        };
        
        if (id) {
            const { error } = await supabase.from('vehicles').update(payload).eq('id', id);
            if (error) throw error;
            await logAction('UPDATE', 'Vehicle', id, `Viatura ${payload.plate} atualizada.`);
        } else {
            const { data, error } = await supabase.from('vehicles').insert([payload]).select();
            if (error) throw error;
            const newId = data?.[0]?.id?.toString() || 'ID';
            await logAction('CREATE', 'Vehicle', newId, `Nova Viatura ${payload.plate} cadastrada.`);
        }
        showNotification('Sucesso', 'Viatura salva com sucesso!', 'success');
        if (onSuccess) onSuccess(); else onBack();
    } catch (error: any) { alert(error.message); } finally { setIsSaving(false); }
  };

  return (
    <div className={`${embedded ? 'w-full' : 'max-w-6xl mx-auto'} space-y-6 animate-in slide-in-from-right-4 duration-300 pb-12`}>
      {!embedded && (
        <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm">
                <ArrowLeft size={22} />
            </button>
            <h2 className="text-2xl font-bold text-gray-900">{id ? 'Editar Viatura' : 'Nova Viatura'}</h2>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-xs text-gray-800 uppercase tracking-widest">
                    <Search size={16}/> Consulta e Identificação
                </div>
                {isSearching && <div className="flex items-center gap-2 text-[10px] text-blue-600 font-black animate-pulse uppercase"><Loader2 size={12} className="animate-spin" /> Acessando Base Nacional...</div>}
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
                <div className="md:col-span-4">
                    <label className={LABEL_CLASS}>Placa do Veículo</label>
                    <div className="relative">
                        <input type="text" required className={`${INPUT_CLASS} font-mono text-xl tracking-widest pl-4 pr-12`} value={formData.plate} onChange={e => { setFormData({...formData, plate: e.target.value.toUpperCase()}); setDuplicateError(''); }} onBlur={() => checkDuplicate(formData.plate)} maxLength={7} placeholder="ABC1234" />
                        <button type="button" onClick={handleSearchPlate} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-red-600">
                            {isSearching ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
                        </button>
                    </div>
                    {duplicateError && <p className="text-[10px] text-red-600 font-black mt-1 uppercase italic">{duplicateError}</p>}
                </div>
                <div className="md:col-span-8">
                    <div className="p-3.5 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Database size={18} className="text-blue-600"/>
                            <span className="text-[11px] text-blue-800 font-black uppercase tracking-wider">Quota API: {apiUsage} / {API_BRASIL_CONFIG.MONTHLY_LIMIT}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="border-b border-gray-100 pb-4 mb-6 flex items-center gap-2">
                <Truck size={18} className="text-gray-400" />
                <h3 className="font-bold text-sm text-gray-800 uppercase tracking-widest">Ficha Técnica</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                <div><label className={LABEL_CLASS}>Marca</label><input type="text" className={INPUT_CLASS} value={formData.brand} onChange={e => setFormData({...formData, brand: e.target.value})} /></div>
                <div><label className={LABEL_CLASS}>Modelo</label><input type="text" className={INPUT_CLASS} value={formData.model} onChange={e => setFormData({...formData, model: e.target.value})} /></div>
                <div><label className={LABEL_CLASS}>Ano</label><input type="text" className={INPUT_CLASS} value={formData.year} onChange={e => setFormData({...formData, year: e.target.value})} maxLength={4} /></div>
                <div><label className={LABEL_CLASS}>Cor</label><input type="text" className={INPUT_CLASS} value={formData.color} onChange={e => setFormData({...formData, color: e.target.value})} /></div>
                <div><label className={LABEL_CLASS}>UF</label><input type="text" className={INPUT_CLASS} value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} maxLength={2} /></div>
                <div className="md:col-span-2"><label className={LABEL_CLASS}>Chassi</label><input type="text" className={INPUT_CLASS} value={formData.chassi} onChange={e => setFormData({...formData, chassi: e.target.value})} /></div>
                <div>
                    <label className={LABEL_CLASS}>Tipo</label>
                    <select className={INPUT_CLASS} value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                        <option value="Escolta Leve">ESCOLTA LEVE (CARRO)</option>
                        <option value="Moto">MOTO</option>
                        <option value="Blindado">BLINDADO</option>
                        <option value="Pronta Resposta">PRONTA RESPOSTA</option>
                    </select>
                </div>
            </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="border-b border-gray-100 pb-4 mb-6 flex items-center gap-2">
                <Shield size={18} className="text-gray-400" />
                <h3 className="font-bold text-sm text-gray-800 uppercase tracking-widest">Gestão e Monitoramento</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className={LABEL_CLASS}>Fornecedor Responsável <span className="text-red-500">*</span></label>
                    <select required className={`${INPUT_CLASS} font-bold`} value={formData.provider} onChange={e => handleProviderChange(e.target.value)}>
                        <option value="">Selecione o Fornecedor...</option>
                        {providers.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
                <div>
                    <label className={LABEL_CLASS}>Status da Viatura</label>
                    <select className={INPUT_CLASS} value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as VehicleStatus})}>
                        <option value={VehicleStatus.Ativo}>ATIVO</option>
                        <option value={VehicleStatus.Manutenção}>EM MANUTENÇÃO</option>
                        <option value={VehicleStatus.Inativo}>INATIVO</option>
                    </select>
                </div>

                <div className={`md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-gray-100 transition-all ${!isTrackerRequired ? 'opacity-50' : ''}`}>
                    <div>
                        <label className={`${LABEL_CLASS} flex justify-between`}>Tecnologia {isTrackerRequired && <span className="text-red-500 text-[10px]">OBRIGATÓRIO</span>}</label>
                        <select required={isTrackerRequired} className={INPUT_CLASS} value={formData.tracker_type} onChange={e => setFormData({...formData, tracker_type: e.target.value})}>
                            <option value="">Selecione...</option>
                            {dbTechnologies.map(t => <option key={t.id} value={t.name.toUpperCase()}>{t.name.toUpperCase()}</option>)}
                            <option value="OUTRA">OUTRA (DIGITAR)...</option>
                        </select>
                    </div>
                    {formData.tracker_type === 'OUTRA' && (
                        <div className="animate-in slide-in-from-top-2">
                            <label className={LABEL_CLASS}>Nome da Tecnologia</label>
                            <input type="text" required={isTrackerRequired} className={INPUT_CLASS} placeholder="Ex: QUANTUM" value={customTrackerName} onChange={e => setCustomTrackerName(e.target.value.toUpperCase())} />
                        </div>
                    )}
                    <div>
                        <label className={`${LABEL_CLASS} flex justify-between`}>ID / Serial {isTrackerRequired && <span className="text-red-500 text-[10px]">OBRIGATÓRIO</span>}</label>
                        <input type="text" required={isTrackerRequired} className={INPUT_CLASS} placeholder="ID do Rastreador" value={formData.tracker_id} onChange={e => setFormData({...formData, tracker_id: e.target.value.toUpperCase()})} />
                    </div>
                </div>
            </div>
        </div>

        <div className="flex items-center justify-end gap-4 pb-10">
            {id && isDirector && (
                <button type="button" onClick={handleDelete} disabled={isDeleting} className="px-8 py-3.5 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm font-bold uppercase hover:bg-red-100 transition-all flex items-center gap-2 disabled:opacity-50">
                    {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />} Excluir Viatura
                </button>
            )}
            <button type="button" onClick={onBack} disabled={isSaving} className="px-8 py-3.5 border border-gray-300 rounded-xl text-sm font-bold text-gray-600 uppercase hover:bg-gray-50 transition-colors">
                Cancelar
            </button>
            <button type="submit" disabled={isSaving || !!duplicateError} className="px-10 py-3.5 bg-black text-white rounded-xl text-sm font-black shadow-xl hover:bg-gray-800 transition-all uppercase flex items-center gap-2 disabled:opacity-50">
                {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />} {id ? 'Salvar Alterações' : 'Finalizar Cadastro'}
            </button>
        </div>
      </form>
    </div>
  );
};

export default VehicleForm;
