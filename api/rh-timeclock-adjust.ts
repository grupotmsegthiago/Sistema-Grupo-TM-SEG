import { handleTimeclockAdjust } from '../server/timeclockAdjust.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    await handleTimeclockAdjust(req, res);
  } catch (e: any) {
    console.error('[rh-timeclock-adjust]', e?.message);
    res.status(500).json({ ok: false, error: e?.message || 'Falha ao ajustar ponto' });
  }
}

export const config = { maxDuration: 60 };
