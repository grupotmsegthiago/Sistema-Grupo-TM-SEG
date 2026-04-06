
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { logAction } from '../lib/logger';
import { ClientPriceTable } from '../types';
import { Plus, Search, DollarSign, Clock, Gauge, Shield, RefreshCw, Pencil, Trash2, Loader2, Database, AlertTriangle, FileSpreadsheet, CheckSquare, Square, X, Save, Edit2, Lock, Zap, Percent, TrendingUp, Wand2 } from 'lucide-react';
import ImportClientPriceModal from './ImportClientPriceModal';
import { useNotification } from '../lib/NotificationContext';
import { identifyRegionFromText } from '../lib/financialUtils';

interface Props {
  onAdd: () => void;
  onEdit: (id: string) => void;
}

const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'R$ 0,00';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const ClientPriceList: React.FC<Props> = ({ onAdd, onEdit }) => {
  const { showNotification } = useNotification();
  const [searchTerm, setSearchTerm] = useState('');
  const [tables, setTables] = useState<ClientPriceTable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDirector, setIsDirector] = useState(false);
  const [canViewValues, setCanViewValues] = useState(false);
  
  // Reajuste de Tabela
  const [adjustmentPercent, setAdjustmentPercent] = useState('');
  const [isAdjusting, setIsAdjusting] = useState(false);

  // Normalização
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [normProgress, setNormProgress] = useState(0);

  // States para ações
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [dbStatus, setDbStatus] = useState<'ok' | 'error' | null>(null);
  
  // Modais
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);

  // Seleção Múltipla
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [clientMap, setClientMap] = useState<Record<string, string>>({});

  const [bulkValues, setBulkValues] = useState({
      activation_fee: '',
      franchise_hours: '',
      franchise_km: '',
      price_per_extra_km: '',
      price_per_extra_hour: ''
  });

  useEffect(() => {
    const storedUser = localStorage.getItem('userData');
    if (storedUser) {
        try {
            const user = JSON.parse(storedUser);
            const role = (user.role || '').toLowerCase();
            const nameUpper = user.name ? user.name.toUpperCase() : '';

            if (role === 'diretoria' || user.permissions?.includes('*')) setIsDirector(true);
            
            // Permissão de Visualização de Valores: Diretoria, Adm, Permissão Total ou Usuários Específicos
            if (['diretoria', 'administrador'].includes(role) || 
                user.permissions?.includes('*') ||
                ['MICKAEL', 'BARBARA', 'MICHELLE'].some(n => nameUpper.includes(n))
            ) {
                setCanViewValues(true);
            }
        } catch (e) { console.error(e); }
    }
    fetchTables();
  }, []);

  const fetchTables = async () => {
    setIsLoading(true);
    setDbStatus(null);
    setSelectedIds([]); 
    try {
        const [tablesRes, clientsRes] = await Promise.all([
            supabase.from('client_price_tables').select('*').order('client'),
            supabase.from('clients').select('name, trading_name')
        ]);
        if (tablesRes.error) throw tablesRes.error;
        const map: Record<string, string> = {};
        if (clientsRes.data) clientsRes.data.forEach((c: any) => { map[c.name] = c.trading_name || c.name; });
        setClientMap(map);
        setDbStatus('ok');
        if (tablesRes.data) setTables(tablesRes.data as any);
    } catch(e) { 
        console.error(e);
        setDbStatus('error');
    } finally { setIsLoading(false) }
  };

  const filtered = useMemo(() => {
    return tables.filter(p => {
        const clientDisplay = clientMap[p.client] || p.client;
        const searchLower = searchTerm.toLowerCase();
        return (clientDisplay?.toLowerCase() || '').includes(searchLower) ||
               (p.operation_type || '').toLowerCase().includes(searchLower);
    });
  }, [tables, searchTerm, clientMap]);

  // LÓGICA DE NORMALIZAÇÃO AGRESSIVA DE REGIÕES
  const handleAutoRegionalizeAll = async () => {
      const itemsToFix = filtered;
      if (itemsToFix.length === 0) return;

      const msg = `O sistema analisará as ${itemsToFix.length} tabelas exibidas e injetará o prefixo de região (SUDESTE, SUL, etc) baseado no nome das cidades. Tabelas já ajustadas serão ignoradas. Deseja iniciar o processo em lote?`;
      if (!confirm(msg)) return;

      setIsNormalizing(true);
      setNormProgress(0);
      let updatedCount = 0;
      let totalToProcess = itemsToFix.length;

      try {
          for (let i = 0; i < itemsToFix.length; i++) {
              const table = itemsToFix[i];
              setNormProgress(Math.round(((i + 1) / totalToProcess) * 100));
              
              const region = identifyRegionFromText(table.operation_type);
              
              if (region) {
                  const newName = `${region} - ${table.operation_type}`.toUpperCase();
                  const { error } = await supabase
                      .from('client_price_tables')
                      .update({ operation_type: newName })
                      .eq('id', table.id);
                  
                  if (!error) updatedCount++;
              }
              // Delay pequeno para evitar rate limit do Supabase em atualizações rápidas sequenciais
              await new Promise(r => setTimeout(r, 50));
          }
          
          showNotification('Normalização Concluída', `${updatedCount} tabelas foram regionalizadas com sucesso!`, 'success');
          fetchTables();
      } catch (e) {
          console.error(e);
          showNotification('Erro', 'Ocorreu uma falha no processamento em lote.', 'error');
      } finally {
          setIsNormalizing(false);
          setNormProgress(0);
      }
  };

  const handleApplyAdjustment = async () => {
      const percent = parseFloat(adjustmentPercent);
      if (isNaN(percent) || percent === 0) return alert("Informe um percentual válido.");
      
      const msg = `REAJUSTE DE TABELA:\n\nDeseja aplicar ${percent}% de reajuste em ${filtered.length} regras de preço?\n\nEsta ação alterará os valores contratuais base para futuras missões.`;
      if (!confirm(msg)) return;

      setIsAdjusting(true);
      try {
          const factor = 1 + (percent / 100);
          const updates = filtered.map(t => {
              return supabase.from('client_price_tables').update({
                  activation_fee: t.activation_fee * factor,
                  price_per_extra_km: t.price_per_extra_km * factor,
                  price_per_extra_hour: t.price_per_extra_hour * factor
              }).eq('id', t.id);
          });

          await Promise.all(updates);
          showNotification('Sucesso', 'Tabelas reajustadas com sucesso!', 'success');
          setAdjustmentPercent('');
          fetchTables();
      } catch (e: any) {
          alert("Erro ao reajustar: " + e.message);
      } finally {
          setIsAdjusting(false);
      }
  };

  const handleSelectAll = () => {
      if (selectedIds.length === filtered.length && filtered.length > 0) setSelectedIds([]);
      else setSelectedIds(filtered.map(t => t.id.toString()));
  };

  const handleSelectRow = (id: string) => {
      setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir esta tabela de preços?')) return;
    setIsDeleting(id);
    try {
        const tbl = tables.find(t => t.id.toString() === id);
        const { error } = await supabase.from('client_price_tables').delete().eq('id', id);
        if (error) throw error;
        await logAction('DELETE', 'ClientPriceTable', id, `Tabela de preço excluída: ${tbl?.client || 'N/A'} — ${tbl?.origin || '?'} → ${tbl?.destination || '?'} (R$ ${tbl?.price?.toFixed(2) || '0.00'})`);
        setTables(prev => prev.filter(t => t.id.toString() !== id));
    } catch(e: any) { alert('Erro ao excluir: ' + e.message); }
    finally { setIsDeleting(null) }
  };

  const handleBulkDelete = async () => {
      if (selectedIds.length === 0) return;
      if (!confirm(`ATENÇÃO: Você está prestes a excluir ${selectedIds.length} tabelas de preço.\n\nEsta ação não pode ser desfeita. Confirmar?`)) return;
      setIsBulkDeleting(true);
      try {
          const { error } = await supabase.from('client_price_tables').delete().in('id', selectedIds);
          if (error) throw error;
          await logAction('DELETE', 'ClientPriceTable', 'bulk', `Exclusão em massa: ${selectedIds.length} tabelas de preço removidas`);
          setTables(prev => prev.filter(t => !selectedIds.includes(t.id.toString())));
          setSelectedIds([]);
      } catch (e: any) { alert('Erro na exclusão em massa: ' + e.message); fetchTables(); } 
      finally { setIsBulkDeleting(false); }
  };

  const handleBulkEditSubmit = async () => {
      if (selectedIds.length === 0) return;
      const updates: any = {};
      if (bulkValues.activation_fee !== '') updates.activation_fee = parseFloat(bulkValues.activation_fee);
      if (bulkValues.franchise_hours !== '') updates.franchise_hours = parseFloat(bulkValues.franchise_hours);
      if (bulkValues.franchise_km !== '') updates.franchise_km = parseFloat(bulkValues.franchise_km);
      if (bulkValues.price_per_extra_km !== '') updates.price_per_extra_km = parseFloat(bulkValues.price_per_extra_km);
      if (bulkValues.price_per_extra_hour !== '') updates.price_per_extra_hour = parseFloat(bulkValues.price_per_extra_hour);
      if (Object.keys(updates).length === 0) return;
      setIsBulkDeleting(true);
      try {
          const { error = null } = await supabase.from('client_price_tables').update(updates).in('id', selectedIds);
          if (error) throw error;
          setIsBulkEditModalOpen(false);
          setBulkValues({ activation_fee: '', franchise_hours: '', franchise_km: '', price_per_extra_km: '', price_per_extra_hour: '' });
          fetchTables();
      } catch (e: any) { alert('Erro ao atualizar: ' + e.message); } 
      finally { setIsBulkDeleting(false); }
  };

  return (
    <div className="space-y-6 animate-fade-in relative pb-20">
      
      {isImportModalOpen && (
          <ImportClientPriceModal onClose={() => setIsImportModalOpen(false)} onSuccess={() => fetchTables()} />
      )}

      {isBulkEditModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-gray-200">
                  <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                      <div>
                          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Edit2 size={20} className="text-blue-600"/> Edição em Massa</h3>
                          <p className="text-xs text-gray-500">Editando {selectedIds.length} itens selecionados</p>
                      </div>
                      <button onClick={() => setIsBulkEditModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full"><X size={20}/></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                          <div><label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Acionamento (R$)</label><input type="number" step="0.01" className="w-full p-2 border rounded" placeholder="Manter atual" value={bulkValues.activation_fee} onChange={e => setBulkValues({...bulkValues, activation_fee: e.target.value})} /></div>
                          <div><label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Franquia KM</label><input type="number" className="w-full p-2 border rounded" placeholder="Manter atual" value={bulkValues.franchise_km} onChange={e => setBulkValues({...bulkValues, franchise_km: e.target.value})} /></div>
                          <div><label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Franquia Horas</label><input type="number" className="w-full p-2 border rounded" placeholder="Manter atual" value={bulkValues.franchise_hours} onChange={e => setBulkValues({...bulkValues, franchise_hours: e.target.value})} /></div>
                          <div><label className="text-xs font-bold text-gray-500 uppercase mb-1 block">KM Extra (R$)</label><input type="number" step="0.01" className="w-full p-2 border rounded" placeholder="Manter atual" value={bulkValues.price_per_extra_km} onChange={e => setBulkValues({...bulkValues, price_per_extra_km: e.target.value})} /></div>
                          <div><label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Hora Extra (R$)</label><input type="number" step="0.01" className="w-full p-2 border rounded" placeholder="Manter atual" value={bulkValues.price_per_extra_hour} onChange={e => setBulkValues({...bulkValues, price_per_extra_hour: e.target.value})} /></div>
                      </div>
                  </div>
                  <div className="p-5 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 rounded-b-xl">
                      <button onClick={() => setIsBulkEditModalOpen(false)} className="px-4 py-2 border rounded text-sm font-bold text-gray-600 hover:bg-white">Cancelar</button>
                      <button onClick={handleBulkEditSubmit} disabled={isBulkDeleting} className="px-6 py-2 bg-blue-600 text-white rounded text-sm font-bold flex items-center gap-2">{isBulkDeleting ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} Aplicar</button>
                  </div>
              </div>
          </div>
      )}

      {/* HEADER */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3"><span className="w-1.5 h-6 bg-red-700 rounded-full"></span>Tabelas de Preço (Contratos)</h2>
          <p className="text-xs text-gray-500 mt-1 ml-4.5">Definição dos valores base para faturamento por cliente.</p>
        </div>
        <div className="flex gap-2">
            <button 
                onClick={handleAutoRegionalizeAll} 
                disabled={isNormalizing || filtered.length === 0}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm uppercase transition-all disabled:opacity-50 ${isNormalizing ? 'bg-indigo-600 text-white' : 'bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100'}`}
            >
                {isNormalizing ? (
                    <>
                        <Loader2 size={18} className="animate-spin" /> 
                        {normProgress}% CORRIGINDO...
                    </>
                ) : (
                    <>
                        <Wand2 size={18} /> 
                        Ajustar Regiões (Lote)
                    </>
                )}
            </button>
            <button onClick={fetchTables} className="p-2.5 border rounded-lg hover:bg-gray-50 text-gray-500"><RefreshCw size={18} className={isLoading ? "animate-spin" : ""} /></button>
            <button onClick={() => setIsImportModalOpen(true)} className="flex items-center gap-2 bg-white border border-green-600 text-green-700 hover:bg-green-50 px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm uppercase"><FileSpreadsheet size={18} /> Importar Planilha</button>
            <button onClick={onAdd} className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm uppercase"><Plus size={18} /> Nova Tabela</button>
        </div>
      </div>

      {/* PAINEL DE REAJUSTE DE TABELA (PROEMINENTE) */}
      <div className="bg-gradient-to-r from-gray-900 to-red-950 p-6 rounded-2xl shadow-xl border border-red-900/30 text-white animate-in slide-in-from-top-2">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/10 rounded-full backdrop-blur-md border border-white/10"><Zap className="text-yellow-400" size={24}/></div>
                  <div>
                      <h3 className="font-bold text-lg uppercase tracking-tighter">Reajuste de Contratos (%)</h3>
                      <p className="text-[10px] text-gray-300 uppercase font-bold tracking-widest mt-1">Aplica porcentagem em todas as tabelas listadas abaixo</p>
                  </div>
              </div>
              <div className="flex flex-wrap items-center justify-center lg:justify-end gap-6 w-full lg:w-auto">
                  <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black text-red-300 uppercase tracking-widest">Aumento / Desconto (%)</label>
                      <div className="relative">
                          <input type="number" placeholder="Ex: 5.5" className="bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-red-500 w-32 font-black text-white text-lg" value={adjustmentPercent} onChange={e => setAdjustmentPercent(e.target.value)} />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 font-black">%</span>
                      </div>
                  </div>
                  <button onClick={handleApplyAdjustment} disabled={isAdjusting || !adjustmentPercent || filtered.length === 0} className="lg:mt-5 px-8 py-3 bg-red-600 hover:bg-red-500 rounded-xl font-black text-xs uppercase shadow-xl transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2">
                      {isAdjusting ? <Loader2 size={18} className="animate-spin" /> : <Percent size={18}/>}
                      Reajustar {filtered.length} Tabelas
                  </button>
              </div>
          </div>
      </div>

      {/* LISTA DE TABELAS */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
           <div className="relative max-w-md w-full">
            <input type="text" placeholder="Buscar cliente ou operação..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            <Search size={18} className="absolute left-3.5 top-3 text-gray-400" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-auto">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                <th className="pl-6 py-4 w-10"><button onClick={handleSelectAll} className="flex items-center text-gray-400 hover:text-gray-600">{selectedIds.length > 0 && selectedIds.length === filtered.length ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} />}</button></th>
                <th className="px-3 py-4">Cliente</th>
                <th className="px-3 py-4">Operação</th>
                <th className="px-3 py-4 text-right">Acionamento</th>
                <th className="px-3 py-4 text-center">Franquias</th>
                <th className="px-3 py-4 text-right">Valores Extra</th>
                <th className="px-3 py-4 text-right w-20">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {isLoading ? (<tr><td colSpan={7} className="text-center p-8 text-[11px]">Carregando...</td></tr>) : 
              filtered.length === 0 ? (<tr><td colSpan={7} className="text-center p-8 text-gray-500 text-[11px]">Nenhuma tabela encontrada.</td></tr>) :
              filtered.map((item) => {
                const isSelected = selectedIds.includes(item.id.toString());
                return (
                    <tr key={item.id} className={`text-[11px] transition-colors ${isSelected ? 'bg-blue-50/50' : 'hover:bg-gray-50/40'}`}>
                        <td className="pl-6 py-3"><button onClick={() => handleSelectRow(item.id.toString())}>{isSelected ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} />}</button></td>
                        <td className="px-3 py-3 font-bold text-red-900 uppercase">{clientMap[item.client] || item.client}</td>
                        <td className="px-3 py-3 uppercase text-gray-700 font-medium">{item.operation_type}</td>
                        <td className="px-3 py-3 text-right font-black text-gray-800 whitespace-nowrap">{canViewValues ? formatCurrency(item.activation_fee) : <span className="text-gray-400 font-normal italic flex items-center justify-end gap-1"><Lock size={10}/> Restrito</span>}</td>
                        <td className="px-3 py-3 text-center whitespace-nowrap text-gray-600 font-medium">{item.franchise_km}km / {item.franchise_hours}h</td>
                        <td className="px-3 py-3 text-right">
                            {canViewValues ? ( 
                                <div className="flex flex-col gap-0.5 font-bold text-gray-700">
                                    <div className="whitespace-nowrap"><span className="text-gray-400 font-normal text-[9px]">KM+:</span> {formatCurrency(item.price_per_extra_km)}</div>
                                    <div className="whitespace-nowrap"><span className="text-gray-400 font-normal text-[9px]">HR+:</span> {formatCurrency(item.price_per_extra_hour)}</div>
                                </div> 
                            ) : ( 
                                <span className="text-gray-400 font-normal italic flex items-center justify-end gap-1"><Lock size={10}/> Restrito</span> 
                            )}
                        </td>
                        <td className="px-3 py-3 text-right">
                            <div className="flex justify-end gap-1">
                                <button onClick={() => onEdit(item.id)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-all" title="Editar"><Pencil size={14} /></button>
                                {isDirector && ( <button onClick={() => handleDelete(item.id.toString())} disabled={isDeleting === item.id.toString()} className="p-1.5 text-red-400 hover:text-red-700 hover:bg-red-50 rounded transition-all" title="Excluir"><Trash2 size={14} /></button> )}
                            </div>
                        </td>
                    </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedIds.length > 0 && isDirector && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl z-50 flex items-center gap-6 animate-in slide-in-from-bottom-10 border border-gray-700">
              <span className="text-sm font-bold border-r border-gray-700 pr-6">{selectedIds.length} selecionados</span>
              <button onClick={() => setIsBulkEditModalOpen(true)} className="flex items-center gap-2 hover:text-blue-300 transition-colors text-sm font-medium"><Edit2 size={16} /> Editar em Massa</button>
              <button onClick={handleBulkDelete} disabled={isBulkDeleting} className="flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors text-sm font-bold">{isBulkDeleting ? <Loader2 size={16} className="animate-spin"/> : <Trash2 size={16} />} Excluir Selecionados</button>
              <button onClick={() => setSelectedIds([])} className="bg-gray-800 hover:bg-gray-700 rounded-full p-1 ml-2"><X size={14} /></button>
          </div>
      )}
    </div>
  );
};

export default ClientPriceList;
