
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../lib/RealtimeProvider';
import { useNotification } from '../lib/NotificationContext';
import { formatDateBR } from '../lib/dateUtils';
import { ProviderData } from '../types';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, User, Briefcase, Car, Loader2, Trash2, RefreshCw, AlertTriangle, Pencil, Ban, CheckCircle2, Calendar, Database, FileSpreadsheet, DollarSign, FileWarning, Check, Hash, Fingerprint } from 'lucide-react';
import ImportProviderModal from './ImportProviderModal';
import { exportProviderCosts } from '../exports/provider-costs-export';

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
  const { showNotification } = useNotification();
  const [searchTerm, setSearchTerm] = useState('');
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDirector, setIsDirector] = useState(false);
  const [isCommercial, setIsCommercial] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userNamesMap, setUserNamesMap] = useState<Record<string, string>>({});
  
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportingCosts, setIsExportingCosts] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('userData');
    if (storedUser) {
        const user = JSON.parse(storedUser);
        setCurrentUser(user);
        const role = (user.role || '').toLowerCase();
        const n = (user.name || '').toUpperCase();
        if (role === 'administrador' || user.permissions?.includes('*') ||
            role === 'avançado' || role === 'avancado' || role === 'diretoria' ||
            n.includes('DANIEL') || n.includes('MICHELLE')) {
            setIsAdmin(true);
        }
        if (role === 'diretoria' || user.permissions?.includes('*')) {
            setIsDirector(true);
        }
        if (role === 'comercial' && !user.permissions?.includes('*')) {
            setIsCommercial(true);
        }
    }
    fetchInternalUsers();
  }, []);

  useRealtimeRefresh(['providers', 'vehicles', 'agents', 'provider_cost_tables', 'system_users'], () => {
    refetchProviders();
    fetchInternalUsers();
  });

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

  const { data: dbProviders = [], isLoading, isError: providersError, refetch: refetchProviders } = useQuery<ProviderWithTableStatus[]>({
    queryKey: ['providers', isCommercial, currentUser?.id],
    enabled: !!currentUser,
    queryFn: async () => {
      let providersData: any[] | null = null;
      let baseQuery = supabase.from('providers').select('*').order('name', { ascending: true });
      if (isCommercial) {
          baseQuery = baseQuery.eq('created_by', currentUser?.name);
      }
      const { data, error } = await baseQuery;
      
      if (error) {
          if (error.message?.includes('schema cache')) {
               let fbQuery = supabase
                 .from('providers')
                 .select('id, name, trading_name, cnpj, type, contact_name, status')
                 .order('name', { ascending: true });
               if (isCommercial) {
                   fbQuery = fbQuery.eq('created_by', currentUser?.name);
               }
               const { data: fallbackData, error: fbError } = await fbQuery;
               if (fbError) throw fbError;
               providersData = fallbackData;
          } else {
              throw error;
          }
      } else {
          providersData = data;
      }

      if (!providersData) return [];

      const [
          { data: vehiclesData },
          { data: agentsData },
          { data: costsData }
      ] = await Promise.all([
          supabase.from('vehicles').select('provider').eq('status', 'Ativo'),
          supabase.from('agents').select('provider').eq('status', 'Ativo'),
          supabase.from('provider_cost_tables').select('provider')
      ]);

      const vehicleCounts = (vehiclesData || []).reduce((acc: any, v: any) => {
          acc[v.provider] = (acc[v.provider] || 0) + 1;
          return acc;
      }, {} as Record<string, number>);

      const agentCounts = (agentsData || []).reduce((acc: any, a: any) => {
          acc[a.provider] = (acc[a.provider] || 0) + 1;
          return acc;
      }, {} as Record<string, number>);

      const providersWithTableSet = new Set(costsData?.map((item: any) => item.provider) || []);

      const mapped: ProviderWithTableStatus[] = providersData.map((item: any) => {
         let computedStatus = item.status;
         if (item.status !== 'Bloqueado' && item.alvara_validity) {
             const [year, month, day] = item.alvara_validity.split('-').map(Number);
             const validityDate = new Date(year, month - 1, day, 12, 0, 0);
             const today = new Date();
             today.setHours(0,0,0,0);
             if (validityDate < today) {
                 computedStatus = 'Alvará Vencido';
             } else if (computedStatus === 'Alvará Vencido') {
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
         } as ProviderWithTableStatus;
      });
      mapped.sort((a, b) => {
          const nameA = (a.trading_name || a.name || '').toUpperCase();
          const nameB = (b.trading_name || b.name || '').toUpperCase();
          return nameA.localeCompare(nameB, 'pt-BR');
      });
      return mapped;
    },
  });

  const dbStatus = providersError ? 'error' : (!isLoading ? 'ok' : null);
  const fetchProviders = () => { refetchProviders(); };

  const handleExportCosts = async () => {
      setIsExportingCosts(true);
      try {
          let provQuery = supabase
              .from('providers')
              .select('name, trading_name, cnpj, state')
              .order('name', { ascending: true });
          if (isCommercial) {
              provQuery = provQuery.eq('created_by', currentUser?.name);
          }
          let [{ data: provData, error: provErr }, { data: costData, error: costErr }] = await Promise.all([
              provQuery,
              supabase.from('provider_cost_tables').select('provider, operation_type, activation_cost, franchise_hours, franchise_km, cost_per_extra_km, cost_per_extra_hour, cancellation_fee'),
          ]);
          if (provErr) {
              let fbQuery = supabase
                  .from('providers')
                  .select('name, trading_name, cnpj')
                  .order('name', { ascending: true });
              if (isCommercial) {
                  fbQuery = fbQuery.eq('created_by', currentUser?.name);
              }
              const { data: fbData, error: fbErr } = await fbQuery;
              if (fbErr) throw fbErr;
              provData = fbData;
          }
          if (costErr) throw costErr;
          if (!provData || provData.length === 0) {
              showNotification('Atenção', 'Nenhum fornecedor encontrado para exportar.', 'error');
              return;
          }
          await exportProviderCosts(provData as any, (costData || []) as any);
          showNotification('Sucesso', 'Relatório de custos de fornecedores gerado.', 'success');
      } catch (e) {
          const msg = e instanceof Error ? e.message : 'Erro desconhecido';
          showNotification('Erro', 'Falha ao exportar custos de fornecedores: ' + msg, 'error');
      } finally {
          setIsExportingCosts(false);
      }
  };

  const handleToggleStatus = async (id: string, currentStatus: string, name: string) => {
      const newStatus = (currentStatus === 'Ativo') ? 'Bloqueado' : 'Ativo';
      if (!confirm(`Deseja alterar o status de "${name}" para ${newStatus.toUpperCase()}?`)) return;
      setIsToggling(id);
      try {
          const { error } = await supabase.from('providers').update({ status: newStatus }).eq('id', id);
          if (error) throw error;
          fetchProviders();
      } catch (e) {
          const msg = e instanceof Error ? e.message : 'Erro desconhecido';
          showNotification('Erro', 'Falha ao alterar status do fornecedor: ' + msg, 'error');
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
            <button onClick={handleExportCosts} disabled={isExportingCosts} className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2.5 rounded-lg text-sm font-bold transition-colors shadow-sm uppercase" data-testid="button-export-provider-costs">{isExportingCosts ? <Loader2 size={18} className="animate-spin" /> : <DollarSign size={18} />} Exportar Custos (Excel)</button>
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
                                {formatDateBR(item.created_at)}
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
