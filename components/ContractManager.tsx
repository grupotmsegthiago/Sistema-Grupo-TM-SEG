
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  FileText, Search, Loader2, CheckCircle2, XCircle, 
  RefreshCw, Calendar, User, ShieldCheck, Clock, Send,
  AlertTriangle, FileSignature, Building2
} from 'lucide-react';

interface ContractRecord {
    id: string;
    client_name: string;
    client_id: string;
    status: 'PENDENTE' | 'ENVIADO' | 'ASSINADO' | 'CANCELADO' | 'VENCIDO';
    contract_date: string;
    valid_from: string;
    valid_until: string;
    signed_at: string;
    signed_by: string;
    contract_type: 'CLIENTE' | 'FORNECEDOR';
    notes: string;
    created_at: string;
    created_by: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  PENDENTE: { label: 'Pendente', color: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: Clock },
  ENVIADO: { label: 'Enviado', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Send },
  ASSINADO: { label: 'Assinado', color: 'bg-green-50 text-green-700 border-green-200', icon: CheckCircle2 },
  CANCELADO: { label: 'Cancelado', color: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
  VENCIDO: { label: 'Vencido', color: 'bg-gray-50 text-gray-500 border-gray-200', icon: AlertTriangle },
};

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
            const { data } = await supabase
                .from('system_logs')
                .select('*')
                .eq('entity', 'ClientContract')
                .order('created_at', { ascending: false });

