import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Loader2, Sparkles, AlertCircle, Image as ImageIcon, X } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  image?: string;
}

const AIChatbot: React.FC = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'model', text: 'Olá! Sou o assistente virtual da TMSEG. Como posso ajudar nas operações hoje?' }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setSelectedImage(reader.result as string);
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleSend = async () => {
    if (!input.trim() && !selectedImage) return;
    setError('');

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      image: selectedImage || undefined
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    const currentImage = selectedImage;
    setInput('');
    setSelectedImage(null);
    setIsLoading(true);
    
    const modelMessageId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: modelMessageId, role: 'model', text: '' }]);

    try {
      if (currentImage) {
        const base64Data = currentImage.split(',')[1];
        const mimeType = currentImage.split(';')[0].split(':')[1];
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: currentInput || "Analise esta imagem sob a ótica de segurança logística.",
            image: { data: base64Data, mimeType }
          })
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Erro ao processar imagem');
        }
        const data = await response.json();
        setMessages(prev => prev.map(msg => msg.id === modelMessageId ? { ...msg, text: data.text } : msg));
      } else {
        const history = messages.filter(m => m.id !== '1' && m.id !== modelMessageId).map(m => ({
          role: m.role,
          text: m.text
        }));

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: currentInput, history })
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Erro de conexão');
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.done) break;
                  if (data.error) throw new Error(data.error);
                  if (data.text) {
                    fullText += data.text;
                    setMessages(prev => prev.map(msg => msg.id === modelMessageId ? { ...msg, text: fullText } : msg));
                  }
                } catch (e: any) {
                  if (e.message && e.message !== 'Unexpected end of JSON input') throw e;
                }
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error("Chat Error:", err);
      const errorMessage = err.message || "Erro de conexão com o servidor de inteligência.";
      setError(errorMessage);
      setMessages(prev => prev.filter(msg => msg.id !== modelMessageId));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-9rem)] flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-fade-in w-full">
      <div className="bg-slate-900 p-4 flex items-center justify-between border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-600 rounded-lg"><Sparkles size={20} className="text-white" /></div>
          <div>
            <h2 className="text-white font-bold text-lg">Central de Inteligência TMSEG</h2>
            <p className="text-gray-400 text-xs flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span> Sistema Pronto
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg flex items-center gap-2 text-sm">
            <AlertCircle size={16} /> {error}
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'model' && (
              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center shrink-0">
                <Bot size={16} className="text-white" />
              </div>
            )}
            <div className="flex flex-col gap-2 max-w-[85%]">
              {msg.image && <img src={msg.image} alt="Upload" className="rounded-lg max-h-60 object-contain border bg-white" />}
              <div className={`p-3 rounded-2xl text-sm shadow-sm whitespace-pre-wrap ${msg.role === 'user' ? 'bg-red-700 text-white rounded-br-none' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none'}`}>
                {msg.text || (isLoading && <span className="animate-pulse">Gerando resposta...</span>)}
              </div>
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                <User size={16} className="text-gray-600" />
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-white border-t border-gray-200 shrink-0">
        {selectedImage && (
          <div className="flex items-center gap-2 mb-2 p-2 bg-gray-50 rounded-lg border w-fit">
            <img src={selectedImage} alt="Preview" className="h-10 w-10 object-cover rounded" />
            <button onClick={() => setSelectedImage(null)} className="text-gray-400 hover:text-red-500"><X size={16} /></button>
          </div>
        )}
        <div className="relative flex items-end gap-2 bg-gray-100 rounded-xl p-2 border focus-within:border-red-300 focus-within:bg-white transition-all">
          <label className="p-3 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors mb-0.5">
            <ImageIcon size={20} />
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={isLoading} />
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
            placeholder="Pergunte sobre rotas, clientes ou envie fotos de documentos..."
            disabled={isLoading}
            className="w-full bg-transparent border-none outline-none text-sm text-gray-800 resize-none max-h-32 min-h-[44px] py-3 px-2"
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || (!input.trim() && !selectedImage)}
            className="p-3 bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors disabled:opacity-50 mb-0.5"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIChatbot;
