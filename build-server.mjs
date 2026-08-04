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
const skipEntries = new Set(['public', 'index.cjs', 'vercelApp.cjs', 'dhl-bundles']);
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

// Bundles autocontidos para api/dhl/occurrence-report.ts na Vercel (evita módulos
// aninhados ausentes no file tracing quando importados de lib/).
// IMPORTANTE: prefixo "_" faz a Vercel NÃO tratar estes .cjs como Serverless
// Functions (são apenas bibliotecas incluídas via includeFiles). Sem o "_" eles
// viram funções e conflitam com o includeFiles → deploy falha ("project-configuration").
execSync(
  'npx esbuild lib/dhlOccurrenceReport/generateReportHtml.ts --bundle --platform=node --format=cjs --outfile=api/dhl/_occurrence-report-html.cjs --packages=external',
  { stdio: 'inherit' },
);
execSync(
  'npx esbuild lib/dhlOccurrenceReport/generateReportOutput.ts --bundle --platform=node --format=cjs --outfile=api/dhl/_occurrence-report-pdf.cjs --packages=external',
  { stdio: 'inherit' },
);
execSync(
  'npx esbuild lib/dhlOccurrenceReport/adjustReportHtml.ts --bundle --platform=node --format=cjs --outfile=api/dhl/_occurrence-report-adjust.cjs --packages=external',
  { stdio: 'inherit' },
);
console.log('DHL occurrence report bundles: api/dhl/_occurrence-report-{html,pdf,adjust}.cjs');

// Bundle do motor financeiro para api/recalculate-open.ts (evita ERR_MODULE_NOT_FOUND
// no runtime Vercel ao importar lib/financialUtils.ts com deps circulares/extensionless).
execSync(
  'npx esbuild lib/financialUtils.ts --bundle --platform=node --format=cjs --outfile=api/_recalculate-open-core.cjs --packages=external',
  { stdio: 'inherit' },
);
console.log('Recalculate-open core bundle: api/_recalculate-open-core.cjs');

// Bundle do worker de reemissão NF para api/nf-control.ts (retry-now).
// Import ESM de server/nfRetryWorker quebra na Vercel (MODULE_NOT_FOUND) e o
// Express (api/index) está com cold-start lento demais para o botão Reemitir.
execSync(
  'npx esbuild server/nfRetryWorker.ts --bundle --platform=node --format=cjs --outfile=api/_nf-retry-core.cjs --packages=external',
  { stdio: 'inherit' },
);
console.log('NF retry core bundle: api/_nf-retry-core.cjs');

const dhlBundlesDir = path.join(distDir, 'dhl-bundles');
fs.mkdirSync(dhlBundlesDir, { recursive: true });
for (const name of [
  '_occurrence-report-html.cjs',
  '_occurrence-report-pdf.cjs',
  '_occurrence-report-adjust.cjs',
]) {
  fs.copyFileSync(path.join('api', 'dhl', name), path.join(dhlBundlesDir, name));
}
console.log('DHL occurrence report bundles copiados para dist/dhl-bundles/');

// Bundle da Gestão Investimento para api/gestao-investimento-api.ts (imports .ts
// sem extensão quebram no runtime ESM da Vercel — mesmo padrão DHL/NF).
execSync(
  'npx esbuild lib/investimentos/gestaoInvestimentoApi.ts --bundle --platform=node --format=cjs --outfile=api/_gestao-investimento-core.cjs --packages=external',
  { stdio: 'inherit' },
);
console.log('Gestão Investimento core bundle: api/_gestao-investimento-core.cjs');

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
