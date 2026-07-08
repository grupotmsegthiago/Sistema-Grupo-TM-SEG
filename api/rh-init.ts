import { ensureRhTables } from '../lib/rh/ensureRhTables.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    const result = await ensureRhTables();
    res.status(200).json({ ok: true, ...result });
  } catch (e: any) {
    console.error('[rh-init]', e?.message);
    res.status(500).json({ ok: false, error: e?.message || 'Falha ao criar tabelas RH' });
  }
}

export const config = { maxDuration: 120 };
