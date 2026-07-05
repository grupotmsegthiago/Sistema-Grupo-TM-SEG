import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Save, Loader2, FileSpreadsheet, AlertCircle, HelpCircle, UploadCloud, Zap, Wand2, Trash2, Search, MapPin, RefreshCw } from 'lucide-react';
import { Client } from '../types';
import { GoogleGenAI, Type } from "@google/genai";
import { googleMapsApiKey } from '../lib/maps';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  fixedClientName?: string; 
}

const REGIONS = ['NORTE', 'NORDESTE', 'CENTRO-OESTE', 'SUDESTE', 'SUL'];

const ImportClientPriceModal: React.FC<Props> = ({ onClose, onSuccess, fixedClientName }) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
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
    supabase.from('clients').select('id, name').eq('status', 'Ativo').order('name')
      .then(({ data }) => {
        if (data) {
            setClients(data as any);
            if (fixedClientName) {
                const match = data.find(c => c.name.toUpperCase() === fixedClientName.toUpperCase());
                if (match) setSelectedClient(match.id.toString());
            }
        }
      });
  }, [fixedClientName]);

  useEffect(() => {
      const clientName = fixedClientName || clients.find(c => c.id.toString() === selectedClient)?.name;
      if (clientName) {
          supabase.from('client_price_tables')
              .select('operation_type')
              .eq('client', clientName)
              .then(({ data }) => {
                  if (data) {
                      setExistingOperations(new Set<string>(data.map((d: any) => d.operation_type.toUpperCase())));
                  }
              });
      } else {
          setExistingOperations(new Set());
      }
  }, [selectedClient, clients, fixedClientName]);

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
      if (!selectedClient && !fixedClientName) {
          setError("Por favor, selecione um cliente antes de processar.");
          return;
      }
      setIsAnalyzing(true);
      setError('');
      setParsedData([]);
      setRetryConfig({ payload: inputPayload, isFile });

      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const prompt = `Analise a tabela de faturamento e extraia os dados estruturados em JSON.`;

          let contentPart: any;
          if (isFile && typeof inputPayload !== 'string') {
             contentPart = { inlineData: { mimeType: inputPayload.mimeType, data: inputPayload.data } };
          } else if (typeof inputPayload === 'string') {
             contentPart = { text: `Texto extraído:\n${inputPayload}` };
          }

          const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview', 
              contents: { parts: [ contentPart, { text: prompt } ] },
              config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            description: { type: Type.STRING },
                            km: { type: Type.NUMBER },
                            hours: { type: Type.NUMBER },
                            activation: { type: Type.NUMBER },
                            extraKm: { type: Type.NUMBER },
                            extraHour: { type: Type.NUMBER }
                        },
                        required: ["description", "km", "hours", "activation", "extraKm", "extraHour"]
                    }
                }
              }
          });

          const data = JSON.parse(response.text);

          if (Array.isArray(data) && data.length > 0) {
              let prefix = '';
              if (selectedRegion) prefix += `${selectedRegion} - `;
              if (tableName) prefix += `${tableName.toUpperCase()} - `;

              let duplicateCount = 0;
              const processedData = data.map(item => ({
                  ...item,
                  description: item.description || `ATÉ ${item.km} KM`
              })).filter(item => {
                  const potentialKey = (prefix + item.description).toUpperCase();
                  if (existingOperations.has(potentialKey)) {
                      duplicateCount++;
                      return false;
                  }
                  return true;
              });

              if (duplicateCount > 0) setError(`Nota: ${duplicateCount} itens ignorados por duplicidade.`);
              setParsedData(processedData);
          } else {
              throw new Error("Nenhum dado identificado.");
          }
      } catch (err: any) {
          setError(`Erro: ${err.message}`);
      } finally {
          setIsAnalyzing(false);
      }
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';
      setFileName(file.name);
      try {
          const base64Data = await blobToBase64(file);
          await handleAnalyzeWithAI({ mimeType: file.type, data: base64Data }, true);
      } catch (e: any) { setError(e.message); }
  };

  const handleTextAnalyze = () => {
      if (!pasteData.trim()) return;
      handleAnalyzeWithAI(pasteData, false);
  };

  const handleSave = async () => {
      const clientName = fixedClientName || clients.find(c => c.id.toString() === selectedClient)?.name;
      if (!clientName) return setError("Erro: Cliente não identificado.");
      if (parsedData.length === 0) return setError("Nenhum dado.");

      setIsSaving(true);
      try {
          let prefix = '';
          if (selectedRegion) prefix += `${selectedRegion} - `;
          if (tableName) prefix += `${tableName.toUpperCase()} - `;

          const payload = parsedData.map(item => ({
              client: clientName,
              operation_type: (prefix + item.description).toUpperCase(),
              activation_fee: parseFloat(item.activation) || 0,
              franchise_hours: parseFloat(item.hours) || 0,
              franchise_km: parseFloat(item.km) || 0,
              price_per_extra_km: parseFloat(item.extraKm) || 0,
              price_per_extra_hour: parseFloat(item.extraHour) || 0,
              created_at: new Date().toISOString()
          }));

          const { error: insertError } = await supabase.from('client_price_tables').insert(payload);
          if (insertError) throw insertError;

          onSuccess();
          onClose();
          alert(`Sucesso! ${payload.length} itens gravados.`);
      } catch (err: any) {
          setError(err.message || "Erro ao salvar.");
      } finally {
          setIsSaving(false);
      }
  };

  const displayedData = parsedData.filter(row => 
      (row.description || '').toLowerCase().includes(tableSearchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50 rounded-t-2xl">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <FileSpreadsheet className="text-green-600" /> Importar Faturamento {fixedClientName ? `- ${fixedClientName}` : ''}
                </h3>
                <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800 flex gap-3 text-xs">
                    <HelpCircle className="shrink-0 mt-0.5" size={18} />
                    <p>A IA irá extrair os dados da imagem ou texto. Você poderá editar os valores abaixo antes de confirmar a gravação definitiva.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {!fixedClientName && (
                        <div>
                            <label className="text-[10px] font-black uppercase text-gray-400 mb-1 block">CLIENTE</label>
                            <select className="w-full p-2 border rounded-lg outline-none font-bold text-gray-700" value={selectedClient} onChange={e => setSelectedClient(e.target.value)}>
                                <option value="">Selecione...</option>
                                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                    )}
                    <div>
                        <label className="text-[10px] font-black uppercase text-gray-400 mb-1 block">REGIÃO (Prefixo)</label>
                        <select className="w-full p-2 border rounded-lg outline-none font-bold text-gray-700 uppercase" value={selectedRegion} onChange={e => setSelectedRegion(e.target.value)}>
                            <option value="">-- Selecione a Região --</option>
                            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase text-gray-400 mb-1 block">DESCRIÇÃO ADICIONAL</label>
                        <input type="text" className="w-full p-2 border rounded-lg outline-none" placeholder="Ex: TABELA CARRETAS" value={tableName} onChange={e => setTableName(e.target.value.toUpperCase())} />
                    </div>
                </div>
                <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-all group ${isAnalyzing ? 'border-indigo-300 bg-indigo-50' : 'border-indigo-200 bg-indigo-50/50 hover:border-indigo-400 hover:bg-indigo-100'}`}>
                    <input type="file" accept="image/*,application/pdf" onChange={handleFileUpload} className="hidden" id="file-upload" disabled={isAnalyzing} />
                    <label htmlFor="file-upload" className="flex flex-col items-center justify-center gap-3 cursor-pointer">
                        {isAnalyzing ? <Loader2 size={48} className="text-indigo-600 animate-spin" /> : <><UploadCloud size={32} className="text-indigo-600" /><p className="font-bold text-indigo-900">Enviar Documento/Imagem</p></>}
                    </label>
                </div>
                <div>
                    <textarea className="w-full h-32 p-3 bg-gray-50 border rounded-lg outline-none font-mono text-[10px] mb-2" placeholder="Cole aqui..." value={pasteData} onChange={e => setPasteData(e.target.value)} disabled={isAnalyzing} />
                    <div className="flex justify-end"><button type="button" onClick={handleTextAnalyze} disabled={!pasteData.trim() || isAnalyzing} className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg disabled:opacity-50"><Wand2 className="inline mr-1" size={14} /> Ler com IA</button></div>
                </div>
                {error && <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-xs font-bold border border-red-100 animate-pulse"><AlertCircle size={16} /> {error}</div>}
                {parsedData.length > 0 && (
                    <div className="border rounded-lg overflow-hidden animate-in slide-in-from-bottom-2">
                        <div className="bg-green-50 px-4 py-3 border-b font-bold text-xs text-green-800 flex justify-between items-center">
                            <span>Dados Reconhecidos ({displayedData.length})</span>
                            <input type="text" placeholder="Filtrar..." className="pl-7 pr-2 py-1 rounded text-[10px] border" value={tableSearchTerm} onChange={e => setTableSearchTerm(e.target.value)} />
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                            <table className="w-full text-left text-[10px]">
                                <thead className="bg-white sticky top-0 border-b font-black uppercase">
                                    <tr><th className="p-2 w-[35%]">DESCRIÇÃO</th><th className="p-2 w-[15%]">BASE</th><th className="p-2 w-[10%]">KM</th><th className="p-2 w-[10%]">H</th><th className="p-2 w-[10%]">EXC KM</th><th className="p-2 w-[10%]">EXC H</th><th className="p-2 w-8"></th></tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 bg-white">
                                    {displayedData.map((row, i) => (
                                        <tr key={i} className="hover:bg-gray-50">
                                            <td className="p-1"><input type="text" className="w-full p-1 border border-transparent focus:border-green-300 rounded uppercase font-bold" value={row.description} onChange={e => handleRowChange(i, 'description', e.target.value)} /></td>
                                            <td className="p-1"><input type="number" step="0.01" className="w-full p-1 border border-transparent focus:border-green-300 rounded font-mono text-green-700 font-bold" value={row.activation} onChange={e => handleRowChange(i, 'activation', e.target.value)} /></td>
                                            <td className="p-1"><input type="number" className="w-full p-1 border border-transparent focus:border-green-300 rounded" value={row.km} onChange={e => handleRowChange(i, 'km', e.target.value)} /></td>
                                            <td className="p-1"><input type="number" className="w-full p-1 border border-transparent focus:border-green-300 rounded" value={row.hours} onChange={e => handleRowChange(i, 'hours', e.target.value)} /></td>
                                            <td className="p-1"><input type="number" step="0.01" className="w-full p-1 border border-transparent focus:border-green-300 rounded" value={row.extraKm} onChange={e => handleRowChange(i, 'extraKm', e.target.value)} /></td>
                                            <td className="p-1"><input type="number" step="0.01" className="w-full p-1 border border-transparent focus:border-green-300 rounded" value={row.extraHour} onChange={e => handleRowChange(i, 'extraHour', e.target.value)} /></td>
                                            <td className="p-1 text-center"><button onClick={() => handleRemoveRow(i)} className="text-gray-300 hover:text-red-500"><Trash2 size={12} /></button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
            <div className="p-6 border-t flex justify-end gap-3 bg-gray-50 rounded-b-2xl">
                <button onClick={onClose} className="px-5 py-2.5 border rounded-lg text-xs font-black uppercase">Cancelar</button>
                <button onClick={handleSave} disabled={isSaving || parsedData.length === 0} className="flex items-center gap-2 px-8 py-2.5 bg-green-600 text-white rounded-lg text-xs font-black shadow-lg disabled:opacity-50 uppercase">
                    {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Confirmar Importação
                </button>
            </div>
        </div>
    </div>
  );
};

export default ImportClientPriceModal;