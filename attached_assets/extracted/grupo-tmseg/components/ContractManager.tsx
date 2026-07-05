
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  FileText, Search, Loader2, CheckCircle2, XCircle, 
  Eye, RefreshCw, Calendar, DollarSign, User, ShieldCheck
} from 'lucide-react';

interface ContractRecord {
    id: string;
    client_name: string;
    type: 'PROPOSTA' | 'CONTRATO';
    status: 'ENVIADO' | 'VISUALIZADO' | 'ASSINADO' | 'CANCELADO';
    value: number;
    created_at: string;
    created_by: string;
    signed_at?: string;
    pdf_url?: string;
}

const ContractManager: React.FC = () => {
    const [contracts, setContracts] = useState<ContractRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('ALL');

    useEffect(() => {
        fetchContracts();
    }, []);

    const fetchContracts = async () => {
        setIsLoading(true);
        try {
            // Tenta buscar da tabela (caso exista)
            const { data, error } = await supabase
                .from('commercial_proposals')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                // Se a tabela não existir, trata o erro silenciosamente (simulação inicial)
                // console.warn('Tabela commercial_proposals não encontrada.');
                setContracts([]); 
            } else if (data) {
                setContracts(data as ContractRecord[]);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateStatus = async (id: string, newStatus: string) => {
        try {
            await supabase.from('commercial_proposals').update({ status: newStatus }).eq('id', id);
            fetchContracts();
        } catch (e) { console.error(e); }
    };

    const filtered = contracts.filter(c => {
        const matchesSearch = c.client_name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = filterStatus === 'ALL' || c.status === filterStatus;
        return matchesSearch && matchesStatus;
    });

    const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-red-700 text-white rounded-2xl shadow-lg">
                        <FileText size={28} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Gestão de Contratos</h2>
                        <p className="text-sm text-gray-500 font-medium">Controle de envio e assinatura de propostas comerciais.</p>
                    </div>
                </div>
                <button onClick={fetchContracts} className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 text-gray-500">
                    <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[400px]">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col md:flex-row gap-4 justify-between items-center">
                    <div className="relative w-full md:w-96">
                        <input 
                            type="text" 
                            placeholder="Buscar cliente..." 
                            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-500/10"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setFilterStatus('ALL')} className={`px-4 py-1.5 text-xs font-bold rounded transition-all ${filterStatus === 'ALL' ? 'bg-gray-800 text-white' : 'bg-white border text-gray-500'}`}>Todos</button>
                        <button onClick={() => setFilterStatus('ENVIADO')} className={`px-4 py-1.5 text-xs font-bold rounded transition-all ${filterStatus === 'ENVIADO' ? 'bg-blue-600 text-white' : 'bg-white border text-gray-500'}`}>Enviados</button>
                        <button onClick={() => setFilterStatus('ASSINADO')} className={`px-4 py-1.5 text-xs font-bold rounded transition-all ${filterStatus === 'ASSINADO' ? 'bg-green-600 text-white' : 'bg-white border text-gray-500'}`}>Assinados</button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                <th className="px-6 py-4">Data Envio</th>
                                <th className="px-6 py-4">Cliente</th>
                                <th className="px-6 py-4">Tipo Doc.</th>
                                <th className="px-6 py-4 text-center">Status Atual</th>
                                <th className="px-6 py-4 text-right">Valor Total</th>
                                <th className="px-6 py-4 text-center">Resp.</th>
                                <th className="px-6 py-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {isLoading ? (
                                <tr><td colSpan={7} className="p-20 text-center"><Loader2 size={32} className="animate-spin text-red-600 mx-auto" /></td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={7} className="p-20 text-center text-gray-400 font-bold uppercase tracking-widest">Nenhum contrato registrado.</td></tr>
                            ) : (
                                filtered.map(c => (
                                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-gray-600 text-xs font-mono">
                                                <Calendar size={14}/> {new Date(c.created_at).toLocaleDateString()}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 font-black text-sm text-gray-900 uppercase">
                                            {c.client_name}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${c.type === 'CONTRATO' ? 'bg-slate-100 border-slate-300 text-slate-700' : 'bg-orange-50 border-orange-200 text-orange-700'}`}>
                                                {c.type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase border ${
                                                c.status === 'ASSINADO' ? 'bg-green-50 text-green-700 border-green-200' : 
                                                c.status === 'CANCELADO' ? 'bg-red-50 text-red-700 border-red-200' : 
                                                'bg-blue-50 text-blue-700 border-blue-200'
                                            }`}>
                                                {c.status === 'ASSINADO' && <CheckCircle2 size={12}/>}
                                                {c.status === 'CANCELADO' && <XCircle size={12}/>}
                                                {c.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono font-bold text-gray-700">
                                            {formatCurrency(c.value)}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-gray-500 uppercase bg-gray-100 px-2 py-0.5 rounded">
                                                <User size={10}/> {c.created_by?.split(' ')[0]}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                {c.status !== 'ASSINADO' && (
                                                    <button onClick={() => handleUpdateStatus(c.id, 'ASSINADO')} className="p-1.5 bg-green-50 text-green-600 rounded hover:bg-green-100 transition-colors" title="Marcar como Assinado">
                                                        <ShieldCheck size={16}/>
                                                    </button>
                                                )}
                                                {c.status !== 'CANCELADO' && (
                                                    <button onClick={() => handleUpdateStatus(c.id, 'CANCELADO')} className="p-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors" title="Cancelar">
                                                        <XCircle size={16}/>
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

export default ContractManager;
