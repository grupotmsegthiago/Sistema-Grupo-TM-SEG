/**
 * POST /api/admin/force-logout-all — leve (sem Express).
 * Grava force_logout_signal em system_settings para deslogar todos os clientes.
 */
import {
  FORCE_LOGOUT_EMERGENCY_TOKEN,
  FORCE_LOGOUT_SETTINGS_KEY,
} from '../../lib/forceLogout.js';

type Res = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => { json: (body: unknown) => void };
};

function cleanEnv(value: unknown): string {
  if (value == null) return '';
  return String(value).trim().replace(/^["']|["']$/g, '');
}

function pickSupabase(): { url: string; key: string } | null {
  const url = cleanEnv(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  ).replace(/\/$/, '');
  const key = cleanEnv(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.TMSEG_SUPABASE_SERVICE_ROLE_KEY,
  );
  if (!url || !key) return null;
  return { url, key };
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req: { method?: string; headers?: Record<string, string | string[] | undefined>; body?: any }, res: Res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const headerToken = (() => {
    const raw = req.headers?.['x-emergency-token'];
    return Array.isArray(raw) ? String(raw[0] || '') : String(raw || '');
  })();
  const bodyToken = String(req.body?.token || '');
  if (headerToken !== FORCE_LOGOUT_EMERGENCY_TOKEN && bodyToken !== FORCE_LOGOUT_EMERGENCY_TOKEN) {
    res.status(401).json({ ok: false, error: 'token inválido' });
    return;
  }

  const sb = pickSupabase();
  if (!sb) {
    res.status(500).json({ ok: false, error: 'Supabase service role não configurado' });
    return;
  }

  const signal = `force-${Date.now()}`;
  const forceLogoutAt = new Date().toISOString();
  const details: string[] = [];

  try {
    const upsertRes = await fetchWithTimeout(
      `${sb.url}/rest/v1/system_settings?on_conflict=key`,
      {
        method: 'POST',
        headers: {
          apikey: sb.key,
          Authorization: `Bearer ${sb.key}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify([
          {
            key: FORCE_LOGOUT_SETTINGS_KEY,
            value: signal,
            updated_at: forceLogoutAt,
          },
        ]),
      },
      5000,
    );
    if (!upsertRes.ok) {
      const text = await upsertRes.text().catch(() => '');
      details.push(`system_settings: HTTP ${upsertRes.status} ${text.slice(0, 200)}`);
      res.status(502).json({ ok: false, signal, forceLogoutAt, details });
      return;
    }
    details.push('system_settings ok');
  } catch (e: any) {
    details.push(`system_settings: ${e?.message || e}`);
    res.status(504).json({ ok: false, signal, forceLogoutAt, details });
    return;
  }

  // Melhor esforço — não bloqueia a resposta se RPC falhar/travar
  let sessionsRevoked = 0;
  try {
    const rpcRes = await fetchWithTimeout(
      `${sb.url}/rest/v1/rpc/force_revoke_all_sessions`,
      {
        method: 'POST',
        headers: {
          apikey: sb.key,
          Authorization: `Bearer ${sb.key}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      },
      3000,
    );
    if (rpcRes.ok) {
      const data = await rpcRes.json().catch(() => 0);
      sessionsRevoked = Number(data || 0);
      details.push(`rpc revoke ok (${sessionsRevoked})`);
    } else {
      details.push(`rpc revoke: HTTP ${rpcRes.status}`);
    }
  } catch (e: any) {
    details.push(`rpc revoke: ${e?.message || 'indisponível'}`);
  }

  res.status(200).json({
    ok: true,
    signal,
    forceLogoutAt,
    sessionsRevoked,
    details,
    triggeredBy: 'Emergência',
  });
}

export const config = { maxDuration: 15 };
