const MAX_PDF_PAGES = 40;

async function configurePdfWorker(pdfjs: typeof import('pdfjs-dist')) {
  if (pdfjs.GlobalWorkerOptions.workerSrc) return;

  try {
    const workerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
    return;
  } catch {
    /* Node / testes — worker local sem sufixo ?url do Vite */
  }

  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  pdfjs.GlobalWorkerOptions.workerSrc = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
  );
}

function normalizeExtractedPdfText(raw: string): string {
  return String(raw || '')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extrai texto selecionável de PDF (e-mail exportado/impresso como PDF).
 * PDFs só-imagem (scan) falham com mensagem orientativa.
 */
export async function extractTextFromPdfBytes(data: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  await configurePdfWorker(pdfjs);

  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: true,
    standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
  });
  const doc = await loadingTask.promise;

  const totalPages = doc.numPages;
  const pageCount = Math.min(totalPages, MAX_PDF_PAGES);
  const chunks: string[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ('str' in item ? String(item.str || '') : ''))
      .join(' ')
      .trim();
    if (pageText) chunks.push(pageText);
  }

  await doc.destroy();

  const text = normalizeExtractedPdfText(chunks.join('\n\n'));
  if (!text) {
    throw new Error(
      'Este PDF parece ser só imagem (scan) ou não contém texto selecionável. Exporte o e-mail como .eml ou .txt no Outlook, ou cole o texto manualmente.',
    );
  }

  if (totalPages > MAX_PDF_PAGES) {
    return `${text}\n\n[… PDF truncado: lidas ${MAX_PDF_PAGES} de ${totalPages} páginas.]`;
  }

  return text;
}

export async function extractTextFromPdfFile(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  return extractTextFromPdfBytes(data);
}
