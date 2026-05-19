import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Upload, Loader2, Copy, Check, ImageIcon, Sparkles, AlertCircle, RotateCcw } from 'lucide-react';
import { generateContent } from '../lib/gemini';
import { useNotification } from '../lib/NotificationContext';

interface DhlSolicitationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ExtractedData {
  origem: string;
  destino: string;
  apresentacao: string;
  numero?: string;
  cobertura?: string;
  kms?: string;
  horas?: string;
}

const DhlSolicitationModal: React.FC<DhlSolicitationModalProps> = ({ isOpen, onClose }) => {
  const { showNotification } = useNotification();
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{ mimeType: string; data: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setImagePreview(null);
    setImageData(null);
    setExtracted(null);
    setError(null);
    setCopied(false);
    setIsProcessing(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Por favor, envie um arquivo de imagem (PNG, JPG, etc).');
      return;
    }
    setError(null);
    setExtracted(null);
    setCopied(false);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);
      const base64 = dataUrl.split(',')[1] || '';
      setImageData({ mimeType: file.type, data: base64 });
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  useEffect(() => {
    if (!isOpen) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            processFile(file);
            return;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [isOpen, processFile]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const extractFromImage = async () => {
    if (!imageData) return;
    setIsProcessing(true);
    setError(null);
    try {
      const prompt = `Você está analisando um print do sistema da DHL (Solicitação de Escolta).
Extraia EXATAMENTE os seguintes campos visíveis no print, sem inventar nada:

- numero: o valor do campo "Número" (ex: "179041")
- cobertura: o valor do campo "Cobertura" (ex: "TOTAL")
- apresentacao: a data e hora do campo "Apresentação" no formato exato como aparece (ex: "19/05/2026 20:00")
- origem: o texto completo do campo "Origem" exatamente como exibido (ex: "APPLE - SYCRON JUNDIAI - ROD.VICE")
- destino: o texto completo do campo "Destino" exatamente como exibido (ex: "AEROPORTO GUARULHOS - RODOVIA HÉLIO SMIDT - S/N°")
- kms: valor do campo "Kms" (ex: "85")
- horas: valor do campo "Horas" no formato exato (ex: "03:00:00")

Responda APENAS em JSON válido, sem markdown, sem comentários, no formato:
{"numero":"...","cobertura":"...","apresentacao":"...","origem":"...","destino":"...","kms":"...","horas":"..."}

Se algum campo não estiver visível ou legível, use string vazia "" para esse campo. Mantenha letras maiúsculas como aparecem.`;

      const rawText = await generateContent({
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: imageData.mimeType, data: imageData.data } },
            { text: prompt }
          ]
        }],
        config: { maxOutputTokens: 1024, temperature: 0 },
        model: 'gemini-2.5-flash'
      });

      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('A IA não retornou um JSON válido. Tente outro print.');
      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.origem && !parsed.destino && !parsed.apresentacao) {
        throw new Error('Não foi possível identificar Origem, Destino ou Apresentação no print.');
      }
      setExtracted({
        origem: parsed.origem || '',
        destino: parsed.destino || '',
        apresentacao: parsed.apresentacao || '',
        numero: parsed.numero || '',
        cobertura: parsed.cobertura || '',
        kms: parsed.kms || '',
        horas: parsed.horas || ''
      });
    } catch (err: any) {
      console.error('Erro ao extrair dados:', err);
      setError(err.message || 'Erro ao processar o print. Tente novamente.');
    } finally {
      setIsProcessing(false);
    }
  };

  const buildMessage = (data: ExtractedData) => {
    return `*GRUPO TM SEG - SOLICITAÇÃO DE ESCOLTA*\n\nORIGEM: ${data.origem}\nDESTINO: ${data.destino}\nAPRESENTAÇÃO: ${data.apresentacao}`;
  };

  const handleCopy = async () => {
    if (!extracted) return;
    try {
      await navigator.clipboard.writeText(buildMessage(extracted));
      setCopied(true);
      showNotification('Copiado', 'Mensagem pronta para enviar ao fornecedor.', 'success');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Não foi possível copiar. Selecione e copie manualmente.');
    }
  };

  const updateField = (field: keyof ExtractedData, value: string) => {
    if (!extracted) return;
    setExtracted({ ...extracted, [field]: value });
    setCopied(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={handleClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-red-700 to-red-600 text-white">
          <div className="flex items-center gap-3">
            <div className="bg-yellow-400 text-red-700 p-2 rounded-lg shadow">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black uppercase tracking-wider">Solicitação DHL — Fornecedor</h2>
              <p className="text-[11px] text-red-100 font-medium">Cole ou envie o print do sistema DHL e a IA monta a mensagem pronta.</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-white/20 transition"
            data-testid="button-close-dhl-solicitation"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {!imagePreview && (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="border-2 border-dashed border-gray-300 hover:border-red-500 hover:bg-red-50/30 rounded-xl p-10 text-center cursor-pointer transition group"
              data-testid="dropzone-dhl-print"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="bg-gray-100 group-hover:bg-red-100 p-4 rounded-full transition">
                  <ImageIcon size={32} className="text-gray-500 group-hover:text-red-600" />
                </div>
                <p className="text-sm font-bold text-gray-700 uppercase">Cole o print (Ctrl+V), arraste ou clique para escolher</p>
                <p className="text-xs text-gray-500">Aceita PNG, JPG do sistema da DHL — Solicitação de Escolta</p>
                <button
                  type="button"
                  className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg uppercase shadow"
                  data-testid="button-upload-dhl-print"
                >
                  <Upload size={14} /> Escolher Imagem
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
          )}

          {imagePreview && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">Print enviado</h3>
                <button
                  onClick={reset}
                  className="flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-red-600 uppercase"
                  data-testid="button-reset-dhl"
                >
                  <RotateCcw size={12} /> Trocar imagem
                </button>
              </div>
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50 max-h-72 overflow-y-auto">
                <img src={imagePreview} alt="Print DHL" className="w-full" />
              </div>
              {!extracted && !isProcessing && (
                <button
                  onClick={extractFromImage}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-red-700 to-red-600 hover:from-red-800 hover:to-red-700 text-white text-sm font-black uppercase rounded-xl shadow-lg tracking-wider"
                  data-testid="button-extract-dhl"
                >
                  <Sparkles size={16} /> Extrair dados com IA
                </button>
              )}
              {isProcessing && (
                <div className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 rounded-xl text-sm font-bold text-gray-700">
                  <Loader2 size={16} className="animate-spin text-red-600" /> Lendo o print...
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {extracted && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-500">Origem</label>
                  <input
                    type="text"
                    value={extracted.origem}
                    onChange={(e) => updateField('origem', e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-xs font-bold uppercase focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                    data-testid="input-dhl-origem"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-500">Destino</label>
                  <input
                    type="text"
                    value={extracted.destino}
                    onChange={(e) => updateField('destino', e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-xs font-bold uppercase focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                    data-testid="input-dhl-destino"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-500">Apresentação</label>
                  <input
                    type="text"
                    value={extracted.apresentacao}
                    onChange={(e) => updateField('apresentacao', e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-xs font-bold uppercase focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                    data-testid="input-dhl-apresentacao"
                  />
                </div>
              </div>

              {(extracted.numero || extracted.cobertura || extracted.kms || extracted.horas) && (
                <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase">
                  {extracted.numero && <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded">Nº {extracted.numero}</span>}
                  {extracted.cobertura && <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded">Cob. {extracted.cobertura}</span>}
                  {extracted.kms && <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded">{extracted.kms} KM</span>}
                  {extracted.horas && <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded">{extracted.horas}</span>}
                </div>
              )}

              <div className="border-2 border-green-500 rounded-xl overflow-hidden shadow-lg">
                <div className="bg-green-600 text-white px-4 py-2 flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider">Mensagem pronta para WhatsApp</span>
                  <button
                    onClick={handleCopy}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-black uppercase transition ${
                      copied ? 'bg-white text-green-700' : 'bg-white/20 hover:bg-white/30 text-white'
                    }`}
                    data-testid="button-copy-dhl-message"
                  >
                    {copied ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
                  </button>
                </div>
                <pre
                  className="bg-gray-50 p-4 text-sm font-mono whitespace-pre-wrap text-gray-800 select-all"
                  data-testid="text-dhl-preview"
                >{buildMessage(extracted)}</pre>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <p className="text-[10px] text-gray-500">Dica: você pode editar os campos antes de copiar.</p>
          <button
            onClick={handleClose}
            className="px-4 py-2 text-xs font-bold uppercase bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg"
            data-testid="button-cancel-dhl-solicitation"
          >Fechar</button>
        </div>
      </div>
    </div>
  );
};

export default DhlSolicitationModal;
