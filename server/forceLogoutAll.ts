/**
 * Força logout de todos os usuários logados (sinal + revoga sessões Auth).
 */
import type { Express, Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  FORCE_LOGOUT_EMERGENCY_TOKEN,
  FORCE_LOGOUT_SETTINGS_KEY,
} from '../lib/forceLogout';
import { verifyCronRequest } from './cronAuth';

let lastForceLogoutAt: string | null = null;

export function getLastForceLogoutAt(): string | null {
  return lastForceLogoutAt;
}

export async function executeForceLogoutAll(
  supabase: SupabaseClient,
  opts?: { triggeredBy?: string },
): Promise<{ ok: true; signal: string; sessionsRevoked: number; details: string[] }> {
  const signal = `force-${Date.now()}`;
  const details: string[] = [];
  lastForceLogoutAt = new Date().toISOString();

  const { error: settingsErr } = await supabase.from('system_settings').upsert(
    [
      {
        key: FORCE_LOGOUT_SETTINGS_KEY,
        value: signal,
        updated_at: lastForceLogoutAt,
      },
    ],
    { onConflict: 'key' },
  );
  if (settingsErr) {
    details.push(`system_settings: ${settingsErr.message}`);
  } else {
    details.push('system_settings ok');
  }

  // Melhor esforço: tabela legada usada pelo App antigo
  try {
    const { error: logErr } = await supabase.from('system_logs').insert([
      {
        user_name: opts?.triggeredBy || 'Sistema',
        action_type: 'OTHER',
        entity: 'FORCE_LOGOUT_SIGNAL',
        entity_id: signal,
        details: JSON.stringify({
          at: lastForceLogoutAt,
          triggeredBy: opts?.triggeredBy || 'Sistema',
        }),
        created_at: lastForceLogoutAt,
      },
    ]);
    if (logErr) details.push(`system_logs: ${logErr.message}`);
    else details.push('system_logs ok');
  } catch (e: any) {
    details.push(`system_logs: ${e?.message || e}`);
  }

  let sessionsRevoked = 0;
  try {
    const rpcPromise = supabase.rpc('force_revoke_all_sessions');
    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: { message: 'timeout 3s' } }), 3000),
    );
    const { data, error } = await Promise.race([rpcPromise, timeoutPromise]);
    if (error) details.push(`rpc revoke: ${error.message}`);
    else {
      sessionsRevoked = Number(data || 0);
      details.push(`rpc revoke ok (${sessionsRevoked})`);
    }
  } catch (e: any) {
    details.push(`rpc revoke: ${e?.message || 'indisponível'}`);
  }

  return { ok: true, signal, sessionsRevoked, details };
}

export function registerForceLogoutRoutes(
  app: Express,
  supabase: SupabaseClient,
  requireAuth: (req: Request, res: Response, next: Function) => void,
  requireRole: (...roles: string[]) => any,
): void {
  const handler = async (req: Request, res: Response) => {
    try {
      const emergency =
        req.headers['x-emergency-token'] === FORCE_LOGOUT_EMERGENCY_TOKEN ||
        req.body?.token === FORCE_LOGOUT_EMERGENCY_TOKEN;
      const cronOk = verifyCronRequest(req);
      if (!emergency && !cronOk) {
        // exige auth diretoria — preenchido pelo middleware quando usado
      }

      const triggeredBy =
        String(req.headers['x-tmseg-user-name'] || '') ||
        (emergency ? 'Emergência' : cronOk ? 'Cron' : 'Admin');

      const result = await executeForceLogoutAll(supabase, { triggeredBy });
      console.log('[ForceLogout] disparado:', result);
      res.json({ ...result, forceLogoutAt: lastForceLogoutAt });
    } catch (e: any) {
      console.error('[ForceLogout]', e?.message || e);
      res.status(500).json({ ok: false, error: e?.message || 'Falha ao forçar logout' });
    }
  };

  // Emergência / cron (sem sessão de usuário)
  app.post('/api/admin/force-logout-all', async (req: Request, res: Response, next: Function) => {
    const emergency =
      req.headers['x-emergency-token'] === FORCE_LOGOUT_EMERGENCY_TOKEN ||
      req.body?.token === FORCE_LOGOUT_EMERGENCY_TOKEN;
    if (emergency || verifyCronRequest(req)) {
      return handler(req, res);
    }
    return requireAuth(req, res, () =>
      requireRole('diretoria', 'ceo', 'administrador', 'admin')(req, res, () => handler(req, res)),
    );
  });
}
