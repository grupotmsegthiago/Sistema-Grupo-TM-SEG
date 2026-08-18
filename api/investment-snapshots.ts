import { insertSnapshot } from '../lib/investment/accountBalanceSnapshots.js';
import {
  denyInvestmentApiUnlessAuthorized,
  investmentApiDeniedStatus,
} from '../lib/investmentApiAuth.js';

function parseBody(body: unknown): Record<string, any> {
  if (typeof body !== 'string') return (body as Record<string, any>) || {};
  if (!body.trim()) return {};
  return JSON.parse(body);
}

export type InvestmentSnapshotsCreateDeps = {
  authorize?: (req: any) => Promise<string | null>;
  create?: (input: {
    account_id: string;
    balance: number;
    notes?: string;
    created_by?: string;
  }) => Promise<unknown>;
};

export async function handleInvestmentSnapshotsCreateRequest(
  req: any,
  res: any,
  deps: InvestmentSnapshotsCreateDeps = {},
) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const denied = await (deps.authorize || denyInvestmentApiUnlessAuthorized)(req);
  if (denied) {
    res.status(investmentApiDeniedStatus(denied)).json({ error: denied });
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
    const row = await (deps.create || insertSnapshot)({
      account_id,
      balance,
      notes: String(body.notes || ''),
      created_by: String(body.created_by || ''),
    });
    res.status(200).json(row);
  } catch (e: any) {
    const message = e?.message || 'Falha ao gravar snapshot de saldo';
    console.error('[investment/snapshots POST]', message);
    const status = /Supabase admin indisponível|service_role/i.test(message) ? 503 : 500;
    res.status(status).json({ error: message });
  }
}

export default async function handler(req: any, res: any) {
  await handleInvestmentSnapshotsCreateRequest(req, res);
}
