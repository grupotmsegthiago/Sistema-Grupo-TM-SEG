/**
 * Gera PDF do Boletim de Medição a partir do #print-area (html2canvas + jsPDF).
 *
 * O envio ao cliente NÃO pode capturar a tela interna (scroll + overflow hidden):
 * isso corta colunas e inclui filtros/botões. O clone de exportação expande a
 * tabela inteira e o PDF sempre cabe a LARGURA (A4 paisagem), paginando a altura.
 */

export const MEDICAO_PDF_MARGIN_MM = 6;

/** Controles internos da tela — nunca vão no PDF/impressão enviados ao cliente. */
export const MEDICAO_PDF_INTERNAL_SELECTORS = [
  '.no-print',
  '[data-testid="boletim-pending-header"]',
  '[data-testid="include-os-bar"]',
  '[data-testid="boletim-dhl-band-warning"]',
].join(',');

/** Estilos compactos do documento oficial (equivalente ao layout de impressão). */
export const MEDICAO_PDF_EXPORT_CSS = `
#print-area-export {
  box-sizing: border-box;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  color: #1f2937;
  background: #ffffff;
}
#print-area-export, #print-area-export * { box-sizing: border-box; }
#print-area-export .no-print,
#print-area-export [data-testid="boletim-pending-header"],
#print-area-export [data-testid="include-os-bar"],
#print-area-export [data-testid="boletim-dhl-band-warning"] {
  display: none !important;
}
#print-area-export .report-table-scroll {
  overflow: visible !important;
  max-height: none !important;
  max-width: none !important;
  width: max-content !important;
  border-radius: 0 !important;
}
#print-area-export table {
  table-layout: auto !important;
  width: max-content !important;
  min-width: 0 !important;
  border-collapse: collapse !important;
  border: 1.5px solid #991b1b !important;
}
#print-area-export td,
#print-area-export th {
  padding: 3px 5px !important;
  font-size: 9px !important;
  border: 0.5px solid #e5c4c4 !important;
  line-height: 1.3 !important;
  white-space: nowrap !important;
  overflow: visible !important;
  text-overflow: clip !important;
  max-width: none !important;
  vertical-align: middle !important;
}
#print-area-export td.route-cell {
  white-space: normal !important;
  word-wrap: break-word !important;
  overflow-wrap: break-word !important;
  text-align: left !important;
  min-width: 130px !important;
  max-width: 200px !important;
  font-weight: 600 !important;
}
#print-area-export .group-hdr th {
  font-size: 8px !important;
  font-weight: 900 !important;
  padding: 4px 5px !important;
}
#print-area-export .sub-hdr th {
  font-size: 7.5px !important;
  font-weight: 800 !important;
  text-transform: uppercase !important;
}
#print-area-export .boletim-header { margin-bottom: 8px !important; }
#print-area-export .boletim-header h1 { font-size: 16px !important; margin: 0 !important; }
#print-area-export .subtitle-line { font-size: 11px !important; }
#print-area-export .ref-line { font-size: 9px !important; }
#print-area-export tfoot td { font-size: 11px !important; font-weight: 900 !important; }
#print-area-export .sign-section { margin-top: 18px !important; page-break-inside: avoid; }
`;

export type MedicaoPdfLayout = {
  ratio: number;
  sliceHeightPx: number;
  pageCount: number;
  drawW: number;
};

/**
 * Encaixa a captura na largura útil da página. Nunca reduz pela altura
 * (isso esmagava/cortava colunas). Altura extra vira páginas seguintes.
 */
export function computeMedicaoPdfLayout(
  imgW: number,
  imgH: number,
  pageWmm: number,
  pageHmm: number,
  marginMm = MEDICAO_PDF_MARGIN_MM,
): MedicaoPdfLayout {
  if (imgW <= 0 || imgH <= 0) {
    throw new Error('Imagem do boletim inválida para PDF');
  }
  const usableW = pageWmm - marginMm * 2;
  const usableH = pageHmm - marginMm * 2;
  if (usableW <= 0 || usableH <= 0) {
    throw new Error('Página do boletim sem área útil');
  }
  const ratio = usableW / imgW;
  const sliceHeightPx = Math.max(1, Math.floor(usableH / ratio));
  const pageCount = Math.ceil(imgH / sliceHeightPx);
  return { ratio, sliceHeightPx, pageCount, drawW: imgW * ratio };
}

