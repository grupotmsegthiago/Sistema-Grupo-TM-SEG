import React, { useState, useRef, useEffect } from 'react';
import { Mission, MissionStatus } from '../types';
import { supabase } from '../lib/supabase';
import { generateContent } from '../lib/gemini';
import { X, Loader2, FileText, Upload, Trash2, Sparkles, Download, Image as ImageIcon, Plus, Clock, MapPin, Truck, User, Shield, Phone, Navigation, Activity } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface Props {
    mission: Mission;
    onClose: () => void;
    isClientView?: boolean;
    isInternalEditor?: boolean;
}

interface PhotoSlot {
    id: string;
    label: string;
    file: File | null;
    preview: string | null;
}

interface TimelineEvent {
    time: string;
    description: string;
}

const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
const fmtTime = (d: any) => d ? new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDateTime = (d: any) => d ? `${fmtDate(d)} às ${fmtTime(d)}` : '—';
const fmtKm = (v: any) => v ? Number(v).toLocaleString('pt-BR') + ' km' : '—';

const MissionOperationalReport: React.FC<Props> = ({ mission, onClose, isClientView = false, isInternalEditor = false }) => {
    const [acionadoPor, setAcionadoPor] = useState('');
    const [whatsappConversation, setWhatsappConversation] = useState('');
    const [observacoes, setObservacoes] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedReport, setGeneratedReport] = useState<string | null>(null);
    const [generatedTimeline, setGeneratedTimeline] = useState<TimelineEvent[]>([]);
    const [isExporting, setIsExporting] = useState(false);
    const [missionLogs, setMissionLogs] = useState<any[]>([]);
    const reportRef = useRef<HTMLDivElement>(null);
    const [photoSlots, setPhotoSlots] = useState<PhotoSlot[]>([
        { id: '1', label: 'Fachada / Entrada', file: null, preview: null },
        { id: '2', label: 'Visão Aérea / Drone', file: null, preview: null },
        { id: '3', label: 'Detalhes Operacionais', file: null, preview: null },
    ]);

    const isCeva = (mission.client || '').toUpperCase().includes('CEVA');
    const primaryColor = isCeva ? '#152c54' : '#1a1a2e';
    const accentColor = isCeva ? '#e81818' : '#b91c1c';
    const gradientStart = isCeva ? '#152c54' : '#1a1a2e';
    const gradientEnd = isCeva ? '#0d1b38' : '#16213e';

    const startTime = mission.startTime || (mission as any).start_time;
    const endTime = mission.endTime || (mission as any).end_time;
    const startKm = mission.startKm || (mission as any).start_km || 0;
    const endKm = mission.endKm || (mission as any).end_km || 0;
    const totalKm = endKm > startKm ? endKm - startKm : (mission as any).total_distance || (mission as any).traveled_distance || 0;

    useEffect(() => {
        const fetchLogs = async () => {
            const { data } = await supabase
                .from('mission_logs')
                .select('*')
                .eq('mission_id', mission.id)
                .order('created_at', { ascending: true });
            setMissionLogs(data || []);

            if (isClientView && data && data.length > 0) {
                handleAutoGenerate(data);
            }
        };
        fetchLogs();
    }, [mission.id]);

    const parseWhatsAppTimeline = (text: string): TimelineEvent[] => {
        const lines = text.split('\n').filter(l => l.trim().length > 0);
        const events: TimelineEvent[] = [];
        const dateTimeRegex = /^\[?(\d{1,2}\/\d{1,2}\/\d{2,4})[,\s]+(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*[-–]?\s*/;
        const timeOnlyRegex = /^(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–]?\s*/;

        for (const line of lines) {
            let time = '';
            let content = line;

            const dtMatch = line.match(dateTimeRegex);
            if (dtMatch) {
                time = `${dtMatch[1]} ${dtMatch[2]}`;
                content = line.slice(dtMatch[0].length);
            } else {
                const tMatch = line.match(timeOnlyRegex);
                if (tMatch) {
                    time = tMatch[1];
                    content = line.slice(tMatch[0].length);
                }
            }

            const colonIdx = content.indexOf(':');
            if (colonIdx > 0 && colonIdx < 40) {
                content = 'Grupo TM SEG: ' + content.slice(colonIdx + 1).trim();
            }

            content = content.replace(/\b[A-ZÁÀÃÉÊÍÓÔÕÚÇ][a-záàãéêíóôõúç]+\s+[A-ZÁÀÃÉÊÍÓÔÕÚÇ][a-záàãéêíóôõúç]+\b/g, 'Grupo TM SEG');

            if (content.trim().length > 2) {
                events.push({ time, description: content.trim() });
            }
        }
        return events;
    };

    const handlePhotoUpload = (slotId: string, file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            setPhotoSlots(prev => prev.map(s => s.id === slotId ? { ...s, file, preview: e.target?.result as string } : s));
        };
        reader.readAsDataURL(file);
    };

    const removePhoto = (slotId: string) => {
        setPhotoSlots(prev => prev.map(s => s.id === slotId ? { ...s, file: null, preview: null } : s));
    };

    const addPhotoSlot = () => {
        const nextId = String(photoSlots.length + 1);
        setPhotoSlots(prev => [...prev, { id: nextId, label: `Foto Adicional ${nextId}`, file: null, preview: null }]);
    };

    const buildPrompt = (logs: any[]) => {
        const logsSummary = logs.map(l => `${fmtDateTime(l.created_at)} - ${l.status}: ${l.description || ''} ${l.location || ''}`).join('\n');
        const whatsappTimeline = whatsappConversation ? parseWhatsAppTimeline(whatsappConversation).map(e => `${e.time} - ${e.description}`).join('\n') : '';

        return `Você é um redator técnico especializado em relatórios operacionais de segurança patrimonial e escolta logística do Grupo TMSEG.

Gere um relatório operacional profissional e extremamente detalhado. Use linguagem técnica corporativa e formal.

DADOS DA OPERAÇÃO:
- OS: ${mission.id}
- Cliente: ${mission.client}
- Tipo: ${(mission as any).mission_type || 'Caracterizada'}
- Status: ${mission.status}
- Origem: ${mission.origin || 'N/A'}
- Destino: ${mission.destination || 'N/A'}
- Data/Hora Início: ${fmtDateTime(startTime)}
- Data/Hora Fim: ${fmtDateTime(endTime)}
- KM Inicial: ${startKm || 'N/A'}
- KM Final: ${endKm || 'N/A'}
- KM Total Percorrido: ${totalKm || 'N/A'}
- Veículo Escoltado: Placa ${(mission as any).clientVehicle?.plate || 'N/A'} - ${(mission as any).clientVehicle?.model || 'N/D'}
- Motorista: ${(mission as any).driver_name || 'N/A'}
- Telefone Motorista: ${(mission as any).driver_phone || 'N/A'}
- Agente 01: ${mission.agent1 || 'N/A'}
- Agente 02: ${mission.agent2 || 'N/A'}
- Viatura: ${(mission as any).vehicleId || 'N/A'}
${acionadoPor ? `- Acionado por: ${acionadoPor}` : ''}

OBSERVAÇÕES DE CAMPO:
${observacoes || 'Operação realizada dentro dos parâmetros estabelecidos.'}

TIMELINE DO SISTEMA:
${logsSummary || 'Sem logs registrados.'}

${whatsappTimeline ? `TIMELINE WHATSAPP (COMUNICAÇÃO OPERACIONAL):\n${whatsappTimeline}` : ''}

FORMATO DO RELATÓRIO (retorne APENAS HTML limpo sem <html><head><body>):

<section class="report-section">
<h3>SÍNTESE OPERACIONAL</h3>
<p>Resumo executivo da operação em 3-4 linhas.</p>
</section>

<section class="report-section">
<h3>DILIGÊNCIA E CONSTATAÇÕES</h3>
<p>Descreva procedimentos realizados, verificações, atividade operacional observada. Transforme observações simples em linguagem técnica profissional de segurança.</p>
</section>

<section class="report-section">
<h3>ANÁLISE DE SEGURANÇA</h3>
<p>Avalie condições de segurança, vulnerabilidades identificadas, pontos de atenção.</p>
</section>

<section class="report-section">
<h3>CRONOLOGIA OPERACIONAL</h3>
<p>Combine timeline do sistema e WhatsApp em ordem cronológica. Use formato de lista <ul><li>. Anonimize todos os nomes substituindo por "Grupo TM SEG".</p>
</section>

<section class="report-section">
<h3>CONCLUSÃO E RECOMENDAÇÕES</h3>
<p>Conclusão técnica e recomendações operacionais para próximas operações.</p>
</section>

REGRAS:
- Retorne APENAS as sections HTML.
- Mínimo 600 palavras.
- NUNCA inclua nomes pessoais de funcionários. Substitua todos por "Grupo TM SEG" ou "Equipe Operacional".
- Use tags <h3>, <p>, <ul>, <li>, <strong>, <em>.
- Seja extremamente profissional e detalhado.`;
    };

    const handleAutoGenerate = async (logs: any[]) => {
        setIsGenerating(true);
        try {
            const logsSummary = logs.map(l => `${fmtDateTime(l.created_at)} - ${l.status}: ${l.description || ''} ${l.location || ''}`).join('\n');

            const prompt = `Você é um redator técnico do Grupo TMSEG. Gere um relatório operacional profissional e completo com base nos dados abaixo.

DADOS: OS ${mission.id}, Cliente: ${mission.client}, Tipo: ${(mission as any).mission_type || 'Caracterizada'}, Status: ${mission.status}, Origem: ${mission.origin || 'N/A'}, Destino: ${mission.destination || 'N/A'}, Início: ${fmtDateTime(startTime)}, Fim: ${fmtDateTime(endTime)}, KM: ${totalKm || 'N/A'}, Veículo: ${(mission as any).clientVehicle?.plate || 'N/A'}, Motorista: ${(mission as any).driver_name || 'N/A'}, Agente 1: ${mission.agent1 || 'N/A'}, Agente 2: ${mission.agent2 || 'N/A'}

TIMELINE: ${logsSummary || 'Sem registros.'}

Retorne APENAS HTML com sections: SÍNTESE OPERACIONAL, DILIGÊNCIA E CONSTATAÇÕES, ANÁLISE DE SEGURANÇA, CRONOLOGIA OPERACIONAL, CONCLUSÃO E RECOMENDAÇÕES. Use <section class="report-section"><h3>TÍTULO</h3><p>...</p></section>. Mínimo 400 palavras. Anonimize nomes.`;

            const result = await generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: { temperature: 0.7 },
                model: 'gemini-2.5-flash'
            });
            setGeneratedReport(result);
        } catch (error: any) {
            console.error('Erro ao gerar relatório:', error);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            if (whatsappConversation) {
                setGeneratedTimeline(parseWhatsAppTimeline(whatsappConversation));
            }

            const prompt = buildPrompt(missionLogs);
            const result = await generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: { temperature: 0.7 },
                model: 'gemini-2.5-flash'
            });
            setGeneratedReport(result);
        } catch (error: any) {
            alert('Erro ao gerar relatório: ' + error.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleExportPDF = async () => {
        if (!reportRef.current) return;
        setIsExporting(true);
        try {
            const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: 794 });
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageWidth = 210;
            const pageHeight = 297;
            const imgWidth = pageWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            let heightLeft = imgHeight;
            let position = 0;
            pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
            while (heightLeft > 0) {
                position = -(imgHeight - heightLeft);
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }
            pdf.save(`Relatorio_Operacional_${mission.id}_${new Date().toISOString().slice(0, 10)}.pdf`);
        } catch (error: any) {
            alert('Erro ao exportar PDF: ' + error.message);
        } finally {
            setIsExporting(false);
        }
    };

    const DataCard = ({ icon: Icon, label, value, accent = false }: { icon: any; label: string; value: string; accent?: boolean }) => (
        <div className={`flex items-start gap-2.5 p-3 rounded-xl border ${accent ? 'bg-gradient-to-br from-red-50 to-orange-50 border-red-100' : 'bg-gradient-to-br from-gray-50 to-slate-50 border-gray-100'}`} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div className="p-1.5 rounded-lg shrink-0" style={{ backgroundColor: accent ? accentColor + '15' : primaryColor + '10' }}>
                <Icon size={13} style={{ color: accent ? accentColor : primaryColor }} />
            </div>
            <div className="min-w-0">
                <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none mb-0.5">{label}</p>
                <p className="text-[11px] font-bold text-gray-800 leading-tight break-words">{value || '—'}</p>
            </div>
        </div>
    );

    const renderReportDocument = () => (
        <div ref={reportRef} className="bg-white" style={{ width: '794px', maxWidth: '100%', margin: '0 auto', boxShadow: '0 8px 40px rgba(0,0,0,0.12)', borderRadius: '12px', overflow: 'hidden' }}>
            <div className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${gradientStart}, ${gradientEnd})`, padding: '28px 32px 24px' }}>
                <div className="absolute top-0 right-0 w-64 h-64 opacity-5" style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)', transform: 'translate(30%, -30%)' }} />
                <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-4">
                        <div className="bg-white/10 backdrop-blur-sm p-2.5 rounded-xl border border-white/20" style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
                            <svg viewBox="0 0 80 80" className="h-10 w-10" fill="none">
                                <path d="M40 5 L10 15 V35 C10 55 25 70 40 75 C55 70 70 55 70 35 V15 L40 5 Z" stroke="#fff" strokeWidth="3" fill="none" strokeLinejoin="round"/>
                                <path d="M20 50 Q40 65 60 40" stroke={accentColor} strokeWidth="5" strokeLinecap="round"/>
                                <path d="M28 22 L40 22 L40 50" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M45 22 L53 36 L61 22 L61 50 M45 50 L45 22" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </div>
                        <div>
                            <p className="text-white/50 text-[9px] font-bold uppercase tracking-[0.3em]">Grupo TMSEG</p>
                            <h1 className="text-white text-lg font-black tracking-wide">RELATÓRIO OPERACIONAL</h1>
                            <p className="text-white/60 text-[10px] font-bold mt-0.5">Segurança e Inteligência Logística</p>
                        </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-2">
                        <div className="bg-white/10 backdrop-blur-sm px-4 py-2 rounded-lg border border-white/20">
                            <p className="text-white/50 text-[8px] font-bold uppercase tracking-wider">Ordem de Serviço</p>
                            <p className="text-white text-xl font-black tracking-wider">{mission.id}</p>
                        </div>
                        {isCeva && <img src="/logo_ceva.png" alt="CEVA" className="h-6 object-contain opacity-80" />}
                    </div>
                </div>
                <div className="h-1 rounded-full mt-5" style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }} />
            </div>

            <div className="px-8 py-5">
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-1 h-4 rounded-full" style={{ backgroundColor: accentColor }} />
                    <h2 className="text-[11px] font-black uppercase tracking-widest" style={{ color: primaryColor }}>Dados da Operação</h2>
                </div>
                <div className="grid grid-cols-4 gap-2">
                    <DataCard icon={Shield} label="Cliente" value={mission.client || ''} accent />
                    <DataCard icon={Activity} label="Tipo Operação" value={(mission as any).mission_type || 'Caracterizada'} />
                    <DataCard icon={FileText} label="Status" value={mission.status || ''} />
                    <DataCard icon={User} label={acionadoPor ? 'Acionado por' : 'Responsável'} value={acionadoPor || mission.agent1 || ''} />
                </div>
                <div className="grid grid-cols-4 gap-2 mt-2">
                    <DataCard icon={MapPin} label="Origem" value={mission.origin || ''} />
                    <DataCard icon={Navigation} label="Destino" value={mission.destination || ''} />
                    <DataCard icon={Clock} label="Início" value={fmtDateTime(startTime)} />
                    <DataCard icon={Clock} label="Término" value={fmtDateTime(endTime)} />
                </div>

                <div className="flex items-center gap-2 mb-3 mt-5">
                    <div className="w-1 h-4 rounded-full" style={{ backgroundColor: accentColor }} />
                    <h2 className="text-[11px] font-black uppercase tracking-widest" style={{ color: primaryColor }}>Dados do Veículo e Agente</h2>
                </div>
                <div className="grid grid-cols-4 gap-2">
                    <DataCard icon={Truck} label="Placa Veículo" value={(mission as any).clientVehicle?.plate || (mission as any).vehicleData?.plate || ''} />
                    <DataCard icon={Truck} label="Modelo" value={(mission as any).clientVehicle?.model || (mission as any).vehicleData?.model || ''} />
                    <DataCard icon={User} label="Motorista" value={(mission as any).driver_name || ''} />
                    <DataCard icon={Phone} label="Tel. Motorista" value={(mission as any).driver_phone || ''} />
                </div>
                <div className="grid grid-cols-4 gap-2 mt-2">
                    <DataCard icon={Shield} label="Agente 01" value={mission.agent1 || ''} accent />
                    <DataCard icon={Shield} label="Agente 02" value={mission.agent2 || ''} accent />
                    <DataCard icon={Navigation} label="KM Inicial / Final" value={`${startKm ? Number(startKm).toLocaleString('pt-BR') : '—'} / ${endKm ? Number(endKm).toLocaleString('pt-BR') : '—'}`} />
                    <DataCard icon={Truck} label="KM Total" value={totalKm ? `${Number(totalKm).toLocaleString('pt-BR')} km` : '—'} />
                </div>
            </div>

            {generatedReport && (
                <div className="px-8 py-4 report-ai-content" dangerouslySetInnerHTML={{ __html: generatedReport }} />
            )}

            {photoSlots.some(s => s.preview) && (
                <div className="px-8 pb-5">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-1 h-4 rounded-full" style={{ backgroundColor: accentColor }} />
                        <h2 className="text-[11px] font-black uppercase tracking-widest" style={{ color: primaryColor }}>Anexo Fotográfico</h2>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        {photoSlots.filter(s => s.preview).map(slot => (
                            <div key={slot.id} className="rounded-xl overflow-hidden border border-gray-200" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
                                <img src={slot.preview!} alt={slot.label} className="w-full h-48 object-cover" />
                                <div className="px-3 py-1.5 bg-gray-50 flex items-center gap-1.5">
                                    <ImageIcon size={10} className="text-gray-400" />
                                    <p className="text-[9px] font-bold text-gray-500 uppercase">{slot.label}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="px-8 py-4 flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${gradientStart}, ${gradientEnd})` }}>
                <div className="flex items-center gap-3">
                    <svg viewBox="0 0 80 80" className="h-5 w-5" fill="none">
                        <path d="M40 5 L10 15 V35 C10 55 25 70 40 75 C55 70 70 55 70 35 V15 L40 5 Z" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinejoin="round"/>
                        <path d="M20 50 Q40 65 60 40" stroke={accentColor} strokeWidth="4" strokeLinecap="round"/>
                    </svg>
                    <div>
                        <span className="text-[8px] font-bold text-white/80 uppercase tracking-wider block">Grupo TMSEG — Segurança e Inteligência Logística</span>
                        <span className="text-[7px] text-white/40">Documento confidencial e de uso exclusivo.</span>
                    </div>
                </div>
                <span className="text-[7px] text-white/40 font-bold">Gerado em {new Date().toLocaleString('pt-BR')}</span>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto py-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl mx-4 my-2 flex flex-col max-h-[96vh]" data-testid="modal-operational-report" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                <div className="flex items-center justify-between px-6 py-3.5 border-b border-gray-100 shrink-0" style={{ background: `linear-gradient(135deg, ${gradientStart}, ${gradientEnd})` }}>
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-white/10 rounded-lg">
                            <FileText size={18} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-white font-black text-sm uppercase tracking-wider">Relatório Operacional</h2>
                            <p className="text-white/50 text-[10px] font-bold">OS {mission.id} — {mission.client}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {generatedReport && (
                            <button onClick={handleExportPDF} disabled={isExporting} className="flex items-center gap-1.5 px-4 py-2 text-[10px] font-black text-white rounded-lg transition-all hover:brightness-110 disabled:opacity-50 uppercase" style={{ backgroundColor: accentColor }} data-testid="button-export-pdf">
                                {isExporting ? <><Loader2 size={12} className="animate-spin" /> Exportando...</> : <><Download size={12} /> Exportar PDF</>}
                            </button>
                        )}
                        <button onClick={onClose} className="text-white/50 hover:text-white transition-colors p-1" data-testid="button-close-report"><X size={18} /></button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto scrollbar-thin">
                    {isClientView ? (
                        <div className="p-6">
                            {isGenerating ? (
                                <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                                    <Loader2 size={32} className="animate-spin mb-3" style={{ color: accentColor }} />
                                    <p className="text-sm font-bold">Gerando relatório...</p>
                                </div>
                            ) : generatedReport ? (
                                renderReportDocument()
                            ) : (
                                <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                                    <FileText size={40} className="mb-3 opacity-30" />
                                    <p className="text-sm font-bold text-gray-500">Relatório não disponível.</p>
                                    <p className="text-xs text-gray-400 mt-1">O relatório operacional ainda não foi gerado para esta OS.</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="p-6 space-y-5">
                            {!generatedReport ? (
                                <>
                                    <div className="p-4 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50">
                                        <p className="text-[10px] font-black text-blue-800 uppercase tracking-wider mb-1 flex items-center gap-1.5"><Sparkles size={12} /> Relatório com Inteligência Artificial</p>
                                        <p className="text-[11px] text-blue-700">Preencha os campos abaixo e a IA irá gerar um relatório profissional completo com linguagem técnica corporativa.</p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-black text-gray-500 uppercase mb-1.5 tracking-wider">Acionado por</label>
                                            <input type="text" value={acionadoPor} onChange={e => setAcionadoPor(e.target.value)} placeholder="Nome de quem acionou a operação..." className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none bg-gray-50/50" data-testid="input-report-requester" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-gray-500 uppercase mb-1.5 tracking-wider">Observações de Campo</label>
                                            <input type="text" value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Observações adicionais..." className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none bg-gray-50/50" data-testid="input-report-observations" />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-black text-gray-500 uppercase mb-1.5 tracking-wider flex items-center gap-1.5">
                                            <svg width={12} height={12} viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>
                                            Conversa WhatsApp (Cole aqui toda a conversa)
                                        </label>
                                        <textarea value={whatsappConversation} onChange={e => setWhatsappConversation(e.target.value)} rows={8} placeholder="Cole aqui a conversa completa do WhatsApp sobre esta operação. O sistema irá gerar automaticamente uma timeline profissional, anonimizando todos os nomes..." className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-xs text-gray-700 font-mono focus:ring-2 focus:ring-green-200 focus:border-green-400 outline-none resize-none bg-gray-50/50" data-testid="input-report-whatsapp" />
                                    </div>

                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5"><ImageIcon size={12} /> Anexo Fotográfico</label>
                                            <button onClick={addPhotoSlot} className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors" data-testid="button-add-photo-slot"><Plus size={12} /> Adicionar</button>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            {photoSlots.map(slot => (
                                                <div key={slot.id} className="border-2 border-dashed border-gray-200 rounded-xl overflow-hidden bg-gray-50/50 hover:border-gray-300 transition-colors">
                                                    {slot.preview ? (
                                                        <div className="relative">
                                                            <img src={slot.preview} alt={slot.label} className="w-full h-32 object-cover" />
                                                            <button onClick={() => removePhoto(slot.id)} className="absolute top-1.5 right-1.5 p-1 bg-red-600 text-white rounded-full hover:bg-red-700 shadow-md" data-testid={`button-remove-photo-${slot.id}`}><Trash2 size={10} /></button>
                                                            <p className="text-[8px] font-bold text-gray-500 text-center py-1 bg-white/80">{slot.label}</p>
                                                        </div>
                                                    ) : (
                                                        <label className="flex flex-col items-center justify-center h-32 cursor-pointer hover:bg-gray-100 transition-colors">
                                                            <Upload size={20} className="text-gray-300 mb-1.5" />
                                                            <p className="text-[9px] font-bold text-gray-400 text-center px-2">{slot.label}</p>
                                                            <input type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handlePhotoUpload(slot.id, e.target.files[0]); }} data-testid={`input-photo-${slot.id}`} />
                                                        </label>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <button onClick={handleGenerate} disabled={isGenerating} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-black text-sm uppercase tracking-wider transition-all shadow-lg hover:shadow-xl disabled:opacity-50" style={{ background: `linear-gradient(135deg, ${gradientStart}, ${gradientEnd})` }} data-testid="button-generate-report">
                                        {isGenerating ? <><Loader2 size={18} className="animate-spin" /> Gerando Relatório com IA...</> : <><Sparkles size={18} /> Gerar Relatório</>}
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div className="flex items-center gap-2 mb-2">
                                        <button onClick={() => setGeneratedReport(null)} className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors" data-testid="button-back-to-form">← Editar Dados</button>
                                    </div>
                                    {renderReportDocument()}
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                .report-ai-content { padding-left: 32px; padding-right: 32px; }
                .report-ai-content .report-section { margin-bottom: 20px; }
                .report-ai-content h3 { font-size: 12px; font-weight: 900; color: ${primaryColor}; text-transform: uppercase; letter-spacing: 1px; padding: 6px 0 6px 12px; border-left: 3px solid ${accentColor}; margin-bottom: 8px; background: linear-gradient(90deg, ${primaryColor}08, transparent); }
                .report-ai-content p { font-size: 11px; line-height: 1.8; color: #374151; margin-bottom: 6px; }
                .report-ai-content ul { padding-left: 16px; margin-bottom: 10px; }
                .report-ai-content li { font-size: 11px; line-height: 1.7; color: #374151; margin-bottom: 3px; list-style-type: disc; }
                .report-ai-content strong { color: #111827; font-weight: 800; }
                .report-ai-content em { color: ${primaryColor}; font-style: normal; font-weight: 700; }
            `}</style>
        </div>
    );
};

export default MissionOperationalReport;
