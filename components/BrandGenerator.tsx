
import React, { useState, useEffect } from 'react';
import { generateContent } from '../lib/gemini';
import { Sparkles, Palette, Type as TypeIcon, Image as ImageIcon, Loader2, Download, RefreshCw, AlertCircle } from 'lucide-react';
import { BrandIdentity } from '../types';

const BrandGenerator: React.FC = () => {
  const [mission, setMission] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [brandData, setBrandData] = useState<BrandIdentity | null>(null);
  const [primaryLogoUrl, setPrimaryLogoUrl] = useState<string | null>(null);
  const [secondaryMarkUrl, setSecondaryMarkUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  // Initial prompt guidance
  useEffect(() => {
      // Clean up font links on unmount
      return () => {
          const links = document.querySelectorAll('link[data-generated-font]');
          links.forEach(link => link.remove());
      };
  }, []);

  const loadFonts = (headerFont: string, bodyFont: string) => {
      const fonts = [headerFont, bodyFont].map(f => f.replace(/\s+/g, '+')).join('|');
      const link = document.createElement('link');
      link.href = `https://fonts.googleapis.com/css2?family=${fonts}&display=swap`;
      link.rel = 'stylesheet';
      link.setAttribute('data-generated-font', 'true');
      document.head.appendChild(link);
  };

  const handleGenerate = async () => {
    if (!mission.trim() || !companyName.trim()) {
        setError('Por favor, informe o nome da empresa e a missão.');
        return;
    }

    setIsGenerating(true);
    setError(null);
    setBrandData(null);
    setPrimaryLogoUrl(null);
    setSecondaryMarkUrl(null);

    try {
        // STEP 1: ANALYZE AND GENERATE TEXT DATA (JSON)
        setStatusMessage('Analisando missão e definindo identidade visual...');
        
        const dataText = await generateContent({
            model: "gemini-3-flash-preview",
            contents: `Analyze the following company mission and name to create a comprehensive Brand Identity.
            Company Name: ${companyName}
            Mission: ${mission}
            
            Return a JSON object with:
            1. 5 hex color codes with names and usage notes (e.g. Primary, Accent, Background).
            2. Google Font pairings (Header and Body) that fit the vibe.
            3. A reasoning for the font choices.
            4. Two detailed image prompts: one for a "Primary Logo" (text + icon, professional) and one for a "Secondary Mark" (favicon, icon only, minimalist).
            `,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        colors: {
                            type: "ARRAY",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    hex: { type: "STRING" },
                                    name: { type: "STRING" },
                                    usage: { type: "STRING" },
                                }
                            }
                        },
                        typography: {
                            type: "OBJECT",
                            properties: {
                                headerFont: { type: "STRING" },
                                bodyFont: { type: "STRING" },
                                reasoning: { type: "STRING" },
                            }
                        },
                        logoPrompt: { type: "STRING" },
                        secondaryMarkPrompt: { type: "STRING" },
                    }
                }
            }
        });

        if (!dataText) throw new Error("No data returned from AI");
        const parsedData = JSON.parse(dataText) as Omit<BrandIdentity, 'mission' | 'companyName'>;
        
        const fullBrandData: BrandIdentity = {
            ...parsedData,
            companyName,
            mission
        };
        
        setBrandData(fullBrandData);
        
        // Load fonts dynamically
        loadFonts(parsedData.typography.headerFont, parsedData.typography.bodyFont);

        // STEP 2: GENERATE IMAGES
        // Primary Logo
        setStatusMessage('Desenhando Logo Principal (Alta Definição)...');
        const logoText = await generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: {
                parts: [{ text: `Create a professional vector logo for "${companyName}". ${parsedData.logoPrompt}. White background, high quality, minimalist.` }],
            },
            config: {
                imageConfig: { aspectRatio: "1:1", imageSize: "1K" }
            }
        });
        
        if (logoText) {
            setPrimaryLogoUrl(`data:image/png;base64,${logoText}`);
        }

        // Secondary Mark
        setStatusMessage('Criando Ícone Secundário...');
        const iconText = await generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: {
                parts: [{ text: `Create a minimalist icon/symbol for "${companyName}". ${parsedData.secondaryMarkPrompt}. Flat design, vector style, white background.` }],
            },
            config: {
                imageConfig: { aspectRatio: "1:1", imageSize: "1K" }
            }
        });

        if (iconText) {
            setSecondaryMarkUrl(`data:image/png;base64,${iconText}`);
        }

    } catch (err: any) {
        console.error(err);
        const msg = err.message || "Erro ao gerar identidade visual.";
        setError(msg);
        
    } finally {
        setIsGenerating(false);
        setStatusMessage('');
    }
  };

  const handleDownload = (dataUrl: string, filename: string) => {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20 animate-fade-in">
        
        {/* HEADER */}
        <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-black p-8 rounded-2xl shadow-xl border border-gray-700 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10">
                <Sparkles size={120} className="text-white" />
            </div>
            <div className="relative z-10">
                <h1 className="text-3xl font-black text-white flex items-center gap-3">
                    <Palette className="text-red-50" /> Brand Identity Generator
                </h1>
                <p className="text-gray-300 mt-2 max-w-xl">
                    Crie uma "Brand Bible" completa em segundos. Defina sua missão e nossa IA irá gerar paletas de cores, tipografia e logos exclusivos para sua marca.
                </p>
            </div>
        </div>

        {/* INPUT SECTION */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 h-fit">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Sparkles size={18} className="text-purple-600" /> Configuração da Marca
                </h3>
                
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Nome da Empresa</label>
                        <input 
                            type="text" 
                            className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all font-bold text-gray-800"
                            placeholder="Ex: Future Logistics"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Missão / Descrição</label>
                        <textarea 
                            className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all text-sm h-32 resize-none"
                            placeholder="Descreva o que a empresa faz, seus valores e o público-alvo..."
                            value={mission}
                            onChange={(e) => setMission(e.target.value)}
                        />
                    </div>
                    
                    <button 
                        onClick={handleGenerate}
                        disabled={isGenerating || !mission || !companyName}
                        className="w-full py-3 bg-black text-white rounded-lg font-bold shadow-lg hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                        {isGenerating ? statusMessage : 'Gerar Brand Bible'}
                    </button>
                    {error && (
                        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-xs flex items-center gap-2">
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}
                </div>
            </div>

            {/* RESULTS SECTION */}
            <div className="lg:col-span-2 space-y-6">
                {brandData ? (
                    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                        
                        {/* COLOR PALETTE */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 uppercase text-sm tracking-wider border-b border-gray-100 pb-2">
                                <Palette size={16} className="text-blue-600" /> Paleta de Cores
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                {brandData.colors.map((color, idx) => (
                                    <div key={idx} className="flex flex-col group">
                                        <div 
                                            className="h-24 w-full rounded-xl shadow-inner mb-2 transition-transform group-hover:scale-105 border border-gray-100"
                                            style={{ backgroundColor: color.hex }}
                                        ></div>
                                        <span className="font-mono text-xs font-black text-gray-800">{color.hex}</span>
                                        <span className="text-xs font-bold text-gray-600">{color.name}</span>
                                        <span className="text-[10px] text-gray-400 mt-1">{color.usage}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* TYPOGRAPHY */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 uppercase text-sm tracking-wider border-b border-gray-100 pb-2">
                                <TypeIcon size={16} className="text-orange-600" /> Tipografia
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-2">
                                    <span className="text-xs font-bold text-gray-400 uppercase">Títulos / Headers</span>
                                    <div style={{ fontFamily: brandData.typography.headerFont, fontSize: '2rem', lineHeight: 1.2 }} className="text-gray-900 border-l-4 border-black pl-4">
                                        {brandData.typography.headerFont}
                                    </div>
                                    <p className="text-xs text-gray-500">The quick brown fox jumps over the lazy dog.</p>
                                </div>
                                <div className="space-y-2">
                                    <span className="text-xs font-bold text-gray-400 uppercase">Corpo / Body</span>
                                    <div style={{ fontFamily: brandData.typography.bodyFont, fontSize: '1rem' }} className="text-gray-700">
                                        {brandData.typography.bodyFont}
                                    </div>
                                    <p className="text-sm text-gray-600 leading-relaxed" style={{ fontFamily: brandData.typography.bodyFont }}>
                                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                                    </p>
                                </div>
                            </div>
                            <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 italic">
                                <span className="font-bold not-italic">Por que essa escolha? </span>
                                {brandData.typography.reasoning}
                            </div>
                        </div>

                        {/* LOGOS */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col">
                                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 uppercase text-sm tracking-wider">
                                    <ImageIcon size={16} className="text-indigo-600" /> Logo Principal
                                </h3>
                                <div className="flex-1 flex items-center justify-center bg-gray-50 rounded-xl border border-gray-100 p-4 min-h-[250px] relative group overflow-hidden">
                                    {primaryLogoUrl ? (
                                        <>
                                            <img src={primaryLogoUrl} alt="Primary Logo" className="w-full h-full object-contain" />
                                            <button 
                                                onClick={() => handleDownload(primaryLogoUrl!, `${companyName}-primary-logo.png`)}
                                                className="absolute bottom-4 right-4 bg-white text-gray-800 p-2 rounded-lg shadow-md opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 text-xs font-bold"
                                            >
                                                <Download size={14} /> Download
                                            </button>
                                        </>
                                    ) : (
                                        <div className="text-center text-gray-400">
                                            {isGenerating ? <Loader2 className="animate-spin mx-auto mb-2" /> : 'Aguardando geração...'}
                                        </div>
                                    )}
                                </div>
                                <p className="text-[10px] text-gray-400 mt-2 italic">Prompt: {brandData.logoPrompt}</p>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col">
                                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 uppercase text-sm tracking-wider">
                                    <ImageIcon size={16} className="text-teal-600" /> Símbolo (Favicon)
                                </h3>
                                <div className="flex-1 flex items-center justify-center bg-gray-50 rounded-xl border border-gray-100 p-4 min-h-[250px] relative group overflow-hidden">
                                    {secondaryMarkUrl ? (
                                        <>
                                            <img src={secondaryMarkUrl} alt="Secondary Mark" className="w-32 h-32 object-contain" />
                                            <button 
                                                onClick={() => handleDownload(secondaryMarkUrl!, `${companyName}-icon.png`)}
                                                className="absolute bottom-4 right-4 bg-white text-gray-800 p-2 rounded-lg shadow-md opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 text-xs font-bold"
                                            >
                                                <Download size={14} /> Download
                                            </button>
                                        </>
                                    ) : (
                                        <div className="text-center text-gray-400">
                                            {isGenerating ? <Loader2 className="animate-spin mx-auto mb-2" /> : 'Aguardando geração...'}
                                        </div>
                                    )}
                                </div>
                                <p className="text-[10px] text-gray-400 mt-2 italic">Prompt: {brandData.secondaryMarkPrompt}</p>
                            </div>
                        </div>

                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 text-center p-12 opacity-60">
                        <Palette size={64} className="text-gray-300 mb-4" />
                        <h3 className="text-xl font-bold text-gray-400">Seu Brand Bible aparecerá aqui</h3>
                        <p className="text-gray-400 max-w-xs mt-2">
                            Preencha os dados ao lado e clique em gerar para ver a mágica acontecer.
                        </p>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default BrandGenerator;
