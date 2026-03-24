
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { APP_VERSION } from '../constants';
import { 
  Plus, Shield, Loader2, RefreshCw, Pencil, Eye, EyeOff, 
  Trash2, Ban, CheckCircle2, Database, AlertTriangle, 
  Building2, Briefcase, LogIn, Search, Package 
} from 'lucide-react';
import { useNotification } from '../lib/NotificationContext';

interface UserListProps {
  onAddUser: () => void;
  onEdit: (id: string) => void;
  userType: 'internal' | 'client' | 'provider';
}

const UserList: React.FC<UserListProps> = ({ onAddUser, onEdit, userType }) => {
  const { showNotification } = useNotification();
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [dbStatus, setDbStatus] = useState<'ok' | 'error' | null>(null);
  
  // Permissão Especial para Ver Senhas, Excluir e Impersonar
  const [isDirector, setIsDirector] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [equipmentMap, setEquipmentMap] = useState<{[userId: string]: { patrimony_id: string; type: string; brand: string; model: string }[]}>({});

  const [revealedPasswords, setRevealedPasswords] = useState<{[key: string]: boolean}>({});

  useEffect(() => {
    // Verificar permissão de Admin e Diretoria
    const storedUser = localStorage.getItem('userData');
    if (storedUser) {
        const user = JSON.parse(storedUser);
        if (user.role === 'Administrador' || user.permissions?.includes('*')) {
            setIsAdmin(true);
        }
        if (user.role === 'Diretoria' || user.permissions?.includes('*')) {
            setIsDirector(true);
        }
    }
  }, []);

  const getTitle = () => {
      switch(userType) {
          case 'internal': return 'Equipe Interna';
          case 'client': return 'Usuários de Cliente';
          case 'provider': return 'Usuários de Fornecedor';
          default: return 'Usuários';
      }
  };

  const getSubtitle = () => {
      switch(userType) {
          case 'internal': return 'Funcionários e Administradores do Grupo TMSEG';
          case 'client': return 'Acesso restrito para visualização de monitoramento';
          case 'provider': return 'Acesso para parceiros de escolta';
          default: return '';
      }
  };

  const fetchUsers = async () => {
    setIsLoading(true);
    setDbStatus(null);
    try {
        const { data: usersData, error: userError } = await supabase
            .from('system_users')
            .select('*')
            .order('created_at', { ascending: false });

        if (userError) throw userError;
        
        setDbStatus('ok');

        if (!usersData || usersData.length === 0) {
             setUsers([]);
             return;
        }

        const profileIds = [...new Set(usersData.map((u: any) => u.profile_id).filter(Boolean))];
        const clientIds = [...new Set(usersData.map((u: any) => u.client_id).filter(Boolean))];
        const providerIds = [...new Set(usersData.map((u: any) => u.provider_id).filter(Boolean))];

        const [profilesRes, clientsRes, providersRes] = await Promise.all([
            profileIds.length > 0 ? supabase.from('profiles').select('id, name, permissions').in('id', profileIds) : { data: [] },
            clientIds.length > 0 ? supabase.from('clients').select('id, name, trading_name').in('id', clientIds) : { data: [] },
            providerIds.length > 0 ? supabase.from('providers').select('id, name').in('id', providerIds) : { data: [] }
        ]);

        const profileMap = (profilesRes.data || []).reduce((acc: any, p: any) => ({ ...acc, [p.id]: p }), {});
        const clientMap = (clientsRes.data || []).reduce((acc: any, c: any) => ({ ...acc, [c.id]: c.trading_name || c.name }), {});
        const providerMap = (providersRes.data || []).reduce((acc: any, p: any) => ({ ...acc, [p.id]: p.name }), {});

        const enrichedUsers = usersData.map((user: any) => ({
            ...user,
            profiles: user.profile_id ? profileMap[user.profile_id] : null,
            clients: user.client_id ? { name: clientMap[user.client_id] || 'Desconhecido' } : null,
            providers: user.provider_id ? { name: providerMap[user.provider_id] || 'Desconhecido' } : null,
        }));

        const currentUserData = (() => {
            try { return JSON.parse(localStorage.getItem('userData') || '{}'); } catch { return {}; }
        })();
        const currentUserClientId = currentUserData.clientId || currentUserData.client_id || '';

        const filteredUsers = enrichedUsers.filter((u: any) => {
            if (userType === 'internal') {
                return u.user_type === 'internal' || (!u.client_id && !u.provider_id);
            } else if (userType === 'client' && currentUserClientId) {
                return u.user_type === 'client' && u.client_id === currentUserClientId;
            } else {
                return u.user_type === userType;
            }
        });

        setUsers(filteredUsers);

        if (userType === 'internal') {
          try {
            const { data: eqData } = await supabase.from('system_logs')
              .select('details').eq('entity', 'EquipmentRegistry').eq('entity_id', 'master')
              .order('created_at', { ascending: false }).limit(1).maybeSingle();
            if (eqData?.details) {
              const parsed = JSON.parse(eqData.details);
              if (parsed?.equipments && Array.isArray(parsed.equipments)) {
                const map: {[userId: string]: { patrimony_id: string; type: string; brand: string; model: string }[]} = {};
                parsed.equipments.forEach((eq: any) => {
                  if (eq.assigned_to) {
                    if (!map[eq.assigned_to]) map[eq.assigned_to] = [];
                    map[eq.assigned_to].push({ patrimony_id: eq.patrimony_id, type: eq.type, brand: eq.brand, model: eq.model });
                  }
                });
                setEquipmentMap(map);
              }
            }
          } catch (eqErr) {
            console.error('Erro ao carregar equipamentos:', eqErr);
          }
        }

    } catch (e: any) {
        console.error("Erro ao buscar usuários:", e);
        setDbStatus('error');
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [userType]);

  const togglePassword = (id: string) => {
      setRevealedPasswords(prev => ({
          ...prev,
          [id]: !prev[id]
      }));
  };

  const handleToggleStatus = async (id: string, currentStatus: string, name: string) => {
      const newStatus = currentStatus === 'Ativo' ? 'Inativo' : 'Ativo';
      if (!confirm(`Deseja alterar o status de "${name}" para ${newStatus.toUpperCase()}?`)) return;

      setIsToggling(id);
      try {
          const { error } = await supabase.from('system_users').update({ status: newStatus }).eq('id', id);
          if (error) throw error;
          setUsers(prev => prev.map(u => u.id === id ? { ...u, status: newStatus } : u));
      } catch (e: any) {
          alert('Erro ao alterar status: ' + e.message);
      } finally {
          setIsToggling(null);
      }
  };

  const handleImpersonate = async (targetUser: any) => {
    if (!confirm(`MODO AUDITORIA:\n\nDeseja realizar login imediato como "${targetUser.name}"?\n\nIsso permitirá visualizar o sistema exatamente como ele vê.`)) return;
    
    try {
        // Formata os dados no padrão que o Login.tsx utiliza
        const profilePerms = targetUser.profiles?.permissions || [];
        const userPerms = targetUser.permissions || [];
        const combinedPermissions = [...new Set([...profilePerms, ...userPerms])];

        const impersonatedData = {
            id: targetUser.id, 
            name: targetUser.name,
            email: targetUser.email,
            role: targetUser.profiles?.name || 'Usuário',
            permissions: combinedPermissions,
            clientId: targetUser.client_id?.toString(),
            providerId: targetUser.provider_id?.toString(),
            force_password_change: targetUser.force_password_change
        };

        localStorage.setItem('authToken', `impersonation-token-${targetUser.id}-${Date.now()}`);
        localStorage.setItem('userData', JSON.stringify(impersonatedData));
        localStorage.setItem('app_version', APP_VERSION);
        
        showNotification('Acesso Trocado', `Você agora está logado como ${targetUser.name}`, 'success');
        
        // Refresh na página para carregar o novo contexto de App.tsx
        setTimeout(() => {
            window.location.href = '/';
        }, 800);

    } catch (e: any) {
        alert("Erro na troca de usuário: " + e.message);
    }
  };

  const handleDelete = async (id: string, name: string) => {
      if (!confirm(`TEM CERTEZA? \n\nO usuário "${name}" será INATIVADO.\nO acesso dele ao sistema será bloqueado mas o registro permanece no banco.`)) return;
      
      setIsDeleting(id);
      try {
          const { error } = await supabase.from('system_users').update({ status: 'Inativo' }).eq('id', id);
          if (error) throw error;
          alert('Usuário inativado com sucesso. O registro permanece no banco de dados.');
          setUsers(prev => prev.map(u => u.id === id ? { ...u, status: 'Inativo' } : u));
      } catch (error: any) {
          alert('Erro ao inativar: ' + error.message);
      } finally {
          setIsDeleting(null);
      }
  };

  const getColSpan = () => {
      let span = 5;
      if (userType === 'client' || userType === 'provider') span++;
      if (userType === 'internal') span++;
      if (isDirector) span++;
      return span;
  }

  const displayedUsers = (() => {
    let list = [...users];
    if (userType === 'internal') {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
    }
    if (searchTerm.trim() && userType === 'internal') {
      const term = searchTerm.toLowerCase();
      list = list.filter(u =>
        (u.name || '').toLowerCase().includes(term) ||
        (u.email || '').toLowerCase().includes(term) ||
        (u.profiles?.name || '').toLowerCase().includes(term) ||
        (equipmentMap[u.id] || []).some((eq: any) => eq.patrimony_id.toLowerCase().includes(term) || eq.brand.toLowerCase().includes(term) || eq.model.toLowerCase().includes(term))
      );
    }
    return list;
  })();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
            <span className="w-1.5 h-6 bg-red-700 rounded-full"></span>
            {getTitle()}
          </h2>
          <p className="text-sm text-gray-500 mt-1 ml-4.5">{getSubtitle()}</p>
          {dbStatus === 'ok' && (
              <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-green-700 bg-green-50 px-2 py-1 rounded w-fit border border-green-200 ml-4.5">
                  <Database size={12} /> Banco de dados sincronizado
              </div>
          )}
        </div>
        <div className="flex gap-2">
            <button onClick={fetchUsers} className="p-2.5 border rounded-lg hover:bg-gray-50 text-gray-500">
                <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
            </button>
            <button 
            onClick={onAddUser}
            className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm uppercase"
            >
            <Plus size={18} /> Novo Usuário
            </button>
        </div>
      </div>

      {userType === 'internal' && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <div className="relative max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-gray-400 focus:border-gray-400 transition-all"
              placeholder="Buscar por nome, email, perfil..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              data-testid="input-search-users"
            />
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Usuário</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Perfil / Cargo</th>
              {userType === 'client' && <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Cliente Vinculado</th>}
              {userType === 'provider' && <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Fornecedor Vinculado</th>}
              {userType === 'internal' && <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Patrimônio</th>}
              {isDirector && <th className="px-6 py-4 text-xs font-bold text-red-600 uppercase tracking-wider">Senha (Restrito)</th>}
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {isLoading ? (
                 <tr><td colSpan={getColSpan()} className="p-6 text-center text-gray-500">Carregando usuários...</td></tr>
            ) : displayedUsers.length === 0 ? (
                 <tr><td colSpan={getColSpan()} className="p-6 text-center text-gray-500">{searchTerm ? 'Nenhum resultado encontrado.' : 'Nenhum usuário encontrado nesta categoria.'}</td></tr>
            ) : (
                displayedUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold border border-gray-200 text-sm uppercase">
                            {user.name?.charAt(0)}
                        </div>
                        <div>
                            <div className="font-bold text-sm text-gray-900 uppercase">{user.name}</div>
                            <div className="text-xs text-gray-500">{user.email}</div>
                        </div>
                    </div>
                    </td>
                    <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-gray-700 font-medium">
                            <Shield size={14} className="text-blue-600" />
                            {user.profiles?.name || 'Sem Perfil'}
                        </div>
                    </td>
                    {userType === 'client' && (
                        <td className="px-6 py-4 text-sm font-bold text-gray-800 uppercase">
                            {user.clients?.name || '-'}
                        </td>
                    )}
                    {userType === 'provider' && (
                        <td className="px-6 py-4 text-sm font-bold text-gray-800 uppercase">
                            {user.providers?.name || '-'}
                        </td>
                    )}

                    {userType === 'internal' && (
                        <td className="px-6 py-4">
                          {equipmentMap[user.id]?.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {equipmentMap[user.id].map((eq, idx) => (
                                <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-bold text-slate-700" title={`${eq.brand} ${eq.model}`}>
                                  <Package size={9} className="text-slate-500" />
                                  {eq.patrimony_id}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                    )}
                    
                    {isDirector && (
                        <td className="px-6 py-4">
                            <div className="flex items-center gap-2 bg-red-50 px-2 py-1 rounded-md border border-red-100 w-fit">
                                <span className="font-mono text-sm text-red-800">
                                    {revealedPasswords[user.id] ? (user.password || 'Sem Senha') : '••••••••'}
                                </span>
                                <button onClick={() => togglePassword(user.id)} className="text-red-400 hover:text-red-700 transition-colors">
                                    {revealedPasswords[user.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                            </div>
                        </td>
                    )}

                    <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${user.status === 'Ativo' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                            {user.status}
                        </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                             {isAdmin && (
                                <>
                                    {/* BOTÃO DE IMPERSONAÇÃO (EXCLUSIVO DIRETORIA) */}
                                    {isDirector && (
                                        <button 
                                            onClick={() => handleImpersonate(user)}
                                            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                            title="Login Rápido como este Usuário"
                                        >
                                            <LogIn size={18} />
                                        </button>
                                    )}

                                    <button 
                                        onClick={() => handleToggleStatus(user.id, user.status, user.name)}
                                        className={`p-2 rounded-lg transition-all ${user.status === 'Ativo' ? 'text-gray-400 hover:text-red-600 hover:bg-red-50' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`}
                                        title={user.status === 'Ativo' ? 'Bloquear Usuário' : 'Ativar Usuário'}
                                        disabled={isToggling === user.id}
                                    >
                                        {isToggling === user.id ? <Loader2 size={18} className="animate-spin" /> : 
                                         user.status === 'Ativo' ? <Ban size={18} /> : <CheckCircle2 size={18} />
                                        }
                                    </button>
                                    <button 
                                        onClick={() => onEdit(user.id)}
                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                        title="Editar"
                                    >
                                        <Pencil size={18} />
                                    </button>
                                </>
                            )}
                            
                            {isDirector && (
                                <button 
                                    onClick={() => handleDelete(user.id, user.name)}
                                    disabled={isDeleting === user.id}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                    title="Excluir Definitivamente (Diretoria)"
                                >
                                    {isDeleting === user.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                                </button>
                            )}
                        </div>
                    </td>
                </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UserList;
