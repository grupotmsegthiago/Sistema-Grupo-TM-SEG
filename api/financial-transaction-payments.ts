/**
 * Handler leve — pagamentos parciais de títulos.
 * GET/POST/DELETE /api/financial-transaction-payments
 * Sem entrada em vercel.json functions{} (limite 50).
 */
import { createSupabaseAdminClient } from '../lib/supabaseAdmin.js';
import {
  denyFinancialPaymentsApiUnlessAuthorized,
  financialPaymentsApiDeniedStatus,
} from '../lib/financial/financialPaymentsApiAuth.js';
import { createReceivablePaymentsOps } from '../lib/financial/receivablePaymentsApiCore.js';

type PaymentsOps = ReturnType<typeof createReceivablePaymentsOps>;

export type FinancialPaymentsHandlerDeps = {
  authorize?: (req: any) => Promise<string | null>;
  createOps?: () => PaymentsOps | null;
};

function parseBody(body: unknown): Record<string, any> {
  if (typeof body !== 'string') return (body as Record<string, any>) || {};
  if (!body.trim()) return {};
  return JSON.parse(body);
}

function queryValue(req: any, key: string): string {
  const raw = req?.query?.[key];
  if (Array.isArray(raw)) return String(raw[0] || '').trim();
  return String(raw || '').trim();
}

export async function handleFinancialTransactionPaymentsRequest(
  req: any,
  res: any,
  deps: FinancialPaymentsHandlerDeps = {},
) {
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'GET, POST, DELETE');
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
    const ops = deps.createOps
      ? deps.createOps()
      : (() => {
          const sb = createSupabaseAdminClient();
          return sb ? createReceivablePaymentsOps(sb) : null;
        })();
    if (!ops) {
      res.status(503).json({ error: 'Supabase admin indisponível' });
      return;
    }

    if (req.method === 'GET') {
      const transactionId = queryValue(req, 'transactionId');
      if (!transactionId) {
        res.status(400).json({ error: 'transactionId é obrigatório' });
        return;
      }
      const titleNotes = queryValue(req, 'titleNotes') || null;
      const payments = await ops.listPaymentsForTransaction(transactionId, titleNotes);
      res.status(200).json({ ok: true, payments });
      return;
    }

    if (req.method === 'POST') {
      const body = parseBody(req.body);
      const transactionId = String(body.transactionId || '').trim();
      const amount = Number(body.amount);
      const paymentDate = String(body.paymentDate || '').trim();
      if (!transactionId || !paymentDate || !Number.isFinite(amount) || amount <= 0) {
        res.status(400).json({ error: 'transactionId, amount e paymentDate são obrigatórios' });
        return;
      }
      const result = await ops.addPaymentToTransaction({
        transactionId,
        titleAmount: Number(body.titleAmount || 0),
        titleNotes: body.titleNotes ?? null,
        amount,
        paymentDate,
        notes: body.notes || '',
        createdBy: body.createdBy || '',
        previousStatus: body.previousStatus || null,
      });
      res.status(200).json({ ok: true, ...result });
      return;
    }

    const body = parseBody(req.body);
    const paymentId = queryValue(req, 'id') || String(body.paymentId || body.id || '').trim();
    const transactionId = queryValue(req, 'transactionId') || String(body.transactionId || '').trim();
    if (!paymentId || !transactionId) {
      res.status(400).json({ error: 'id e transactionId são obrigatórios' });
      return;
    }
    const result = await ops.deletePaymentFromTransaction({
      paymentId,
      transactionId,
      titleAmount: Number(body.titleAmount ?? queryValue(req, 'titleAmount') ?? 0),
      titleNotes: body.titleNotes ?? queryValue(req, 'titleNotes') ?? null,
      createdBy: body.createdBy || '',
    });
    res.status(200).json({ ok: true, ...result });
  } catch (e: any) {
    const message = e?.message || 'Falha ao operar pagamentos do título';
    const missing = /foreign key|violates|not found|PGRST116/i.test(message);
    console.error('[financial-transaction-payments]', message);
    res.status(missing ? 404 : 500).json({ error: message });
  }
}

export default async function handler(req: any, res: any) {
  await handleFinancialTransactionPaymentsRequest(req, res);
}
