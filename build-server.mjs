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

fs.mkdirSync(publicDir, { recursive: true });

const frontendFiles = ['index.html', 'assets', 'logo.png', '_redirects'];
for (const entry of frontendFiles) {
  const src = path.join(distDir, entry);
  if (fs.existsSync(src)) {
    fs.renameSync(src, path.join(publicDir, entry));
  }
}

console.log('Frontend files moved to dist/public/');

execSync(
  'npx esbuild server/index.ts --bundle --platform=node --format=cjs --outfile=dist/index.cjs --packages=external --external:./vite --external:../vite.config',
  { stdio: 'inherit' }
);

console.log('Server bundled to dist/index.cjs');
