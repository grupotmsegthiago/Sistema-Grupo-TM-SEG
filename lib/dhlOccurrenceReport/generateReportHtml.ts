import { createClient } from '@supabase/supabase-js';
import { buildOccurrenceReportHtml } from './buildReportHtml.js';
import { collectDhlOccurrenceReportData } from './collectReportData.js';
import type { DhlOccurrenceReportInput } from './types.js';
import { createSupabaseAdminClient, getSupabaseAnonKey, getSupabaseUrl } from '../supabaseAdmin.js';

function getSupabase() {
  return createSupabaseAdminClient() ?? createClient(getSupabaseUrl(), getSupabaseAnonKey());
}

/** Gera HTML do Plano de Ação — sem jspdf (seguro para preview na Vercel). */
export async function generateDhlOccurrenceReportHtml(input: DhlOccurrenceReportInput): Promise<string | null> {
  try {
    const sb = getSupabase();
    const data = await collectDhlOccurrenceReportData(sb, input);
    if (!data) return null;
    const publicBaseUrl =
      process.env.APP_PUBLIC_URL || process.env.SYSTEM_URL || 'https://sistema.grupotmseg.com.br';
    return buildOccurrenceReportHtml(data, { publicBaseUrl });
  } catch (err) {
    console.error('[dhlOccurrenceReportHtml]', err);
    return null;
  }
}

export function dhlOccurrenceReportFilename(seNumber: string): string {
  return `PA-DHL-${seNumber}.pdf`;
}
