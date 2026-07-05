
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, Shield, Check, ChevronDown, ChevronRight, LayoutDashboard, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { NAV_ITEMS } from '../constants';

interface Props {
  onBack: () => void;
  id?: string | null;
}

const ProfileForm: React.FC<Props> = ({ onBack, id }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedModules, setExpandedModules] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [duplicateError, setDuplicateError] = useState('');

  useEffect(() => {
    if (id) {
        setIsLoading(true);
        supabase.from('profiles').select('*').eq('id', id).single()
        .then(({ data }) => {
            if (data) {
                setName(data.name);
                setDescription(data.description || '');
                setSelectedPermissions(data.permissions || []);
            }
            setIsLoading(false);
        });
    }
  }, [id]);

  const checkDuplicate = async (val: string) => {
      if (!val) return;
      try {
          let query = supabase.from('profiles').select('id').ilike('name', val);
          if (id) query = query.neq('id', id);
          
          const { data } = await query.maybeSingle();
          if (data) setDuplicateError('Nome de perfil já existe.');
          else setDuplicateError('');
      } catch (e) { console.error(e); }
  };

  const toggleModule = (item: any) => {
    const isSelected = selectedPermissions.includes(item.id);
    let newPermissions = [...selectedPermissions];
    const moduleIds = [item.id, ...(item.children?.map((c: any) => c.id) || [])];

    if (isSelected) {
        newPermissions = newPermissions.filter(id => !moduleIds.includes(id));
        setExpandedModules(prev => prev.filter(id => id !== item.id));
    } else {
        const idsToAdd = moduleIds.filter(id => !newPermissions.includes(id));
        newPermissions = [...newPermissions, ...idsToAdd];
        if (!expandedModules.includes(item.id)) {
            setExpandedModules(prev => [...prev, item.id]);
        }
    }
    setSelectedPermissions(newPermissions);
  };

  const toggleSubItem = (childId: string, parentId: string) => {
    const isSelected = selectedPermissions.includes(childId);
    let newPermissions = [...selectedPermissions];

    if (isSelected) {
        newPermissions = newPermissions.filter(id => id !== childId);
    } else {
        newPermissions.push(childId);
        if (!newPermissions.includes(parentId)) newPermissions.push(parentId);
    }
    setSelectedPermissions(newPermissions);
  };

  const toggleAccordion = (id: string) => {
    setExpandedModules(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return alert("Nome obrigatório");
    if (duplicateError) return alert("Nome duplicado");

    setIsSaving(true);
    try {
        const payload = { name, description, permissions: selectedPermissions };
        
        if (id) {
            const { error } = await supabase.from('profiles').update(payload).eq('id', id);
            if (error) throw error;
            alert('Perfil atualizado!');
        } else {
            const { error } = await supabase.from('profiles').insert([payload]);
            if (error) throw error;
            alert('Perfil criado!');
        }
        onBack();
    } catch (e: any) {
        console.error("Erro ProfileForm:", e);
        const msg = e?.message || (typeof e === 'object' ? JSON.stringify(e, null, 2) : String(e));
        alert(`Erro: ${msg}`);
    } finally {
        setIsSaving(false);
    }
  };

  if (isLoading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-red-600"/></div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in slide-in-from-right-4 duration-300">
      <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
              <ArrowLeft size={20} />
          </button>
          <h2 className="text-xl font-bold text-gray-900">{id ? 'Editar Perfil' : 'Novo Perfil'}</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
         <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
            <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase">Nome do Perfil <span className="text-red-500">*</span></label>
                <input 
                    type="text" required 
                    className={`w-full px-4 py-2.5 bg-white border rounded-lg outline-none focus:border-red-500 font-medium ${duplicateError ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                    value={name} 
                    onChange={e => {
                        setName(e.target.value);
                        setDuplicateError('');
                    }}
                    onBlur={() => checkDuplicate(name)}
                />
                {duplicateError && (
                    <p className="text-[10px] text-red-600 font-bold mt-1 flex items-center gap-1">
                        <AlertTriangle size={10} /> {duplicateError}
                    </p>
                )}
            </div>
            <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase">Descrição</label>
                <input type="text" className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg outline-none focus:border-red-500 text-sm" value={description} onChange={e => setDescription(e.target.value)}/>
            </div>
         </div>

         <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 bg-gray-50 border-b border-gray-200">
                <h3 className="font-bold text-sm text-gray-800 uppercase tracking-wider flex items-center gap-2">
                    <LayoutDashboard size={18} className="text-red-700" />
                    Permissões do Sistema
                </h3>
            </div>
            
            <div className="divide-y divide-gray-100">
                {NAV_ITEMS.map((item) => {
                    const isSelected = selectedPermissions.includes(item.id);
                    const isExpanded = expandedModules.includes(item.id);
                    const hasChildren = item.children && item.children.length > 0;
                    const selectedChildrenCount = item.children?.filter(c => selectedPermissions.includes(c.id)).length || 0;
                    const totalChildren = item.children?.length || 0;

                    return (
                        <div key={item.id} className="bg-white transition-colors">
                            <div className={`flex items-center justify-between p-4 ${isSelected ? 'bg-red-50/30' : ''}`}>
                                <div className="flex items-center gap-3 cursor-pointer select-none flex-1" onClick={() => hasChildren && toggleAccordion(item.id)}>
                                    <div className={`p-2 rounded-lg ${isSelected ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                                        <Shield size={18} />
                                    </div>
                                    <div>
                                        <div className="font-bold text-sm text-gray-800 uppercase">{item.name}</div>
                                        {hasChildren && <div className="text-xs text-gray-400 font-medium">{selectedChildrenCount}/{totalChildren} permissões</div>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <button type="button" onClick={() => toggleModule(item)} className={`w-12 h-6 rounded-full p-1 transition-colors flex items-center ${isSelected ? 'bg-green-500' : 'bg-gray-200'}`}>
                                        <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform ${isSelected ? 'translate-x-6' : 'translate-x-0'}`} />
                                    </button>
                                    {hasChildren && (
                                        <button type="button" onClick={() => toggleAccordion(item.id)} className="text-gray-400 hover:text-gray-600 p-1">
                                            {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                                        </button>
                                    )}
                                </div>
                            </div>
                            {hasChildren && isExpanded && (
                                <div className="bg-gray-50 border-t border-gray-100 px-4 py-3 pl-16 grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-in">
                                    {item.children?.map(child => {
                                        const isChildSelected = selectedPermissions.includes(child.id);
                                        return (
                                            <div key={child.id} onClick={() => toggleSubItem(child.id, item.id)} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border transition-all select-none ${isChildSelected ? 'bg-white border-green-200 shadow-sm' : 'border-transparent hover:bg-gray-100'}`}>
                                                <div className={`w-5 h-5 rounded border flex items-center justify-center ${isChildSelected ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300'}`}>
                                                    {isChildSelected && <Check size={12} className="text-white" />}
                                                </div>
                                                <span className={`text-sm font-medium ${isChildSelected ? 'text-gray-900' : 'text-gray-500'}`}>{child.name}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
         </div>

         <div className="pt-4 flex justify-end gap-3 pb-8">
             <button type="button" onClick={onBack} disabled={isSaving} className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm font-bold text-gray-600 uppercase hover:bg-gray-50">Cancelar</button>
             <button type="submit" disabled={isSaving || !!duplicateError} className="flex items-center gap-2 px-6 py-2.5 bg-black text-white rounded-lg text-sm font-bold hover:bg-gray-800 uppercase transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
                {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} {isSaving ? 'Salvando...' : 'Salvar'}
             </button>
         </div>
      </form>
    </div>
  );
};

export default ProfileForm;
