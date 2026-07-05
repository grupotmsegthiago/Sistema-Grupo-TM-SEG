
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Save, DollarSign, Clock, Gauge, Briefcase, Shield, Loader2, AlertTriangle } from 'lucide-react';
import { ProviderData } from '../types';

interface Props {
  onBack: () => void;
  id?: string | null;
  // Callback agora aceita o ID opcionalmente para auto-seleção
  onSuccess?: (newId?: string) => void;
  fixedProviderName?: string;
  defaultOperationType?: string;
}

const INPUT_CLASS = "w-full pl-12 pr-4 py-3 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-sm transition-all text-gray-700 font-medium placeholder-gray-400";
const SELECT_CLASS = `${INPUT_CLASS} appearance-none bg-[url('https://api.iconify.design/lucide/chevron-down.svg?color=%239ca3af')] bg-[length:1.25em] bg-no-repeat bg-[position:right_1rem_center]`;
const LABEL_CLASS = "text-xs font-bold text-gray-600 uppercase mb-1.5 block";

const ProviderCostForm: React.FC<Props> = ({ onBack, id, onSuccess, fixedProviderName, defaultOperationType }) => {
  const [formData, setFormData] = useState({
    provider: '',
    operation_type: 'CARACTERIZADA',
    activation_cost: '',
    franchise_hours: '',
    franchise_km: '',
    cost_per_extra_km: '',
    cost_per_extra_hour: ''
  });

  const [providers, setProviders] = useState<ProviderData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [duplicateError, setDuplicateError] = useState('');

  useEffect(() => {
    async function loadData() {
        setIsLoading(true);
        try {
            // ALTERAÇÃO: neq 'Bloqueado' para permitir 'Ativo' e 'Alvará Vencido'
            const { data: provData } = await supabase.from('providers').select('id, name').neq('status', 'Bloqueado');
            if(provData) setProviders(provData as any);

            if (fixedProviderName) {
                setFormData(prev => ({ ...prev, provider: fixedProviderName }));
            }
            if (defaultOperationType && !id) {
                setFormData(prev => ({ ...prev, operation_type: defaultOperationType }));
            }

            if(id) {
                const { data: tableData } = await supabase.from('provider_cost_tables').select('*').eq('id', id).single();
                if(tableData) {
                    setFormData({
                        provider: tableData.provider,
                        operation_type: tableData.operation_type,
                        activation_cost: tableData.activation_cost,
                        franchise_hours: tableData.franchise_hours,
                        franchise_km: tableData.franchise_km,
                        cost_per_extra_km: tableData.cost_per_extra_km,
                        cost_per_extra_hour: tableData.cost_per_extra_hour,
                    });
                }
            }
        } catch(e) { console.error(e) }
        finally { setIsLoading(false) }
    }
    loadData();
  }, [id, fixedProviderName, defaultOperationType]);

  const checkDuplicate = async (provName: string, opType: string) => {
      if (!provName || !opType) return;
      try {
          let query = supabase.from('provider_cost_tables')
            .select('id')
            .eq('provider', provName)
            .eq('operation_type', opType);
            
          if (id) query = query.neq('id', id);
          
          const { data } = await query.maybeSingle();
          if (data) setDuplicateError('Tabela de custo já existe para este fornecedor e operação.');
          else setDuplicateError('');
      } catch (e) { console.error(e); }
  };

  useEffect(() => {
      checkDuplicate(formData.provider, formData.operation_type);
  }, [formData.provider, formData.operation_type]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (duplicateError) {
        alert("Já existe uma tabela de custo para esta combinação de Fornecedor e Operação.");
        return;
    }
    setIsSaving(true);
    try {
        const payload = {
            provider: formData.provider,
            operation_type: formData.operation_type,
            activation_cost: parseFloat(String(formData.activation_cost)) || 0,
            franchise_hours: parseFloat(String(formData.franchise_hours)) || 0,
            franchise_km: parseFloat(String(formData.franchise_km)) || 0,
            cost_per_extra_km: parseFloat(String(formData.cost_per_extra_km)) || 0,
            cost_per_extra_hour: parseFloat(String(formData.cost_per_extra_hour)) || 0,
        };
        let resultId = id;

        if(id) {
            const { error } = await supabase.from('provider_cost_tables').update(payload).eq('id', id);
            if(error) throw error;
        } else {
            const { data, error } = await supabase.from('provider_cost_tables').insert([payload]).select();
            if(error) throw error;
            if (data && data.length > 0) resultId = data[0].id.toString();
        }
        
        // Retorna o ID para o componente pai (Modal de Auditoria)
        if (onSuccess) onSuccess(resultId || undefined);
        else onBack();
        
    } catch(e: any) { alert(e.message) }
    finally { setIsSaving(false) }
  };
  
  if(isLoading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-red-600"/></div>

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-right-4 duration-300">
      
      {!fixedProviderName && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
                <button onClick={onBack} className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                    <ArrowLeft size={20} />
                </button>
                <h2 className="text-xl font-bold text-gray-900">{id ? 'Editar Custo' : 'Novo Custo Operacional'}</h2>
            </div>
          </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 space-y-8">
         
         {duplicateError && (
             <div className="bg-red-50 p-4 rounded-lg border border-red-200 text-red-700 flex items-center gap-2 text-sm font-bold animate-pulse">
                 <AlertTriangle size={18} /> {duplicateError}
             </div>
         )}

         {/* Seção 1: Vinculação */}
         <div>
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
               <Briefcase size={18} className="text-indigo-700" />
               <h3 className="font-bold text-sm text-gray-800 uppercase tracking-wider">Identificação do Fornecedor</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                   <label className={LABEL_CLASS}>Fornecedor</label>
                   <div className="relative">
                      <select 
                        required
                        className={`${SELECT_CLASS} ${fixedProviderName ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                        value={formData.provider}
                        onChange={e => setFormData({...formData, provider: e.target.value})}
                        disabled={!!fixedProviderName}
                      >
                         <option value="">Selecione o Fornecedor...</option>
                         {providers.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                      </select>
                      <Briefcase size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                   </div>
                </div>
                <div>
                   <label className={LABEL_CLASS}>Operação / Rota</label>
                   <div className="relative">
                      <input
                        required
                        list="prov-ops-list"
                        type="text"
                        className={INPUT_CLASS}
                        value={formData.operation_type}
                        onChange={e => setFormData({...formData, operation_type: e.target.value.toUpperCase()})}
                        placeholder="Ex: CARACTERIZADA ou ROTA X"
                      />
                      <datalist id="prov-ops-list">
                         <option value="CARACTERIZADA" />
                         <option value="PRONTA RESPOSTA" />
                         <option value="MOTO VELADA" />
                         <option value="ESCOLTA VELADA" />
                      </datalist>
                      <Shield size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                   </div>
                </div>
            </div>
         </div>

         {/* Seção 2: Valores e Franquias */}
         <div>
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
               <DollarSign size={18} className="text-green-700" />
               <h3 className="font-bold text-sm text-gray-800 uppercase tracking-wider">Custos Base e Franquias</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {/* Acionamento */}
               <div>
                   <label className={LABEL_CLASS}>Custo do Acionamento (Saída)</label>
                   <div className="relative">
                      <input 
                        type="number" step="0.01" required
                        className={INPUT_CLASS} 
                        placeholder="0.00"
                        value={formData.activation_cost}
                        onChange={e => setFormData({...formData, activation_cost: e.target.value})}
                      />
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-xs">R$</span>
                   </div>
               </div>

               {/* Franquia Horas */}
               <div>
                   <label className={LABEL_CLASS}>Franquia de Horas</label>
                   <div className="relative">
                      <input 
                        type="number" required
                        className={INPUT_CLASS} 
                        placeholder="Ex: 8"
                        value={formData.franchise_hours}
                        onChange={e => setFormData({...formData, franchise_hours: e.target.value})}
                      />
                      <Clock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500 pointer-events-none" />
                   </div>
               </div>

               {/* Franquia KM */}
               <div>
                   <label className={LABEL_CLASS}>Franquia de KM</label>
                   <div className="relative">
                      <input 
                        type="number" required
                        className={INPUT_CLASS} 
                        placeholder="Ex: 100"
                        value={formData.franchise_km}
                        onChange={e => setFormData({...formData, franchise_km: e.target.value})}
                      />
                      <Gauge size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-orange-500 pointer-events-none" />
                   </div>
               </div>
            </div>
         </div>

         {/* Seção 3: Excedentes */}
         <div>
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
               <DollarSign size={18} className="text-red-700" />
               <h3 className="font-bold text-sm text-gray-800 uppercase tracking-wider">Custos Extra (Excedentes)</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div>
                   <label className={LABEL_CLASS}>Custo KM Extra (por KM excedente)</label>
                   <div className="relative">
                      <input 
                        type="number" step="0.01" required
                        className={INPUT_CLASS} 
                        placeholder="Ex: 1.20"
                        value={formData.cost_per_extra_km}
                        onChange={e => setFormData({...formData, cost_per_extra_km: e.target.value})}
                      />
                      <Gauge size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-orange-500 pointer-events-none" />
                   </div>
               </div>

               <div>
                   <label className={LABEL_CLASS}>Custo Hora Extra (por hora excedente)</label>
                   <div className="relative">
                      <input 
                        type="number" step="0.01" required
                        className={INPUT_CLASS} 
                        placeholder="Ex: 35.00"
                        value={formData.cost_per_extra_hour}
                        onChange={e => setFormData({...formData, cost_per_extra_hour: e.target.value})}
                      />
                      <Clock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500 pointer-events-none" />
                   </div>
               </div>
            </div>
         </div>

         <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
             <button type="button" onClick={onBack} disabled={isSaving} className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm font-bold text-gray-600 uppercase hover:bg-gray-50 transition-colors">Cancelar</button>
             <button type="submit" disabled={isSaving || !!duplicateError} className="flex items-center gap-2 px-8 py-2.5 bg-black text-white rounded-lg text-sm font-bold hover:bg-gray-800 uppercase transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
                {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} 
                {id ? 'Salvar Alterações' : 'Confirmar Cadastro'}
             </button>
         </div>
      </form>
    </div>
  );
};

export default ProviderCostForm;
