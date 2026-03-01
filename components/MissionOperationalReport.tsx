import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mission, MissionStatus } from '../types';
import { supabase } from '../lib/supabase';
import { generateContent } from '../lib/gemini';
import { X, Loader2, FileText, Upload, Trash2, Sparkles, Download, Image as ImageIcon, Plus, Clock, MapPin, Truck, User, Shield, Phone, Navigation, Activity, Camera, Gauge, RefreshCw, PenLine } from 'lucide-react';
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

const PhotoUploadBox = ({ label, preview, onUpload, onRemove, icon: Icon }: { label: string; preview: string | null; onUpload: (f: File) => void; onRemove: () => void; icon: any }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    return (
        <div className="border-2 border-dashed border-gray-200 rounded-xl overflow-hidden bg-gray-50/50 hover:border-gray-300 transition-colors">
            {preview ? (
                <div className="relative">
                    <img src={preview} alt={label} className="w-full h-28 object-cover" />
                    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }} className="absolute top-1.5 right-1.5 p-1 bg-red-600 text-white rounded-full hover:bg-red-700 shadow-md"><Trash2 size={10} /></button>
                    <p className="text-[8px] font-black text-gray-500 text-center py-1.5 bg-white/90 uppercase tracking-wider">{label}</p>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center h-28 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => inputRef.current?.click()}>
                    <Icon size={18} className="text-gray-300 mb-1" />
                    <p className="text-[9px] font-bold text-gray-400 text-center px-2">{label}</p>
                    <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) { onUpload(e.target.files[0]); e.target.value = ''; } }} />
                </div>
            )}
        </div>
    );
};

