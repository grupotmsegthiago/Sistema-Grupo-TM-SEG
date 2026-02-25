
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
    const [clients, setClients] = useState<Client[]>([]);
    const [vehicle, setVehicle] = useState<Vehicle | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchAllData();
    }, [mission]);

    const fetchAllData = async () => {
        setIsLoading(true);
        try {
            const [logsRes, historyRes, agentsRes, vehicleRes, clientsRes] = await Promise.all([
                supabase.from('mission_logs').select('*').eq('mission_id', mission.id).order('created_at', { ascending: true }),
                supabase.from('mission_history').select('*').eq('mission_id', mission.id).order('changed_at', { ascending: true }),
                supabase.from('agents').select('*').in('name', [mission.agent1, mission.agent2].filter(Boolean)),
                mission.vehicleId
                    ? (!isNaN(Number(mission.vehicleId))
                        ? supabase.from('vehicles').select('*').eq('id', mission.vehicleId).maybeSingle()
                        : supabase.from('vehicles').select('*').eq('plate', mission.vehicleId).maybeSingle())
                    : Promise.resolve({ data: null }),
                supabase.from('clients').select('*').eq('name', mission.client)
            ]);

            if (logsRes.data) setLogs(logsRes.data);
            if (historyRes.data) setHistory(historyRes.data);
            if (agentsRes.data) setAgents(agentsRes.data as Agent[]);
            if (vehicleRes.data) setVehicle(vehicleRes.data as Vehicle);
            if (clientsRes.data) setClients(clientsRes.data as Client[]);
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
            'client_vehicle': 'Veículo Cliente', 'map_link': 'Posição GPS',
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
        if (cleaned.match(/^https?:\/\//)) {
            const coordMatch = cleaned.match(/q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
            if (coordMatch) return `LAT: ${coordMatch[1]}, LNG: ${coordMatch[2]}`;
        }
        return cleaned.toUpperCase();
    };

    const extractCoordsFromMapLink = (link: string): { lat: string; lng: string } | null => {
        const match = link.match(/q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
        if (match) return { lat: match[1], lng: match[2] };
        const match2 = link.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
        if (match2) return { lat: match2[1], lng: match2[2] };
        return null;
    };

    const getMapLinksFromLogs = (): { lat: string; lng: string; label: string }[] => {
        const points: { lat: string; lng: string; label: string }[] = [];
        const addUnique = (lat: string, lng: string) => {
            const exists = points.some(p => p.lat === lat && p.lng === lng);
            if (!exists) points.push({ lat, lng, label: `${points.length + 1}` });
        };

        logs.forEach((log) => {
            if (log.map_link) {
                const coords = extractCoordsFromMapLink(log.map_link);
                if (coords) addUnique(coords.lat, coords.lng);
            }
        });

        history.filter(h => h.field_name === 'map_link' && h.new_value).forEach((h) => {
            const coords = extractCoordsFromMapLink(h.new_value || '');
            if (coords) addUnique(coords.lat, coords.lng);
        });

        if (mission.mapLink) {
            const coords = extractCoordsFromMapLink(mission.mapLink);
            if (coords) addUnique(coords.lat, coords.lng);
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
        return null;
    };

    const loadMapImage = (url: string): Promise<string | null> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(img, 0, 0);
                        resolve(canvas.toDataURL('image/jpeg', 0.9));
                    } else resolve(null);
                } catch { resolve(null); }
            };
            img.onerror = () => resolve(null);
            img.src = url;
        });
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
                if (y + needed > pageHeight - 22) {
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

            const drawSectionHeader = (title: string) => {
                checkPageBreak(16);
                y += 3;
                doc.setFillColor(15, 23, 42);
                doc.rect(margin, y, contentWidth, 8, 'F');
                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(255, 255, 255);
                doc.text(title, margin + 3, y + 5.5);
                y += 12;
            };

            const drawField = (label: string, val: string, x: number, maxW: number): number => {
                doc.setFontSize(6.5);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(100, 116, 139);
                doc.text(`${label}:`, x, y);

                doc.setFontSize(8.5);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(15, 23, 42);
                const lines = doc.splitTextToSize(val || '—', maxW - 2);
                doc.text(lines, x, y + 5);
                return 6 + (lines.length * 4);
            };

            const drawRow = (fields: { label: string; val: string }[]) => {
                checkPageBreak(16);
                const colW = contentWidth / fields.length;
                let maxH = 0;
                const savedY = y;
                fields.forEach((f, i) => {
                    y = savedY;
                    const h = drawField(f.label, f.val, margin + 3 + (i * colW), colW - 6);
                    if (h > maxH) maxH = h;
                });
                y = savedY + maxH + 2;
            };

            const drawThinLine = () => {
                doc.setDrawColor(220, 220, 220);
                doc.setLineWidth(0.15);
                doc.line(margin + 3, y, pageWidth - margin - 3, y);
                y += 3;
            };

            doc.setFillColor(185, 28, 28);
            doc.rect(0, 0, pageWidth, 3, 'F');

            doc.setFillColor(15, 23, 42);
            doc.rect(margin, y, contentWidth, 28, 'F');

            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(255, 255, 255);
            doc.text('GRUPO TMSEG', margin + 5, y + 10);

            const clientData = clients.find(c => c.name === mission.client);
            const clientDisplay = clientData ? `${clientData.name} - CNPJ: ${clientData.cnpj}` : mission.client;

            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(148, 163, 184);
            doc.text(clientDisplay.toUpperCase(), margin + 5, y + 16);
            doc.text('GESTÃO DE RISCO E SEGURANÇA PATRIMONIAL', margin + 5, y + 21);

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
            y += 10;

            drawSectionHeader('DADOS DO CLIENTE / CONTRATANTE');
            drawRow([
                { label: 'CLIENTE', val: mission.client?.toUpperCase() || '—' },
                { label: 'GR / ESPELHAMENTO', val: mission.gr_espelhamento || '—' }
            ]);

            drawSectionHeader('ROTA DA OPERAÇÃO');
            drawRow([
                { label: 'ORIGEM', val: mission.origin?.toUpperCase() || '—' },
                { label: 'DESTINO', val: mission.destination?.toUpperCase() || '—' }
            ]);

            const kmTraveled = (mission.endKm && mission.startKm) ? (mission.endKm - mission.startKm) : 0;
            drawRow([
                { label: 'DISTÂNCIA PLANEJADA', val: `${mission.totalDistance || 0} KM` },
                { label: 'KM INICIAL', val: mission.startKm ? `${mission.startKm}` : '—' },
                { label: 'KM FINAL', val: mission.endKm ? `${mission.endKm}` : '—' }
            ]);
            drawRow([
                { label: 'KM PERCORRIDO', val: `${kmTraveled.toFixed(1)} KM` },
                { label: 'PROGRESSO', val: `${Math.floor(mission.progress || 0)}%` }
            ]);

            drawSectionHeader('CRONOLOGIA DA OPERAÇÃO');
            drawRow([
                { label: 'CRIAÇÃO DA OS', val: formatDateTime(mission.createdAt) },
                { label: 'INÍCIO DA VIAGEM', val: formatDateTime(mission.startTime) },
                { label: 'FIM DA VIAGEM', val: formatDateTime(mission.endTime) }
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
            drawRow([
                { label: 'TEMPO TOTAL DE OPERAÇÃO', val: operationHours },
                { label: 'KM RODADOS', val: kmTraveled > 0 ? `${kmTraveled.toFixed(1)} KM` : '—' }
            ]);

            drawSectionHeader('DADOS DA CARGA / VEÍCULO DO CLIENTE');
            drawRow([
                { label: 'MOTORISTA', val: (mission.driver_name || '—').toUpperCase() },
                { label: 'TELEFONE', val: mission.driver_phone || '—' },
                { label: 'PLACA', val: mission.clientVehicle?.plate || '—' }
            ]);
            drawThinLine();
            drawRow([
                { label: 'MODELO', val: (mission.clientVehicle?.model || '—').toUpperCase() },
                { label: 'MARCA', val: (mission.clientVehicle?.brand || '—').toUpperCase() }
            ]);

            drawSectionHeader('EQUIPE DE ESCOLTA / SEGURANÇA');
            drawRow([
                { label: 'FORNECEDOR', val: (mission.provider || '—').toUpperCase() }
            ]);

            const agent1Data = agents.find(a => a.name === mission.agent1);
            const agent2Data = agents.find(a => a.name === mission.agent2);

            if (mission.agent1) {
                drawThinLine();
                drawRow([
                    { label: 'AGENTE 01', val: (mission.agent1).toUpperCase() },
                    { label: 'CPF', val: agent1Data?.cpf || '—' },
                    { label: 'RG', val: agent1Data?.rg || '—' },
                    { label: 'CNV', val: agent1Data?.cnv || '—' }
                ]);
            }
            if (mission.agent2 && mission.agent2 !== '---') {
                drawThinLine();
                drawRow([
                    { label: 'AGENTE 02', val: (mission.agent2).toUpperCase() },
                    { label: 'CPF', val: agent2Data?.cpf || '—' },
                    { label: 'RG', val: agent2Data?.rg || '—' },
                    { label: 'CNV', val: agent2Data?.cnv || '—' }
                ]);
            }

            drawThinLine();
            drawRow([
                { label: 'VIATURA', val: vehicle ? `${vehicle.model || ''} — ${vehicle.plate || ''} — ${vehicle.color || ''}`.toUpperCase() : mission.vehicleId || '—' },
                { label: 'RASTREADOR', val: vehicle ? `${vehicle.tracker_type || '—'} / ${vehicle.tracker_id || '—'}` : '—' }
            ]);

            drawSectionHeader('ÚLTIMA OCORRÊNCIA REGISTRADA');
            const locationText = mission.currentLocation || 'Sem ocorrências registradas.';
            doc.setFontSize(8.5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(30, 30, 30);
            const locLines = doc.splitTextToSize(locationText.toUpperCase(), contentWidth - 6);
            checkPageBreak(locLines.length * 4.5 + 4);
            doc.text(locLines, margin + 3, y);
            y += locLines.length * 4.5 + 4;

            drawSectionHeader('TIMELINE COMPLETA DE EVENTOS');

            const statusChangeToInTransit = history.find(h =>
                h.field_name === 'status' &&
                h.new_value === 'Em Viagem'
            );
            const timelineCutoff = statusChangeToInTransit ? new Date(statusChangeToInTransit.changed_at).getTime() : null;
            
            // Filter logs: only those STRICTLY at or after the 'Em Viagem' change time
            const filteredLogs = timelineCutoff
                ? logs.filter(l => new Date(l.created_at).getTime() >= timelineCutoff)
                : logs;

            if (filteredLogs.length === 0) {
                doc.setFontSize(8);
                doc.setFont('helvetica', 'italic');
                doc.setTextColor(150, 150, 150);
                doc.text('Nenhum evento registrado a partir do início da viagem.', margin + 3, y + 3);
                y += 10;
            } else {
                filteredLogs.forEach((log, idx) => {
                    const dateStr = formatDateTime(log.created_at);
                    const desc = (log.description || '—').toUpperCase();
                    const mapLink = getLogMapLink(log);
                    let mapCoordText = '';
                    if (mapLink) {
                        const c = extractCoordsFromMapLink(mapLink);
                        if (c) mapCoordText = `GPS: ${c.lat}, ${c.lng}`;
                    }

                    // Find status change in history around this log time
                    const logTime = new Date(log.created_at).getTime();
                    const statusHistory = history.filter(h => h.field_name === 'status');
                    
                    // Get the status at the time of this log
                    let logStatus = mission.status.toUpperCase();
                    const lastStatusChange = [...statusHistory]
                        .reverse()
                        .find(h => new Date(h.changed_at).getTime() <= logTime);
                    
                    if (lastStatusChange) {
                        logStatus = lastStatusChange.new_value?.toUpperCase() || logStatus;
                    }

                    // Check if this specific log is a status change event
                    const exactStatusChange = statusHistory.find(h => 
                        Math.abs(new Date(h.changed_at).getTime() - logTime) < 5000
                    );

                    // Format: DATA - HORA: STATUS: ALTERAÇÃO / OBSERVAÇÃO
                    const timelineText = `${dateStr}: ${logStatus}: ${desc}${exactStatusChange ? ' [ALTERAÇÃO DE STATUS]' : ''}`;
                    const descLines = doc.splitTextToSize(timelineText, contentWidth - 14);
                    const rowHeight = 10 + (descLines.length * 3.5) + (mapCoordText ? 5 : 0);

                    checkPageBreak(rowHeight + 4);

                    if (idx % 2 === 1) {
                        doc.setFillColor(248, 250, 252);
                        doc.rect(margin, y - 1, contentWidth, rowHeight + 2, 'F');
                    }

                    doc.setDrawColor(185, 28, 28);
                    doc.setLineWidth(0.5);
                    doc.line(margin + 3, y, margin + 3, y + rowHeight - 1);
                    doc.setFillColor(185, 28, 28);
                    doc.circle(margin + 3, y + 2.5, 1.3, 'F');

                    doc.setFontSize(7);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(100, 116, 139);
                    doc.text('CM - GRUPO TM SEG', margin + 7, y + 3);

                    doc.setFontSize(7.5);
                    doc.setTextColor(15, 23, 42);
                    doc.setFont('helvetica', 'normal');
                    doc.text(descLines, margin + 7, y + 8);

                    if (mapCoordText) {
                        const gpY = y + 9 + descLines.length * 3.5 + 1;
                        doc.setFontSize(6);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(100, 116, 139);
                        doc.text(mapCoordText, margin + 7, gpY);
                    }

                    y += rowHeight + 3;
                });
                y += 2;
            }

            const hiddenAuditFields = ['cost_value', 'toll_value', 'is_same_os', 'billing_approved', 'revenue_value', 'billing_verified_by'];
            const filteredHistory = history.filter(h => 
                !hiddenAuditFields.includes(h.field_name) &&
                (!timelineCutoff || new Date(h.changed_at).getTime() >= timelineCutoff)
            );

            // Additional check to ensure we don't include an entry that happened at the exact same ms as the cutoff but is logically "before"
            // (Like the example where 'Fim Viagem' update and 'Status' change share the same timestamp)
            const finalHistory = filteredHistory.filter(h => {
                if (!timelineCutoff) return true;
                const hTime = new Date(h.changed_at).getTime();
                if (hTime > timelineCutoff) return true;
                if (hTime === timelineCutoff) {
                    // Only keep the status change itself if it's the exact cutoff point
                    return h.field_name === 'status' && h.new_value === 'Em Viagem';
                }
                return false;
            });

            if (finalHistory.length > 0) {
                drawSectionHeader('REGISTRO DE ALTERAÇÕES (AUDITORIA)');

                finalHistory.forEach((h, idx) => {
                    const dateStr = formatDateTime(h.changed_at);
                    const field = translateField(h.field_name).toUpperCase();
                    const oldVal = cleanDisplayValue(h.old_value);
                    const newVal = cleanDisplayValue(h.new_value);

                    const entryHeight = 16;
                    checkPageBreak(entryHeight + 3);

                    if (idx % 2 === 0) {
                        doc.setFillColor(248, 250, 252);
                        doc.rect(margin, y - 1, contentWidth, entryHeight, 'F');
                    }

                    doc.setFontSize(6.5);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(100, 116, 139);
                    doc.text(dateStr, margin + 3, y + 3);

                    doc.setTextColor(30, 64, 175);
                    doc.text('CM - GRUPO TM SEG', margin + 50, y + 3);

                    doc.setTextColor(15, 23, 42);
                    doc.setFont('helvetica', 'bold');
                    doc.text(field, margin + 105, y + 3);

                    const halfW = (contentWidth - 8) / 2;

                    doc.setFontSize(5.5);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(150, 150, 150);
                    doc.text('ANTES:', margin + 3, y + 8);

                    doc.setFontSize(6.5);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(185, 28, 28);
                    const oldTrunc = doc.splitTextToSize(oldVal, halfW - 15)[0] || '—';
                    doc.text(oldTrunc, margin + 18, y + 8);

                    doc.setFontSize(5.5);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(150, 150, 150);
                    doc.text('DEPOIS:', margin + halfW + 6, y + 8);

                    doc.setFontSize(6.5);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(22, 101, 52);
                    const newTrunc = doc.splitTextToSize(newVal, halfW - 15)[0] || '—';
                    doc.text(newTrunc, margin + halfW + 22, y + 8);

                    y += entryHeight + 1;
                });
                y += 4;
            }

            checkPageBreak(100);
            drawSectionHeader('MAPA DA OPERAÇÃO');

            let mapUrl = '';
            if (mission.origin && mission.destination) {
                const oEnc = encodeURIComponent(mission.origin);
                const dEnc = encodeURIComponent(mission.destination);
                mapUrl = `https://maps.googleapis.com/maps/api/staticmap?size=640x400&maptype=roadmap&markers=color:green%7Clabel:A%7C${oEnc}&markers=color:red%7Clabel:B%7C${dEnc}&key=${MAPS_API_KEY}`;
            }

            if (mapUrl) {
                const imgData = await loadMapImage(mapUrl);
                if (imgData) {
                    const mapH = contentWidth * 0.625;
                    checkPageBreak(mapH + 6);
                    doc.setDrawColor(200, 200, 200);
                    doc.setLineWidth(0.3);
                    doc.rect(margin, y, contentWidth, mapH);
                    doc.addImage(imgData, 'JPEG', margin + 0.3, y + 0.3, contentWidth - 0.6, mapH - 0.6);
                    y += mapH + 4;
                } else {
                    doc.setFontSize(8);
                    doc.setTextColor(150, 150, 150);
                    doc.text('Mapa indisponível no momento.', margin + 3, y + 3);
                    y += 10;
                }
            } else {
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.text('Sem cidades de origem/destino para exibir o mapa.', margin + 3, y + 3);
                y += 10;
            }

            const waypoints = getMapLinksFromLogs();
            if (waypoints.length > 0) {
                checkPageBreak(10);
                doc.setFontSize(6.5);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(100, 116, 139);
                const legendParts: string[] = [];
                if (waypoints.length >= 1) legendParts.push(`A (Origem): ${waypoints[0].lat}, ${waypoints[0].lng}`);
                if (waypoints.length >= 2) legendParts.push(`B (Destino): ${waypoints[waypoints.length - 1].lat}, ${waypoints[waypoints.length - 1].lng}`);
                if (waypoints.length > 2) legendParts.push(`+ ${waypoints.length - 2} pontos intermediários`);
                doc.text(legendParts.join('   |   '), margin + 3, y + 2);
                y += 6;
            }

            checkPageBreak(50);
            y += 5;
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.2);
            doc.line(margin, y, pageWidth - margin, y);
            y += 8;

            doc.setFontSize(7);
            doc.setTextColor(100, 116, 139);
            doc.setFont('helvetica', 'normal');
            doc.text('DECLARAÇÃO DE CONFORMIDADE', pageWidth / 2, y, { align: 'center' });
            y += 5;
            doc.setFontSize(6.5);
            const disclaimer = 'Este relatório foi gerado automaticamente pelo sistema de Gestão Operacional do Grupo TMSEG. As informações contidas neste documento são de caráter confidencial e destinam-se exclusivamente ao uso das partes envolvidas na operação. A reprodução ou distribuição não autorizada é proibida.';
            const discLines = doc.splitTextToSize(disclaimer, contentWidth - 10);
            doc.text(discLines, pageWidth / 2, y, { align: 'center' });
            y += discLines.length * 3 + 10;

            checkPageBreak(15);
            const sigWidth = (contentWidth - 20) / 2;
            doc.setDrawColor(30, 30, 30);
            doc.setLineWidth(0.3);
            doc.line(margin + 5, y, margin + 5 + sigWidth, y);
            doc.line(pageWidth - margin - 5 - sigWidth, y, pageWidth - margin - 5, y);

            doc.setFontSize(7);
            doc.setTextColor(30, 30, 30);
            doc.setFont('helvetica', 'bold');
            doc.text('RESPONSÁVEL PELA OPERAÇÃO', margin + 5 + sigWidth / 2, y + 5, { align: 'center' });
            doc.text('CLIENTE / CONTRATANTE', pageWidth - margin - 5 - sigWidth / 2, y + 5, { align: 'center' });

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
                                    {[
                                        { ok: true, text: 'Dados do Cliente' },
                                        { ok: true, text: 'Rota e Cronologia' },
                                        { ok: true, text: 'Equipe de Escolta' },
                                        { ok: true, text: 'Dados da Carga' },
                                        { ok: logs.length > 0, text: `Timeline (${logs.length} eventos)` },
                                        { ok: history.length > 0, text: `Auditoria (${history.length} alt.)` },
                                        { ok: !!mission.mapLink || !!mission.origin, text: 'Mapa da Operação' },
                                        { ok: true, text: 'KM e Tempo' }
                                    ].map((item, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${item.ok ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                            <span className="font-bold text-gray-700">{item.text}</span>
                                        </div>
                                    ))}
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
