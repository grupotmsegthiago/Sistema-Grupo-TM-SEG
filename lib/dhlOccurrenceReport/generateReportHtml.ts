import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { buildOccurrenceReportHtml } from './buildReportHtml.js';
import { collectDhlOccurrenceReportData } from './collectReportData.js';
import { generateDhlReportHtmlWithAi, type DhlReportAiContext } from './adjustReportHtml.js';
import type { DhlOccurrenceReportData, DhlOccurrenceReportInput } from './types.js';
import { formatDateBR, formatTimeBR } from '../dateUtils.js';
import { createSupabaseAdminClient, getSupabaseAnonKey, getSupabaseUrl } from '../supabaseAdmin.js';

/** SVG inline — fallback se PNG não estiver disponível no runtime serverless. */
const TMSEG_LOGO_SVG_DATA_URI =
  'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="52" viewBox="0 0 220 52"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#111827"/><stop offset="55%" stop-color="#991b1b"/><stop offset="100%" stop-color="#dc2626"/></linearGradient></defs><rect width="220" height="52" rx="6" fill="url(#g)"/><text x="110" y="33" text-anchor="middle" fill="#fff" font-family="Arial,sans-serif" font-size="18" font-weight="700">GRUPO TM SEG</text></svg>`).toString('base64');

function getSupabase() {
  return createSupabaseAdminClient() ?? createClient(getSupabaseUrl(), getSupabaseAnonKey());
}

export function getPublicBaseUrl(): string {
  return (
    process.env.APP_PUBLIC_URL
    || process.env.SYSTEM_URL
    || 'https://sistema.grupotmseg.com.br'
  ).replace(/\/$/, '');
}

/** Incorpora logo TM SEG em base64 via URL pública (sem fs — compatível com Vercel serverless). */
export async function resolveTmSegLogoDataUri(): Promise<string> {
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

export type DhlReportHtmlResult = {
  html: string;
  evidenceCount: number;
  phasePhotoCount: number;
  /** true quando a narrativa foi gerada pela IA a partir do e-mail/contexto. */
  aiGenerated: boolean;
};

function plateLabel(plate: string | null, model: string | null): string {
  const p = String(plate || '').trim();
  const m = String(model || '').trim();
  if (p && m) return `${p} — ${m}`;
  return p || m || '—';
}

function markWhen(at: string | null): string {
  return at ? `${formatDateBR(at)} ${formatTimeBR(at)} (Brasília)` : '—';
}

/** Monta o contexto factual (dados reais do sistema) + e-mail para a IA. */
function buildAiContext(data: DhlOccurrenceReportData): DhlReportAiContext {
  const facts = [
    `Nº S.E.: ${data.seNumber}`,
    `Nº OS TM SEG: ${data.missionId}`,
    `Cliente: ${data.client}`,
    `Operação: FOXCONN / Apple`,
    `Parceiro/fornecedor operacional: ${data.provider}`,
    `Local de origem: ${data.origin}`,
    `Destino operacional: ${data.destinationOperational || data.destination}`,
    `Placa transportada (cliente): ${plateLabel(data.clientVehiclePlate, data.clientVehicleModel)}`,
    `Viatura de escolta (parceiro): ${plateLabel(data.escortVehiclePlate, data.escortVehicleModel)}`,
    `Agentes: ${data.agents.join(' / ') || '—'}`,
    `Abertura da OS: ${markWhen(data.missionCreatedAt)}`,
    `Horário programado na origem: ${markWhen(data.scheduledOriginAt)}`,
    `Atraso registrado na origem (minutos): ${data.delayMinutesAtOrigin ?? 0}`,
    `Hodômetro inicial: ${data.odometerStartKm || '—'}`,
    `Hodômetro final: ${data.odometerEndKm || '—'}`,
    'Marcos operacionais (registro sistêmico):',
    ...data.marks.map((m) => `  - ${m.label}: ${markWhen(m.at)}`),
  ].join('\n');

  return {
    factsBlock: facts,
    emailText: data.emailAttachmentText || '',
    emailLink: data.emailLink || '',
    userSummary: data.factsSummary || '',
  };
}

/** Gera HTML do Plano de Ação — sem jspdf (seguro para preview na Vercel). */
export async function generateDhlOccurrenceReportHtml(
  input: DhlOccurrenceReportInput,
  options?: {
    supabaseClient?: SupabaseClient;
    generateText?: (prompt: string) => Promise<string>;
  },
): Promise<DhlReportHtmlResult | null> {
  try {
    const sb = options?.supabaseClient ?? getSupabase();
    const data = await collectDhlOccurrenceReportData(sb, input);
    if (!data) return null;
    const logoDataUri = await resolveTmSegLogoDataUri();
    let html = buildOccurrenceReportHtml(data, {
      publicBaseUrl: getPublicBaseUrl(),
      logoDataUri,
    });

    // Quando há e-mail do cliente anexado e a IA está disponível, o relatório é
    // redigido pela IA a partir dos dados do sistema + contexto do e-mail
    // (o e-mail NÃO é copiado). Se a IA falhar, mantém o texto-padrão (template).
    let aiGenerated = false;
    const hasEmailContext = !!(data.emailAttachmentText?.trim() || data.emailLink?.trim());
    if (options?.generateText && hasEmailContext) {
      try {
        html = await generateDhlReportHtmlWithAi(html, buildAiContext(data), options.generateText);
        aiGenerated = true;
      } catch (err) {
        console.error('[dhlOccurrenceReportHtml] IA de geração falhou, usando template:', err);
      }
    }

    const evidenceCount = data.allEvidencePhotos?.length || 0;
    const phasePhotoCount = data.phasePhotos.filter((p) => p.url).length;
    return { html, evidenceCount, phasePhotoCount, aiGenerated };
  } catch (err) {
    console.error('[dhlOccurrenceReportHtml]', err);
    return null;
  }
}

export function dhlOccurrenceReportFilename(seNumber: string): string {
  return `PA-DHL-${seNumber}.pdf`;
}
