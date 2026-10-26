import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { prepararImagensDoElemento } from '../../lib/precificacao/imageUtils';

async function desenharPdf(artigo: HTMLElement): Promise<jsPDF> {
  await prepararImagensDoElemento(artigo);
  const canvas = await html2canvas(artigo, { scale: 2, useCORS: true, allowTaint: false, backgroundColor: '#f7f5f2', logging: false });
  const imagem = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const largura = pdf.internal.pageSize.getWidth();
  const alturaPagina = pdf.internal.pageSize.getHeight();
  const altura = (canvas.height * largura) / canvas.width;
  let restante = altura;
  let posicao = 0;
  pdf.addImage(imagem, 'PNG', 0, posicao, largura, altura);
  restante -= alturaPagina;
  while (restante > 0) {
    posicao = restante - altura;
    pdf.addPage();
    pdf.addImage(imagem, 'PNG', 0, posicao, largura, altura);
    restante -= alturaPagina;
  }
  return pdf;
}

/** PDF em Base64 para o anexo do e-mail. Não abre janela e não baixa o arquivo. */
export async function pdfBase64DaProposta(artigo: HTMLElement): Promise<string> {
  const pdf = await desenharPdf(artigo);
  return pdf.output('datauristring');
}

function congelarCanvas(canvas: HTMLCanvasElement): HTMLImageElement | null {
  try {
    if (canvas.width < 20 || canvas.height < 20) return null;
    const copia = document.createElement('canvas');
    copia.width = canvas.width;
    copia.height = canvas.height;
    const ctx = copia.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(canvas, 0, 0);
    const pontos: Array<[number, number]> = [
      [Math.floor(canvas.width * 0.5), Math.floor(canvas.height * 0.5)],
      [Math.floor(canvas.width * 0.25), Math.floor(canvas.height * 0.4)],
      [Math.floor(canvas.width * 0.75), Math.floor(canvas.height * 0.6)],
    ];
    const cores = pontos.map(([x, y]) => ctx.getImageData(x, y, 1, 1).data);
    const visivel = cores.some((cor) => cor[3] > 16);
    const varia = cores.some((cor) => cor[0] !== cores[0][0] || cor[1] !== cores[0][1] || cor[2] !== cores[0][2]);
    if (!visivel || !varia) return null;
    const url = copia.toDataURL('image/png');
    if (!url.startsWith('data:image/') || url.length < 20000) return null;
    const img = document.createElement('img');
    const estilo = getComputedStyle(canvas);
    img.src = url;
    img.alt = '';
    img.setAttribute('data-print-canvas', '1');
    img.style.position = estilo.position;
    img.style.left = estilo.left;
    img.style.top = estilo.top;
    img.style.width = estilo.width;
    img.style.height = estilo.height;
    img.style.transform = estilo.transform;
    canvas.style.display = 'none';
    canvas.parentElement?.insertBefore(img, canvas);
    return img;
  } catch {
    return null;
  }
}

/**
 * Foto do mapa que está na tela, com o painel, a rota e a carreta.
 * O canvas do Google não entra no PDF; quando ele não exporta, o mapa estático
 * já baixado fica por baixo e o html2canvas lê o restante do card.
 */
export async function printDoMapaVisivel(raiz: HTMLElement, mapaFundo: string | null): Promise<string | null> {
  const limpezas: Array<() => void> = [];
  try {
    const canvases = Array.from(raiz.querySelectorAll('canvas'));
    const maior = canvases.reduce<HTMLCanvasElement | null>((atual, canvas) => {
      if (!atual) return canvas;
      return canvas.width * canvas.height > atual.width * atual.height ? canvas : atual;
    }, null);
    const pixels = maior ? congelarCanvas(maior) : null;
    if (pixels && maior) {
      limpezas.push(() => {
        pixels.remove();
        maior.style.display = '';
      });
      canvases.filter((canvas) => canvas !== maior).forEach((canvas) => {
        const copia = congelarCanvas(canvas);
        if (!copia) return;
        limpezas.push(() => {
          copia.remove();
          canvas.style.display = '';
        });
      });
    } else if (mapaFundo && mapaFundo.startsWith('data:image/')) {
      const estilo = raiz.querySelector('.gm-style');
      const pai = estilo?.parentElement;
      if (estilo instanceof HTMLElement && pai) {
        const fundo = document.createElement('img');
        fundo.src = mapaFundo;
        fundo.alt = '';
        fundo.setAttribute('data-print-fundo', '1');
        fundo.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;';
        const fundoAnterior = estilo.style.backgroundColor;
        estilo.style.backgroundColor = 'transparent';
        pai.insertBefore(fundo, estilo);
        const escondidos = canvases.map((canvas) => {
          const visivel = canvas.style.visibility;
          canvas.style.visibility = 'hidden';
          return () => { canvas.style.visibility = visivel; };
        });
        await new Promise<void>((resolver) => {
          if (fundo.complete) resolver();
          else {
            fundo.onload = () => resolver();
            fundo.onerror = () => resolver();
          }
        });
        limpezas.push(() => {
          fundo.remove();
          estilo.style.backgroundColor = fundoAnterior;
          escondidos.forEach((restaurar) => restaurar());
        });
      }
    }
    await prepararImagensDoElemento(raiz);
    const shot = await html2canvas(raiz, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#0f172a',
      logging: false,
    });
    const url = shot.toDataURL('image/jpeg', 0.82);
    if (!url.startsWith('data:image/') || url.length < 5000) return null;
    return url;
  } catch {
    return null;
  } finally {
    limpezas.reverse().forEach((restaurar) => restaurar());
  }
}

/** Abre o PDF já com as imagens em Base64 e também baixa o arquivo. A janela precisa ter sido aberta no clique. */
export async function abrirPdfDaProposta(artigo: HTMLElement, nomeArquivo: string, janela: Window | null): Promise<void> {
  const pdf = await desenharPdf(artigo);
  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  if (janela && !janela.closed) janela.location.href = url;
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
