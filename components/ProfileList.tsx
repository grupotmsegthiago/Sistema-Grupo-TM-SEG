
import React, { useState, useEffect } from 'react';
import { Plus, Shield, Loader2, Pencil, Trash2, RefreshCw, Database, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../lib/RealtimeProvider';
import { AccessProfile } from '../types';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface Props {
  onAdd: () => void;
  onEdit: (id: string) => void;
}

const ProfileList: React.FC<Props> = ({ onAdd, onEdit }) => {
  const queryClientRQ = useQueryClient();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDirector, setIsDirector] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  useEffect(() => {
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

  const { data: profiles = [], isLoading, isError, refetch } = useQuery<AccessProfile[]>({
    queryKey: ['profiles'],
    queryFn: async () => {
        const { data, error } = await supabase.from('profiles').select('*').order('name');
        if (error) throw error;
        return data || [];
    },
  });

  const dbStatus = isError ? 'error' : (profiles.length >= 0 && !isLoading ? 'ok' : null);

  useRealtimeRefresh(['profiles', 'system_users'], () => { refetch(); });

  const load = () => { refetch(); };

  const handleDelete = async (id: string, name: string) => {
      // Proteção contra exclusão de perfis base
      if (['Diretoria', 'Administrador', 'Operador'].includes(name)) {
          alert('Este é um perfil nativo do sistema e não pode ser excluído.');
          return;
      }

      setIsDeleting(id);
      try {
          // 1. Verificar usuários vinculados
          const { count, error: countError } = await supabase
              .from('system_users')
              .select('*', { count: 'exact', head: true })
              .eq('profile_id', id);

          if (countError) throw countError;
      
          // Se existirem usuários vinculados, pedir confirmação para desvincular
          if (count && count > 0) {
              const confirmForce = window.confirm(
                  `ATENÇÃO: Existem ${count} usuários vinculados ao perfil "${name}".\n\n` +
                  `Deseja DESVINCULAR esses usuários e EXCLUIR o perfil?\n` +
                  `(Os usuários ficarão "Sem Perfil" e perderão acesso até serem reconfigurados)`
              );

              if (!confirmForce) {
                  setIsDeleting(null);
                  return;
              }
              
              // 2. Desvincular usuários (Set profile_id = NULL)
              const { error: unlinkError } = await supabase
                .from('system_users')
                .update({ profile_id: null })
                .eq('profile_id', id);
                
              if (unlinkError) throw new Error('Falha ao desvincular usuários: ' + unlinkError.message);
          } else {
              // Exclusão normal
              if (!window.confirm(`Tem certeza que deseja excluir o perfil "${name}"?`)) {
                  setIsDeleting(null);
                  return;
              }
          }

          // 3. Excluir o perfil (USANDO SELECT PARA CONFIRMAR)
          const { data, error: deleteError } = await supabase.from('profiles').delete().eq('id', id).select();
          
          if (deleteError) throw deleteError;

          if (!data || data.length === 0) {
              throw new Error("Erro de permissão: O banco de dados recusou a exclusão.");
          }
          
          const userData = JSON.parse(localStorage.getItem('userData') || '{}');
          await supabase.from('system_logs').insert([{
              action_type: 'DELETE',
              entity: 'Profile',
              entity_id: String(id),
              user_id: userData.id || null,
              user_name: userData.name || 'Sistema',
              details: `Registro excluído: ${name}`,
              created_at: new Date().toISOString()
          }]);

          alert('Perfil excluído com sucesso.');
          queryClientRQ.invalidateQueries({ queryKey: ['profiles'] });

      } catch (e: any) {
          console.error(e);
          alert('Erro ao excluir: ' + e.message);
      } finally { 
          setIsDeleting(null); 
      }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
            <span className="w-1.5 h-6 bg-red-700 rounded-full"></span>
            Perfis de Acesso
          </h2>
          {dbStatus === 'ok' && (
              <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-green-700 bg-green-50 px-2 py-1 rounded w-fit border border-green-200">
                  <Database size={12} /> Teste do banco de dados ok
              </div>
          )}
          {dbStatus === 'error' && (
              <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-red-700 bg-red-50 px-2 py-1 rounded w-fit border border-red-200">
                  <AlertTriangle size={12} /> Erro de Conexão com o Banco
                  <button onClick={load} className="underline ml-2 hover:text-red-900">Tentar Novamente</button>
              </div>
          )}
        </div>
        <div className="flex gap-2">
            <button onClick={load} className="p-2.5 border rounded-lg hover:bg-gray-50 text-gray-500">
                <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
            </button>
            <button onClick={onAdd} className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm uppercase">
            <Plus size={18} /> Novo Perfil
            </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="pl-10 px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Nome do Perfil</th>
              <th className="pl-10 px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Descrição</th>
              <th className="pl-10 px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {isLoading ? (
                <tr><td colSpan={3} className="p-4 text-center">Carregando...</td></tr>
            ) : profiles.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                <td className="pl-10 px-6 py-4">
                   <div className="flex items-center gap-3">
                      <div className="p-2 bg-gray-100 text-gray-600 rounded-lg">
                        <Shield size={16} />
                      </div>
                      <div className="font-bold text-sm text-gray-900 uppercase">{item.name}</div>
                   </div>
                </td>
                <td className="pl-10 px-6 py-4 text-sm text-gray-600">{item.description}</td>
                <td className="pl-10 px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                        {isAdmin && (
                            <button 
                                onClick={() => onEdit(item.id)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                title="Editar Perfil"
                            >
                                <Pencil size={18} />
                            </button>
                        )}
                        {isDirector && (
                            <button 
                              onClick={() => handleDelete(item.id, item.name)}
                              disabled={isDeleting === item.id}
                              className="p-2 text-red-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all"
                              title="Excluir Perfil"
                            >
                                {isDeleting === item.id ? <Loader2 size={18} className="animate-spin"/> : <Trash2 size={18} />}
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

export default ProfileList;
