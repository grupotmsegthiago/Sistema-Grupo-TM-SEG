
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../lib/RealtimeProvider';
import { Plus, Search, MoreVertical, Truck, Ban, CheckCircle2, Trash2, Loader2, RefreshCw, Database, AlertTriangle, Pencil, Check } from 'lucide-react';

interface Props {
  onAddVehicle: () => void;
  onEdit: (id: string) => void;
  onSelect?: (vehicle: any) => void; // Nova prop para seleção
  clientId?: number; // Filtro Opcional
  embedded?: boolean; // Modo Embarcado (Sem cabeçalho grande)
}

const ClientVehicleList: React.FC<Props> = ({ onAddVehicle, onEdit, onSelect, clientId, embedded = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDirector, setIsDirector] = useState(false);
  const [isCommercial, setIsCommercial] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<'ok' | 'error' | null>(null);
  const [lockedClientId, setLockedClientId] = useState<number | null>(null);
  const [isInitializing, setIsInitializing] = useState(true); 
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    // Verificar permissão
    const storedUser = localStorage.getItem('userData');
    if (storedUser) {
        const user = JSON.parse(storedUser);
        setCurrentUser(user);
        if (user.role === 'Diretoria' || user.permissions?.includes('*')) {
            setIsDirector(true);
        }
        if (user.role?.toLowerCase() === 'comercial') {
            setIsCommercial(true);
        }
        // Force lock if user is client
        if (user.clientId) {
            setLockedClientId(parseInt(user.clientId));
        }
    }
    setIsInitializing(false);
  }, []);

  useEffect(() => {
      if (!isInitializing) {
          fetchVehicles();
      }
  }, [clientId, lockedClientId, isInitializing, isCommercial]);

  useRealtimeRefresh('client_vehicles', () => { if (!isInitializing) fetchVehicles(); });

  const fetchVehicles = async () => {
    const user = currentUser || JSON.parse(localStorage.getItem('userData') || '{}');
    if (user.clientId && !lockedClientId) return;

    setIsLoading(true);
    setDbStatus(null);
    try {
      let query = supabase
        .from('client_vehicles')
        .select(`
            *,
            clients!inner(id, name, trading_name, created_by)
        `)
        .order('created_at', { ascending: false });
      
      // FILTRO DE SEGURANÇA E COMERCIAL
      if (lockedClientId) {
          query = query.eq('client_id', lockedClientId);
      } else if (clientId) {
          query = query.eq('client_id', clientId);
      } else if (isCommercial) {
          const allowedIds = user?.permissions?.filter((p: string) => p.startsWith('client_view:')).map((p: string) => p.split(':')[1]) || [];
          if (allowedIds.length > 0) {
              // Filtra veículos de clientes que o comercial cadastrou OU foi vinculado
              query = query.or(`clients.created_by.eq."${user?.name}",client_id.in.(${allowedIds.join(',')})`);
          } else {
              query = query.eq('clients.created_by', user?.name);
          }
      }

      const { data, error } = await query;
      
      if (error) throw error;
      setDbStatus('ok');
      if (data) setVehicles(data);
    } catch (e) {
      console.error(e);
      setDbStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string, plate: string) => {
    if (!confirm(`TEM CERTEZA? Inativar o veículo placa ${plate}?\n\nO registro será mantido no banco de dados mas ficará com status INATIVO.`)) return;
    setIsDeleting(id);
    try {
        const { error } = await supabase.from('client_vehicles').update({ status: 'Inativo' }).eq('id', id);
        if (error) throw error;
        fetchVehicles();
        alert('Veículo inativado com sucesso.');
    } catch (e: any) { alert(e.message); }
    finally { setIsDeleting(null); }
  };

  const filteredVehicles = vehicles.filter(v => 
    (v.plate?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (v.model?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (v.clients?.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (v.clients?.trading_name?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  return (
    <div className={`space-y-6 animate-fade-in ${embedded ? 'pb-0' : ''}`}>
      
      {!embedded && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                <span className="w-1.5 h-6 bg-red-700 rounded-full"></span>
                Veículos de Carga {lockedClientId ? '(Meus Veículos)' : '(Clientes)'}
              </h2>
              {dbStatus === 'ok' && (
                  <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-green-700 bg-green-50 px-2 py-1 rounded w-fit border border-green-200">
                      <Database size={12} /> Sincronizado
                  </div>
              )}
            </div>
            <div className="flex gap-2">
                <button onClick={fetchVehicles} className="p-2.5 border rounded-lg hover:bg-gray-50 text-gray-500">
                    <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
                </button>
                <button 
                  onClick={onAddVehicle}
                  className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm uppercase"
                >
                  <Plus size={18} /> Novo Veículo
                </button>
            </div>
          </div>
      )}

      {embedded && (
          <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-700 flex items-center gap-2 text-sm uppercase">
                  <Truck size={16} /> Veículos Cadastrados ({filteredVehicles.length})
              </h3>
              <button 
                  onClick={onAddVehicle}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors shadow-sm uppercase"
              >
                  <Plus size={14} /> Adicionar Veículo
              </button>
          </div>
      )}

      <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${embedded ? 'border-t' : ''}`}>
        <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <input 
              type="text" 
              placeholder="Buscar por placa, modelo..." 
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search size={18} className="absolute left-3.5 top-3 text-gray-400" />
          </div>
        </div>

        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Veículo / Modelo</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Placa</th>
                  {(!embedded && !lockedClientId) && <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Cliente Proprietário</th>}
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Cor</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {isLoading ? (
                    <tr><td colSpan={6} className="p-6 text-center text-gray-500">Carregando veículos...</td></tr>
                ) : filteredVehicles.length === 0 ? (
                    <tr><td colSpan={6} className="p-6 text-center text-gray-500">Nenhum veículo encontrado na sua carteira.</td></tr>
                ) : (
                    filteredVehicles.map((vehicle) => (
                    <tr key={vehicle.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                        <div className="flex flex-col">
                            <span className="font-bold text-sm text-gray-900 uppercase">{vehicle.model}</span>
                            <span className="text-xs text-gray-500 font-medium">{vehicle.brand} - {vehicle.year}</span>
                        </div>
                        </td>
                        <td className="px-6 py-4">
                        <div className="font-mono bg-gray-100 px-2 py-1 rounded text-gray-800 text-sm font-bold inline-block border border-gray-200">
                            {vehicle.plate}
                        </div>
                        </td>
                        {(!embedded && !lockedClientId) && (
                            <td className="px-6 py-4 text-sm font-bold text-red-900 uppercase">
                            {vehicle.clients?.trading_name || vehicle.clients?.name || 'Não vinculado'}
                            </td>
                        )}
                        <td className="px-6 py-4 text-sm text-gray-600 uppercase">
                        {vehicle.color}
                        </td>
                        <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                                {onSelect && (
                                    <button 
                                        onClick={() => onSelect(vehicle)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-[10px] font-black rounded-lg hover:bg-green-700 transition-all uppercase shadow-md active:scale-95"
                                    >
                                        <Check size={14} /> Selecionar
                                    </button>
                                )}
                                <button
                                    onClick={() => onEdit(vehicle.id)}
                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                    title="Editar Veículo"
                                >
                                    <Pencil size={18} />
                                </button>
                                {(isDirector || lockedClientId || isCommercial) && (
                                    <button 
                                    onClick={() => handleDelete(vehicle.id, vehicle.plate)}
                                    disabled={isDeleting === vehicle.id}
                                    className="p-2 text-red-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all"
                                    title="Excluir Veículo"
                                    >
                                        {isDeleting === vehicle.id ? <Loader2 size={18} className="animate-spin"/> : <Trash2 size={18} />}
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
    </div>
  );
};

export default ClientVehicleList;
