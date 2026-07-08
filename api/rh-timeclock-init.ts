import { ensureTimeClockAndLinkCltUsers } from '../lib/timeclock/ensureTimeClock.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    const result = await ensureTimeClockAndLinkCltUsers();
    if (result.method === 'unavailable') {
      res.status(500).json({
        ok: false,
        error:
          'DATABASE_URL indisponível. Execute migrations/2026_07_08_timeclock_fix_user_id.sql no Supabase SQL Editor.',
      });
      return;
    }
    res.status(200).json({ ok: true, ...result });
  } catch (e: any) {
    console.error('[rh-timeclock-init]', e?.message);
    res.status(500).json({ ok: false, error: e?.message || 'Falha ao preparar ponto CLT' });
  }
}

export const config = { maxDuration: 120 };
