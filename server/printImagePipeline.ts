/**
 * Pipeline server-side de limpeza de prints — detecta overlays via Gemini,
 * remove localmente com inpainting determinístico e preserva resolução original.
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { Modality } from '@google/genai';
import { generateGeminiContent, isGeminiConfigured } from './geminiClient';
import { withTimeout } from '../lib/promiseTimeout';
import { computeScaledDimensions } from '../lib/imageForAI';
import {
  removeOverlaysFromBuffer,
  regionAreaRatio,
} from '../lib/printInpainting';
import type {
  DetectedOverlay,
  PrintPipelineResult,
  PrintPipelineTimings,
} from '../lib/printPipelineTypes';
import { isSupportedPrintMime, normalizePrintMime } from '../lib/printPipelineTypes';

const DETECTION_MAX_DIM = 1600;
const DETECTION_JPEG_QUALITY = 85;
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const GEMINI_DETECTION_TIMEOUT_MS = 25_000;

const DETECTION_PROMPT =
  'Detect every digital OVERLAY stamped ON TOP of this photo (not part of the physical scene): ' +
  '(1) camera date/time and city/location stamps, (2) watermarks and semi-transparent captions, ' +
  '(3) app UI text or software names, (4) pasted/stamped company logos of ANY brand (including an old TMSEG shield logo if overlaid). ' +
  'Do NOT include: vehicle license plates, road signs, text physically painted on vehicles or buildings, or logos that are physically part of the truck body paint. ' +
  'Return a JSON array where each item is {"box_2d":[ymin,xmin,ymax,xmax],"label":string,"kind":"text"|"logo"|"watermark"|"timestamp"|"unknown"} ' +
  'with coordinates normalized to 0-1000. Return [] if there are no overlays.';

function nowMs(): number {
  return Date.now();
}

function emptyTimings(): PrintPipelineTimings {
  return { uploadMs: 0, readMs: 0, detectionMs: 0, removalMs: 0, logoMs: 0, saveMs: 0, totalMs: 0 };
}

async function buildDetectionPayload(
  buffer: Buffer,
  mimeType: string,
): Promise<{ data: string; mimeType: string; width: number; height: number }> {
  const meta = await sharp(buffer).metadata();
  const width = meta.width || 1;
  const height = meta.height || 1;
  const { width: tw, height: th, scaled } = computeScaledDimensions(width, height, DETECTION_MAX_DIM);

  let pipeline = sharp(buffer, { failOn: 'none' }).rotate();
  if (scaled) pipeline = pipeline.resize(tw, th, { fit: 'inside', withoutEnlargement: true });
  const jpegBuf = await pipeline.jpeg({ quality: DETECTION_JPEG_QUALITY, mozjpeg: true }).toBuffer();

  return {
    data: jpegBuf.toString('base64'),
    mimeType: 'image/jpeg',
    width,
    height,
  };
}

async function detectOverlays(
  buffer: Buffer,
  mimeType: string,
): Promise<{ boxes: DetectedOverlay[]; ms: number }> {
  const t0 = nowMs();
  if (!isGeminiConfigured()) return { boxes: [], ms: nowMs() - t0 };

  const payload = await buildDetectionPayload(buffer, mimeType);
  const boxResp = await withTimeout(
    generateGeminiContent({
      model: 'gemini-2.5-flash',
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: payload.mimeType, data: payload.data } },
          { text: DETECTION_PROMPT },
        ],
      }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              box_2d: { type: 'array', items: { type: 'integer' } },
              label: { type: 'string' },
              kind: { type: 'string' },
            },
            required: ['box_2d'],
          },
        },
      },
    }),
    GEMINI_DETECTION_TIMEOUT_MS,
    'Timeout na detecção de overlays do print',
  );

  let boxes: DetectedOverlay[] = [];
  try {
    const parsed = JSON.parse(boxResp.text || '[]');
    boxes = (Array.isArray(parsed) ? parsed : [])
      .filter((b: any) => Array.isArray(b?.box_2d) && b.box_2d.length === 4)
      .map((b: any) => ({
        box_2d: b.box_2d as [number, number, number, number],
        label: typeof b.label === 'string' ? b.label : undefined,
        kind: typeof b.kind === 'string' ? b.kind : undefined,
      }));
  } catch {
    boxes = [];
  }

  return { boxes, ms: nowMs() - t0 };
}

/** Fallback: inpainting localizado via Gemini só no recorte (nunca a foto inteira). */
async function patchSmallRegionWithGemini(
  buffer: Buffer,
  mimeType: string,
  box: DetectedOverlay,
  width: number,
  height: number,
): Promise<Buffer | null> {
  const ratio = regionAreaRatio(box, width, height);
  if (ratio > 0.08 || ratio < 0.0005) return null;

  const pad = 20;
  const [ymin, xmin, ymax, xmax] = box.box_2d;
  const left = Math.max(0, Math.floor(((xmin - pad) / 1000) * width));
  const top = Math.max(0, Math.floor(((ymin - pad) / 1000) * height));
  const right = Math.min(width, Math.ceil(((xmax + pad) / 1000) * width));
  const bottom = Math.min(height, Math.ceil(((ymax + pad) / 1000) * height));
  const cw = right - left;
  const ch = bottom - top;
  if (cw < 8 || ch < 8 || cw > 640 || ch > 640) return null;

  const cropBuf = await sharp(buffer).extract({ left, top, width: cw, height: ch }).png().toBuffer();
  const cropB64 = cropBuf.toString('base64');

  const editPrompt =
    'Remove ONLY the digital overlay (text, watermark, or pasted logo) inside this image crop. ' +
    'Fill the removed area seamlessly using surrounding pixels. ' +
    'Do NOT change colors, lighting, sharpness, or perspective. ' +
    'Do NOT alter license plates or physical scene text. Output only the edited crop.';

  try {
    const response = await generateGeminiContent({
      model: 'gemini-2.5-flash-image',
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/png', data: cropB64 } },
          { text: editPrompt },
        ],
      }],
      config: { responseModalities: [Modality.TEXT, Modality.IMAGE] },
    });
    const parts = response.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find((p: any) => p.inlineData?.data);
    if (!imgPart?.inlineData?.data) return null;

    const patchBuf = Buffer.from(imgPart.inlineData.data, 'base64');
    const resizedPatch = await sharp(patchBuf)
      .resize(cw, ch, { fit: 'fill' })
      .png()
      .toBuffer();

    return sharp(buffer)
      .composite([{ input: resizedPatch, left, top }])
      .toBuffer();
  } catch {
    return null;
  }
}

