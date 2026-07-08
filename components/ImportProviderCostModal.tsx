
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Save, Loader2, FileSpreadsheet, AlertCircle, HelpCircle, UploadCloud, Zap, Wand2, Trash2, Search, RefreshCw } from 'lucide-react';
import { ProviderData } from '../types';
import { generateContent } from '../lib/gemini';
import { optimizeImageForAI } from '../lib/imageForAI';
import { googleMapsApiKey } from '../lib/maps';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  fixedProviderName?: string; 
}

const LABEL_CLASS = "text-[10px] font-black uppercase text-gray-400 mb-1.5 block";

const ImportProviderCostModal: React.FC<Props> = ({ onClose, onSuccess, fixedProviderName }) => {
  const [providers, setProviders] = useState<ProviderData[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [tableName, setTableName] = useState(''); 
  const [pasteData, setPasteData] = useState('');
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [retryConfig, setRetryConfig] = useState<{ payload: any, isFile: boolean } | null>(null);
  const [existingOperations, setExistingOperations] = useState<Set<string>>(new Set());
  const [tableSearchTerm, setTableSearchTerm] = useState('');

  useEffect(() => {
    supabase.from('providers').select('id, name').neq('status', 'Bloqueado').order('name')
      .then(({ data }) => {
        if (data) {
            setProviders(data as any);
            if (fixedProviderName) {
                const match = data.find(p => p.name.toUpperCase() === fixedProviderName.toUpperCase());
                if (match) setSelectedProvider(match.id.toString());
            }
        }
      });
  }, [fixedProviderName]);

  useEffect(() => {
      const providerName = fixedProviderName || providers.find(p => p.id.toString() === selectedProvider)?.name;
      if (providerName) {
          supabase.from('provider_cost_tables')
              .select('operation_type')
              .eq('provider', providerName)
              .then(({ data }) => {
                  if (data) {
                      setExistingOperations(new Set<string>(data.map((d: any) => d.operation_type.toUpperCase())));
                  }
              });
      } else {
          setExistingOperations(new Set());
      }
  }, [selectedProvider, providers, fixedProviderName]);

  const handleClear = () => {
      setFileName('');
      setPasteData('');
      setParsedData([]);
      setError('');
      setTableSearchTerm('');
      setIsAnalyzing(false);
      setRetryConfig(null);
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
  };

  const handleRowChange = (index: number, field: string, value: any) => {
      const newData = [...parsedData];
      newData[index] = { ...newData[index], [field]: value };
      setParsedData(newData);
  };

  const handleRemoveRow = (index: number) => {
      const newData = [...parsedData];
      newData.splice(index, 1);
      setParsedData(newData);
  };

  const handleAnalyzeWithAI = async (inputPayload: string | { mimeType: string; data: string }, isFile = false) => {
      if (!selectedProvider && !fixedProviderName) {
          setError("Por favor, selecione um fornecedor antes de processar.");
          return;
      }

      setIsAnalyzing(true);
      setError('');
      setParsedData([]);
      setRetryConfig({ payload: inputPayload, isFile });

      try {
          const prompt = `Analise a tabela de custos e extraia os dados estruturados em JSON. Priorize rotas "ORIGEM X DESTINO".`;

          let contentPart: any;
          if (isFile && typeof inputPayload !== 'string') {
             contentPart = { inlineData: { mimeType: inputPayload.mimeType, data: inputPayload.data } };
          } else if (typeof inputPayload === 'string') {
             contentPart = { text: `Texto extraído:\n${inputPayload}` };
          }

          const resultText = await generateContent({
              model: 'gemini-3-flash-preview', 
              contents: { parts: [ contentPart, { text: prompt } ] },
              config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            description: { type: "STRING" },
                            km: { type: "NUMBER" },
                            hours: { type: "NUMBER" },
                            activation: { type: "NUMBER" },
                            extraKm: { type: "NUMBER" },
                            extraHour: { type: "NUMBER" },
                            cancellation: { type: "NUMBER" }
                        },
                        required: ["description", "km", "hours", "activation", "extraKm", "extraHour", "cancellation"]
                    }
                }
              }
          });

          const data = JSON.parse(resultText);

          if (Array.isArray(data) && data.length > 0) {
              const regionPrefix = tableName ? `${tableName.toUpperCase()} - ` : '';
              let duplicateCount = 0;

              const processedData = data.map(item => ({
                  ...item,
                  description: item.description || `ATÉ ${item.km} KM`
              })).filter(item => {
                  const potentialKey = (regionPrefix + item.description).toUpperCase();
                  if (existingOperations.has(potentialKey)) {
                      duplicateCount++;
                      return false;
                  }
                  return true;
              });

              if (duplicateCount > 0) setError(`Nota: ${duplicateCount} registros ignorados (já existem).`);
              setParsedData(processedData);
          } else {
              throw new Error("Nenhuma linha de custo identificada.");
          }
      } catch (err: any) {
          setError(`Falha na análise: ${err.message}`);
      } finally {
          setIsAnalyzing(false);
      }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';
      setFileName(file.name);
      try {
          // Otimiza imagens antes da IA (mais rápido); PDFs/planilhas passam intactos.
          const aiImage = await optimizeImageForAI(file);
          await handleAnalyzeWithAI({ mimeType: aiImage.mimeType, data: aiImage.data }, true);
      } catch (e: any) { setError(e.message); }
  };

  const handleTextAnalyze = () => {
      if (!pasteData.trim()) {
          setError("Digite ou cole o texto primeiro.");
          return;
      }
      handleAnalyzeWithAI(pasteData, false);
  };

  const handleSave = async () => {
      const providerName = fixedProviderName || providers.find(p => p.id.toString() === selectedProvider)?.name;
      if (!providerName) return setError("Erro: Nome do fornecedor não identificado.");
      if (parsedData.length === 0) return setError("Nenhum documento lido para importar.");

      setIsSaving(true);
      try {
          const regionPrefix = tableName ? `${tableName.toUpperCase()} - ` : '';
          const payload = parsedData.map(item => ({
              provider: providerName,
              operation_type: (regionPrefix + item.description).toUpperCase(),
              activation_cost: parseFloat(item.activation) || 0,
              franchise_hours: parseFloat(item.hours) || 0,
              franchise_km: parseFloat(item.km) || 0,
              cost_per_extra_km: parseFloat(item.extraKm) || 0,
              cost_per_extra_hour: parseFloat(item.extraHour) || 0,
              cancellation_fee: parseFloat(item.cancellation) || 0,
              created_at: new Date().toISOString()
          }));

          const { error: insertError } = await supabase.from('provider_cost_tables').insert(payload);
          if (insertError) throw insertError;

          onSuccess();
          onClose();
          alert(`Sucesso! ${payload.length} itens gravados.`);
      } catch (err: any) {
          setError(err.message || "Erro ao salvar no banco.");
      } finally {
          setIsSaving(false);
      }
  };

  const displayedData = parsedData.filter(row => 
      (row.description || '').toLowerCase().includes(tableSearchTerm.toLowerCase()) ||
      (row.activation?.toString() || '').includes(tableSearchTerm)
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-2xl">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <FileSpreadsheet className="text-indigo-600" /> Importar Custos {fixedProviderName ? `- ${fixedProviderName}` : ''}
                </h3>
                <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100 text-sm text-indigo-800 flex gap-3">
                    <HelpCircle className="shrink-0 mt-0.5" size={18} />
                    <div>
                        <p className="font-bold mb-1">IA Inteligente (V3) - Proteção de Duplicidade:</p>
                        <ul className="list-disc pl-4 space-y-1 text-xs">
                            <li>Reconhece rotas e evita duplicar o que já existe para <strong>{fixedProviderName || 'este fornecedor'}</strong>.</li>
                        </ul>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {!fixedProviderName && (
                        <div>
                            <label className={LABEL_CLASS}>FORNECEDOR</label>
                            <select className="w-full p-2.5 bg-white border border-gray-300 rounded-lg outline-none font-bold text-gray-700" value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)}>
                                <option value="">Selecione...</option>
                                {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                    )}
                    <div>
                        <label className={LABEL_CLASS}>DESCRIÇÃO ADICIONAL / PREFIXO</label>
                        <input type="text" className="w-full p-2.5 bg-white border border-gray-300 rounded-lg outline-none uppercase font-medium" placeholder="Ex: TABELA SUDESTE" value={tableName} onChange={e => setTableName(e.target.value.toUpperCase())} />
                    </div>
                </div>

                <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-all group ${isAnalyzing ? 'border-indigo-300 bg-indigo-50' : 'border-indigo-200 bg-indigo-50/50 hover:border-indigo-400 hover:bg-indigo-100'}`}>
                    <input type="file" accept="image/*,application/pdf" onChange={handleFileUpload} className="hidden" id="file-upload" disabled={isAnalyzing} />
                    <label htmlFor="file-upload" className={`flex flex-col items-center justify-center gap-3 cursor-pointer ${isAnalyzing ? 'cursor-wait' : ''}`}>
                        {isAnalyzing && fileName ? (
                            <>
                                <Loader2 size={48} className="text-indigo-600 animate-spin" />
                                <div>
                                    <p className="font-bold text-indigo-800 text-lg">Processando...</p>
                                    <p className="text-sm text-indigo-600">Lendo: {fileName}</p>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="p-4 bg-white rounded-full shadow-md group-hover:scale-110 transition-transform">
                                    <UploadCloud size={32} className="text-indigo-600" />
                                </div>
                                <div>
                                    <p className="font-bold text-indigo-900 text-lg">Clique para enviar Tabela</p>
                                    <p className="text-sm text-indigo-600 font-medium">Suporta PDF ou Imagens (JPG, PNG)</p>
                                </div>
                            </>
                        )}
                    </label>
                </div>

                <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
                    <div className="relative flex justify-center"><span className="px-3 bg-white text-xs text-gray-400 font-bold uppercase">OU DIGITE MANUALMENTE</span></div>
                </div>

                <div>
                    <div className="relative">
                        <textarea className="w-full h-32 p-3 bg-gray-50 border border-gray-300 rounded-lg outline-none font-mono text-xs mb-2 resize-none" placeholder="Cole aqui os dados copiados de um email, excel ou site..." value={pasteData} onChange={e => setPasteData(e.target.value)} disabled={isAnalyzing} />
                        {isAnalyzing && !fileName && (
                            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-lg">
                                <div className="flex flex-col items-center">
                                    <Loader2 size={24} className="animate-spin text-indigo-600 mb-2"/>
                                    <span className="text-xs font-bold text-indigo-800">Analisando texto...</span>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end gap-2">
                         <button type="button" onClick={handleClear} className="px-4 py-2 bg-gray-200 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-300 transition-colors" title="Limpar tudo">
                            <Trash2 size={14} />
                        </button>
                        <button type="button" onClick={handleTextAnalyze} disabled={!pasteData.trim() || isAnalyzing} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm disabled:opacity-50">
                            <Wand2 size={14} /> Ler com IA
                        </button>
                    </div>
                </div>

                {error && <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-xs font-bold border border-red-100 animate-in slide-in-from-left-2"><AlertCircle size={16} /> {error}</div>}

                {parsedData.length > 0 && (
                    <div className="border rounded-lg overflow-hidden animate-in fade-in slide-in-from-bottom-4 shadow-sm">
                        <div className="bg-green-50 px-4 py-3 border-b border-green-100 font-bold text-xs text-green-800 flex justify-between items-center">
                            <span className="flex items-center gap-2"><Zap size={14} className="text-green-600"/> Dados Reconhecidos ({displayedData.length})</span>
                            <input type="text" placeholder="Filtrar..." className="pl-2 pr-2 py-1 rounded text-[10px] border outline-none focus:border-green-400" value={tableSearchTerm} onChange={e => setTableSearchTerm(e.target.value)} />
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                            <table className="w-full text-left text-[10px]">
                                <thead className="bg-white sticky top-0 border-b font-black uppercase z-10 shadow-sm">
                                    <tr><th className="p-2 w-[25%]">DESCRIÇÃO</th><th className="p-2 w-[15%]">BASE R$</th><th className="p-2 w-[10%]">KM</th><th className="p-2 w-[10%]">H</th><th className="p-2 w-[10%]">KM+</th><th className="p-2 w-[10%]">H+</th><th className="p-2 w-[10%]">CANCEL</th><th className="p-2 w-8"></th></tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 bg-white">
                                    {displayedData.map((row, i) => (
                                        <tr key={i} className="hover:bg-gray-50 group">
                                            <td className="p-1"><input type="text" className="w-full p-1 border border-transparent hover:border-gray-300 focus:border-indigo-500 rounded uppercase font-bold text-gray-700" value={row.description} onChange={e => handleRowChange(i, 'description', e.target.value)} /></td>
                                            <td className="p-1"><input type="number" step="0.01" className="w-full p-1 border border-transparent hover:border-gray-300 focus:border-indigo-500 rounded font-mono text-green-700 font-bold" value={row.activation} onChange={e => handleRowChange(i, 'activation', e.target.value)} /></td>
                                            <td className="p-1"><input type="number" className="w-full p-1 border border-transparent hover:border-gray-300 focus:border-indigo-500 rounded text-gray-600" value={row.km} onChange={e => handleRowChange(i, 'km', e.target.value)} /></td>
                                            <td className="p-1"><input type="number" className="w-full p-1 border border-transparent hover:border-gray-300 focus:border-indigo-500 rounded text-gray-600" value={row.hours} onChange={e => handleRowChange(i, 'hours', e.target.value)} /></td>
                                            <td className="p-1"><input type="number" step="0.01" className="w-full p-1 border border-transparent hover:border-gray-300 focus:border-indigo-500 rounded text-gray-600" value={row.extraKm} onChange={e => handleRowChange(i, 'extraKm', e.target.value)} /></td>
                                            <td className="p-1"><input type="number" step="0.01" className="w-full p-1 border border-transparent hover:border-gray-300 focus:border-indigo-500 rounded text-gray-600" value={row.extraHour} onChange={e => handleRowChange(i, 'extraHour', e.target.value)} /></td>
                                            <td className="p-1"><input type="number" step="0.01" className="w-full p-1 border border-transparent hover:border-gray-300 focus:border-indigo-500 rounded text-red-600 font-bold" value={row.cancellation} onChange={e => handleRowChange(i, 'cancellation', e.target.value)} /></td>
                                            <td className="p-1 text-center"><button onClick={() => handleRemoveRow(i)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={12} /></button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 rounded-b-2xl">
                <button onClick={onClose} className="px-5 py-2.5 border border-gray-300 rounded-lg text-xs font-black uppercase text-gray-600 hover:bg-white transition-colors">Cancelar</button>
                <button onClick={handleSave} disabled={isSaving || parsedData.length === 0} className="flex items-center gap-2 px-8 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-black shadow-lg disabled:opacity-50 uppercase transition-all active:scale-95">
                    {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Confirmar Importação
                </button>
            </div>
        </div>
    </div>
  );
};

export default ImportProviderCostModal;
