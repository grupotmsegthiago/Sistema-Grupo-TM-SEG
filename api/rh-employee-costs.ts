import { assertEmployeesApiAccess } from '../lib/rh/apiEmployeesAuth.js';

const DEFAULT_SUPABASE_URL = 'https://ajhmmjuewdsukecaimik.supabase.co';
const TMSEG_REF = 'ajhmmjuewdsukecaimik';

function authToken(req: any): string {
  return String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '') || String(req.headers?.['x-auth-token'] || '');
}

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

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const token = authToken(req);
  if (!token) {
    res.status(401).json({ ok: false, error: 'Não autorizado' });
    return;
  }

  const denied = await assertEmployeesApiAccess(token);
  if (denied) {
    res.status(403).json({ ok: false, error: denied });
    return;
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  try {
    const month = String(req.query?.month || new Date().toISOString().slice(0, 7));
    const sb = await adminSupabase();
    const { loadEmployeeCostSummary } = await import('../lib/rh/loadEmployeeCostSummary.js');
    const result = await loadEmployeeCostSummary(sb, month);
    res.status(200).json(result);
  } catch (e: any) {
    console.error('[rh-employees-cost-summary]', e?.message);
    res.status(500).json({ ok: false, error: e?.message || 'Falha ao calcular custos' });
  }
}

export const config = { maxDuration: 60 };
