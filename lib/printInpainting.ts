/**
 * Inpainting local determinístico — remove overlays sem IA generativa na foto inteira.
 * Preenche cada região interpolando das bordas adjacentes (preserva gradientes de céu/painel).
 */

import type { DetectedOverlay, OverlayKind } from './printPipelineTypes';

type Rgba = { r: number; g: number; b: number; a: number };

const PAD_NORM = 12; // folga em coords 0–1000 (~1,2%)

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function idx(w: number, x: number, y: number): number {
  return (y * w + x) * 4;
}

function readPx(data: Uint8ClampedArray, w: number, x: number, y: number): Rgba {
  const i = idx(w, x, y);
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
}

function writePx(data: Uint8ClampedArray, w: number, x: number, y: number, c: Rgba): void {
  const i = idx(w, x, y);
  data[i] = c.r;
  data[i + 1] = c.g;
  data[i + 2] = c.b;
  data[i + 3] = c.a;
}

function blend(a: Rgba, b: Rgba, t: number): Rgba {
  const u = clamp(t, 0, 1);
  return {
    r: Math.round(a.r * (1 - u) + b.r * u),
    g: Math.round(a.g * (1 - u) + b.g * u),
    b: Math.round(a.b * (1 - u) + b.b * u),
    a: Math.round(a.a * (1 - u) + b.a * u),
  };
}

function avgColors(colors: Rgba[]): Rgba {
  if (!colors.length) return { r: 0, g: 0, b: 0, a: 255 };
  let r = 0, g = 0, b = 0, a = 0;
  for (const c of colors) { r += c.r; g += c.g; b += c.b; a += c.a; }
  const n = colors.length;
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n), a: Math.round(a / n) };
}

/** Amostra faixa externa adjacente à borda da caixa. */
function sampleEdge(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  depth: number,
): { top: Rgba; bottom: Rgba; left: Rgba; right: Rgba } {
  const samples = { top: [] as Rgba[], bottom: [] as Rgba[], left: [] as Rgba[], right: [] as Rgba[] };
  const d = Math.max(2, depth);

  for (let x = x0; x <= x1; x++) {
    for (let k = 1; k <= d; k++) {
      const yt = y0 - k;
      if (yt >= 0) samples.top.push(readPx(data, w, x, yt));
      const yb = y1 + k;
      if (yb < h) samples.bottom.push(readPx(data, w, x, yb));
    }
  }
  for (let y = y0; y <= y1; y++) {
    for (let k = 1; k <= d; k++) {
      const xl = x0 - k;
      if (xl >= 0) samples.left.push(readPx(data, w, xl, y));
      const xr = x1 + k;
      if (xr < w) samples.right.push(readPx(data, w, xr, y));
    }
  }

  return {
    top: avgColors(samples.top),
    bottom: avgColors(samples.bottom),
    left: avgColors(samples.left),
    right: avgColors(samples.right),
  };
}

/** Preenche retângulo interpolando das 4 bordas (ideal para texto/carimbo). */
export function fillRegionFromEdges(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  edgeDepth = 4,
): void {
  const left = clamp(x0, 0, w - 1);
  const top = clamp(y0, 0, h - 1);
  const right = clamp(x1, 0, w - 1);
  const bottom = clamp(y1, 0, h - 1);
  if (right <= left || bottom <= top) return;

  const edges = sampleEdge(data, w, h, left, top, right, bottom, edgeDepth);
  const rw = right - left;
  const rh = bottom - top;

  for (let y = top; y <= bottom; y++) {
    const ty = rh <= 0 ? 0.5 : (y - top) / rh;
    for (let x = left; x <= right; x++) {
      const tx = rw <= 0 ? 0.5 : (x - left) / rw;
      const topC = blend(edges.left, edges.right, tx);
      const bottomC = blend(edges.left, edges.right, tx);
      const leftC = blend(edges.top, edges.bottom, ty);
      const rightC = blend(edges.top, edges.bottom, ty);
      const horiz = blend(leftC, rightC, tx);
      const vert = blend(topC, bottomC, ty);
      writePx(data, w, x, y, blend(horiz, vert, 0.5));
    }
  }
}

