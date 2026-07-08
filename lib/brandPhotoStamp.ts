import { googleMapsApiKey } from './maps';

const LOGO_SRC = '/logo.png';
const MAX_CANVAS_DIM = 4096;
const MAX_CANVAS_PIXELS = 16_777_216;

export function loadStampImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // blob:/data: são same-origin — crossOrigin='anonymous' quebra colagem no Safari/iOS.
    if (!src.startsWith('blob:') && !src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao carregar imagem'));
    img.src = src;
  });
}

/** Reduz dimensões que estouram limites de canvas/toBlob no navegador. */
export function computeScaledCanvasSize(
  naturalWidth: number,
  naturalHeight: number,
): { width: number; height: number; scale: number } {
  if (!Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight) || naturalWidth <= 0 || naturalHeight <= 0) {
    throw new Error('Imagem inválida ou corrompida');
  }
  let scale = 1;
  if (naturalWidth > MAX_CANVAS_DIM || naturalHeight > MAX_CANVAS_DIM) {
    scale = Math.min(MAX_CANVAS_DIM / naturalWidth, MAX_CANVAS_DIM / naturalHeight);
  }
  let width = Math.max(1, Math.round(naturalWidth * scale));
  let height = Math.max(1, Math.round(naturalHeight * scale));
  if (width * height > MAX_CANVAS_PIXELS) {
    scale = Math.sqrt(MAX_CANVAS_PIXELS / (naturalWidth * naturalHeight));
    width = Math.max(1, Math.round(naturalWidth * scale));
    height = Math.max(1, Math.round(naturalHeight * scale));
  }
  return { width, height, scale };
}

/** Logo TM SEG (sup. dir.) + badge Instagram + @grupo_tmseg + site (inf. dir.). */
export function stampBrandOverlays(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  logo: HTMLImageElement,
) {
  const logoW = Math.max(48, Math.round(W * 0.20));
  const logoH = Math.round(logoW * (logo.naturalHeight / logo.naturalWidth));
  const margin = Math.round(W * 0.025);
  ctx.drawImage(logo, W - logoW - margin, margin, logoW, logoH);

  const s = W / 800;
  const ig = 40 * s;
  const blockW = 330 * s;
  const ox = W - margin - blockW;
  const oy = H - margin - ig - 30 * s;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 5 * s;
  ctx.shadowOffsetY = 1.5 * s;

  const grad = ctx.createRadialGradient(ox + 0.30 * ig, oy + 1.07 * ig, 0, ox + 0.30 * ig, oy + 1.07 * ig, 1.5 * ig);
  grad.addColorStop(0, '#fdf497');
  grad.addColorStop(0.05, '#fdf497');
  grad.addColorStop(0.45, '#fd5949');
  grad.addColorStop(0.60, '#d6249f');
  grad.addColorStop(0.90, '#285AEB');

  const rr = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  ctx.fillStyle = grad;
  rr(ox, oy, ig, ig, 11 * s);
  ctx.fill();

  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3 * s;
  rr(ox + 8 * s, oy + 8 * s, 24 * s, 24 * s, 8 * s);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ox + 20 * s, oy + 20 * s, 6.2 * s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ox + 29.2 * s, oy + 10.8 * s, 2.1 * s, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.font = `800 ${Math.round(27 * s)}px Arial, Helvetica, sans-serif`;
  ctx.fillText('@grupo_tmseg', ox + 50 * s, oy + 29 * s);
  ctx.textAlign = 'right';
  ctx.font = `700 ${Math.round(21 * s)}px Arial, Helvetica, sans-serif`;
  ctx.fillText('www.grupotmseg.com.br', ox + blockW, oy + ig + 27 * s);
  ctx.restore();
  ctx.textAlign = 'left';
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Falha ao gerar PNG'))), 'image/png');
  });
}

export async function stampBrandOnImageBlob(raw: Blob): Promise<Blob> {
  const url = URL.createObjectURL(raw);
  try {
    const [photo, logo] = await Promise.all([loadStampImage(url), loadStampImage(LOGO_SRC)]);
    const canvas = document.createElement('canvas');
    canvas.width = photo.naturalWidth;
    canvas.height = photo.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponível');
    ctx.drawImage(photo, 0, 0);
    stampBrandOverlays(ctx, canvas.width, canvas.height, logo);
    return canvasToPngBlob(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function createBrandedFallbackPhoto(opts: {
  coords?: { lat: number; lng: number } | null;
  osId?: string;
  status?: string;
}): Promise<Blob> {
  const W = 1280;
  const H = 720;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível');

  let drewMap = false;
  if (opts.coords && googleMapsApiKey) {
    try {
      const { lat, lng } = opts.coords;
      const staticUrl =
        `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=12&size=${W}x${H}&scale=2` +
        `&maptype=roadmap&markers=color:red%7C${lat},${lng}&key=${encodeURIComponent(googleMapsApiKey)}`;
      const mapImg = await loadStampImage(staticUrl);
      ctx.drawImage(mapImg, 0, 0, W, H);
      drewMap = true;
    } catch {
      drewMap = false;
    }
  }

  if (!drewMap) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#1e293b');
    g.addColorStop(1, '#0f172a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, W, H);

  if (opts.osId || opts.status) {
    ctx.fillStyle = '#fff';
    ctx.font = '700 28px Arial, Helvetica, sans-serif';
    ctx.fillText(`OS ${opts.osId || ''}`.trim(), 32, H - 72);
    if (opts.status) {
      ctx.font = '600 22px Arial, Helvetica, sans-serif';
      ctx.fillText(String(opts.status).toUpperCase(), 32, H - 36);
    }
  }

  const logo = await loadStampImage(LOGO_SRC);
  stampBrandOverlays(ctx, W, H, logo);
  return canvasToPngBlob(canvas);
}

export function waitMs(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

export async function waitUntil(check: () => boolean, timeoutMs = 30000, stepMs = 120): Promise<boolean> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) return false;
    await waitMs(stepMs);
  }
  return true;
}
