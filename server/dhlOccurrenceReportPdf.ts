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
const IMAGE_FETCH_TIMEOUT_MS = 8000;
const PDF_GENERATION_TIMEOUT_MS = 55000;

function getSupabase() {
  return createSupabaseAdminClient() ?? createClient(getSupabaseUrl(), getSupabaseAnonKey());
}

function resolveLocalAsset(...parts: string[]): string | null {
  const candidates = [
    path.resolve(process.cwd(), ...parts),
    path.resolve(process.cwd(), 'dist', 'public', ...parts.slice(1)),
    path.resolve(process.cwd(), 'client', 'public', ...parts.slice(1)),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function fetchWithTimeout(url: string, timeoutMs = IMAGE_FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function loadImageBase64(url: string): Promise<string | null> {
  try {
    if (url.startsWith('/')) {
      const local = resolveLocalAsset('public', url.replace(/^\//, ''));
      if (local) {
        const buf = fs.readFileSync(local);
        const ext = path.extname(local).toLowerCase() === '.png' ? 'PNG' : 'JPEG';
        return `data:image/${ext.toLowerCase()};base64,${buf.toString('base64')}`;
      }
    }
    const res = await fetchWithTimeout(url);
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

async function buildPdfBuffer(data: Awaited<ReturnType<typeof collectDhlOccurrenceReportData>>): Promise<Buffer> {
  if (!data) throw new Error('Dados da missão indisponíveis');

  const narrative = buildOccurrenceNarrative(data);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 12;
  const pageW = 210;
  const contentW = pageW - margin * 2;
  let y = margin;

  const logoPath = resolveLocalAsset('public', 'logo.png');
  if (logoPath) {
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

  if (narrative.emailReference) {
    section('Referência / anexo de e-mails');
    y = wrapText(doc, narrative.emailReference, margin, y, contentW);
    y += 4;
  }

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

export async function generateDhlOccurrenceReportPdf(input: DhlOccurrenceReportInput): Promise<Buffer | null> {
  try {
    const sb = getSupabase();
    const data = await collectDhlOccurrenceReportData(sb, input);
    if (!data) return null;
    return await withTimeout(buildPdfBuffer(data), PDF_GENERATION_TIMEOUT_MS, 'Geração do PDF');
  } catch (err) {
    console.error('[dhlOccurrenceReportPdf]', err);
    throw err instanceof Error ? err : new Error(String(err));
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
