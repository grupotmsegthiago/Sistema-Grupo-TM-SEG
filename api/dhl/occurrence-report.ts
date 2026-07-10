/** Payload mínimo do relatório DHL — evita import estático de lib/ no handler Vercel. */
type DhlOccurrenceReportInput = {
  missionId: string;
  factsSummary?: string | null;
  emailLink?: string | null;
  emailAttachmentText?: string | null;
  directorName?: string | null;
  generatedAt?: string;
};

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

function decodeJwtRole(key: string): string | null {
  try {
    const part = key.split('.')[1];
    if (!part) return null;
    const json = Buffer.from(part, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as { role?: string };
    return payload.role ?? null;
  } catch {
    return null;
  }
}

function pickServerKey(): string {
  const serviceCandidates = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_KEY,
    process.env.TMSEG_SUPABASE_SERVICE_ROLE_KEY,
  ];
  for (const candidate of serviceCandidates) {
    const key = String(candidate || '').trim();
    if (!key) continue;
    if (decodeSupabaseRef(key) !== TMSEG_SUPABASE_REF) continue;
    if (decodeJwtRole(key) === 'anon') continue;
    return key;
  }

  const anonCandidates = [
    process.env.SUPABASE_ANON_KEY,
    process.env.VITE_SUPABASE_ANON_KEY,
    process.env.TMSEG_SUPABASE_ANON_KEY,
    DEFAULT_SUPABASE_ANON_KEY,
  ];
  for (const candidate of anonCandidates) {
    const key = String(candidate || '').trim();
    if (!key) continue;
    if (key === DEFAULT_SUPABASE_ANON_KEY || decodeSupabaseRef(key) === TMSEG_SUPABASE_REF) {
      return key;
    }
  }
  return DEFAULT_SUPABASE_ANON_KEY;
}

async function supabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  const envUrl = String(
    process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      process.env.TMSEG_SUPABASE_URL ||
      '',
  );
  const url = envUrl.includes(TMSEG_SUPABASE_REF) ? envUrl : DEFAULT_SUPABASE_URL;
  return createClient(url, pickServerKey());
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

    const format = String(body.format || 'pdf').trim().toLowerCase();
    const seFromBody = String(body.seNumber || '').trim();
    const filenameBase = seFromBody || missionId;

    if (format === 'adjust') {
      const html = typeof body.html === 'string' ? body.html : '';
      const adjustmentNotes =
        typeof body.adjustmentNotes === 'string' ? body.adjustmentNotes : '';
      if (!html.trim()) {
        res.status(400).json({ ok: false, error: 'html obrigatório para ajuste com IA' });
        return;
      }
      if (!adjustmentNotes.trim()) {
        res.status(400).json({ ok: false, error: 'Descreva o que deseja ajustar no relatório' });
        return;
      }

      const geminiKey = String(
        process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
          process.env.GEMINI_API_KEY ||
          process.env.GOOGLE_GEMINI_API_KEY ||
          '',
      ).trim();
      if (!geminiKey) {
        res.status(503).json({
          ok: false,
          error: 'IA indisponível — configure GEMINI_API_KEY na Vercel.',
        });
        return;
      }

      const { adjustDhlReportHtmlWithAi } = await import('./occurrence-report-adjust.cjs');

      const generateText = async (prompt: string): Promise<string> => {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Referer: 'https://sistema.grupotmseg.com.br/',
            },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 8192, temperature: 0.35 },
            }),
          },
        );
        const data = (await response.json()) as {
          error?: { message?: string };
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        if (!response.ok) {
          throw new Error(data?.error?.message || `Gemini HTTP ${response.status}`);
        }
        const text =
          data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
        if (!text.trim()) throw new Error('A IA retornou resposta vazia.');
        return text;
      };

      const adjustedHtml = await adjustDhlReportHtmlWithAi(html, adjustmentNotes, generateText);
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ ok: true, format: 'adjust', html: adjustedHtml });
      return;
    }

    const input = {
      missionId,
      factsSummary,
      emailLink,
      emailAttachmentText,
      directorName,
      generatedAt: new Date().toISOString(),
    };

    if (format === 'html' || format === 'preview') {
      const sb = await supabaseAdmin();
      const { generateDhlOccurrenceReportHtml, dhlOccurrenceReportFilename } = await import(
        './occurrence-report-html.cjs'
      );
      const result = await generateDhlOccurrenceReportHtml(input as DhlOccurrenceReportInput, {
        supabaseClient: sb,
      });
      if (!result?.html) {
        res.status(404).json({ ok: false, error: 'Missão não encontrada ou sem S.E. DHL' });
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({
        ok: true,
        format: 'html',
        filename: dhlOccurrenceReportFilename(filenameBase).replace(/\.pdf$/i, '.html'),
        html: result.html,
        evidenceCount: result.evidenceCount,
        phasePhotoCount: result.phasePhotoCount,
      });
      return;
    }

    const { generateDhlOccurrenceReportPdf, dhlOccurrenceReportFilename } = await import(
      './occurrence-report-pdf.cjs'
    );
    const pdf = await generateDhlOccurrenceReportPdf(input as DhlOccurrenceReportInput, { embedPhotos: false });
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
