import { jsPDF } from 'jspdf';
import { createClient } from '@supabase/supabase-js';
import { buildOccurrenceNarrative } from './buildReportHtml.js';
import { collectDhlOccurrenceReportData } from './collectReportData.js';
import { fetchImageDataUri } from './fetchImageDataUri.js';
import type { DhlOccurrenceReportInput } from './types.js';
import { formatDateTimeBR, formatTimeBR } from '../dateUtils.js';
import { createSupabaseAdminClient, getSupabaseAnonKey, getSupabaseUrl } from '../supabaseAdmin.js';
import {
  dhlOccurrenceReportFilename,
  generateDhlOccurrenceReportHtml,
  resolveTmSegLogoDataUri,
} from './generateReportHtml.js';

export { generateDhlOccurrenceReportHtml, dhlOccurrenceReportFilename };

const BRAND_WINE = '#450a0a';
const BRAND_NAVY = '#0d3b66';
const BRAND_LIGHT = '#e8eef4';
const PDF_GENERATION_TIMEOUT_MS = 55000;

function getSupabase() {
  return createSupabaseAdminClient() ?? createClient(getSupabaseUrl(), getSupabaseAnonKey());
}

async function loadImageBase64(url: string): Promise<string | null> {
  return fetchImageDataUri(url);
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

async function preloadPhaseImages(
  photos: Array<{ url: string | null }>,
): Promise<Map<string, { data: string; format: 'PNG' | 'JPEG' }>> {
  const map = new Map<string, { data: string; format: 'PNG' | 'JPEG' }>();
  const urls = photos.map((p) => p.url).filter((u): u is string => !!u);
  await Promise.all(
    urls.map(async (url) => {
      const img = await loadImageBase64(url);
      if (!img) return;
      const format: 'PNG' | 'JPEG' = img.includes('image/png') ? 'PNG' : 'JPEG';
      map.set(url, { data: img, format });
    }),
  );
  return map;
}

async function buildPdfBuffer(
  data: Awaited<ReturnType<typeof collectDhlOccurrenceReportData>>,
  options?: { embedPhotos?: boolean },
): Promise<Buffer> {
  if (!data) throw new Error('Dados da missão indisponíveis');
  const embedPhotos = options?.embedPhotos === true;

  const narrative = buildOccurrenceNarrative(data);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 12;
  const pageW = 210;
  const contentW = pageW - margin * 2;
  let y = margin;

  const logoDataUri = await resolveTmSegLogoDataUri();
  if (logoDataUri && !logoDataUri.includes('svg+xml')) {
    try {
      const format: 'PNG' | 'JPEG' = logoDataUri.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(logoDataUri, format, margin, y, 34, 14);
    } catch {
      /* logo opcional */
    }
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
  if (embedPhotos) {
    const imageCache = await preloadPhaseImages(data.phasePhotos);
    for (const photo of data.phasePhotos) {
      y = ensureSpace(doc, y, 58, margin);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      const timeLabel = photo.at ? formatTimeBR(photo.at) : '—';
      doc.text(`${photo.label} — ${timeLabel}`, margin, y);
      y += 5;
      const cached = photo.url ? imageCache.get(photo.url) : null;
      if (cached) {
        try {
          doc.addImage(cached.data, cached.format, margin, y, contentW / 2, 36);
          y += 40;
          continue;
        } catch {
          /* fallback texto */
        }
      }
      doc.setFont('helvetica', 'italic');
      doc.setTextColor('#666');
      y = wrapText(doc, 'Evidência não registrada no sistema para esta etapa.', margin, y, contentW);
      doc.setTextColor('#111');
      y += 4;
    }
  } else {
    y = wrapText(
      doc,
      'Fotos disponíveis na pré-visualização HTML. Use Imprimir → Salvar como PDF para incluir imagens.',
      margin,
      y,
      contentW,
    );
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
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} excedeu ${Math.round(ms / 1000)}s`)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export async function generateDhlOccurrenceReportPdf(
  input: DhlOccurrenceReportInput,
  options?: { embedPhotos?: boolean },
): Promise<Buffer | null> {
  try {
    const sb = getSupabase();
    const data = await collectDhlOccurrenceReportData(sb, input);
    if (!data) return null;
    return await withTimeout(
      buildPdfBuffer(data, { embedPhotos: options?.embedPhotos ?? false }),
      PDF_GENERATION_TIMEOUT_MS,
      'Geração do PDF',
    );
  } catch (err) {
    console.error('[dhlOccurrenceReportPdf]', err);
    throw err instanceof Error ? err : new Error(String(err));
  }
}
