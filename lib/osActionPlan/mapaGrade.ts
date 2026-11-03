/**
 * Cálculo do mapa (zoom e tiles) sem biblioteca de imagem.
 * O navegador e o servidor usam a mesma conta para o desenho não divergir.
 */
export const TILE_MAPA = 256;

export type PontoGrade = { lat: number; lng: number; rotulo?: string };

export function projetar(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const x = ((lng + 180) / 360) * n * TILE_MAPA;
  const seno = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + seno) / (1 - seno)) / (4 * Math.PI)) * n * TILE_MAPA;
  return { x, y };
}

export function escolherZoom(pontos: PontoGrade[], largura: number, altura: number): number {
  if (pontos.length <= 1) return 16;
  for (let zoom = 15; zoom >= 5; zoom -= 1) {
    const px = pontos.map((p) => projetar(p.lat, p.lng, zoom));
    const larg = Math.max(...px.map((p) => p.x)) - Math.min(...px.map((p) => p.x));
    const alt = Math.max(...px.map((p) => p.y)) - Math.min(...px.map((p) => p.y));
    if (larg <= largura - 90 && alt <= altura - 90) return zoom;
  }
  return 5;
}

export function limitesDoMapa(pontos: PontoGrade[], largura: number, altura: number): {
  zoom: number;
  origemX: number;
  origemY: number;
  tiles: Array<{ tx: number; ty: number }>;
} | null {
  const validos = pontos.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!validos.length) return null;
  const zoom = escolherZoom(validos, largura, altura);
  const px = validos.map((p) => projetar(p.lat, p.lng, zoom));
  const centroX = (Math.min(...px.map((p) => p.x)) + Math.max(...px.map((p) => p.x))) / 2;
  const centroY = (Math.min(...px.map((p) => p.y)) + Math.max(...px.map((p) => p.y))) / 2;
  const origemX = centroX - largura / 2;
  const origemY = centroY - altura / 2;
  const x0 = Math.floor(origemX / TILE_MAPA);
  const y0 = Math.floor(origemY / TILE_MAPA);
  const x1 = Math.floor((origemX + largura) / TILE_MAPA);
  const y1 = Math.floor((origemY + altura) / TILE_MAPA);
  const tiles: Array<{ tx: number; ty: number }> = [];
  for (let tx = x0; tx <= x1; tx += 1) {
    for (let ty = y0; ty <= y1; ty += 1) tiles.push({ tx, ty });
  }
  return { zoom, origemX, origemY, tiles };
}

export function urlTileRua(zoom: number, tx: number, ty: number): string | null {
  const n = 2 ** zoom;
  const xx = ((tx % n) + n) % n;
  if (ty < 0 || ty >= n) return null;
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${zoom}/${ty}/${xx}`;
}
