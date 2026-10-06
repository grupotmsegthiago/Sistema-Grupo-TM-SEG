/**
 * Mapa e fotos desenhados no navegador.
 * O servidor às vezes não devolve a imagem (a função fica presa).
 * O navegador baixa o tile e a foto direto e grava os dois dentro do HTML.
 */
import { TILE_MAPA, limitesDoMapa, projetar, urlTileRua, type PontoGrade } from './mapaGrade';

function carregarImagem(url: string, ms: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      reject(new Error('tempo'));
    }, ms);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('imagem'));
    };
    img.src = url;
  });
}

export async function desenharMapaNoNavegador(
  pontos: PontoGrade[],
  largura: number,
  altura: number,
): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  const grade = limitesDoMapa(pontos, largura, altura);
  if (!grade) return null;
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, largura, altura);
  let chegou = 0;
  await Promise.all(grade.tiles.map(async ({ tx, ty }) => {
    const url = urlTileRua(grade.zoom, tx, ty);
    if (!url) return;
    try {
      const tile = await carregarImagem(url, 4000);
      ctx.drawImage(tile, Math.round(tx * TILE_MAPA - grade.origemX), Math.round(ty * TILE_MAPA - grade.origemY));
      chegou += 1;
    } catch {
      /* tile que não chegou fica no fundo cinza */
    }
  }));
  if (!chegou) return null;
  const validos = pontos.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  for (const ponto of validos) {
    const px = projetar(ponto.lat, ponto.lng, grade.zoom);
    const cx = px.x - grade.origemX;
    const cy = px.y - grade.origemY;
    ctx.beginPath();
    ctx.arc(cx, cy, 13, 0, Math.PI * 2);
    ctx.fillStyle = '#111827';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    const rotulo = String(ponto.rotulo || '');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 11px Arial, sans-serif';
    if (rotulo.length <= 2) {
      ctx.fillStyle = '#ffffff';
      ctx.fillText(rotulo, cx, cy);
    } else {
      ctx.fillStyle = '#111827';
      ctx.textBaseline = 'top';
      ctx.fillText(rotulo, cx, cy + 16);
    }
  }
  try {
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch {
    return null;
  }
}

async function fotoParaDataUrl(blob: Blob): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  const local = URL.createObjectURL(blob);
  try {
    const img = await carregarImagem(local, 8000);
    const maximo = 1400;
    const escala = Math.min(1, maximo / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const w = Math.max(1, Math.round((img.naturalWidth || 1) * escala));
    const h = Math.max(1, Math.round((img.naturalHeight || 1) * escala));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(local);
  }
}

export async function embutirFotosNoNavegador(urls: string[]): Promise<Record<string, string>> {
  if (typeof document === 'undefined' || typeof fetch === 'undefined') return {};
  const unicas = [...new Set(urls.filter((url) => url && !url.startsWith('data:')))];
  const saida: Record<string, string> = {};
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, unicas.length) }, async () => {
    while (cursor < unicas.length) {
      const url = unicas[cursor];
      cursor += 1;
      try {
        const resposta = await fetch(url, { signal: AbortSignal.timeout(12000) });
        if (!resposta.ok) continue;
        const blob = await resposta.blob();
        if (blob.size < 32 || blob.size > 12_000_000) continue;
        const dataUrl = await fotoParaDataUrl(blob);
        if (dataUrl) saida[url] = dataUrl;
      } catch {
        /* a foto continua no endereço original */
      }
    }
  }));
  return saida;
}
