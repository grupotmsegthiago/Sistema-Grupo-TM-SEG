import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { generateContent } from '../lib/gemini';
import { X, ShieldAlert, Loader2, Search, CheckCircle2, AlertTriangle, FileText, Wrench, ArrowRight } from 'lucide-react';
import { FinancialTransaction } from '../types';

interface Props {
    onClose: () => void;
}

interface FixSuggestion {
    id: string;
    transaction_id: string;
    description: string;
    reason: string;
    changes: {
        category_name?: string;
        category_id?: string;
        description?: string;
        amount?: number;
    };
}

const FinancialAuditor: React.FC<Props> = ({ onClose }) => {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [report, setReport] = useState<string | null>(null);
    const [fixes, setFixes] = useState<FixSuggestion[]>([]);
    const [progress, setProgress] = useState('');
    const [processingFixId, setProcessingFixId] = useState<string | null>(null);

    const runAudit = async () => {
        setIsAnalyzing(true);
        setReport(null);
        setFixes([]);
        setProgress('Coletando dados financeiros...');

        try {
            const { data: transactions, error } = await supabase
                .from('financial_transactions')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) throw error;

            const { data: categories } = await supabase
                .from('financial_categories')
                .select('id, name, type');

            if (!transactions || transactions.length === 0) {
                setReport('<div class="p-4 text-gray-500">Nenhum lançamento encontrado para auditar.</div>');
                setIsAnalyzing(false);
                return;
            }

            setProgress('Consultando Agente Sênior (IA)...');

            const dataToAnalyze = transactions.map(t => ({
                id: t.id,
                date: t.due_date,
                desc: t.description,
                amount: t.amount,
                type: t.type,
                account: t.account_name || 'Sem Conta',
                category: t.category_name,
                notes: t.notes,
                user: (t as any).updated_by || t.created_by || 'Sistema'
            }));

            const validCategories = categories?.map(c => `${c.name} (ID: ${c.id})`).join(', ');

            const prompt = `
                ATUE COMO UM AUDITOR FINANCEIRO SÊNIOR E DBA (DATABASE ADMIN).
                Sua missão é analisar as transações e identificar erros. RETORNE UM JSON ESTRUTURADO.

                REGRAS DE CONTEXTO:
                1. "Pensão" deve ser ~R$ 800. Se for muito maior (ex: 17k), provavelmente é "Investimento" ou "Ajuste".
                2. Nomes de Contas: "TM SEGURANÇA" é o correto.
                
                CATEGORIAS VÁLIDAS NO SISTEMA: [${validCategories}]

                FORMATO DE RESPOSTA (JSON):
                {
                    "html_report": "String HTML",
                    "fixes": [{"transaction_id": "uuid", "reason": "texto", "changes": {"category_name": "Nome"}}]
                }
            `;

            const resultText = await generateContent({
                model: 'gemini-3-flash-preview',
                contents: { parts: [{ text: prompt }] },
                config: { responseMimeType: "application/json" }
            }) || "{}";
            const result = JSON.parse(resultText);
            
            setReport(result.html_report);
            setFixes((result.fixes || []).map((f: any) => ({
                ...f,
                id: Math.random().toString(36).substr(2, 9)
            })));

        } catch (e: any) {
            console.error(e);
            const errorMsg = typeof e === 'string' ? e : (e.message || "Erro interno");
            setReport(`<div class="text-red-600 font-bold p-4">Erro na auditoria: ${errorMsg}</div>`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const applyFix = async (fix: FixSuggestion) => {
        setProcessingFixId(fix.id);
        try {
            const { error } = await supabase
                .from('financial_transactions')
                .update(fix.changes)
                .eq('id', fix.transaction_id);

            if (error) throw error;

            setFixes(prev => prev.filter(f => f.id !== fix.id));
            alert("Correção aplicada com sucesso!");
        } catch (e: any) {
            alert("Erro ao aplicar correção: " + (e.message || "Erro desconhecido"));
        } finally {
            setProcessingFixId(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-700">
                <div className="bg-gray-900 text-white p-6 flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-3">
                            <ShieldAlert className="text-red-500" /> Auditor Financeiro (IA)
                        </h2>
                        <p className="text-sm text-gray-400 mt-1">Análise e Correção Automática</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full transition-colors"><X size={20}/></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-gray-50 flex flex-col lg:flex-row gap-6">
                    <div className="flex-1 space-y-6">
                        {!report && !isAnalyzing && (
                            <div className="flex flex-col items-center justify-center h-full text-center space-y-6 py-10">
                                <div className="bg-white p-6 rounded-full shadow-lg">
                                    <Search size={64} className="text-blue-600" />
                                </div>
                                <div className="max-w-md">
                                    <h3 className="text-lg font-bold text-gray-800 mb-2">Pronto para iniciar a varredura</h3>
                                    <p className="text-sm text-gray-600 mb-6">O Agente Financeiro irá analisar os lançamentos e sugerir correções automáticas.</p>
                                </div>
                                <button onClick={runAudit} className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg flex items-center gap-3">
                                    <FileText size={20} /> INICIAR AUDITORIA & CORREÇÃO
                                </button>
                            </div>
                        )}

                        {isAnalyzing && (
                            <div className="flex flex-col items-center justify-center h-full space-y-4 py-20">
                                <Loader2 size={48} className="animate-spin text-blue-600" />
                                <p className="text-lg font-bold text-gray-700 animate-pulse">{progress}</p>
                            </div>
                        )}

                        {report && (
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 max-w-none text-gray-800" dangerouslySetInnerHTML={{ __html: report }}>
                            </div>
                        )}
                    </div>

                    {fixes.length > 0 && (
                        <div className="lg:w-1/3 bg-white border-l border-gray-200 p-4 overflow-y-auto lg:max-h-[calc(90vh-100px)]">
                            <h3 className="text-sm font-bold text-gray-800 uppercase mb-4 flex items-center gap-2 sticky top-0 bg-white py-2 border-b border-gray-100 z-10">
                                <Wrench size={16} className="text-orange-500" /> Correções Sugeridas ({fixes.length})
                            </h3>
                            <div className="space-y-3">
                                {fixes.map((fix) => (
                                    <div key={fix.id} className="p-3 rounded-lg border border-orange-200 bg-orange-50 shadow-sm">
                                        <div className="flex items-start gap-2 mb-2">
                                            <AlertTriangle size={14} className="text-orange-600 shrink-0 mt-0.5" />
                                            <p className="text-xs font-bold text-orange-800 leading-tight">{fix.reason}</p>
                                        </div>
                                        <button onClick={() => applyFix(fix)} disabled={processingFixId === fix.id} className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                                            {processingFixId === fix.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                                            APLICAR CORREÇÃO
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FinancialAuditor;