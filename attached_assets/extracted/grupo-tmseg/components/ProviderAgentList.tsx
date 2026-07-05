import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Agent } from '../types';
import { Plus, Search, MoreVertical, User, ShieldCheck, RefreshCw, Pencil, Trash2, Loader2, Phone, CreditCard, FileText, Database, AlertTriangle } from 'lucide-react';

interface Props {
  onAdd: () => void;
  onEdit: (id: string) => void;
}

const ProviderAgentList: React.FC<Props> = ({ onAdd, onEdit }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDirector, setIsDirector] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<'ok' | 'error' | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('userData');
    if (storedUser) {
        const user = JSON.parse(storedUser);
        if (user.role === 'Diretoria' || user.permissions?.includes('*')) {
            setIsDirector(true);
        }
    }
    fetchAgents();
  }, []);
  
  const fetchAgents = async () => {
    setIsLoading(true);
    setDbStatus(null);
    try {
        const { data, error } = await supabase.from('agents').select('*').order('name');
        if (error) throw error;
        setDbStatus('ok');
        if(data) setAgents(data as any);
    } catch(e){ 
        console.error(e);
        setDbStatus('error');
    }
    finally { setIsLoading(false) }
  };

  const handleDelete = async (id: string) => {
    if(!confirm('Deseja excluir este agente?')) return;
    setIsDeleting(id);
    try {
        const { data, error } = await supabase.from('agents').delete().eq('id', id).select();
        if(error) throw error;
        
        if (!data || data.length === 0) {
            throw new Error("Erro de permissão: O banco de dados recusou a exclusão.");
        }
        
        fetchAgents();
    } catch (e: any) { alert(e.message) }
    finally { setIsDeleting(null) }
  };

  const filtered = agents.filter(a => 
    (a.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (a.provider || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
            <span className="w-1.5 h-6 bg-red-700 rounded-full"></span>
            Agentes e Motoristas
          </h2>
          {dbStatus === 'ok' && (
              <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-green-700 bg-green-50 px-2 py-1 rounded w-fit border border-green-200">
                  <Database size={12} /> Teste do banco de dados ok
              </div>
          )}
          {dbStatus === 'error' && (
              <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-red-700 bg-red-50 px-2 py-1 rounded w-fit border border-red-200">
                  <AlertTriangle size={12} /> Erro de Conexão com o Banco
                  <button onClick={fetchAgents} className="underline ml-2 hover:text-red-900">Tentar Novamente</button>
              </div>
          )}
        </div>
        <div className="flex gap-2">
            <button onClick={fetchAgents} className="p-2.5 border rounded-lg hover:bg-gray-50 text-gray-500">
                <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
            </button>
            <button onClick={onAdd} className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm uppercase">
            <Plus size={18} /> Novo Agente
            </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gray-50/50">
           <div className="relative max-w-md">
            <input 
              type="text" 
              placeholder="Buscar agente ou fornecedor..." 
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search size={18} className="absolute left-3.5 top-3 text-gray-400" />
          </div>
        </div>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="pl-10 px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Nome do Agente</th>
              <th className="pl-10 px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Contato / Docs</th>
              <th className="pl-10 px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Fornecedor (Base)</th>
              <th className="pl-10 px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="pl-10 px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {isLoading ? (<tr><td colSpan={5} className="text-center p-4">Carregando...</td></tr>) : 
             filtered.length === 0 ? (<tr><td colSpan={5} className="text-center p-4 text-gray-500">Nenhum agente encontrado.</td></tr>) :
            filtered.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                <td className="pl-10 px-6 py-4">
                   <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center border border-gray-200 text-gray-600">
                        <User size={16} />
                      </div>
                      <div>
                        <div className="font-bold text-sm text-gray-900 uppercase">{item.name}</div>
                        <div className="text-xs text-gray-500">{item.role}</div>
                      </div>
                   </div>
                </td>
                <td className="pl-10 px-6 py-4">
                  <div className="flex flex-col gap-1 text-xs uppercase text-gray-600 font-medium">
                      {item.phone && (
                        <div className="flex items-center gap-1.5"><Phone size={12} className="text-gray-400"/> {item.phone}</div>
                      )}
                      {item.cnh && (
                        <div className="flex items-center gap-1.5"><CreditCard size={12} className="text-gray-400"/> CNH: {item.cnh}</div>
                      )}
                      {item.cnv && (
                        <div className="flex items-center gap-1.5"><FileText size={12} className="text-gray-400"/> CNV: {item.cnv}</div>
                      )}
                  </div>
                </td>
                <td className="pl-10 px-6 py-4 text-sm text-indigo-700 font-bold uppercase">{item.provider}</td>
                <td className="pl-10 px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${item.status === 'Ativo' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                        {item.status}
                    </span>
                </td>
                <td className="pl-10 px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                     <button onClick={() => onEdit(item.id)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Editar">
                         <Pencil size={18} />
                     </button>
                     {isDirector && (
                         <button 
                           onClick={() => handleDelete(item.id)} 
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

export default ProviderAgentList;