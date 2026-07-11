import { assertAsaasApiAccess, extractAuthToken } from '../lib/asaasApiAuth.js';
import { getAllBalancesCore } from '../lib/asaasBalancesCore.js';

/** Saldos Asaas (TM Gestão, TM Seg, TM Security) — rota leve sem cold start do Express. */
export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ ok: false, error: 'method_not_allowed' });
      return;
    }

    const token = extractAuthToken(req);
    const denied = await assertAsaasApiAccess(token, req);
    if (denied) {
      res.status(denied === 'Não autorizado' ? 401 : 403).json({ ok: false, error: denied });
      return;
    }

    res.setHeader('Cache-Control', 'no-store');

    const balances = await getAllBalancesCore();
    res.status(200).json({ success: true, balances });
  } catch (e: any) {
    console.error('[asaas-balances]', e?.message || e);
    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        error: e?.message || 'Falha ao consultar saldos Asaas',
      });
    }
  }
}

export const config = { maxDuration: 60 };
