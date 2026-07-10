const DEFAULT_SUPABASE_URL = 'https://ajhmmjuewdsukecaimik.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk';
const TMSEG_SUPABASE_REF = 'ajhmmjuewdsukecaimik';

function parseBody(body: unknown): Record<string, unknown> {
  if (typeof body !== 'string') return (body as Record<string, unknown>) || {};
  if (!body.trim()) return {};
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function authToken(req: { headers?: Record<string, unknown> }): string {
  return (
    String(req.headers?.authorization || '')
      .replace(/^Bearer\s+/i, '')
      || String(req.headers?.['x-auth-token'] || '')
  );
}

function extractUserIdFromToken(token: string): string | null {
  const match = token.match(/(?:tmseg-token|impersonation-token)-(.+)-(\d+)$/);
  return match ? match[1] : null;
}

function decodeSupabaseRef(key: string): string | null {
  try {
    const payload = key.split('.')[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))?.ref || null;
  } catch {
    return null;
  }
}

async function supabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  const envUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '');
  const url = envUrl.includes(TMSEG_SUPABASE_REF) ? envUrl : DEFAULT_SUPABASE_URL;
  const keys = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.VITE_SUPABASE_ANON_KEY,
    DEFAULT_SUPABASE_ANON_KEY,
  ];
  const key =
    keys.map((k) => String(k || '').trim()).find(
      (k) => k === DEFAULT_SUPABASE_ANON_KEY || decodeSupabaseRef(k) === TMSEG_SUPABASE_REF,
    ) || DEFAULT_SUPABASE_ANON_KEY;
  return createClient(url, key);
}

async function resolveRole(token: string): Promise<string | null> {
  const userId = extractUserIdFromToken(token);
  if (!userId) return null;
  try {
    const sb = await supabaseAdmin();
    const { data } = await sb
      .from('system_users')
      .select('status, profiles:profile_id(name)')
      .eq('id', userId)
      .maybeSingle();
    if (!data || data.status === 'inactive') return null;
    const profile = data.profiles as { name?: string } | { name?: string }[] | null;
    const name = Array.isArray(profile) ? profile[0]?.name : profile?.name;
    return String(name || '').trim().toLowerCase() || null;
  } catch (err) {
    console.warn('[dhl-occurrence-report] resolveRole:', err);
    return null;
  }
}

async function resolveDirectorName(token: string): Promise<string> {
  const userId = extractUserIdFromToken(token);
  if (!userId) return 'Diretoria — Grupo TM SEG';
  try {
    const sb = await supabaseAdmin();
    const { data } = await sb.from('system_users').select('name').eq('id', userId).maybeSingle();
    return data?.name ? String(data.name) : 'Diretoria — Grupo TM SEG';
  } catch {
    return 'Diretoria — Grupo TM SEG';
  }
}

/**
 * Plano de Ação DHL — handler standalone na Vercel (sem Express/vercelApp.cjs).
 * POST /api/dhl/occurrence-report
 */
export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'method_not_allowed' });
      return;
    }

    const token = authToken(req);
    if (!token) {
      res.status(401).json({ ok: false, error: 'Não autorizado' });
      return;
    }

    const role = await resolveRole(token);
    if (role !== 'diretoria') {
      res.status(403).json({
        ok: false,
        error: 'Permissão negada — apenas Diretoria pode gerar este relatório',
      });
      return;
    }

    const body = parseBody(req.body);
    const missionId = String(body.missionId || '').trim();
    if (!missionId) {
      res.status(400).json({ ok: false, error: 'missionId obrigatório' });
      return;
    }

    const directorName = await resolveDirectorName(token);
    const factsSummary = typeof body.factsSummary === 'string' ? body.factsSummary : undefined;
    const emailLink = typeof body.emailLink === 'string' ? body.emailLink : undefined;
    const emailAttachmentText =
      typeof body.emailAttachmentText === 'string' ? body.emailAttachmentText : undefined;

    const input = {
      missionId,
      factsSummary,
      emailLink,
      emailAttachmentText,
      directorName,
      generatedAt: new Date().toISOString(),
    };

    const format = String(body.format || 'pdf').trim().toLowerCase();
    const seFromBody = String(body.seNumber || '').trim();
    const filenameBase = seFromBody || missionId;

    if (format === 'html' || format === 'preview') {
      const { generateDhlOccurrenceReportHtml, dhlOccurrenceReportFilename } = await import(
        '../lib/dhlOccurrenceReport/generateReportHtml.js'
      );
      const html = await generateDhlOccurrenceReportHtml(input);
      if (!html) {
        res.status(404).json({ ok: false, error: 'Missão não encontrada ou sem S.E. DHL' });
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({
        ok: true,
        format: 'html',
        filename: dhlOccurrenceReportFilename(filenameBase).replace(/\.pdf$/i, '.html'),
        html,
      });
      return;
    }

    const { generateDhlOccurrenceReportPdf, dhlOccurrenceReportFilename } = await import(
      '../lib/dhlOccurrenceReport/generateReportOutput.js'
    );
    const pdf = await generateDhlOccurrenceReportPdf(input, { embedPhotos: false });
    if (!pdf) {
      res.status(404).json({ ok: false, error: 'Missão não encontrada ou sem S.E. DHL' });
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      ok: true,
      format: 'pdf',
      filename: dhlOccurrenceReportFilename(filenameBase),
      pdfBase64: pdf.toString('base64'),
      contentType: 'application/pdf',
      hint: 'Para PDF com fotos, use a pré-visualização e Imprimir → Salvar como PDF.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[dhl-occurrence-report]', message);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: message || 'Falha ao gerar relatório' });
    }
  }
}
