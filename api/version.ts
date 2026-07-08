/** Versão publicada — leve, sem cold start do Express (usado pelo auto-update no boot). */
import fs from 'node:fs';
import path from 'node:path';

type Res = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => { json: (body: unknown) => void };
};

function readBuildMeta(): { version: string; buildId: string; builtAt: string } | null {
  const candidates = [
    path.join(process.cwd(), 'dist', 'public', 'build-meta.json'),
    path.join(process.cwd(), 'client', 'public', 'build-meta.json'),
  ];
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch {
      /* tenta próximo */
    }
  }
  return null;
}

export default function handler(_req: unknown, res: Res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  const meta = readBuildMeta();
  if (meta) {
    res.status(200).json(meta);
    return;
  }

  res.status(200).json({
    version: 'unknown',
    buildId: process.env.VERCEL_GIT_COMMIT_SHA || 'dev',
    builtAt: new Date().toISOString(),
  });
}
