import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { generateContent } from '../lib/gemini';
import { X, Loader2, CheckCircle2, AlertTriangle, FileText, Wrench, Package, BrainCircuit, DollarSign, History, Check, Search } from 'lucide-react';
import { ClientPriceTable } from '../types';
import { useNotification } from '../lib/NotificationContext';

interface Props {
    onClose: () => void;
    missions: any[]; 
    priceTables: ClientPriceTable[];
    clientName: string;
    onFixApplied: () => void;
}

interface FixSuggestion {
    id: string;
    mission_id: string;
    os_id: string;
    issue: string;
    changes: {
        revenue_value?: number;
        special_operation_type?: string;
        toll_value?: number;
        cost_value?: number;
        status?: string;
    };
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

const BillingAuditor: React.FC<Props> = ({ onClose, missions, priceTables, clientName, onFixApplied }) => {
    const { showNotification } = useNotification();
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [report, setReport] = useState<string | null>(null);
    const [fixes, setFixes] = useState<FixSuggestion[]>([]);
    const [progress, setProgress] = useState('');
    const [processingFixId, setProcessingFixId] = useState<string | null>(null);

    const runAudit = async () => {
        setIsAnalyzing(true);
        setReport(null);
        setFixes([]);
        setProgress('Acessando inteligência logística...');

        try {
            if (!missions || missions.length === 0) {
                setReport('<div class="p-4 text-gray-500">Nenhum dado carregado para auditar.</div>');
                setIsAnalyzing(false);
                return;
            }

            const dataToAnalyze = missions.map(m => ({
                id: m.id,
                km: (m.end_km || 0) - (m.start_km || 0),
                val: m.revenue_value, 
                toll: m.toll_value,
                type: m.special_operation_type || 'PADRAO'
            }));

            const tablesSummary = priceTables.map(t => 
                `TABELA '${t.operation_type}': Base R$${t.activation_fee}.`
            ).join('\n');

            const prompt = `
                ATUE COMO UM ENGENHEIRO DE DADOS SÊNIOR DO GRUPO TMSEG.
                Sua meta é validar o faturamento.
                DADOS: ${JSON.stringify(dataToAnalyze)}
                TABELAS: ${tablesSummary}
                RETORNE UM JSON com "html_summary" e "fixes".
            `;

            setProgress('IA auditando valores e medições...');

            const resultText = await generateContent({
                model: 'gemini-3-flash-preview',
                contents: { parts: [{ text: prompt }] },
                config: { responseMimeType: "application/json" }
            }) || "{}";
            let result = JSON.parse(resultText);
            
            setReport(result.html_summary);
            setFixes((result.fixes || []).map((f: any) => ({
                ...f,
                id: Math.random().toString(36).substr(2, 9)
            })));

        } catch (e: any) {
            console.error(e);
            const errorMsg = typeof e === 'string' ? e : (e.message || "Erro de conexão");
            setReport(`<div class="text-red-600 font-bold p-4 bg-red-50 rounded border border-red-100 flex items-center gap-2"><AlertTriangle size={18}/> Erro ao processar auditoria: ${errorMsg}</div>`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const applyFix = async (fix: FixSuggestion) => {
        setProcessingFixId(fix.id);
        try {
            const { error } = await supabase
                .from('missions')
                .update(fix.changes)
                .eq('id', fix.mission_id);

            if (error) throw error;
            onFixApplied();
            setFixes(prev => prev.filter(f => f.id !== fix.id));
            showNotification('Auditado', `OS ${fix.os_id} corrigida com sucesso.`, 'success');
        } catch (e: any) {
            alert("Erro: " + (e.message || "Falha técnica"));
        } finally {
            setProcessingFixId(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-800">
                <div className="bg-gradient-to-r from-gray-900 via-black to-red-900 text-white p-6 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="bg-white/10 p-3 rounded-lg backdrop-blur-sm border border-white/10">
                            <BrainCircuit className="text-red-50" size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">Auditoria Logística Avançada</h2>
                            <p className="text-xs text-gray-400 mt-1 uppercase tracking-widest font-bold">Mecanismo de Inteligência</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={24}/></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-gray-50 flex flex-col lg:flex-row gap-6">
                    <div className="flex-1 space-y-6">
                        {!report && !isAnalyzing && (
                            <div className="flex flex-col items-center justify-center h-full text-center space-y-6 py-20 bg-white rounded-xl border-2 border-dashed border-gray-200">
                                <div className="p-4 bg-red-50 rounded-full text-red-600">
                                    <BrainCircuit size={48} />
                                </div>
                                <h3 className="text-lg font-black text-gray-900 uppercase">Pronto para Auditar</h3>
                                <button onClick={runAudit} className="px-8 py-3 bg-red-700 text-white rounded-xl font-bold shadow-lg flex items-center gap-2">
                                    <Search size={18}/> INICIAR AUDITORIA IA
                                </button>
                            </div>
                        )}
                        {isAnalyzing && (
                            <div className="flex flex-col items-center justify-center h-full space-y-6 py-20">
                                <Loader2 size={48} className="animate-spin text-red-600" />
                                <p className="text-lg font-black text-gray-800 animate-pulse uppercase">{progress}</p>
                            </div>
                        )}
                        {!isAnalyzing && report && (
                            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 h-full overflow-y-auto animate-in fade-in" dangerouslySetInnerHTML={{ __html: report }}>
                            </div>
                        )}
                    </div>

                    {fixes.length > 0 && (
                        <div className="lg:w-1/3 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
                            <div className="bg-red-50 p-4 border-b border-red-100 flex justify-between items-center">
                                <h3 className="text-sm font-black text-red-800 uppercase flex items-center gap-2">
                                    <Wrench size={16} /> Divergências ({fixes.length})
                                </h3>
                            </div>
                            <div className="overflow-y-auto p-4 space-y-3 flex-1 bg-gray-50">
                                {fixes.map((fix) => (
                                    <div key={fix.id} className="p-4 rounded-xl border border-gray-200 bg-white shadow-sm">
                                        <span className="text-[10px] font-black text-gray-500 bg-gray-100 px-2 py-1 rounded">OS: {fix.os_id}</span>
                                        <p className="text-xs font-bold text-gray-700 leading-tight my-2">{fix.issue}</p>
                                        <button onClick={() => applyFix(fix)} disabled={processingFixId === fix.id} className="w-full py-2.5 bg-gray-900 hover:bg-black text-white rounded-lg text-xs font-black flex items-center justify-center gap-2">
                                            {processingFixId === fix.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                            APLICAR AJUSTE IA
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

export default BillingAuditor;