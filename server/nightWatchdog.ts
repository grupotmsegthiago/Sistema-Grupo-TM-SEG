/**
 * Vigia noturna no servidor: heartbeat, incidentes e alerta de ausência.
 */
import type { Express, Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getActiveNightWatchStart,
  isNightWatchActive,
  isNightWatchExemptRole,
  NIGHT_STALE_ALERT_MINUTES,
} from '../lib/productivity/nightWatch';
import { sendSystemAlertEmail } from './emailService';
import { registerScheduledTick } from './scheduledRegistry';

const ALERT_EMAILS = ['thiago@grupotmseg.com.br'];
const DEDUPE_SETTINGS_KEY = 'night_watch_alert_dedupe';

type DedupeMap = Record<string, string>; // `${userId}:${kind}` → ISO hour key

async function loadDedupe(supabase: SupabaseClient): Promise<DedupeMap> {
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', DEDUPE_SETTINGS_KEY)
      .maybeSingle();
    if (!data?.value) return {};
    const raw =
      typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    return raw && typeof raw === 'object' ? (raw as DedupeMap) : {};
  } catch {
    return {};
  }
}

async function saveDedupe(supabase: SupabaseClient, map: DedupeMap): Promise<void> {
  try {
    await supabase.from('system_settings').upsert(
      [
        {
          key: DEDUPE_SETTINGS_KEY,
          value: JSON.stringify(map),
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: 'key' },
    );
  } catch (e: any) {
    console.warn('[NightWatchdog] dedupe save:', e?.message);
  }
}

function hourKey(d = new Date()): string {
  return d.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 13);
}

async function shouldAlertOnce(
  supabase: SupabaseClient,
  userId: string | number,
  kind: string,
): Promise<boolean> {
  const map = await loadDedupe(supabase);
  const key = `${userId}:${kind}`;
  const hk = hourKey();
  if (map[key] === hk) return false;
  map[key] = hk;
  // Limpa chaves antigas
  const keys = Object.keys(map);
  if (keys.length > 200) {
    for (const k of keys.slice(0, keys.length - 150)) delete map[k];
  }
  await saveDedupe(supabase, map);
  return true;
}

export async function sendNightIncidentEmail(opts: {
  userName: string;
  userId: string | number;
  role?: string;
  type: string;
  idleMinutes?: number;
  details?: Record<string, unknown>;
}): Promise<boolean> {
  const when = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const html = `
    <h2>🚨 Alerta — vigia noturna</h2>
    <p><strong>Funcionário:</strong> ${escapeHtml(opts.userName)} (id ${escapeHtml(String(opts.userId))})</p>
    <p><strong>Perfil:</strong> ${escapeHtml(opts.role || '—')}</p>
    <p><strong>Tipo:</strong> ${escapeHtml(opts.type)}</p>
    <p><strong>Quando:</strong> ${escapeHtml(when)} (BRT)</p>
    ${
      opts.idleMinutes != null
        ? `<p><strong>Ociosidade:</strong> ~${opts.idleMinutes} min</p>`
        : ''
    }
    <p style="font-size:13px;color:#555;">
      O sistema exige presença no plantão 20h–08h (janta 00h–01h isenta).
      Desafio aos 20 min · 1h para responder · heartbeat a cada 2 min · alerta sem uso em 1h20.
    </p>
    <pre style="background:#f8fafc;padding:12px;border-radius:8px;font-size:11px;">${escapeHtml(
      JSON.stringify(opts.details || {}, null, 2),
    )}</pre>
  `;
  return sendSystemAlertEmail(
    ALERT_EMAILS,
    `Vigia noturna — ${opts.type} — ${opts.userName}`,
    html,
  );
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function registerNightWatchRoutes(
  app: Express,
  supabase: SupabaseClient,
  requireAuth: (req: Request, res: Response, next: Function) => void,
): void {
  app.post('/api/productivity/night-heartbeat', requireAuth, async (req: Request, res: Response) => {
    try {
      const userIdHeader = String(req.headers['x-tmseg-user-id'] || '');
      const userName = String(req.headers['x-tmseg-user-name'] || 'Usuário');
      const role = String(req.headers['x-tmseg-role'] || '');
      const userId = Number(userIdHeader);
      if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(400).json({ ok: false, error: 'user_id inválido' });
      }
      if (isNightWatchExemptRole(role)) {
        return res.json({ ok: true, skipped: 'exempt' });
      }
      if (!isNightWatchActive()) {
        return res.json({ ok: true, skipped: 'outside_night_watch' });
      }

      const page = typeof req.body?.page === 'string' ? req.body.page : null;
      const visibility = typeof req.body?.visibility === 'string' ? req.body.visibility : null;

      await supabase.from('audit_logs').insert([
        {
          user_id: userId,
          user_name: userName,
          user_role: role || null,
          action: 'night_heartbeat',
          page: page || '/',
          details: JSON.stringify({ visibility, at: new Date().toISOString() }),
          created_at: new Date().toISOString(),
        },
      ]);

      return res.json({ ok: true });
    } catch (e: any) {
      console.error('[NightHeartbeat]', e?.message || e);
      return res.status(500).json({ ok: false, error: e?.message || 'falha' });
    }
  });

  app.post('/api/productivity/night-incident', requireAuth, async (req: Request, res: Response) => {
    try {
      const userIdHeader = String(req.headers['x-tmseg-user-id'] || '');
      const userName = String(req.headers['x-tmseg-user-name'] || 'Usuário');
      const role = String(req.headers['x-tmseg-role'] || '');
      const userId = Number(userIdHeader) || userIdHeader;
      const type = String(req.body?.type || 'unknown');
      const idleMinutes =
        req.body?.idleMinutes != null ? Number(req.body.idleMinutes) : undefined;

      await supabase.from('audit_logs').insert([
        {
          user_id: typeof userId === 'number' ? userId : null,
          user_name: userName,
          user_role: role || null,
          action: `night_incident_${type}`,
          page: '/',
          details: JSON.stringify({
            idleMinutes,
            details: req.body?.details || null,
            at: new Date().toISOString(),
          }),
          created_at: new Date().toISOString(),
        },
      ]);

      const okToMail = await shouldAlertOnce(supabase, userId, type);
      let emailed = false;
      if (okToMail) {
        emailed = await sendNightIncidentEmail({
          userName,
          userId,
          role,
          type,
          idleMinutes,
          details: req.body?.details,
        });
      }

      return res.json({ ok: true, emailed, deduped: !okToMail });
    } catch (e: any) {
      console.error('[NightIncident]', e?.message || e);
      return res.status(500).json({ ok: false, error: e?.message || 'falha' });
    }
  });
}

