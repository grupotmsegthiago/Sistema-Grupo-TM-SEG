import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { buildOccurrenceReportHtml } from './buildReportHtml';
import { collectDhlOccurrenceReportData } from './collectReportData';
import type { DhlOccurrenceReportInput } from './types';
import { createSupabaseAdminClient, getSupabaseAnonKey, getSupabaseUrl } from '../supabaseAdmin';

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
export async function resolveTmSegLogoDataUri(): Promise<string | null> {
  const localCandidates = [
    path.join(process.cwd(), 'dist', 'public', 'logo.png'),
    path.join(process.cwd(), 'client', 'public', 'logo.png'),
    path.join(process.cwd(), 'public', 'logo.png'),
  ];

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

  try {
    const base = getPublicBaseUrl();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${base}/logo.png`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
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
      logoDataUri: logoDataUri || undefined,
    });
  } catch (err) {
    console.error('[dhlOccurrenceReportHtml]', err);
    return null;
  }
}

export function dhlOccurrenceReportFilename(seNumber: string): string {
  return `PA-DHL-${seNumber}.pdf`;
}
