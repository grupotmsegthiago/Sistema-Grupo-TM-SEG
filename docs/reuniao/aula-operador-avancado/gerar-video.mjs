import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire('C:/Users/pc/AppData/Local/Temp/aula-tmseg/package.json');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const puppeteer = require('puppeteer-core');
const ffmpegPath = require('ffmpeg-static');

const raizWin = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(raizWin, 'index.html');
const tmp = path.join(os.tmpdir(), 'aula-tmseg-midia');
const desktop = path.join(process.env.USERPROFILE, 'Desktop', 'Aula-Operador-e-Avancado.mp4');
const copia = path.join(raizWin, 'Aula-Operador-e-Avancado.mp4');

const html = fs.readFileSync(htmlPath, 'utf8');
const json = html.match(/<script type="application\/json" id="cenas-json">([\s\S]*?)<\/script>/)[1];
const cenas = JSON.parse(json);

fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.slice(-2000) || `ffmpeg saiu com ${code}`));
    });
  });
}

const edge = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));
if (!edge) throw new Error('Microsoft Edge não encontrado');
if (!ffmpegPath) throw new Error('ffmpeg não encontrado');

const tts = new MsEdgeTTS();
await tts.setMetadata('pt-BR-FranciscaNeural', OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

const browser = await puppeteer.launch({
  executablePath: edge,
  headless: true,
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
  args: ['--disable-gpu', '--font-render-hinting=none'],
});
const page = await browser.newPage();

const segmentos = [];
for (let i = 0; i < cenas.length; i++) {
  const id = String(i).padStart(2, '0');
  process.stdout.write(`Cena ${i + 1}/${cenas.length}\n`);
  const url = pathToFileURL(htmlPath).href + `?gravar=1&cena=${i}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('body[data-pronta="1"]');
  const png = path.join(tmp, `slide-${id}.png`);
  await page.screenshot({ path: png, type: 'png' });

  const audioDir = path.join(tmp, `voz-${id}`);
  fs.mkdirSync(audioDir, { recursive: true });
  const { audioFilePath } = await tts.toFile(audioDir, cenas[i].fala, { rate: 0.93 });
  const seg = path.join(tmp, `seg-${id}.mp4`);
  await run([
    '-y',
    '-loop', '1',
    '-i', png,
    '-i', audioFilePath,
    '-c:v', 'libx264',
    '-tune', 'stillimage',
    '-pix_fmt', 'yuv420p',
    '-r', '25',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-af', 'apad=pad_dur=0.45',
    '-shortest',
    seg,
  ]);
  segmentos.push(seg);
}

await browser.close();
tts.close();

const lista = path.join(tmp, 'lista.txt');
fs.writeFileSync(lista, segmentos.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
await run(['-y', '-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', '-movflags', '+faststart', desktop]);
fs.copyFileSync(desktop, copia);
const stat = fs.statSync(desktop);
process.stdout.write(`PRONTO ${desktop} ${(stat.size / 1024 / 1024).toFixed(1)} MB\n`);
