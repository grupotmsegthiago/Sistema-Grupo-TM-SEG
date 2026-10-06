/**
 * Mapa estático com arruamento (tiles do OpenStreetMap) e os marcadores da missão.
 * A chave de mapa não entra no HTML. O PNG é gerado no servidor.
 */
import sharp from 'sharp';

export type PontoMapaImagem = { lat: number; lng: number; rotulo: string };

const TILE = 256;
const cacheTile = new Map<string, Buffer>();

export function projetar(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const x = ((lng + 180) / 360) * n * TILE;
  const seno = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + seno) / (1 - seno)) / (4 * Math.PI)) * n * TILE;
  return { x, y };
}

export function escolherZoom(pontos: PontoMapaImagem[], largura: number, altura: number): number {
  if (pontos.length <= 1) return 16;
  for (let zoom = 15; zoom >= 5; zoom -= 1) {
    const px = pontos.map((p) => projetar(p.lat, p.lng, zoom));
    const larg = Math.max(...px.map((p) => p.x)) - Math.min(...px.map((p) => p.x));
    const alt = Math.max(...px.map((p) => p.y)) - Math.min(...px.map((p) => p.y));
    if (larg <= largura - 90 && alt <= altura - 90) return zoom;
  }
  return 5;
}

async function baixarTile(zoom: number, x: number, y: number): Promise<Buffer | null> {
  const n = 2 ** zoom;
  const xx = ((x % n) + n) % n;
  if (y < 0 || y >= n) return null;
  const chave = `${zoom}/${xx}/${y}`;
  const guardado = cacheTile.get(chave);
  if (guardado) return guardado;
  const fontes = [
    `https://tile.openstreetmap.org/${chave}.png`,
    `https://basemaps.cartocdn.com/rastertiles/voyager/${chave}.png`,
  ];
  for (const url of fontes) {
    try {
      const resposta = await fetch(url, {
        headers: { 'User-Agent': 'TMSEG/1.0 (contato@grupotmseg.com.br)', Accept: 'image/png' },
      });
      if (!resposta.ok) continue;
      const buf = Buffer.from(await resposta.arrayBuffer());
      if (buf.length < 100) continue;
      if (cacheTile.size > 400) cacheTile.clear();
      cacheTile.set(chave, buf);
      return buf;
    } catch {
      /* tenta a próxima fonte */
    }
  }
  return null;
}

export async function renderizarMapaPng(args: {
  pontos?: PontoMapaImagem[];
  largura?: number;
  altura?: number;
}): Promise<Buffer> {
  const pontos = (args.pontos || []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!pontos.length) throw new Error('sem pontos');
  const largura = Math.max(280, Math.min(1000, Number(args.largura) || 900));
  const altura = Math.max(180, Math.min(700, Number(args.altura) || 480));
  const zoom = escolherZoom(pontos, largura, altura);
  const px = pontos.map((p) => ({ ...projetar(p.lat, p.lng, zoom), rotulo: p.rotulo }));
  const centroX = (Math.min(...px.map((p) => p.x)) + Math.max(...px.map((p) => p.x))) / 2;
  const centroY = (Math.min(...px.map((p) => p.y)) + Math.max(...px.map((p) => p.y))) / 2;
  const origemX = centroX - largura / 2;
  const origemY = centroY - altura / 2;
  const x0 = Math.floor(origemX / TILE);
  const y0 = Math.floor(origemY / TILE);
  const x1 = Math.floor((origemX + largura) / TILE);
  const y1 = Math.floor((origemY + altura) / TILE);
  const camadas: sharp.OverlayOptions[] = [];
  for (let tx = x0; tx <= x1; tx += 1) {
    for (let ty = y0; ty <= y1; ty += 1) {
      const tile = await baixarTile(zoom, tx, ty);
      if (!tile) continue;
      camadas.push({ input: tile, left: Math.round(tx * TILE - origemX), top: Math.round(ty * TILE - origemY) });
    }
  }
  if (!camadas.length) throw new Error('tiles indisponíveis');
  const marcas = px.map((p) => {
    const cx = (p.x - origemX).toFixed(1);
    const cy = (p.y - origemY).toFixed(1);
    const curto = p.rotulo.length <= 2;
    const texto = curto
      ? `<text x="${cx}" y="${cy}" dy="4" text-anchor="middle" font-size="11" fill="#ffffff" font-family="Arial">${escapar(p.rotulo)}</text>`
      : `<text x="${cx}" y="${Number(cy) + 22}" text-anchor="middle" font-size="11" fill="#111827" font-family="Arial">${escapar(p.rotulo)}</text>`;
    return `<circle cx="${cx}" cy="${cy}" r="13" fill="#111827" stroke="#ffffff" stroke-width="2"/>${texto}`;
  }).join('');
  const svg = Buffer.from(`<svg width="${largura}" height="${altura}" xmlns="http://www.w3.org/2000/svg">${marcas}</svg>`);
  return sharp({
    create: { width: largura, height: altura, channels: 3, background: { r: 226, g: 232, b: 240 } },
  }).composite([...camadas, { input: svg, top: 0, left: 0 }]).png().toBuffer();
}

function escapar(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
