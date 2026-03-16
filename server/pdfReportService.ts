import { jsPDF } from 'jspdf';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface ReportData {
  mission: any;
  agents: any[];
  vehicle: any;
  clientVehicle: any;
}

function formatDateBR(dateString?: string): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch { return '-'; }
}

function formatDateTimeBR(dateString?: string): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    const date = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    return `${date} ${time}`;
  } catch { return '-'; }
}

export async function generateMissionReportPDF(missionId: string): Promise<Buffer | null> {
  try {
    const { data: mission } = await supabase.from('missions').select('*').eq('id', missionId).single();
    if (!mission) return null;

    const agentNames = [mission.agent1, mission.agent2].filter(Boolean);
    let agents: any[] = [];
    if (agentNames.length > 0) {
      const { data: agentsData } = await supabase.from('agents').select('*').in('name', agentNames);
      if (agentsData) agents = agentsData;
    }

    let vehicle: any = null;
    if (mission.vehicle_id) {
      const { data: veh } = await supabase.from('vehicles').select('*').eq('id', mission.vehicle_id).single();
      if (veh) vehicle = veh;
    }

    let clientVehicle: any = null;
    if (mission.client_vehicle_id) {
      const { data: cv } = await supabase.from('client_vehicles').select('*').eq('id', mission.client_vehicle_id).single();
      if (cv) clientVehicle = cv;
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210;
    const margin = 10;
    const contentW = pageW - margin * 2;
    let y = margin;

    const BLACK = '#000000';
    const DARK_RED = '#7f1d1d';
    const GRAY_BG = '#e5e5e5';
    const WHITE = '#ffffff';

    const drawRect = (x: number, yPos: number, w: number, h: number, fill?: string, stroke?: string) => {
      if (fill) { doc.setFillColor(fill); doc.rect(x, yPos, w, h, 'F'); }
      if (stroke) { doc.setDrawColor(stroke); doc.rect(x, yPos, w, h, 'S'); }
    };

    const drawHeaderBar = (text: string, yPos: number): number => {
      drawRect(margin, yPos, contentW, 6, BLACK);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(WHITE);
      doc.text(text, pageW / 2, yPos + 4, { align: 'center' });
      doc.setTextColor(BLACK);
      return yPos + 6;
    };

    const drawCell = (x: number, yPos: number, w: number, h: number, text: string, opts?: { bold?: boolean; bg?: string; fontSize?: number; align?: 'left' | 'center' | 'right' }) => {
      const bg = opts?.bg;
      const bold = opts?.bold ?? false;
      const fontSize = opts?.fontSize ?? 7;
      const align = opts?.align ?? 'left';
      if (bg) { drawRect(x, yPos, w, h, bg); }
      drawRect(x, yPos, w, h, undefined, BLACK);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(fontSize);
      const textX = align === 'center' ? x + w / 2 : align === 'right' ? x + w - 2 : x + 2;
      doc.text(String(text || '-').toUpperCase(), textX, yPos + h / 2 + 1.5, { align, maxWidth: w - 4 });
    };

    try {
      const logoPath = path.resolve(process.cwd(), 'public', 'logo.png');
      if (fs.existsSync(logoPath)) {
        const logoData = fs.readFileSync(logoPath);
        const base64 = logoData.toString('base64');
        doc.addImage(`data:image/png;base64,${base64}`, 'PNG', margin + 2, y + 1, 30, 12);
      }
    } catch {}

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('GRUPO TMSEG - GESTÃO DE RISCO', pageW / 2, y + 5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#666666');
    doc.text('RELATÓRIO DE OPERAÇÃO DE ESCOLTA', pageW / 2, y + 10, { align: 'center' });
    doc.setTextColor(BLACK);
    y += 16;
    doc.setDrawColor(BLACK);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageW - margin, y);
    y += 3;

    const rowH = 7;
    const col1W = 30;
    const col2W = contentW / 2 - col1W;
    const col3W = 30;
    const col4W = contentW / 2 - col3W;

    drawCell(margin, y, col1W, rowH, 'FOLHA / OS', { bold: true, bg: BLACK });
    doc.setTextColor(WHITE); drawCell(margin, y, col1W, rowH, 'FOLHA / OS', { bold: true, bg: BLACK }); doc.setTextColor(BLACK);
    drawCell(margin + col1W, y, col2W, rowH, mission.id || '', { bold: true, fontSize: 9 });
    drawCell(margin + col1W + col2W, y, col3W, rowH, '', { bold: true, bg: BLACK });
    doc.setTextColor(WHITE); drawCell(margin + col1W + col2W, y, col3W, rowH, 'OPERAÇÃO', { bold: true, bg: BLACK }); doc.setTextColor(BLACK);
    drawCell(margin + col1W + col2W + col3W, y, col4W, rowH, mission.mission_type || 'CARACTERIZADA', {});
    y += rowH;

    drawCell(margin, y, col1W, rowH, '', { bold: true, bg: BLACK });
    doc.setTextColor(WHITE); drawCell(margin, y, col1W, rowH, 'ROTA', { bold: true, bg: BLACK }); doc.setTextColor(BLACK);
    const routeText = `${mission.origin || '-'} PARA ${mission.destination || '-'}`;
    const routeLines = doc.splitTextToSize(routeText.toUpperCase(), contentW - col1W - 4);
    const routeH = Math.max(rowH, routeLines.length * 4 + 3);
    drawCell(margin + col1W, y, contentW - col1W, routeH, '', {});
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(routeLines, margin + col1W + 2, y + 4);
    y += routeH;

    y += 2;
    y = drawHeaderBar('EMPRESA CONTRATANTE / CLIENTE', y);
    drawRect(margin, y, contentW, 7, undefined, BLACK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text((mission.client || '-').toUpperCase(), pageW / 2, y + 5, { align: 'center' });
    y += 7;

    y += 2;

    const renderAgent = (agentName: string | undefined, label: string, badge: string) => {
      if (!agentName) return;
      const agent = agents.find((a: any) => a.name === agentName);
      y = drawHeaderBar(`IDENTIFICAÇÃO DO AGENTE : ${label}`, y);
      const agentH = 5;
      const labelW = 22;
      const valW = (contentW - labelW) / 2;
      const labelW2 = 22;
      const valW2 = valW - labelW2 + labelW;

      drawCell(margin, y, labelW, agentH, 'NOME:', { bold: true, bg: GRAY_BG });
      drawCell(margin + labelW, y, contentW - labelW, agentH, agentName, { bold: true });
      y += agentH;
      drawCell(margin, y, labelW, agentH, 'CPF:', { bold: true, bg: GRAY_BG });
      drawCell(margin + labelW, y, contentW - labelW, agentH, agent?.cpf || '-', {});
      y += agentH;

      const halfW = contentW / 2;
      drawCell(margin, y, labelW, agentH, 'RG:', { bold: true, bg: GRAY_BG });
      drawCell(margin + labelW, y, halfW - labelW, agentH, agent?.rg || '-', {});
      drawCell(margin + halfW, y, labelW2, agentH, 'CONTATO:', { bold: true, bg: GRAY_BG });
      drawCell(margin + halfW + labelW2, y, halfW - labelW2, agentH, agent?.phone || '-', {});
      y += agentH;

      drawCell(margin, y, labelW, agentH, 'CNH:', { bold: true, bg: GRAY_BG });
      drawCell(margin + labelW, y, halfW - labelW, agentH, agent?.cnh || '-', {});
      drawCell(margin + halfW, y, labelW2, agentH, 'VAL CNH:', { bold: true, bg: GRAY_BG });
      drawCell(margin + halfW + labelW2, y, halfW - labelW2, agentH, formatDateBR(agent?.cnh_validity), {});
      y += agentH;

      drawCell(margin, y, labelW, agentH, 'CNV:', { bold: true, bg: GRAY_BG });
      drawCell(margin + labelW, y, halfW - labelW, agentH, agent?.cnv || '-', {});
      drawCell(margin + halfW, y, labelW2, agentH, 'VAL CNV:', { bold: true, bg: GRAY_BG });
      drawCell(margin + halfW + labelW2, y, halfW - labelW2, agentH, formatDateBR(agent?.cnv_validity), {});
      y += agentH;
      y += 2;
    };

    renderAgent(mission.agent1, 'LÍDER / MOTORISTA', 'AGENTE 01');
    renderAgent(mission.agent2, 'ESCOLTA AUXILIAR', 'AGENTE 02');

    y = drawHeaderBar('DADOS DA VIATURA E RASTREAMENTO', y);
    const vColW = contentW / 4;
    const vH = 5;
    drawCell(margin, y, vColW, vH, 'VIATURA', { bold: true, bg: GRAY_BG, align: 'center' });
    drawCell(margin + vColW, y, vColW, vH, 'COR', { bold: true, bg: GRAY_BG, align: 'center' });
    drawCell(margin + vColW * 2, y, vColW, vH, 'PLACA', { bold: true, bg: GRAY_BG, align: 'center' });
    drawCell(margin + vColW * 3, y, vColW, vH, 'RASTREADOR / ID', { bold: true, bg: GRAY_BG, align: 'center' });
    y += vH;
    drawCell(margin, y, vColW, vH, vehicle?.model || '-', { align: 'center' });
    drawCell(margin + vColW, y, vColW, vH, vehicle?.color || '-', { align: 'center' });
    drawCell(margin + vColW * 2, y, vColW, vH, vehicle?.plate || '-', { bold: true, align: 'center' });
    drawCell(margin + vColW * 3, y, vColW, vH, `${vehicle?.tracker_type || '-'} / ${vehicle?.tracker_id || '-'}`, { align: 'center' });
    y += vH;
    y += 2;

    y = drawHeaderBar('DADOS DA CARGA / VEÍCULO CLIENTE', y);
    const cH = 5;
    const cLabelW = 24;
    const cHalf = contentW / 2;
    drawCell(margin, y, cLabelW, cH, 'MOTORISTA:', { bold: true, bg: GRAY_BG });
    drawCell(margin + cLabelW, y, cHalf - cLabelW, cH, mission.driver_name || '-', {});
    drawCell(margin + cHalf, y, cLabelW, cH, 'TELEFONE:', { bold: true, bg: GRAY_BG });
    drawCell(margin + cHalf + cLabelW, y, cHalf - cLabelW, cH, mission.driver_phone || '-', {});
    y += cH;
    const cvPlateModel = clientVehicle ? `${clientVehicle.plate || '-'} - ${clientVehicle.model || '-'}` : (mission.client_vehicle || '-');
    drawCell(margin, y, cLabelW, cH, 'VEÍCULO:', { bold: true, bg: GRAY_BG });
    drawCell(margin + cLabelW, y, cHalf - cLabelW, cH, cvPlateModel, {});
    drawCell(margin + cHalf, y, cLabelW, cH, 'GR/DOC:', { bold: true, bg: GRAY_BG });
    drawCell(margin + cHalf + cLabelW, y, cHalf - cLabelW, cH, mission.gr_espelhamento || '-', {});
    y += cH;
    y += 2;

    y = drawHeaderBar('ÚLTIMA ATUALIZAÇÃO / OCORRÊNCIA', y);
    drawRect(margin, y, contentW, 10, undefined, BLACK);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text((mission.current_location || 'SEM OCORRÊNCIAS REGISTRADAS.').toUpperCase(), margin + 2, y + 5);
    y += 10;
    y += 2;

    const tColIcon = 10;
    const tColSit = contentW - tColIcon - 35 - 20;
    const tColDate = 35;
    const tColKm = 20;
    const tH = 6;

    drawRect(margin, y, contentW, tH, '#991b1b');
    doc.setTextColor(WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.text('ICON', margin + tColIcon / 2, y + 4, { align: 'center' });
    doc.text('SITUAÇÃO / ETAPA', margin + tColIcon + 2, y + 4);
    doc.text('DATA/HORA', margin + tColIcon + tColSit + tColDate / 2, y + 4, { align: 'center' });
    doc.text('KM', margin + tColIcon + tColSit + tColDate + tColKm / 2, y + 4, { align: 'center' });
    doc.setDrawColor(BLACK);
    doc.rect(margin, y, contentW, tH, 'S');
    doc.setTextColor(BLACK);
    y += tH;

    const timelineRows = [
      { icon: '>', label: 'DATA DA CRIAÇÃO', date: formatDateTimeBR(mission.created_at), km: '-' },
      { icon: '>', label: 'DATA DO AGENDAMENTO', date: formatDateTimeBR(mission.start_time), km: '-' },
      { icon: '>', label: 'DATA DA CHEGADA NA ORIGEM', date: formatDateTimeBR(mission.start_time), km: mission.start_km ? String(mission.start_km) : '-' },
      { icon: '>', label: 'DATA DE CONCLUÍDO', date: mission.end_time ? formatDateTimeBR(mission.end_time) : '-', km: mission.end_km ? String(mission.end_km) : '-' },
    ];

    timelineRows.forEach(row => {
      drawRect(margin, y, tColIcon, tH, undefined, BLACK);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(row.icon, margin + tColIcon / 2, y + 4, { align: 'center' });
      drawRect(margin + tColIcon, y, tColSit, tH, undefined, BLACK);
      doc.setFont('helvetica', 'bold');
      doc.text(row.label, margin + tColIcon + 2, y + 4);
      drawRect(margin + tColIcon + tColSit, y, tColDate, tH, undefined, BLACK);
      doc.setFont('helvetica', 'normal');
      doc.text(row.date, margin + tColIcon + tColSit + tColDate / 2, y + 4, { align: 'center' });
      drawRect(margin + tColIcon + tColSit + tColDate, y, tColKm, tH, undefined, BLACK);
      doc.text(row.km, margin + tColIcon + tColSit + tColDate + tColKm / 2, y + 4, { align: 'center' });
      y += tH;
    });

    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor('#999999');
    doc.text('ATENCIOSAMENTE DEPARTAMENTO DE ESCOLTA ARMADA - GRUPO TMSEG', pageW / 2, y, { align: 'center' });
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.text(`Documento gerado eletronicamente em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, pageW / 2, y, { align: 'center' });

    const pdfOutput = doc.output('arraybuffer');
    return Buffer.from(pdfOutput);
  } catch (err: any) {
    console.error('[PDF] Erro ao gerar relatório:', err.message);
    return null;
  }
}

export function formatOSForFilename(id: string): string {
  return `GTM-${id}`;
}
