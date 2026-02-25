
import React, { useState, useEffect } from 'react';
import { Mission, MissionLog, MissionHistory, Agent, Vehicle, MissionStatus } from '../types';
import { supabase } from '../lib/supabase';
import { X, ExternalLink, Loader2, FileText } from 'lucide-react';
import { googleMapsApiKey } from '../lib/maps';

interface Client {
    id: number;
    name: string;
    cnpj?: string;
    [key: string]: any;
}

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

const MAPS_API_KEY = googleMapsApiKey;

const MissionFullReportModal: React.FC<Props> = ({ mission, onClose }) => {
    const [logs, setLogs] = useState<MissionLog[]>([]);
    const [history, setHistory] = useState<MissionHistory[]>([]);
    const [agents, setAgents] = useState<Agent[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [vehicle, setVehicle] = useState<Vehicle | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isOpening, setIsOpening] = useState(false);

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
        return cleaned.toUpperCase();
    };

    const extractCoordsFromMapLink = (link: string): { lat: string; lng: string } | null => {
        const match = link.match(/q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
        if (match) return { lat: match[1], lng: match[2] };
        const match2 = link.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
        if (match2) return { lat: match2[1], lng: match2[2] };
        return null;
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

    const isMapLinkValue = (val: string | null): boolean => {
        if (!val) return false;
        return !!val.match(/^https?:\/\//) && !!val.match(/q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    };

    const openReportPage = () => {
        setIsOpening(true);
        try {
            const clientData = clients.find(c => c.name === mission.client);
            const clientDisplay = clientData ? `${clientData.name} - CNPJ: ${clientData.cnpj || '—'}` : mission.client;

            const statusLabel = STATUS_LABELS[mission.status] || mission.status.toUpperCase();
            const isCompleted = mission.status === MissionStatus.COMPLETED;
            const isCancelled = mission.status === MissionStatus.CANCELLED || mission.status === MissionStatus.REFUSED;
            const statusColor = isCompleted ? '#166534' : isCancelled ? '#B91C1C' : '#1E40AF';

            const opType = (mission.mission_type || 'CARACTERIZADA').toUpperCase();
            const kmTraveled = (mission.endKm && mission.startKm) ? (mission.endKm - mission.startKm) : 0;

            let operationHours = '—';
            if (mission.startTime && mission.endTime) {
                const diffMs = new Date(mission.endTime).getTime() - new Date(mission.startTime).getTime();
                if (diffMs > 0) {
                    const hours = Math.floor(diffMs / (1000 * 60 * 60));
                    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                    operationHours = `${hours}h ${mins}min`;
                }
            }

            const agent1Data = agents.find(a => a.name === mission.agent1);
            const agent2Data = agents.find(a => a.name === mission.agent2);

            const statusChangeToInTransit = history.find(h =>
                h.field_name === 'status' &&
                h.new_value === 'Em Viagem'
            );
            const timelineCutoff = statusChangeToInTransit ? new Date(statusChangeToInTransit.changed_at).getTime() : null;

            const filteredLogs = timelineCutoff
                ? logs.filter(l => new Date(l.created_at).getTime() >= timelineCutoff)
                : logs;

            const hiddenAuditFields = ['cost_value', 'toll_value', 'is_same_os', 'billing_approved', 'revenue_value', 'billing_verified_by'];
            const filteredHistory = history.filter(h =>
                !hiddenAuditFields.includes(h.field_name) &&
                (!timelineCutoff || new Date(h.changed_at).getTime() >= timelineCutoff)
            );
            const finalHistory = filteredHistory.filter(h => {
                if (!timelineCutoff) return true;
                const hTime = new Date(h.changed_at).getTime();
                if (hTime > timelineCutoff) return true;
                if (hTime === timelineCutoff) {
                    return h.field_name === 'status' && h.new_value === 'Em Viagem';
                }
                return false;
            });

            const statusHistory = history.filter(h => h.field_name === 'status');

            let mapEmbedUrl = '';
            let mapDirectionsLink = '';
            if (mission.origin && mission.destination) {
                const oEnc = encodeURIComponent(mission.origin);
                const dEnc = encodeURIComponent(mission.destination);
                mapEmbedUrl = `https://www.google.com/maps?saddr=${oEnc}&daddr=${dEnc}&output=embed`;
                mapDirectionsLink = `https://www.google.com/maps/dir/${oEnc}/${dEnc}`;
            }

            const timelineHTML = filteredLogs.length === 0
                ? `<p style="color:#94a3b8;font-style:italic;padding:12px 0;">Nenhum evento registrado a partir do início da viagem.</p>`
                : filteredLogs.map((log, idx) => {
                    const dateStr = formatDateTime(log.created_at);
                    const desc = (log.description || '—').toUpperCase();
                    const mapLink = getLogMapLink(log);
                    let mapCoordHTML = '';
                    if (mapLink) {
                        const c = extractCoordsFromMapLink(mapLink);
                        if (c) {
                            mapCoordHTML = `<a href="${mapLink}" target="_blank" style="color:#1E40AF;font-size:11px;font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:4px;">📍 GPS: ${c.lat}, ${c.lng} ↗</a>`;
                        }
                    }

                    const logTime = new Date(log.created_at).getTime();
                    let logStatus = mission.status.toUpperCase();
                    const lastStatusChange = [...statusHistory]
                        .reverse()
                        .find(h => new Date(h.changed_at).getTime() <= logTime);
                    if (lastStatusChange) {
                        logStatus = lastStatusChange.new_value?.toUpperCase() || logStatus;
                    }

                    const exactStatusChange = statusHistory.find(h =>
                        Math.abs(new Date(h.changed_at).getTime() - logTime) < 5000
                    );
                    const statusTag = exactStatusChange ? `<span style="background:#B91C1C;color:white;padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;margin-left:8px;">ALTERAÇÃO DE STATUS</span>` : '';

                    const bgColor = idx % 2 === 1 ? '#F8FAFC' : '#FFFFFF';

                    return `
                        <div style="padding:12px 16px;background:${bgColor};border-left:3px solid #B91C1C;margin-bottom:2px;display:flex;flex-direction:column;gap:4px;">
                            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                                <span style="color:#64748B;font-size:11px;font-weight:700;">${dateStr}</span>
                                <span style="color:#64748B;font-size:11px;font-weight:600;">CM - GRUPO TM SEG</span>
                                <span style="background:${statusColor};color:white;padding:1px 8px;border-radius:4px;font-size:9px;font-weight:700;">${logStatus}</span>
                                ${statusTag}
                            </div>
                            <div style="color:#0F172A;font-size:12px;font-weight:500;">${desc}</div>
                            ${mapCoordHTML ? `<div>${mapCoordHTML}</div>` : ''}
                        </div>
                    `;
                }).join('');

            const auditHTML = finalHistory.length === 0
                ? ''
                : `
                    <div class="section-header">REGISTRO DE ALTERAÇÕES (AUDITORIA)</div>
                    <div style="border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
                        ${finalHistory.map((h, idx) => {
                            const dateStr = formatDateTime(h.changed_at);
                            const field = translateField(h.field_name).toUpperCase();
                            const oldVal = cleanDisplayValue(h.old_value);
                            const newVal = cleanDisplayValue(h.new_value);
                            const bgColor = idx % 2 === 0 ? '#F8FAFC' : '#FFFFFF';

                            let oldDisplay = `<span style="color:#B91C1C;font-weight:500;">${oldVal}</span>`;
                            let newDisplay = `<span style="color:#166534;font-weight:500;">${newVal}</span>`;

                            if (isMapLinkValue(h.old_value)) {
                                const coords = extractCoordsFromMapLink(h.old_value!);
                                oldDisplay = coords
                                    ? `<a href="${h.old_value}" target="_blank" style="color:#B91C1C;font-weight:500;text-decoration:none;">📍 ${coords.lat}, ${coords.lng} ↗</a>`
                                    : oldDisplay;
                            }
                            if (isMapLinkValue(h.new_value)) {
                                const coords = extractCoordsFromMapLink(h.new_value!);
                                newDisplay = coords
                                    ? `<a href="${h.new_value}" target="_blank" style="color:#166534;font-weight:500;text-decoration:none;">📍 ${coords.lat}, ${coords.lng} ↗</a>`
                                    : newDisplay;
                            }

                            return `
                                <div style="padding:10px 16px;background:${bgColor};border-bottom:1px solid #F1F5F9;">
                                    <div style="display:flex;align-items:center;gap:16px;margin-bottom:4px;flex-wrap:wrap;">
                                        <span style="color:#64748B;font-size:11px;font-weight:700;">${dateStr}</span>
                                        <span style="color:#1E40AF;font-size:11px;font-weight:600;">CM - GRUPO TM SEG</span>
                                        <span style="color:#0F172A;font-size:11px;font-weight:700;">${field}</span>
                                    </div>
                                    <div style="display:flex;gap:24px;font-size:11px;flex-wrap:wrap;">
                                        <div><span style="color:#94A3B8;font-weight:700;font-size:9px;">ANTES:</span> ${oldDisplay}</div>
                                        <div><span style="color:#94A3B8;font-weight:700;font-size:9px;">DEPOIS:</span> ${newDisplay}</div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;

            const vehicleDisplay = vehicle
                ? `${vehicle.model || ''} — ${vehicle.plate || ''} — ${vehicle.color || ''}`.toUpperCase()
                : mission.vehicleId || '—';
            const trackerDisplay = vehicle
                ? `${vehicle.tracker_type || '—'} / ${vehicle.tracker_id || '—'}`
                : '—';

            const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Relatório OS ${mission.id} — GRUPO TMSEG</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #F1F5F9;
            color: #0F172A;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .page {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            min-height: 100vh;
        }
        .top-bar { height: 4px; background: #B91C1C; }
        .header {
            background: #0F172A;
            padding: 24px 32px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .header h1 { color: white; font-size: 22px; font-weight: 800; }
        .header .sub { color: #94A3B8; font-size: 11px; margin-top: 4px; }
        .os-badge {
            background: #B91C1C;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            text-align: center;
        }
        .os-badge .label { font-size: 9px; color: #FFC8C8; font-weight: 600; }
        .os-badge .number { font-size: 20px; font-weight: 800; margin-top: 2px; }
        .status-bar {
            padding: 12px 32px;
            display: flex;
            align-items: center;
            gap: 12px;
            border-bottom: 1px solid #E2E8F0;
        }
        .badge {
            padding: 4px 16px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
            color: white;
        }
        .content { padding: 24px 32px; }
        .section-header {
            background: #0F172A;
            color: white;
            padding: 10px 16px;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.5px;
            border-radius: 6px 6px 0 0;
            margin-top: 24px;
            margin-bottom: 0;
        }
        .section-body {
            border: 1px solid #E2E8F0;
            border-top: none;
            border-radius: 0 0 6px 6px;
            padding: 16px;
            margin-bottom: 24px;
        }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
        .grid-4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 16px; }
        .field-label {
            font-size: 9px;
            font-weight: 800;
            color: #64748B;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
        }
        .field-value {
            font-size: 13px;
            font-weight: 700;
            color: #0F172A;
            word-break: break-word;
        }
        .divider {
            height: 1px;
            background: #E2E8F0;
            margin: 12px 0;
        }
        .map-container {
            border: 1px solid #E2E8F0;
            border-top: none;
            border-radius: 0 0 6px 6px;
            overflow: hidden;
            margin-bottom: 24px;
        }
        .map-container iframe {
            width: 100%;
            height: 450px;
            border: none;
        }
        .footer {
            border-top: 1px solid #E2E8F0;
            padding: 24px 32px;
            text-align: center;
        }
        .footer p { font-size: 10px; color: #94A3B8; line-height: 1.6; }
        .signatures {
            display: flex;
            justify-content: space-around;
            margin-top: 40px;
            padding: 0 32px 40px;
        }
        .sig-line {
            text-align: center;
            width: 250px;
        }
        .sig-line .line {
            border-top: 1px solid #0F172A;
            margin-bottom: 8px;
        }
        .sig-line .label {
            font-size: 10px;
            font-weight: 700;
            color: #0F172A;
        }
        .print-btn {
            position: fixed;
            top: 16px;
            right: 16px;
            background: #0F172A;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            z-index: 1000;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        .print-btn:hover { background: #1E293B; }
        @media print {
            .print-btn { display: none; }
            body { background: white; }
            .page { box-shadow: none; }
        }
    </style>
</head>
<body>
    <button class="print-btn" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>

    <div class="page">
        <div class="top-bar"></div>

        <div class="header">
            <div>
                <h1>GRUPO TMSEG</h1>
                <div class="sub">${clientDisplay.toUpperCase()}</div>
                <div class="sub">GESTÃO DE RISCO E SEGURANÇA PATRIMONIAL</div>
            </div>
            <div class="os-badge">
                <div class="label">ORDEM DE SERVIÇO</div>
                <div class="number">${mission.id}</div>
            </div>
        </div>

        <div class="status-bar">
            <span class="badge" style="background:${statusColor}">${statusLabel}</span>
            <span class="badge" style="background:#64748B">${opType}</span>
            <span style="margin-left:auto;font-size:11px;color:#64748B;">Emissão: ${new Date().toLocaleString('pt-BR')}</span>
        </div>

        <div class="content">
            <div class="section-header">DADOS DO CLIENTE / CONTRATANTE</div>
            <div class="section-body">
                <div class="grid-2">
                    <div>
                        <div class="field-label">CLIENTE</div>
                        <div class="field-value">${(mission.client || '—').toUpperCase()}</div>
                    </div>
                    <div>
                        <div class="field-label">GR / ESPELHAMENTO</div>
                        <div class="field-value">${mission.gr_espelhamento || '—'}</div>
                    </div>
                </div>
            </div>

            <div class="section-header">ROTA DA OPERAÇÃO</div>
            <div class="section-body">
                <div class="grid-2">
                    <div>
                        <div class="field-label">ORIGEM</div>
                        <div class="field-value">${(mission.origin || '—').toUpperCase()}</div>
                    </div>
                    <div>
                        <div class="field-label">DESTINO</div>
                        <div class="field-value">${(mission.destination || '—').toUpperCase()}</div>
                    </div>
                </div>
                <div class="divider"></div>
                <div class="grid-3">
                    <div>
                        <div class="field-label">DISTÂNCIA PLANEJADA</div>
                        <div class="field-value">${mission.totalDistance || 0} KM</div>
                    </div>
                    <div>
                        <div class="field-label">KM INICIAL</div>
                        <div class="field-value">${mission.startKm || '—'}</div>
                    </div>
                    <div>
                        <div class="field-label">KM FINAL</div>
                        <div class="field-value">${mission.endKm || '—'}</div>
                    </div>
                </div>
                <div class="divider"></div>
                <div class="grid-2">
                    <div>
                        <div class="field-label">KM PERCORRIDO</div>
                        <div class="field-value">${kmTraveled.toFixed(1)} KM</div>
                    </div>
                    <div>
                        <div class="field-label">PROGRESSO</div>
                        <div class="field-value">${Math.floor(mission.progress || 0)}%</div>
                    </div>
                </div>
            </div>

            <div class="section-header">CRONOLOGIA DA OPERAÇÃO</div>
            <div class="section-body">
                <div class="grid-3">
                    <div>
                        <div class="field-label">CRIAÇÃO DA OS</div>
                        <div class="field-value">${formatDateTime(mission.createdAt)}</div>
                    </div>
                    <div>
                        <div class="field-label">INÍCIO DA VIAGEM</div>
                        <div class="field-value">${formatDateTime(mission.startTime)}</div>
                    </div>
                    <div>
                        <div class="field-label">FIM DA VIAGEM</div>
                        <div class="field-value">${formatDateTime(mission.endTime)}</div>
                    </div>
                </div>
                <div class="divider"></div>
                <div class="grid-2">
                    <div>
                        <div class="field-label">TEMPO TOTAL DE OPERAÇÃO</div>
                        <div class="field-value">${operationHours}</div>
                    </div>
                    <div>
                        <div class="field-label">KM RODADOS</div>
                        <div class="field-value">${kmTraveled > 0 ? `${kmTraveled.toFixed(1)} KM` : '—'}</div>
                    </div>
                </div>
            </div>

            <div class="section-header">DADOS DA CARGA / VEÍCULO DO CLIENTE</div>
            <div class="section-body">
                <div class="grid-3">
                    <div>
                        <div class="field-label">MOTORISTA</div>
                        <div class="field-value">${(mission.driver_name || '—').toUpperCase()}</div>
                    </div>
                    <div>
                        <div class="field-label">TELEFONE</div>
                        <div class="field-value">${mission.driver_phone || '—'}</div>
                    </div>
                    <div>
                        <div class="field-label">PLACA</div>
                        <div class="field-value">${mission.clientVehicle?.plate || '—'}</div>
                    </div>
                </div>
                <div class="divider"></div>
                <div class="grid-2">
                    <div>
                        <div class="field-label">MODELO</div>
                        <div class="field-value">${(mission.clientVehicle?.model || '—').toUpperCase()}</div>
                    </div>
                    <div>
                        <div class="field-label">MARCA</div>
                        <div class="field-value">${(mission.clientVehicle?.brand || '—').toUpperCase()}</div>
                    </div>
                </div>
            </div>

            <div class="section-header">EQUIPE DE ESCOLTA / SEGURANÇA</div>
            <div class="section-body">
                <div>
                    <div class="field-label">FORNECEDOR</div>
                    <div class="field-value">${(mission.provider || '—').toUpperCase()}</div>
                </div>
                ${mission.agent1 ? `
                    <div class="divider"></div>
                    <div class="grid-4">
                        <div>
                            <div class="field-label">AGENTE 01</div>
                            <div class="field-value">${mission.agent1.toUpperCase()}</div>
                        </div>
                        <div>
                            <div class="field-label">CPF</div>
                            <div class="field-value">${agent1Data?.cpf || '—'}</div>
                        </div>
                        <div>
                            <div class="field-label">RG</div>
                            <div class="field-value">${agent1Data?.rg || '—'}</div>
                        </div>
                        <div>
                            <div class="field-label">CNV</div>
                            <div class="field-value">${agent1Data?.cnv || '—'}</div>
                        </div>
                    </div>
                ` : ''}
                ${mission.agent2 && mission.agent2 !== '---' ? `
                    <div class="divider"></div>
                    <div class="grid-4">
                        <div>
                            <div class="field-label">AGENTE 02</div>
                            <div class="field-value">${mission.agent2.toUpperCase()}</div>
                        </div>
                        <div>
                            <div class="field-label">CPF</div>
                            <div class="field-value">${agent2Data?.cpf || '—'}</div>
                        </div>
                        <div>
                            <div class="field-label">RG</div>
                            <div class="field-value">${agent2Data?.rg || '—'}</div>
                        </div>
                        <div>
                            <div class="field-label">CNV</div>
                            <div class="field-value">${agent2Data?.cnv || '—'}</div>
                        </div>
                    </div>
                ` : ''}
                <div class="divider"></div>
                <div class="grid-2">
                    <div>
                        <div class="field-label">VIATURA</div>
                        <div class="field-value">${vehicleDisplay}</div>
                    </div>
                    <div>
                        <div class="field-label">RASTREADOR</div>
                        <div class="field-value">${trackerDisplay}</div>
                    </div>
                </div>
            </div>

            <div class="section-header">ÚLTIMA OCORRÊNCIA REGISTRADA</div>
            <div class="section-body">
                <div class="field-value" style="font-size:12px;font-weight:500;">
                    ${(mission.currentLocation || 'Sem ocorrências registradas.').toUpperCase()}
                    ${mission.mapLink ? `<br><a href="${mission.mapLink}" target="_blank" style="color:#1E40AF;font-size:11px;text-decoration:none;font-weight:600;">📍 Ver localização no mapa ↗</a>` : ''}
                </div>
            </div>

            <div class="section-header">TIMELINE COMPLETA DE EVENTOS</div>
            <div style="border:1px solid #E2E8F0;border-top:none;border-radius:0 0 6px 6px;overflow:hidden;margin-bottom:24px;">
                ${timelineHTML}
            </div>

            ${auditHTML}

            <div class="section-header">MAPA DA OPERAÇÃO</div>
            <div class="map-container">
                ${mapEmbedUrl
                    ? `<iframe src="${mapEmbedUrl}" allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade" style="width:100%;height:450px;border:none;"></iframe>
                       <div style="padding:8px 16px;text-align:right;background:#F8FAFC;border-top:1px solid #E2E8F0;">
                           <a href="${mapDirectionsLink}" target="_blank" style="color:#1E40AF;font-size:11px;font-weight:600;text-decoration:none;">📍 Abrir rota completa no Google Maps ↗</a>
                       </div>`
                    : `<div style="padding:40px;text-align:center;color:#94A3B8;">Sem cidades de origem/destino para exibir o mapa.</div>`
                }
            </div>
        </div>

        <div class="footer">
            <p>Este relatório foi gerado automaticamente pelo sistema de Gestão Operacional do Grupo TMSEG.<br>
            As informações contidas neste documento são de caráter confidencial e destinam-se exclusivamente ao uso das partes envolvidas na operação.<br>
            A reprodução ou distribuição não autorizada é proibida.</p>
        </div>

        <div class="signatures">
            <div class="sig-line">
                <div class="line"></div>
                <div class="label">RESPONSÁVEL PELA OPERAÇÃO</div>
            </div>
            <div class="sig-line">
                <div class="line"></div>
                <div class="label">CLIENTE / CONTRATANTE</div>
            </div>
        </div>

        <div style="text-align:center;padding:0 0 20px;font-size:10px;color:#94A3B8;">
            GRUPO TMSEG — Relatório Operacional Confidencial — Gerado em ${new Date().toLocaleString('pt-BR')}
        </div>
    </div>
</body>
</html>`;

            const newWindow = window.open('', '_blank');
            if (newWindow) {
                newWindow.document.write(html);
                newWindow.document.close();
            } else {
                alert('Não foi possível abrir a nova aba. Verifique se o bloqueador de pop-ups está desativado.');
            }

        } catch (err) {
            console.error('Erro ao gerar relatório:', err);
            alert('Erro ao gerar o relatório. Tente novamente.');
        } finally {
            setIsOpening(false);
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
                                        { ok: !!mission.mapLink || !!mission.origin, text: 'Mapa Interativo' },
                                        { ok: true, text: 'Links Clicáveis' }
                                    ].map((item, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${item.ok ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                            <span className="font-bold text-gray-700">{item.text}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={openReportPage}
                                disabled={isOpening}
                                className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-gray-900 to-red-800 hover:from-gray-800 hover:to-red-700 text-white py-4 rounded-xl font-bold text-sm uppercase tracking-wider transition-all shadow-lg hover:shadow-xl active:scale-[0.98] disabled:opacity-60"
                            >
                                {isOpening ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        Abrindo Relatório...
                                    </>
                                ) : (
                                    <>
                                        <ExternalLink size={18} />
                                        Abrir Relatório em Nova Aba
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
