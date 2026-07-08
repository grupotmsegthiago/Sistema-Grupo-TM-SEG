/**
 * Benchmark local do pipeline (sem Gemini — mede leitura, inpainting e salvamento).
 * Uso: npx tsx scripts/print-pipeline-bench.ts
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { processPrintImage } from '../server/printImagePipeline';
import { removeOverlaysFromBuffer } from '../lib/printInpainting';

const logoPath = path.resolve('public/logo.png');
if (!fs.existsSync(logoPath)) {
  console.error('logo.png não encontrado');
  process.exit(1);
}

async function makeSyntheticPrint(): Promise<Buffer> {
  const W = 1920;
  const H = 1080;
  const base = await sharp({
    create: { width: W, height: H, channels: 3, background: { r: 90, g: 120, b: 160 } },
  }).jpeg({ quality: 95 }).toBuffer();

  const overlay = Buffer.from(
    `<svg width="280" height="60">
      <rect width="280" height="60" fill="rgba(0,0,0,0.55)"/>
      <text x="10" y="38" font-size="22" fill="white" font-family="Arial">08/07/2026 13:41</text>
    </svg>`,
  );

  return sharp(base)
    .composite([{ input: overlay, top: H - 80, left: 20 }])
    .jpeg({ quality: 95 })
    .toBuffer();
}

async function main() {
  const input = await makeSyntheticPrint();
  console.log(`Imagem sintética: ${(input.length / 1024).toFixed(1)} KB`);

  const t0 = Date.now();
  const result = await processPrintImage(input, 'image/jpeg', { uploadMs: 5 });
  const elapsed = Date.now() - t0;

  console.log('\n=== Pipeline (sem API Gemini configurada) ===');
  console.log(JSON.stringify(result.timings, null, 2));
  console.log(`Método: ${result.method} | Limpo: ${result.cleaned} | ${result.width}x${result.height}`);
  console.log(`Tempo wall-clock: ${elapsed} ms`);

  const inpaintStart = Date.now();
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  removeOverlaysFromBuffer(pixels, info.width, info.height, [
    { box_2d: [920, 20, 980, 300], label: 'timestamp', kind: 'timestamp' },
  ]);
  const inpaintMs = Date.now() - inpaintStart;
  console.log(`\nInpainting local isolado: ${inpaintMs} ms`);

  const meta = await sharp(result.buffer).metadata();
  console.log(`Saída preserva resolução: ${meta.width === 1920 && meta.height === 1080 ? 'SIM' : 'NÃO'}`);

  if (result.timings.totalMs > 5000) {
    console.warn('⚠️  Acima da meta de 5s (sem detecção Gemini — esperado menor em produção com cache)');
  } else {
    console.log('✓ Dentro da meta (fase local)');
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
