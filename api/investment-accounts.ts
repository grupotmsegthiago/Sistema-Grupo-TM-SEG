/**
 * POST /api/investment/accounts — cria conta (serverless leve, sem Express).
 */
import { assertAsaasApiAccess, extractAuthToken } from '../lib/asaasApiAuth.js';
import { createInvestmentAccount } from '../lib/investment/investmentAccountsApi.js';

function parseBody(body: unknown): Record<string, unknown> {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return (body && typeof body === 'object') ? (body as Record<string, unknown>) : {};
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    const token = extractAuthToken(req);
    const denied = await assertAsaasApiAccess(token, req);
    if (denied) {
      res.status(denied === 'Não autorizado' ? 401 : 403).json({ error: denied });
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    const body = parseBody(req.body);
    const row = await createInvestmentAccount({
      name: String(body.name || ''),
      initial_balance: Number(body.initial_balance),
      bank_name: String(body.bank_name || ''),
    });
    res.status(200).json(row);
  } catch (e: any) {
    const message = e?.message || 'Falha ao criar conta';
    console.error('[investment/accounts POST]', message);
    const status = /obrigatório|inválido/i.test(message) ? 400 : 500;
    res.status(status).json({ error: message });
  }
}

export const config = { maxDuration: 30 };
