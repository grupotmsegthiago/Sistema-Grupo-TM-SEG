
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { VehicleTechnology } from '../types';
import { Plus, Search, Loader2, Trash2, RefreshCw, Pencil, Database, AlertTriangle, Radio } from 'lucide-react';

interface Props {
  onAdd: () => void;
  onEdit: (id: string) => void;
}

const VehicleTechnologyList: React.FC<Props> = ({ onAdd, onEdit }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [technologies, setTechnologies] = useState<VehicleTechnology[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isDirector, setIsDirector] = useState(false);
  const [dbStatus, setDbStatus] = useState<'ok' | 'error' | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('userData');
    if (storedUser) {
        const user = JSON.parse(storedUser);
        if (user.role === 'Diretoria' || user.permissions?.includes('*')) {
            setIsDirector(true);
        }
    }
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    setDbStatus(null);
    try {
        const { data, error } = await supabase.from('vehicle_technologies').select('*').order('name');
        if (error) throw error;
        setDbStatus('ok');
        if (data) setTechnologies(data);
    } catch (e) {
        console.error(e);
        setDbStatus('error');
    } finally {
        setIsLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`TEM CERTEZA? Excluir a tecnologia "${name}"?`)) return;
    setIsDeleting(id);
    try {
        const { data, error } = await supabase.from('vehicle_technologies').delete().eq('id', id).select();
        if (error) throw error;
        
        if (!data || data.length === 0) {
            throw new Error("Erro de permissão ou registro não encontrado.");
        }
        
        setTechnologies(prev => prev.filter(t => t.id !== id));
        alert('Tecnologia removida com sucesso.');
    } catch (e: any) { 
        alert('Erro ao excluir: ' + (e.message || "Verifique se há veículos vinculados a esta tecnologia.")); 
    }
    finally { setIsDeleting(null); }
  };

  const filtered = technologies.filter(t => 
    (t.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
            <span className="w-1.5 h-6 bg-indigo-700 rounded-full"></span>
            Tecnologias de Rastreamento
          </h2>
          <p className="text-sm text-gray-500 mt-1">Gerencie os modelos de rastreadores disponíveis para as viaturas.</p>
        </div>
        <div className="flex gap-2">
            <button onClick={fetchData} className="p-2.5 border rounded-lg hover:bg-gray-50 text-gray-500">
                <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
            </button>
            <button onClick={onAdd} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm uppercase">
                <Plus size={18} /> Nova Tecnologia
            </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gray-50/50">
           <div className="relative max-w-md">
            <input 
              type="text" 
              placeholder="Buscar tecnologia..." 
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search size={18} className="absolute left-3.5 top-3 text-gray-400" />
          </div>
        </div>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Nome da Tecnologia</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Data de Cadastro</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {isLoading ? (<tr><td colSpan={3} className="text-center p-8 text-gray-400">Carregando tecnologias...</td></tr>) : 
             filtered.length === 0 ? (<tr><td colSpan={3} className="text-center p-8 text-gray-400">Nenhuma tecnologia encontrada.</td></tr>) :
            filtered.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                   <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                        <Radio size={16} />
                      </div>
                      <div className="font-bold text-sm text-gray-900 uppercase">{item.name}</div>
                   </div>
                </td>
                <td className="px-6 py-4 text-xs text-gray-500">
                    {new Date(item.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                     <button onClick={() => onEdit(item.id)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Editar">
                         <Pencil size={18} />
                     </button>
                     {isDirector && (
                         <button 
                           onClick={() => handleDelete(item.id, item.name)} 
                           disabled={isDeleting === item.id}
                           className="p-2 text-red-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all" 
                           title="Excluir"
                         >
                             {isDeleting === item.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                         </button>
                     )}
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

export default VehicleTechnologyList;