/** Clona a área do boletim sem scroll/corte e sem UI interna. */
export function prepareMedicaoPrintClone(source: HTMLElement): HTMLElement {
  const cloned = source.cloneNode(true) as HTMLElement;
  cloned.id = 'print-area-export';

  cloned.querySelectorAll(MEDICAO_PDF_INTERNAL_SELECTORS).forEach((node) => {
    (node as HTMLElement).style.display = 'none';
  });

  cloned.style.position = 'relative';
  cloned.style.overflow = 'visible';
  cloned.style.maxHeight = 'none';
  cloned.style.maxWidth = 'none';
  cloned.style.width = 'max-content';
  cloned.style.padding = '12px 16px';
  cloned.style.margin = '0';
  cloned.style.border = 'none';
  cloned.style.borderRadius = '0';
  cloned.style.background = '#ffffff';
  cloned.style.boxShadow = 'none';

  const scrollDiv = cloned.querySelector('.report-table-scroll') as HTMLElement | null;
  if (scrollDiv) {
    scrollDiv.style.overflow = 'visible';
    scrollDiv.style.maxHeight = 'none';
    scrollDiv.style.maxWidth = 'none';
    scrollDiv.style.width = 'max-content';
    scrollDiv.style.borderRadius = '0';
  }

  const table = cloned.querySelector('table') as HTMLElement | null;
  if (table) {
    table.style.tableLayout = 'auto';
    table.style.width = 'max-content';
    table.style.minWidth = '0';
    table.style.borderCollapse = 'collapse';
  }

  cloned.querySelector('colgroup')?.remove();

  cloned.querySelectorAll<HTMLElement>('th, td').forEach((cell) => {
    cell.style.overflow = 'visible';
    cell.style.textOverflow = 'clip';
    if (cell.classList.contains('route-cell')) {
      cell.style.maxWidth = '200px';
      cell.style.whiteSpace = 'normal';
    } else {
      cell.style.maxWidth = 'none';
      cell.style.whiteSpace = 'nowrap';
    }
  });

  return cloned;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function generateMedicaoPdfBlob(elementId = 'print-area'): Promise<Blob> {
  const el = document.getElementById(elementId);
  if (!el) throw new Error('Área de impressão do boletim (#print-area) não encontrada. Gere o boletim antes.');

  const html2canvas = (await import('html2canvas')).default;
  const { jsPDF } = await import('jspdf');

  const clone = prepareMedicaoPrintClone(el);
  const host = document.createElement('div');
  host.setAttribute('data-medicao-pdf-host', '1');
  host.style.cssText = 'position:fixed;top:0;left:0;z-index:-1;background:#ffffff;pointer-events:none;';
  const style = document.createElement('style');
  style.textContent = MEDICAO_PDF_EXPORT_CSS;
  host.appendChild(style);
  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    const fullW = Math.max(clone.scrollWidth, clone.offsetWidth, 800);
    const fullH = Math.max(clone.scrollHeight, clone.offsetHeight, 200);

    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: fullW,
      height: fullH,
      windowWidth: fullW,
      windowHeight: fullH,
      scrollX: 0,
      scrollY: 0,
    });

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const { ratio, sliceHeightPx } = computeMedicaoPdfLayout(
      canvas.width,
      canvas.height,
      pageW,
      pageH,
      MEDICAO_PDF_MARGIN_MM,
    );

    let offsetY = 0;
    let page = 0;
    while (offsetY < canvas.height) {
      if (page > 0) pdf.addPage();
      const h = Math.min(sliceHeightPx, canvas.height - offsetY);
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = h;
      const ctx = sliceCanvas.getContext('2d');
      if (!ctx) throw new Error('Falha ao montar PDF da medição');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, h);
      ctx.drawImage(canvas, 0, offsetY, canvas.width, h, 0, 0, canvas.width, h);
      const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.93);
      pdf.addImage(sliceData, 'JPEG', MEDICAO_PDF_MARGIN_MM, MEDICAO_PDF_MARGIN_MM, canvas.width * ratio, h * ratio);
      offsetY += h;
      page++;
      if (page > 40) break;
    }

    return pdf.output('blob');
  } finally {
    host.remove();
  }
}
