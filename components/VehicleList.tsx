import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { VehicleStatus, Vehicle } from '../types';
import { Plus, Search, Filter, ShieldCheck, Wrench, Ban, RefreshCw, Trash2, Loader2, Database, AlertTriangle, Radio, Pencil } from 'lucide-react';

interface VehicleListProps {
  onAddVehicle: () => void;
  onEdit: (id: string) => void;
}

const VehicleList: React.FC<VehicleListProps> = ({ onAddVehicle, onEdit }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
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
    fetchVehicles();
  }, []);

  const fetchVehicles = async () => {
      setIsLoading(true);
      setDbStatus(null);
      try {
          const { data, error } = await supabase.from('vehicles').select('*').order('created_at', { ascending: false });
          if(error) throw error;
          
          setDbStatus('ok');
          if(data) setVehicles(data as any);
      } catch(e) { 
          console.error(e);
          setDbStatus('error');
      }
      finally { setIsLoading(false); }
  };

  const handleDelete = async (id: string, plate: string) => {
    if (!confirm(`TEM CERTEZA? Inativar a viatura placa ${plate}?\n\nO registro será mantido no banco de dados mas ficará com status INATIVO.`)) return;
    setIsDeleting(id);
    try {
        const { error } = await supabase.from('vehicles').update({ status: 'Inativo' }).eq('id', id);
        
        if (error) throw error;

        await fetchVehicles();
        alert('Viatura inativada com sucesso. O registro permanece no banco de dados.');
    } catch (e: any) { 
        console.error(e);
        alert('Erro ao inativar: ' + (e.message || "Erro desconhecido"));
    } finally { setIsDeleting(null); }
  };

  const getStatusBadge = (status: VehicleStatus) => {
    switch (status) {
      // Fix: Corrected enum member to 'Ativo'
      case VehicleStatus.Ativo:
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200"><ShieldCheck size={12} /> Ativo</span>;
      // Fix: Corrected enum member to 'Manutenção'
      case VehicleStatus.Manutenção:
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200"><Wrench size={12} /> Manutenção</span>;
      // Fix: Corrected enum member to 'Inativo'
      case VehicleStatus.Inativo:
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-50 text-gray-600 border border-gray-200"><Ban size={12} /> Inativo</span>;
      default: return <span className="text-xs">{status}</span>;
    }
  };

  const filteredVehicles = vehicles.filter(v => 
    (v.plate || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (v.model || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
            <span className="w-1.5 h-6 bg-red-700 rounded-full"></span>
            Frota de Viaturas
          </h2>
          {dbStatus === 'ok' && (
              <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-green-700 bg-green-50 px-2 py-1 rounded w-fit border border-green-200">
                  <Database size={12} /> Teste do banco de dados ok
              </div>
          )}
          {dbStatus === 'error' && (
              <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-red-700 bg-red-50 px-2 py-1 rounded w-fit border border-red-200">
                  <AlertTriangle size={12} /> Erro de Conexão com o Banco
                  <button onClick={fetchVehicles} className="underline ml-2 hover:text-red-900">Tentar Novamente</button>
              </div>
          )}
        </div>
        <div className="flex gap-2">
            <button onClick={fetchVehicles} className="p-2.5 border rounded-lg hover:bg-gray-50 text-gray-500">
                <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
            </button>
            <button 
            onClick={onAddVehicle}
            className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
            <Plus size={18} /> Cadastrar Viatura
            </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <input 
              type="text" 
              placeholder="Buscar por placa ou modelo..." 
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
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Viatura / Modelo</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Placa</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Fornecedor</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Rastreador</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {isLoading ? (<tr><td colSpan={6} className="p-6 text-center text-gray-500">Carregando...</td></tr>) : 
             filteredVehicles.length === 0 ? (<tr><td colSpan={6} className="p-6 text-center text-gray-500">Nenhuma viatura cadastrada.</td></tr>) :
            filteredVehicles.map((vehicle) => (
              <tr key={vehicle.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="font-bold text-sm text-gray-900">{vehicle.model}</span>
                    <span className="text-xs text-gray-500 font-medium">Ano: {vehicle.year}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="font-mono bg-gray-100 px-2 py-1 rounded text-gray-800 text-sm font-bold inline-block border border-gray-200">
                    {vehicle.plate}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm font-medium text-gray-700">
                  {vehicle.provider}
                </td>
                <td className="px-6 py-4">
                    {vehicle.tracker_type ? (
                        <div className="flex flex-col">
                            <span className="text-xs font-bold text-gray-800 flex items-center gap-1">
                                <Radio size={12} className="text-blue-500"/> {vehicle.tracker_type}
                            </span>
                            <span className="text-[10px] text-gray-500 font-mono">ID: {vehicle.tracker_id}</span>
                        </div>
                    ) : (
                        <span className="text-xs text-red-400 italic font-bold">Pendente</span>
                    )}
                </td>
                <td className="px-6 py-4">
                  {getStatusBadge(vehicle.status)}
                </td>
                <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                        <button 
                            onClick={() => onEdit(vehicle.id)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="Editar Viatura"
                        >
                            <Pencil size={18} />
                        </button>
                        {isDirector && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleDelete(vehicle.id, vehicle.plate); }}
                              disabled={isDeleting === vehicle.id}
                              className="p-2 text-red-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all"
                              title="Excluir Viatura"
                            >
                                {isDeleting === vehicle.id ? <Loader2 size={18} className="animate-spin"/> : <Trash2 size={18} />}
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

export default VehicleList;