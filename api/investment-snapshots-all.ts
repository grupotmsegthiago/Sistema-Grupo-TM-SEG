import { listAllSnapshots } from '../lib/investment/accountBalanceSnapshots.js';
import {
  denyInvestmentApiUnlessAuthorized,
  investmentApiDeniedStatus,
} from '../lib/investmentApiAuth.js';

export type InvestmentSnapshotsListDeps = {
  authorize?: (req: any) => Promise<string | null>;
  list?: (days: number) => Promise<unknown[]>;
};

export async function handleInvestmentSnapshotsListRequest(
  req: any,
  res: any,
  deps: InvestmentSnapshotsListDeps = {},
) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const denied = await (deps.authorize || denyInvestmentApiUnlessAuthorized)(req);
  if (denied) {
    res.status(investmentApiDeniedStatus(denied)).json({ error: denied });
    return;
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    const days = parseInt(String(req.query?.days || '365'), 10) || 365;
    const rows = await (deps.list || listAllSnapshots)(days);
    res.status(200).json(rows);
  } catch (e: any) {
    const message = e?.message || 'Falha ao listar snapshots de saldo';
    console.error('[investment/snapshots-all]', message);
    const status = /Supabase admin indisponível|service_role/i.test(message) ? 503 : 500;
    res.status(status).json({ error: message });
  }
}

export default async function handler(req: any, res: any) {
  await handleInvestmentSnapshotsListRequest(req, res);
}
