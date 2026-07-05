import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, FileText, UploadCloud, CheckCircle2, AlertOctagon, Loader2, Plus, ArrowRight, DollarSign, Tag, Calendar, Banknote, Info, AlertCircle, ShieldCheck, Trash2, Undo2, ChevronDown, Lock, Sparkles, AlertTriangle } from 'lucide-react';
import { FinancialAccount, FinancialCategory, TransactionType } from '../types';
import { useNotification } from '../lib/NotificationContext';
import { GoogleGenAI, Type } from "@google/genai";

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

interface ReconciliationItem {
    id: string;
    date: string;
    description: string;
    amount: number;
    type: TransactionType;
    status: 'MATCHED' | 'MISSING';
    status_conciliacao: 'CONCILIADO' | 'DIVERGENTE';
    category_id?: string;
    category_name?: string;
    linked_transaction_id?: string;
}

const BankStatementImporter: React.FC<Props> = ({ onClose, onSuccess }) => {
  const { showNotification } = useNotification();
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');
  const [results, setResults] = useState<ReconciliationItem[]>([]);
  const [error, setError] = useState('');
  const [isProcessingAction, setIsProcessingAction] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('userData');
    if (storedUser) {
        const user = JSON.parse(storedUser);
        const role = (user.role || '').toLowerCase();
        if (role === 'administrador' || role === 'diretoria' || user.permissions?.includes('*')) {
            setHasPermission(true);
        } else {
            setHasPermission(false);
        }
    }

    supabase.from('financial_accounts').select('*').eq('status', 'Ativo').order('name').then(({ data }) => data && setAccounts(data as any));
    supabase.from('financial_categories').select('*').order('name').then(({ data }) => data && setCategories(data as any));
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) {
          if (selectedFile.size > 10 * 1024 * 1024) {
              setError("Arquivo muito grande. O limite é 10MB.");
              return;
          }
          setFile(selectedFile);
          setError('');
          setResults([]); 
      }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
    });
  };

  const analyze = async () => {
      if (!file || !selectedAccount || !hasPermission) return;
      
      setIsAnalyzing(true);
      setError('');
      setResults([]);
      setProgressLabel('Iniciando Visão Computacional (Gemini 3)...');

      try {
          const base64Data = await fileToBase64(file);
          const mimeType = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

          // Fix: Exclusively use process.env.API_KEY directly for initialization right before making an API call per guidelines
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          
          const prompt = `Analise este extrato bancário. Extraia TODAS as transações individuais (entradas e saídas). Ignore saldos e taxas de manutenção se possível.
          Retorne APENAS um JSON Array puro no formato:
          [
            {
              "date": "YYYY-MM-DD",
              "description": "NOME DO FAVORECIDO OU HISTORICO",
              "amount": 0.00,
              "type": "INCOME" ou "EXPENSE"
            }
          ]`;

          setProgressLabel('IA lendo o documento...');

          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { 
              parts: [
                { inlineData: { mimeType: mimeType, data: base64Data } }, 
                { text: prompt }
              ] 
            },
            config: { 
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    date: { type: Type.STRING },
                    description: { type: Type.STRING },
                    amount: { type: Type.NUMBER },
                    type: { type: Type.STRING }
                  },
                  required: ["date", "description", "amount", "type"]
                }
              }
            }
          });

          const rawText = response.text;
          if (!rawText) throw new Error("A IA não retornou conteúdo. Tente outro arquivo.");

          const parsed = JSON.parse(rawText);
          
          if (!Array.isArray(parsed)) throw new Error("Formato de dados inválido retornado pela IA.");

          setProgressLabel('Cruzando dados com o banco TMSEG...');

          const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
          const { data: dbTrans } = await supabase
            .from('financial_transactions')
            .select('*')
            .eq('account_id', selectedAccount)
            .gte('due_date', ninetyDaysAgo);

          const reconciliation: ReconciliationItem[] = parsed.map((item: any) => {
            const match = dbTrans?.find(db => 
              Math.abs(db.amount - Math.abs(item.amount)) < 0.05 && 
              db.type === item.type &&
              db.status === 'PAID'
            );

            return {
              id: Math.random().toString(36).substring(2, 9),
              date: item.date,
              description: item.description,
              amount: Math.abs(item.amount),
              type: item.type as TransactionType,
              status: match ? 'MATCHED' : 'MISSING',
              status_conciliacao: match ? 'CONCILIADO' : 'DIVERGENTE',
              category_id: match ? match.category_id : '',
              category_name: match ? match.category_name : '',
              linked_transaction_id: match ? match.id : undefined
            };
          });

          setResults(reconciliation);
          showNotification('Sucesso', 'Análise de extrato concluída com IA.', 'success');

      } catch (err: any) {
          console.error("ERRO CONCILIAÇÃO:", err);
          let userMsg = err.message || "Falha na análise.";
          setError(userMsg);

          // Fix: Handle key selection reset per GenAI guidelines
          if (userMsg.includes("Requested entity was not found.")) {
              if ((window as any).aistudio) {
                  (window as any).aistudio.openSelectKey();
              }
          }
      } finally {
          setIsAnalyzing(false);
          setProgressLabel('');
      }
  };

  const handleQuickLaunch = async (item: ReconciliationItem) => {
      if (!item.category_id) {
          showNotification('Atenção', 'Selecione uma categoria.', 'warning');
          return;
      }

      setIsProcessingAction(item.id);
      const account = accounts.find(a => a.id === selectedAccount);
      const category = categories.find(c => c.id === item.category_id);

      try {
          const { data, error: insErr } = await supabase.from('financial_transactions').insert([{
              description: item.description.toUpperCase() + " (CONCILIADO)",
              amount: item.amount,
              type: item.type,
              due_date: item.date,
              payment_date: item.date,
              status: 'PAID',
              account_id: selectedAccount,
              account_name: account?.name,
              category_id: item.category_id,
              category_name: category?.name,
              status_conciliacao: 'CONCILIADO',
              notes: 'Importado via Conciliação IA (Gemini 3)',
              created_by: JSON.parse(localStorage.getItem('userData') || '{}').name
          }]).select().single();

          if (insErr) throw insErr;

          setResults(prev => prev.map(r => r.id === item.id ? { 
              ...r, 
              status: 'MATCHED', 
              status_conciliacao: 'CONCILIADO',
              linked_transaction_id: data.id,
              category_name: category?.name 
          } : r));
          
          showNotification('Concluído', 'Lançamento registrado e conciliado.', 'success');
      } catch (err: any) {
          alert("Erro no lançamento: " + err.message);
      } finally {
          setIsProcessingAction(null);
      }
  };

  const handleUndoLaunch = async (item: ReconciliationItem) => {
      if (!item.linked_transaction_id) return;
      if (!confirm("Remover este lançamento?")) return;

      setIsProcessingAction(item.id);
      try {
          const { error: delErr } = await supabase.from('financial_transactions').delete().eq('id', item.linked_transaction_id);
          if (delErr) throw delErr;

          setResults(prev => prev.map(r => r.id === item.id ? { 
              ...r, 
              status: 'MISSING', 
              status_conciliacao: 'DIVERGENTE',
              linked_transaction_id: undefined,
              category_id: '',
              category_name: ''
          } : r));
          
          showNotification('Removido', 'Lançamento excluído.', 'info');
      } catch (err: any) {
          alert("Erro ao excluir: " + err.message);
      } finally {
          setIsProcessingAction(null);
      }
  };

  const handleCategoryChange = (index: number, catId: string) => {
      const newResults = [...results];
      newResults[index].category_id = catId;
      setResults(newResults);
  };

  if (hasPermission === false) {
      return (
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col p-10 items-center text-center border border-red-100">
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-4 border border-red-100">
                  <Lock size={40} className="text-red-600" />
              </div>
              <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Acesso Restrito</h3>
              <p className="text-gray-500 mt-2 text-sm">Módulo de conciliação exclusivo para administração.</p>
              <button onClick={onClose} className="mt-8 px-8 py-2.5 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all">Fechar</button>
          </div>
      );
  }

  return (
    <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300 border border-gray-200">
        <div className="p-6 bg-[#0f172a] text-white flex justify-between items-center relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
                <Banknote size={120} />
            </div>
            <div className="flex items-center gap-4 relative z-10">
                <div className="p-3 bg-indigo-500/20 rounded-xl border border-indigo-500/30">
                    <Sparkles className="text-indigo-400" size={28} />
                </div>
                <div>
                    <h3 className="text-xl font-black uppercase tracking-tight">Auditoria de Extratos (IA)</h3>
                    <p className="text-xs text-gray-400 font-medium">Extração de dados nativa via Gemini 3 Pro Vision.</p>
                </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors relative z-10"><X size={24}/></button>
        </div>

        <div className="p-8 space-y-6 overflow-y-auto bg-gray-50/50 flex-1">
            {error && (
                <div className="flex items-center gap-3 text-red-600 bg-red-50 p-4 rounded-xl border border-red-100 animate-in slide-in-from-top-2 shadow-sm">
                    <AlertCircle size={20} className="shrink-0" />
                    <div className="text-sm font-bold leading-relaxed">{error}</div>
                </div>
            )}

            {results.length === 0 ? (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase mb-1.5 block tracking-widest">1. Conta para Conciliar</label>
                            <select 
                                className="w-full p-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold text-gray-700 shadow-sm transition-all" 
                                value={selectedAccount} 
                                onChange={e => setSelectedAccount(e.target.value)}
                                disabled={isAnalyzing}
                            >
                                <option value="">Selecione a conta...</option>
                                {accounts.map(a => <option key={a.id} value={a.id}>{a.name} {a.bank_name ? `(${a.bank_name})` : ''}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase mb-1.5 block tracking-widest">2. Extrato Bancário (PDF/Imagem)</label>
                            <label className={`flex items-center justify-center p-3 border-2 border-dashed rounded-xl cursor-pointer transition-all h-[46px] shadow-sm ${file ? 'border-green-300 bg-green-50' : 'border-gray-300 bg-white hover:bg-gray-50'}`}>
                                <input type="file" className="hidden" accept="image/*,application/pdf" onChange={handleFileUpload} disabled={isAnalyzing} />
                                <UploadCloud size={20} className={`mr-2 ${file ? 'text-green-600' : 'text-gray-400'}`} />
                                <span className={`text-sm font-bold truncate max-w-[250px] ${file ? 'text-green-700' : 'text-gray-600'}`}>{file ? file.name : 'Escolher arquivo'}</span>
                            </label>
                        </div>
                    </div>

                    <button 
                        onClick={analyze} 
                        disabled={isAnalyzing || !file || !selectedAccount} 
                        className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
                    >
                        {isAnalyzing ? (
                            <>
                                <Loader2 size={24} className="animate-spin" />
                                <span>{progressLabel}</span>
                            </>
                        ) : (
                            <>
                                <ArrowRight size={24} />
                                <span>PROCESSAR COM IA LOCAL</span>
                            </>
                        )}
                    </button>
                </div>
            ) : (
                <div className="space-y-4 animate-in fade-in duration-500">
                    <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                                <FileText size={20}/>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Leitura IA Concluída</p>
                                <p className="text-sm font-bold text-gray-800">
                                    {results.filter(r => r.status === 'MISSING').length} lançamentos não encontrados / {results.length} processados.
                                </p>
                            </div>
                        </div>
                        <button onClick={() => { setResults([]); setFile(null); }} className="px-4 py-2 text-xs font-black text-indigo-600 hover:bg-indigo-50 rounded-lg border border-indigo-100 uppercase">Novo Arquivo</button>
                    </div>

                    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-gray-50 font-black text-gray-400 uppercase tracking-tighter border-b border-gray-100">
                                    <tr>
                                        <th className="p-4">Descrição no Extrato</th>
                                        <th className="p-4">Valor</th>
                                        <th className="p-4">Categoria</th>
                                        <th className="p-4 text-center">Auditoria</th>
                                        <th className="p-4 text-right">Ação</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white">
                                    {results.map((item, index) => (
                                        <tr key={item.id} className={`transition-all ${item.status === 'MATCHED' ? 'bg-gray-50/50 opacity-60' : 'bg-white hover:bg-gray-50/30'}`}>
                                            <td className="p-4">
                                                <div className="font-bold uppercase text-gray-800">{item.description}</div>
                                                <div className="text-[10px] font-mono text-gray-400 mt-0.5">{new Date(item.date).toLocaleDateString('pt-BR')}</div>
                                            </td>
                                            <td className={`p-4 font-black font-mono text-sm ${item.type === 'INCOME' ? 'text-green-600' : 'text-red-600'}`}>
                                                {item.type === 'INCOME' ? '+' : '-'} R$ {item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="p-4 min-w-[180px]">
                                                {item.status === 'MATCHED' ? (
                                                    <span className="text-[10px] font-bold text-gray-500 uppercase">{item.category_name}</span>
                                                ) : (
                                                    <div className="relative">
                                                        <select 
                                                            className="w-full p-2 bg-gray-50 border border-gray-200 rounded text-[10px] font-bold uppercase outline-none focus:border-indigo-500"
                                                            value={item.category_id}
                                                            onChange={(e) => handleCategoryChange(index, e.target.value)}
                                                        >
                                                            <option value="">Selecione...</option>
                                                            {categories.filter(c => c.type === item.type).map(cat => (
                                                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                                                            ))}
                                                        </select>
                                                        <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-4 text-center">
                                                {item.status_conciliacao === 'CONCILIADO' ? (
                                                    <span className="inline-flex items-center gap-1 text-[9px] font-black text-green-700 bg-green-100 px-2 py-0.5 rounded-full border border-green-200 uppercase">
                                                        <CheckCircle2 size={10}/> CONCILIADO
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-[9px] font-black text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200 uppercase">
                                                        <AlertTriangle size={10}/> DIVERGENTE
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-4 text-right">
                                                {item.status === 'MISSING' ? (
                                                    <button 
                                                        onClick={() => handleQuickLaunch(item)} 
                                                        disabled={isProcessingAction === item.id}
                                                        className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-black flex items-center gap-1.5 ml-auto hover:bg-indigo-700 shadow-md active:scale-95 transition-all uppercase disabled:opacity-50"
                                                    >
                                                        {isProcessingAction === item.id ? <Loader2 size={12} className="animate-spin"/> : <Plus size={12} strokeWidth={3}/>} 
                                                        LANÇAR
                                                    </button>
                                                ) : (
                                                    <button 
                                                        onClick={() => handleUndoLaunch(item)}
                                                        disabled={isProcessingAction === item.id}
                                                        className="px-3 py-1.5 bg-white border border-red-200 text-red-600 rounded-lg text-[10px] font-black flex items-center gap-1.5 ml-auto hover:bg-red-50 transition-all uppercase disabled:opacity-50"
                                                        title="Remover Lançamento"
                                                    >
                                                        {isProcessingAction === item.id ? <Loader2 size={12} className="animate-spin"/> : <Undo2 size={12} strokeWidth={3}/>}
                                                        ESTORNAR
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>

        <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-between items-center rounded-b-2xl">
            <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest flex items-center gap-2">
                <ShieldCheck size={14} className="text-indigo-500" /> Camada de Auditoria Segura (Gemini)
            </div>
            <div className="flex gap-3">
                <button onClick={onClose} className="px-6 py-2.5 bg-white border border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition-all uppercase text-xs">Sair</button>
                <button onClick={() => { onSuccess(); onClose(); }} className="px-6 py-2.5 bg-[#0f172a] text-white rounded-xl font-bold hover:bg-black shadow-lg uppercase text-xs tracking-wider transition-all">Concluir Sessão</button>
            </div>
        </div>
    </div>
  );
};

export default BankStatementImporter;