            if (data) {
                const parsed = data.map(row => {
                    try {
                        const d = JSON.parse(row.details);
                        return { ...d, id: row.id, created_at: row.created_at, created_by: row.user_name } as ContractRecord;
                    } catch { return null; }
                }).filter(Boolean) as ContractRecord[];

                const updated = parsed.map(c => {
                    if (c.status === 'ASSINADO' && c.valid_until && new Date(c.valid_until) < new Date()) {
                        return { ...c, status: 'VENCIDO' as const };
                    }
                    return c;
                });
                setContracts(updated);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateStatus = async (contract: ContractRecord, newStatus: string) => {
        try {
            const payload = { ...contract, status: newStatus, updated_at: new Date().toISOString() };
            delete (payload as any).id;
            delete (payload as any).created_at;
            delete (payload as any).created_by;
            if (newStatus === 'ASSINADO' && !contract.signed_at) {
                payload.signed_at = new Date().toISOString().split('T')[0];
            }
            const updRes = await supabase.from('system_logs').update({
                details: JSON.stringify(payload),
                action_type: 'UPDATE',
            }).eq('id', contract.id);
            if (updRes.error) { alert('Erro ao atualizar status do contrato: ' + updRes.error.message); return; }
            fetchContracts();
        } catch (e: any) { console.error(e); alert('Erro ao atualizar status do contrato: ' + (e?.message || 'Erro desconhecido')); }
    };

    const filtered = contracts.filter(c => {
        const matchesSearch = (c.client_name || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = filterStatus === 'ALL' || c.status === filterStatus;
        return matchesSearch && matchesStatus;
    });

    const formatDateBR = (d: string) => {
        if (!d) return '—';
        const [y, m, day] = d.split('-');
        return `${day}/${m}/${y}`;
    };

    const getDaysLeft = (validUntil: string): number | null => {
        if (!validUntil) return null;
        return Math.ceil((new Date(validUntil).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    };

    const totalAssinados = contracts.filter(c => c.status === 'ASSINADO').length;
    const totalPendentes = contracts.filter(c => c.status === 'PENDENTE' || c.status === 'ENVIADO').length;
    const totalVencidos = contracts.filter(c => c.status === 'VENCIDO').length;

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-red-700 text-white rounded-2xl shadow-lg">
                        <FileSignature size={28} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight" data-testid="text-contract-title">Gestão de Contratos</h2>
                        <p className="text-sm text-gray-500 font-medium">Controle centralizado de contratos de clientes e fornecedores.</p>
                    </div>
                </div>
                <button onClick={fetchContracts} className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 text-gray-500" data-testid="btn-refresh-contracts-global">
                    <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-100 rounded-lg"><FileText size={18} className="text-gray-600" /></div>
                        <div>
                            <p className="text-2xl font-black text-gray-900" data-testid="text-total-contracts">{contracts.length}</p>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-green-200 p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-50 rounded-lg"><CheckCircle2 size={18} className="text-green-600" /></div>
                        <div>
                            <p className="text-2xl font-black text-green-700">{totalAssinados}</p>
                            <p className="text-[10px] font-bold text-green-500 uppercase tracking-wider">Assinados</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-yellow-200 p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-yellow-50 rounded-lg"><Clock size={18} className="text-yellow-600" /></div>
                        <div>
                            <p className="text-2xl font-black text-yellow-700">{totalPendentes}</p>
                            <p className="text-[10px] font-bold text-yellow-500 uppercase tracking-wider">Pendentes</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-red-200 p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-50 rounded-lg"><AlertTriangle size={18} className="text-red-600" /></div>
                        <div>
                            <p className="text-2xl font-black text-red-700">{totalVencidos}</p>
                            <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Vencidos</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[400px]">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col md:flex-row gap-4 justify-between items-center">
                    <div className="relative w-full md:w-96">
                        <input 
                            type="text" 
                            placeholder="Buscar cliente/fornecedor..." 
                            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-500/10"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            data-testid="input-search-contracts"
                        />
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {['ALL', 'PENDENTE', 'ENVIADO', 'ASSINADO', 'VENCIDO', 'CANCELADO'].map(s => {
                            const cfg = STATUS_CONFIG[s];
                            return (
                                <button key={s} onClick={() => setFilterStatus(s)} className={`px-4 py-1.5 text-xs font-bold rounded transition-all ${filterStatus === s ? (s === 'ALL' ? 'bg-gray-800 text-white' : 'bg-gray-800 text-white') : 'bg-white border text-gray-500 hover:bg-gray-50'}`} data-testid={`btn-filter-${s.toLowerCase()}`}>
                                    {s === 'ALL' ? 'Todos' : cfg?.label || s}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                <th className="px-6 py-4">Data</th>
                                <th className="px-6 py-4">Cliente/Fornecedor</th>
                                <th className="px-6 py-4">Tipo</th>
                                <th className="px-6 py-4 text-center">Status</th>
                                <th className="px-6 py-4">Vigência</th>
                                <th className="px-6 py-4">Assinatura</th>
                                <th className="px-6 py-4 text-center">Resp.</th>
                                <th className="px-6 py-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {isLoading ? (
                                <tr><td colSpan={8} className="p-20 text-center"><Loader2 size={32} className="animate-spin text-red-600 mx-auto" /></td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={8} className="p-20 text-center text-gray-400 font-bold uppercase tracking-widest text-xs">Nenhum contrato registrado.</td></tr>
                            ) : (
                                filtered.map(c => {
                                    const statusCfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.PENDENTE;
                                    const StatusIcon = statusCfg.icon;
                                    const daysLeft = getDaysLeft(c.valid_until);
                                    const isExpiringSoon = daysLeft !== null && daysLeft > 0 && daysLeft <= 30;

                                    return (
                                        <tr key={c.id} className="hover:bg-gray-50 transition-colors" data-testid={`contract-global-${c.id}`}>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 text-gray-600 text-xs font-mono">
                                                    <Calendar size={14}/> {formatDateBR(c.contract_date)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 font-black text-sm text-gray-900 uppercase">
                                                {c.client_name}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${c.contract_type === 'FORNECEDOR' ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-slate-100 border-slate-300 text-slate-700'}`}>
                                                    {c.contract_type === 'FORNECEDOR' ? 'Fornecedor' : 'Cliente'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase border ${statusCfg.color}`}>
                                                    <StatusIcon size={12}/> {statusCfg.label}
                                                </span>
                                                {isExpiringSoon && (
                                                    <div className="text-[9px] text-orange-500 font-bold mt-1">Vence em {daysLeft}d</div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-xs text-gray-600">
                                                {formatDateBR(c.valid_from)} → {c.valid_until ? formatDateBR(c.valid_until) : 'Indet.'}
                                            </td>
                                            <td className="px-6 py-4 text-xs">
                                                {c.signed_at ? (
                                                    <span className="text-green-700 font-bold">{formatDateBR(c.signed_at)}</span>
                                                ) : (
                                                    <span className="text-gray-300">—</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-gray-500 uppercase bg-gray-100 px-2 py-0.5 rounded">
                                                    <User size={10}/> {c.created_by?.split(' ')[0] || '—'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    {(c.status === 'PENDENTE' || c.status === 'ENVIADO') && (
                                                        <button onClick={() => handleUpdateStatus(c, 'ASSINADO')} className="p-1.5 bg-green-50 text-green-600 rounded hover:bg-green-100 transition-colors" title="Marcar como Assinado" data-testid={`btn-sign-global-${c.id}`}>
                                                            <ShieldCheck size={16}/>
                                                        </button>
                                                    )}
                                                    {c.status !== 'CANCELADO' && c.status !== 'VENCIDO' && (
                                                        <button onClick={() => handleUpdateStatus(c, 'CANCELADO')} className="p-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors" title="Cancelar" data-testid={`btn-cancel-global-${c.id}`}>
                                                            <XCircle size={16}/>
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ContractManager;
