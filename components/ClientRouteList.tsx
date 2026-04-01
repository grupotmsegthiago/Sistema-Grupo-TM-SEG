import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Search, MapPin, Navigation, Trash2, Loader2, RefreshCw, DollarSign, Database, AlertTriangle, Pencil, Lock, Calculator, Wand2, CheckSquare, Square, X, Edit2, Save, ArrowRight, Eraser, Globe } from 'lucide-react';
import { ClientPriceTable } from '../types';
import { identifyRegionFromText } from '../lib/financialUtils';

interface Props {
  onAdd: () => void;
  onEdit: (id: string) => void;
  clientName?: string; // Filtro opcional
  embedded?: boolean; // Modo Embarcado
}

// Normalização para comparação
const normalizeStr = (str: string) => {
    if (!str) return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/\s+/g, ' ');
};

const ClientRouteList: React.FC<Props> = ({ onAdd, onEdit, clientName, embedded = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [routes, setRoutes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDirector, setIsDirector] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCommercial, setIsCommercial] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<'ok' | 'error' | null>(null);
  const [clientMap, setClientMap] = useState<Record<string, string>>({});
  const [lockedClientName, setLockedClientName] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true); 
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [normProgress, setNormProgress] = useState(0);
  const [updateProgress, setUpdateProgress] = useState('');
  const [isCleaning, setIsCleaning] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkValues, setBulkValues] = useState({ distance: '', toll_cost: '' });
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const checkAuthAndLock = async () => {
        const storedUser = localStorage.getItem('userData');
        if (storedUser) {
            try {
                const user = JSON.parse(storedUser);
                setCurrentUser(user);
                if (user.role === 'Diretoria' || user.permissions?.includes('*')) {
                    setIsDirector(true);
                }
                if (['Administrador', 'Diretoria'].includes(user.role) || user.permissions?.includes('*')) {
                    setIsAdmin(true);
                }
                if (user.role?.toLowerCase() === 'comercial') {
                    setIsCommercial(true);
                }
                if (user.clientId) {
                     const { data } = await supabase.from('clients').select('name').eq('id', user.clientId).single();
                     if (data) setLockedClientName(data.name);
                }
            } catch (e) { console.error(e); }
        }
        setIsInitializing(false);
    };
    checkAuthAndLock();
  }, []);

  useEffect(() => {
    if (!isInitializing) {
        fetchRoutes();
    }
  }, [clientName, lockedClientName, isInitializing, isCommercial]); 

  const fetchRoutes = async () => {
    const user = currentUser || JSON.parse(localStorage.getItem('userData') || '{}');
    if (user.clientId && !lockedClientName) return;

    setIsLoading(true);
    setDbStatus(null);
    setSelectedIds([]); 
    try {
        let routeQuery = supabase
            .from('client_routes')
            .select(`
                *,
                clients!inner(id, name, trading_name, created_by)
            `)
            .order('created_at', { ascending: false });
        
        if (lockedClientName) {
            routeQuery = routeQuery.eq('client', lockedClientName);
        } else if (clientName) {
            routeQuery = routeQuery.eq('client', clientName);
        } else if (isCommercial) {
            const allowedIds = user?.permissions?.filter((p: string) => p.startsWith('client_view:')).map((p: string) => p.split(':')[1]) || [];
            if (allowedIds.length > 0) {
                routeQuery = routeQuery.or(`clients.created_by.eq."${user?.name}",clients.id.in.(${allowedIds.join(',')})`);
            } else {
                routeQuery = routeQuery.eq('clients.created_by', user?.name);
            }
        }

        const [routesRes, clientsRes] = await Promise.all([
            routeQuery,
            supabase.from('clients').select('name, trading_name')
        ]);

        if (routesRes.error) throw routesRes.error;
        const map: Record<string, string> = {};
        if (clientsRes.data) {
            clientsRes.data.forEach((c: any) => { map[c.name] = c.trading_name || c.name; });
        }
        setClientMap(map);
        setDbStatus('ok');
        if(routesRes.data) setRoutes(routesRes.data);
    } catch (e) { 
        console.error(e);
        setDbStatus('error');
    } finally { setIsLoading(false); }
  };

  const handleAutoRegionalizeNames = async () => {
      const itemsToFix = filtered;
      if (itemsToFix.length === 0) return;

      const msg = `Deseja organizar as ${itemsToFix.length} rotas filtradas incluindo prefixos de região (SUDESTE, NORDESTE, etc)? \n\nIsso ajudará a organizar os nomes para a LUFT e outros clientes.`;
      if (!confirm(msg)) return;

      setIsNormalizing(true);
      setNormProgress(0);
      let updatedCount = 0;

      try {
          for (let i = 0; i < itemsToFix.length; i++) {
              const route = itemsToFix[i];
              setNormProgress(Math.round(((i + 1) / itemsToFix.length) * 100));
              
              // Tenta identificar por nome, se falhar, tenta por origem
              let region = identifyRegionFromText(route.name);
              if (!region) region = identifyRegionFromText(route.origin);
              
              if (region) {
                  const newName = `${region} - ${route.name}`.toUpperCase();
                  const { error } = await supabase
                      .from('client_routes')
                      .update({ name: newName })
                      .eq('id', route.id);
                  
                  if (!error) updatedCount++;
              }
              await new Promise(r => setTimeout(r, 50));
          }
          
          alert(`${updatedCount} rotas foram atualizadas com identificadores regionais!`);
          fetchRoutes();
      } catch (e) {
          console.error(e);
      } finally {
          setIsNormalizing(false);
          setNormProgress(0);
      }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`TEM CERTEZA? Excluir a rota "${name}"?`)) return;
    setIsDeleting(id);
    try {
        const { data, error } = await supabase.from('client_routes').delete().eq('id', id).select();
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("Erro de permissão.");
        fetchRoutes();
    } catch (e: any) { alert(e.message); }
    finally { setIsDeleting(null); }
  };

  const filtered = routes.filter(r => {
    const clientDisplay = clientMap[r.client] || r.client;
    const searchLower = searchTerm.toLowerCase();
    return (clientDisplay?.toLowerCase() || '').includes(searchLower) ||
           (r.name?.toLowerCase() || '').includes(searchLower) ||
           (r.origin?.toLowerCase() || '').includes(searchLower) ||
           (r.destination?.toLowerCase() || '').includes(searchLower);
  });

  const handleSelectAll = () => {
      if (selectedIds.length === filtered.length && filtered.length > 0) setSelectedIds([]);
      else setSelectedIds(filtered.map(r => r.id.toString()));
  };

  const handleSelectRow = (id: string) => {
      setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleCleanupDuplicates = async () => {
      if (!confirm("Limpar duplicatas?")) return;
      setIsCleaning(true);
      try {
          const sortedRoutes = [...routes].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          const latestRouteMap = new Map<string, string>();
          const idsToDelete: string[] = [];
          sortedRoutes.forEach(r => {
              const key = `${normalizeStr(r.client)}|${normalizeStr(r.origin)}|${normalizeStr(r.destination)}`;
              if (latestRouteMap.has(key)) idsToDelete.push(r.id);
              else latestRouteMap.set(key, r.id);
          });
          if (idsToDelete.length === 0) { alert("Nenhuma duplicata."); return; }
          const { error } = await supabase.from('client_routes').delete().in('id', idsToDelete);
          if (error) throw error;
          alert(`Removidas ${idsToDelete.length} duplicatas.`);
          fetchRoutes();
      } catch (err: any) { alert(err.message); } finally { setIsCleaning(false); }
  };

  const handleBulkPriceUpdate = async () => {
      if (!confirm("Recalcular preços via IA?")) return;
      setIsBulkUpdating(true);
      try {
          const { data: allPriceTables } = await supabase.from('client_price_tables').select('*');
          if (!allPriceTables) return;
          for (let i = 0; i < routes.length; i++) {
              const route = routes[i];
              setUpdateProgress(`Processando ${i + 1}/${routes.length}...`);
              const clientTables = (allPriceTables as ClientPriceTable[]).filter(t => t.client === route.client);
              if (clientTables.length === 0) continue;
              const rawDist = parseFloat(route.distance);
              const bestMatch = clientTables.sort((a, b) => a.franchise_km - b.franchise_km).find(t => t.franchise_km >= rawDist) || clientTables[clientTables.length-1];
              if (bestMatch) {
                  const { error } = await supabase.from('client_routes').update({ toll_cost: bestMatch.activation_fee }).eq('id', route.id);
                  if (error) console.error('Erro ao atualizar rota:', route.id, error);
              }
          }
          fetchRoutes();
      } catch (error: any) { alert(error.message); } finally { setIsBulkUpdating(false); setUpdateProgress(''); }
  };

  const handleBulkEditSubmit = async () => {
      if (selectedIds.length === 0) return;
      const updates: any = {};
      if (bulkValues.distance !== '') updates.distance = bulkValues.distance;
      if (bulkValues.toll_cost !== '') updates.toll_cost = parseFloat(bulkValues.toll_cost);
      setIsBulkDeleting(true);
      try {
          const { error } = await supabase.from('client_routes').update(updates).in('id', selectedIds);
          if (error) throw error;
          setIsBulkEditModalOpen(false);
          fetchRoutes();
      } catch (e: any) { alert(e.message); } finally { setIsBulkDeleting(false); }
  };

  return (
    <div className={`space-y-6 animate-fade-in ${embedded ? 'pb-0' : 'pb-20'} relative`}>
      {isBulkEditModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-200">
                  <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                      <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Edit2 size={20} className="text-blue-600"/> Edição em Massa</h3>
                      <button onClick={() => setIsBulkEditModalOpen(false)}><X size={20}/></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div><label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Distância (KM)</label><input type="text" className="w-full p-2 border rounded" placeholder="Manter atual" value={bulkValues.distance} onChange={e => setBulkValues({...bulkValues, distance: e.target.value})} /></div>
                      {isAdmin && (<div><label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Valor / Preço (R$)</label><input type="number" step="0.01" className="w-full p-2 border rounded" placeholder="Manter atual" value={bulkValues.toll_cost} onChange={e => setBulkValues({...bulkValues, toll_cost: e.target.value})} /></div>)}
                  </div>
                  <div className="p-5 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 rounded-b-xl">
                      <button onClick={() => setIsBulkEditModalOpen(false)} className="px-4 py-2 border rounded text-sm font-bold">Cancelar</button>
                      <button onClick={handleBulkEditSubmit} className="px-6 py-2 bg-blue-600 text-white rounded text-sm font-bold">Aplicar</button>
                  </div>
              </div>
          </div>
      )}
      {!embedded && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
            <div><h2 className="text-xl font-bold text-gray-900 flex items-center gap-3"><span className="w-1.5 h-6 bg-red-700 rounded-full"></span>Rotas Cadastradas</h2></div>
            <div className="flex gap-2 items-center">
                {(isDirector || isAdmin) && !lockedClientName && (
                    <>
                        <button onClick={handleAutoRegionalizeNames} disabled={isNormalizing || filtered.length === 0} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm uppercase transition-all ${isNormalizing ? 'bg-indigo-600 text-white animate-pulse' : 'bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50'}`}>
                            {isNormalizing ? <><Loader2 size={18} className="animate-spin" /> {normProgress}%</> : <><Globe size={18} /> Regionalizar Nomes</>}
                        </button>
                        <button onClick={handleCleanupDuplicates} disabled={isCleaning} className="flex items-center gap-2 bg-white text-red-600 border border-red-200 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors hover:bg-red-50"><Eraser size={18} /> Limpar Duplicatas</button>
                        <button onClick={handleBulkPriceUpdate} disabled={isBulkUpdating} className="flex items-center gap-2 bg-indigo-50 text-indigo-700 border border-indigo-200 px-4 py-2.5 rounded-lg text-sm font-bold"><Wand2 size={18} /> {isBulkUpdating ? updateProgress : 'Atualizar Preços (IA)'}</button>
                    </>
                )}
                <button onClick={fetchRoutes} className="p-2.5 border rounded-lg hover:bg-gray-50 text-gray-500"><RefreshCw size={18} className={isLoading ? "animate-spin" : ""} /></button>
                <button onClick={onAdd} className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm uppercase"><Plus size={18} /> Nova Rota</button>
            </div>
          </div>
      )}
      <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${embedded ? 'border-t' : ''}`}>
        <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
           <div className="relative max-w-md w-full">
            <input type="text" placeholder="Buscar rota, origem ou destino..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            <Search size={18} className="absolute left-3.5 top-3 text-gray-400" />
          </div>
          {selectedIds.length > 0 && (<div className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200">{selectedIds.length} selecionados</div>)}
        </div>
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="pl-6 py-4 w-10"><button onClick={handleSelectAll} className="flex items-center text-gray-400">{selectedIds.length > 0 && selectedIds.length === filtered.length ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} />}</button></th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Nome da Rota / Cliente</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Distância / Valor</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {isLoading ? (<tr><td colSpan={4} className="text-center p-4">Carregando...</td></tr>) : 
                 filtered.length === 0 ? (<tr><td colSpan={4} className="text-center p-4 text-gray-500">Nenhuma rota encontrada na sua carteira.</td></tr>) :
                 filtered.map((item) => {
                    const isSelected = selectedIds.includes(item.id.toString());
                    return (
                        <tr key={item.id} className={`transition-colors ${isSelected ? 'bg-blue-50/50' : 'hover:bg-gray-50'}`}>
                          <td className="pl-6 py-4"><button onClick={() => handleSelectRow(item.id.toString())}>{isSelected ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} />}</button></td>
                          <td className="px-6 py-4">
                             <div className="flex flex-col">
                                <span className="font-bold text-sm text-gray-900 uppercase">({clientMap[item.client] || item.client}) / {item.name}</span>
                                <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5"><MapPin size={10} className="text-blue-500 shrink-0"/> <span className="truncate max-w-[200px]">{item.origin}</span><ArrowRight size={10} className="shrink-0 text-gray-400" /><MapPin size={10} className="text-red-500 shrink-0"/><span className="truncate max-w-[200px]">{item.destination}</span></div>
                             </div>
                          </td>
                          <td className="px-6 py-4">
                             <div className="flex flex-col gap-1 text-xs font-bold text-gray-700">
                                <div className="flex items-center gap-1.5"><Navigation size={12} className="text-gray-400"/> {item.distance} KM</div>
                                <div className="flex items-center gap-1.5"><DollarSign size={12} className="text-green-600"/> {(isAdmin || lockedClientName || isCommercial) ? <span>R$ {item.toll_cost?.toFixed(2) || '0.00'}</span> : <span className="flex items-center gap-1 text-gray-400 font-normal"><Lock size={10} /> Restrito</span>}</div>
                             </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                               <button onClick={() => onEdit(item.id)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><Pencil size={18} /></button>
                               {(isDirector || lockedClientName || isCommercial) && (<button onClick={() => handleDelete(item.id, item.name)} disabled={isDeleting === item.id} className="p-2 text-red-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all">{isDeleting === item.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}</button>)}
                            </div>
                          </td>
                        </tr>
                    );
                 })}
              </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};

export default ClientRouteList;