import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const constantsPath = path.join(root, 'constants.ts');
const outPath = path.join(root, 'client', 'public', 'build-meta.json');

let version = 'unknown';
try {
  const txt = fs.readFileSync(constantsPath, 'utf8');
  const m = txt.match(/APP_VERSION\s*=\s*["']([^"']+)["']/);
  if (m) version = m[1];
} catch {}

let buildId = process.env.VERCEL_GIT_COMMIT_SHA || '';
if (!buildId) {
  try {
    buildId = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    buildId = `local-${Date.now()}`;
  }
}

const meta = {
  version,
  buildId,
  builtAt: new Date().toISOString(),
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(meta, null, 2)}\n`);
console.log('[build-meta] Gerado:', meta);
