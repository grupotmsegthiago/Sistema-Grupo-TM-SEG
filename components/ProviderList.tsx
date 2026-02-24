
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { ProviderData } from '../types';
import { Plus, Search, User, Briefcase, Car, Loader2, Trash2, RefreshCw, AlertTriangle, Pencil, Ban, CheckCircle2, Calendar, Database, FileSpreadsheet, DollarSign, FileWarning, Check, Hash, Fingerprint } from 'lucide-react';
import ImportProviderModal from './ImportProviderModal';

interface ProviderListProps {
  onAddProvider: () => void;
  onEdit: (id: string) => void;
}

interface ProviderWithTableStatus extends ProviderData {
    hasCostTable: boolean;
    created_at?: string;
    created_by?: string;
}

const ProviderList: React.FC<ProviderListProps> = ({ onAddProvider, onEdit }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [dbProviders, setDbProviders] = useState<ProviderWithTableStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDirector, setIsDirector] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [dbStatus, setDbStatus] = useState<'ok' | 'error' | null>(null);
  const [userNamesMap, setUserNamesMap] = useState<Record<string, string>>({});
  
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('userData');
    if (storedUser) {
        const user = JSON.parse(storedUser);
        setCurrentUser(user);
        if (user.role === 'Administrador' || user.permissions?.includes('*')) {
            setIsAdmin(true);
        }
        if (user.role === 'Diretoria' || user.permissions?.includes('*')) {
            setIsDirector(true);
        }
    }
    fetchInternalUsers();
    fetchProviders();
  }, []);

  const fetchInternalUsers = async () => {
    try {
        const { data } = await supabase.from('system_users').select('id, name');
        if (data) {
            const map: Record<string, string> = {};
            data.forEach(u => { map[u.id] = u.name; });
            setUserNamesMap(map);
        }
    } catch (e) { console.error(e); }
  };

  const canSeeAlvara = useMemo(() => {
      const role = (currentUser?.role || '').toLowerCase();
      return role === 'administrador' || role === 'avançado' || role === 'avancado' || role === 'diretoria';
  }, [currentUser]);

  async function fetchProviders() {
    setIsLoading(true);
    setDbStatus(null);
    try {
      // Usamos uma consulta que falha graciosamente caso colunas novas não existam
      const { data: providersData, error: providersError } = await supabase
        .from('providers')
        .select('*')
        .order('id', { ascending: false });
      
      if (providersError) {
          // Se o erro for especificamente o schema cache, tentamos selecionar colunas fixas conhecidas
          if (providersError.message?.includes('schema cache')) {
               const { data: fallbackData, error: fbError } = await supabase
                 .from('providers')
                 .select('id, name, cnpj, type, contact_name, status')
                 .order('id', { ascending: false });
               
               if (fbError) throw fbError;
               processProviders(fallbackData);
          } else {
              throw providersError;
          }
      } else {
          processProviders(providersData);
      }
      
      setDbStatus('ok');
    } catch (e) { 
        console.error("Erro ao carregar fornecedores:", e);
        setDbStatus('error');
    } finally { 
        setIsLoading(false); 
    }
  }

  const processProviders = async (providersData: any[]) => {
      if (!providersData) {
        setDbProviders([]);
        return;
      }

      const [
          { data: vehiclesData },
          { data: agentsData },
          { data: costsData }
      ] = await Promise.all([
          supabase.from('vehicles').select('provider').eq('status', 'Ativo'),
          supabase.from('agents').select('provider').eq('status', 'Ativo'),
          supabase.from('provider_cost_tables').select('provider')
      ]);

      const vehicleCounts = (vehiclesData || []).reduce((acc, v) => {
          acc[v.provider] = (acc[v.provider] || 0) + 1;
          return acc;
      }, {} as Record<string, number>);

      const agentCounts = (agentsData || []).reduce((acc, a) => {
          acc[a.provider] = (acc[a.provider] || 0) + 1;
          return acc;
      }, {} as Record<string, number>);

      const providersWithTableSet = new Set(costsData?.map((item: any) => item.provider) || []);

      const mapped: ProviderWithTableStatus[] = providersData.map((item: any) => {
         let computedStatus = item.status;
         
         // Lógica de Vencimento de Alvará
         if (item.status !== 'Bloqueado' && item.alvara_validity) {
             const [year, month, day] = item.alvara_validity.split('-').map(Number);
             const validityDate = new Date(year, month - 1, day, 12, 0, 0); // Meio dia para evitar timezone offset
             
             const today = new Date();
             today.setHours(0,0,0,0);
             
             if (validityDate < today) {
                 computedStatus = 'Alvará Vencido';
             } else if (computedStatus === 'Alvará Vencido') {
                 // Correção automática: Se a data é válida mas o status estava vencido, assume Ativo visualmente
                 computedStatus = 'Ativo';
             }
         }
         
         return {
            id: item.id.toString(),
            name: item.name,
            trading_name: item.trading_name, 
            cnpj: item.cnpj,
            type: item.type as any,
            contactName: item.contact_name,
            status: computedStatus, 
            vehicleCount: vehicleCounts[item.name] || 0,
            agentCount: agentCounts[item.name] || 0,
            alvaraValidity: item.alvara_validity,
            hasCostTable: providersWithTableSet.has(item.name), 
            created_at: item.created_at,
            created_by: item.created_by
         };
      });
      setDbProviders(mapped);
  };

  const handleToggleStatus = async (id: string, currentStatus: string, name: string) => {
      const newStatus = (currentStatus === 'Ativo') ? 'Bloqueado' : 'Ativo';
      if (!confirm(`Deseja alterar o status de "${name}" para ${newStatus.toUpperCase()}?`)) return;
      setIsToggling(id);
      try {
          const { error } = await supabase.from('providers').update({ status: newStatus }).eq('id', id);
          if (error) throw error;
          fetchProviders();
      } catch (e: any) {
          alert('Erro: ' + e.message);
      } finally {
          setIsToggling(null);
      }
  };

  const filtered = dbProviders.filter(p => 
    (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (p.trading_name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (p.cnpj || '').includes(searchTerm)
  );

  const getCreatorName = (createdBy: string | undefined) => {
      if (!createdBy) return '---';
      return userNamesMap[createdBy] || createdBy;
  };

  return (
    <div className="space-y-6 animate-fade-in relative pb-10">
      {isImportModalOpen && (
          <ImportProviderModal onClose={() => setIsImportModalOpen(false)} onSuccess={() => fetchProviders()} />
      )}

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
            <span className="w-1.5 h-6 bg-red-700 rounded-full"></span>
            Fornecedores e Parceiros
          </h2>
          {dbStatus === 'ok' && (
              <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-green-700 bg-green-50 px-2 py-1 rounded w-fit border border-green-200">
                  <Database size={12} /> Sincronizado
              </div>
          )}
          {dbStatus === 'error' && (
              <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-red-600 bg-red-50 px-3 py-1 rounded-lg border border-red-200">
                  <AlertTriangle size={12} /> Erro de Schema: Atualização de Banco Necessária (S.O.C)
              </div>
          )}
        </div>
        <div className="flex gap-2">
            <button onClick={fetchProviders} className="p-2.5 border rounded-lg hover:bg-gray-50 text-gray-500">
                <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
            </button>
            <button onClick={() => setIsImportModalOpen(true)} className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors shadow-sm uppercase"><FileSpreadsheet size={18} /> Importar (IA)</button>
            <button onClick={onAddProvider} className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm uppercase"><Plus size={18} /> Novo Fornecedor</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
           <div className="relative max-w-md w-full">
            <input type="text" placeholder="Buscar fornecedor..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
        </div>

        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">ID / Fornecedor</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-center">Cadastro Efetuado</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Equipe Ativa</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Custo Tabela</th>
                  {canSeeAlvara && <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Status Alvará</th>}
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Status Geral</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {isLoading ? (<tr><td colSpan={canSeeAlvara ? 7 : 6} className="p-6 text-center text-gray-500">Carregando...</td></tr>) : 
                 filtered.map((item) => (
                  <tr key={item.id} className={`transition-colors group ${canSeeAlvara && item.status === 'Alvará Vencido' ? 'bg-red-50 hover:bg-red-100/50' : 'hover:bg-gray-50'}`}>
                    <td className="px-6 py-4">
                       <div className="flex items-center gap-4">
                          <div className={`w-14 h-12 rounded-xl flex flex-col items-center justify-center border-2 shadow-lg transition-all bg-indigo-700 border-indigo-800 text-white shrink-0`}>
                            <span className="text-[8px] font-black opacity-40 leading-none mb-0.5 tracking-tighter">TMSEG</span>
                            <span className="text-base font-black font-mono leading-none tracking-tighter">{item.id.padStart(3, '0')}</span>
                          </div>
                          <div>
                            <div className="font-bold text-sm text-gray-900 uppercase">{item.trading_name || item.name}</div>
                            <div className="text-[10px] text-gray-400 mt-0.5 font-mono flex items-center gap-1"><Fingerprint size={10} className="opacity-50"/> {item.cnpj}</div>
                          </div>
                       </div>
                    </td>
                    
                    <td className="px-6 py-4 text-center">
                        <div className="flex flex-col items-center">
                            <div className="flex items-center gap-1 text-[10px] font-black text-gray-700 uppercase">
                                <Calendar size={12} className="text-red-600" />
                                {item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : '-'}
                            </div>
                            <div className="flex items-center gap-1 text-[9px] font-black text-indigo-700 uppercase mt-1.5 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100 shadow-sm min-w-[90px] justify-center">
                                <User size={10} className="text-indigo-500" />
                                {getCreatorName(item.created_by)}
                            </div>
                        </div>
                    </td>

                    <td className="px-6 py-4">
                        <div className="flex flex-col gap-1.5 text-xs font-medium text-gray-600">
                           <div className="flex items-center gap-1.5"><Car size={14} className="text-gray-400"/> Frota: <span className="font-bold text-gray-800">{item.vehicleCount}</span></div>
                           <div className="flex items-center gap-1.5"><User size={14} className="text-gray-400"/> Agentes: <span className="font-bold text-gray-800">{item.agentCount}</span></div>
                        </div>
                    </td>
                    
                    <td className="px-6 py-4">
                        {item.hasCostTable ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-green-50 text-green-700 border border-green-200"><DollarSign size={10} /> Cadastrado</span>
                        ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-orange-50 text-orange-700 border border-orange-200"><FileWarning size={10} /> Pendente</span>
                        )}
                    </td>

                    {canSeeAlvara && (
                        <td className="px-6 py-4">
                            {item.status === 'Alvará Vencido' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold uppercase bg-red-600 text-white animate-pulse"><AlertTriangle size={12} /> ALVARÁ VENCIDO</span>
                            ) : (
                                <span className="text-xs font-bold text-green-600 flex items-center gap-1"><Check size={12}/> VÁLIDO</span>
                            )}
                        </td>
                    )}

                    <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${item.status === 'Ativo' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{item.status}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                           {isAdmin && (
                                <>
                                    <button onClick={() => handleToggleStatus(item.id, item.status, item.name)} className={`p-2 rounded-lg transition-all ${item.status === 'Ativo' ? 'text-gray-400 hover:text-red-600 hover:bg-red-50' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`} title={item.status === 'Ativo' ? 'Bloquear Fornecedor' : 'Desbloquear Fornecedor'} disabled={isToggling === item.id}>{isToggling === item.id ? <Loader2 size={18} className="animate-spin" /> : item.status === 'Ativo' ? <Ban size={18} /> : <CheckCircle2 size={18} />}</button>
                                    <button onClick={() => onEdit(item.id)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><Pencil size={18} /></button>
                                </>
                            )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};

export default ProviderList;
