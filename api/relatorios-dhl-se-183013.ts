/**
 * Relatório público — Plano de Ação DHL SE 183013.
 * GET /api/relatorios/dhl-se-183013        → página HTML com botão de download
 * GET /api/relatorios/dhl-se-183013?pdf=1  → PDF direto
 */
import fs from 'node:fs';
import path from 'node:path';

type Req = { query?: Record<string, string | string[] | undefined> };
type Res = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => {
    send: (body: Buffer | string) => void;
    json: (body: unknown) => void;
  };
};

const SLUG = 'plano-acao-dhl-se-183013';
const PDF_NAME = 'PA-DHL-2026-001-SE-183013.pdf';

function resolveDocPath(fileName: string): string | null {
  const candidates = [
    path.join(process.cwd(), 'public', 'docs', fileName),
    path.join(process.cwd(), 'dist', 'public', 'docs', fileName),
    path.join(process.cwd(), 'docs', fileName),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function wantsPdf(req: Req): boolean {
  const pdf = req.query?.pdf;
  if (pdf === '1' || pdf === 'true') return true;
  const format = req.query?.format;
  return format === 'pdf';
}

export default function handler(req: Req, res: Res) {
  if (wantsPdf(req)) {
    const pdfPath = resolveDocPath(`${SLUG}.pdf`);
    if (!pdfPath) {
      res.status(404).json({ error: 'PDF não encontrado.' });
      return;
    }
    const pdf = fs.readFileSync(pdfPath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${PDF_NAME}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(pdf);
    return;
  }

  const htmlPath = resolveDocPath(`${SLUG}.html`);
  if (!htmlPath) {
    res.status(404).json({ error: 'Página do relatório não encontrada.' });
    return;
  }

  let html = fs.readFileSync(htmlPath, 'utf8');
  // Links absolutos para funcionar via API/rewrite (não dependem de /docs estático).
  const base = '/relatorios/dhl-se-183013';
  html = html
    .replace(/href="\/docs\/plano-acao-dhl-se-183013\.pdf"/g, `href="${base}?pdf=1"`)
    .replace(/download="[^"]*"/g, `download="${PDF_NAME}"`);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).send(html);
}
