/**
 * Gera o instalador de um arquivo quando o postject está disponível.
 * Sem certificado, o executável sai sem assinatura digital.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const raiz = process.cwd();
const dist = path.join(raiz, 'desktop', 'whatsapp-desktop', 'dist');
fs.mkdirSync(dist, { recursive: true });
const bundle = path.join(dist, 'app.mjs');
const esbuild = path.join(raiz, 'node_modules', 'esbuild', 'bin', 'esbuild');
const empacotar = spawnSync(process.execPath, [esbuild, 'desktop/whatsapp-desktop/servidor.ts', '--bundle', '--platform=node', '--format=esm', `--outfile=${bundle}`], {
  cwd: raiz,
  stdio: 'inherit',
});
if (empacotar.status !== 0) {
  console.error('Não foi possível empacotar o aplicativo.');
  process.exit(empacotar.status || 1);
}
console.log('Pacote gerado em desktop/whatsapp-desktop/dist/app.mjs');
console.log('O executável único depende de postject e de uma cópia do node.exe. Sem certificado, ele não é assinado.');
