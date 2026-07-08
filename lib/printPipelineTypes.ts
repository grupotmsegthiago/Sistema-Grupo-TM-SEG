/** Tipos compartilhados do pipeline de limpeza de prints (Atualizar Missão). */

export type OverlayKind = 'text' | 'logo' | 'watermark' | 'timestamp' | 'unknown';

export interface DetectedOverlay {
  box_2d: [number, number, number, number]; // ymin, xmin, ymax, xmax — normalizado 0–1000
  label?: string;
  kind?: OverlayKind;
}

export interface PrintPipelineTimings {
  uploadMs: number;
  readMs: number;
  detectionMs: number;
  removalMs: number;
  logoMs: number;
  saveMs: number;
  totalMs: number;
}

export interface PrintPipelineResult {
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
  boxes: DetectedOverlay[];
  cleaned: boolean;
  method: 'none' | 'local-inpaint' | 'gemini-patch';
  timings: PrintPipelineTimings;
}

export const SUPPORTED_PRINT_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export function normalizePrintMime(mime: string): string {
  const m = (mime || '').toLowerCase().split(';')[0].trim();
  if (m === 'image/jpg') return 'image/jpeg';
  return m;
}

export function isSupportedPrintMime(mime: string): boolean {
  return SUPPORTED_PRINT_MIME.has(normalizePrintMime(mime));
}
