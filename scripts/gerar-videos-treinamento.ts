import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MODULOS } from '../lib/training/operadorAcademy';

const require = createRequire('C:/Users/pc/AppData/Local/Temp/aula-tmseg/package.json');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const puppeteer = require('puppeteer-core');
const ffmpegPath = require('ffmpeg-static');

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const saidaDir = path.join(raiz, 'public', 'treinamento');
const tmp = path.join(os.tmpdir(), 'aula-modulos');
fs.mkdirSync(saidaDir, { recursive: true });
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

function esc(valor: string) {
  return valor.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
}

function htmlDoQuadro(modulo: { titulo: string; trilha: string }, slide: { titulo: string; texto: string; itens?: string[] }, indice: number, total: number) {
  const chips = (slide.itens || []).map((item) => `<span class="chip">${esc(item)}</span>`).join('');
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box} body{margin:0;width:1280px;height:720px;font-family:Segoe UI,Arial,sans-serif;background:#f4f5f7;color:#111}
    .topo{height:64px;background:#111;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 28px}
    .marca{font-weight:800;letter-spacing:.16em} .marca span{color:#dc2626}
    .miolo{height:560px;padding:36px 48px}
    .k{color:#dc2626;font-size:14px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
    h1{font-size:36px;margin:8px 0 18px}
    p{font-size:24px;line-height:1.4;margin:0;color:#1f2937}
    .chips{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}
    .chip{background:#fff;border:2px solid #f97316;border-radius:999px;padding:8px 14px;font-weight:800;font-size:16px}
    .base{height:96px;background:#111;color:#fff;display:flex;align-items:center;padding:0 48px;font-size:18px}
  </style></head><body>
    <div class="topo"><div class="marca">GRUPO <span>TMSEG</span></div><div>${indice + 1} / ${total}</div></div>
    <div class="miolo">
      <div class="k">${esc(modulo.trilha === 'operador' ? 'Operador' : 'Avançado')} · ${esc(modulo.titulo)}</div>
      <h1>${esc(slide.titulo)}</h1>
      <p>${esc(slide.texto)}</p>
      <div class="chips">${chips}</div>
    </div>
    <div class="base">Aula em vídeo · os nomes são os do sistema</div>
  </body></html>`;
}

function run(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-1200)))));
  });
}

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const tts = new MsEdgeTTS();
await tts.setMetadata('pt-BR-FranciscaNeural', OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
const browser = await puppeteer.launch({
  executablePath: edge,
  headless: true,
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();

for (const modulo of MODULOS) {
  const segmentos: string[] = [];
  for (let i = 0; i < modulo.slides.length; i++) {
    const slide = modulo.slides[i];
    const id = `${modulo.id}-${String(i).padStart(2, '0')}`;
    const arquivoHtml = path.join(tmp, `${id}.html`);
    fs.writeFileSync(arquivoHtml, htmlDoQuadro(modulo, slide, i, modulo.slides.length));
    await page.goto(pathToFileURL(arquivoHtml).href, { waitUntil: 'load' });
    const png = path.join(tmp, `${id}.png`);
    await page.screenshot({ path: png, type: 'png' });
    const vozDir = path.join(tmp, `voz-${id}`);
    fs.mkdirSync(vozDir, { recursive: true });
    const fala = `${slide.titulo}. ${slide.texto}`;
    const { audioFilePath } = await tts.toFile(vozDir, fala, { rate: 0.93 });
    const seg = path.join(tmp, `${id}.mp4`);
    await run([
      '-y', '-loop', '1', '-i', png, '-i', audioFilePath,
      '-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-r', '25',
      '-c:a', 'aac', '-b:a', '128k', '-af', 'apad=pad_dur=0.35', '-shortest', seg,
    ]);
    segmentos.push(seg);
    process.stdout.write(`${modulo.id} ${i + 1}/${modulo.slides.length}\n`);
  }
  const lista = path.join(tmp, `${modulo.id}.txt`);
  fs.writeFileSync(lista, segmentos.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
  const destino = path.join(saidaDir, `${modulo.id}.mp4`);
  await run(['-y', '-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', '-movflags', '+faststart', destino]);
  process.stdout.write(`VIDEO ${destino}\n`);
}

await browser.close();
tts.close();
