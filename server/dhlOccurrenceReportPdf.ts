import { jsPDF } from 'jspdf';
import fs from 'node:fs';
import path from 'node:path';
import { buildOccurrenceNarrative, buildOccurrenceReportHtml } from '../lib/dhlOccurrenceReport/buildReportHtml';
import { collectDhlOccurrenceReportData } from '../lib/dhlOccurrenceReport/collectReportData';
import type { DhlOccurrenceReportInput } from '../lib/dhlOccurrenceReport/types';
import { formatDateTimeBR, formatTimeBR } from '../lib/dateUtils';
import { createSupabaseAdminClient, getSupabaseAnonKey, getSupabaseUrl } from './supabaseConfig';
import { createClient } from '@supabase/supabase-js';

const BRAND_WINE = '#450a0a';
const BRAND_NAVY = '#0d3b66';
const BRAND_LIGHT = '#e8eef4';

function getSupabase() {
  return createSupabaseAdminClient() ?? createClient(getSupabaseUrl(), getSupabaseAnonKey());
}

async function loadImageBase64(url: string): Promise<string | null> {
  try {
    if (url.startsWith('/')) {
      const local = path.resolve(process.cwd(), 'public', url.replace(/^\//, ''));
      if (fs.existsSync(local)) {
        const buf = fs.readFileSync(local);
        const ext = path.extname(local).toLowerCase() === '.png' ? 'PNG' : 'JPEG';
        return `data:image/${ext.toLowerCase()};base64,${buf.toString('base64')}`;
      }
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ctype = res.headers.get('content-type') || 'image/png';
    const fmt = ctype.includes('png') ? 'PNG' : 'JPEG';
    return `data:image/${fmt.toLowerCase()};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

function ensureSpace(doc: jsPDF, y: number, need: number, margin: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + need > pageH - margin) {
    doc.addPage();
    return margin;
  }
  return y;
}

function wrapText(doc: jsPDF, text: string, x: number, y: number, maxW: number, lineH = 4.5): number {
  const lines = doc.splitTextToSize(text, maxW);
  for (const line of lines) {
    doc.text(line, x, y);
    y += lineH;
  }
  return y;
}

export async function generateDhlOccurrenceReportPdf(input: DhlOccurrenceReportInput): Promise<Buffer | null> {
  try {
    const sb = getSupabase();
    const data = await collectDhlOccurrenceReportData(sb, input);
    if (!data) return null;

    const narrative = buildOccurrenceNarrative(data);
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 12;
    const pageW = 210;
    const contentW = pageW - margin * 2;
    let y = margin;

    const logoPath = path.resolve(process.cwd(), 'public', 'logo.png');
    if (fs.existsSync(logoPath)) {
      const logoB64 = fs.readFileSync(logoPath).toString('base64');
      doc.addImage(`data:image/png;base64,${logoB64}`, 'PNG', margin, y, 34, 14);
    }

    doc.setTextColor(BRAND_NAVY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Plano de Ação e Justificativa', pageW / 2, y + 5, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor('#555');
    doc.text(`DHL — S.E. ${data.seNumber} · OS ${data.missionId}`, pageW / 2, y + 10, { align: 'center' });
    doc.setDrawColor(BRAND_WINE);
    doc.setLineWidth(0.8);
    doc.line(margin, y + 16, pageW - margin, y + 16);
    y += 22;

    const section = (title: string) => {
      y = ensureSpace(doc, y, 12, margin);
      doc.setFillColor(BRAND_LIGHT);
      doc.rect(margin, y, contentW, 7, 'F');
      doc.setTextColor(BRAND_NAVY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(title, margin + 2, y + 5);
      y += 9;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor('#111');
      doc.setFontSize(8.5);
    };

    section('Identificação');
    const meta = [
      ['S.E.', data.seNumber],
      ['OS', data.missionId],
      ['Placa', data.clientVehiclePlate || '—'],
      ['Emissão', `${formatDateTimeBR(data.generatedAt)} (Brasília)`],
    ];
    for (const [k, v] of meta) {
      doc.setFont('helvetica', 'bold');
      doc.text(`${k}:`, margin, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(v), margin + 22, y);
      y += 5;
    }
    y += 3;

    section('Resumo dos fatos');
    y = wrapText(doc, narrative.factsSummary, margin, y, contentW);
    y += 4;

    section('Marcos operacionais (Brasília)');
    for (const mark of data.marks) {
      const when = mark.at ? `${formatTimeBR(mark.at)} — ${formatDateTimeBR(mark.at).split(' ')[0]}` : '—';
      doc.setFont('helvetica', 'bold');
      doc.text(`${mark.label}:`, margin, y);
      doc.setFont('helvetica', 'normal');
      doc.text(when, margin + 52, y);
      y += 5;
    }
    y += 3;

    section('Análise e causa');
    y = wrapText(doc, narrative.rootCause, margin, y, contentW);
    y += 4;

    section('Evidências fotográficas');
    for (const photo of data.phasePhotos) {
      y = ensureSpace(doc, y, 58, margin);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      const timeLabel = photo.at ? formatTimeBR(photo.at) : '—';
      doc.text(`${photo.label} — ${timeLabel}`, margin, y);
      y += 5;
      if (photo.url) {
        const img = await loadImageBase64(photo.url);
        if (img) {
          try {
            doc.addImage(img, 'PNG', margin, y, contentW / 2, 36);
            y += 40;
            continue;
          } catch {
            /* fallback texto */
          }
        }
      }
      doc.setFont('helvetica', 'italic');
      doc.setTextColor('#666');
      y = wrapText(doc, 'Evidência não registrada no sistema para esta etapa.', margin, y, contentW);
      doc.setTextColor('#111');
      y += 4;
    }

    section('Ações corretivas e preventivas');
    y = wrapText(doc, `Corretivas: ${narrative.correctiveActions.join(' ')}`, margin, y, contentW);
    y += 2;
    y = wrapText(doc, `Preventivas: ${narrative.preventiveActions.join(' ')}`, margin, y, contentW);
    y += 8;

    y = ensureSpace(doc, y, 30, margin);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(BRAND_WINE);
    doc.text('VISTO', margin, y);
    y += 7;
    doc.setTextColor('#111');
    doc.setFontSize(9);
    doc.text(data.directorName, margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text('Diretoria — Grupo TM SEG', margin, y);
    y += 5;
    doc.text(formatDateTimeBR(data.generatedAt), margin, y);

    return Buffer.from(doc.output('arraybuffer'));
  } catch (err) {
    console.error('[dhlOccurrenceReportPdf]', err);
    return null;
  }
}

export async function generateDhlOccurrenceReportHtml(input: DhlOccurrenceReportInput): Promise<string | null> {
  try {
    const sb = getSupabase();
    const data = await collectDhlOccurrenceReportData(sb, input);
    if (!data) return null;
    return buildOccurrenceReportHtml(data);
  } catch {
    return null;
  }
}

export function dhlOccurrenceReportFilename(seNumber: string): string {
  return `PA-DHL-${seNumber}.pdf`;
}
