
import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import { Mission, MissionLog, MissionHistory, Agent, Vehicle, MissionStatus } from '../types';
import { supabase } from '../lib/supabase';
import { X, Download, Loader2, FileText } from 'lucide-react';

interface Props {
    mission: Mission;
    onClose: () => void;
}

const STATUS_LABELS: Record<string, string> = {
    'Solicitada': 'SOLICITADA',
    'Documentação': 'DOCUMENTAÇÃO',
    'Agendada': 'AGENDADA',
    'Origem': 'NA ORIGEM',
    'Em Viagem': 'EM VIAGEM',
    'Concluída': 'CONCLUÍDA',
    'Cancelada': 'CANCELADA',
    'Recusada': 'RECUSADA',
    'Pendente': 'PENDENTE'
};

const MissionFullReportModal: React.FC<Props> = ({ mission, onClose }) => {
    const [isGenerating, setIsGenerating] = useState(false);
    const [logs, setLogs] = useState<MissionLog[]>([]);
    const [history, setHistory] = useState<MissionHistory[]>([]);
    const [agents, setAgents] = useState<Agent[]>([]);
    const [vehicle, setVehicle] = useState<Vehicle | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchAllData();
    }, [mission]);

    const fetchAllData = async () => {
        setIsLoading(true);
        try {
            const [logsRes, historyRes, agentsRes, vehicleRes] = await Promise.all([
                supabase.from('mission_logs').select('*').eq('mission_id', mission.id).order('created_at', { ascending: true }),
                supabase.from('mission_history').select('*').eq('mission_id', mission.id).order('changed_at', { ascending: true }),
                supabase.from('agents').select('*').in('name', [mission.agent1, mission.agent2].filter(Boolean)),
                mission.vehicleId
                    ? (!isNaN(Number(mission.vehicleId))
                        ? supabase.from('vehicles').select('*').eq('id', mission.vehicleId).maybeSingle()
                        : supabase.from('vehicles').select('*').eq('plate', mission.vehicleId).maybeSingle())
                    : Promise.resolve({ data: null })
            ]);

            if (logsRes.data) setLogs(logsRes.data);
            if (historyRes.data) setHistory(historyRes.data);
            if (agentsRes.data) setAgents(agentsRes.data as Agent[]);
            if (vehicleRes.data) setVehicle(vehicleRes.data as Vehicle);
        } catch (err) {
            console.error('Erro ao carregar dados do relatório:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const formatDateTime = (iso?: string) => {
        if (!iso) return '—';
        const d = new Date(iso);
        return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    };

    const formatDate = (iso?: string) => {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString('pt-BR');
    };

    const formatCurrency = (val?: number) => {
        if (val === undefined || val === null) return 'R$ 0,00';
        return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    const translateField = (field: string) => {
        const map: Record<string, string> = {
            'status': 'Status', 'driver_name': 'Motorista', 'driver_phone': 'Tel. Motorista',
            'vehicle_id': 'Viatura', 'agent1': 'Agente 01', 'agent2': 'Agente 02',
            'provider': 'Fornecedor', 'start_km': 'KM Inicial', 'end_km': 'KM Final',
            'start_time': 'Início Viagem', 'end_time': 'Fim Viagem',
            'current_location': 'Localização', 'revenue_value': 'Faturamento',
            'cost_value': 'Custo', 'toll_value': 'Pedágio', 'origin': 'Origem',
            'destination': 'Destino', 'mission_type': 'Tipo Missão',
            'gr_espelhamento': 'GR/Espelhamento', 'client': 'Cliente',
            'client_vehicle': 'Veículo Cliente', 'map_link': 'Link Mapa',
            'progress': 'Progresso', 'total_distance': 'Distância Total',
            'is_same_os': 'Mesma OS', 'billing_approved': 'Faturamento Aprovado'
        };
        return map[field] || field.replace(/_/g, ' ').toUpperCase();
    };

    const generatePDF = async () => {
        setIsGenerating(true);
        try {
            const doc = new jsPDF('p', 'mm', 'a4');
            const pageWidth = 210;
            const pageHeight = 297;
            const margin = 15;
            const contentWidth = pageWidth - (margin * 2);
            let y = margin;

            const colors = {
                black: '#0f172a',
                darkRed: '#7f1d1d',
                red: '#b91c1c',
                gray: '#64748b',
                lightGray: '#f1f5f9',
                white: '#ffffff',
                green: '#166534',
                blue: '#1e40af',
                orange: '#c2410c'
            };

            const checkPageBreak = (needed: number) => {
                if (y + needed > pageHeight - 20) {
                    doc.addPage();
                    y = margin;
                    drawPageFooter(doc, pageWidth, pageHeight, margin);
                    return true;
                }
                return false;
            };

            const drawPageFooter = (d: jsPDF, pw: number, ph: number, m: number) => {
                d.setFontSize(7);
                d.setTextColor(150, 150, 150);
                d.text(`GRUPO TMSEG — Relatório Operacional Confidencial — Gerado em ${new Date().toLocaleString('pt-BR')}`, pw / 2, ph - 8, { align: 'center' });
                d.text(`Página ${d.getNumberOfPages()}`, pw - m, ph - 8, { align: 'right' });
                d.setDrawColor(200, 200, 200);
                d.line(m, ph - 12, pw - m, ph - 12);
            };

            const drawSectionHeader = (title: string, bgColor: string = colors.black) => {
                checkPageBreak(12);
                doc.setFillColor(bgColor === colors.black ? 15 : 127, bgColor === colors.black ? 23 : 29, bgColor === colors.black ? 42 : 29);
                doc.rect(margin, y, contentWidth, 8, 'F');
                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(255, 255, 255);
                doc.text(title, margin + 3, y + 5.5);
                y += 10;
            };

            const drawKeyValue = (label: string, value: string, x: number, width: number) => {
                doc.setFontSize(7);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(100, 116, 139);
                doc.text(label, x, y);
                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(15, 23, 42);
                const lines = doc.splitTextToSize(value || '—', width - 2);
                doc.text(lines, x, y + 4);
                return 4 + (lines.length * 3.5);
            };

            const drawTableRow = (cols: string[], widths: number[], isHeader: boolean = false, bgColor?: string) => {
                checkPageBreak(7);
                if (isHeader || bgColor) {
                    if (isHeader) {
                        doc.setFillColor(15, 23, 42);
                    } else if (bgColor === 'alt') {
                        doc.setFillColor(248, 250, 252);
                    }
                    doc.rect(margin, y - 0.5, contentWidth, 6, 'F');
                }
                doc.setFontSize(7);
                doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
                doc.setTextColor(isHeader ? 255 : 30, isHeader ? 255 : 30, isHeader ? 255 : 30);
                let x = margin + 2;
                cols.forEach((col, i) => {
                    const maxW = widths[i] - 4;
                    const text = col.length > Math.floor(maxW / 1.8) ? col.substring(0, Math.floor(maxW / 1.8)) + '...' : col;
                    doc.text(text, x, y + 3.5);
                    x += widths[i];
                });
                y += 6;
            };

            // ==========================================
            // PÁGINA 1 — CABEÇALHO E IDENTIFICAÇÃO
            // ==========================================

            // Barra superior vermelha
            doc.setFillColor(185, 28, 28);
            doc.rect(0, 0, pageWidth, 3, 'F');

            // Cabeçalho principal
            doc.setFillColor(15, 23, 42);
            doc.rect(margin, y, contentWidth, 28, 'F');

            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(255, 255, 255);
            doc.text('GRUPO TMSEG', margin + 5, y + 10);

            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(148, 163, 184);
            doc.text('GESTÃO DE RISCO E SEGURANÇA PATRIMONIAL', margin + 5, y + 16);
            doc.text('CNPJ: XX.XXX.XXX/0001-XX', margin + 5, y + 21);

            // OS Badge
            doc.setFillColor(185, 28, 28);
            doc.roundedRect(pageWidth - margin - 45, y + 4, 40, 20, 2, 2, 'F');
            doc.setFontSize(8);
            doc.setTextColor(255, 200, 200);
            doc.text('ORDEM DE SERVIÇO', pageWidth - margin - 25, y + 11, { align: 'center' });
            doc.setFontSize(14);
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.text(mission.id, pageWidth - margin - 25, y + 20, { align: 'center' });

            y += 32;

            // Status Badge
            const statusLabel = STATUS_LABELS[mission.status] || mission.status.toUpperCase();
            const isCompleted = mission.status === MissionStatus.COMPLETED;
            const isCancelled = mission.status === MissionStatus.CANCELLED || mission.status === MissionStatus.REFUSED;
            
            if (isCompleted) doc.setFillColor(22, 101, 52);
            else if (isCancelled) doc.setFillColor(185, 28, 28);
            else doc.setFillColor(30, 64, 175);
            
            doc.roundedRect(margin, y, 40, 6, 1, 1, 'F');
            doc.setFontSize(7);
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.text(statusLabel, margin + 20, y + 4.2, { align: 'center' });

            // Tipo de operação
            const opType = (mission.mission_type || 'CARACTERIZADA').toUpperCase();
            doc.setFillColor(100, 116, 139);
            doc.roundedRect(margin + 43, y, 35, 6, 1, 1, 'F');
            doc.setTextColor(255, 255, 255);
            doc.text(opType, margin + 60, y + 4.2, { align: 'center' });

            // Data geração
            doc.setFontSize(7);
            doc.setTextColor(100, 116, 139);
            doc.setFont('helvetica', 'normal');
            doc.text(`Emissão: ${new Date().toLocaleString('pt-BR')}`, pageWidth - margin, y + 4, { align: 'right' });

            y += 12;

            // ==========================================
            // SEÇÃO: DADOS DO CLIENTE
            // ==========================================
            drawSectionHeader('DADOS DO CLIENTE / CONTRATANTE');

            const h1 = drawKeyValue('CLIENTE:', mission.client?.toUpperCase() || '—', margin + 2, contentWidth / 2);
            drawKeyValue('GR / ESPELHAMENTO:', mission.gr_espelhamento || '—', margin + contentWidth / 2, contentWidth / 2);
            y += Math.max(h1, 8) + 2;

            // ==========================================
            // SEÇÃO: ROTA DA OPERAÇÃO
            // ==========================================
            drawSectionHeader('ROTA DA OPERAÇÃO');

            const h2 = drawKeyValue('ORIGEM:', mission.origin?.toUpperCase() || '—', margin + 2, contentWidth / 2);
            drawKeyValue('DESTINO:', mission.destination?.toUpperCase() || '—', margin + contentWidth / 2, contentWidth / 2);
            y += Math.max(h2, 8) + 1;

            const h3 = drawKeyValue('DISTÂNCIA PLANEJADA:', `${mission.totalDistance || 0} KM`, margin + 2, contentWidth / 3);
            drawKeyValue('KM INICIAL:', mission.startKm ? `${mission.startKm}` : '—', margin + contentWidth / 3, contentWidth / 3);
            drawKeyValue('KM FINAL:', mission.endKm ? `${mission.endKm}` : '—', margin + (contentWidth / 3) * 2, contentWidth / 3);
            y += Math.max(h3, 8) + 1;

            const kmTraveled = (mission.endKm && mission.startKm) ? (mission.endKm - mission.startKm) : 0;
            drawKeyValue('KM PERCORRIDO:', `${kmTraveled.toFixed(1)} KM`, margin + 2, contentWidth / 3);
            drawKeyValue('PROGRESSO:', `${Math.floor(mission.progress || 0)}%`, margin + contentWidth / 3, contentWidth / 3);
            if (mission.mapLink) {
                drawKeyValue('LINK GPS:', mission.mapLink, margin + (contentWidth / 3) * 2, contentWidth / 3);
            }
            y += 10;

            // ==========================================
            // SEÇÃO: CRONOLOGIA
            // ==========================================
            drawSectionHeader('CRONOLOGIA DA OPERAÇÃO');

            const h4 = drawKeyValue('CRIAÇÃO DA OS:', formatDateTime(mission.createdAt), margin + 2, contentWidth / 3);
            drawKeyValue('INÍCIO DA VIAGEM:', formatDateTime(mission.startTime), margin + contentWidth / 3, contentWidth / 3);
            drawKeyValue('FIM DA VIAGEM:', formatDateTime(mission.endTime), margin + (contentWidth / 3) * 2, contentWidth / 3);
            y += Math.max(h4, 8) + 1;

            if (mission.startTime && mission.endTime) {
                const diffMs = new Date(mission.endTime).getTime() - new Date(mission.startTime).getTime();
                if (diffMs > 0) {
                    const hours = Math.floor(diffMs / (1000 * 60 * 60));
                    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                    drawKeyValue('TEMPO TOTAL DE OPERAÇÃO:', `${hours}h ${mins}min`, margin + 2, contentWidth / 2);
                    y += 8;
                }
            }

            // ==========================================
            // SEÇÃO: DADOS DA CARGA
            // ==========================================
            drawSectionHeader('DADOS DA CARGA / VEÍCULO DO CLIENTE');

            const h5 = drawKeyValue('MOTORISTA:', (mission.driver_name || '—').toUpperCase(), margin + 2, contentWidth / 3);
            drawKeyValue('TELEFONE:', mission.driver_phone || '—', margin + contentWidth / 3, contentWidth / 3);
            drawKeyValue('PLACA:', mission.clientVehicle?.plate || '—', margin + (contentWidth / 3) * 2, contentWidth / 3);
            y += Math.max(h5, 8) + 1;

            drawKeyValue('MODELO:', (mission.clientVehicle?.model || '—').toUpperCase(), margin + 2, contentWidth / 2);
            y += 10;

            // ==========================================
            // SEÇÃO: EQUIPE DE ESCOLTA
            // ==========================================
            drawSectionHeader('EQUIPE DE ESCOLTA / SEGURANÇA');

            const h6 = drawKeyValue('FORNECEDOR:', (mission.provider || '—').toUpperCase(), margin + 2, contentWidth);
            y += Math.max(h6, 8) + 1;

            const agent1Data = agents.find(a => a.name === mission.agent1);
            const agent2Data = agents.find(a => a.name === mission.agent2);

            if (mission.agent1) {
                drawKeyValue('AGENTE 01:', (mission.agent1).toUpperCase(), margin + 2, contentWidth / 4);
                drawKeyValue('CPF:', agent1Data?.cpf || '—', margin + contentWidth / 4, contentWidth / 4);
                drawKeyValue('RG:', agent1Data?.rg || '—', margin + (contentWidth / 4) * 2, contentWidth / 4);
                drawKeyValue('CNV:', agent1Data?.cnv || '—', margin + (contentWidth / 4) * 3, contentWidth / 4);
                y += 10;
            }
            if (mission.agent2 && mission.agent2 !== '---') {
                drawKeyValue('AGENTE 02:', (mission.agent2).toUpperCase(), margin + 2, contentWidth / 4);
                drawKeyValue('CPF:', agent2Data?.cpf || '—', margin + contentWidth / 4, contentWidth / 4);
                drawKeyValue('RG:', agent2Data?.rg || '—', margin + (contentWidth / 4) * 2, contentWidth / 4);
                drawKeyValue('CNV:', agent2Data?.cnv || '—', margin + (contentWidth / 4) * 3, contentWidth / 4);
                y += 10;
            }

            // Viatura
            drawKeyValue('VIATURA:', vehicle ? `${vehicle.model || ''} — ${vehicle.plate || ''} — ${vehicle.color || ''}`.toUpperCase() : mission.vehicleId || '—', margin + 2, contentWidth / 2);
            if (vehicle) {
                drawKeyValue('RASTREADOR:', `${vehicle.tracker_type || '—'} / ${vehicle.tracker_id || '—'}`, margin + contentWidth / 2, contentWidth / 2);
            }
            y += 10;

            // ==========================================
            // SEÇÃO: ÚLTIMA OCORRÊNCIA
            // ==========================================
            drawSectionHeader('ÚLTIMA OCORRÊNCIA REGISTRADA');

            const locationText = mission.currentLocation || 'Sem ocorrências registradas.';
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(30, 30, 30);
            const locLines = doc.splitTextToSize(locationText.toUpperCase(), contentWidth - 4);
            checkPageBreak(locLines.length * 4 + 4);
            doc.text(locLines, margin + 2, y);
            y += locLines.length * 4 + 6;

            // ==========================================
            // SEÇÃO: DEMONSTRATIVO FINANCEIRO (se aprovado)
            // ==========================================
            if (mission.billing_approved) {
                drawSectionHeader('DEMONSTRATIVO FINANCEIRO', colors.darkRed);

                const colWidths = [contentWidth * 0.4, contentWidth * 0.3, contentWidth * 0.3];
                drawTableRow(['ITEM', 'DESCRIÇÃO', 'VALOR (R$)'], colWidths, true);
                drawTableRow(['SERVIÇO DE ESCOLTA', 'FATURAMENTO BASE + EXTRAS', formatCurrency(mission.revenue_value)], colWidths);
                drawTableRow(['PEDÁGIO / REEMBOLSO', 'VALOR COMPROVADO', formatCurrency(mission.toll_value)], colWidths, false, 'alt');
                const total = (mission.revenue_value || 0) + (mission.toll_value || 0);
                
                doc.setFillColor(15, 23, 42);
                doc.rect(margin, y - 0.5, contentWidth, 7, 'F');
                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(255, 255, 255);
                doc.text('TOTAL GERAL DA MISSÃO:', margin + 4, y + 4);
                doc.text(formatCurrency(total), pageWidth - margin - 4, y + 4, { align: 'right' });
                y += 12;
            }

            // ==========================================
            // SEÇÃO: TIMELINE DE EVENTOS (mission_logs)
            // ==========================================
            drawSectionHeader('TIMELINE COMPLETA DE EVENTOS');

            if (logs.length === 0) {
                doc.setFontSize(8);
                doc.setFont('helvetica', 'italic');
                doc.setTextColor(150, 150, 150);
                doc.text('Nenhum evento registrado para esta missão.', margin + 2, y + 3);
                y += 10;
            } else {
                const logColWidths = [contentWidth * 0.22, contentWidth * 0.15, contentWidth * 0.63];
                drawTableRow(['DATA / HORA', 'OPERADOR', 'OCORRÊNCIA / DESCRIÇÃO'], logColWidths, true);

                logs.forEach((log, idx) => {
                    const dateStr = formatDateTime(log.created_at);
                    const operator = (log.updated_by || 'SISTEMA').toUpperCase();
                    const desc = (log.description || '—').toUpperCase();

                    const descLines = doc.splitTextToSize(desc, logColWidths[2] - 6);
                    const rowHeight = Math.max(6, descLines.length * 3.5 + 2);

                    checkPageBreak(rowHeight + 2);

                    if (idx % 2 === 1) {
                        doc.setFillColor(248, 250, 252);
                        doc.rect(margin, y - 0.5, contentWidth, rowHeight, 'F');
                    }

                    // Linha vertical da timeline
                    doc.setDrawColor(185, 28, 28);
                    doc.setLineWidth(0.3);
                    doc.line(margin + 1, y, margin + 1, y + rowHeight - 1);
                    doc.setFillColor(185, 28, 28);
                    doc.circle(margin + 1, y + 2, 1, 'F');

                    doc.setFontSize(7);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(100, 116, 139);
                    doc.text(dateStr, margin + 4, y + 3.5);

                    doc.setTextColor(30, 64, 175);
                    doc.setFont('helvetica', 'bold');
                    doc.text(operator.substring(0, 18), margin + logColWidths[0] + 2, y + 3.5);

                    doc.setTextColor(30, 30, 30);
                    doc.setFont('helvetica', 'normal');
                    doc.text(descLines, margin + logColWidths[0] + logColWidths[1] + 2, y + 3.5);

                    y += rowHeight + 1;
                });
                y += 4;
            }

            // ==========================================
            // SEÇÃO: HISTÓRICO DETALHADO DE ALTERAÇÕES (mission_history)
            // ==========================================
            if (history.length > 0) {
                drawSectionHeader('REGISTRO DE ALTERAÇÕES (AUDITORIA)');

                const histColWidths = [contentWidth * 0.18, contentWidth * 0.12, contentWidth * 0.20, contentWidth * 0.25, contentWidth * 0.25];
                drawTableRow(['DATA / HORA', 'OPERADOR', 'CAMPO', 'VALOR ANTERIOR', 'NOVO VALOR'], histColWidths, true);

                history.forEach((h, idx) => {
                    const dateStr = formatDateTime(h.changed_at);
                    const operator = (h.changed_by || 'SISTEMA').substring(0, 14).toUpperCase();
                    const field = translateField(h.field_name).substring(0, 22).toUpperCase();
                    const oldVal = (h.old_value || '—').substring(0, 30).toUpperCase();
                    const newVal = (h.new_value || '—').substring(0, 30).toUpperCase();

                    checkPageBreak(7);

                    if (idx % 2 === 1) {
                        doc.setFillColor(248, 250, 252);
                        doc.rect(margin, y - 0.5, contentWidth, 6, 'F');
                    }

                    doc.setFontSize(6.5);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(100, 116, 139);
                    doc.text(dateStr, margin + 2, y + 3.5);

                    doc.setTextColor(30, 64, 175);
                    doc.setFont('helvetica', 'bold');
                    doc.text(operator, margin + histColWidths[0] + 2, y + 3.5);

                    doc.setTextColor(30, 30, 30);
                    doc.setFont('helvetica', 'bold');
                    doc.text(field, margin + histColWidths[0] + histColWidths[1] + 2, y + 3.5);

                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(185, 28, 28);
                    doc.text(oldVal, margin + histColWidths[0] + histColWidths[1] + histColWidths[2] + 2, y + 3.5);

                    doc.setTextColor(22, 101, 52);
                    doc.text(newVal, margin + histColWidths[0] + histColWidths[1] + histColWidths[2] + histColWidths[3] + 2, y + 3.5);

                    y += 6;
                });
                y += 4;
            }

            // ==========================================
            // SEÇÃO: MAPA ESTÁTICO (se tiver coordenadas)
            // ==========================================
            if (mission.mapLink) {
                checkPageBreak(60);
                drawSectionHeader('POSIÇÃO GPS / TRAJETO');

                const coordMatch = mission.mapLink.match(/q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
                if (coordMatch) {
                    const lat = coordMatch[1];
                    const lng = coordMatch[2];
                    const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=12&size=640x300&maptype=roadmap&markers=color:red%7C${lat},${lng}&key=AIzaSyBhPm6dSnk1WJKX9WBP6j4InqDm4aKKMz0`;

                    try {
                        const img = new Image();
                        img.crossOrigin = 'anonymous';
                        
                        await new Promise<void>((resolve, reject) => {
                            img.onload = () => {
                                try {
                                    const canvas = document.createElement('canvas');
                                    canvas.width = img.width;
                                    canvas.height = img.height;
                                    const ctx = canvas.getContext('2d');
                                    if (ctx) {
                                        ctx.drawImage(img, 0, 0);
                                        const imgData = canvas.toDataURL('image/jpeg', 0.85);
                                        doc.addImage(imgData, 'JPEG', margin, y, contentWidth, contentWidth * 0.47);
                                        y += contentWidth * 0.47 + 4;
                                    }
                                    resolve();
                                } catch (e) {
                                    resolve();
                                }
                            };
                            img.onerror = () => resolve();
                            img.src = staticMapUrl;
                        });
                    } catch (e) {
                        doc.setFontSize(8);
                        doc.setTextColor(150, 150, 150);
                        doc.text(`Coordenadas GPS: ${lat}, ${lng}`, margin + 2, y + 3);
                        y += 8;
                    }
                }

                doc.setFontSize(7);
                doc.setTextColor(100, 116, 139);
                doc.text(`Link completo: ${mission.mapLink}`, margin + 2, y);
                y += 8;
            }

            // ==========================================
            // RODAPÉ FINAL — ASSINATURAS
            // ==========================================
            checkPageBreak(45);

            y += 5;
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.2);
            doc.line(margin, y, pageWidth - margin, y);
            y += 8;

            doc.setFontSize(7);
            doc.setTextColor(100, 116, 139);
            doc.setFont('helvetica', 'normal');
            doc.text('DECLARAÇÃO DE CONFORMIDADE', pageWidth / 2, y, { align: 'center' });
            y += 4;
            doc.setFontSize(6.5);
            const disclaimer = 'Este relatório foi gerado automaticamente pelo sistema de Gestão Operacional do Grupo TMSEG. As informações contidas neste documento são de caráter confidencial e destinam-se exclusivamente ao uso das partes envolvidas na operação. A reprodução ou distribuição não autorizada é proibida.';
            const discLines = doc.splitTextToSize(disclaimer, contentWidth - 10);
            doc.text(discLines, pageWidth / 2, y, { align: 'center' });
            y += discLines.length * 3 + 8;

            // Linhas de assinatura
            const sigWidth = (contentWidth - 20) / 2;
            doc.setDrawColor(30, 30, 30);
            doc.setLineWidth(0.3);
            doc.line(margin + 5, y, margin + 5 + sigWidth, y);
            doc.line(pageWidth - margin - 5 - sigWidth, y, pageWidth - margin - 5, y);

            doc.setFontSize(7);
            doc.setTextColor(30, 30, 30);
            doc.setFont('helvetica', 'bold');
            doc.text('RESPONSÁVEL PELA OPERAÇÃO', margin + 5 + sigWidth / 2, y + 4, { align: 'center' });
            doc.text('CLIENTE / CONTRATANTE', pageWidth - margin - 5 - sigWidth / 2, y + 4, { align: 'center' });

            // Rodapé de todas as páginas
            const totalPages = doc.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);
                drawPageFooter(doc, pageWidth, pageHeight, margin);
            }

            // Salvar
            const originCity = mission.origin ? mission.origin.split(',')[0].split('-')[0].trim() : 'ROTA';
            const destCity = mission.destination ? mission.destination.split(',')[0].split('-')[0].trim() : '';
            const fileName = `TMSEG_RELATORIO_${mission.id}_${originCity}_x_${destCity}.pdf`.replace(/\s+/g, '_').toUpperCase();
            doc.save(fileName);

        } catch (err) {
            console.error('Erro ao gerar PDF:', err);
            alert('Erro ao gerar o relatório PDF. Tente novamente.');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-gray-200 overflow-hidden">
                
                <div className="bg-gradient-to-r from-gray-900 to-red-900 text-white p-6">
                    <div className="flex justify-between items-start">
                        <div>
                            <h2 className="text-lg font-bold flex items-center gap-2">
                                <FileText size={20} className="text-red-300" />
                                Relatório Completo da Missão
                            </h2>
                            <p className="text-sm text-gray-300 mt-1">
                                OS {mission.id} — {mission.client}
                            </p>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-4">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                            <Loader2 size={32} className="animate-spin text-red-600 mb-3" />
                            <p className="text-sm font-bold">Carregando dados da missão...</p>
                        </div>
                    ) : (
                        <>
                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-3">
                                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Conteúdo do Relatório</h3>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                        <span className="font-bold text-gray-700">Dados do Cliente</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                        <span className="font-bold text-gray-700">Rota e Cronologia</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                        <span className="font-bold text-gray-700">Equipe de Escolta</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                        <span className="font-bold text-gray-700">Dados da Carga</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${logs.length > 0 ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                        <span className="font-bold text-gray-700">Timeline ({logs.length} eventos)</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${history.length > 0 ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                        <span className="font-bold text-gray-700">Auditoria ({history.length} alt.)</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${mission.billing_approved ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                        <span className="font-bold text-gray-700">Financeiro</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${mission.mapLink ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                        <span className="font-bold text-gray-700">Mapa / GPS</span>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={generatePDF}
                                disabled={isGenerating}
                                className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-gray-900 to-red-800 hover:from-gray-800 hover:to-red-700 text-white py-4 rounded-xl font-bold text-sm uppercase tracking-wider transition-all shadow-lg hover:shadow-xl active:scale-[0.98] disabled:opacity-60"
                            >
                                {isGenerating ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        Gerando Relatório Profissional...
                                    </>
                                ) : (
                                    <>
                                        <Download size={18} />
                                        Gerar e Baixar PDF Completo
                                    </>
                                )}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MissionFullReportModal;
