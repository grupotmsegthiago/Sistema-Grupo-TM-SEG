
import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { X, Save, Loader2, FileSpreadsheet, AlertCircle, HelpCircle, UploadCloud, Zap, Wand2, Trash2 } from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

const ImportProviderModal: React.FC<Props> = ({ onClose, onSuccess }) => {
  const [pasteData, setPasteData] = useState('');
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');

  const handleClear = () => {
      setFileName('');
      setPasteData('');
      setParsedData([]);
      setError('');
      setIsAnalyzing(false);
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

  // --- IA VISION / TEXT ANALYSIS ---
  const handleAnalyzeWithAI = async (inputPayload: string | { mimeType: string; data: string }, isFile = false) => {
      setIsAnalyzing(true);
      setError('');
      setParsedData([]);

      try {
          // SDK Compliance: Initialize GoogleGenAI exclusively with process.env.API_KEY right before usage
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          
          const prompt = `
            Você é um assistente administrativo especializado em cadastro de empresas.
            Analise o documento ou texto fornecido (pode ser uma lista, uma ficha cadastral, cartão CNPJ ou planilha).
            
            Extraia os dados dos FORNECEDORES encontrados e retorne APENAS um JSON ARRAY estruturado.
            
            Regras:
            - Se houver múltiplos fornecedores, liste todos.
            - Ignore empresas que pareçam ser o "Cliente" ou o "Destinatário", foque nos prestadores de serviço/transportadoras/segurança.
            - Se o endereço estiver tudo junto, tente separar.
          `;

          let contentPart: any;
          
          if (isFile && typeof inputPayload !== 'string') {
             contentPart = { inlineData: { mimeType: inputPayload.mimeType, data: inputPayload.data } };
          } else if (typeof inputPayload === 'string') {
             contentPart = { text: `Texto para extração:\n${inputPayload}` };
          }

          const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview', 
              contents: {
                  parts: [ contentPart, { text: prompt } ]
              },
              config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            cnpj: { type: Type.STRING, description: "Formatado 00.000.000/0000-00" },
                            name: { type: Type.STRING, description: "Razão Social completa" },
                            trading_name: { type: Type.STRING, description: "Nome Fantasia. Se não houver, repita a Razão Social" },
                            contact_name: { type: Type.STRING, description: "Nome do responsável/contato, se houver" },
                            address: { type: Type.STRING, description: "Logradouro + Número + Bairro" },
                            city: { type: Type.STRING, description: "Cidade" },
                            state: { type: Type.STRING, description: "UF - Sigla de 2 letras" },
                            type: { type: Type.STRING, description: "Escolta Caracterizada, Pronta Resposta, Escolta Velada ou Moto Velada" }
                        },
                        required: ["cnpj", "name", "trading_name", "type"]
                    }
                }
              }
          });

          const text = response.text;
          if (!text) throw new Error("A IA não retornou nenhum dado legível.");
          
          let data;
          try {
              data = JSON.parse(text);
          } catch (jsonErr) {
              console.error("Erro parse JSON:", text);
              throw new Error("Falha ao estruturar os dados. Tente uma imagem mais clara ou verifique o texto.");
          }

          if (Array.isArray(data) && data.length > 0) {
              setParsedData(data);
          } else if (typeof data === 'object' && (data as any).cnpj) {
              setParsedData([data]); // Se retornou um objeto único, encapsula em array
          } else {
              throw new Error("Nenhum fornecedor identificado no documento.");
          }

      } catch (err: any) {
          console.error("Erro IA:", err);
          let msg = err.message || "Erro desconhecido.";
          setError(`Falha na análise: ${msg}`);
      } finally {
          setIsAnalyzing(false);
      }
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const base64Data = base64String.split(',')[1]; 
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';
      setFileName(file.name);
      setParsedData([]);
      setError('');

      try {
          const base64Data = await blobToBase64(file);
          await handleAnalyzeWithAI({ mimeType: file.type, data: base64Data }, true);
      } catch (e: any) {
          setError("Erro ao ler arquivo: " + e.message);
      }
  };

  const handleTextAnalyze = () => {
      if (!pasteData.trim()) {
          setError("Digite ou cole o texto primeiro.");
          return;
      }
      handleAnalyzeWithAI(pasteData, false);
  };

  const handleSave = async () => {
      if (parsedData.length === 0) return setError("Nenhum dado para importar.");

      setIsSaving(true);
      try {
          const payload = parsedData.map(item => ({
              name: item.name?.toUpperCase(),
              trading_name: item.trading_name?.toUpperCase(),
              cnpj: item.cnpj,
              contact_name: item.contact_name,
              address: item.address,
              city: item.city,
              state: item.state?.toUpperCase().substring(0, 2),
              type: item.type,
              status: 'Ativo',
              created_at: new Date().toISOString()
          }));

          const { error: insertError } = await supabase.from('providers').insert(payload);
          if (insertError) throw insertError;

          onSuccess();
          onClose();
          alert(`${payload.length} fornecedores importados com sucesso!`);

      } catch (err: any) {
          console.error(err);
          let msg = err.message;
          if (msg.includes('duplicate key')) msg = "Alguns CNPJs já estão cadastrados no sistema.";
          setError(msg || "Erro ao salvar no banco de dados.");
      } finally {
          setIsSaving(false);
      }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto flex flex-col">
            
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-2xl">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <FileSpreadsheet className="text-indigo-600" /> Importar Fornecedores com IA
                </h3>
                <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X size={20}/></button>
            </div>

            <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                
                <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100 text-sm text-indigo-800 flex gap-3">
                    <HelpCircle className="shrink-0 mt-0.5" size={18} />
                    <div>
                        <p className="font-bold mb-1">Como funciona?</p>
                        <p>Envie uma ficha cadastral, cartão CNPJ, planilha ou lista de prestadores. A IA irá ler, extrair os dados e você poderá <strong>editar a tabela abaixo</strong> antes de salvar.</p>
                    </div>
                </div>

                {/* AREA DE UPLOAD DE ARQUIVO */}
                <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-all group ${isAnalyzing ? 'border-indigo-300 bg-indigo-50' : 'border-indigo-200 bg-indigo-50/50 hover:border-indigo-400 hover:bg-indigo-100'}`}>
                    <input 
                        type="file" 
                        accept="image/*,application/pdf" 
                        onChange={handleFileUpload} 
                        className="hidden" 
                        id="file-upload" 
                        disabled={isAnalyzing}
                    />
                    <label htmlFor="file-upload" className={`flex flex-col items-center justify-center gap-3 cursor-pointer ${isAnalyzing ? 'cursor-wait' : ''}`}>
                        {isAnalyzing && fileName ? (
                            <>
                                <Loader2 size={48} className="text-indigo-600 animate-spin" />
                                <div>
                                    <p className="font-bold text-indigo-800 text-lg">Processando Documento...</p>
                                    <p className="text-sm text-indigo-600">Lendo: {fileName}</p>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="p-4 bg-white rounded-full shadow-md group-hover:scale-110 transition-transform">
                                    <UploadCloud size={32} className="text-indigo-600" />
                                </div>
                                <div>
                                    <p className="font-bold text-indigo-900 text-lg">Clique para enviar Arquivo</p>
                                    <p className="text-sm text-indigo-600 font-medium">Suporta PDF ou Imagens (JPG, PNG)</p>
                                </div>
                            </>
                        )}
                    </label>
                </div>

                {/* DIVISOR */}
                <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
                    <div className="relative flex justify-center"><span className="px-3 bg-white text-xs text-gray-400 font-bold uppercase">OU DIGITE MANUALMENTE</span></div>
                </div>

                {/* AREA DE TEXTO MANUAL */}
                <div>
                    <div className="relative">
                        <textarea 
                            className="w-full h-32 p-3 bg-gray-50 border border-gray-300 rounded-lg outline-none focus:border-indigo-500 font-mono text-xs mb-2 resize-none"
                            placeholder={`Cole aqui os dados copiados de um email, excel ou site...
Ex:
Transportadora ABC - CNPJ 00.000.000/0001-00
Rua das Flores, 123, São Paulo - SP
Contato: João Silva`}
                            value={pasteData}
                            onChange={e => setPasteData(e.target.value)}
                            disabled={isAnalyzing}
                        />
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
                        <button 
                            type="button"
                            onClick={handleTextAnalyze}
                            disabled={!pasteData.trim() || isAnalyzing}
                            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm disabled:opacity-50"
                        >
                            <Wand2 size={14} /> Ler com IA (Inteligente)
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm font-medium animate-in slide-in-from-left-2 border border-red-100">
                        <AlertCircle size={16} /> {error}
                    </div>
                )}

                {parsedData.length > 0 && (
                    <div className="border rounded-lg overflow-hidden animate-in fade-in slide-in-from-bottom-4 shadow-sm">
                        <div className="bg-green-50 px-4 py-3 border-b border-green-100 font-bold text-xs text-green-800 flex justify-between items-center">
                            <span className="flex items-center gap-2"><Zap size={14} className="text-green-600"/> Dados Reconhecidos - Clique para Editar</span>
                            <span className="text-white bg-green-600 px-2 py-0.5 rounded text-[10px] uppercase">Pronto para Salvar</span>
                        </div>
                        <div className="max-h-80 overflow-y-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-white sticky top-0 border-b border-gray-100 shadow-sm z-10">
                                    <tr>
                                        <th className="p-2 text-gray-500 font-bold w-[30%]">RAZÃO SOCIAL</th>
                                        <th className="p-2 text-gray-500 font-bold w-[25%]">NOME FANTASIA</th>
                                        <th className="p-2 text-gray-500 font-bold w-[20%]">CNPJ</th>
                                        <th className="p-2 text-gray-500 font-bold w-[10%]">CIDADE</th>
                                        <th className="p-2 text-gray-500 font-bold w-[5%]">UF</th>
                                        <th className="p-2 w-8"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 bg-white">
                                    {parsedData.map((row, i) => (
                                        <tr key={i} className="hover:bg-gray-50 group">
                                            <td className="p-1">
                                                <input type="text" className="w-full p-1 border border-transparent hover:border-gray-300 focus:border-indigo-500 rounded bg-transparent font-bold uppercase text-gray-700 text-xs" 
                                                    value={row.name} onChange={e => handleRowChange(i, 'name', e.target.value)} />
                                            </td>
                                            <td className="p-1">
                                                <input type="text" className="w-full p-1 border border-transparent hover:border-gray-300 focus:border-indigo-500 rounded bg-transparent text-gray-600 text-xs uppercase" 
                                                    value={row.trading_name} onChange={e => handleRowChange(i, 'trading_name', e.target.value)} />
                                            </td>
                                            <td className="p-1">
                                                <input type="text" className="w-full p-1 border border-transparent hover:border-gray-300 focus:border-indigo-500 rounded bg-transparent font-mono text-indigo-700 font-bold text-xs" 
                                                    value={row.cnpj} onChange={e => handleRowChange(i, 'cnpj', e.target.value)} />
                                            </td>
                                            <td className="p-1">
                                                <input type="text" className="w-full p-1 border border-transparent hover:border-gray-300 focus:border-indigo-500 rounded bg-transparent text-gray-600 text-xs uppercase" 
                                                    value={row.city} onChange={e => handleRowChange(i, 'city', e.target.value)} />
                                            </td>
                                            <td className="p-1">
                                                <input type="text" className="w-full p-1 border border-transparent hover:border-gray-300 focus:border-indigo-500 rounded bg-transparent text-gray-600 text-xs uppercase" 
                                                    value={row.state} onChange={e => handleRowChange(i, 'state', e.target.value)} maxLength={2} />
                                            </td>
                                            <td className="p-1 text-center">
                                                <button onClick={() => handleRemoveRow(i)} className="text-gray-300 hover:text-red-500 transition-colors">
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

            </div>

            <div className="p-6 border-t border-gray-100 flex justify-between items-center bg-gray-50 rounded-b-2xl">
                <button 
                    onClick={handleClear}
                    className="px-4 py-2.5 text-sm font-bold text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
                    title="Limpar formulário"
                >
                    <Trash2 size={18} /> Limpar
                </button>
                <div className="flex gap-3">
                    <button onClick={onClose} className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-bold text-gray-600 hover:bg-white transition-colors">
                        Cancelar
                    </button>
                    <button 
                        onClick={handleSave} 
                        disabled={isSaving || parsedData.length === 0}
                        className="flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        Confirmar Importação
                    </button>
                </div>
            </div>
        </div>
    </div>
  );
};

export default ImportProviderModal;
