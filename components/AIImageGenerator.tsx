import React, { useState, useRef } from 'react';
import { generateContent } from '../lib/gemini';
import { Image as ImageIcon, Loader2, Download, Wand2, Upload, X, Sparkles, AlertCircle } from 'lucide-react';

const AIImageGenerator: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [sourceMimeType, setSourceMimeType] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSourceImage(reader.result as string);
        setSourceMimeType(file.type);
        setGeneratedImage(null);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    setError(null);

    try {
      let resultText: string;

      if (sourceImage) {
        const base64Data = sourceImage.split(',')[1];
        resultText = await generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [
              { inlineData: { mimeType: sourceMimeType, data: base64Data } },
              { text: prompt }
            ]
          }
        });
      } else {
        resultText = await generateContent({
          model: 'gemini-3-pro-image-preview',
          contents: { parts: [{ text: prompt }] },
          config: { imageConfig: { aspectRatio: "16:9", imageSize: "1K" } },
        });
      }

      if (resultText) {
        setGeneratedImage(`data:image/png;base64,${resultText}`);
      } else {
        throw new Error("O modelo processou o pedido mas não gerou uma imagem válida.");
      }

    } catch (err: any) {
      console.error("Image Gen Error:", err);
      const msg = err.message || "Erro ao conectar com o servidor de imagens.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in pb-10">
      <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-gray-200 h-fit">
        <div className="flex items-center gap-2 mb-6 border-b pb-4">
          <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><Wand2 size={20} /></div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Gerador Visual IA</h2>
            <p className="text-[10px] text-gray-500 uppercase font-bold">Protocolo de Criação TMSEG</p>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <label className={sourceImage ? "text-xs font-bold text-orange-600 uppercase mb-2 block" : "text-xs font-bold text-gray-500 uppercase mb-2 block"}>
              {sourceImage ? "IMAGEM DE REFERÊNCIA ATIVA" : "CARREGAR REFERÊNCIA (OPCIONAL)"}
            </label>
            {sourceImage ? (
              <div className="relative rounded-xl overflow-hidden border-2 border-orange-200 aspect-video bg-gray-50">
                <img src={sourceImage} alt="Ref" className="w-full h-full object-contain" />
                <button onClick={() => setSourceImage(null)} className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-full shadow-lg"><X size={14}/></button>
              </div>
            ) : (
              <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-gray-300 rounded-xl p-6 flex flex-col items-center justify-center text-gray-400 hover:border-indigo-400 hover:bg-indigo-50 transition-all cursor-pointer">
                <Upload size={24} className="mb-2" />
                <span className="text-xs font-bold uppercase">Upload de Imagem</span>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">COMANDO CRIATIVO</label>
            <textarea 
              className="w-full p-4 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm h-32 resize-none transition-all"
              placeholder="Descreva a imagem. Ex: Viatura de escolta armada em rodova noturna com iluminação cinematográfica..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg text-xs flex items-center gap-2 border border-red-100">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <button 
            onClick={handleGenerate}
            disabled={isLoading || !prompt.trim()}
            className="w-full py-4 bg-slate-900 hover:bg-black text-white rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
          >
            {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
            {isLoading ? "PROCESSANDO..." : "GERAR VISUAL"}
          </button>
        </div>
      </div>

      <div className="lg:col-span-2 h-full min-h-[500px] bg-slate-950 rounded-xl flex items-center justify-center relative overflow-hidden border border-gray-800 shadow-inner">
        {generatedImage ? (
          <div className="relative group p-4 w-full h-full flex flex-col items-center justify-center">
            <img src={generatedImage} alt="Gen" className="max-w-full max-h-full rounded-lg shadow-2xl object-contain border border-white/10" />
            <button 
              onClick={() => { const l = document.createElement('a'); l.href = generatedImage; l.download = 'tmseg-ai.png'; l.click(); }}
              className="absolute bottom-10 bg-white text-black px-8 py-3 rounded-full font-bold shadow-xl hover:scale-105 transition-all flex items-center gap-2 text-sm"
            >
              <Download size={18} /> BAIXAR IMAGEM
            </button>
          </div>
        ) : (
          <div className="text-center p-8 opacity-20">
            <ImageIcon size={80} className="text-white mx-auto mb-4" />
            <p className="text-white font-black uppercase tracking-widest text-sm">Aguardando Processamento Visual</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIImageGenerator;