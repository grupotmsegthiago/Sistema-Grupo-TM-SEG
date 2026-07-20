/**
 * Gera PDF do Boletim de Medição a partir do #print-area (html2canvas + jsPDF).
 */

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

  const canvas = await html2canvas(el, {
    scale: 1.5,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: el.scrollWidth,
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.92);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 6;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2;

  const imgW = canvas.width;
  const imgH = canvas.height;
  const ratio = Math.min(usableW / imgW, usableH / imgH);
  // Multipage se a imagem for mais alta que uma página
  const sliceHeightPx = Math.floor(usableH / ratio);
  let offsetY = 0;
  let page = 0;
  while (offsetY < imgH) {
    if (page > 0) pdf.addPage();
    const sliceCanvas = document.createElement('canvas');
    const h = Math.min(sliceHeightPx, imgH - offsetY);
    sliceCanvas.width = imgW;
    sliceCanvas.height = h;
    const ctx = sliceCanvas.getContext('2d');
    if (!ctx) throw new Error('Falha ao montar PDF da medição');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, imgW, h);
    ctx.drawImage(canvas, 0, offsetY, imgW, h, 0, 0, imgW, h);
    const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.92);
    const drawH = h * ratio;
    pdf.addImage(sliceData, 'JPEG', margin, margin, imgW * ratio, drawH);
    offsetY += h;
    page++;
    if (page > 40) break;
  }

  void imgData;
  return pdf.output('blob');
}
