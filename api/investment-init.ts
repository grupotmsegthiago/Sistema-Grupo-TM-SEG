import { ensureSnapshotsTable } from '../lib/investment/accountBalanceSnapshots.js';
import {
  denyInvestmentApiUnlessAuthorized,
  investmentApiDeniedStatus,
} from '../lib/investmentApiAuth.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const denied = await denyInvestmentApiUnlessAuthorized(req);
  if (denied) {
    res.status(investmentApiDeniedStatus(denied)).json({ error: denied });
    return;
  }

  try {
    await ensureSnapshotsTable();
    res.status(200).json({ ok: true });
  } catch (e: any) {
    res.status(200).json({ ok: true, note: e?.message || 'init_fail_soft' });
  }
}
