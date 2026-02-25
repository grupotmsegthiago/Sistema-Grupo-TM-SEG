
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

const MAPS_API_KEY = 'AIzaSyBIs-lrtAP6hoA1z_VA4Gbx1ujA-AlJe2k';

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
            'client_vehicle': 'Veículo Cliente', 'map_link': 'Link GPS',
            'progress': 'Progresso', 'total_distance': 'Distância Total',
            'is_same_os': 'Mesma OS', 'billing_approved': 'Faturamento Aprovado',
            'last_update': 'Última Atualização', 'updated_by': 'Atualizado Por',
            'special_operation_type': 'Operação Especial'
        };
        return map[field] || field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    };

    const cleanDisplayValue = (val: string | null) => {
        if (!val) return '—';
        let cleaned = val;
        cleaned = cleaned.replace(/^(true|false)$/i, (m) => m.toLowerCase() === 'true' ? 'SIM' : 'NÃO');
        cleaned = cleaned.replace(/^null$/i, '—');
        return cleaned.toUpperCase();
    };

    const extractCoordsFromMapLink = (link: string): { lat: string; lng: string } | null => {
        const match = link.match(/q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
        if (match) return { lat: match[1], lng: match[2] };
        const match2 = link.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
        if (match2) return { lat: match2[1], lng: match2[2] };
        return null;
    };

    const extractMapLinkFromDescription = (desc: string): string | null => {
        const match = desc.match(/https?:\/\/[^\s]+google[^\s]+/i);
        return match ? match[0] : null;
    };

    const getMapLinksFromLogs = (): { lat: string; lng: string; label: string }[] => {
        const points: { lat: string; lng: string; label: string }[] = [];
        
        logs.forEach((log, idx) => {
            if (log.map_link) {
                const coords = extractCoordsFromMapLink(log.map_link);
                if (coords) points.push({ ...coords, label: `${idx + 1}` });
            }
        });

        history.filter(h => h.field_name === 'map_link' && h.new_value).forEach((h) => {
            const coords = extractCoordsFromMapLink(h.new_value || '');
            if (coords) {
                const exists = points.some(p => p.lat === coords.lat && p.lng === coords.lng);
                if (!exists) points.push({ ...coords, label: `${points.length + 1}` });
            }
        });

        if (mission.mapLink) {
            const coords = extractCoordsFromMapLink(mission.mapLink);
            if (coords) {
                const exists = points.some(p => p.lat === coords.lat && p.lng === coords.lng);
                if (!exists) points.push({ ...coords, label: `${points.length + 1}` });
            }
        }

        return points;
    };

    const getLogMapLink = (log: MissionLog): string | null => {
        if (log.map_link) return log.map_link;

        const logTime = new Date(log.created_at).getTime();
        const mapChange = history.find(h => 
            h.field_name === 'map_link' && 
            h.new_value && 
            Math.abs(new Date(h.changed_at).getTime() - logTime) < 120000
        );
        if (mapChange?.new_value) return mapChange.new_value;

        const descLink = extractMapLinkFromDescription(log.description || '');
        if (descLink) return descLink;

        return null;
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

            const checkPageBreak = (needed: number) => {
                if (y + needed > pageHeight - 20) {
                    doc.addPage();
                    y = margin;
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

            const drawSectionHeader = (title: string, bgColor: string = 'dark') => {
                checkPageBreak(14);
                y += 2;
                if (bgColor === 'red') {
                    doc.setFillColor(127, 29, 29);
                } else {
                    doc.setFillColor(15, 23, 42);
                }
                doc.rect(margin, y, contentWidth, 8, 'F');
                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(255, 255, 255);
                doc.text(title, margin + 3, y + 5.5);
                y += 11;
            };

            const drawField = (label: string, value: string, x: number, width: number) => {
                doc.setFontSize(6.5);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(100, 116, 139);
                doc.text(`${label}:`, x, y);

                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(15, 23, 42);
                const lines = doc.splitTextToSize(value || '—', width - 4);
                doc.text(lines, x, y + 4.5);
                return 5 + (lines.length * 3.5);
            };

            const drawFieldRow = (fields: { label: string; value: string }[], colCount?: number) => {
                const cols = colCount || fields.length;
                const colWidth = contentWidth / cols;
                let maxH = 0;
                fields.forEach((f, i) => {
                    const h = drawField(f.label, f.value, margin + 2 + (i * colWidth), colWidth - 4);
                    if (h > maxH) maxH = h;
                });
                y += maxH + 3;
            };

            const drawSeparator = () => {
                doc.setDrawColor(230, 230, 230);
                doc.setLineWidth(0.15);
                doc.line(margin + 2, y, pageWidth - margin - 2, y);
                y += 2;
            };

            doc.setFillColor(185, 28, 28);
            doc.rect(0, 0, pageWidth, 3, 'F');

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

            const opType = (mission.mission_type || 'CARACTERIZADA').toUpperCase();
            doc.setFillColor(100, 116, 139);
            doc.roundedRect(margin + 43, y, 35, 6, 1, 1, 'F');
            doc.setTextColor(255, 255, 255);
            doc.text(opType, margin + 60, y + 4.2, { align: 'center' });

            doc.setFontSize(7);
            doc.setTextColor(100, 116, 139);
            doc.setFont('helvetica', 'normal');
            doc.text(`Emissão: ${new Date().toLocaleString('pt-BR')}`, pageWidth - margin, y + 4, { align: 'right' });

            y += 12;

            drawSectionHeader('DADOS DO CLIENTE / CONTRATANTE');
            drawFieldRow([
                { label: 'CLIENTE', value: mission.client?.toUpperCase() || '—' },
                { label: 'GR / ESPELHAMENTO', value: mission.gr_espelhamento || '—' }
            ]);

            drawSectionHeader('ROTA DA OPERAÇÃO');
            drawFieldRow([
                { label: 'ORIGEM', value: mission.origin?.toUpperCase() || '—' },
                { label: 'DESTINO', value: mission.destination?.toUpperCase() || '—' }
            ]);

            const kmTraveled = (mission.endKm && mission.startKm) ? (mission.endKm - mission.startKm) : 0;
            drawFieldRow([
                { label: 'DISTÂNCIA PLANEJADA', value: `${mission.totalDistance || 0} KM` },
                { label: 'KM INICIAL', value: mission.startKm ? `${mission.startKm}` : '—' },
                { label: 'KM FINAL', value: mission.endKm ? `${mission.endKm}` : '—' }
            ]);
            drawFieldRow([
                { label: 'KM PERCORRIDO', value: `${kmTraveled.toFixed(1)} KM` },
                { label: 'PROGRESSO', value: `${Math.floor(mission.progress || 0)}%` }
            ]);

            drawSectionHeader('CRONOLOGIA DA OPERAÇÃO');
            drawFieldRow([
                { label: 'CRIAÇÃO DA OS', value: formatDateTime(mission.createdAt) },
                { label: 'INÍCIO DA VIAGEM', value: formatDateTime(mission.startTime) },
                { label: 'FIM DA VIAGEM', value: formatDateTime(mission.endTime) }
            ]);

            let operationHours = '—';
            if (mission.startTime && mission.endTime) {
                const diffMs = new Date(mission.endTime).getTime() - new Date(mission.startTime).getTime();
                if (diffMs > 0) {
                    const hours = Math.floor(diffMs / (1000 * 60 * 60));
                    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                    operationHours = `${hours}h ${mins}min`;
                }
            }
            drawFieldRow([
                { label: 'TEMPO TOTAL DE OPERAÇÃO', value: operationHours },
                { label: 'KM RODADOS', value: kmTraveled > 0 ? `${kmTraveled.toFixed(1)} KM` : '—' }
            ]);

            drawSectionHeader('DADOS DA CARGA / VEÍCULO DO CLIENTE');
            drawFieldRow([
                { label: 'MOTORISTA', value: (mission.driver_name || '—').toUpperCase() },
                { label: 'TELEFONE', value: mission.driver_phone || '—' },
                { label: 'PLACA', value: mission.clientVehicle?.plate || '—' }
            ]);
            drawFieldRow([
                { label: 'MODELO', value: (mission.clientVehicle?.model || '—').toUpperCase() },
                { label: 'MARCA', value: (mission.clientVehicle?.brand || '—').toUpperCase() }
            ]);

            drawSectionHeader('EQUIPE DE ESCOLTA / SEGURANÇA');
            drawFieldRow([
                { label: 'FORNECEDOR', value: (mission.provider || '—').toUpperCase() }
            ]);

            const agent1Data = agents.find(a => a.name === mission.agent1);
            const agent2Data = agents.find(a => a.name === mission.agent2);

            if (mission.agent1) {
                drawSeparator();
                drawFieldRow([
                    { label: 'AGENTE 01', value: (mission.agent1).toUpperCase() },
                    { label: 'CPF', value: agent1Data?.cpf || '—' },
                    { label: 'RG', value: agent1Data?.rg || '—' },
                    { label: 'CNV', value: agent1Data?.cnv || '—' }
                ]);
            }
            if (mission.agent2 && mission.agent2 !== '---') {
                drawSeparator();
                drawFieldRow([
                    { label: 'AGENTE 02', value: (mission.agent2).toUpperCase() },
                    { label: 'CPF', value: agent2Data?.cpf || '—' },
                    { label: 'RG', value: agent2Data?.rg || '—' },
                    { label: 'CNV', value: agent2Data?.cnv || '—' }
                ]);
            }

            drawSeparator();
            drawFieldRow([
                { label: 'VIATURA', value: vehicle ? `${vehicle.model || ''} — ${vehicle.plate || ''} — ${vehicle.color || ''}`.toUpperCase() : mission.vehicleId || '—' },
                { label: 'RASTREADOR', value: vehicle ? `${vehicle.tracker_type || '—'} / ${vehicle.tracker_id || '—'}` : '—' }
            ]);

            drawSectionHeader('ÚLTIMA OCORRÊNCIA REGISTRADA');
            const locationText = mission.currentLocation || 'Sem ocorrências registradas.';
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(30, 30, 30);
            const locLines = doc.splitTextToSize(locationText.toUpperCase(), contentWidth - 4);
            checkPageBreak(locLines.length * 4 + 4);
            doc.text(locLines, margin + 2, y);
            y += locLines.length * 4 + 4;

            if (mission.billing_approved) {
                drawSectionHeader('DEMONSTRATIVO FINANCEIRO', 'red');

                const colWidths = [contentWidth * 0.4, contentWidth * 0.3, contentWidth * 0.3];
                
                checkPageBreak(7);
                doc.setFillColor(15, 23, 42);
                doc.rect(margin, y - 0.5, contentWidth, 6, 'F');
                doc.setFontSize(7);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(255, 255, 255);
                let tx = margin + 2;
                ['ITEM', 'DESCRIÇÃO', 'VALOR (R$)'].forEach((h, i) => {
                    doc.text(h, tx, y + 3.5);
                    tx += colWidths[i];
                });
                y += 6;

                const rows = [
                    ['SERVIÇO DE ESCOLTA', 'FATURAMENTO BASE + EXTRAS', formatCurrency(mission.revenue_value)],
                    ['PEDÁGIO / REEMBOLSO', 'COMPROVADO', formatCurrency(mission.toll_value)]
                ];
                rows.forEach((row, ri) => {
                    checkPageBreak(7);
                    if (ri % 2 === 1) {
                        doc.setFillColor(248, 250, 252);
                        doc.rect(margin, y - 0.5, contentWidth, 6, 'F');
                    }
                    doc.setFontSize(7);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(30, 30, 30);
                    let rx = margin + 2;
                    row.forEach((col, ci) => {
                        doc.text(col, rx, y + 3.5);
                        rx += colWidths[ci];
                    });
                    y += 6;
                });

                const total = (mission.revenue_value || 0) + (mission.toll_value || 0);
                doc.setFillColor(15, 23, 42);
                doc.rect(margin, y - 0.5, contentWidth, 7, 'F');
                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(255, 255, 255);
                doc.text('TOTAL GERAL DA MISSÃO:', margin + 4, y + 4);
                doc.text(formatCurrency(total), pageWidth - margin - 4, y + 4, { align: 'right' });
                y += 10;
            }

            drawSectionHeader('TIMELINE COMPLETA DE EVENTOS');

            if (logs.length === 0) {
                doc.setFontSize(8);
                doc.setFont('helvetica', 'italic');
                doc.setTextColor(150, 150, 150);
                doc.text('Nenhum evento registrado para esta missão.', margin + 2, y + 3);
                y += 10;
            } else {
                logs.forEach((log, idx) => {
                    const dateStr = formatDateTime(log.created_at);
                    const desc = (log.description || '—').toUpperCase();
                    const mapLink = getLogMapLink(log);
                    const mapLabel = mapLink ? 'Ver no Google Maps' : '';

                    const descLines = doc.splitTextToSize(desc, contentWidth - 10);
                    const rowHeight = Math.max(12, 8 + descLines.length * 3.5 + (mapLink ? 5 : 0));

                    checkPageBreak(rowHeight + 4);

                    if (idx % 2 === 1) {
                        doc.setFillColor(248, 250, 252);
                        doc.rect(margin, y - 1, contentWidth, rowHeight + 2, 'F');
                    }

                    doc.setDrawColor(185, 28, 28);
                    doc.setLineWidth(0.4);
                    doc.line(margin + 2, y, margin + 2, y + rowHeight - 2);
                    doc.setFillColor(185, 28, 28);
                    doc.circle(margin + 2, y + 2, 1.2, 'F');

                    doc.setFontSize(7);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(100, 116, 139);
                    doc.text(dateStr, margin + 6, y + 3);

                    doc.setTextColor(30, 64, 175);
                    doc.setFont('helvetica', 'bold');
                    doc.text('CM - GRUPO TM SEG', margin + 50, y + 3);

                    doc.setFontSize(7.5);
                    doc.setTextColor(30, 30, 30);
                    doc.setFont('helvetica', 'normal');
                    doc.text(descLines, margin + 6, y + 8);

                    if (mapLink) {
                        const mapY = y + 8 + descLines.length * 3.5;
                        doc.setFontSize(6.5);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(30, 64, 175);
                        doc.textWithLink(mapLabel, margin + 6, mapY, { url: mapLink });
                        doc.setDrawColor(30, 64, 175);
                        doc.setLineWidth(0.1);
                        doc.line(margin + 6, mapY + 0.5, margin + 6 + doc.getTextWidth(mapLabel), mapY + 0.5);
                    }

                    y += rowHeight + 2;
                });
                y += 4;
            }

            if (history.length > 0) {
                drawSectionHeader('REGISTRO DE ALTERAÇÕES (AUDITORIA)');

                history.forEach((h, idx) => {
                    const dateStr = formatDateTime(h.changed_at);
                    const field = translateField(h.field_name).toUpperCase();
                    const oldVal = cleanDisplayValue(h.old_value);
                    const newVal = cleanDisplayValue(h.new_value);

                    const entryHeight = 14;
                    checkPageBreak(entryHeight + 2);

                    if (idx % 2 === 0) {
                        doc.setFillColor(248, 250, 252);
                        doc.rect(margin, y - 1, contentWidth, entryHeight, 'F');
                    }

                    doc.setFontSize(6.5);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(100, 116, 139);
                    doc.text(dateStr, margin + 2, y + 3);

                    doc.setTextColor(30, 64, 175);
                    doc.text('CM - GRUPO TM SEG', margin + 45, y + 3);

                    doc.setTextColor(15, 23, 42);
                    doc.setFont('helvetica', 'bold');
                    doc.text(field, margin + 100, y + 3);

                    doc.setFontSize(6);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(185, 28, 28);
                    const oldLines = doc.splitTextToSize(oldVal, contentWidth / 2 - 10);
                    doc.text(oldLines[0] || '—', margin + 4, y + 8.5);

                    doc.setTextColor(22, 101, 52);
                    const newLines = doc.splitTextToSize(newVal, contentWidth / 2 - 10);
                    doc.text(newLines[0] || '—', margin + contentWidth / 2 + 4, y + 8.5);

                    doc.setFontSize(5);
                    doc.setTextColor(150, 150, 150);
                    doc.text('ANTES', margin + 4, y + 12);
                    doc.text('DEPOIS', margin + contentWidth / 2 + 4, y + 12);

                    y += entryHeight + 1;
                });
                y += 4;
            }

            checkPageBreak(80);
            drawSectionHeader('MAPA DA OPERAÇÃO — ORIGEM / DESTINO');

            const waypoints = getMapLinksFromLogs();

            let mapUrl = '';
            if (waypoints.length >= 2) {
                const origin = `${waypoints[0].lat},${waypoints[0].lng}`;
                const dest = `${waypoints[waypoints.length - 1].lat},${waypoints[waypoints.length - 1].lng}`;
                const midpoints = waypoints.slice(1, -1).map(w => `${w.lat},${w.lng}`).join('|');
                
                let pathParam = `&path=color:0xB91C1Cff|weight:3`;
                waypoints.forEach(w => {
                    pathParam += `|${w.lat},${w.lng}`;
                });

                let markersParam = '';
                waypoints.forEach((w, i) => {
                    if (i === 0) {
                        markersParam += `&markers=color:green%7Clabel:A%7C${w.lat},${w.lng}`;
                    } else if (i === waypoints.length - 1) {
                        markersParam += `&markers=color:red%7Clabel:B%7C${w.lat},${w.lng}`;
                    } else {
                        markersParam += `&markers=color:blue%7Clabel:${i}%7C${w.lat},${w.lng}`;
                    }
                });

                mapUrl = `https://maps.googleapis.com/maps/api/staticmap?size=640x360&maptype=roadmap${markersParam}${pathParam}&key=${MAPS_API_KEY}`;
            } else if (mission.mapLink) {
                const coords = extractCoordsFromMapLink(mission.mapLink);
                if (coords) {
                    mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${coords.lat},${coords.lng}&zoom=12&size=640x360&maptype=roadmap&markers=color:red%7C${coords.lat},${coords.lng}&key=${MAPS_API_KEY}`;
                }
            } else if (mission.origin && mission.destination) {
                const originEnc = encodeURIComponent(mission.origin);
                const destEnc = encodeURIComponent(mission.destination);
                mapUrl = `https://maps.googleapis.com/maps/api/staticmap?size=640x360&maptype=roadmap&markers=color:green%7Clabel:A%7C${originEnc}&markers=color:red%7Clabel:B%7C${destEnc}&key=${MAPS_API_KEY}`;
            }

            if (mapUrl) {
                try {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    
                    await new Promise<void>((resolve) => {
                        img.onload = () => {
                            try {
                                const canvas = document.createElement('canvas');
                                canvas.width = img.width;
                                canvas.height = img.height;
                                const ctx = canvas.getContext('2d');
                                if (ctx) {
                                    ctx.drawImage(img, 0, 0);
                                    const imgData = canvas.toDataURL('image/jpeg', 0.85);
                                    const mapHeight = contentWidth * 0.56;
                                    checkPageBreak(mapHeight + 10);
                                    doc.addImage(imgData, 'JPEG', margin, y, contentWidth, mapHeight);
                                    y += mapHeight + 4;
                                }
                                resolve();
                            } catch (e) {
                                resolve();
                            }
                        };
                        img.onerror = () => resolve();
                        img.src = mapUrl;
                    });
                } catch (e) {
                    doc.setFontSize(8);
                    doc.setTextColor(150, 150, 150);
                    doc.text('Mapa indisponível.', margin + 2, y + 3);
                    y += 8;
                }
            } else {
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.text('Sem coordenadas GPS disponíveis para exibir o mapa.', margin + 2, y + 3);
                y += 8;
            }

            if (mission.origin && mission.destination) {
                const originEnc = encodeURIComponent(mission.origin);
                const destEnc = encodeURIComponent(mission.destination);
                const mapsDirectionsUrl = `https://www.google.com/maps/dir/${originEnc}/${destEnc}`;

                doc.setFontSize(7);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(30, 64, 175);
                const linkText = 'Abrir Rota Completa no Google Maps';
                doc.textWithLink(linkText, margin + 2, y + 2, { url: mapsDirectionsUrl });
                doc.setDrawColor(30, 64, 175);
                doc.setLineWidth(0.1);
                doc.line(margin + 2, y + 2.5, margin + 2 + doc.getTextWidth(linkText), y + 2.5);
                y += 8;
            }

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

            const totalPages = doc.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);
                drawPageFooter(doc, pageWidth, pageHeight, margin);
            }

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
