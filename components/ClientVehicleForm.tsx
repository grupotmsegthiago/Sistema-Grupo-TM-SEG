
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, Truck, Building2, Search, Loader2, AlertTriangle, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { API_BRASIL_CONFIG } from '../constants';
import { useNotification } from '../lib/NotificationContext';

interface Props {
  onBack: () => void;
  id?: string | null;
  initialClientId?: number | null;
  onSuccess?: (newId?: string) => void; 
  // Fix: Added missing 'embedded' prop to interface to support use in modals
  embedded?: boolean;
}

const INPUT_CLASS = "w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none text-base transition-all uppercase";
const LABEL_CLASS = "text-xs font-bold text-gray-500 uppercase mb-1 block";

const ClientVehicleForm: React.FC<Props> = ({ onBack, id, initialClientId, onSuccess, embedded = false }) => {
  const { showNotification } = useNotification();
  const [formData, setFormData] = useState({
    plate: '',
    brand: '',
    model: '',
    year: new Date().getFullYear().toString(),
    clientId: '',
    color: '',
    chassi: '',
    state: '',
    logo: ''
  });

  const [clients, setClients] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [duplicateError, setDuplicateError] = useState('');

  useEffect(() => {
    async function loadInitialData() {
        const { data } = await supabase.from('clients').select('id, name, trading_name').order('trading_name', { ascending: true, nullsFirst: false });
        if (data) setClients(data);

        // Pre-select client if provided via prop
        if (initialClientId && !id) {
            setFormData(prev => ({ ...prev, clientId: initialClientId.toString() }));
        }

        if (id) {
          setIsLoading(true);
          const { data: vehicleData } = await supabase.from('client_vehicles').select('*').eq('id', id).single();
          if (vehicleData) {
            setFormData({
              plate: vehicleData.plate,
              brand: vehicleData.brand,
              model: vehicleData.model,
              year: vehicleData.year,
              clientId: vehicleData.client_id.toString(),
              color: vehicleData.color,
              chassi: vehicleData.chassi || '',
              state: vehicleData.state || '',
              logo: ''
            });
          }
          setIsLoading(false);
        }
    }
    loadInitialData();
  }, [id, initialClientId]);
  
  const checkDuplicate = async (plateVal: string) => {
      const searchVal = plateVal.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      
      if (searchVal.length < 7) return;

      try {
          // Check in Client Vehicles
          const { data: clientRes } = await supabase
              .from('client_vehicles')
              .select('id, clients(name)')
              .eq('plate', searchVal)
              .maybeSingle();

          if (clientRes && (!id || clientRes.id.toString() !== id)) {
              setDuplicateError(`Placa já existe para cliente: ${clientRes.clients?.name}`);
              return;
          } 
          
          setDuplicateError('');
          
      } catch (e) { console.error(e); }
  };

  const handleSearchPlate = async () => {
    const cleanPlate = formData.plate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    
    await checkDuplicate(cleanPlate);
    if (duplicateError) return;

    if (cleanPlate.length !== 7) {
        showNotification('Placa Inválida', 'Digite uma placa válida (7 caracteres) para buscar.', 'warning');
        return;
    }
    setIsSearching(true);

    try {
        const { data: existingClientVehicle } = await supabase
            .from('client_vehicles')
            .select('id, plate, brand, model, color, year, state, chassi')
            .eq('plate', cleanPlate)
            .maybeSingle();

        const { data: existingVehicle } = await supabase
            .from('vehicles')
            .select('id, plate, brand, model, color, year, state, chassi')
            .eq('plate', cleanPlate)
            .maybeSingle();

        const cached = existingClientVehicle || existingVehicle;
        if (cached) {
            setFormData(prev => ({
                ...prev,
                plate: cached.plate || cleanPlate,
                brand: cached.brand || prev.brand,
                model: cached.model || prev.model,
                color: cached.color || prev.color,
                year: cached.year || prev.year || '',
                state: cached.state || prev.state || '',
                chassi: cached.chassi || ''
            }));
            showNotification('Dados Locais', 'Placa encontrada no banco de dados. API não consumida.', 'success');
            setIsSearching(false);
            return;
        }

        const url = API_BRASIL_CONFIG.consultaUrl(cleanPlate);
        const response = await fetch(url, { method: 'GET' });
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) throw new Error('Falha de autenticação na API de Placas.');
            if (response.status === 429) throw new Error('Limite de consultas excedido.');
            throw new Error(`API de Placas indisponível (${response.status}).`);
        }
        const raw = await response.text();
        let data: any;
        try {
            data = JSON.parse(raw);
        } catch {
            throw new Error('API de Placas retornou resposta inválida (indisponível).');
        }
        
        if (data.error || (data.codigoSituacao && data.codigoSituacao !== '0')) {
             throw new Error(data.mensagemRetorno || 'Veículo não encontrado na base.');
        }

        if (!data.MARCA && !data.marca && !data.modelo) {
             throw new Error('Dados não retornados pela API (Veículo não encontrado).');
        }

        let brand = data.MARCA || data.marca || '';
        let model = data.MODELO || data.modelo || '';
        
        if (!brand && data.marcaModelo) {
            const parts = data.marcaModelo.split('/');
            brand = parts[0];
            model = parts[1] || model;
        }

        setFormData(prev => ({
            ...prev,
            plate: data.placa || cleanPlate,
            brand: brand,
            model: model,
            color: data.cor || prev.color,
            year: data.anoModelo || data.ano || prev.year || '',
            state: data.uf || prev.state || '',
            chassi: data.chassi || '',
            logo: data.logo || ''
        }));

        showNotification('Sucesso', 'Dados do veículo importados via API.', 'success');
    } catch (error: any) {
        console.error(error);
        showNotification('Aviso de Consulta', `${error.message}. Por favor, preencha manualmente.`, 'warning');
    } finally {
        setIsSearching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (duplicateError) {
        showNotification('Erro de Duplicidade', 'Veículo já cadastrado. Corrija a placa.', 'error');
        return;
    }
    
    if (!formData.clientId || !formData.plate || !formData.brand || !formData.model) {
        showNotification('Campos Obrigatórios', 'Por favor, preencha todos os campos obrigatórios (*) antes de salvar.', 'error');
        return;
    }

    setIsSaving(true);

    try {
        const payload = {
            plate: formData.plate.toUpperCase(),
            model: formData.model,
            brand: formData.brand,
            year: formData.year,
            color: formData.color,
            client_id: parseInt(formData.clientId),
            chassi: formData.chassi || null,
            state: formData.state || null
        };

        let newVehicleId: string | undefined;

        if (id) {
          const { error } = await supabase.from('client_vehicles').update(payload).eq('id', id);
          if (error) throw error;
          newVehicleId = id;
          showNotification('Sucesso', 'Veículo atualizado com sucesso!', 'success');
        } else {
          const { data, error } = await supabase.from('client_vehicles').insert([payload]).select();
          if (error) throw error;
          showNotification('Sucesso', 'Veículo do cliente salvo com sucesso!', 'success');
          if (data && data.length > 0) {
              newVehicleId = data[0].id.toString();
          }
        }
        
        if (onSuccess) {
            onSuccess(newVehicleId);
        } else {
            onBack();
        }

    } catch (error: any) {
        console.error(error);
        showNotification('Erro ao Salvar', error.message, 'error');
    } finally {
        setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-red-600" /></div>;
  }

  return (
    // Fix: Adjusted layout container width based on 'embedded' prop
    <div className={`${embedded ? 'w-full' : 'max-w-4xl mx-auto'} space-y-6 animate-in slide-in-from-right-4 duration-300`}>
      
      {/* Fix: Conditionally render header based on 'embedded' prop */}
      {!embedded && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
              <button 
                  onClick={onBack}
                  className="p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-red-700 transition-colors"
              >
                  <ArrowLeft size={22} />
              </button>
              <div>
                  <h2 className="text-2xl font-bold text-gray-900">{id ? 'Editar Veículo de Carga' : 'Novo Veículo de Carga'}</h2>
                  <p className="text-sm text-gray-500">Cadastro de frota do cliente</p>
              </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Identificação */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                <Truck size={18} className="text-gray-600" />
                <h3 className="font-bold text-sm text-gray-800 uppercase tracking-wider">Identificação do Veículo</h3>
            </div>
            
            <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
                <div className="md:col-span-8">
                    <label className={LABEL_CLASS}>Cliente Proprietário <span className="text-red-500">*</span></label>
                    <div className="relative">
                        <select 
                            required
                            disabled={!!initialClientId} 
                            className="w-full px-4 py-3 pl-10 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none appearance-none font-bold text-gray-700 uppercase disabled:bg-gray-100"
                            value={formData.clientId}
                            onChange={e => setFormData({...formData, clientId: e.target.value})}
                        >
                            <option value="">Selecione o Cliente...</option>
                            {clients.map(c => (
                                <option key={c.id} value={c.id}>{(c.trading_name && c.trading_name.trim()) ? c.trading_name : c.name}</option>
                            ))}
                        </select>
                        <Building2 size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                </div>

                <div className="md:col-span-4 space-y-2">
                    <label className={LABEL_CLASS}>Placa <span className="text-red-500">*</span></label>
                    
                    <div className="relative flex-1">
                        <input 
                            type="text"
                            required
                            disabled={!formData.clientId || !!id && isSearching}
                            className={`w-full pl-4 pr-10 py-3 bg-white border rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none uppercase font-mono font-bold text-lg tracking-wider text-gray-800 disabled:bg-gray-100 disabled:cursor-not-allowed ${duplicateError ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                            placeholder="ABC1234"
                            value={formData.plate}
                            onChange={e => {
                                setFormData({...formData, plate: e.target.value.toUpperCase()});
                                setDuplicateError('');
                            }}
                            onBlur={(e) => checkDuplicate(e.target.value)}
                            maxLength={8} 
                        />
                        <button 
                            type="button"
                            onClick={handleSearchPlate}
                            disabled={isSearching || !formData.clientId || !!id || !!duplicateError}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-gray-100 hover:bg-red-50 text-gray-500 hover:text-red-600 rounded-md transition-colors disabled:opacity-50"
                            title="Buscar na API"
                        >
                            {isSearching ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                        </button>
                    </div>

                    {duplicateError && (
                        <p className="text-[10px] text-red-600 font-bold mt-1 flex items-center gap-1 animate-pulse">
                            <AlertTriangle size={10} /> {duplicateError}
                        </p>
                    )}
                </div>
            </div>
        </div>

        {/* Dados Técnicos */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 bg-gray-50 border-b border-gray-200">
                <h3 className="font-bold text-sm text-gray-800 uppercase tracking-wider">Características Físicas</h3>
            </div>
            
            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                    <label className={LABEL_CLASS}>Marca <span className="text-red-500">*</span></label>
                    <div className="relative">
                        <input type="text" required className={INPUT_CLASS} value={formData.brand} onChange={e => setFormData({...formData, brand: e.target.value})} />
                        {formData.logo && (
                            <img src={formData.logo} alt="Logo" className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-auto object-contain p-1 bg-white rounded border border-gray-100" />
                        )}
                    </div>
                </div>
                <div>
                    <label className={LABEL_CLASS}>Modelo <span className="text-red-500">*</span></label>
                    <input type="text" required className={INPUT_CLASS} value={formData.model} onChange={e => setFormData({...formData, model: e.target.value})} />
                </div>
                <div>
                    <label className={LABEL_CLASS}>Ano <span className="text-red-500">*</span></label>
                    <input type="text" required className={INPUT_CLASS} value={formData.year} onChange={e => setFormData({...formData, year: e.target.value})} />
                </div>
                <div>
                    <label className={LABEL_CLASS}>Cor <span className="text-red-500">*</span></label>
                    <input type="text" required className={INPUT_CLASS} value={formData.color} onChange={e => setFormData({...formData, color: e.target.value})} />
                </div>
                
                <div>
                    <label className={LABEL_CLASS}>Estado (UF) <span className="text-red-500">*</span></label>
                    <input type="text" required className={INPUT_CLASS} value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} maxLength={2} />
                </div>
                
                <div>
                    <label className={LABEL_CLASS}>Chassi</label>
                    <input type="text" className={INPUT_CLASS} value={formData.chassi} onChange={e => setFormData({...formData, chassi: e.target.value})} />
                </div>
            </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-4 pt-4">
            <button 
                type="button" 
                onClick={onBack}
                disabled={isSaving}
                className="px-6 py-3 border border-gray-300 rounded-lg text-base font-bold text-gray-600 hover:bg-white transition-colors uppercase"
            >
                Cancelar
            </button>
            <button 
                type="submit" 
                disabled={isSaving || !!duplicateError}
                className="flex items-center gap-2 px-8 py-3 bg-black hover:bg-gray-900 text-white rounded-lg text-base font-bold shadow-md hover:shadow-lg transition-all uppercase disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                {isSaving ? 'Salvando...' : (id ? 'Salvar Alterações' : 'Salvar Veículo')}
            </button>
        </div>
      </form>
    </div>
  );
};

export default ClientVehicleForm;
