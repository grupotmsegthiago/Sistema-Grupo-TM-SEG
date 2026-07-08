import { listAllSnapshots } from '../lib/investment/accountBalanceSnapshots.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    const days = parseInt(String(req.query?.days || '365'), 10) || 365;
    const rows = await listAllSnapshots(days);
    res.status(200).json(rows);
  } catch (e: any) {
    console.error('[investment/snapshots-all]', e?.message);
    res.status(200).json([]);
  }
}