/**
 * Cron: quem teve heartbeat nesta vigia e sumiu há ≥ NIGHT_STALE_ALERT_MINUTES.
 */
export async function runNightStaleWatchdog(supabase: SupabaseClient): Promise<{
  checked: number;
  alerted: number;
}> {
  if (!isNightWatchActive()) return { checked: 0, alerted: 0 };

  const nightStart = getActiveNightWatchStart();
  const staleBefore = new Date(Date.now() - NIGHT_STALE_ALERT_MINUTES * 60_000);

  const { data, error } = await supabase
    .from('audit_logs')
    .select('user_id, user_name, user_role, created_at')
    .eq('action', 'night_heartbeat')
    .gte('created_at', nightStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(2000);

  if (error) {
    console.warn('[NightWatchdog] query:', error.message);
    return { checked: 0, alerted: 0 };
  }

  const lastByUser = new Map<
    number,
    { user_name: string; user_role: string | null; created_at: string }
  >();
  for (const row of data || []) {
    const uid = Number(row.user_id);
    if (!Number.isFinite(uid) || lastByUser.has(uid)) continue;
    lastByUser.set(uid, {
      user_name: row.user_name || 'Usuário',
      user_role: row.user_role,
      created_at: row.created_at,
    });
  }

  let alerted = 0;
  for (const [uid, info] of lastByUser) {
    if (isNightWatchExemptRole(info.user_role)) continue;
    const lastAt = new Date(info.created_at);
    if (lastAt >= staleBefore) continue;
    const ok = await shouldAlertOnce(supabase, uid, 'stale_heartbeat');
    if (!ok) continue;
    const idleMinutes = Math.round((Date.now() - lastAt.getTime()) / 60_000);
    const sent = await sendNightIncidentEmail({
      userName: info.user_name,
      userId: uid,
      role: info.user_role || undefined,
      type: 'stale_heartbeat',
      idleMinutes,
      details: { lastHeartbeatAt: info.created_at },
    });
    if (sent) alerted += 1;
  }

  return { checked: lastByUser.size, alerted };
}

export function registerNightWatchdogSchedule(supabase: SupabaseClient): void {
  registerScheduledTick(async () => {
    try {
      const r = await runNightStaleWatchdog(supabase);
      if (r.alerted > 0) {
        console.log(`[NightWatchdog] alertas=${r.alerted} checados=${r.checked}`);
      }
    } catch (e: any) {
      console.error('[NightWatchdog] tick:', e?.message || e);
    }
  });
  console.log('[NightWatchdog] Agendado via /api/cron/minute — alerta stale ≥80 min (1h20).');
}
