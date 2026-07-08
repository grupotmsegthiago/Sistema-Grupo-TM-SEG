import { handleTimeclockPunch } from '../server/timeclockPunch.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    await handleTimeclockPunch(req, res);
  } catch (e: any) {
    console.error('[rh-timeclock-punch]', e?.message);
    res.status(500).json({ ok: false, error: e?.message || 'Falha ao registrar ponto' });
  }
}

export const config = { maxDuration: 60 };
