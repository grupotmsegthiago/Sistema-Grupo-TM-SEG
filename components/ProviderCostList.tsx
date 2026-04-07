
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../lib/RealtimeProvider';
import { logAction } from '../lib/logger';
import { ProviderCostTable } from '../types';
import { Plus, Search, DollarSign, Briefcase, Clock, Gauge, Shield, RefreshCw, Pencil, Trash2, Loader2, Database, AlertTriangle, FileSpreadsheet, Lock, Percent, Zap, Save, Wand2 } from 'lucide-react';
import ImportProviderCostModal from './ImportProviderCostModal';
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

const ProviderCostList: React.FC<Props> = ({ onAdd, onEdit }) => {
  const { showNotification } = useNotification();
  const [searchTerm, setSearchTerm] = useState('');
  const [tables, setTables] = useState<ProviderCostTable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDirector, setIsDirector] = useState(false);
  const [canViewValues, setCanViewValues] = useState(false);
  
  // Reajuste de Custo
  const [adjustmentPercent, setAdjustmentPercent] = useState('');
  const [isAdjusting, setIsAdjusting] = useState(false);

  // Normalização
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [normProgress, setNormProgress] = useState(0);

  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<'ok' | 'error' | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('userData');
    if (storedUser) {
        try {
            const user = JSON.parse(storedUser);
            const role = (user.role || '').toLowerCase();
            if (role === 'diretoria' || user.permissions?.includes('*')) setIsDirector(true);
            if (['diretoria', 'administrador'].includes(role) || user.permissions?.includes('*')) setCanViewValues(true);
        } catch (e) { console.error(e); }
    }
    fetchTables();
  }, []);

  useRealtimeRefresh('provider_cost_tables', () => fetchTables());

  const fetchTables = async () => {
    setIsLoading(true);
    setDbStatus(null);
    try {
        const { data, error } = await supabase.from('provider_cost_tables').select('*').order('provider');
        if (error) throw error;
        setDbStatus('ok');
        if(data) setTables(data as any);
    } catch(e) { 
        console.error(e);
        setDbStatus('error');
    } finally { setIsLoading(false); }
  };

  const filtered = useMemo(() => {
    return tables.filter(c => 
        (c.provider || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.operation_type || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [tables, searchTerm]);

  // LÓGICA DE NORMALIZAÇÃO EM LOTE (FORNECEDORES)
  const handleAutoRegionalizeAll = async () => {
      const itemsToFix = filtered;
      if (itemsToFix.length === 0) return;

      const msg = `Deseja regionalizar as ${itemsToFix.length} tabelas de custo filtradas? O sistema identificará cidades como Cubatão, Santos e Manaus para aplicar o prefixo regional correto.`;
      if (!confirm(msg)) return;

      setIsNormalizing(true);
      setNormProgress(0);
      let updatedCount = 0;

      try {
          for (let i = 0; i < itemsToFix.length; i++) {
              const table = itemsToFix[i];
              setNormProgress(Math.round(((i + 1) / itemsToFix.length) * 100));
              
              const region = identifyRegionFromText(table.operation_type);
              
              if (region) {
                  const newName = `${region} - ${table.operation_type}`.toUpperCase();
                  const { error } = await supabase
                      .from('provider_cost_tables')
                      .update({ operation_type: newName })
                      .eq('id', table.id);
                  
                  if (!error) updatedCount++;
              }
              await new Promise(r => setTimeout(r, 50));
          }
          
          showNotification('Normalização Concluída', `${updatedCount} custos foram regionalizados.`, 'success');
          fetchTables();
      } catch (e) {
          console.error(e);
      } finally {
          setIsNormalizing(false);
          setNormProgress(0);
      }
  };

  const handleApplyAdjustment = async () => {
      const percent = parseFloat(adjustmentPercent);
      if (isNaN(percent) || percent === 0) return alert("Informe um percentual válido.");
      
      if (!confirm(`Deseja aplicar ${percent}% de reajuste em ${filtered.length} custos de fornecedor?`)) return;

      setIsAdjusting(true);
      try {
          const factor = 1 + (percent / 100);
          const updates = filtered.map(t => {
              return supabase.from('provider_cost_tables').update({
                  activation_cost: t.activation_cost * factor,
                  cost_per_extra_km: t.cost_per_extra_km * factor,
                  cost_per_extra_hour: t.cost_per_extra_hour * factor
              }).eq('id', t.id);
          });

          await Promise.all(updates);
          showNotification('Sucesso', 'Custos de fornecedor reajustados!', 'success');
          setAdjustmentPercent('');
          fetchTables();
      } catch (e: any) {
          alert("Erro: " + e.message);
      } finally {
          setIsAdjusting(false);
      }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir esta tabela de custos?')) return;
    setIsDeleting(id);
    try {
        const tbl = tables.find(t => t.id.toString() === id);
        const { error } = await supabase.from('provider_cost_tables').delete().eq('id', id);
        if(error) throw error;
        await logAction('DELETE', 'ProviderCostTable', id, `Tabela de custo excluída: ${tbl?.provider || 'N/A'} — ${tbl?.origin || '?'} → ${tbl?.destination || '?'} (R$ ${tbl?.cost?.toFixed(2) || '0.00'})`);
        fetchTables();
    } catch(e: any) { alert(e.message) }
    finally { setIsDeleting(null) }
  };

  return (
    <div className="space-y-6 animate-fade-in relative pb-10">
      
      {isImportModalOpen && (
          <ImportProviderCostModal onClose={() => setIsImportModalOpen(false)} onSuccess={() => fetchTables()} />
      )}

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3"><span className="w-1.5 h-6 bg-red-700 rounded-full"></span>Custos Operacionais (Fornecedor)</h2>
          <p className="text-xs text-gray-500 mt-1 ml-4.5">Tabelas de custo para cálculo de margem operacional.</p>
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
                        Regionalizar Custos
                    </>
                )}
            </button>
            <button onClick={() => setIsImportModalOpen(true)} className="flex items-center gap-2 bg-white border border-indigo-600 text-indigo-700 hover:bg-indigo-50 px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm uppercase"><FileSpreadsheet size={18} /> Importar Planilha</button>
            <button onClick={fetchTables} className="p-2.5 border rounded-lg hover:bg-gray-50 text-gray-500"><RefreshCw size={18} className={isLoading ? "animate-spin" : ""} /></button>
            <button onClick={onAdd} className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-5 py-2.5 rounded-lg text-sm font-medium shadow-sm uppercase"><Plus size={18} /> Novo Custo</button>
        </div>
      </div>

      {/* PAINEL DE REAJUSTE DE CUSTO */}
      <div className="bg-gradient-to-r from-gray-900 to-indigo-950 p-6 rounded-2xl shadow-xl border border-indigo-900/30 text-white animate-in slide-in-from-top-2">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/10 rounded-full backdrop-blur-md border border-white/10"><Percent className="text-blue-400" size={24}/></div>
                  <div>
                      <h3 className="font-bold text-lg uppercase tracking-tighter">Reajuste de Custos (%)</h3>
                      <p className="text-[10px] text-gray-300 uppercase font-bold tracking-widest mt-1">Aplica porcentagem em todos os custos de fornecedores filtrados</p>
                  </div>
              </div>
              <div className="flex flex-wrap items-center justify-center lg:justify-end gap-6 w-full lg:w-auto">
                  <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">Aumento / Desconto (%)</label>
                      <div className="relative">
                          <input type="number" placeholder="Ex: 5.5" className="bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 w-32 font-black text-white text-lg" value={adjustmentPercent} onChange={e => setAdjustmentPercent(e.target.value)} />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 font-black">%</span>
                      </div>
                  </div>
                  <button onClick={handleApplyAdjustment} disabled={isAdjusting || !adjustmentPercent || filtered.length === 0} className="lg:mt-5 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-black text-xs uppercase shadow-xl transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2">
                      {isAdjusting ? <Loader2 size={18} className="animate-spin" /> : <Save size={18}/>}
                      Atualizar {filtered.length} Custos
                  </button>
              </div>
          </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gray-50/50">
           <div className="relative max-w-md">
            <input type="text" placeholder="Buscar fornecedor ou operação..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            <Search size={18} className="absolute left-3.5 top-3 text-gray-400" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                <th className="pl-10 px-6 py-4">Fornecedor</th>
                <th className="pl-10 px-6 py-4">Operação / Rota</th>
                <th className="px-10 py-4">Acionamento</th>
                <th className="px-10 py-4">Franquias</th>
                <th className="px-10 py-4">Custos Extra</th>
                <th className="pl-10 px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {isLoading ? (<tr><td colSpan={6} className="text-center p-8">Carregando...</td></tr>) : 
              filtered.length === 0 ? (<tr><td colSpan={6} className="text-center p-8 text-gray-500">Nenhuma tabela encontrada.</td></tr>) :
              filtered.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="pl-10 px-6 py-4 text-sm text-indigo-900 font-bold uppercase">{item.provider}</td>
                  <td className="pl-10 px-6 py-4"><div className="flex items-center gap-2"><div className="p-1.5 bg-indigo-50 text-indigo-700 rounded"><Shield size={14} /></div><span className="text-sm text-gray-700 font-medium uppercase">{item.operation_type}</span></div></td>
                  <td className="px-10 py-4 text-sm font-bold text-gray-800">{canViewValues ? formatCurrency(item.activation_cost) : <span className="text-gray-400 font-normal italic flex items-center justify-end gap-1"><Lock size={10}/> Restrito</span>}</td>
                  <td className="px-10 py-4"><div className="flex flex-col gap-1 text-xs uppercase font-medium text-gray-600"><div className="flex items-center gap-1.5"><Clock size={12} className="text-blue-500" />{item.franchise_hours} Horas</div><div className="flex items-center gap-1.5"><Gauge size={12} className="text-orange-500" />{item.franchise_km} KM</div></div></td>
                  <td className="px-10 py-4">{canViewValues ? ( <div className="flex flex-col gap-1 text-xs uppercase font-bold text-gray-700"><div className="flex items-center gap-1.5"><span className="text-gray-400 font-normal">KM+:</span> {formatCurrency(item.cost_per_extra_km)}</div><div className="flex items-center gap-1.5"><span className="text-gray-400 font-normal">HR+:</span> {formatCurrency(item.cost_per_extra_hour)}</div></div> ) : ( <span className="text-gray-400 text-xs font-normal italic flex items-center gap-1"><Lock size={10}/> Restrito</span> )}</td>
                  <td className="pl-10 px-6 py-4 text-right"><div className="flex justify-end gap-2"><button onClick={() => onEdit(item.id)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Editar"><Pencil size={18} /></button>{isDirector && ( <button onClick={() => handleDelete(item.id)} disabled={isDeleting === item.id} className="p-2 text-red-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all" title="Excluir"><Trash2 size={18} /></button> )}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ProviderCostList;
