import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire('C:/Users/pc/AppData/Local/Temp/aula-tmseg/package.json');
const puppeteer = require('puppeteer-core');
const ffmpegPath = require('ffmpeg-static');

const raizWin = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(raizWin, 'index.html');
const tmp = path.join(os.tmpdir(), 'aula-tmseg-midia');
const html = fs.readFileSync(htmlPath, 'utf8');
const cenas = JSON.parse(html.match(/<script type="application\/json" id="cenas-json">([\s\S]*?)<\/script>/)[1]);

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-1500)))));
  });
}

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await puppeteer.launch({
  executablePath: edge,
  headless: true,
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const segmentos = [];

for (let i = 0; i < cenas.length; i++) {
  const id = String(i).padStart(2, '0');
  const url = pathToFileURL(htmlPath).href + `?gravar=1&cena=${i}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('body[data-pronta="1"]');
  const png = path.join(tmp, `slide-${id}.png`);
  await page.screenshot({ path: png, type: 'png' });
  const audioDir = path.join(tmp, `voz-${id}`);
  const audio = fs.readdirSync(audioDir).find((f) => f.endsWith('.mp3'));
  const seg = path.join(tmp, `seg-${id}.mp4`);
  await run([
    '-y', '-loop', '1', '-i', png, '-i', path.join(audioDir, audio),
    '-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-r', '25',
    '-c:a', 'aac', '-b:a', '160k', '-af', 'apad=pad_dur=0.45', '-shortest', seg,
  ]);
  segmentos.push(seg);
  process.stdout.write(`ok ${id}\n`);
}
await browser.close();

const lista = path.join(tmp, 'lista.txt');
fs.writeFileSync(lista, segmentos.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
const saida = path.join(raizWin, 'Aula-Operador-e-Avancado.mp4');
await run(['-y', '-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', '-movflags', '+faststart', saida]);
process.stdout.write(`MP4 ${saida} ${(fs.statSync(saida).size / 1024 / 1024).toFixed(1)} MB\n`);
