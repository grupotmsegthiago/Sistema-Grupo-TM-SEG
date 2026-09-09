
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../lib/RealtimeProvider';
import { Quote } from '../types';
import { Plus, Search, DollarSign, MapPin, RefreshCw, Loader2, Trash2, Pencil, Lock, CheckCircle2 } from 'lucide-react';
import { useNotification } from '../lib/NotificationContext';
import CotacaoRapidaRegional from './CotacaoRapidaRegional';
import {
  montarPayloadTabelaCliente,
  resultadoFromQuoteItems,
} from '../lib/comercial/tabelaPrecosRegionais';

interface Props {
  onAdd: () => void;
  onEdit: (id: string) => void;
  clientName?: string;
  clientId?: string | number | null;
  embedded?: boolean;
}

const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'R$ 0,00';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const QuoteList: React.FC<Props> = ({ onAdd, onEdit, clientName, clientId, embedded = false }) => {
  const { showNotification } = useNotification();
  const [searchTerm, setSearchTerm] = useState('');
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [isDirector, setIsDirector] = useState(false);
  const [isCommercial, setIsCommercial] = useState(false);
  const [canViewValues, setCanViewValues] = useState(false);
  
  const [dbStatus, setDbStatus] = useState<'ok' | 'error' | null>(null);
  const [clientMap, setClientMap] = useState<Record<string, string>>({});
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('userData');
    if (storedUser) {
        try {
            const user = JSON.parse(storedUser);
            setCurrentUser(user);
            const role = (user.role || '').toLowerCase();
            
            if (role === 'diretoria' || user.permissions?.includes('*')) {
                setIsDirector(true);
            }
            if (role === 'comercial' && !user.permissions?.includes('*')) {
                setIsCommercial(true);
            }
            if (['diretoria', 'administrador', 'comercial'].includes(role) || user.permissions?.includes('*')) {
                setCanViewValues(true);
            }
        } catch(e) { console.error(e); }
    }
    fetchQuotes();
  }, [clientName]);

  useRealtimeRefresh('quotes', () => fetchQuotes());

  const fetchQuotes = async () => {
    const user = currentUser || JSON.parse(localStorage.getItem('userData') || '{}');
    setIsLoading(true);
    setDbStatus(null);
    try {
        let quoteQuery = supabase.from('quotes').select(`
            *,
            clients:client_id(id, name, created_by)
        `).order('created_at', { ascending: false });
        
        if (clientName) {
            quoteQuery = quoteQuery.eq('client_name', clientName);
        } else if ((user?.role || '').toLowerCase() === 'comercial' && !user?.permissions?.includes('*')) {
            const allowedIds = user?.permissions?.filter((p: string) => p.startsWith('client_view:')).map((p: string) => p.split(':')[1]) || [];
            if (allowedIds.length > 0) {
                quoteQuery = quoteQuery.or(`created_by.eq."${user?.name}",client_id.in.(${allowedIds.join(',')})`);
            } else {
                quoteQuery = quoteQuery.eq('created_by', user?.name);
            }
        }

        const [quotesRes, clientsRes] = await Promise.all([
            quoteQuery,
            supabase.from('clients').select('name, trading_name')
        ]);

        if (quotesRes.error) throw quotesRes.error;
        const map: Record<string, string> = {};
        if (clientsRes.data) {
            clientsRes.data.forEach((c: any) => { map[c.name] = c.trading_name || c.name; });
        }
        setClientMap(map);
        setDbStatus('ok');
        if(quotesRes.data) setQuotes(quotesRes.data as any);
    } catch(e) { 
        console.error(e);
        setDbStatus('error');
    } finally { setIsLoading(false) }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir esta cotação permanentemente?')) return;
    setIsDeleting(id);
    try {
        const { data, error } = await supabase.from('quotes').delete().eq('id', id).select();
        if(error) throw error;
        if (!data || data.length === 0) throw new Error("Erro de permissão.");
        const deletedQuote = data[0];
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        await supabase.from('system_logs').insert([{
            action_type: 'DELETE',
            entity: 'Quote',
            entity_id: String(id),
            user_id: userData.id || null,
            user_name: userData.name || 'Sistema',
            details: `Registro excluído: ${deletedQuote?.client_name || 'N/A'} — ${deletedQuote?.origin || '?'} → ${deletedQuote?.destination || '?'}`,
            created_at: new Date().toISOString()
        }]);
        fetchQuotes();
    } catch(e: any) { alert(e.message) }
    finally { setIsDeleting(null) }
  };

  const handleFecharProposta = async (quote: Quote) => {
    const resultado = resultadoFromQuoteItems(quote);
    const cliente = String(quote.client_name || clientName || '').trim();
    if (!resultado || !cliente) {
      showNotification('Fechar proposta', 'Informe o cliente na cotação antes de gerar a tabela real.', 'warning');
      return;
    }
    if (quote.closed_price_table_id) {
      showNotification('Já fechada', 'Esta cotação já gerou tabela de preço do cliente.', 'info');
      return;
    }
    const tabela = montarPayloadTabelaCliente({ clienteNome: cliente, resultado });
    if (!confirm(`Fechar proposta e gerar tabela real do cliente?\n\n${tabela.operation_type}\nAcionamento: ${tabela.activation_fee}\nKM extra: ${tabela.price_per_extra_km}\nHora extra: ${tabela.price_per_extra_hour}\n\nIsso NÃO altera OS/NF já faturadas.`)) return;
    setClosingId(quote.id);
    try {
      const { data, error } = await supabase.from('client_price_tables').insert([tabela]).select('id').single();
      if (error) throw error;
      const { error: updErr } = await supabase.from('quotes').update({
        status: 'Aprovada',
        closed_price_table_id: data?.id || null,
        client_name: cliente,
      }).eq('id', quote.id);
      if (updErr) throw updErr;
      showNotification('Proposta fechada', 'Tabela de custo real do cliente gerada.', 'success');
      fetchQuotes();
    } catch (e: any) {
      showNotification('Erro', e?.message || 'Falha ao fechar proposta.', 'error');
    } finally {
      setClosingId(null);
    }
  };

  const filtered = quotes.filter(q => {
    const clientDisplay = clientMap[q.client_name] || q.client_name;
    return (clientDisplay?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
           (q.origin || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
           (q.destination || '').toLowerCase().includes(searchTerm.toLowerCase())
  });

  return (
    <div className={`space-y-6 animate-fade-in ${embedded ? 'pb-0' : ''}`}>
      {!embedded && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
            <div><h2 className="text-xl font-bold text-gray-900 flex items-center gap-3"><span className="w-1.5 h-6 bg-green-600 rounded-full"></span>Cotações e Calculadora</h2></div>
            <div className="flex gap-2">
                <button onClick={fetchQuotes} className="p-2.5 border rounded-lg hover:bg-gray-50 text-gray-500"><RefreshCw size={18} className={isLoading ? "animate-spin" : ""} /></button>
                <button onClick={onAdd} className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm uppercase"><Plus size={18} /> Nova Cotação</button>
            </div>
          </div>
      )}
      <CotacaoRapidaRegional clientName={clientName} clientId={clientId} onSaved={fetchQuotes} />
      <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${embedded ? 'border-t' : ''}`}>
        <div className="p-5 border-b border-gray-100 bg-gray-50/50">
           <div className="relative max-w-md w-full">
            <input type="text" placeholder="Buscar origem ou destino..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            <Search size={18} className="absolute left-3.5 top-3 text-gray-400" />
          </div>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {!embedded && <th className="pl-10 px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Cliente</th>}
                  <th className="pl-10 px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Rota (Origem / Destino)</th>
                  <th className="pl-10 px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Totais</th>
                  <th className="pl-10 px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {isLoading ? (<tr><td colSpan={5} className="text-center p-4">Carregando...</td></tr>) : 
                 filtered.length === 0 ? (<tr><td colSpan={5} className="text-center p-4 text-gray-500">Nenhuma cotação encontrada na sua carteira.</td></tr>) :
                 filtered.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      {!embedded && (<td className="pl-10 px-6 py-4"><span className="font-bold text-sm text-gray-900 uppercase">{clientMap[item.client_name] || item.client_name || 'Prospect'}</span>{item.quote_source === 'RAPIDA_REGIONAL' && <span className="ml-2 text-[9px] font-black uppercase text-red-700 bg-red-50 px-1.5 py-0.5 rounded">Rápida</span>}</td>)}
                      <td className="pl-10 px-6 py-4"><div className="flex flex-col gap-1 text-xs text-gray-600"><div className="flex items-center gap-1.5"><MapPin size={12} className="text-blue-500"/> {item.origin}</div><div className="flex items-center gap-1.5"><MapPin size={12} className="text-red-500"/> {item.destination}</div></div></td>
                      <td className="pl-10 px-6 py-4"><div className="flex flex-col gap-1 text-xs font-bold"><div className="flex items-center gap-1.5 text-gray-700">KM: {item.total_km}</div>{canViewValues ? (<div className="flex items-center gap-1.5 text-green-700 bg-green-50 px-2 py-0.5 rounded w-fit"><DollarSign size={12}/> {formatCurrency(item.total_value)}</div>) : (<div className="flex items-center gap-1 text-gray-400 font-normal italic"><Lock size={10} /> Restrito</div>)}</div></td>
                      <td className="pl-10 px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                           {item.quote_source === 'RAPIDA_REGIONAL' && !item.closed_price_table_id && (
                             <button type="button" onClick={() => void handleFecharProposta(item)} disabled={closingId === item.id} className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg disabled:opacity-50" data-testid={`btn-fechar-proposta-${item.id}`}>
                               {closingId === item.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Fechar proposta
                             </button>
                           )}
                           <button onClick={() => onEdit(item.id)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><Pencil size={18} /></button>
                           {(isDirector || isCommercial) && (<button onClick={() => handleDelete(item.id)} disabled={isDeleting === item.id} className="p-2 text-red-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all">{isDeleting === item.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}</button>)}
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

export default QuoteList;
