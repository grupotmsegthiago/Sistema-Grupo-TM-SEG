function parseBody(body: unknown): Record<string, unknown> {
  if (typeof body !== 'string') return (body as Record<string, unknown>) || {};
  if (!body.trim()) return {};
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return {};
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

    const {
      extractAuthToken,
      assertDhlOccurrenceReportAccess,
      resolveDirectorNameFromToken,
    } = await import('../lib/services/dhlOccurrenceReportAccess.js');

    const token = extractAuthToken(req);
    const denied = await assertDhlOccurrenceReportAccess(token);
    if (denied) {
      res.status(denied === 'Não autorizado' ? 401 : 403).json({ ok: false, error: denied });
      return;
    }

    const body = parseBody(req.body);
    const missionId = String(body.missionId || '').trim();
    if (!missionId) {
      res.status(400).json({ ok: false, error: 'missionId obrigatório' });
      return;
    }

    const directorName = await resolveDirectorNameFromToken(token);
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

    const {
      generateDhlOccurrenceReportHtml,
      generateDhlOccurrenceReportPdf,
      dhlOccurrenceReportFilename,
    } = await import('../lib/dhlOccurrenceReport/generateReportOutput.js');

    if (format === 'html' || format === 'preview') {
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

    const pdf = await generateDhlOccurrenceReportPdf(input, { embedPhotos: false });
    if (!pdf) {
      res.status(404).json({ ok: false, error: 'Missão não encontrada ou sem S.E. DHL' });
      return;
    }

    const filename = dhlOccurrenceReportFilename(filenameBase);

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      ok: true,
      format: 'pdf',
      filename,
      pdfBase64: pdf.toString('base64'),
      contentType: 'application/pdf',
      hint: 'Para PDF com fotos, use a pré-visualização e Imprimir → Salvar como PDF.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[dhl-occurrence-report]', message);
    res.status(500).json({ ok: false, error: message || 'Falha ao gerar relatório' });
  }
}
