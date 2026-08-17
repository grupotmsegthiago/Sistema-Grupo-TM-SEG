import { ensureFinancialPaymentTables } from '../lib/financial/ensurePaymentTables.js';
import {
  denyFinancialPaymentsApiUnlessAuthorized,
  financialPaymentsApiDeniedStatus,
} from '../lib/financial/financialPaymentsApiAuth.js';

export type FinancialPaymentsInitDeps = {
  authorize?: (req: any) => Promise<string | null>;
  ensure?: typeof ensureFinancialPaymentTables;
};

/** Init leve da tabela de pagamentos parciais (sem entrada em vercel.json functions). */
export async function handleFinancialPaymentsInitRequest(
  req: any,
  res: any,
  deps: FinancialPaymentsInitDeps = {},
) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const authorize = deps.authorize || denyFinancialPaymentsApiUnlessAuthorized;
  const denied = await authorize(req);
  if (denied) {
    res.status(financialPaymentsApiDeniedStatus(denied)).json({ error: denied });
    return;
  }

  try {
    const ensure = deps.ensure || ensureFinancialPaymentTables;
    const result = await ensure();
    res.status(200).json(result);
  } catch (e: any) {
    res.status(200).json({ ok: false, exists: false, error: e?.message || 'init_fail' });
  }
}

export default async function handler(req: any, res: any) {
  await handleFinancialPaymentsInitRequest(req, res);
}
