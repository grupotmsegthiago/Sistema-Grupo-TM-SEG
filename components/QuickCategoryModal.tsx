
import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { X, Save, Loader2, Tag } from 'lucide-react';
import { FinancialCategory, TransactionType } from '../types';

interface Props {
  onClose: () => void;
  onSuccess: (newCategory: FinancialCategory) => void;
  initialType?: TransactionType;
}

const QuickCategoryModal: React.FC<Props> = ({ onClose, onSuccess, initialType = 'EXPENSE' }) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<TransactionType>(initialType);
  const [group, setGroup] = useState('CUSTOS_VARIAVEIS');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return alert("Nome é obrigatório");

    setIsSaving(true);
    try {
        const payload = {
            name,
            type,
            group,
            recurrence_type: 'VARIAVEL',
            tag: 'OPERACIONAL',
            scope: 'EMPRESA',
            is_deduction: group === 'DEDUCOES'
        };

        const { data, error } = await supabase.from('financial_categories').insert([payload]).select().single();
        
        if (error) throw error;
        if (data) {
            onSuccess(data as FinancialCategory);
            onClose();
        }
    } catch (error: any) {
        alert("Erro ao salvar: " + error.message);
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border border-gray-200">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                    <Tag size={16} className="text-green-600"/> Nova Categoria Rápida
                </h3>
                <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-gray-600"/></button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Nome da Categoria</label>
                    <input 
                        autoFocus
                        type="text" 
                        required 
                        className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:border-green-500 outline-none"
                        placeholder="Ex: Material de Escritório"
                        value={name}
                        onChange={e => setName(e.target.value)}
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Tipo</label>
                        <select 
                            className="w-full p-2 border border-gray-300 rounded-lg text-xs bg-white"
                            value={type}
                            onChange={e => setType(e.target.value as TransactionType)}
                        >
                            <option value="EXPENSE">Despesa (-)</option>
                            <option value="INCOME">Receita (+)</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Grupo DRE</label>
                        <select 
                            className="w-full p-2 border border-gray-300 rounded-lg text-xs bg-white"
                            value={group}
                            onChange={e => setGroup(e.target.value)}
                        >
                            <option value="CUSTOS_VARIAVEIS">Custos Variáveis</option>
                            <option value="DESPESAS_FIXAS">Despesas Fixas</option>
                            <option value="RECEITA_BRUTA">Receita</option>
                            <option value="DEDUCOES">Impostos/Deduções</option>
                            <option value="INVESTIMENTOS">Investimentos</option>
                        </select>
                    </div>
                </div>

                <div className="pt-2">
                    <button 
                        type="submit" 
                        disabled={isSaving}
                        className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all"
                    >
                        {isSaving ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>}
                        Salvar e Usar
                    </button>
                </div>
            </form>
        </div>
    </div>
  );
};

export default QuickCategoryModal;
