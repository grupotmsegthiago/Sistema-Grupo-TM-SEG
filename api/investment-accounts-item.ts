/**
 * PATCH|DELETE /api/investment/accounts/:id — atualiza ou exclui/desativa (serverless leve).
 * Rewrite Vercel: /api/investment/accounts/:id → /api/investment-accounts-item?id=:id
 */
import { assertAsaasApiAccess, extractAuthToken } from '../lib/asaasApiAuth.js';
import {
  deleteOrDeactivateInvestmentAccount,
  updateInvestmentAccount,
} from '../lib/investment/investmentAccountsApi.js';

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
  const method = String(req.method || '').toUpperCase();
  if (method !== 'PATCH' && method !== 'DELETE') {
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
    const id = String(req.query?.id || '').trim();
    if (!id) {
      res.status(400).json({ error: 'ID da conta é obrigatório' });
      return;
    }

    if (method === 'PATCH') {
      const body = parseBody(req.body);
      const row = await updateInvestmentAccount(id, {
        name: String(body.name || ''),
        initial_balance: Number(body.initial_balance),
        bank_name: String(body.bank_name || ''),
      });
      res.status(200).json(row);
      return;
    }

    const result = await deleteOrDeactivateInvestmentAccount(id);
    res.status(200).json(result);
  } catch (e: any) {
    const message = e?.message || 'Falha ao atualizar/excluir conta';
    console.error('[investment/accounts item]', message);
    const status = /obrigatório|inválido|não encontrada/i.test(message) ? 400 : 500;
    res.status(status).json({ error: message });
  }
}

export const config = { maxDuration: 30 };
