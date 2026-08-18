import { deleteSnapshot } from '../lib/investment/accountBalanceSnapshots.js';
import {
  denyInvestmentApiUnlessAuthorized,
  investmentApiDeniedStatus,
} from '../lib/investmentApiAuth.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'DELETE') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const denied = await denyInvestmentApiUnlessAuthorized(req);
  if (denied) {
    res.status(investmentApiDeniedStatus(denied)).json({ error: denied });
    return;
  }

  try {
    const id = parseInt(String(req.query?.id || ''), 10);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'id inválido' });
      return;
    }
    await deleteSnapshot(id);
    res.status(200).json({ ok: true });
  } catch (e: any) {
    const message = e?.message || 'erro';
    console.error('[investment/snapshots DELETE]', message);
    const status = /Supabase admin indisponível|service_role/i.test(message) ? 503 : 500;
    res.status(status).json({ error: message });
  }
}
