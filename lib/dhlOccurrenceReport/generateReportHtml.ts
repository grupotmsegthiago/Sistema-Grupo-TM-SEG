import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { buildOccurrenceReportHtml } from './buildReportHtml';
import { collectDhlOccurrenceReportData } from './collectReportData';
import type { DhlOccurrenceReportInput } from './types';
import { createSupabaseAdminClient, getSupabaseAnonKey, getSupabaseUrl } from '../supabaseAdmin';

/** SVG inline — fallback se PNG não estiver disponível no runtime serverless. */
const TMSEG_LOGO_SVG_DATA_URI =
  'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="52" viewBox="0 0 220 52"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#dc2626"/><stop offset="55%" stop-color="#991b1b"/><stop offset="100%" stop-color="#111827"/></linearGradient></defs><rect width="220" height="52" rx="6" fill="url(#g)"/><text x="110" y="33" text-anchor="middle" fill="#fff" font-family="Arial,sans-serif" font-size="18" font-weight="700">GRUPO TM SEG</text></svg>`).toString('base64');

function getSupabase() {
  return createSupabaseAdminClient() ?? createClient(getSupabaseUrl(), getSupabaseAnonKey());
}

function getPublicBaseUrl(): string {
  return (
    process.env.APP_PUBLIC_URL
    || process.env.SYSTEM_URL
    || 'https://sistema.grupotmseg.com.br'
  ).replace(/\/$/, '');
}

/** Incorpora logo TM SEG em base64 para funcionar em iframe/print/PDF sem URL externa. */
export async function resolveTmSegLogoDataUri(): Promise<string> {
  const localCandidates = [
    path.join(process.cwd(), 'public', 'logo.png'),
    path.join(process.cwd(), 'dist', 'public', 'logo.png'),
    path.join(process.cwd(), 'client', 'public', 'logo.png'),
  ];

  if (typeof __dirname !== 'undefined') {
    localCandidates.push(
      path.join(__dirname, '..', '..', 'public', 'logo.png'),
      path.join(__dirname, '..', '..', 'dist', 'public', 'logo.png'),
    );
  }

  for (const candidate of localCandidates) {
    try {
      if (fs.existsSync(candidate)) {
        const buf = fs.readFileSync(candidate);
        return `data:image/png;base64,${buf.toString('base64')}`;
      }
    } catch {
      /* tenta próximo caminho */
    }
  }

  const fetchCandidates = [
    getPublicBaseUrl(),
    'https://sistema.grupotmseg.com.br',
  ].map((base) => `${base.replace(/\/$/, '')}/logo.png`);

  for (const logoUrl of fetchCandidates) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(logoUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const contentType = String(res.headers.get('content-type') || '');
      if (!contentType.includes('image')) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 500) {
        return `data:image/png;base64,${buf.toString('base64')}`;
      }
    } catch {
      /* tenta próxima URL */
    }
  }

  return TMSEG_LOGO_SVG_DATA_URI;
}

/** Gera HTML do Plano de Ação — sem jspdf (seguro para preview na Vercel). */
export async function generateDhlOccurrenceReportHtml(input: DhlOccurrenceReportInput): Promise<string | null> {
  try {
    const sb = getSupabase();
    const data = await collectDhlOccurrenceReportData(sb, input);
    if (!data) return null;
    const logoDataUri = await resolveTmSegLogoDataUri();
    return buildOccurrenceReportHtml(data, {
      publicBaseUrl: getPublicBaseUrl(),
      logoDataUri,
    });
  } catch (err) {
    console.error('[dhlOccurrenceReportHtml]', err);
    return null;
  }
}

export function dhlOccurrenceReportFilename(seNumber: string): string {
  return `PA-DHL-${seNumber}.pdf`;
}
