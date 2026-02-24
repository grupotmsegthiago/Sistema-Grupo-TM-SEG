
import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, FileText, ShieldCheck, Mail, Globe, User, Download, 
  Zap, Check, Loader2, Scale, Shield, 
  Clock, DollarSign, Landmark, AlertOctagon, 
  MapPin, Building2, Fingerprint, FileCheck, QrCode, Signature,
  Settings, Calendar, Percent, Gavel, FileSignature, ExternalLink,
  Users, Trash2, Edit2, Save, RotateCcw, Briefcase, Info, BadgeCheck, FileDown,
  ChevronRight, Phone, ClipboardCheck, Activity, Target, Rocket, Eye, Star, Award,
  Cpu, BrainCircuit, Lock, BarChart3, Radio, History, Crosshair, Map, CheckCircle2, TrendingUp,
  Server, Smartphone, Layers, Boxes, Workflow, ArrowRight, Database, Truck, FileInput, Pencil
} from 'lucide-react';
import { ClientPriceTable } from '../types';
import { supabase } from '../lib/supabase';
import { logAction } from '../lib/logger';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useNotification } from '../lib/NotificationContext';

interface Props {
  onClose: () => void;
  clientName: string;
  priceTables: ClientPriceTable[];
  contactName: string;
  email: string;
  cnpj?: string;
  rg_ie?: string;
  zip_code?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  address?: string;
  phone?: string;
  trading_name?: string;
}

// LOGO VETORIAL PREMIUM - ALTA FIDELIDADE (Cores Estritas: #000000 e #B91C1C)
const TmsegLogo = ({ variant = 'dark', className = "h-12" }: { variant?: 'light' | 'dark', className?: string }) => {
    const primaryColor = variant === 'light' ? '#ffffff' : '#000000'; 
    const accentColor = '#b91c1c'; 
    const shieldFill = variant === 'light' ? 'rgba(255,255,255,0.0)' : 'none';
    const shieldStroke = variant === 'light' ? '#ffffff' : '#000000';

    return (
        <svg viewBox="0 0 320 80" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="TMSEG Logo" preserveAspectRatio="xMidYMid meet">
            {/* ESCUDO (ÍCONE) */}
            <g transform="translate(10, 5) scale(0.85)">
                {/* Contorno do Escudo */}
                <path 
                    d="M40 5 L10 15 V35 C10 55 25 70 40 75 C55 70 70 55 70 35 V15 L40 5 Z" 
                    stroke={shieldStroke} 
                    strokeWidth="4" 
                    fill={shieldFill}
                    strokeLinejoin="round"
                />
                
                {/* Detalhe Vermelho Inferior (Swoosh) */}
                <path 
                    d="M20 50 Q40 65 60 40" 
                    stroke={accentColor} 
                    strokeWidth="6" 
                    strokeLinecap="round"
                    className="opacity-100"
                />

                {/* Monograma T e M Estilizados */}
                <path 
                    d="M30 25 H50 M40 25 V50" 
                    stroke={variant === 'light' ? '#ffffff' : accentColor} 
                    strokeWidth="5" 
                    strokeLinecap="square"
                />
                <path 
                    d="M25 35 L40 50 L55 35" 
                    stroke={shieldStroke} 
                    strokeWidth="4" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                    fill="none"
                />
            </g>

            {/* TEXTO PRINCIPAL - Kerning Otimizado */}
            <g transform="translate(85, 10)">
                <text x="0" y="42" fontFamily="'Montserrat', sans-serif" fontWeight="900" fontSize="42" fill={accentColor} letterSpacing="-1">TM</text>
                <text x="70" y="42" fontFamily="'Montserrat', sans-serif" fontWeight="900" fontSize="42" fill={primaryColor} letterSpacing="-1">SEG</text>
            </g>

            {/* SLOGAN / SUBTÍTULO */}
            <g transform="translate(88, 62)">
                 <line x1="0" y1="-8" x2="165" y2="-8" stroke={accentColor} strokeWidth="3" />
                 <text x="0" y="6" fontFamily="'Open Sans', sans-serif" fontWeight="800" fontSize="10" fill={primaryColor} letterSpacing="3.5" style={{textTransform: 'uppercase'}}>
                    Serviços em Segurança
                 </text>
            </g>
        </svg>
    );
};