export interface ProcessPrintOptions {
  uploadMs?: number;
  enableGeminiPatch?: boolean;
}

export async function processPrintImage(
  inputBuffer: Buffer,
  inputMime: string,
  options: ProcessPrintOptions = {},
): Promise<PrintPipelineResult> {
  const totalStart = nowMs();
  const timings = emptyTimings();
  timings.uploadMs = options.uploadMs ?? 0;

  const mimeType = normalizePrintMime(inputMime);
  if (!isSupportedPrintMime(mimeType)) {
    throw new Error('Formato inválido. Use JPEG, PNG ou WEBP.');
  }
  if (inputBuffer.length > MAX_INPUT_BYTES) {
    throw new Error('Imagem grande demais para processamento.');
  }

  const readStart = nowMs();
  const basePipeline = sharp(inputBuffer, { failOn: 'none' }).rotate();
  const meta = await basePipeline.metadata();
  const width = meta.width || 1;
  const height = meta.height || 1;

  const { boxes, ms: detectionMs } = await detectOverlays(inputBuffer, mimeType);
  timings.detectionMs = detectionMs;
  timings.readMs = nowMs() - readStart - detectionMs;

  if (!boxes.length) {
    const saveStart = nowMs();
    const outBuf = await preserveQualityOutput(basePipeline, mimeType, meta);
    timings.saveMs = nowMs() - saveStart;
    timings.totalMs = nowMs() - totalStart;
    return {
      buffer: outBuf,
      mimeType: outputMime(mimeType),
      width,
      height,
      boxes: [],
      cleaned: false,
      method: 'none',
      timings,
    };
  }

  const removalStart = nowMs();
  const { data, info } = await sharp(inputBuffer, { failOn: 'none' })
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  const removed = removeOverlaysFromBuffer(pixels, info.width, info.height, boxes);

  let workingBuffer = await sharp(Buffer.from(pixels), {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).png().toBuffer();

  let method: PrintPipelineResult['method'] = removed > 0 ? 'local-inpaint' : 'none';

  if (options.enableGeminiPatch && removed > 0) {
    for (const box of boxes) {
      const patched = await patchSmallRegionWithGemini(workingBuffer, 'image/png', box, info.width, info.height);
      if (patched) {
        workingBuffer = patched;
        method = 'gemini-patch';
      }
    }
  }

  timings.removalMs = nowMs() - removalStart;

  const saveStart = nowMs();
  const outBuf = await preserveQualityOutput(sharp(workingBuffer), mimeType, meta);
  timings.saveMs = nowMs() - saveStart;
  timings.totalMs = nowMs() - totalStart;

  return {
    buffer: outBuf,
    mimeType: outputMime(mimeType),
    width: info.width,
    height: info.height,
    boxes,
    cleaned: removed > 0,
    method,
    timings,
  };
}

function outputMime(input: string): string {
  if (input === 'image/jpeg') return 'image/jpeg';
  if (input === 'image/webp') return 'image/webp';
  return 'image/png';
}

async function preserveQualityOutput(
  pipeline: sharp.Sharp,
  inputMime: string,
  meta: sharp.Metadata,
): Promise<Buffer> {
  const withMeta = pipeline.withMetadata();
  if (inputMime === 'image/jpeg') {
    return withMeta.jpeg({ quality: 98, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer();
  }
  if (inputMime === 'image/webp') {
    return withMeta.webp({ quality: 98, lossless: false }).toBuffer();
  }
  return withMeta.png({ compressionLevel: 3 }).toBuffer();
}

export function resolveLogoPath(): string {
  const candidates = [
    path.resolve(process.cwd(), 'public', 'logo.png'),
    path.resolve(process.cwd(), 'client', 'public', 'logo.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

/** Aplica logotipo TM SEG no servidor (canto superior direito). Texto/Instagram fica no client. */
export async function applyTmsegLogoServer(imageBuffer: Buffer): Promise<Buffer> {
  const logoPath = resolveLogoPath();
  if (!fs.existsSync(logoPath)) return imageBuffer;

  const meta = await sharp(imageBuffer).metadata();
  const W = meta.width || 1;
  const H = meta.height || 1;
  const logoW = Math.max(48, Math.round(W * 0.20));
  const logoMeta = await sharp(logoPath).metadata();
  const logoH = Math.round(logoW * ((logoMeta.height || 1) / (logoMeta.width || 1)));
  const margin = Math.round(W * 0.025);

  const logoBuf = await sharp(logoPath)
    .resize(logoW, logoH, { fit: 'inside' })
    .png()
    .toBuffer();

  return sharp(imageBuffer)
    .composite([{ input: logoBuf, left: W - logoW - margin, top: margin }])
    .toBuffer();
}

export function logPipelineTimings(timings: PrintPipelineTimings, extra?: Record<string, unknown>): void {
  const payload = { ...timings, ...extra };
  console.info('[print-pipeline]', JSON.stringify(payload));
}
