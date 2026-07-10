import {
  assertDhlOccurrenceReportAccess,
  extractAuthToken,
  resolveDirectorNameFromToken,
} from '../lib/services/dhlOccurrenceReportAccess.js';
import {
  dhlOccurrenceReportFilename,
  generateDhlOccurrenceReportHtml,
  generateDhlOccurrenceReportPdf,
} from '../server/dhlOccurrenceReportPdf.js';

type Req = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
};

type Res = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => {
    json: (body: unknown) => void;
    send: (body: Buffer | string) => void;
  };
};

function pickMissionId(req: Req): string {
  const fromBody = req.body?.missionId;
  const fromQuery = req.query?.missionId;
  const raw = fromBody ?? fromQuery;
  return String(Array.isArray(raw) ? raw[0] : raw || '').trim();
}

function wantsHtml(req: Req): boolean {
  const fmt = req.query?.format;
  const value = Array.isArray(fmt) ? fmt[0] : fmt;
  return value === 'html';
}

export default async function handler(req: Req, res: Res) {
  const token = extractAuthToken(req);
  const denied = await assertDhlOccurrenceReportAccess(token);
  if (denied) {
    res.status(denied === 'Não autorizado' ? 401 : 403).json({ ok: false, error: denied });
    return;
  }

  const missionId = pickMissionId(req);
  if (!missionId) {
    res.status(400).json({ ok: false, error: 'missionId obrigatório' });
    return;
  }

  try {
    const directorName = await resolveDirectorNameFromToken(token);
    const factsSummary =
      typeof req.body?.factsSummary === 'string' ? req.body.factsSummary : undefined;

    const input = {
      missionId,
      factsSummary,
      directorName,
      generatedAt: new Date().toISOString(),
    };

    if (req.method === 'GET' && wantsHtml(req)) {
      const html = await generateDhlOccurrenceReportHtml(input);
      if (!html) {
        res.status(404).json({ ok: false, error: 'Missão não encontrada ou sem S.E. DHL' });
        return;
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).send(html);
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'method_not_allowed' });
      return;
    }

    const pdf = await generateDhlOccurrenceReportPdf(input);
    if (!pdf) {
      res.status(404).json({ ok: false, error: 'Missão não encontrada ou sem S.E. DHL' });
      return;
    }

    const seFromBody = String(req.body?.seNumber || '').trim();
    const filename = dhlOccurrenceReportFilename(seFromBody || missionId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(pdf);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[dhl-occurrence-report]', message);
    res.status(500).json({ ok: false, error: message || 'Falha ao gerar relatório' });
  }
}

export const config = { maxDuration: 60 };