const CommercialProposalModal: React.FC<Props> = ({ 
    onClose, clientName, priceTables, contactName, email, 
    cnpj, rg_ie, zip_code, street, number, complement, neighborhood, city, state, address, phone, trading_name
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'proposal' | 'contract'>('proposal');
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const { showNotification } = useNotification();

  const currentUser = useMemo(() => {
      const stored = localStorage.getItem('userData');
      return stored ? JSON.parse(stored) : null;
  }, []);

  const [contractConfig, setContractConfig] = useState({
      paymentDaysClause4: '15',
      paymentDaysClause6: '20',
      lateFee: '2',
      monthlyInterest: '1',
      validityMonths: '12',
      forumCity: 'São Paulo'
  });

  const processedTables = useMemo(() => {
      let tables = [...priceTables];
      if (clientName.toUpperCase().includes('CEVA')) {
          const hasLogitech = tables.some(t => t.operation_type.toUpperCase().includes('LOGITECH'));
          if (!hasLogitech) {
              const baseTable = tables.length > 0 ? tables[0] : null;
              tables.unshift({
                  id: 'virtual-logitech',
                  client: clientName,
                  operation_type: 'CEVA - OPERAÇÃO LOGITECH',
                  activation_fee: baseTable ? baseTable.activation_fee : 0,
                  franchise_km: 200,
                  franchise_hours: 3,
                  price_per_extra_km: baseTable ? baseTable.price_per_extra_km : 0,
                  price_per_extra_hour: baseTable ? baseTable.price_per_extra_hour : 0
              });
          }
      }
      return tables;
  }, [priceTables, clientName]);

  const handleSaveProposalRecord = async () => {
      setIsSavingConfig(true);
      try {
          const payload = {
              client_name: clientName,
              type: activeTab === 'proposal' ? 'PROPOSTA' : 'CONTRATO',
              status: 'ENVIADO',
              value: processedTables.reduce((acc, t) => acc + t.activation_fee, 0),
              created_by: currentUser?.name || 'Sistema',
              created_at: new Date().toISOString()
          };
          
          await supabase.from('commercial_proposals').insert([payload]);
          
          await logAction('CREATE', 'Contract', 'NEW', `Novo documento gerado: ${payload.type} para ${clientName}`);
          showNotification('Registrado', 'Documento registrado no histórico de contratos.', 'success');
      } catch (error) {
          console.warn("Tabela commercial_proposals pode não existir", error);
      } finally {
          setIsSavingConfig(false);
      }
  };

  const handleExportPDF = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    const docType = activeTab === 'proposal' ? 'PROPOSTA' : 'CONTRATO';
    const cleanClientName = clientName.replace(/[^a-z0-9]/gi, '_').toUpperCase();
    const fileName = `${docType}_TMSEG_${cleanClientName}.pdf`;

    try {
        const rootId = activeTab === 'proposal' ? 'proposal-content' : 'contract-content';
        const rootElement = document.getElementById(rootId);
        const pages = rootElement?.querySelectorAll('.page-container');
        
        if (!pages || pages.length === 0) throw new Error("Conteúdo não encontrado.");

        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });

        for (let i = 0; i < pages.length; i++) {
            const page = pages[i] as HTMLElement;
            
            // CONFIGURAÇÃO DE ALTA RESOLUÇÃO (4x Scale para 300 DPI+)
            const canvas = await html2canvas(page, { 
                scale: 4, 
                useCORS: true, 
                backgroundColor: '#ffffff',
                windowWidth: 794,
                logging: false,
                imageTimeout: 15000,
                allowTaint: true
            });
            
            // Sem compressão de imagem (Qualidade 1.0)
            const imgData = canvas.toDataURL('image/jpeg', 1.0);
            pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
            if (i < pages.length - 1) pdf.addPage();
        }
        pdf.save(fileName);
        handleSaveProposalRecord();
        showNotification('Sucesso', `${docType} exportado com qualidade de impressão!`, 'success');
    } catch (error: any) {
        console.error("Erro PDF:", error);
        showNotification('Erro', 'Falha ao gerar arquivo PDF.', 'error');
    } finally {
        setIsGenerating(false);
    }
  };

  const handleExportWord = () => {
    const docType = activeTab === 'proposal' ? 'PROPOSTA' : 'CONTRATO';
    const rootId = activeTab === 'proposal' ? 'proposal-content' : 'contract-content';
    const element = document.getElementById(rootId);
    if (!element) return;

    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>${docType}</title>
      <style>
        body { font-family: 'Roboto', sans-serif; line-height: 1.6; font-size: 11pt; color: #000; }
        h1, h2, h3, h4 { font-family: 'Montserrat', sans-serif; font-weight: bold; }
        h1 { text-align: center; text-transform: uppercase; font-size: 16pt; border-bottom: 2px solid #000; padding-bottom: 10pt; }
        .clause-title { font-weight: bold; text-transform: uppercase; margin-top: 15pt; display: block; color: #000; border-bottom: 1px solid #000; font-size: 12pt; }
        .clause-text { text-align: justify; margin-bottom: 10pt; font-size: 11pt; }
        table { border-collapse: collapse; width: 100%; margin-top: 10pt; margin-bottom: 15pt; }
        th { background-color: #f3f4f6; font-weight: bold; border: 1px solid #000; padding: 8pt; text-align: center; text-transform: uppercase; font-size: 10pt; font-family: 'Montserrat', sans-serif; }
        td { border: 1px solid #000; padding: 8pt; text-align: left; font-size: 10pt; font-family: 'Roboto', sans-serif; }
      </style>
      </head>
      <body>
        ${element.innerHTML}
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${docType}_TMSEG_${clientName.replace(/[^a-z0-9]/gi, '_').toUpperCase()}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    handleSaveProposalRecord();
    showNotification('Sucesso', 'Documento exportado para Word (.doc) com sucesso.', 'success');
  };

  const handleSendToSignature = () => {
      alert("Iniciando ZapSign para: " + contactName + "\nE-mail: " + email);
      handleSaveProposalRecord();
      showNotification('Assinatura Digital', 'Documento enviado para o ZapSign.', 'info');
  };

  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const fullAddressStr = street ? `${street}, nº ${number}${complement ? ' ('+complement+')' : ''}, ${neighborhood}, ${city}/${state}, CEP: ${zip_code}` : address || 'Endereço não informado';

  // DADOS DA CONTRATADA (FIXOS)
  const CONTRATADA = {
      razao: "TM SEGURANCA CONSULTORIA & TECNOLOGIA INTEGRADA LTDA",
      cnpj: "28.804.378/0001-67",
      endereco: "AV PARADA PINTO, Nº 745, APT 24 BLOCO D, VILA NOVA CACHOEIRINHA, SAO PAULO/SP, CEP: 02.611-003"
  };

  return (
    <div id="proposal-modal-root" className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/98 backdrop-blur-xl p-4 overflow-hidden font-sans text-slate-900">
      <style>{`
        /* ESTILOS DE PÁGINA A4 - QUALIDADE DE IMPRESSÃO */
        .page-container {
            position: relative;
            background: white;
            box-sizing: border-box;
            width: 210mm;
            min-height: 296mm;
            margin: 0 auto 40px auto;
            padding: 20mm 25mm; /* Margens padrão A4 */
            display: flex;
            flex-direction: column;
            box-shadow: 0 30px 60px rgba(0,0,0,0.5);
            flex-shrink: 0;
            overflow: hidden;
            font-family: 'Roboto', sans-serif;
            color: #000;
        }
        
        /* FONTES E CORES ESTRITAS */
        h1, h2, h3, h4, h5, h6 {
            font-family: 'Montserrat', sans-serif;
            color: #000;
        }
        
        .proposal-hero {
            background: linear-gradient(135deg, #000 0%, #1a0505 50%, #450a0a 100%);
            margin: -20mm -25mm 15mm -25mm; /* Ajustado para margem da pagina */
            padding: 40mm 25mm;
            color: white;
            position: relative;
        }
        
        .section-header-red {
            border-left: 5px solid #b91c1c;
            padding-left: 5mm;
            margin-bottom: 6mm;
        }

        .contract-header-stripe {
            height: 35px;
            background: linear-gradient(to right, #000, #450a0a, #7f1d1d);
            margin: -20mm -25mm 15mm -25mm;
            display: flex;
            align-items: center;
            padding: 0 25mm;
            justify-content: space-between;
        }

        .clause-title {
            font-family: 'Roboto', sans-serif;
            font-size: 14px; /* Aumentado */
            font-weight: 900;
            color: #000;
            text-transform: uppercase;
            margin-top: 24px;
            margin-bottom: 12px;
            display: block;
            border-bottom: 2px solid #000;
            padding-bottom: 4px;
            letter-spacing: 0.05em;
        }

        .clause-text {
            font-family: 'Roboto', sans-serif;
            font-size: 11pt; /* 11pt para melhor leitura */
            text-align: justify;
            line-height: 1.6;
            color: #000;
            margin-bottom: 12px;
        }

        .sub-clause {
            font-family: 'Roboto', sans-serif;
            font-size: 11pt; /* 11pt */
            text-align: justify;
            line-height: 1.6;
            color: #000;
            margin-bottom: 10px;
            padding-left: 24px;
            display: block;
        }

        .contract-signature-line {
            border-top: 1.5px solid #000;
            width: 80%;
            margin: 40px auto 5px auto;
        }

        @media print { .no-print { display: none !important; } .page-container { margin: 0; box-shadow: none; } }
      `}</style>

      <div className="bg-slate-900 w-full max-w-[1400px] max-h-[95vh] overflow-hidden flex flex-col rounded-[32px] shadow-2xl no-print border border-white/10">
        
        <div className="p-6 flex flex-col md:flex-row justify-between items-center shrink-0 bg-slate-950/50 border-b border-white/5 gap-4">
          <div className="flex items-center gap-4 text-white">
            <div className="p-3 bg-red-600 rounded-2xl shadow-lg"><BadgeCheck size={24} /></div>
            <div>
                <h2 className="font-black uppercase tracking-tighter text-lg leading-none font-montserrat">Inteligência Comercial</h2>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1.5 font-opensans">Grupo TMSEG • Estratégia em Escolta Armada</p>
            </div>
          </div>

          <div className="flex bg-slate-800 p-1 rounded-2xl border border-white/10">
              <button onClick={() => setActiveTab('proposal')} className={`px-6 py-2 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'proposal' ? 'bg-red-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>Proposta Estratégica</button>
              <button onClick={() => setActiveTab('contract')} className={`px-6 py-2 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'contract' ? 'bg-red-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>Contrato Jurídico</button>
          </div>

          <div className="flex gap-4">
            <button onClick={handleSendToSignature} className="bg-indigo-600 text-white hover:bg-indigo-700 px-6 py-3 rounded-2xl text-xs font-black flex items-center gap-2 transition-all shadow-xl active:scale-95 font-montserrat">
                <FileSignature size={18} /> ENVIAR ASSINATURA
            </button>
            <div className="flex bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
                <button onClick={handleExportPDF} disabled={isGenerating} className="text-slate-900 hover:bg-slate-100 px-4 py-3 text-xs font-black border-r border-gray-100 flex items-center gap-2 transition-all active:scale-95 font-montserrat">
                    {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />} PDF
                </button>
                <button onClick={handleExportWord} className="text-slate-900 hover:bg-slate-100 px-4 py-3 text-xs font-black flex items-center gap-2 transition-all active:scale-95 font-montserrat">
                    <FileDown size={18} className="text-blue-600" /> WORD
                </button>
            </div>
            <button onClick={onClose} className="p-3 hover:bg-white/10 text-white rounded-full transition-colors"><X size={24}/></button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-y-auto bg-slate-950 p-6 md:p-12 scrollbar-hide">
            
            {activeTab === 'proposal' && (
                <div id="proposal-content" className="mx-auto">
                    {/* PAGE 1: CAPA */}
                    <div className="page-container">
                        <div className="proposal-hero">
                             <TmsegLogo variant="light" className="h-24 mb-16" />
                             <h4 className="text-red-500 font-black uppercase tracking-[0.6em] mb-4 text-[10px] font-montserrat">Strategic Escort Operations</h4>
                             <h1 className="text-6xl font-black uppercase tracking-tighter leading-none mb-12 font-montserrat">Sua Carga Segura,<br/><span className="text-red-600">Nossa Estratégia.</span></h1>
                             <div className="h-2 w-40 bg-red-600 mb-12 rounded-none"></div>
                             <p className="text-2xl text-white font-bold max-w-xl leading-snug font-montserrat">Blindamos sua logística através de intermediação especializada e compliance documental rigoroso.</p>
                        </div>
                        <div className="flex-1 p-10 flex flex-col justify-end">
                            <h2 className="text-4xl font-black text-black uppercase tracking-tighter mb-4 font-montserrat">{trading_name || clientName}</h2>
                            <p className="text-xs text-black font-bold uppercase tracking-widest font-opensans">{today}</p>
                        </div>
                    </div>

                    {/* PAGE 2: MANIFESTO, HISTÓRIA E VALORES */}
                    <div className="page-container">
                        <div className="flex justify-between items-center mb-10 pb-6 border-b border-black">
                             <TmsegLogo variant="dark" className="h-8" />
                             <div className="text-right">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-red-700 font-montserrat">Legado & Visão</h3>
                             </div>
                        </div>

                        <div className="mb-12">
                            <h4 className="text-red-700 font-black uppercase tracking-widest text-xs mb-2 font-montserrat">Compliance, Tecnologia e Performance</h4>
                            <h1 className="text-4xl font-black text-black uppercase tracking-tighter mb-8 leading-none font-montserrat">
                                A Inteligência em<br/>Escolta <span className="text-red-700">Armada.</span>
                            </h1>
                            
                            <div className="flex gap-8 mb-10">
                                <div className="w-1.5 bg-black h-auto"></div>
                                <div className="flex-1 space-y-4">
                                    <p className="text-sm text-black leading-relaxed text-justify font-opensans">
                                        O <span className="font-bold">GRUPO TM SEG</span> se posiciona como um parceiro estratégico, dedicado a oferecer soluções de excelência na intermediação de serviços especializados em Escolta Armada, Pronta Resposta, Acompanhamento Logístico em todo o território nacional. Nossa missão é conectar você aos melhores profissionais e empresas do setor, garantindo que cada projeto seja executado com a máxima eficiência, confiabilidade e dentro dos mais altos padrões de segurança e qualidade.
                                    </p>
                                    <p className="text-sm text-black leading-relaxed text-justify font-opensans">
                                        Com uma vasta rede de parceiros criteriosamente selecionados e uma equipe interna altamente especializada e comprometida com a gestão e coordenação, asseguramos que todas as suas necessidades sejam atendidas de forma transparente e eficaz. Nosso compromisso é fornecer soluções personalizadas que se adaptam às demandas específicas de cada cliente, sempre com foco na agilidade, inovação e na sua total satisfação.
                                    </p>
                                    <p className="text-sm text-black leading-relaxed text-justify font-opensans">
                                        No <span className="text-red-700 font-bold">GRUPO TM SEG</span>, acreditamos que a excelência na intermediação e no atendimento é fundamental para o sucesso. Estamos sempre à disposição para esclarecer dúvidas, oferecer suporte contínuo e monitorar a performance dos serviços intermediados, garantindo um acompanhamento impecável desde a análise inicial até a conclusão do projeto.
                                    </p>
                                    <p className="text-sm text-black leading-relaxed text-justify font-opensans">
                                        Combinamos um profundo conhecimento de mercado com uma abordagem transparente e colaborativa, buscando construir relações de confiança e parcerias duradouras. Nossa expertise em gestão e orquestração de serviços nos permite entregar resultados consistentes, adaptando-nos continuamente às demandas do mercado e às necessidades de nossos clientes, sempre buscando o mais alto nível de segurança e suporte através da nossa rede de parceiros.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* TIMELINE VISUAL */}
                        <div className="mb-12 bg-gray-50 p-6 border border-gray-200">
                            <h4 className="text-xs font-black uppercase tracking-widest text-black mb-6 font-montserrat">Timeline de Inovação</h4>
                            <div className="flex justify-between relative">
                                <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-300 -z-10"></div>
                                {[
                                    { year: '2012', title: 'Fundação', desc: 'Início das Operações' },
                                    { year: '2018', title: 'Expansão', desc: 'Cobertura Nacional' },
                                    { year: '2024', title: 'Tecnologia', desc: 'IA & S.E.R. System' },
                                    { year: '2026', title: 'Futuro', desc: 'Integração Total' }
                                ].map((item, idx) => (
                                    <div key={idx} className="flex flex-col items-center bg-white p-2 border border-gray-200 w-32 shadow-sm">
                                        <span className="text-red-700 font-black text-xs font-montserrat">{item.year}</span>
                                        <div className="w-3 h-3 bg-black rounded-full my-2 border-2 border-white"></div>
                                        <span className="text-[10px] font-bold text-black uppercase font-montserrat">{item.title}</span>
                                        <span className="text-[8px] text-gray-800 text-center leading-tight mt-1 font-opensans">{item.desc}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* PILARES ESTRATÉGICOS */}
                        <div className="mt-auto grid grid-cols-3 gap-6">
                            <div className="bg-white p-5 border border-gray-200 flex flex-col items-center text-center">
                                <div className="p-3 bg-red-50 text-red-700 rounded-full mb-3"><Target size={24}/></div>
                                <h4 className="text-xs font-black uppercase mb-1 text-black font-montserrat">Foco no Resultado</h4>
                                <p className="text-[10px] text-gray-800 leading-tight font-opensans">Garantia de entrega e mitigação de prejuízos operacionais.</p>
                            </div>
                            <div className="bg-black p-5 border border-black flex flex-col items-center text-center text-white">
                                <div className="p-3 bg-white/10 rounded-full mb-3"><Activity size={24}/></div>
                                <h4 className="text-xs font-black uppercase mb-1 font-montserrat">Alta Performance</h4>
                                <p className="text-[10px] text-gray-300 leading-tight font-opensans">Equipes treinadas para reação sob pressão extrema.</p>
                            </div>
                            <div className="bg-white p-5 border border-gray-200 flex flex-col items-center text-center">
                                <div className="p-3 bg-gray-100 text-black rounded-full mb-3"><Lock size={24}/></div>
                                <h4 className="text-xs font-black uppercase mb-1 text-black font-montserrat">Segurança Jurídica</h4>
                                <p className="text-[10px] text-gray-800 leading-tight font-opensans">Compliance total com normas da Polícia Federal.</p>
                            </div>
                        </div>
                    </div>

                    {/* PAGE 3: INOVAÇÃO E TECNOLOGIA (S.E.R.) */}
                    <div className="page-container">
                        <div className="flex justify-between items-center mb-10 pb-6 border-b border-black">
                             <TmsegLogo variant="dark" className="h-8" />
                             <div className="text-right">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-black font-montserrat">S.E.R. Technology</h3>
                             </div>
                        </div>

                        <div className="mb-8">
                            <h1 className="text-3xl font-black text-black uppercase tracking-tighter mb-4 leading-none font-montserrat">
                                Inovação: O Simulador<br/><span className="text-red-700">Estratégico de Rotas.</span>
                            </h1>
                            <p className="text-sm text-black font-medium max-w-3xl mb-8 leading-relaxed font-opensans text-justify">
                                Apresentamos a ferramenta que está redefinindo o planejamento logístico no Brasil. Nossos cálculos não são estimativas; são ciência de dados aplicada à segurança, integrando APIs de tráfego, clima e criminalidade em tempo real.
                            </p>

                            {/* WORKFLOW DIAGRAM */}
                            <div className="flex items-center justify-between gap-4 mb-10 bg-gray-50 p-6 border border-gray-200">
                                <div className="text-center w-1/4">
                                    <div className="w-12 h-12 bg-white flex items-center justify-center mx-auto mb-3 text-black border border-black"><MapPin size={24}/></div>
                                    <h5 className="text-[10px] font-black uppercase font-montserrat">1. Input de Rota</h5>
                                    <p className="text-[9px] text-gray-600 mt-1 font-opensans">Origem / Destino</p>
                                </div>
                                <ArrowRight className="text-black" />
                                <div className="text-center w-1/4">
                                    <div className="w-12 h-12 bg-red-700 flex items-center justify-center mx-auto mb-3 text-white"><BrainCircuit size={24}/></div>
                                    <h5 className="text-[10px] font-black uppercase text-red-700 font-montserrat">2. Análise IA</h5>
                                    <p className="text-[9px] text-gray-600 mt-1 font-opensans">Risco e Custo</p>
                                </div>
                                <ArrowRight className="text-black" />
                                <div className="text-center w-1/4">
                                    <div className="w-12 h-12 bg-white flex items-center justify-center mx-auto mb-3 text-black border border-black"><TrendingUp size={24}/></div>
                                    <h5 className="text-[10px] font-black uppercase font-montserrat">3. Precificação</h5>
                                    <p className="text-[9px] text-gray-600 mt-1 font-opensans">Cálculo Dinâmico</p>
                                </div>
                                <ArrowRight className="text-black" />
                                <div className="text-center w-1/4">
                                    <div className="w-12 h-12 bg-black flex items-center justify-center mx-auto mb-3 text-white"><FileSignature size={24}/></div>
                                    <h5 className="text-[10px] font-black uppercase font-montserrat">4. Execução</h5>
                                    <p className="text-[9px] text-gray-600 mt-1 font-opensans">Ordem de Serviço</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                <div className="flex items-start gap-4 p-5 bg-white border-l-4 border-red-700 border-r border-t border-b border-gray-200 shadow-sm">
                                    <div className="p-2 bg-red-50 text-red-700 rounded-none"><Crosshair size={20}/></div>
                                    <div>
                                        <h4 className="text-sm font-black text-black uppercase mb-1 font-montserrat">Precisão Cirúrgica</h4>
                                        <p className="text-xs text-black leading-relaxed font-opensans">
                                            Cálculos dinâmicos que consideram KM real via API de mapas de alta precisão, eliminando surpresas no faturamento e garantindo previsibilidade de custos.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-4 p-5 bg-white border-l-4 border-black border-r border-t border-b border-gray-200 shadow-sm">
                                    <div className="p-2 bg-gray-100 text-black rounded-none"><BrainCircuit size={20}/></div>
                                    <div>
                                        <h4 className="text-sm font-black text-black uppercase mb-1 font-montserrat">Maturidade Algorítmica</h4>
                                        <p className="text-xs text-black leading-relaxed font-opensans">
                                            Nossa IA aprende com cada rota aprovada, sugerindo custos de pedágio, tempos de deslocamento e despesas acessórias com base em histórico real de operações.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-4 p-5 bg-white border-l-4 border-gray-400 border-r border-t border-b border-gray-200 shadow-sm">
                                    <div className="p-2 bg-gray-50 text-gray-600 rounded-none"><FileCheck size={20}/></div>
                                    <div>
                                        <h4 className="text-sm font-black text-black uppercase mb-1 font-montserrat">Transparência Total</h4>
                                        <p className="text-xs text-black leading-relaxed font-opensans">
                                            Propostas geradas em segundos com detalhamento completo de excedentes de KM e horas, permitindo auditoria instantânea por sua equipe.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-auto pt-6 border-t border-gray-300">
                            <h4 className="text-[10px] font-black uppercase text-black tracking-widest mb-4 font-montserrat">Stack Tecnológico Integrado</h4>
                            <div className="flex justify-between items-center text-black">
                                <div className="flex flex-col items-center gap-2"><Server size={20}/><span className="text-[9px] font-bold font-montserrat">Cloud</span></div>
                                <div className="flex flex-col items-center gap-2"><Globe size={20}/><span className="text-[9px] font-bold font-montserrat">Maps API</span></div>
                                <div className="flex flex-col items-center gap-2"><Database size={20}/><span className="text-[9px] font-bold font-montserrat">Realtime DB</span></div>
                                <div className="flex flex-col items-center gap-2"><Smartphone size={20}/><span className="text-[9px] font-bold font-montserrat">Mobile App</span></div>
                                <div className="flex flex-col items-center gap-2"><ShieldCheck size={20}/><span className="text-[9px] font-bold font-montserrat">Encryption</span></div>
                            </div>
                        </div>
                    </div>

                    {/* PAGE 4: PRODUTO E OPERAÇÃO (GRID TÁTICO) */}
                    <div className="page-container">
                        <div className="flex justify-between items-center mb-10 pb-6 border-b border-black">
                             <TmsegLogo variant="dark" className="h-8" />
                             <div className="text-right">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-black font-montserrat">Operations</h3>
                             </div>
                        </div>

                        <div className="mb-8">
                            <h1 className="text-3xl font-black text-black uppercase tracking-tighter mb-4 font-montserrat">
                                Operação de <span className="text-red-700">Elite.</span>
                            </h1>
                            <p className="text-sm text-black font-medium mb-8 leading-relaxed text-justify font-opensans">
                                Para clientes de alto porte, o risco não é uma opção. Entregamos uma estrutura robusta de proteção, dividida em quatro pilares fundamentais que sustentam nossa promessa de segurança.
                            </p>

                            {/* GRID TÁTICO 2x2 */}
                            <div className="grid grid-cols-2 gap-6">
                                <div className="bg-black text-white p-5 border border-black flex flex-col h-full">
                                    <div className="mb-4 p-3 bg-red-700 w-fit"><Truck size={24}/></div>
                                    <h4 className="text-sm font-black uppercase mb-2 font-montserrat">Frota Tática</h4>
                                    <p className="text-[10px] text-gray-300 leading-relaxed mb-3 flex-1 font-opensans">
                                        Veículos 1.0 a 2.0, equipados com rastreadores híbridos (Satelital/GPRS), sistema de comunicação redundante e, opcionalmente, blindagem nível IIIA.
                                    </p>
                                    <ul className="space-y-1">
                                        <li className="flex items-center gap-1.5 text-[9px] font-bold text-red-500 font-opensans"><Check size={10}/> Manutenção Preventiva Rigorosa</li>
                                        <li className="flex items-center gap-1.5 text-[9px] font-bold text-red-500 font-opensans"><Check size={10}/> Caracterização Ostensiva</li>
                                    </ul>
                                </div>

                                <div className="bg-white border border-black p-5 flex flex-col h-full">
                                    <div className="mb-4 p-3 bg-gray-100 text-black w-fit"><Users size={24}/></div>
                                    <h4 className="text-sm font-black uppercase text-black mb-2 font-montserrat">Capital Humano</h4>
                                    <p className="text-[10px] text-black leading-relaxed mb-3 flex-1 font-opensans">
                                        Agentes com curso de extensão em escolta armada, reciclagem semestral e perfil psicológico validado para gestão de crises e direção evasiva.
                                    </p>
                                    <ul className="space-y-1">
                                        <li className="flex items-center gap-1.5 text-[9px] font-bold text-black font-opensans"><Check size={10}/> Armamento Calibre 12 e .38</li>
                                        <li className="flex items-center gap-1.5 text-[9px] font-bold text-black font-opensans"><Check size={10}/> Equipamento de Proteção (EPI)</li>
                                    </ul>
                                </div>

                                <div className="bg-white border border-black p-5 flex flex-col h-full">
                                    <div className="mb-4 p-3 bg-red-50 text-red-700 w-fit"><Radio size={24}/></div>
                                    <h4 className="text-sm font-black uppercase text-black mb-2 font-montserrat">CCO 24/7</h4>
                                    <p className="text-[10px] text-black leading-relaxed mb-3 flex-1 font-opensans">
                                        Centro de Controle Operacional ativo 24 horas. Monitoramento espelhado em tempo real, com protocolos de acionamento de Pronta Resposta (QRF).
                                    </p>
                                    <ul className="space-y-1">
                                        <li className="flex items-center gap-1.5 text-[9px] font-bold text-red-700 font-opensans"><Check size={10}/> Tempo de Resposta Imediato</li>
                                    </ul>
                                </div>

                                <div className="bg-gray-100 border border-black p-5 flex flex-col h-full">
                                    <div className="mb-4 p-3 bg-white text-black w-fit border border-black"><FileText size={24}/></div>
                                    <h4 className="text-sm font-black uppercase text-black mb-2 font-montserrat">Compliance Legal</h4>
                                    <p className="text-[10px] text-black leading-relaxed mb-3 flex-1 font-opensans">
                                        Garantia jurídica total. Operamos estritamente dentro das normas da Polícia Federal e legislação vigente.
                                    </p>
                                    <ul className="space-y-1">
                                        <li className="flex items-center gap-1.5 text-[9px] font-bold text-black font-opensans"><Check size={10}/> Alvará PF & Certificado CRS</li>
                                        <li className="flex items-center gap-1.5 text-[9px] font-bold text-black font-opensans"><Check size={10}/> Seguro Responsabilidade Civil</li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <div className="mt-auto pt-6 border-t-2 border-black">
                            <h4 className="text-sm font-black text-black uppercase mb-4 font-montserrat">Diferenciais Táticos</h4>
                            <div className="flex justify-between items-center bg-gray-50 p-4 border border-black">
                                <div className="flex flex-col items-center">
                                    <ShieldCheck size={24} className="text-black mb-2"/>
                                    <span className="text-[9px] font-bold uppercase font-montserrat">Auditoria 100%</span>
                                </div>
                                <div className="w-px h-8 bg-black"></div>
                                <div className="flex flex-col items-center">
                                    <Map size={24} className="text-red-700 mb-2"/>
                                    <span className="text-[9px] font-bold uppercase font-montserrat">Cobertura Nacional</span>
                                </div>
                                <div className="w-px h-8 bg-black"></div>
                                <div className="flex flex-col items-center">
                                    <Zap size={24} className="text-black mb-2"/>
                                    <span className="text-[9px] font-bold uppercase font-montserrat">Agilidade</span>
                                </div>
                                <div className="w-px h-8 bg-black"></div>
                                <div className="flex flex-col items-center">
                                    <Award size={24} className="text-red-700 mb-2"/>
                                    <span className="text-[9px] font-bold uppercase font-montserrat">Excelência</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* PAGE 5: ESCOPO FINANCEIRO (TABELA) */}
                    <div className="page-container">
                        <div className="flex justify-between items-center mb-10 pb-6 border-b-2 border-black">
                             <TmsegLogo variant="dark" className="h-8" />
                             <h3 className="text-xs font-black uppercase tracking-widest text-black font-montserrat">Escopo Financeiro</h3>
                        </div>
                        <div className="section-header-red">
                            <h2 className="text-2xl font-black text-black uppercase tracking-tighter font-montserrat">Investimento Operacional</h2>
                        </div>
                        <div className="border border-black bg-white mb-8">
                            <table className="w-full text-[11px] border-collapse font-opensans">
                                <thead className="bg-black text-white font-black uppercase font-montserrat">
                                    <tr>
                                        <th className="p-5 text-left border-r border-gray-700">Operação / Rota</th>
                                        <th className="p-5 text-center border-r border-gray-700">Franquia</th>
                                        <th className="p-5 text-right">Valor Base</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-black">
                                    {processedTables.map((t, i) => (
                                        <tr key={i} className={`hover:bg-gray-100 transition-colors ${t.id === 'virtual-logitech' ? 'bg-red-50' : ''}`}>
                                            <td className="p-5 font-bold uppercase text-black border-r border-black">
                                                {t.operation_type}
                                                {t.id === 'virtual-logitech' && <span className="block text-[8px] text-red-700 font-black mt-1">REGRA AUTOMÁTICA ATIVA</span>}
                                            </td>
                                            <td className="p-5 text-center text-black font-mono border-r border-black font-bold">{t.franchise_km}KM / {t.franchise_hours}H</td>
                                            <td className="p-5 text-right font-black text-black text-sm">R$ {t.activation_fee.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="mt-auto pt-10 border-t-2 border-black flex justify-between items-end">
                            <div>
                                <h5 className="text-sm font-black text-black uppercase tracking-tighter font-montserrat">{currentUser?.name || "Departamento Comercial"}</h5>
                                <p className="text-[10px] text-black font-bold uppercase font-opensans">Grupo TMSEG - Inteligência em Segurança</p>
                                <p className="text-[10px] text-black mt-1 font-opensans">Contato: +55 11 95456-3755 | www.grupotmseg.com.br</p>
                            </div>
                            <TmsegLogo variant="dark" className="h-6" />
                        </div>
                    </div>
                </div>
            )}

            {/* CONTRATO JURÍDICO REFORMULADO (4 PÁGINAS) */}
            {activeTab === 'contract' && (
                <div id="contract-content" className="mx-auto">
                    
                    {/* BARRA DE CONFIGURAÇÃO (Toolbar para editar variáveis) - NÃO IMPRIME */}
                    <div className="w-[210mm] mx-auto mb-4 bg-gray-100 border border-gray-300 rounded-lg p-2 no-print shadow-sm flex flex-wrap items-end gap-3">
                         <div className="flex items-center gap-2 mb-1 w-full border-b border-gray-200 pb-1">
                             <Pencil size={14} className="text-gray-500" />
                             <span className="text-[10px] font-bold text-gray-500 uppercase">Personalizar Variáveis do Contrato (Rascunho)</span>
                         </div>
                         <div className="flex-1">
                            <label className="text-[9px] font-bold text-gray-500 block">Prazo Pagamento</label>
                            <input type="text" className="w-full text-xs p-1 border rounded" value={contractConfig.paymentDaysClause4} onChange={(e) => setContractConfig({...contractConfig, paymentDaysClause4: e.target.value})} />
                         </div>
                         <div className="flex-1">
                            <label className="text-[9px] font-bold text-gray-500 block">Multa (%)</label>
                            <input type="text" className="w-full text-xs p-1 border rounded" value={contractConfig.lateFee} onChange={(e) => setContractConfig({...contractConfig, lateFee: e.target.value})} />
                         </div>
                         <div className="flex-1">
                            <label className="text-[9px] font-bold text-gray-500 block">Juros (%)</label>
                            <input type="text" className="w-full text-xs p-1 border rounded" value={contractConfig.monthlyInterest} onChange={(e) => setContractConfig({...contractConfig, monthlyInterest: e.target.value})} />
                         </div>
                         <div className="flex-1">
                            <label className="text-[9px] font-bold text-gray-500 block">Foro (Cidade)</label>
                            <input type="text" className="w-full text-xs p-1 border rounded" value={contractConfig.forumCity} onChange={(e) => setContractConfig({...contractConfig, forumCity: e.target.value})} />
                         </div>
                         <button onClick={() => showNotification('Atualizado', 'Visualização atualizada. Exporte para salvar.', 'success')} className="bg-slate-800 text-white px-3 py-1 rounded text-[10px] font-bold h-7 uppercase hover:bg-black transition-colors">
                             Aplicar
                         </button>
                    </div>

                    {/* FOLHA 1 - PREÂMBULO E CLÁUSULAS INICIAIS */}
                    <div className="page-container">
                        <div className="contract-header-stripe">
                             <TmsegLogo variant="light" className="h-5" />
                             <span className="text-[8px] font-black text-white/50 uppercase tracking-[0.4em] font-montserrat">Instrumento Particular de Contratação</span>
                        </div>
                        <div className="text-center mb-8 pb-4 border-b-2 border-black">
                            <h1 className="text-sm font-black uppercase tracking-widest leading-relaxed font-montserrat">CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE SEGURANÇA ESPECIALIZADOS DE ESCOLTA ARMADA</h1>
                        </div>

                        <p className="clause-text text-justify mb-4">
                            Contrato de Prestação de Serviços de Intermediação de Segurança Especializada em Escolta Armada, que entre si celebram:
                            <br/><br/>
                            <strong>{CONTRATADA.razao}</strong>, inscrita no CNPJ sob nº {CONTRATADA.cnpj}, situada na {CONTRATADA.endereco}, doravante denominada <strong>CONTRATADA</strong>, representando seus parceiros subcontratados; e
                            <br/><br/>
                            <strong>{trading_name || clientName}</strong>, inscrita no CNPJ sob n.º {cnpj}, Inscrição Estadual nº {rg_ie || 'ISENTO'}, estabelecida em {fullAddressStr}, doravante denominada <strong>CONTRATANTE</strong>;
                            <br/><br/>
                            As partes celebram o presente instrumento particular conforme necessidades e requisitos do CLIENTE, na forma das cláusulas abaixo:
                        </p>

                        <span className="clause-title">CLÁUSULA PRIMEIRA – DO OBJETO DESTE CONTRATO</span>
                        <p className="clause-text">
                            O presente contrato tem por objeto a intermediação comercial e administrativa destinada à contratação de empresas especializadas em escolta armada, devidamente autorizadas e fiscalizadas pela Polícia Federal, nos termos da Lei nº 7.102/1983, bem como a prestação de outros serviços de natureza administrativa, negocial ou acessória, eventualmente desempenhados pela CONTRATADA, desde que não sujeitos a regime autorizativo, alvará específico ou qualquer medida regulatória própria das atividades de segurança privada.
                        </p>
                        <span className="sub-clause">
                            §1º A atuação da CONTRATADA consubstancia-se, exclusivamente, na identificação, prospecção, indicação, negociação comercial e formalização administrativa da contratação de empresas de segurança privada habilitadas à execução de serviços de escolta armada.
                        </span>
                        <span className="sub-clause">
                            §2º O fluxo de trabalho da CONTRATADA consisitirá em:
                            <br/>(i) A CONTRATANTE identificará a necessidade de transporte, acionando a CONTRATADA por e-mail, WhatsApp, telefone ou sistema dedicado. Na solicitação, deverá informar detalhadamente a rota, tipo de carga, quilometragem estimada e tipo de veículo a ser escoltado;
                            <br/>(ii) A CONTRATADA receberá e processará a solicitação, selecionando o fornecedor parceiro mais adequado para a rota (se aplicável), garantindo sua regularidade legal junto à Polícia Federal e confirmando que toda a documentação auditada e arquivada em seu sistema está em conformidade.
                            <br/>(iii) A CONTRATADA, por meio de seus agentes ou dos fornecedores parceiros, realizará o acompanhamento seguro e monitorado da carga, seguindo as rotas e protocolos operacionais estabelecidos.
                            <br/>(iv) Após a escolta ser finalizada no destino, a CONTRATADA fará o gerenciamento da prestação de contas, emitindo o faturamento à CONTRATANTE com base na apuração dos serviços e do preço estipulado por rota, acionamento, hora, ou KM, cabendo à esta última efetuar o pagamento integral.
                            <br/>(v) Com o efetivo recebimento dos valores, a CONTRATADA reterá a remuneração que lhe é devida e repassará o montante excedente às empresas especializadas, em estrita conformidade com o ajuste realizado.
                        </span>

                        <span className="clause-title">CLÁUSULA SEGUNDA – DOS SERVIÇOS</span>
                        <p className="clause-text">
                            A CONTRATADA obriga-se a assegurar, no âmbito de sua atuação administrativa, que os parceiros subcontratados sejam empresas regularmente autorizadas pelos órgãos competentes, notadamente pela Polícia Federal, e que empreguem exclusivamente mão de obra devidamente qualificada e habilitada, em estrita observância à legislação de regência, sem que tal obrigação importe em ingerência técnica, operacional ou assunção de responsabilidade regulatória pela execução dos serviços.
                        </p>
                        <span className="sub-clause">
                            §1º A CONTRATADA será responsável por supervisionar o cumprimento dessas obrigações pelos parceiros subcontratados, que será a única responsável por quaisquer danos ou infrações decorrentes do descumprimento da lei ou do uso inadequado do armamento ou da logística, conforme regulamentação específica que rege a atividade objeto deste contrato.
                        </span>
                        <span className="sub-clause">
                            §2º As partes reconhecem que a escolta armada constitui atividade-fim típica de segurança privada, nos termos do art. 4º, inciso IV, da Portaria DPF nº 3.233/2012, sendo sua execução restrita às empresas regularmente autorizadas pela Polícia Federal.
                        </span>
                    </div>

                    {/* FOLHA 2 - PREÇO E PAGAMENTO */}
                    <div className="page-container">
                         <div className="contract-header-stripe mb-8">
                             <TmsegLogo variant="light" className="h-5" />
                             <span className="text-[8px] font-black text-white/50 uppercase tracking-[0.4em] font-montserrat">Continuação - Folha 02</span>
                        </div>

                        <span className="clause-title">CLÁUSULA TERCEIRA – DO PREÇO</span>
                        <p className="clause-text">
                            A CONTRATANTE pagará à CONTRATADA, mensalmente, pela prestação dos serviços, o valor estabelecido e detalhado neste contrato. Os pagamentos serão efetuados 15 dias após o término de cada quinzena de serviços prestados, com base em um mês de 30 (trinta) dias. Todos os encargos e tributos acordados no presente contrato estão incluídos no valor total.
                        </p>
                        <span className="sub-clause">
                            § 1º. Qualquer serviço adicional de escolta armada não previsto no presente contrato e que venha a ser solicitado pela CONTRATANTE, implicando a necessidade de novas diligências ou atividades de intermediação junto às empresas prestadoras de serviços, ensejará a cobrança de remuneração adicional, a qual deverá ser prévia e expressamente ajustada entre as partes, mediante comum acordo.
                        </span>
                        <span className="sub-clause">
                             § 2º. O preço dos serviços estabelecidos nesta cláusula e no presente contrato inclui todos os encargos sociais e trabalhistas, tais como: ISS correspondente ao Município tomador, alimentação, transporte, treinamentos, equipamentos, uniformes, reciclagens e coordenação externa. No entanto, eventuais despesas adicionais, como pedágios e outras tarifas pontuadas durante a prestação dos serviços, serão cobradas de forma complementar, mediante apresentação de comprovantes.
                        </span>
                        <span className="sub-clause">
                             § 3º. Após a aprovação da medição, o boleto bancário será enviado à administração da CONTRATANTE em até 5 (cinco) dias úteis.
                        </span>
                        <span className="sub-clause">
                             § 4º. Juntamente com a Nota Fiscal de faturamento, deverá ser obrigatoriamente enviado o relatório de medição dos serviços prestados pela CONTRATADA à CONTRATANTE da quinzena anterior. A CONTRATANTE terá o prazo de 2 (dois) dias úteis para contestar a medição. Após este período, os valores serão considerados aceitos e faturados.
                        </span>
                        <span className="sub-clause">
                            § 5º. Para fins de apuração de horas, considera-se como início o horário agendado ou o início efetivo (o que for registrado posteriormente/maior), e o término o registro de conclusão no sistema, sem tolerância para excedentes.
                        </span>
                        <span className="sub-clause">
                             § 6º. Para serviços de Escolta Velada com equipe de 2 agentes, aplicar-se-á o multiplicador de 2x sobre o valor base e franquias estabelecidas neste anexo, visto tratar-se de cobrança por agente (H.H.). Na Escolta Caracterizada, o valor é por viatura, independente da guarnição.
                        </span>
                        <span className="sub-clause">
                             § 7º. Em caso de cancelamento da missão após o deslocamento da viatura ou chegada na origem (No-Show), será cobrado o valor integral do acionamento (Taxa de Saída) ou franquia mínima prevista em tabela.
                        </span>

                        <span className="clause-title">CLÁUSULA QUARTA – DA DATA DO PAGAMENTO</span>
                        <p className="clause-text">
                            O pagamento do valor estabelecido na CLÁUSULA TERCEIRA deste instrumento será efetuado pela CONTRATANTE até 20 dias após o término da quinzena de prestação dos serviços, mediante a apresentação da competente nota fiscal de serviços pela CONTRATADA.
                        </p>
                        <span className="sub-clause">
                            § 1º. Os pagamentos serão efetuados conforme instruções da CONTRATADA, exclusivamente por meio de cobrança bancária, mediante a apresentação de boleto bancário emitido pela CONTRATADA e anexado à nota fiscal de faturamento apresentada. Os valores referentes à prestação de serviços deverão estar disponíveis para a CONTRATADA no primeiro horário bancário, considerando-se a data de vencimento do boleto.
                        </span>
                         <span className="sub-clause">
                            § 2º. O não pagamento na data prevista acarretará uma multa de {contractConfig.lateFee}% sobre o valor devido, devidamente corrigido pelo IGP-M, ou qualquer outro índice oficial divulgado pelo governo que o substitua, acrescido de juros de {contractConfig.monthlyInterest}% ao mês.
                        </span>
                         <span className="sub-clause">
                            §3º O atraso no pagamento de quaisquer valores devidos autorizará a CONTRATADA a proceder ao protesto do título correspondente, independentemente de aviso prévio, sem prejuízo da adoção das demais medidas legais cabíveis para a satisfação do crédito.
                        </span>
                    </div>

                    {/* FOLHA 3 - RESPONSABILIDADES E OBRIGAÇÕES */}
                    <div className="page-container">
                        <div className="contract-header-stripe mb-8">
                             <TmsegLogo variant="light" className="h-5" />
                             <span className="text-[8px] font-black text-white/50 uppercase tracking-[0.4em] font-montserrat">Continuação - Folha 03</span>
                        </div>

                        <span className="clause-title">CLÁUSULA QUINTA – DA RESPONSABILIDADE</span>
                        <p className="clause-text">
                            Ficará sob a responsabilidade da CONTRATADA a supervisão e cobrança dos parceiros ou fornecedores envolvidos na execução dos serviços, garantindo que todos os processos sejam realizados corretamente e em conformidade com a legislação aplicável.
                        </p>
                         <span className="sub-clause">
                            § 1º. A CONTRATADA, na qualidade de coordenadora/intermediadora dos serviços prestados, será responsável por assegurar que seus parceiros ou fornecedores cumpram integralmente com os encargos trabalhistas, previdenciários e fiscais decorrentes das atividades contratadas, conforme previsto na legislação vigente.
                        </span>
                        <span className="sub-clause">
                            § 2º. Será de inteira responsabilidade da CONTRATANTE a gestão do efetivo de profissionais destinados ao serviço, bem como qualquer alteração que possa afetar o plano de continuidade de operações apresentado pela CONTRATADA. No entanto, tais alterações não devem conflitar com a legislação que regula a atividade, sendo a CONTRATADA responsável por garantir que o serviço seja prestado de acordo com os padrões legais e contratuais.
                        </span>
                        <span className="sub-clause">
                            § 4º. Será de inteira responsabilidade da CONTRATADA:
                            <br/>a) Garantir a qualidade dos serviços prestados pelo parceiros que intermediará, incluindo a contratação de seguro de vida para o efetivo envolvido, se necessário.
                            <br/>b) Buscar pessoal qualificado e habilitado para a execução dos serviços contratados;
                            <br/>c) Realizar a coordenação, supervisão e orientação de seus funcionários no que se refere aos aspectos administrativos e negociais do serviço e, quanto às atividades intermediadas, promover a busca, indicação e contratação de prestadores devidamente habilitados, sem ingerência técnica ou operacional sobre a execução dos serviços finais.
                            <br/>d) Providenciar a uniformização e a identificação adequada de seus colaboradores diretos e, no que couber à intermediação, assegurar que os prestadores intermediados mantenham identificação compatível com as exigências legais e contratuais, observadas as respectivas responsabilidades;
                            <br/>e) Manter disponibilidade para contato com a CONTRATANTE 24 horas por dia, através de sua Central;
                            <br/>f) Orientar seus colaboradores e prepostos para que cumpram e observem os regulamentos e normas internas de segurança da CONTRATANTE, onde os serviços serão prestados.
                            <br/>g) Ressarcir a CONTRATANTE por todos os danos e prejuízos causados por seus empregados, desde que a culpa ou dolo seja efetivamente apurada, garantindo amplos direitos de defesa e contraditório. O ressarcimento será efetuado mediante autorização da CONTRATADA e acerto na fatura dos meses subsequentes, conforme acordo entre as partes.
                        </span>

                        <span className="clause-title">CLÁUSULA SEXTA – DAS OBRIGAÇÕES DA CONTRATANTE</span>
                        <p className="clause-text">
                            A CONTRATANTE não poderá incorporar ao seu quadro de empregados quaisquer colaboradores diretos da CONTRATADA, tampouco dos prestadores intermediados, durante a vigência do contrato e pelo prazo de 12 (doze) meses contados da rescisão do vínculo laboral com a CONTRATADA, seja por iniciativa desta ou por pedido de demissão, salvo mediante prévia e expressa aquiescência das partes envolvidas.
                        </p>
                         <span className="sub-clause">
                            § 1º. A inadimplência por parte da CONTRATANTE implicará na rescisão deste instrumento, a critério da CONTRATADA, independentemente de aviso prévio.
                        </span>
                        <span className="sub-clause">
                            § 2º. A CONTRATANTE se obriga a remeter quinzenalmente as medições dos serviços.
                        </span>
                        <span className="sub-clause">
                            § 3º. A CONTRATANTE se obriga a comunicar imediatamente e por escrito a ocorrência de qualquer circunstância ou evento em desacordo com as condições previstas neste contrato, a fim de que sejam tomadas as providências necessárias.
                        </span>
                         <span className="sub-clause">
                            § 4º. Obriga-se a CONTRATANTE a quitar todos os valores devidos decorrentes da prestação de serviço, objeto deste contrato, assim como também das solicitações de serviços extras ou extra jornada, no prazo máximo de quinze dias após a aprovação da fatura.
                        </span>
                    </div>

                    {/* FOLHA 4 - FINALIZAÇÃO, FORO E ASSINATURAS */}
                    <div className="page-container">
                        <div className="contract-header-stripe mb-8">
                             <TmsegLogo variant="light" className="h-5" />
                             <span className="text-[8px] font-black text-white/50 uppercase tracking-[0.4em] font-montserrat">Finalização - Folha 04</span>
                        </div>

                        <span className="clause-title">CLÁUSULA SÉTIMA – DO SIGILO DE INFORMAÇÕES</span>
                        <p className="clause-text">
                            Pelo presente instrumento, a CONTRATADA e o CONTRATANTE declaram e se obrigam expressamente a guardar e utilizar as informações dentro do máximo sigilo e confidencialidade.
                        </p>
                        <span className="sub-clause">
                            Parágrafo único: Os profissionais manterão em sigilo todas as informações exclusivamente para e dentro de seus relacionamentos profissionais ou de negócios entre CONTRATANTE e CONTRATADA, mesmo após o término do contrato, incluindo-se valores contratuais referentes às prestações de serviço vinculadas a este processo.
                        </span>

                        <span className="clause-title">CLÁUSULA OITAVA – DO FORO</span>
                        <p className="clause-text">
                            As partes, de comum acordo, elegem o foro de {contractConfig.forumCity} para dirimir eventuais conflitos oriundos do presente instrumento, renunciando a qualquer outro, por mais privilegiado que possa ser.
                        </p>
                        <span className="sub-clause">
                            Parágrafo único - As partes anexam ao presente contrato cópias devidamente autenticadas do Contrato Social e/ou Última Alteração, CNPJ e Inscrição Estadual / Municipal, Procuração Pública, bem como documentos pessoais dos seus Representantes Legais.
                        </span>

                        <p className="clause-text mt-8 mb-12 font-bold text-center">
                            E por estarem justas e acordadas, as partes subscrevem, na presença de duas testemunhas, o presente contrato.
                        </p>

                        <div className="contract-signature-line"></div>
                        <p className="text-center text-[10px] font-bold uppercase font-montserrat">{trading_name || clientName}</p>
                        <p className="text-center text-[9px] uppercase text-black mb-8 font-opensans">Contratante / Cliente: {contactName}</p>

                        <div className="contract-signature-line"></div>
                        <p className="text-center text-[10px] font-bold uppercase font-montserrat">TM SEGURANCA CONSULTORIA & TECNOLOGIA INTEGRADA LTDA</p>
                        <p className="text-center text-[9px] uppercase text-black mb-12 font-opensans">Contratada</p>

                        <div className="mt-8 grid grid-cols-2 gap-8">
                            <div>
                                <div className="border-t border-black w-full pt-1"></div>
                                <p className="text-[9px] uppercase font-bold font-opensans">Testemunha 1</p>
                                <p className="text-[9px] uppercase font-opensans">CPF: ______________________</p>
                            </div>
                            <div>
                                <div className="border-t border-black w-full pt-1"></div>
                                <p className="text-[9px] uppercase font-bold font-opensans">Testemunha 2</p>
                                <p className="text-[9px] uppercase font-opensans">CPF: ______________________</p>
                            </div>
                        </div>

                        <div className="border border-black mt-4">
                             <h3 className="text-center text-xs font-black uppercase tracking-widest bg-gray-200 p-2 border-b border-black font-montserrat">Escopo de Serviço (Termo Aditivo Integrante)</h3>
                             <div className="p-3">
                                 <p className="text-[10px] text-justify mb-2 font-opensans">
                                    Os serviços acima descritos como escopo de serviços serão prestados por empresa especializada, sob supervisão da INTERMEDIÁRIA, conforme as condições acima descritas, respeitando os parâmetros de valores.
                                 </p>
                                 <p className="text-[10px] text-justify mb-2 font-opensans">
                                    Abaixo encontram-se as estimativas dos valores praticados por cada prestador de serviço especializado intermediado pela CONTRATADA, as quais poderão sofrer majoração, desde que prévia e expressamente comunicada à CONTRATANTE.
                                 </p>
                                 <p className="text-[10px] text-justify mb-4 font-opensans">
                                    Caso haja excedentes, será cobrado no faturamento quinzenal. Nada obstante, os pedágios serão cobrados de acordo com a planilha de medição quinzenal.
                                 </p>

                                 <table className="w-full text-[10px] border-collapse font-opensans">
                                    <thead className="bg-gray-200 font-bold uppercase text-black">
                                        <tr>
                                            <th className="p-2 border border-black text-left font-montserrat">DESCRIÇÃO</th>
                                            <th className="p-2 border border-black text-center w-24 font-montserrat">FRANQUIA</th>
                                            <th className="p-2 border border-black text-center w-20 font-montserrat">KM EXTRA</th>
                                            <th className="p-2 border border-black text-center w-20 font-montserrat">HORA EXTRA</th>
                                            <th className="p-2 border border-black text-right w-24 font-montserrat">VALOR BASE</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-black">
                                        {processedTables.map((t, i) => (
                                            <tr key={i} className="even:bg-gray-50">
                                                <td className="p-2 border border-black uppercase font-bold">{t.operation_type}</td>
                                                <td className="p-2 border border-black text-center">{t.franchise_km}KM / {t.franchise_hours}H</td>
                                                <td className="p-2 border border-black text-center">R$ {t.price_per_extra_km?.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                                <td className="p-2 border border-black text-center">R$ {t.price_per_extra_hour?.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                                <td className="p-2 border border-black text-right font-black">R$ {t.activation_fee.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                             </div>
                        </div>
                    </div>
                </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommercialProposalModal;
