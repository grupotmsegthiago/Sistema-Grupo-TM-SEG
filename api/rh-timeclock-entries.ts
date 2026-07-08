import {
  extractUserIdFromToken,
  resolveUserRoleFromToken,
  roleCanAccessEmployees,
} from '../lib/rh/apiEmployeesAuth.js';
import { getBrazilDayBounds } from '../lib/dateUtils.js';

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

async function assertTimeclockReadAccess(token: string, requestedUserId?: string): Promise<string | null> {
  if (!token) return 'Não autorizado';
  const callerId = extractUserIdFromToken(token);
  if (!callerId) return 'Não autorizado';
  const role = await resolveUserRoleFromToken(token);
  if (roleCanAccessEmployees(role)) return null;
  if (requestedUserId && requestedUserId !== callerId) {
    return 'Permissão negada — você só pode ver seu próprio ponto';
  }
  return null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const token = authToken(req);
  const startDate = String(req.query?.start || req.query?.startDate || '').trim();
  const endDate = String(req.query?.end || req.query?.endDate || '').trim();
  const requestedUserId = String(req.query?.userId || req.query?.user_id || '').trim();

  if (!startDate || !endDate) {
    res.status(400).json({ ok: false, error: 'Parâmetros start e end são obrigatórios (YYYY-MM-DD)' });
    return;
  }

  const callerId = extractUserIdFromToken(token);
  if (!callerId) {
    res.status(401).json({ ok: false, error: 'Não autorizado' });
    return;
  }

  const denied = await assertTimeclockReadAccess(token, requestedUserId || undefined);
  if (denied) {
    res.status(denied === 'Não autorizado' ? 401 : 403).json({ ok: false, error: denied });
    return;
  }

  const role = await resolveUserRoleFromToken(token);
  const isAdmin = roleCanAccessEmployees(role);
  const filterUserId = isAdmin ? (requestedUserId || '') : callerId;

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  try {
    const sb = await adminSupabase();
    const sameDay = startDate === endDate;
    const bounds = sameDay ? getBrazilDayBounds(startDate) : null;
    let query = sb.from('time_clock').select('*');
    if (bounds) {
      query = query.gte('timestamp', bounds.start).lte('timestamp', bounds.end);
    } else {
      const startBounds = getBrazilDayBounds(startDate);
      const endBounds = getBrazilDayBounds(endDate);
      query = query.gte('timestamp', startBounds.start).lte('timestamp', endBounds.end);
    }

    if (filterUserId) {
      query = query.eq('user_id', filterUserId);
    }

    const { data, error } = await query.order('timestamp', { ascending: false });
    if (error) throw error;

    res.status(200).json({
      ok: true,
      entries: data || [],
      total: data?.length || 0,
    });
  } catch (e: any) {
    console.error('[rh-timeclock-entries]', e?.message);
    res.status(500).json({ ok: false, error: e?.message || 'Falha ao carregar registros de ponto' });
  }
}

export const config = { maxDuration: 60 };
