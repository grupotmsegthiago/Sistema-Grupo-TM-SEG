/**
 * Mapa estático com arruamento e os marcadores da missão.
 * A chave de mapa não entra no HTML. O PNG é gerado no servidor.
 * O pedido usa https com prazo curto e encerra a conexão. O fetch comum
 * não cancelava no servidor da Vercel e a função ficava presa, sem mapa e sem foto.
 */
import https from 'node:https';
import sharp from 'sharp';
import { TILE_MAPA, escolherZoom, limitesDoMapa, projetar, urlTileRua } from './mapaGrade';

export type PontoMapaImagem = { lat: number; lng: number; rotulo: string };

export { escolherZoom, projetar };

const cacheTile = new Map<string, Buffer>();

function comPrazo<T>(trabalho: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    trabalho.then(
      (valor) => {
        clearTimeout(timer);
        resolve(valor);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

function baixarUrl(url: string, ms: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    let terminou = false;
    const fim = (buf: Buffer | null) => {
      if (terminou) return;
      terminou = true;
      resolve(buf);
    };
    const req = https.get(url, {
      headers: { 'User-Agent': 'TMSEG/1.0 (contato@grupotmseg.com.br)', Accept: 'image/png,image/jpeg' },
    }, (res) => {
      const status = res.statusCode || 0;
      if (status < 200 || status >= 300) {
        res.resume();
        fim(null);
        return;
      }
      const partes: Buffer[] = [];
      res.on('data', (parte: Buffer) => partes.push(parte));
      res.on('end', () => fim(Buffer.concat(partes)));
      res.on('error', () => fim(null));
    });
    req.setTimeout(ms, () => {
      req.destroy();
      fim(null);
    });
    req.on('error', () => fim(null));
  });
}

async function baixarTile(zoom: number, x: number, y: number): Promise<Buffer | null> {
  const chaveUrl = urlTileRua(zoom, x, y);
  if (!chaveUrl) return null;
  const n = 2 ** zoom;
  const xx = ((x % n) + n) % n;
  const chave = `${zoom}/${xx}/${y}`;
  const guardado = cacheTile.get(chave);
  if (guardado) return guardado;
  // O Carto responde HTTP 200 com "API KEY REQUIRED" e o OSM, a partir da Vercel, não encerra.
  // A rua vem primeiro do mapa da Esri. O outro só entra se esse não responder em 2,5s.
  const fontes = [
    chaveUrl,
    `https://tile.openstreetmap.org/${chave}.png`,
  ];
  for (const url of fontes) {
    const buf = await baixarUrl(url, 2500);
    if (!buf || buf.length < 100) continue;
    if (cacheTile.size > 400) cacheTile.clear();
    cacheTile.set(chave, buf);
    return buf;
  }
  return null;
}

export async function renderizarPacoteMapas(
  mapas: Array<{ id?: string; pontos?: PontoMapaImagem[]; largura?: number; altura?: number }>,
): Promise<Array<{ id: string; base64: string }>> {
  const saida: Array<{ id: string; base64: string }> = [];
  for (const item of (mapas || []).slice(0, 16)) {
    const id = String(item?.id || '').trim();
    if (!id) continue;
    // Prazo duro: o download do tile, na Vercel, às vezes não dispara o timeout do socket
    // e a função ficava presa. Sem resposta, o relatório saía só com os pontos, sem a rua.
    const png = await comPrazo(renderizarMapaPng(item).catch(() => null), 8000);
    saida.push({ id, base64: png ? png.toString('base64') : '' });
  }
  return saida;
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
  const grade = limitesDoMapa(pontos, largura, altura);
  if (!grade) throw new Error('sem pontos');
  const { zoom, origemX, origemY } = grade;
  const px = pontos.map((p) => ({ ...projetar(p.lat, p.lng, zoom), rotulo: p.rotulo }));
  const tiles = grade.tiles;
  const pedidos: Array<Promise<sharp.OverlayOptions | null>> = tiles.map(({ tx, ty }) => (
    baixarTile(zoom, tx, ty).then((tile) => (
      tile ? { input: tile, left: Math.round(tx * TILE_MAPA - origemX), top: Math.round(ty * TILE_MAPA - origemY) } : null
    ))
  ));
  const camadas = (await Promise.all(pedidos)).filter((item): item is sharp.OverlayOptions => item != null);
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
