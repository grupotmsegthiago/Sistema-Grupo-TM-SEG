/** Payload mínimo do relatório DHL — evita import estático de lib/ no handler Vercel. */
import { createRequire } from 'node:module';

// Bundles CJS gerados no build (build-server.mjs) — requires ESTÁTICOS para o file
// tracer da Vercel incluir os .cjs no bundle da função. require(path.join(...))
// dinâmico + includeFiles em vercel.json quebravam deploy (ERROR 0ms) ou runtime.
const require = createRequire(import.meta.url);

const dhlReportAdjustBundle = require('./_occurrence-report-adjust.cjs') as {
  adjustDhlReportHtmlWithAi: (
    html: string,
    notes: string,
    generateText: (prompt: string) => Promise<string>,
    options?: {
      conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    },
  ) => Promise<{ html: string; reply: string }>;
};

const dhlReportHtmlBundle = require('./_occurrence-report-html.cjs') as {
  generateDhlOccurrenceReportHtml: (
    ...args: unknown[]
  ) => Promise<{ html?: string; evidenceCount?: number; phasePhotoCount?: number }>;
  dhlOccurrenceReportFilename: (base: string) => string;
};

const dhlReportPdfBundle = require('./_occurrence-report-pdf.cjs') as {
  generateDhlOccurrenceReportPdf: (...args: unknown[]) => Promise<Buffer | null>;
  dhlOccurrenceReportFilename: (base: string) => string;
};

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
 * Cria a função generateText do Gemini (REST) usada tanto na geração do
 * relatório (a partir do e-mail/contexto) quanto no "Ajustar com IA".
 * Retorna null quando não há chave configurada.
 */
function makeGeminiGenerateText(): ((prompt: string) => Promise<string>) | null {
  const geminiKey = String(
    process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GEMINI_API_KEY ||
      '',
  ).trim();
  if (!geminiKey) return null;

  return async (prompt: string): Promise<string> => {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Referer autorizado na chave Gemini (mesmo de api/gemini/generate.ts).
          Referer: 'https://sistema-grupo-tm-seg.vercel.app/',
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
}

/**
 * Garante a tabela de histórico de relatórios. O handler standalone não passa
 * pelas migrações do Express, então cria a tabela sob demanda (idempotente).
 */
async function ensureReportsTable(sb: any): Promise<void> {
  try {
    await sb.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS dhl_occurrence_reports (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          mission_id TEXT NOT NULL,
          se_number TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          label TEXT DEFAULT '',
          report_html TEXT NOT NULL,
          facts_summary TEXT,
          email_link TEXT,
          ai_generated BOOLEAN DEFAULT false,
          created_by TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_dhl_occurrence_reports_mission
          ON dhl_occurrence_reports (mission_id, version DESC);
        ALTER TABLE dhl_occurrence_reports DISABLE ROW LEVEL SECURITY;
      `,
    });
  } catch (e: unknown) {
    // Tabela pode já existir ou exec_sql indisponível — o insert/select seguinte
    // reportará o erro real, se houver.
    console.warn('[dhl-occurrence-report] ensureReportsTable:', (e as Error)?.message);
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

    // ── Histórico/versionamento — persiste no Supabase (handler standalone
    // garante a tabela, pois não passa pelas migrações do Express). ──
    if (format === 'save' || format === 'history' || format === 'history-get') {
      const sb = await supabaseAdmin();
      await ensureReportsTable(sb);

      if (format === 'save') {
        const html = typeof body.html === 'string' ? body.html : '';
        if (!html.trim()) {
          res.status(400).json({ ok: false, error: 'html obrigatório para salvar' });
          return;
        }
        const { data: last } = await sb
          .from('dhl_occurrence_reports')
          .select('version')
          .eq('mission_id', missionId)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextVersion = ((last?.version as number) || 0) + 1;
        const { data: inserted, error } = await sb
          .from('dhl_occurrence_reports')
          .insert({
            mission_id: missionId,
            se_number: seFromBody || null,
            version: nextVersion,
            label: String(body.label || '').trim(),
            report_html: html,
            facts_summary: factsSummary ?? null,
            email_link: emailLink ?? null,
            ai_generated: body.aiGenerated === true,
            created_by: directorName,
          })
          .select('id, version, created_at')
          .single();
        if (error) throw error;
        res.status(200).json({ ok: true, id: inserted.id, version: inserted.version, createdAt: inserted.created_at });
        return;
      }

      if (format === 'history') {
        const { data, error } = await sb
          .from('dhl_occurrence_reports')
          .select('id, version, label, se_number, ai_generated, created_by, created_at')
          .eq('mission_id', missionId)
          .order('version', { ascending: false });
        if (error) throw error;
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json({ ok: true, versions: data || [] });
        return;
      }

      // history-get
      const reportId = String(body.reportId || '').trim();
      if (!reportId) {
        res.status(400).json({ ok: false, error: 'reportId obrigatório' });
        return;
      }
      const { data, error } = await sb
        .from('dhl_occurrence_reports')
        .select('id, mission_id, se_number, version, label, report_html, facts_summary, ai_generated, created_by, created_at')
        .eq('id', reportId)
        .eq('mission_id', missionId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        res.status(404).json({ ok: false, error: 'Versão não encontrada' });
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ ok: true, report: data });
      return;
    }

    if (format === 'adjust') {
      const html = typeof body.html === 'string' ? body.html : '';
      const adjustmentNotes =
        typeof body.adjustmentNotes === 'string' ? body.adjustmentNotes : '';
      const conversationHistory = Array.isArray(body.conversationHistory)
        ? (body.conversationHistory as Array<{ role?: string; content?: string }>)
            .filter(
              (m) =>
                (m?.role === 'user' || m?.role === 'assistant') &&
                typeof m.content === 'string' &&
                m.content.trim(),
            )
            .map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: String(m.content).trim(),
            }))
            .slice(-12)
        : [];
      if (!html.trim()) {
        res.status(400).json({ ok: false, error: 'html obrigatório para ajuste com IA' });
        return;
      }
      if (!adjustmentNotes.trim()) {
        res.status(400).json({ ok: false, error: 'Descreva o que deseja ajustar no relatório' });
        return;
      }

      const generateText = makeGeminiGenerateText();
      if (!generateText) {
        res.status(503).json({
          ok: false,
          error: 'IA indisponível — configure GEMINI_API_KEY na Vercel.',
        });
        return;
      }

      const { adjustDhlReportHtmlWithAi } = dhlReportAdjustBundle;
      const adjusted = await adjustDhlReportHtmlWithAi(html, adjustmentNotes, generateText, {
        conversationHistory,
      });
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({
        ok: true,
        format: 'adjust',
        html: adjusted.html,
        reply: adjusted.reply,
      });
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
      const { generateDhlOccurrenceReportHtml, dhlOccurrenceReportFilename } = dhlReportHtmlBundle;
      const result = await generateDhlOccurrenceReportHtml(input as DhlOccurrenceReportInput, {
        supabaseClient: sb,
        generateText: makeGeminiGenerateText() || undefined,
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

    const { generateDhlOccurrenceReportPdf, dhlOccurrenceReportFilename } = dhlReportPdfBundle;
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