/** Inpainting por difusão de vizinhos (melhor para logos pequenos). */
export function inpaintRegionDiffusion(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  passes = 6,
): void {
  const left = clamp(x0, 0, w - 1);
  const top = clamp(y0, 0, h - 1);
  const right = clamp(x1, 0, w - 1);
  const bottom = clamp(y1, 0, h - 1);
  if (right <= left || bottom <= top) return;

  const mask = new Uint8Array(w * h);
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) mask[y * w + x] = 1;
  }

  const work = new Uint8ClampedArray(data);

  for (let pass = 0; pass < passes; pass++) {
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        if (!mask[y * w + x]) continue;
        const neighbors: Rgba[] = [];
        if (x > 0 && !mask[y * w + (x - 1)]) neighbors.push(readPx(work, w, x - 1, y));
        if (x < w - 1 && !mask[y * w + (x + 1)]) neighbors.push(readPx(work, w, x + 1, y));
        if (y > 0 && !mask[(y - 1) * w + x]) neighbors.push(readPx(work, w, x, y - 1));
        if (y < h - 1 && !mask[(y + 1) * w + x]) neighbors.push(readPx(work, w, x, y + 1));
        if (neighbors.length) writePx(work, w, x, y, avgColors(neighbors));
      }
    }
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        if (mask[y * w + x]) {
          const i = idx(w, x, y);
          data[i] = work[i];
          data[i + 1] = work[i + 1];
          data[i + 2] = work[i + 2];
          data[i + 3] = work[i + 3];
        }
      }
    }
  }
}

export function boxToPixels(
  box: [number, number, number, number],
  width: number,
  height: number,
  padNorm = PAD_NORM,
): { x0: number; y0: number; x1: number; y1: number } {
  const [ymin, xmin, ymax, xmax] = box;
  const y0 = clamp(Math.floor(((ymin - padNorm) / 1000) * height), 0, height - 1);
  const x0 = clamp(Math.floor(((xmin - padNorm) / 1000) * width), 0, width - 1);
  const y1 = clamp(Math.ceil(((ymax + padNorm) / 1000) * height), 0, height - 1);
  const x1 = clamp(Math.ceil(((xmax + padNorm) / 1000) * width), 0, width - 1);
  return { x0, y0, x1, y1 };
}

export function regionAreaRatio(box: DetectedOverlay, width: number, height: number): number {
  const { x0, y0, x1, y1 } = boxToPixels(box.box_2d, width, height, 0);
  const area = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return area / Math.max(1, width * height);
}

function inferKind(label?: string): OverlayKind {
  const t = (label || '').toLowerCase();
  if (/timestamp|date|time|hora|data|carimbo/.test(t)) return 'timestamp';
  if (/watermark|marca/.test(t)) return 'watermark';
  if (/logo|marca|brand|escudo|shield/.test(t)) return 'logo';
  if (/text|texto|caption|overlay|ui|app/.test(t)) return 'text';
  return 'unknown';
}

export function normalizeOverlayKind(overlay: DetectedOverlay): OverlayKind {
  if (overlay.kind && overlay.kind !== 'unknown') return overlay.kind;
  return inferKind(overlay.label);
}

/** Remove overlays detectados preservando o restante da imagem. */
export function removeOverlaysFromBuffer(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  boxes: DetectedOverlay[],
): number {
  let removed = 0;
  const sorted = [...boxes].sort((a, b) => {
    const aa = regionAreaRatio(a, width, height);
    const ab = regionAreaRatio(b, width, height);
    return aa - ab;
  });

  for (const box of sorted) {
    // Ignora regiões enormes (>25% da foto) — evita borrar cena inteira por falso positivo.
    if (regionAreaRatio(box, width, height) > 0.25) continue;

    const { x0, y0, x1, y1 } = boxToPixels(box.box_2d, width, height);
    if (x1 <= x0 || y1 <= y0) continue;

    const kind = normalizeOverlayKind(box);
    if (kind === 'text' || kind === 'timestamp' || kind === 'watermark') {
      fillRegionFromEdges(data, width, height, x0, y0, x1, y1);
    } else {
      fillRegionFromEdges(data, width, height, x0, y0, x1, y1);
      inpaintRegionDiffusion(data, width, height, x0, y0, x1, y1, kind === 'logo' ? 8 : 5);
    }
    removed++;
  }
  return removed;
}