const MissionOperationalReport: React.FC<Props> = ({ mission, onClose, isClientView = false, isInternalEditor = false }) => {
    const [acionadoPor, setAcionadoPor] = useState('');
    const [descritivoOperacao, setDescritivoOperacao] = useState('');
    const [whatsappConversation, setWhatsappConversation] = useState('');
    const [editSuggestion, setEditSuggestion] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedReport, setGeneratedReport] = useState<string | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [missionLogs, setMissionLogs] = useState<any[]>([]);
    const reportRef = useRef<HTMLDivElement>(null);

    const [kmInicialPreview, setKmInicialPreview] = useState<string | null>(null);
    const [kmFinalPreview, setKmFinalPreview] = useState<string | null>(null);
    const [localPhotos, setLocalPhotos] = useState<PhotoSlot[]>([
        { id: 'loc1', label: 'Foto do Local 1', file: null, preview: null },
        { id: 'loc2', label: 'Foto do Local 2', file: null, preview: null },
        { id: 'loc3', label: 'Foto do Local 3', file: null, preview: null },
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

    const handleFileToPreview = useCallback((file: File, setter: (v: string | null) => void) => {
        const reader = new FileReader();
        reader.onloadend = () => setter(reader.result as string);
        reader.readAsDataURL(file);
    }, []);

    const handleLocalPhotoUpload = useCallback((slotId: string, file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            setLocalPhotos(prev => prev.map(s => s.id === slotId ? { ...s, file, preview: reader.result as string } : s));
        };
        reader.readAsDataURL(file);
    }, []);

    const removeLocalPhoto = useCallback((slotId: string) => {
        setLocalPhotos(prev => prev.map(s => s.id === slotId ? { ...s, file: null, preview: null } : s));
    }, []);

    const addLocalPhotoSlot = useCallback(() => {
        const nextNum = localPhotos.length + 1;
        setLocalPhotos(prev => [...prev, { id: `loc${Date.now()}`, label: `Foto do Local ${nextNum}`, file: null, preview: null }]);
    }, [localPhotos.length]);

    const buildPrompt = (logs: any[], refinement?: string) => {
        const logsSummary = logs.map(l => `${fmtDateTime(l.created_at)} - ${l.status}: ${l.description || ''} ${l.location || ''}`).join('\n');
        const whatsappTimeline = whatsappConversation ? parseWhatsAppTimeline(whatsappConversation).map(e => `${e.time} - ${e.description}`).join('\n') : '';

        let prompt = `Você é um redator técnico de relatórios operacionais de escolta de cargas do Grupo TMSEG.

INSTRUÇÕES DE ESTILO:
- Use português claro e direto. Evite palavras rebuscadas ou termos excessivamente técnicos.
- Prefira frases curtas e objetivas. Vá direto ao ponto.
- Use "Agente de Campo" para se referir ao profissional que executou a operação. NUNCA use "Equipe Operacional".
- Use "Central de Monitoramento" para a base que coordena. NUNCA use "Comando Operacional".
- Seja 100% imparcial na análise de segurança. Relate APENAS o que foi observado, sem elogiar nem criticar.
- NUNCA inclua nomes de pessoas. Substitua por "Agente de Campo", "Grupo TM SEG", "Motorista".

CONTEXTO (descrito pelo operador):
${descritivoOperacao || 'Operação padrão de escolta.'}

DADOS:
- OS: ${mission.id}
- Cliente: ${mission.client}
- Tipo: ${(mission as any).mission_type || 'Caracterizada'}
- Status: ${mission.status}
- Origem: ${mission.origin || 'N/A'}
- Destino: ${mission.destination || 'N/A'}
- Início: ${fmtDateTime(startTime)}
- Fim: ${fmtDateTime(endTime)}
- KM Inicial: ${startKm || 'N/A'} | KM Final: ${endKm || 'N/A'} | KM Total: ${totalKm || 'N/A'}
- Veículo: ${(mission as any).clientVehicle?.plate || (mission as any).vehicle_plate || 'N/A'} - ${(mission as any).clientVehicle?.model || 'N/D'}
- Motorista: ${(mission as any).driver_name || 'N/A'}
- Agente 01: ${mission.agent1 || 'N/A'}
- Agente 02: ${mission.agent2 || 'N/A'}
${acionadoPor ? `- Acionado por: ${acionadoPor}` : ''}

REGISTROS DO SISTEMA:
${logsSummary || 'Sem registros.'}

${whatsappTimeline ? `COMUNICAÇÃO (WhatsApp):\n${whatsappTimeline}` : ''}

FORMATO (retorne APENAS o HTML abaixo, sem <html><head><body>):

<section class="report-section">
<h3>SÍNTESE OPERACIONAL</h3>
<p>Resumo direto em 3-4 linhas: o que foi feito, onde, quando e o resultado.</p>
</section>

<section class="report-section">
<h3>DILIGÊNCIA E CONSTATAÇÕES IN LOCO</h3>
<p>O que o Agente de Campo fez e encontrou no local. Transforme o descritivo do operador em texto profissional mas com palavras simples. Relate fatos.</p>
</section>

<section class="report-section">
<h3>ANÁLISE DE SEGURANÇA</h3>
<p>Análise imparcial: condições do trajeto, riscos observados, pontos de atenção. Apenas fatos, sem opinião.</p>
</section>

<section class="report-section">
<h3>CRONOLOGIA OPERACIONAL</h3>
<p>Combine os registros do sistema e WhatsApp em ordem de horário. Use <ul><li>. Substitua nomes por "Grupo TM SEG" ou "Agente de Campo".</p>
</section>

REGRAS:
- Retorne APENAS as 4 sections.
- Mínimo 400 palavras.
- Português claro e simples, sem palavras difíceis.
- Use <h3>, <p>, <ul>, <li>, <strong>.`;

        if (refinement) {
            prompt += `\n\nAJUSTES SOLICITADOS PELO OPERADOR (aplique estas correções ao relatório anterior):\n${refinement}\n\nRELATÓRIO ANTERIOR PARA AJUSTAR:\n${generatedReport}`;
        }

        return prompt;
    };

    const handleAutoGenerate = async (logs: any[]) => {
        setIsGenerating(true);
        try {
            const logsSummary = logs.map(l => `${fmtDateTime(l.created_at)} - ${l.status}: ${l.description || ''} ${l.location || ''}`).join('\n');
            const prompt = `Você é um redator técnico do Grupo TMSEG. Gere um relatório operacional profissional mas com linguagem simples e direta.

REGRAS: Use "Agente de Campo" (nunca "Equipe Operacional"). Seja objetivo e imparcial. Português claro, sem palavras rebuscadas.

DADOS: OS ${mission.id}, Cliente: ${mission.client}, Tipo: ${(mission as any).mission_type || 'Caracterizada'}, Status: ${mission.status}, Origem: ${mission.origin || 'N/A'}, Destino: ${mission.destination || 'N/A'}, Início: ${fmtDateTime(startTime)}, Fim: ${fmtDateTime(endTime)}, KM: ${totalKm || 'N/A'}, Veículo: ${(mission as any).clientVehicle?.plate || 'N/A'}, Agente 1: ${mission.agent1 || 'N/A'}, Agente 2: ${mission.agent2 || 'N/A'}

REGISTROS: ${logsSummary || 'Sem registros.'}

Retorne APENAS HTML com sections: SÍNTESE OPERACIONAL, DILIGÊNCIA E CONSTATAÇÕES IN LOCO, ANÁLISE DE SEGURANÇA, CRONOLOGIA OPERACIONAL. Use <section class="report-section"><h3>TÍTULO</h3><p>...</p></section>. Mínimo 300 palavras.`;

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

    const handleRefine = async () => {
        if (!editSuggestion.trim()) return;
        setIsGenerating(true);
        try {
            const prompt = buildPrompt(missionLogs, editSuggestion);
            const result = await generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: { temperature: 0.7 },
                model: 'gemini-2.5-flash'
            });
            setGeneratedReport(result);
            setEditSuggestion('');
        } catch (error: any) {
            alert('Erro ao refinar relatório: ' + error.message);
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

    const DataRow = ({ icon: Icon, label, value, accent = false, full = false }: { icon: any; label: string; value: string; accent?: boolean; full?: boolean }) => (
        <div className={`flex items-center gap-3 py-2.5 px-4 rounded-lg border ${accent ? 'border-red-100 bg-red-50/40' : 'border-gray-100 bg-white'} ${full ? 'col-span-2' : ''}`} style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <div className="p-1.5 rounded-md shrink-0" style={{ backgroundColor: accent ? accentColor + '12' : primaryColor + '08' }}>
                <Icon size={14} style={{ color: accent ? accentColor : primaryColor }} />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-[8px] font-black text-gray-400 uppercase tracking-[0.15em] leading-none mb-0.5">{label}</p>
                <p className="text-[12px] font-bold text-gray-800 leading-snug break-words">{value || '—'}</p>
            </div>
        </div>
    );

    const allPhotos = [
        ...(kmInicialPreview ? [{ label: 'KM Inicial', preview: kmInicialPreview }] : []),
        ...(kmFinalPreview ? [{ label: 'KM Final', preview: kmFinalPreview }] : []),
        ...localPhotos.filter(s => s.preview).map(s => ({ label: s.label, preview: s.preview! })),
    ];

    const renderReportDocument = () => (
        <div ref={reportRef} className="bg-white" style={{ width: '794px', maxWidth: '100%', margin: '0 auto', boxShadow: '0 8px 40px rgba(0,0,0,0.12)', borderRadius: '16px', overflow: 'hidden' }}>
            <div className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${gradientStart}, ${gradientEnd})`, padding: '24px 32px 20px' }}>
                <div className="absolute top-0 right-0 w-80 h-80 opacity-[0.03]" style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)', transform: 'translate(30%, -40%)' }} />

                <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-4">
                        <img src="/logo.png" alt="TMSEG" className="h-10 w-auto object-contain drop-shadow-lg" crossOrigin="anonymous" />
                    </div>
                    <div className="flex items-center gap-4">
                        {isCeva && (
                            <div className="bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/15">
                                <img src="/logo_ceva.png" alt="CEVA" className="h-5 object-contain" style={{ mixBlendMode: 'lighten' }} crossOrigin="anonymous" />
                            </div>
                        )}
                        <div className="bg-white/10 backdrop-blur-sm px-4 py-2 rounded-lg border border-white/15 text-center">
                            <p className="text-white/40 text-[7px] font-bold uppercase tracking-[0.2em]">Ordem de Serviço</p>
                            <p className="text-white text-lg font-black tracking-wider leading-tight">{mission.id}</p>
                        </div>
                    </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                    <h1 className="text-white text-[15px] font-black uppercase tracking-[0.15em]">Relatório Operacional</h1>
                    <p className="text-white/30 text-[8px] font-bold">{new Date().toLocaleString('pt-BR')}</p>
                </div>
                <div className="h-[2px] rounded-full mt-3" style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor}40, transparent)` }} />
            </div>

            <div className="px-8 pt-6 pb-2">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-[3px] h-5 rounded-full" style={{ backgroundColor: accentColor }} />
                    <h2 className="text-[12px] font-black uppercase tracking-[0.15em]" style={{ color: primaryColor }}>Dados da Operação</h2>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                    <DataRow icon={Shield} label="Cliente" value={mission.client || ''} accent />
                    <DataRow icon={Activity} label="Tipo de Operação" value={(mission as any).mission_type || 'Caracterizada'} />
                    <DataRow icon={FileText} label="Status" value={mission.status || ''} />
                    <DataRow icon={User} label="Acionado por" value={acionadoPor || '—'} />
                    <DataRow icon={MapPin} label="Origem" value={mission.origin || ''} full />
                    <DataRow icon={Navigation} label="Destino" value={mission.destination || ''} full />
                    <DataRow icon={Clock} label="Data / Hora Início" value={fmtDateTime(startTime)} />
                    <DataRow icon={Clock} label="Data / Hora Término" value={fmtDateTime(endTime)} />
                </div>
            </div>

            <div className="px-8 pt-4 pb-2">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-[3px] h-5 rounded-full" style={{ backgroundColor: accentColor }} />
                    <h2 className="text-[12px] font-black uppercase tracking-[0.15em]" style={{ color: primaryColor }}>Dados do Veículo</h2>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                    <DataRow icon={Truck} label="Placa do Veículo" value={(mission as any).clientVehicle?.plate || (mission as any).vehicleData?.plate || (mission as any).vehicle_plate || ''} />
                    <DataRow icon={Truck} label="Modelo" value={(mission as any).clientVehicle?.model || (mission as any).vehicleData?.model || ''} />
                    <DataRow icon={User} label="Motorista" value={(mission as any).driver_name || ''} />
                    <DataRow icon={Phone} label="Telefone do Motorista" value={(mission as any).driver_phone || ''} />
                </div>
            </div>

            <div className="px-8 pt-4 pb-2">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-[3px] h-5 rounded-full" style={{ backgroundColor: accentColor }} />
                    <h2 className="text-[12px] font-black uppercase tracking-[0.15em]" style={{ color: primaryColor }}>Agente de Campo</h2>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                    <DataRow icon={Shield} label="Agente 01" value={mission.agent1 || ''} accent />
                    <DataRow icon={Shield} label="Agente 02" value={mission.agent2 || ''} accent />
                </div>
            </div>

            <div className="px-8 pt-4 pb-4">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-[3px] h-5 rounded-full" style={{ backgroundColor: accentColor }} />
                    <h2 className="text-[12px] font-black uppercase tracking-[0.15em]" style={{ color: primaryColor }}>Quilometragem</h2>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                    <DataRow icon={Gauge} label="KM Inicial" value={startKm ? Number(startKm).toLocaleString('pt-BR') : '—'} />
                    <DataRow icon={Gauge} label="KM Final" value={endKm ? Number(endKm).toLocaleString('pt-BR') : '—'} />
                    <DataRow icon={Navigation} label="KM Total Percorrido" value={totalKm ? `${Number(totalKm).toLocaleString('pt-BR')} km` : '—'} accent />
                </div>
            </div>

            {generatedReport && (
                <div className="px-8 py-2 report-ai-content" dangerouslySetInnerHTML={{ __html: generatedReport }} />
            )}

            {allPhotos.length > 0 && (
                <div className="px-8 pt-2 pb-5">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-[3px] h-5 rounded-full" style={{ backgroundColor: accentColor }} />
                        <h2 className="text-[12px] font-black uppercase tracking-[0.15em]" style={{ color: primaryColor }}>Registro Fotográfico</h2>
                    </div>
                    {(kmInicialPreview || kmFinalPreview) && (
                        <div className="grid grid-cols-2 gap-3 mb-3">
                            {kmInicialPreview && (
                                <div className="rounded-xl overflow-hidden border border-gray-200" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                                    <img src={kmInicialPreview} alt="KM Inicial" className="w-full h-44 object-cover" />
                                    <div className="px-3 py-1.5 bg-gray-50 flex items-center gap-1.5 border-t border-gray-100">
                                        <Gauge size={10} className="text-gray-400" />
                                        <p className="text-[9px] font-black text-gray-500 uppercase tracking-wider">KM Inicial</p>
                                    </div>
                                </div>
                            )}
                            {kmFinalPreview && (
                                <div className="rounded-xl overflow-hidden border border-gray-200" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                                    <img src={kmFinalPreview} alt="KM Final" className="w-full h-44 object-cover" />
                                    <div className="px-3 py-1.5 bg-gray-50 flex items-center gap-1.5 border-t border-gray-100">
                                        <Gauge size={10} className="text-gray-400" />
                                        <p className="text-[9px] font-black text-gray-500 uppercase tracking-wider">KM Final</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {localPhotos.filter(s => s.preview).length > 0 && (
                        <div className="grid grid-cols-3 gap-3">
                            {localPhotos.filter(s => s.preview).map(slot => (
                                <div key={slot.id} className="rounded-xl overflow-hidden border border-gray-200" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                                    <img src={slot.preview!} alt={slot.label} className="w-full h-36 object-cover" />
                                    <div className="px-3 py-1.5 bg-gray-50 flex items-center gap-1.5 border-t border-gray-100">
                                        <Camera size={10} className="text-gray-400" />
                                        <p className="text-[9px] font-black text-gray-500 uppercase tracking-wider">{slot.label}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="px-8 py-3 flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${gradientStart}, ${gradientEnd})` }}>
                <div className="flex items-center gap-3">
                    <img src="/logo.png" alt="TMSEG" className="h-5 w-auto object-contain opacity-80" crossOrigin="anonymous" />
                </div>
                <span className="text-[7px] text-white/40 font-bold">Documento confidencial — Gerado em {new Date().toLocaleString('pt-BR')}</span>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto py-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl mx-4 my-2 flex flex-col max-h-[96vh]" data-testid="modal-operational-report" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 shrink-0" style={{ background: `linear-gradient(135deg, ${gradientStart}, ${gradientEnd})` }}>
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
                                        <p className="text-[11px] text-blue-700">Preencha o descritivo da operação e a IA vai gerar um relatório profissional e objetivo.</p>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-black text-gray-500 uppercase mb-1.5 tracking-wider">Acionado por</label>
                                        <input type="text" value={acionadoPor} onChange={e => setAcionadoPor(e.target.value)} placeholder="Nome de quem acionou a operação..." className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none bg-gray-50/50" data-testid="input-report-requester" />
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-black text-gray-500 uppercase mb-1.5 tracking-wider flex items-center gap-1.5">
                                            <FileText size={12} className="text-gray-400" />
                                            Descritivo da Operação
                                        </label>
                                        <textarea value={descritivoOperacao} onChange={e => setDescritivoOperacao(e.target.value)} rows={4} placeholder="Descreva o que aconteceu nesta operação. Ex: Escolta do CD até entrega sem problemas. Acompanhamento pela BR-116, parada para abastecimento no km 45..." className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none resize-none bg-gray-50/50" data-testid="input-report-description" />
                                        <p className="text-[9px] text-gray-400 mt-1">A IA vai usar este texto para gerar o relatório final.</p>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-black text-gray-500 uppercase mb-1.5 tracking-wider flex items-center gap-1.5">
                                            <svg width={12} height={12} viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>
                                            Conversa WhatsApp (Cole toda a conversa)
                                        </label>
                                        <textarea value={whatsappConversation} onChange={e => setWhatsappConversation(e.target.value)} rows={6} placeholder="Cole aqui a conversa do WhatsApp sobre esta operação. O sistema vai gerar uma timeline, trocando todos os nomes por 'Grupo TM SEG'..." className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-xs text-gray-700 font-mono focus:ring-2 focus:ring-green-200 focus:border-green-400 outline-none resize-none bg-gray-50/50" data-testid="input-report-whatsapp" />
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-2"><Gauge size={12} /> Fotos de Quilometragem</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <PhotoUploadBox label="KM Inicial" preview={kmInicialPreview} onUpload={(f) => handleFileToPreview(f, setKmInicialPreview)} onRemove={() => setKmInicialPreview(null)} icon={Gauge} />
                                            <PhotoUploadBox label="KM Final" preview={kmFinalPreview} onUpload={(f) => handleFileToPreview(f, setKmFinalPreview)} onRemove={() => setKmFinalPreview(null)} icon={Gauge} />
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5"><Camera size={12} /> Fotos do Local</label>
                                            <button type="button" onClick={addLocalPhotoSlot} className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors" data-testid="button-add-photo-slot"><Plus size={12} /> Adicionar</button>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            {localPhotos.map(slot => (
                                                <PhotoUploadBox
                                                    key={slot.id}
                                                    label={slot.label}
                                                    preview={slot.preview}
                                                    onUpload={(f) => handleLocalPhotoUpload(slot.id, f)}
                                                    onRemove={() => removeLocalPhoto(slot.id)}
                                                    icon={Camera}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    <button type="button" onClick={handleGenerate} disabled={isGenerating} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-black text-sm uppercase tracking-wider transition-all shadow-lg hover:shadow-xl disabled:opacity-50" style={{ background: `linear-gradient(135deg, ${gradientStart}, ${gradientEnd})` }} data-testid="button-generate-report">
                                        {isGenerating ? <><Loader2 size={18} className="animate-spin" /> Gerando Relatório com IA...</> : <><Sparkles size={18} /> Gerar Relatório</>}
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div className="flex items-center gap-2 mb-3">
                                        <button type="button" onClick={() => setGeneratedReport(null)} className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors" data-testid="button-back-to-form">← Voltar ao Formulário</button>
                                    </div>

                                    {renderReportDocument()}

                                    <div className="mt-5 p-4 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50">
                                        <label className="block text-[10px] font-black text-amber-800 uppercase mb-2 tracking-wider flex items-center gap-1.5">
                                            <PenLine size={12} />
                                            Edição ou Sugestão de Alteração
                                        </label>
                                        <textarea value={editSuggestion} onChange={e => setEditSuggestion(e.target.value)} rows={3} placeholder="Descreva aqui o que quer alterar no relatório. Ex: 'Remover menção ao abastecimento', 'Detalhar mais a parte de segurança', 'Trocar cronologia para iniciar às 08:30'..." className="w-full px-3 py-2.5 border border-amber-200 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-amber-200 focus:border-amber-400 outline-none resize-none bg-white" data-testid="input-report-edit-suggestion" />
                                        <button type="button" onClick={handleRefine} disabled={isGenerating || !editSuggestion.trim()} className="mt-2 flex items-center gap-2 px-4 py-2.5 rounded-lg text-white font-black text-[10px] uppercase tracking-wider transition-all hover:brightness-110 disabled:opacity-40" style={{ backgroundColor: accentColor }} data-testid="button-refine-report">
                                            {isGenerating ? <><Loader2 size={14} className="animate-spin" /> Ajustando...</> : <><RefreshCw size={14} /> Aplicar Ajustes com IA</>}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                .report-ai-content .report-section { margin-bottom: 16px; }
                .report-ai-content h3 { font-size: 12px; font-weight: 900; color: ${primaryColor}; text-transform: uppercase; letter-spacing: 1.5px; padding: 8px 0 8px 14px; border-left: 3px solid ${accentColor}; margin-bottom: 10px; background: linear-gradient(90deg, ${primaryColor}06, transparent); border-radius: 0 6px 6px 0; }
                .report-ai-content p { font-size: 11px; line-height: 1.85; color: #374151; margin-bottom: 8px; text-align: justify; }
                .report-ai-content ul { padding-left: 18px; margin-bottom: 12px; }
                .report-ai-content li { font-size: 11px; line-height: 1.75; color: #374151; margin-bottom: 4px; list-style-type: disc; }
                .report-ai-content strong { color: #111827; font-weight: 800; }
                .report-ai-content em { color: ${primaryColor}; font-style: normal; font-weight: 700; }
            `}</style>
        </div>
    );
};

export default MissionOperationalReport;
