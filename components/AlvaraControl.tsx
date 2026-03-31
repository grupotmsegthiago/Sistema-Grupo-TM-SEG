
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { ProviderData } from '../types';
import { 
    ShieldCheck, Calendar, FileText, Search, Loader2, 
    AlertTriangle, CheckCircle2, ExternalLink, RefreshCw, 
    Filter, Clock, Download, Pencil, BellRing, X, Upload, Save, Lock
} from 'lucide-react';

const AlvaraControl: React.FC = () => {
    const [providers, setProviders] = useState<ProviderData[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<'ALL' | 'VENCIDO' | 'VALIDO'>('ALL');
    
    // Auth & Permission States
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedProvider, setSelectedProvider] = useState<ProviderData | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [editDate, setEditDate] = useState('');
    const [editUrl, setEditUrl] = useState('');

    useEffect(() => {
        const storedUser = localStorage.getItem('userData');
        if (storedUser) {
            try { setCurrentUser(JSON.parse(storedUser)); } catch (e) { console.error(e); }
        }
        fetchData();
    }, []);

    const canEditAlvara = useMemo(() => {
        if (!currentUser) return false;
        const role = (currentUser.role || '').toLowerCase();
        // Liberação de Edição: Perfis 'Avançado' e 'Administrador' (e Diretoria como nível superior)
        return role === 'administrador' || role === 'avançado' || role === 'avancado' || role === 'diretoria';
    }, [currentUser]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('providers')
                .select('*')
                .order('alvara_validity', { ascending: true });
            
            if (error) throw error;

            if (data) {
                const mapped = data.map((item: any) => {
                    let status = item.status;
                    
                    // Lógica de Vencimento de Alvará
                    if (item.status !== 'Bloqueado' && item.alvara_validity) {
                        const [year, month, day] = item.alvara_validity.split('-').map(Number);
                        const validityDate = new Date(year, month - 1, day, 12, 0, 0); // Meio dia
                        
                        const today = new Date();
                        today.setHours(0,0,0,0);
                        
                        if (validityDate < today) {
                            status = 'Alvará Vencido';
                        } else if (status === 'Alvará Vencido') {
                            // Correção automática visual
                            status = 'Ativo';
                        }
                    }

                    return {
                        ...item,
                        id: item.id.toString(),
                        status: status,
                        alvaraValidity: item.alvara_validity,
                        alvaraUrl: item.alvara_url
                    };
                });
                setProviders(mapped);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenEdit = (p: ProviderData) => {
        if (!canEditAlvara) return;
        setSelectedProvider(p);
        setEditDate(p.alvaraValidity || '');
        setEditUrl(p.alvaraUrl || '');
        setIsEditModalOpen(true);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedProvider) return;

        setIsUploading(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `alvara_${selectedProvider.cnpj.replace(/\D/g, '')}_${Date.now()}.${fileExt}`;
            const filePath = `permits/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('documents')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('documents')
                .getPublicUrl(filePath);

            setEditUrl(publicUrl);
            alert("Documento carregado com sucesso!");
        } catch (error: any) {
            console.error(error);
            alert("Erro no upload: " + (error.message || "Verifique se o bucket 'documents' existe no Supabase."));
        } finally {
            setIsUploading(false);
        }
    };

    const handleSaveAlvara = async () => {
        if (!selectedProvider) return;
        setIsSaving(true);
        try {
            // Verificar se precisa atualizar o status também no banco
            let newStatus = selectedProvider.status;
            if (editDate) {
                 const [year, month, day] = editDate.split('-').map(Number);
                 const validityDate = new Date(year, month - 1, day, 12, 0, 0);
                 const today = new Date();
                 today.setHours(0,0,0,0);
                 
                 if (validityDate < today) newStatus = 'Alvará Vencido';
                 else if (selectedProvider.status === 'Alvará Vencido') newStatus = 'Ativo';
            }

            const { error } = await supabase
                .from('providers')
                .update({
                    alvara_validity: editDate || null,
                    alvara_url: editUrl || null,
                    status: newStatus
                })
                .eq('id', selectedProvider.id);

            if (error) throw error;

            alert("Dados do alvará atualizados com sucesso!");
            setIsEditModalOpen(false);
            fetchData();
        } catch (error: any) {
            alert("Erro ao salvar: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const filtered = providers.filter(p => {
        const matchesSearch = (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                             (p.cnpj || '').includes(searchTerm);
        
        const isVencido = p.status === 'Alvará Vencido';
        
        if (filterStatus === 'VENCIDO') return matchesSearch && isVencido;
        if (filterStatus === 'VALIDO') return matchesSearch && !isVencido;
        return matchesSearch;
    });

    const stats = {
        total: providers.length,
        vencidos: providers.filter(p => p.status === 'Alvará Vencido').length,
        validos: providers.filter(p => p.status !== 'Alvará Vencido').length
    };

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            {/* MODAL DE EDIÇÃO - ACESSO RESTRITO */}
            {isEditModalOpen && selectedProvider && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-2xl">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <ShieldCheck className="text-red-700" /> Atualizar Alvará Polícia Federal
                            </h3>
                            <button onClick={() => setIsEditModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X size={20}/></button>
                        </div>
                        
                        <div className="p-6 space-y-6">
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Fornecedor</p>
                                <p className="font-bold text-gray-800 uppercase">{selectedProvider.name}</p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase mb-1.5 block">Data de Validade</label>
                                    <div className="relative">
                                        <input 
                                            type="date" 
                                            className="w-full p-3 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
                                            value={editDate}
                                            onChange={e => setEditDate(e.target.value)}
                                        />
                                        <Calendar size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase mb-1.5 block">Documento do Alvará (PDF)</label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            className="flex-1 p-3 bg-gray-50 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
                                            placeholder="URL do arquivo ou faça upload..."
                                            value={editUrl}
                                            onChange={e => setEditUrl(e.target.value)}
                                        />
                                        <label className={`p-3 rounded-xl border-2 border-dashed transition-all cursor-pointer flex items-center justify-center shrink-0 ${isUploading ? 'bg-gray-100 border-gray-300' : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'}`}>
                                            {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                                            <input type="file" className="hidden" accept="application/pdf,image/*" onChange={handleFileUpload} disabled={isUploading} />
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 text-[10px] text-amber-700 font-bold uppercase leading-relaxed">
                                <AlertTriangle size={14} className="inline mr-1 mb-1"/> 
                                A alteração da validade impacta diretamente no status de bloqueio do fornecedor no monitoramento de missões.
                            </div>
                        </div>

                        <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                            <button onClick={() => setIsEditModalOpen(false)} className="px-6 py-2.5 border border-gray-300 rounded-xl text-sm font-bold text-gray-600 hover:bg-white transition-colors">Cancelar</button>
                            <button 
                                onClick={handleSaveAlvara} 
                                disabled={isSaving || isUploading}
                                className="px-8 py-2.5 bg-red-700 text-white rounded-xl font-bold text-sm shadow-lg hover:bg-red-800 disabled:opacity-50 flex items-center gap-2"
                            >
                                {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} SALVAR ALTERAÇÕES
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* HEADER */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-red-700 text-white rounded-2xl shadow-lg">
                        <ShieldCheck size={28} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Gestão de Alvarás PF</h2>
                        <p className="text-sm text-gray-500 font-medium">Controle rigoroso de conformidade legal de fornecedores</p>
                    </div>
                </div>
                <button onClick={fetchData} className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 text-gray-500">
                    <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* KPI CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Fornecedores</p>
                        <h3 className="text-3xl font-black text-gray-900">{stats.total}</h3>
                    </div>
                    <div className="p-2 bg-gray-50 text-gray-400 rounded-lg"><FileText size={24}/></div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between group cursor-pointer hover:border-green-200" onClick={() => setFilterStatus('VALIDO')}>
                    <div>
                        <p className="text-[10px] font-black text-green-600 uppercase tracking-widest">Alvarás Válidos</p>
                        <h3 className="text-3xl font-black text-green-700">{stats.validos}</h3>
                    </div>
                    <div className="p-2 bg-green-50 text-green-600 rounded-lg group-hover:scale-110 transition-transform"><CheckCircle2 size={24}/></div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between group cursor-pointer hover:border-red-200" onClick={() => setFilterStatus('VENCIDO')}>
                    <div>
                        <p className="text-[10px] font-black text-red-600 uppercase tracking-widest">Vencidos / Pendentes</p>
                        <h3 className="text-3xl font-black text-red-700">{stats.vencidos}</h3>
                    </div>
                    <div className="p-2 bg-red-50 text-red-600 rounded-lg group-hover:animate-pulse transition-transform"><AlertTriangle size={24}/></div>
                </div>
            </div>

            {/* FILTROS E TABELA */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col md:flex-row gap-4 justify-between items-center no-print">
                    <div className="relative w-full md:w-96">
                        <input 
                            type="text" 
                            placeholder="Buscar por nome ou CNPJ..." 
                            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-500/10"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    </div>
                    <div className="flex gap-2 bg-gray-200 p-1 rounded-lg">
                        <button onClick={() => setFilterStatus('ALL')} className={`px-4 py-1.5 text-xs font-bold rounded transition-all ${filterStatus === 'ALL' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Todos</button>
                        <button onClick={() => setFilterStatus('VENCIDO')} className={`px-4 py-1.5 text-xs font-bold rounded transition-all ${filterStatus === 'VENCIDO' ? 'bg-red-600 text-white shadow-sm' : 'text-gray-500 hover:text-red-600'}`}>Vencidos</button>
                        <button onClick={() => setFilterStatus('VALIDO')} className={`px-4 py-1.5 text-xs font-bold rounded transition-all ${filterStatus === 'VALIDO' ? 'bg-green-600 text-white shadow-sm' : 'text-gray-500 hover:text-green-600'}`}>Válidos</button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                <th className="px-6 py-4">Fornecedor / Parceiro</th>
                                <th className="px-6 py-4 text-center">Data de Vencimento</th>
                                <th className="px-6 py-4 text-center">Status PF</th>
                                <th className="px-6 py-4 text-center">Documento (PDF)</th>
                                <th className="px-6 py-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan={5} className="p-20 text-center"><Loader2 size={32} className="animate-spin text-red-600 mx-auto" /></td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={5} className="p-20 text-center text-gray-400 font-bold uppercase tracking-widest">Nenhum registro encontrado</td></tr>
                            ) : (
                                filtered.map(p => {
                                    const isVencido = p.status === 'Alvará Vencido';
                                    // Parse date correctly with timezone consideration
                                    let date = null;
                                    if (p.alvaraValidity) {
                                        const [year, month, day] = p.alvaraValidity.split('-').map(Number);
                                        date = new Date(year, month - 1, day);
                                    }
                                    
                                    return (
                                        <tr key={p.id} className={`hover:bg-gray-50 transition-colors ${isVencido ? 'bg-red-50/20' : ''}`}>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-gray-900 uppercase text-sm">{p.name}</div>
                                                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">CNPJ: {p.cnpj}</div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {date ? (
                                                    <div className={`inline-flex flex-col items-center p-2 rounded-lg border ${isVencido ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                                                        <Calendar size={14} className="mb-1" />
                                                        <span className="text-xs font-black font-mono">{date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-300 font-black text-[10px] uppercase">Pendente</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase border ${isVencido ? 'bg-red-600 text-white border-red-700 animate-pulse' : 'bg-green-50 text-green-700 border-green-200'}`}>
                                                    {isVencido ? <AlertTriangle size={12}/> : <CheckCircle2 size={12}/>}
                                                    {isVencido ? 'VENCIDO' : 'REGULAR'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {p.alvaraUrl ? (
                                                    <a href={p.alvaraUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase border border-indigo-200 hover:bg-indigo-100 transition-colors">
                                                        <Download size={14}/> VISUALIZAR PDF
                                                    </a>
                                                ) : (
                                                    <span className="text-gray-300 italic text-[10px] font-bold">Arquivo não anexado</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {canEditAlvara ? (
                                                    <button 
                                                        className="p-2 bg-white border border-gray-200 rounded-lg text-blue-600 hover:bg-blue-50 transition-all shadow-sm group"
                                                        title="Editar Alvará"
                                                        onClick={() => handleOpenEdit(p)}
                                                    >
                                                        <Pencil size={18} className="group-hover:scale-110 transition-transform" />
                                                    </button>
                                                ) : (
                                                    <div className="p-2 text-gray-300 cursor-not-allowed" title="Acesso restrito para Administrador/Avançado">
                                                        <Lock size={18} />
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 flex items-center gap-4">
                <div className="p-3 bg-indigo-600 text-white rounded-full">
                    <BellRing size={24} />
                </div>
                <div>
                    <h4 className="text-sm font-black text-indigo-900 uppercase">Notificações Automáticas</h4>
                    <p className="text-xs text-indigo-700 font-medium">O sistema emite alertas preventivos na Central de Notificações com 30, 15 e 5 dias de antecedência ao vencimento.</p>
                </div>
            </div>
        </div>
    );
};

export default AlvaraControl;
