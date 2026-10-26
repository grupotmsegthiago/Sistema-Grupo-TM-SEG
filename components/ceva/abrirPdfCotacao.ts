import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { faixasCobertas, gruposNaFolha } from '../../lib/portalCliente/pdfBlocos';
import { prepararImagensDoElemento } from '../../lib/precificacao/imageUtils';

const MARGEM_MM = 8;

function liberarRolagem(artigo: HTMLElement): () => void {
  const corpo = artigo.querySelector('[data-proposta-corpo]');
  const alvos = [artigo, corpo].filter((el): el is HTMLElement => el instanceof HTMLElement);
  const antes = alvos.map((el) => ({
    el,
    height: el.style.height,
    maxHeight: el.style.maxHeight,
    overflow: el.style.overflow,
  }));
  for (const el of alvos) {
    el.style.height = 'auto';
    el.style.maxHeight = 'none';
    el.style.overflow = 'visible';
  }
  return () => {
    for (const item of antes) {
      item.el.style.height = item.height;
      item.el.style.maxHeight = item.maxHeight;
      item.el.style.overflow = item.overflow;
    }
  };
}

/** O histórico deixa a proposta em left negativo. O html2canvas corta o que está fora da janela. */
function exporCaptura(artigo: HTMLElement): () => void {
  const host = artigo.closest('[data-captura-proposta]');
  if (!(host instanceof HTMLElement)) return () => undefined;
  const antes = {
    left: host.style.left,
    top: host.style.top,
    opacity: host.style.opacity,
    visibility: host.style.visibility,
    zIndex: host.style.zIndex,
  };
  host.style.left = '0px';
  host.style.top = '0px';
  host.style.opacity = '1';
  host.style.visibility = 'visible';
  host.style.zIndex = '-1';
  return () => {
    host.style.left = antes.left;
    host.style.top = antes.top;
    host.style.opacity = antes.opacity;
    host.style.visibility = antes.visibility;
    host.style.zIndex = antes.zIndex;
  };
}

/** Botão de fechar e a barra de ações não entram na folha. */
function esconderForaDoCorpo(artigo: HTMLElement): () => void {
  const corpo = artigo.querySelector('[data-proposta-corpo]');
  const escondidos: Array<{ el: HTMLElement; display: string }> = [];
  for (const filho of Array.from(artigo.children)) {
    if (!(filho instanceof HTMLElement) || filho === corpo) continue;
    escondidos.push({ el: filho, display: filho.style.display });
    filho.style.display = 'none';
  }
  return () => {
    for (const item of escondidos) item.el.style.display = item.display;
  };
}

function recortarFaixa(canvas: HTMLCanvasElement, inicio: number, fim: number): HTMLCanvasElement {
  const y0 = Math.max(0, Math.min(canvas.height - 1, Math.round(inicio)));
  const y1 = Math.max(y0 + 1, Math.min(canvas.height, Math.round(fim)));
  const altura = y1 - y0;
  const saida = document.createElement('canvas');
  saida.width = canvas.width;
  saida.height = altura;
  const ctx = saida.getContext('2d');
  if (!ctx) return canvas;
  ctx.fillStyle = '#f7f5f2';
  ctx.fillRect(0, 0, saida.width, saida.height);
  ctx.drawImage(canvas, 0, y0, canvas.width, altura, 0, 0, canvas.width, altura);
  return saida;
}

/**
 * Uma foto do artigo oficial.
 * A folha corta só no vão entre faixas verticais, então dois cards lado a lado
 * permanecem na mesma página e nenhum bloco é partido no meio.
 * A faixa mais alta que a folha é reduzida para caber nela.
 */
async function desenharPdf(artigo: HTMLElement): Promise<jsPDF> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const largura = pdf.internal.pageSize.getWidth();
  const alturaPagina = pdf.internal.pageSize.getHeight();
  const larguraUtil = largura - MARGEM_MM * 2;
  const alturaUtil = alturaPagina - MARGEM_MM * 2;
  const restaurarExposicao = exporCaptura(artigo);
  const restaurarRolagem = liberarRolagem(artigo);
  const restaurarChrome = esconderForaDoCorpo(artigo);
  try {
    artigo.getBoundingClientRect();
    await prepararImagensDoElemento(artigo);
    const retanguloArtigo = artigo.getBoundingClientRect();
    const blocos = Array.from(artigo.querySelectorAll('[data-proposta-bloco]')).filter((el): el is HTMLElement => (
      el instanceof HTMLElement && el.getClientRects().length > 0
    ));
    const canvas = await html2canvas(artigo, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#f7f5f2',
      logging: false,
      windowWidth: Math.max(window.innerWidth, Math.ceil(artigo.scrollWidth)),
      windowHeight: Math.max(window.innerHeight, Math.ceil(artigo.scrollHeight)),
      onclone: (documento, clonado) => {
        const host = clonado.closest('[data-captura-proposta]') || documento.querySelector('[data-captura-proposta]');
        if (!(host instanceof HTMLElement)) return;
        host.style.left = '0px';
        host.style.top = '0px';
        host.style.opacity = '1';
        host.style.visibility = 'visible';
        host.style.zIndex = '-1';
      },
    });
    if (canvas.width < 8 || canvas.height < 8) return pdf;
    const escala = canvas.width / Math.max(1, retanguloArtigo.width);
    const retangulos = blocos.map((bloco) => {
      const retangulo = bloco.getBoundingClientRect();
      return {
        top: (retangulo.top - retanguloArtigo.top) * escala,
        bottom: (retangulo.bottom - retanguloArtigo.top) * escala,
      };
    });
    const faixas = faixasCobertas(retangulos, canvas.height);
    const alturaUtilPx = (alturaUtil * canvas.width) / larguraUtil;
    const grupos = gruposNaFolha(faixas, alturaUtilPx);
    grupos.forEach((grupo, indice) => {
      if (grupo.length === 0) return;
      if (indice > 0) pdf.addPage();
      const inicio = faixas[grupo[0]].inicio;
      const fim = faixas[grupo[grupo.length - 1]].fim;
      const recorte = recortarFaixa(canvas, inicio, fim);
      let larguraMm = larguraUtil;
      let alturaMm = (recorte.height * larguraUtil) / Math.max(1, recorte.width);
      if (alturaMm > alturaUtil) {
        const fator = alturaUtil / alturaMm;
        alturaMm = alturaUtil;
        larguraMm = larguraUtil * fator;
      }
      const x = MARGEM_MM + (larguraUtil - larguraMm) / 2;
      pdf.addImage(recorte.toDataURL('image/jpeg', 0.86), 'JPEG', x, MARGEM_MM, larguraMm, alturaMm);
    });
  } finally {
    restaurarChrome();
    restaurarRolagem();
    restaurarExposicao();
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
