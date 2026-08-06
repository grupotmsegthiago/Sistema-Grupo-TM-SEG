import React, { useState, useEffect, useMemo } from 'react';
import { Client } from '../types';
import { supabase } from '../lib/supabase';
import { authFetch } from '../lib/authFetch';
import { useRealtimeRefresh } from '../lib/RealtimeProvider';
import { useNotification } from '../lib/NotificationContext';
import { formatDateBR } from '../lib/dateUtils';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, Building2, Phone, Mail, Loader2, Trash2, RefreshCw, Pencil, Ban, CheckCircle2, Database, AlertTriangle, DollarSign, FileWarning, TrendingUp, Send, CheckCircle, Clock, ShieldCheck, User, Calendar, Hash, Fingerprint, Target, UserCheck, ToggleLeft, ToggleRight, Lock } from 'lucide-react';

interface ClientListProps {
  onAddClient: () => void;
  onEdit: (id: string) => void;
  clients?: Client[]; 
}

interface ClientWithTableStatus extends Client {
    hasPriceTable: boolean;
}

const ClientList: React.FC<ClientListProps> = ({ onAddClient, onEdit }) => {
  const { showNotification } = useNotification();
  const [searchTerm, setSearchTerm] = useState('');
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState<string | null>(null);
  const [isTogglingRule, setIsTogglingRule] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDirector, setIsDirector] = useState(false);
  const [isCommercial, setIsCommercial] = useState(false);
  const [lockedClientId, setLockedClientId] = useState<number | null>(null);
  const [userNamesMap, setUserNamesMap] = useState<Record<string, string>>({});
  const [currentUser, setCurrentUser] = useState<any>(null);

  const [filterAdjustment, setFilterAdjustment] = useState<'ALL' | 'PENDING' | 'DONE'>('ALL');
  const [filterType, setFilterType] = useState<'ALL' | 'CLIENT' | 'PROSPECT'>('ALL');
  const [isSyncingAsaas, setIsSyncingAsaas] = useState(false);

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
        if (user.clientId) {
            setLockedClientId(parseInt(user.clientId));
        }
    }
    fetchInternalUsers();
  }, []);

  useRealtimeRefresh(['clients', 'client_price_tables', 'system_users'], () => {
    refetchClients();
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

  const fetchClientsQueryFn = async (): Promise<ClientWithTableStatus[]> => {
      let query = supabase
        .from('clients')
        .select('*')
        .order('trading_name', { ascending: true });

      if (lockedClientId) {
          query = query.eq('id', lockedClientId);
      } else if (isCommercial) {
          const allowedIds = currentUser?.permissions?.filter((p: string) => p.startsWith('client_view:')).map((p: string) => p.split(':')[1]) || [];
          if (allowedIds.length > 0) {
              query = query.or(`created_by.eq."${currentUser?.name}",id.in.(${allowedIds.join(',')})`);
          } else {
              query = query.eq('created_by', currentUser?.name);
          }
      }

      const { data, error } = await query;
      if (error) throw error;

      const { data: priceData } = await supabase
        .from('client_price_tables')
        .select('client');
      
      const clientsWithTableSet = new Set(priceData?.map((item: any) => item.client) || []);

      return (data || []).map((item: any) => ({
          id: item.id.toString(),
          name: item.name,
          trading_name: item.trading_name, 
          cnpj: item.cnpj,
          contactName: item.contact_name,
          email: item.email,
          phone: item.phone,
          status: item.status,
          address: item.address,
          adjustment_2026_applied: !!item.adjustment_2026_applied,
          proposal_2026_sent: !!item.proposal_2026_sent,
          full_extra_hour_after_16_min: !!item.full_extra_hour_after_16_min,
          hasPriceTable: clientsWithTableSet.has(item.name),
          created_at: item.created_at,
          created_by: item.created_by,
          is_prospect: !!item.is_prospect
      }));
  };

  const { data: dbClients = [], isLoading, isError: clientsError, refetch: refetchClients } = useQuery<ClientWithTableStatus[]>({
    queryKey: ['clients', lockedClientId, isCommercial, currentUser?.id],
    queryFn: fetchClientsQueryFn,
    enabled: !!currentUser,
  });

  const dbStatus = clientsError ? 'error' : (!isLoading ? 'ok' : null);
  const fetchClients = () => { refetchClients(); };

  const handleToggleStatus = async (id: string, currentStatus: string, name: string) => {
      const newStatus = currentStatus === 'Ativo' ? 'Inativo' : 'Ativo';
      if (!confirm(`Deseja alterar o status de "${name}" para ${newStatus.toUpperCase()}?`)) return;

      setIsToggling(id);
      try {
          const { error } = await supabase.from('clients').update({ status: newStatus }).eq('id', id);
          if (error) throw error;
          refetchClients();
      } catch (e) {
          const msg = e instanceof Error ? e.message : 'Erro desconhecido';
          showNotification('Erro', 'Erro ao alterar status: ' + msg, 'error');
      } finally {
          setIsToggling(null);
      }
  };

  const handleToggleRule15Min = async (id: string, currentVal: boolean) => {
      if (!isAdmin && !isDirector) return; // Segurança extra no frontend
      
      // Confirmação de Segurança solicitada
      const action = !currentVal ? "ATIVAR" : "DESATIVAR";
      if (!window.confirm(`CONFIRMAÇÃO DE DIRETORIA:\n\nDeseja alterar a regra de faturamento deste cliente?\nAção: ${action} a regra de 'Hora Cheia > 15min'.\n\nIsso impactará o cálculo automático de horas extras.`)) {
          return;
      }
      
      setIsTogglingRule(id);
      const newVal = !currentVal;
      
      // Atualização Otimista
      refetchClients();

      try {
          const { error } = await supabase.from('clients').update({ full_extra_hour_after_16_min: newVal }).eq('id', id);
          if (error) throw error;
      } catch (e) {
          console.error(e);
          const msg = e instanceof Error ? e.message : 'Erro desconhecido';
          showNotification('Erro', 'Erro ao alterar regra: ' + msg, 'error');
          // Reverter em caso de erro
          refetchClients();
      } finally {
          setIsTogglingRule(null);
      }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`TEM CERTEZA? O cliente "${name}" será INATIVADO.\n\nO registro será mantido no banco de dados mas ficará com status INATIVO.`)) return;
    setIsDeleting(id);
    try {
        const { error } = await supabase.from('clients').update({ status: 'Inativo' }).eq('id', id);
        if (error) throw error;
        showNotification('Sucesso', 'Cliente inativado com sucesso. O registro permanece no banco de dados.', 'success');
        refetchClients();
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro desconhecido';
        showNotification('Erro', 'Erro ao inativar: ' + msg, 'error');
    } finally {
        setIsDeleting(null);
    }
  };

  const filteredClients = useMemo(() => {
      return dbClients.filter(c => {
        const matchesSearch = (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                             (c.cnpj || '').includes(searchTerm) ||
                             (c.trading_name || '').toLowerCase().includes(searchTerm.toLowerCase());
        
        let matchesAdjustment = true;
        if (filterAdjustment === 'PENDING') matchesAdjustment = !c.adjustment_2026_applied;
        if (filterAdjustment === 'DONE') matchesAdjustment = c.adjustment_2026_applied;

        let matchesType = true;
        if (filterType === 'CLIENT') matchesType = !c.is_prospect;
        if (filterType === 'PROSPECT') matchesType = c.is_prospect;

        return matchesSearch && matchesAdjustment && matchesType;
      });
  }, [dbClients, searchTerm, filterAdjustment, filterType]);

  const getCreatorName = (createdBy: string | undefined) => {
      if (!createdBy) return '---';
      return userNamesMap[createdBy] || createdBy;
  };

  const canEditRule = isAdmin || isDirector;

  const syncAllActiveClientsToAsaas = async () => {
    if (isSyncingAsaas) return;
    const ok = window.confirm(
      'Enviar todos os clientes ATIVOS (com endereço completo) para as 3 contas Asaas?\n\nTM Gestão, TM Segurança e TM Security.\nQuem estiver sem CEP/endereço será pulado.',
    );
    if (!ok) return;
    setIsSyncingAsaas(true);
    let offset = 0;
    let synced = 0;
    let skipped = 0;
    let errors = 0;
    try {
      // Lotes de 2 (anti-timeout Vercel). Cap alto só como trava de segurança —
      // a saída real é nextOffset == null (carteira inteira).
      for (let round = 0; round < 500; round++) {
        const res = await authFetch('/api/asaas/sync-customers', {
          method: 'POST',
          body: JSON.stringify({ limit: 2, offset }),
        });
        const data = await res.json().catch(() => ({} as any));
        if (!res.ok && res.status !== 207) {
          throw new Error(data.error || `Falha HTTP ${res.status}`);
        }
        synced += Number(data.updated || 0) + Number(data.created || 0);
        skipped += Number(data.skipped || 0);
        errors += Number(data.errors || 0);
        if (data.nextOffset == null) break;
        offset = Number(data.nextOffset);
      }
      showNotification(
        errors > 0 ? 'Sync Asaas com avisos' : 'Sync Asaas concluído',
        `Sincronizados: ${synced} | Pulados: ${skipped} | Erros: ${errors}`,
        errors > 0 ? 'warning' : 'success',
      );
    } catch (e: any) {
      showNotification('Erro no sync Asaas', e?.message || 'Falha ao sincronizar', 'error');
    } finally {
      setIsSyncingAsaas(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-black p-6 rounded-2xl shadow-xl border border-white/5 text-white">
          <div className="flex flex-col lg:flex-row justify-between items-center gap-8">
              <div className="flex items-center gap-4">
                  <div className="p-4 bg-red-600 rounded-2xl shadow-lg shadow-red-900/20">
                      <TrendingUp size={28} />
                  </div>
                  <div>
                      <h2 className="text-xl font-black uppercase tracking-tighter">Controle Comercial</h2>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Gestão de Carteira e Novos Clientes</p>
                  </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 flex-1 max-w-3xl w-full">
                  <div className="bg-white/5 p-3 rounded-xl border border-white/10 text-center">
                      <p className="text-[10px] text-gray-500 font-bold uppercase">Cadastros Totais</p>
                      <p className="text-2xl font-black">{dbClients.length}</p>
                  </div>
                  <div className="bg-green-500/10 p-3 rounded-xl border border-green-500/20 text-center">
                      <p className="text-[10px] text-green-500 font-bold uppercase">Clientes Efetivos</p>
                      <p className="text-2xl font-black text-green-400">{dbClients.filter(c => !c.is_prospect).length}</p>
                  </div>
                  <div className="bg-orange-500/10 p-3 rounded-xl border border-orange-500/20 text-center">
                      <p className="text-[10px] text-orange-500 font-bold uppercase">Prospecções</p>
                      <p className="text-2xl font-black text-orange-400">{dbClients.filter(c => c.is_prospect).length}</p>
                  </div>
              </div>
          </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex flex-wrap gap-2">
            <div className="bg-gray-100 p-1 rounded-lg flex gap-1 mr-4">
                <button onClick={() => setFilterType('ALL')} className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${filterType === 'ALL' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Tudo</button>
                <button onClick={() => setFilterType('CLIENT')} className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${filterType === 'CLIENT' ? 'bg-green-600 text-white shadow-sm' : 'text-gray-500 hover:text-green-700'}`}>Clientes</button>
                <button onClick={() => setFilterType('PROSPECT')} className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${filterType === 'PROSPECT' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-500 hover:text-orange-700'}`}>Prospecção</button>
            </div>
            
            <button onClick={() => setFilterAdjustment('ALL')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase border transition-all ${filterAdjustment === 'ALL' ? 'bg-gray-900 text-white shadow-md' : 'bg-gray-50 text-gray-500'}`}>Todos Status</button>
            <button onClick={() => setFilterAdjustment('PENDING')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase border transition-all ${filterAdjustment === 'PENDING' ? 'bg-orange-50 text-white shadow-md' : 'bg-orange-50 text-orange-600 border-orange-100'}`}>Reaj. Pendente</button>
            <button onClick={() => setFilterAdjustment('DONE')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase border transition-all ${filterAdjustment === 'DONE' ? 'bg-green-600 text-white shadow-md' : 'bg-green-50 text-green-700 border-green-100'}`}>Reajustados</button>
        </div>
        <div className="flex gap-2">
            <button onClick={fetchClients} className="p-2.5 border rounded-lg hover:bg-gray-50 text-gray-500">
                <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
            </button>
            {isAdmin && (
                <button
                  type="button"
                  onClick={syncAllActiveClientsToAsaas}
                  disabled={isSyncingAsaas}
                  className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white px-4 py-2.5 rounded-lg text-xs font-black transition-colors shadow-sm uppercase"
                  data-testid="btn-sync-clients-asaas"
                >
                  {isSyncingAsaas ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  Sync Asaas (3 contas)
                </button>
            )}
            {!lockedClientId && (
                <button onClick={onAddClient} className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm uppercase">
                <Plus size={18} /> Novo Cliente
                </button>
            )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gray-50 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <input 
              type="text" 
              placeholder="Buscar cliente ou CNPJ..." 
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search size={18} className="absolute left-3.5 top-3 text-gray-400" />
          </div>
        </div>

        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">ID / Cliente</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Perfil Comercial</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Regra 15min</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Cadastro</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {isLoading ? (<tr><td colSpan={6} className="p-6 text-center text-gray-500">Carregando...</td></tr>) : 
                 filteredClients.length === 0 ? (<tr><td colSpan={6} className="p-6 text-center text-gray-500">Nenhum cliente encontrado na sua carteira.</td></tr>) :
                filteredClients.map((client) => (
                  <tr key={client.id} className={`transition-colors ${client.is_prospect ? 'bg-orange-50/20' : 'hover:bg-gray-50'}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className={`w-14 h-12 rounded-xl flex flex-col items-center justify-center border-2 shadow-lg transition-all ${client.is_prospect ? 'bg-orange-500 border-orange-600 text-white' : 'bg-slate-900 border-slate-800 text-white'}`}>
                            <span className="text-[8px] font-black opacity-40 leading-none mb-0.5 tracking-tighter">TMSEG</span>
                            <span className="text-base font-black font-mono leading-none">{client.id.padStart(3, '0')}</span>
                        </div>
                        <div>
                            <div className={`font-bold text-sm uppercase ${client.is_prospect ? 'text-orange-900' : 'text-gray-900'}`}>
                                {client.trading_name || client.name}
                            </div>
                            <div className="text-[10px] text-gray-400 font-bold uppercase mt-0.5 flex items-center gap-1">
                                <Fingerprint size={10} className="opacity-50" /> {client.cnpj}
                            </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                        {client.is_prospect ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase bg-orange-100 text-orange-700 border border-orange-200">
                                <Target size={12} /> Prospecção
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase bg-green-100 text-green-700 border border-green-200">
                                <UserCheck size={12} /> Cliente Efetivo
                            </span>
                        )}
                    </td>
                    <td className="px-6 py-4 text-center align-middle">
                        <div className="flex items-center justify-center h-full">
                            <button 
                                onClick={() => handleToggleRule15Min(client.id, !!client.full_extra_hour_after_16_min)} 
                                disabled={!canEditRule || isTogglingRule === client.id}
                                className={`
                                    relative w-14 h-8 rounded-full border-2 transition-all duration-300 ease-in-out shadow-inner flex items-center p-1
                                    ${client.full_extra_hour_after_16_min 
                                        ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 border-emerald-700' 
                                        : 'bg-gradient-to-r from-gray-200 to-gray-300 border-gray-400'
                                    }
                                    ${!canEditRule ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:shadow-md'}
                                `}
                                title={canEditRule ? "Alternar Regra de Faturamento (3D Toggle)" : "Acesso Restrito: Diretoria/Admin"}
                            >
                                {isTogglingRule === client.id ? (
                                     <div className="absolute inset-0 flex items-center justify-center">
                                         <Loader2 size={14} className="animate-spin text-white drop-shadow-md" />
                                     </div>
                                ) : (
                                    <>
                                        <div 
                                            className={`
                                                w-5 h-5 rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.3)] border border-gray-100 transform transition-transform duration-300 ease-in-out flex items-center justify-center
                                                ${client.full_extra_hour_after_16_min 
                                                    ? 'translate-x-6 bg-white' 
                                                    : 'translate-x-0 bg-gray-50'
                                                }
                                            `}
                                        >
                                            {client.full_extra_hour_after_16_min && <Clock size={10} className="text-emerald-600" />}
                                        </div>
                                        
                                        {!client.full_extra_hour_after_16_min && (
                                            <span className="absolute right-2 text-[8px] font-black text-gray-500 uppercase tracking-widest drop-shadow-sm">OFF</span>
                                        )}
                                        {client.full_extra_hour_after_16_min && (
                                            <span className="absolute left-2 text-[8px] font-black text-white uppercase tracking-widest drop-shadow-sm">ON</span>
                                        )}
                                    </>
                                )}
                            </button>
                            {!canEditRule && <Lock size={12} className="ml-2 text-gray-300" />}
                        </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${client.status === 'Ativo' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                        {client.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                        <div className="flex flex-col items-center">
                            <div className="flex items-center gap-1 text-[10px] font-black text-gray-700 uppercase">
                                <Calendar size={12} className="text-red-600" />
                                {formatDateBR(client.created_at)}
                            </div>
                            <div className="flex items-center gap-1 text-[9px] font-black text-blue-700 uppercase mt-1.5 bg-blue-50 px-2 py-1 rounded-lg border border-blue-100 shadow-sm min-w-[90px] justify-center">
                                <User size={10} className="text-blue-500" />
                                {getCreatorName(client.created_by)}
                            </div>
                        </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                            {(isAdmin || isCommercial) && (
                                <>
                                    <button 
                                        onClick={() => handleToggleStatus(client.id, client.status, client.name)}
                                        className={`p-2 rounded-lg transition-all ${client.status === 'Ativo' ? 'text-gray-400 hover:text-red-600 hover:bg-red-50' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`}
                                        title={client.status === 'Ativo' ? 'Inativar Cliente' : 'Ativar Cliente'}
                                        disabled={isToggling === client.id}
                                    >
                                        {isToggling === client.id ? <Loader2 size={18} className="animate-spin" /> : 
                                         client.status === 'Ativo' ? <Ban size={18} /> : <CheckCircle2 size={18} />
                                        }
                                    </button>
                                    <button 
                                        onClick={() => onEdit(client.id)}
                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                        title="Editar"
                                    >
                                        <Pencil size={18} />
                                    </button>
                                </>
                            )}
                            {isDirector && (
                                <button 
                                    onClick={() => handleDelete(client.id, client.name)}
                                    disabled={isDeleting === client.id}
                                    className="p-2 text-red-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all"
                                    title="Excluir Definitivamente (Diretoria)"
                                >
                                    {isDeleting === client.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
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
    </div>
  );
};

export default ClientList;