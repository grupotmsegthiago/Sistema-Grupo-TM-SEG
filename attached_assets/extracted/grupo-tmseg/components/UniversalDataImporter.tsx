import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { GoogleGenAI } from "@google/genai";
import { googleMapsApiKey } from '../lib/maps'; 
import { 
    Database, UploadCloud, FileSpreadsheet, Loader2, Save, 
    CheckCircle2, AlertTriangle, ArrowRight, Table, Trash2, Wand2, MapPin
} from 'lucide-react';

const UniversalDataImporter: React.FC = () => {
    const [targetTable, setTargetTable] = useState('clients');
    const [inputText, setInputText] = useState('');
    const [parsedData, setParsedData] = useState<any[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [feedback, setFeedback] = useState<{type: 'success'|'error'|'info', msg: string} | null>(null);

    // Definição dos Schemas para a IA entender o que esperamos
    const schemas: Record<string, string> = {
        clients: `
            Tabela: clients
            Campos esperados: name (Razão Social), trading_name (Nome Fantasia), cnpj, contact_name, email, phone, address, city, state, status ('Ativo' ou 'Inativo').
            Regra: Se não tiver status, assuma 'Ativo'.
        `,
        providers: `
            Tabela: providers
            Campos esperados: name (Razão Social), trading_name (Nome Fantasia), cnpj, type (Ex: 'Escolta Caracterizada'), contact_name, address, city, state, status.
            Regra: Se não tiver status, assuma 'Ativo'.
        `,
        vehicles: `
            Tabela: vehicles
            Campos esperados: plate (Placa), model, brand, year, color, provider (Nome do Fornecedor exato), status ('Ativo').
            Regra: Tente normalizar o nome do fornecedor.
        `,
        agents: `
            Tabela: agents
            Campos esperados: name, cpf, phone, role (Vigilante/Motorista), provider (Nome do Fornecedor), status ('Ativo').
        `,
        support_agents: `
            CONTEXTO: Importação de Rede de Apoio (Pronta Resposta).
            A entrada é um texto copiado de planilha (Excel), separado por TABULAÇÃO ou ESPAÇOS MÚLTIPLOS.
            
            COLUNAS NO TEXTO DE ENTRADA (ORDEM):
            1. NOME DO AGENTE
            2. CELULAR
            3. VALOR (Ignorar)
            4. FRANQUIA (Ignorar)
            5. KM EXTRA (Ignorar)
            6. HORA EXTRA (Ignorar)
            7. UF
            8. TIPO (Ex: "PRONTA RESPOSTA", "ARMADO")
            9. CIDADES DE ATENDIMENTO (Texto Longo - Capture TUDO até o fim da linha)

            SAÍDA JSON OBRIGATÓRIA (Array de Objetos):
            [
              {
                "name": "string",
                "phone": "string (apenas números)",
                "base_address": "string (Cidade - UF)",
                "is_armed": boolean,
                "is_24h": boolean,
                "service_cities": "string",
                "status": "Ativo"
              }
            ]
            
            REGRAS DE EXTRAÇÃO:
            - "service_cities": Copie INTEGRALMENTE o texto da última coluna.
            - "is_armed": true se a coluna TIPO contiver "ARMADO".
            - "is_24h": true se encontrar "24h".
            - "base_address": Tente extrair a UF da coluna 7 e combinar com a cidade.
        `
    };

    const geocodeAddress = async (address: string) => {
        if (!address) return { lat: 0, lng: 0 };
        try {
            const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${googleMapsApiKey}`);
            const data = await response.json();
            if (data.status === 'OK' && data.results[0]) {
                const loc = data.results[0].geometry.location;
                return { lat: loc.lat, lng: loc.lng };
            }
        } catch (e) {
            console.error("Erro geocoding:", e);
        }
        return { lat: 0, lng: 0 };
    };

    const handleAnalyze = async () => {
        if (!inputText.trim()) return;
        
        setIsAnalyzing(true);
        setFeedback({ type: 'info', msg: 'IA analisando e estruturando dados...' });
        setParsedData([]);

        try {
            // Fix: Exclusively use process.env.API_KEY directly for initialization right before making an API call per guidelines
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            const prompt = `
                ATUE COMO UM ENGENHEIRO DE DADOS (ETL).
                TABELA DESTINO: ${targetTable}
                REGRAS DE MAPEAMENTO: ${schemas[targetTable]}
                DADOS DE ENTRADA (TEXTO BRUTO):
                ${inputText.substring(0, 30000)} 
                Retorne APENAS o JSON puro (Array). Sem markdown, sem \`\`\`.
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: { parts: [{ text: prompt }] }
            });

            const text = response?.text || "[]";
            const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
            
            let data;
            try {
                data = JSON.parse(cleanJson);
            } catch (e) {
                throw new Error("A IA não retornou um JSON válido.");
            }
            
            if (Array.isArray(data)) {
                if (targetTable === 'support_agents') {
                    setFeedback({ type: 'info', msg: `Geocodificando ${data.length} endereços...` });
                    const geocodedData = await Promise.all(data.map(async (item: any) => {
                        let lat = 0, lng = 0;
                        if (item.base_address) {
                            const coords = await geocodeAddress(item.base_address);
                            lat = coords.lat; lng = coords.lng;
                        }
                        return { ...item, latitude: lat, longitude: lng, status: 'Ativo' };
                    }));
                    data = geocodedData;
                }
                setParsedData(data);
                setFeedback({ type: 'success', msg: `${data.length} registros identificados!` });
            } else {
                throw new Error("Formato inválido.");
            }
        } catch (error: any) {
            const errorMsg = error.message || "Erro desconhecido";
            setFeedback({ type: 'error', msg: errorMsg });

            // Fix: Handle key selection reset per GenAI guidelines
            if (errorMsg.includes("Requested entity was not found.")) {
                if ((window as any).aistudio) {
                    (window as any).aistudio.openSelectKey();
                }
            }
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleSave = async () => {
        if (parsedData.length === 0) return;
        setIsSaving(true);
        try {
            const { error } = await supabase.from(targetTable).insert(parsedData);
            if (error) throw error;
            setFeedback({ type: 'success', msg: 'Importação concluída!' });
            setParsedData([]);
            setInputText('');
        } catch (error: any) {
            setFeedback({ type: 'error', msg: `Erro ao salvar: ${error.message}` });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                        <Database className="text-blue-600" /> Importação em Massa (IA)
                    </h2>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="mb-4">
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">1. Destino</label>
                            <select className="w-full p-3 border rounded-lg" value={targetTable} onChange={(e) => setTargetTable(e.target.value)}>
                                <option value="clients">Clientes</option>
                                <option value="providers">Fornecedores</option>
                                <option value="vehicles">Viaturas</option>
                                <option value="agents">Agentes</option>
                                <option value="support_agents">Rede de Apoio</option>
                            </select>
                        </div>
                        <div className="mb-4">
                            <label className="text-xs font-bold text-gray-500 mb-2 block">2. Cole os Dados</label>
                            <textarea className="w-full h-64 p-3 border rounded-lg text-xs font-mono" value={inputText} onChange={(e) => setInputText(e.target.value)}></textarea>
                        </div>
                        <button onClick={handleAnalyze} disabled={isAnalyzing} className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold disabled:opacity-50">
                            {isAnalyzing ? 'Processando...' : 'Processar com IA'}
                        </button>
                        {feedback && (
                            <div className={`mt-4 p-3 rounded-lg text-xs font-bold ${feedback.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                {feedback.msg}
                            </div>
                        )}
                    </div>
                </div>

                <div className="lg:col-span-7">
                    <div className="bg-white p-6 rounded-xl border h-full flex flex-col">
                        <h3 className="font-bold text-gray-700 mb-4">Pré-visualização ({parsedData.length})</h3>
                        <div className="flex-1 overflow-auto bg-gray-50 rounded-lg p-0">
                            {parsedData.length > 0 ? (
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-gray-200 font-bold sticky top-0">
                                        <tr>
                                            {Object.keys(parsedData[0]).map(key => <th key={key} className="p-3 uppercase">{key}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {parsedData.map((row, idx) => (
                                            <tr key={idx} className="bg-white hover:bg-blue-50">
                                                {Object.values(row).map((val, i) => <td key={i} className="p-3 truncate max-w-[200px]">{String(val)}</td>)}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : <div className="p-20 text-center text-gray-400 italic">Aguardando dados...</div>}
                        </div>
                        <button onClick={handleSave} disabled={isSaving || parsedData.length === 0} className="mt-4 py-3 bg-green-600 text-white rounded-lg font-bold">
                            {isSaving ? 'Salvando...' : 'Confirmar Importação'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UniversalDataImporter;