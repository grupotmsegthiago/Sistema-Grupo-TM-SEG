
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Save, Radio, Loader2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { logAction } from '../lib/logger';
import { useNotification } from '../lib/NotificationContext';

interface Props {
  onBack: () => void;
  id?: string | null;
}

const INPUT_CLASS = "w-full px-4 py-3 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-base transition-all uppercase font-medium";
const LABEL_CLASS = "text-xs font-bold text-gray-500 uppercase mb-1.5 block tracking-wider";

const VehicleTechnologyForm: React.FC<Props> = ({ onBack, id }) => {
  const { showNotification } = useNotification();
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [duplicateError, setDuplicateError] = useState('');

  useEffect(() => {
    if (id) {
        setIsLoading(true);
        supabase.from('vehicle_technologies').select('*').eq('id', id).single()
        .then(({ data }) => {
            if (data) setName(data.name);
            setIsLoading(false);
        });
    }
  }, [id]);

  const checkDuplicate = async (val: string) => {
      if (!val) return;
      try {
          let query = supabase.from('vehicle_technologies').select('id').ilike('name', val.trim());
          if (id) query = query.neq('id', id);
          const { data } = await query.maybeSingle();
          if (data) setDuplicateError('Esta tecnologia já está cadastrada.');
          else setDuplicateError('');
      } catch (e) { console.error(e); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (duplicateError) return;

    setIsSaving(true);
    try {
        const payload = { name: name.trim().toUpperCase() };
        
        if (id) {
            const { error } = await supabase.from('vehicle_technologies').update(payload).eq('id', id);
            if (error) throw error;
            await logAction('UPDATE', 'Technology', id, `Tecnologia atualizada: ${payload.name}`);
            showNotification('Sucesso', 'Tecnologia atualizada com sucesso!', 'success');
        } else {
            const { data, error } = await supabase.from('vehicle_technologies').insert([payload]).select();
            if (error) {
                if (error.message.includes('relation "vehicle_technologies" does not exist')) {
                    throw new Error("ERRO: A tabela 'vehicle_technologies' não existe no banco de dados. Contate o administrador para rodar o script SQL.");
                }
                throw error;
            }
            const newId = data?.[0]?.id?.toString() || 'ID';
            await logAction('CREATE', 'Technology', newId, `Nova Tecnologia cadastrada: ${payload.name}`);
            showNotification('Sucesso', 'Tecnologia cadastrada com sucesso!', 'success');
        }
        onBack();
    } catch (e: any) {
        alert(e.message);
    } finally {
        setIsSaving(false);
    }
  };

  if (isLoading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-indigo-600"/></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in slide-in-from-right-4 duration-300">
      <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"><ArrowLeft size={20} /></button>
          <h2 className="text-xl font-bold text-gray-900">{id ? 'Editar Tecnologia' : 'Nova Tecnologia de Rastreamento'}</h2>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 space-y-6">
         <div className="flex items-center gap-3 text-indigo-800 border-b border-gray-100 pb-4 mb-4">
            <div className="p-2 bg-indigo-50 rounded-lg"><Radio size={24} /></div>
            <div>
                <h3 className="font-bold uppercase tracking-tight">Dados da Tecnologia</h3>
                <p className="text-xs text-gray-500">Informe o nome do sistema de rastreamento (Ex: SASCAR, OMNILINK, etc).</p>
            </div>
         </div>

         <div className="space-y-4">
            <div>
                <label className={LABEL_CLASS}>Nome do Sistema / Fabricante</label>
                <input 
                    type="text" required autoFocus
                    className={`${INPUT_CLASS} ${duplicateError ? 'border-red-500 bg-red-50' : ''}`}
                    placeholder="Ex: QUANTUM"
                    value={name}
                    onChange={e => {
                        setName(e.target.value);
                        setDuplicateError('');
                    }}
                    onBlur={() => checkDuplicate(name)}
                />
                {duplicateError && (
                    <p className="text-[10px] text-red-600 font-bold mt-1.5 flex items-center gap-1 animate-pulse">
                        <AlertTriangle size={12} /> {duplicateError}
                    </p>
                )}
            </div>
         </div>

         <div className="pt-6 border-t border-gray-100 flex justify-end gap-3">
             <button type="button" onClick={onBack} disabled={isSaving} className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm font-bold text-gray-600 uppercase hover:bg-gray-50 transition-colors">Cancelar</button>
             <button type="submit" disabled={isSaving || !!duplicateError} className="flex items-center gap-2 px-8 py-2.5 bg-black text-white rounded-lg text-sm font-bold hover:bg-gray-800 uppercase transition-all shadow-md disabled:opacity-50">
                {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} 
                {id ? 'Salvar Alterações' : 'Confirmar Cadastro'}
             </button>
         </div>
      </form>
    </div>
  );
};

export default VehicleTechnologyForm;
