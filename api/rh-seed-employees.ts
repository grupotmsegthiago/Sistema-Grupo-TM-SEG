import { authToken } from '../lib/email/missionEmailHelpers.js';
import { seedTmsegEmployees } from '../lib/rh/seedTmsegEmployeesRunner.js';

const DEFAULT_SUPABASE_URL = 'https://ajhmmjuewdsukecaimik.supabase.co';
const TMSEG_REF = 'ajhmmjuewdsukecaimik';

function decodeRef(key: string): string | null {
  try {
    const payload = key.split('.')[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))?.ref || null;
  } catch {
    return null;
  }
}

async function adminSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  const envUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '');
  const url = envUrl.includes(TMSEG_REF) ? envUrl : DEFAULT_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    '';
  if (!key || decodeRef(key) !== TMSEG_REF) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY indisponível neste ambiente');
  }
  return createClient(url, key);
}

function authorized(req: any): boolean {
  const cron = String(req.headers?.['x-cron-secret'] || req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  if (process.env.CRON_SECRET && cron === process.env.CRON_SECRET) return true;
  return !!authToken(req);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!authorized(req)) {
    res.status(401).json({ error: 'Não autorizado' });
    return;
  }
  try {
    const sb = await adminSupabase();
    const result = await seedTmsegEmployees(sb);
    res.status(result.ok ? 200 : 207).json(result);
  } catch (e: any) {
    console.error('[rh-seed-employees]', e?.message);
    res.status(500).json({ ok: false, error: e?.message || 'Falha na importação' });
  }
}

export const config = { maxDuration: 120 };
