
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { logAction } from '../lib/logger';
import { FinancialCategory } from '../types';
import { Plus, Trash2, Tag, Save, X, Loader2, ArrowUpCircle, ArrowDownCircle, Building2, User, Pencil } from 'lucide-react';

interface Props {
    onClose?: () => void;
}

const FinancialCategoryManager: React.FC<Props> = ({ onClose }) => {
    const [categories, setCategories] = useState<FinancialCategory[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [formData, setFormData] = useState({
        name: '',
        type: 'EXPENSE',
        group: 'CUSTOS_VARIAVEIS',
        recurrence_type: 'VARIAVEL',
        tag: 'OPERACIONAL',
        scope: 'EMPRESA'
    });
    const [isSaving, setIsSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    useEffect(() => {
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase.from('financial_categories').select('*').order('name');
            if (error) {
                if (error.message.includes('relation "financial_categories" does not exist')) {
                    console.warn("Tabela de categorias não encontrada.");
                    setCategories([]);
                    return;
                }
                throw error;
            }
            if (data) setCategories(data as any);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Excluir esta categoria?")) return;
        try {
            const cat = categories.find(c => c.id === id);
            const { error } = await supabase.from('financial_categories').delete().eq('id', id);
            if (error) throw error;
            await logAction('DELETE', 'FinancialCategory', id, `Categoria financeira excluída: ${cat?.name || 'N/A'} (${cat?.type || 'N/A'})`);
            fetchCategories();
        } catch (e: any) {
            alert("Erro ao excluir: " + e.message);
        }
    };

    const handleEdit = (cat: FinancialCategory) => {
        setEditingId(cat.id);
        setFormData({
            name: cat.name,
            type: cat.type as string,
            group: cat.group,
            recurrence_type: cat.recurrence_type || 'VARIAVEL',
            tag: cat.tag || 'OPERACIONAL',
            scope: cat.scope || 'EMPRESA'
        });
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setFormData({
            name: '',
            type: 'EXPENSE',
            group: 'CUSTOS_VARIAVEIS',
            recurrence_type: 'VARIAVEL',
            tag: 'OPERACIONAL',
            scope: 'EMPRESA'
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.name) {
            alert("Preencha o nome da categoria.");
            return;
        }

        setIsSaving(true);
        try {
            const payload = {
                name: formData.name,
                type: formData.type,
                group: formData.group,
                recurrence_type: formData.recurrence_type,
                tag: formData.tag,
                scope: formData.scope,
                is_deduction: formData.group === 'DEDUCOES'
            };

            if (editingId) {
                // UPDATE
                const { error } = await supabase.from('financial_categories').update(payload).eq('id', editingId);
                if (error) throw error;
            } else {
                // INSERT
                const { error } = await supabase.from('financial_categories').insert([payload]);
                
                if (error) {
                    const msg = error.message;
                    if (msg.includes('recurrence_type') || msg.includes('tag') || msg.includes('scope') || msg.includes('relation "financial_categories" does not exist')) {
                        throw new Error("ERRO CRÍTICO: Tabela 'financial_categories' não existe ou está desatualizada.\n\nSOLUÇÃO: Vá em Configurações > Auditoria & Logs, clique no botão 'Corrigir Permissões (SQL)', copie o código e execute no SQL Editor do Supabase.");
                    }
                    throw error;
                }
            }

            handleCancelEdit();
            fetchCategories();
        } catch (error: any) {
            console.error(error);
            alert("Erro ao salvar categoria: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <Tag className="text-indigo-600" /> Categorias Financeiras
                </h3>
                {onClose && <button onClick={onClose}><X size={20} /></button>}
            </div>

            <form onSubmit={handleSubmit} className={`p-4 rounded-lg border mb-6 transition-colors ${editingId ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                
                {/* SCOPE SELECTION */}
                <div className="flex gap-4 mb-4">
                    <label className={`flex items-center gap-2 cursor-pointer p-2 rounded-lg border transition-all ${formData.scope === 'EMPRESA' ? 'bg-blue-100 border-blue-300 text-blue-800 font-bold shadow-sm' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-100'}`}>
                        <input 
                            type="radio" 
                            name="scope" 
                            className="hidden"
                            checked={formData.scope === 'EMPRESA'} 
                            onChange={() => setFormData({...formData, scope: 'EMPRESA'})} 
                        />
                        <Building2 size={16} /> Corporativo (Empresa)
                    </label>
                    <label className={`flex items-center gap-2 cursor-pointer p-2 rounded-lg border transition-all ${formData.scope === 'PESSOAL' ? 'bg-purple-100 border-purple-300 text-purple-800 font-bold shadow-sm' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-100'}`}>
                        <input 
                            type="radio" 
                            name="scope" 
                            className="hidden"
                            checked={formData.scope === 'PESSOAL'} 
                            onChange={() => setFormData({...formData, scope: 'PESSOAL'})} 
                        />
                        <User size={16} /> Pessoal
                    </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
                    <div className="lg:col-span-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Nome da Categoria</label>
                        <input 
                            type="text" required 
                            className="w-full p-2 border rounded text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white" 
                            placeholder="Ex: Combustível, Salários..." 
                            value={formData.name} 
                            onChange={e => setFormData({...formData, name: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Tipo</label>
                        <select className="w-full p-2 border rounded text-xs bg-white" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                            <option value="INCOME">Receita</option>
                            <option value="EXPENSE">Despesa</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Grupo DRE</label>
                        <select className="w-full p-2 border rounded text-xs bg-white" value={formData.group} onChange={e => setFormData({...formData, group: e.target.value})}>
                            <option value="RECEITA_BRUTA">Receita Bruta</option>
                            <option value="CUSTOS_VARIAVEIS">Custos Variáveis</option>
                            <option value="DESPESAS_FIXAS">Despesas Fixas</option>
                            <option value="DEDUCOES">Deduções/Impostos</option>
                            <option value="INVESTIMENTOS">Investimentos</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Recorrência / Tag</label>
                        <select className="w-full p-2 border rounded text-xs bg-white" value={formData.recurrence_type} onChange={e => setFormData({...formData, recurrence_type: e.target.value})}>
                            <option value="FIXA">Conta Fixa/Mensal</option>
                            <option value="VARIAVEL">Variável</option>
                            <option value="EVENTUAL">Eventual</option>
                        </select>
                    </div>
                    
                    <div className="flex gap-1">
                        <button type="submit" disabled={isSaving} className={`flex-1 text-white p-2 rounded font-bold text-xs flex items-center justify-center gap-1 h-[34px] transition-colors shadow-sm ${editingId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                            {isSaving ? <Loader2 size={14} className="animate-spin"/> : (editingId ? <Save size={14}/> : <Plus size={14}/>)} 
                            {editingId ? 'Salvar' : 'Criar'}
                        </button>
                        {editingId && (
                            <button type="button" onClick={handleCancelEdit} className="bg-gray-200 text-gray-600 px-2 rounded hover:bg-gray-300">
                                <X size={14}/>
                            </button>
                        )}
                    </div>
                </div>
            </form>

            <div className="overflow-hidden border border-gray-200 rounded-lg max-h-[400px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                    <thead className="bg-gray-100 text-gray-600 font-bold uppercase sticky top-0">
                        <tr>
                            <th className="p-3">Nome</th>
                            <th className="p-3">Escopo</th>
                            <th className="p-3">Tipo</th>
                            <th className="p-3">Grupo DRE</th>
                            <th className="p-3">Classificação</th>
                            <th className="p-3 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {isLoading ? <tr><td colSpan={6} className="p-4 text-center">Carregando...</td></tr> : 
                         categories.length === 0 ? <tr><td colSpan={6} className="p-4 text-center text-gray-500">Nenhuma categoria cadastrada.</td></tr> :
                         categories.map(cat => (
                            <tr key={cat.id} className="hover:bg-gray-50">
                                <td className="p-3 font-bold text-gray-800">{cat.name}</td>
                                <td className="p-3">
                                    {cat.scope === 'PESSOAL' ? (
                                        <span className="flex items-center gap-1 text-purple-600 font-bold text-[10px] bg-purple-50 px-2 py-0.5 rounded w-fit uppercase border border-purple-100">
                                            <User size={10} /> Pessoal
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 text-blue-600 font-bold text-[10px] bg-blue-50 px-2 py-0.5 rounded w-fit uppercase border border-blue-100">
                                            <Building2 size={10} /> Empresa
                                        </span>
                                    )}
                                </td>
                                <td className="p-3">
                                    {cat.type === 'INCOME' 
                                        ? <span className="flex items-center gap-1 text-green-600"><ArrowUpCircle size={12}/> Receita</span> 
                                        : <span className="flex items-center gap-1 text-red-600"><ArrowDownCircle size={12}/> Despesa</span>
                                    }
                                </td>
                                <td className="p-3 text-gray-600 font-mono text-[10px]">{cat.group}</td>
                                <td className="p-3">
                                    <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[10px] font-bold border border-gray-200">
                                        {cat.recurrence_type}
                                    </span>
                                </td>
                                <td className="p-3 text-right">
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => handleEdit(cat)} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded transition-colors" title="Editar">
                                            <Pencil size={14}/>
                                        </button>
                                        <button onClick={() => handleDelete(cat.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors" title="Excluir">
                                            <Trash2 size={14}/>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default FinancialCategoryManager;
