import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const distDir = 'dist';
const publicDir = path.join(distDir, 'public');

if (fs.existsSync(publicDir)) {
  fs.rmSync(publicDir, { recursive: true });
}

const oldCjs = path.join(distDir, 'index.cjs');
if (fs.existsSync(oldCjs)) {
  fs.unlinkSync(oldCjs);
}
const oldVercelCjs = path.join(distDir, 'vercelApp.cjs');
if (fs.existsSync(oldVercelCjs)) {
  fs.unlinkSync(oldVercelCjs);
}

fs.mkdirSync(publicDir, { recursive: true });

// Move TODOS os arquivos/pastas de dist/ pra dist/public/, exceto a própria
// pasta public e qualquer arquivo de servidor (.cjs, .js do server).
// Antes só movíamos uma lista hardcoded (index.html, assets, logo.png,
// _redirects), o que deixava ícones do PWA (apple-touch-icon.png,
// icon-*.png), manifest.json e sw.js órfãos em dist/ e nunca servidos
// em produção. Resultado: iPhone nunca recebia o logo no atalho.
const skipEntries = new Set(['public', 'index.cjs', 'vercelApp.cjs']);
const entries = fs.readdirSync(distDir);
for (const entry of entries) {
  if (skipEntries.has(entry)) continue;
  const src = path.join(distDir, entry);
  fs.renameSync(src, path.join(publicDir, entry));
}

// Garante que TODOS os assets PWA estejam em dist/public/, mesmo que o
// vite não tenha incluído por algum motivo. Copia direto de client/public/.
const clientPublic = path.join('client', 'public');
if (fs.existsSync(clientPublic)) {
  for (const entry of fs.readdirSync(clientPublic)) {
    const src = path.join(clientPublic, entry);
    const dest = path.join(publicDir, entry);
    if (!fs.existsSync(dest)) {
      fs.cpSync(src, dest, { recursive: true });
    }
  }
}

console.log('Frontend files (HTML, assets, ícones PWA, manifest, sw.js) movidos para dist/public/');

const dhlBundleDir = 'dist';
fs.mkdirSync(dhlBundleDir, { recursive: true });

// Bundles autocontidos para api/dhl/occurrence-report.ts na Vercel (evita módulos
// aninhados ausentes no file tracing). Saída em dist/ — mesmo padrão de vercelApp.cjs.
execSync(
  `npx esbuild lib/dhlOccurrenceReport/generateReportHtml.ts --bundle --platform=node --format=cjs --outfile=${dhlBundleDir}/occurrence-report-html.cjs --packages=external`,
  { stdio: 'inherit' },
);
execSync(
  `npx esbuild lib/dhlOccurrenceReport/generateReportOutput.ts --bundle --platform=node --format=cjs --outfile=${dhlBundleDir}/occurrence-report-pdf.cjs --packages=external`,
  { stdio: 'inherit' },
);
console.log(`DHL occurrence report bundles: ${dhlBundleDir}/occurrence-report-{html,pdf}.cjs`);

// Bundle leve para api/index.ts na Vercel (carregado sob demanda, não no top-level).
execSync(
  'npx esbuild server/vercelAppEntry.ts --bundle --platform=node --format=cjs --outfile=dist/vercelApp.cjs --packages=external',
  { stdio: 'inherit' }
);
console.log('Server bundled to dist/vercelApp.cjs');

if (!process.env.VERCEL) {
  execSync(
    'npx esbuild server/index.ts --bundle --platform=node --format=cjs --outfile=dist/index.cjs --packages=external --external:./vite --external:../vite.config',
    { stdio: 'inherit' }
  );
  console.log('Server bundled to dist/index.cjs');
}
