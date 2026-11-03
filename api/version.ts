/** Versão publicada — leve, sem cold start do Express (usado pelo auto-update no boot). */
import fs from 'node:fs';
import path from 'node:path';
import { FORCE_LOGOUT_SETTINGS_KEY } from '../lib/forceLogout.js';

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

async function readForceLogoutSignal(): Promise<string | null> {
  try {
    const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(
      /\/$/,
      '',
    );
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      '';
    if (!url || !key) return null;
    const res = await fetch(
      `${url}/rest/v1/system_settings?key=eq.${FORCE_LOGOUT_SETTINGS_KEY}&select=value&limit=1`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
        cache: 'no-store',
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ value?: string }>;
    const value = rows?.[0]?.value;
    const normalized = value != null ? String(value).trim() : '';
    return normalized || null;
  } catch {
    return null;
  }
}

export default async function handler(_req: unknown, res: Res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  const meta = readBuildMeta();
  const forceLogoutSignal = await readForceLogoutSignal();
  const base = meta || {
    version: 'unknown',
    buildId: process.env.VERCEL_GIT_COMMIT_SHA || 'dev',
    builtAt: new Date().toISOString(),
  };

  res.status(200).json({
    ...base,
    forceLogoutSignal: forceLogoutSignal || null,
  });
}
