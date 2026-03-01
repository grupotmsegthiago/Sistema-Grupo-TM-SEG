import React, { useState, useRef, useCallback } from 'react';
import { Mission, Client } from '../types';
import { supabase } from '../lib/supabase';
import { generateContent } from '../lib/gemini';
import { X, Loader2, FileText, Upload, Trash2, Sparkles, Download, Image as ImageIcon, Plus } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface Props {
    mission: Mission;
    clientData?: Client;
    onClose: () => void;
}

interface PhotoSlot {
    id: string;
    label: string;
    file: File | null;
    preview: string | null;
}

const MissionOperationalReport: React.FC<Props> = ({ mission, clientData, onClose }) => {
    const [operacao, setOperacao] = useState(mission.client || '');
    const [agente, setAgente] = useState(mission.agent1 || '');
    const [endereco, setEndereco] = useState(`${mission.origin || ''} → ${mission.destination || ''}`);
    const [observacoes, setObservacoes] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedReport, setGeneratedReport] = useState<string | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const reportRef = useRef<HTMLDivElement>(null);
    const [photoSlots, setPhotoSlots] = useState<PhotoSlot[]>([
        { id: '1', label: 'Foto da Fachada / Entrada', file: null, preview: null },
        { id: '2', label: 'Visão do Pátio / Drone', file: null, preview: null },
        { id: '3', label: 'Detalhes (Placas, Alarmes, etc.)', file: null, preview: null },
    ]);

    const isCeva = (mission.client || '').toUpperCase().includes('CEVA');

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

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            const startDate = mission.startTime || mission.start_time;
            const endDate = mission.endTime || mission.end_time;
            const startFmt = startDate ? new Date(startDate).toLocaleString('pt-BR') : 'N/A';
            const endFmt = endDate ? new Date(endDate).toLocaleString('pt-BR') : 'N/A';
            const kmStart = mission.startKm || (mission as any).start_km || 0;
            const kmEnd = mission.endKm || (mission as any).end_km || 0;
            const totalKm = kmEnd > kmStart ? kmEnd - kmStart : (mission as any).total_distance || 0;

            const { data: logs } = await supabase
                .from('mission_logs')
                .select('*')
                .eq('mission_id', mission.id)
                .order('created_at', { ascending: true });

            const logsSummary = (logs || []).map(l => `${new Date(l.created_at).toLocaleString('pt-BR')} - ${l.status}: ${l.description || ''} ${l.location || ''}`).join('\n');

            const prompt = `Você é um redator técnico especializado em relatórios operacionais de segurança patrimonial e escolta logística do Grupo TMSEG.

Gere um relatório operacional profissional e detalhado com base nos dados abaixo. Use linguagem técnica corporativa, formal e objetiva. Transforme observações simples em descrições profissionais.

DADOS DA OPERAÇÃO:
- OS: ${mission.id}
- Cliente: ${mission.client}
- Operação/Local: ${operacao}
- Agente Responsável: ${agente}
- Endereço/Rota: ${endereco}
- Tipo: ${(mission as any).mission_type || 'Caracterizada'}
- Status: ${mission.status}
- Data/Hora Início: ${startFmt}
- Data/Hora Fim: ${endFmt}
- KM Total: ${totalKm} km
- Origem: ${mission.origin || 'N/A'}
- Destino: ${mission.destination || 'N/A'}
- Veículo Cliente: ${(mission as any).clientVehicle?.plate || 'N/A'}
- Motorista: ${(mission as any).driver_name || 'N/A'}
- Agente 1: ${mission.agent1 || 'N/A'}
- Agente 2: ${mission.agent2 || 'N/A'}

OBSERVAÇÕES DE CAMPO DO AGENTE:
${observacoes || 'Operação realizada sem intercorrências.'}

TIMELINE DE LOGS:
${logsSummary || 'Sem logs registrados.'}

FORMATO OBRIGATÓRIO DO RELATÓRIO (use exatamente estas seções em HTML):

<h2>Relatório de Inspeção e Averiguação Operacional</h2>
<p class="subtitle">OS ${mission.id} – ${mission.client}</p>

<h3>I. Informações Gerais</h3>
<p>Detalhe: operação, localização, data/hora, objetivo da missão.</p>

<h3>II. Diligência e Constatações In Loco</h3>
<p>Descreva de forma técnica: acesso, identificação, atividade operacional observada, inteligência de campo. Transforme as observações simples em linguagem profissional de segurança.</p>

<h3>III. Análise de Segurança e Vulnerabilidades</h3>
<p>Avalie: segurança física, segurança eletrônica, pontos de atenção identificados.</p>

<h3>IV. Cronologia Operacional</h3>
<p>Liste os eventos da timeline em formato cronológico.</p>

<h3>V. Conclusão e Recomendações</h3>
<p>Conclusão técnica e recomendações operacionais.</p>

REGRAS:
- Retorne APENAS o HTML do conteúdo (sem <html>, <head>, <body>).
- Use tags <h2>, <h3>, <p>, <ul>, <li>, <strong>.
- Seja detalhado e profissional.
- Mínimo 500 palavras.`;

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
            const canvas = await html2canvas(reportRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                windowWidth: 794,
            });

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

            pdf.save(`Relatorio_${mission.id}_${new Date().toISOString().slice(0, 10)}.pdf`);
        } catch (error: any) {
            alert('Erro ao exportar PDF: ' + error.message);
        } finally {
            setIsExporting(false);
        }
    };

    const primaryColor = isCeva ? '#152c54' : '#7f1d1d';
    const accentColor = isCeva ? '#e81818' : '#b91c1c';

    return (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-6" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl mx-4 my-4 flex flex-col max-h-[95vh]" data-testid="modal-operational-report">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0" style={{ backgroundColor: primaryColor }}>
                    <div className="flex items-center gap-3">
                        <FileText size={20} className="text-white" />
                        <div>
                            <h2 className="text-white font-bold text-sm uppercase tracking-wider">Relatório Operacional</h2>
                            <p className="text-white/70 text-[10px] font-bold">OS {mission.id} — {mission.client}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-white/70 hover:text-white transition-colors" data-testid="button-close-report"><X size={20} /></button>
                </div>

                <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-6">
                    {!generatedReport ? (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Operação / Local</label>
                                    <input type="text" value={operacao} onChange={e => setOperacao(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-800 focus:ring-2 focus:ring-red-200 focus:border-red-400 outline-none" data-testid="input-report-operation" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Agente Responsável</label>
                                    <input type="text" value={agente} onChange={e => setAgente(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-800 focus:ring-2 focus:ring-red-200 focus:border-red-400 outline-none" data-testid="input-report-agent" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Endereço / Rota</label>
                                <input type="text" value={endereco} onChange={e => setEndereco(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-800 focus:ring-2 focus:ring-red-200 focus:border-red-400 outline-none" data-testid="input-report-address" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Observações de Campo</label>
                                <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={5} placeholder="Descreva suas observações de campo. A IA irá transformar em linguagem técnica profissional..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 focus:ring-2 focus:ring-red-200 focus:border-red-400 outline-none resize-none" data-testid="input-report-observations" />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <label className="text-[10px] font-black text-gray-500 uppercase flex items-center gap-1.5"><ImageIcon size={12} /> Anexo Fotográfico</label>
                                    <button onClick={addPhotoSlot} className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors" data-testid="button-add-photo-slot"><Plus size={12} /> Adicionar Foto</button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    {photoSlots.map(slot => (
                                        <div key={slot.id} className="border-2 border-dashed border-gray-200 rounded-xl overflow-hidden bg-gray-50 hover:border-gray-300 transition-colors">
                                            {slot.preview ? (
                                                <div className="relative">
                                                    <img src={slot.preview} alt={slot.label} className="w-full h-40 object-cover" />
                                                    <button onClick={() => removePhoto(slot.id)} className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded-full hover:bg-red-700 shadow-md" data-testid={`button-remove-photo-${slot.id}`}><Trash2 size={12} /></button>
                                                    <p className="text-[9px] font-bold text-gray-500 text-center py-1 bg-white/80">{slot.label}</p>
                                                </div>
                                            ) : (
                                                <label className="flex flex-col items-center justify-center h-40 cursor-pointer hover:bg-gray-100 transition-colors">
                                                    <Upload size={24} className="text-gray-300 mb-2" />
                                                    <p className="text-[10px] font-bold text-gray-400 text-center px-2">{slot.label}</p>
                                                    <input type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handlePhotoUpload(slot.id, e.target.files[0]); }} data-testid={`input-photo-${slot.id}`} />
                                                </label>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <button onClick={handleGenerate} disabled={isGenerating} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-black text-sm uppercase tracking-wider transition-all shadow-md hover:shadow-lg disabled:opacity-50" style={{ backgroundColor: primaryColor }} data-testid="button-generate-report">
                                {isGenerating ? <><Loader2 size={18} className="animate-spin" /> Gerando Relatório com IA...</> : <><Sparkles size={18} /> Gerar Relatório</>}
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center gap-2 mb-2">
                                <button onClick={() => setGeneratedReport(null)} className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors" data-testid="button-back-to-form">← Voltar e Editar</button>
                                <button onClick={handleExportPDF} disabled={isExporting} className="flex items-center gap-1 px-4 py-1.5 text-[10px] font-bold text-white rounded-lg transition-all shadow-sm hover:shadow-md disabled:opacity-50" style={{ backgroundColor: accentColor }} data-testid="button-export-pdf">
                                    {isExporting ? <><Loader2 size={12} className="animate-spin" /> Exportando...</> : <><Download size={12} /> Exportar PDF</>}
                                </button>
                            </div>

                            <div ref={reportRef} className="bg-white border border-gray-200 rounded-xl shadow-sm" style={{ width: '794px', maxWidth: '100%', margin: '0 auto' }}>
                                <div className="flex items-center justify-between px-8 py-5 border-b-4" style={{ borderColor: accentColor }}>
                                    <div className="flex items-center gap-4">
                                        <svg viewBox="0 0 320 80" className="h-10" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <g transform="translate(10, 5) scale(0.85)">
                                                <path d="M40 5 L10 15 V35 C10 55 25 70 40 75 C55 70 70 55 70 35 V15 L40 5 Z" stroke="#000" strokeWidth="4" fill="none" strokeLinejoin="round"/>
                                                <path d="M20 50 Q40 65 60 40" stroke="#b91c1c" strokeWidth="6" strokeLinecap="round"/>
                                                <path d="M28 22 L40 22 L40 55" stroke="#000" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
                                                <path d="M45 22 L55 38 L65 22 L65 55 M45 55 L45 22" stroke="#000" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
                                            </g>
                                            <text x="85" y="35" fontFamily="Arial, sans-serif" fontWeight="300" fontSize="14" fill="#666" letterSpacing="3">GRUPO</text>
                                            <text x="85" y="60" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="28" fill="#000" letterSpacing="2">TMSEG</text>
                                        </svg>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Ordem de Serviço</p>
                                        <p className="text-lg font-black" style={{ color: primaryColor }}>{mission.id}</p>
                                    </div>
                                    {isCeva && (
                                        <img src="/logo_ceva.png" alt="CEVA Logistics" className="h-8 object-contain" />
                                    )}
                                </div>

                                <div className="px-8 py-2 flex items-center gap-6 text-[9px] font-bold text-gray-500 uppercase" style={{ backgroundColor: '#f8f9fa' }}>
                                    <span>Cliente: <strong className="text-gray-800">{mission.client}</strong></span>
                                    <span>Status: <strong className="text-gray-800">{mission.status}</strong></span>
                                    <span>Data: <strong className="text-gray-800">{mission.startTime || mission.start_time ? new Date(mission.startTime || mission.start_time!).toLocaleDateString('pt-BR') : 'N/A'}</strong></span>
                                    <span>Tipo: <strong className="text-gray-800">{(mission as any).mission_type || 'Caracterizada'}</strong></span>
                                </div>

                                <div className="px-8 py-6 report-content" dangerouslySetInnerHTML={{ __html: generatedReport }} />

                                {photoSlots.some(s => s.preview) && (
                                    <div className="px-8 pb-6">
                                        <h3 className="text-sm font-black uppercase tracking-wider mb-3" style={{ color: primaryColor }}>Anexo Fotográfico</h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            {photoSlots.filter(s => s.preview).map(slot => (
                                                <div key={slot.id} className="border border-gray-200 rounded-lg overflow-hidden">
                                                    <img src={slot.preview!} alt={slot.label} className="w-full h-48 object-cover" />
                                                    <p className="text-[9px] font-bold text-gray-500 text-center py-1.5 bg-gray-50 uppercase">{slot.label}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="px-8 py-4 border-t border-gray-200 flex items-center justify-between" style={{ backgroundColor: primaryColor }}>
                                    <div className="flex items-center gap-3">
                                        <svg viewBox="0 0 80 80" className="h-6" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M40 5 L10 15 V35 C10 55 25 70 40 75 C55 70 70 55 70 35 V15 L40 5 Z" stroke="#fff" strokeWidth="3" fill="none" strokeLinejoin="round"/>
                                            <path d="M20 50 Q40 65 60 40" stroke="#e81818" strokeWidth="5" strokeLinecap="round"/>
                                        </svg>
                                        <span className="text-[9px] font-bold text-white/80 uppercase tracking-wider">Grupo TMSEG — Segurança e Logística</span>
                                    </div>
                                    <span className="text-[8px] text-white/50">Gerado em {new Date().toLocaleString('pt-BR')}</span>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <style>{`
                .report-content h2 { font-size: 18px; font-weight: 900; color: ${primaryColor}; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid ${accentColor}; padding-bottom: 6px; }
                .report-content h3 { font-size: 13px; font-weight: 800; color: ${primaryColor}; margin-top: 20px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; padding-left: 10px; border-left: 3px solid ${accentColor}; }
                .report-content .subtitle { font-size: 11px; color: #6b7280; font-weight: 700; margin-bottom: 16px; }
                .report-content p { font-size: 12px; line-height: 1.7; color: #374151; margin-bottom: 8px; }
                .report-content ul { padding-left: 20px; margin-bottom: 12px; }
                .report-content li { font-size: 12px; line-height: 1.7; color: #374151; margin-bottom: 4px; }
                .report-content strong { color: #111827; }
            `}</style>
        </div>
    );
};

export default MissionOperationalReport;
