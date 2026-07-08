import { insertSnapshot } from '../lib/investment/accountBalanceSnapshots.js';

function parseBody(body: unknown): Record<string, any> {
  if (typeof body !== 'string') return (body as Record<string, any>) || {};
  if (!body.trim()) return {};
  return JSON.parse(body);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    const body = parseBody(req.body);
    const account_id = String(body.account_id || '').trim();
    const balance = Number(body.balance);
    if (!account_id || !Number.isFinite(balance)) {
      res.status(400).json({ error: 'account_id e balance são obrigatórios' });
      return;
    }
    const row = await insertSnapshot({
      account_id,
      balance,
      notes: String(body.notes || ''),
      created_by: String(body.created_by || ''),
    });
    res.status(200).json(row);
  } catch (e: any) {
    const message = e?.message || 'Falha ao gravar snapshot de saldo';
    console.error('[investment/snapshots POST]', message);
    res.status(500).json({ error: message });
  }
}
