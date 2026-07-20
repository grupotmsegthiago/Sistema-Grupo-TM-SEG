import { ensureFinancialPaymentTables } from '../lib/financial/ensurePaymentTables.js';

/** Init leve da tabela de pagamentos parciais (sem entrada em vercel.json functions). */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    const result = await ensureFinancialPaymentTables();
    res.status(200).json(result);
  } catch (e: any) {
    res.status(200).json({ ok: false, exists: false, error: e?.message || 'init_fail' });
  }
}
