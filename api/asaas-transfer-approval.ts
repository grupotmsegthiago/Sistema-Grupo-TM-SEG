import {
  financeiroWalletIdFromEnv,
  parseAsaasWebhookBody,
  shouldApproveAsaasTransferWebhook,
} from '../lib/asaasTransferApproval.js';
import { isPendingTransferInMemory } from '../lib/asaasPendingTransferMemory.js';

/** Asaas só considera entrega OK com HTTP 200 (docs/fila-pausada). */
function respond(res: any, body: Record<string, unknown>) {
  res.status(200).json(body);
}

function readWebhookToken(req: { headers?: Record<string, string | string[] | undefined> }): string {
  const raw = req.headers?.['asaas-access-token'] ?? req.headers?.['Asaas-Access-Token'];
  if (Array.isArray(raw)) return String(raw[0] || '').trim();
  return String(raw || '').trim();
}

/**
 * Webhook de aprovação de saques/transferências Asaas.
 * Módulo leve — sem Supabase (evita FUNCTION_INVOCATION_FAILED na Vercel).
 */
export default async function handler(req: any, res: any) {
  try {
    if (req.method === 'GET' || req.method === 'HEAD') {
      respond(res, {
        ok: true,
        endpoint: 'asaas-transfer-approval',
        message: 'Webhook ativo — use POST com payload TRANSFER',
      });
      return;
    }

    if (req.method === 'OPTIONS') {
      res.setHeader('Allow', 'GET, HEAD, POST, OPTIONS');
      respond(res, { ok: true });
      return;
    }

    if (req.method !== 'POST') {
      respond(res, { status: 'REFUSED', refuseReason: 'method_not_allowed' });
      return;
    }

    const expectedToken = String(process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN || '').trim();
    const receivedToken = readWebhookToken(req);
    const tokenOk = !expectedToken || receivedToken === expectedToken;

    if (expectedToken && !tokenOk) {
      console.warn('[asaas-transfer-approval] token inválido ou ausente');
      respond(res, { status: 'REFUSED', refuseReason: 'token_invalido' });
      return;
    }

    const body = parseAsaasWebhookBody(req.body);
    const type = String(body.type || '').toUpperCase();

    if (type !== 'TRANSFER') {
      respond(res, {
        status: 'REFUSED',
        refuseReason: `Tipo ${type || 'desconhecido'} não autorizado automaticamente`,
      });
      return;
    }

    const transfer = (body.transfer || {}) as Record<string, any>;
    const financeiroWallet = financeiroWalletIdFromEnv();
    const transferId = String(transfer.id || '').trim();
    const value = Number(transfer.value || 0);

    if (transferId && isPendingTransferInMemory(transferId)) {
      console.log('[asaas-transfer-approval] APPROVED memória', transferId, value);
      respond(res, { status: 'APPROVED' });
      return;
    }

    if (shouldApproveAsaasTransferWebhook(transfer, financeiroWallet)) {
      console.log('[asaas-transfer-approval] APPROVED regras', transferId, value);
      respond(res, { status: 'APPROVED' });
      return;
    }

    /**
     * Payload oficial Asaas (BANK_ACCOUNT + PIX) vem sem chave Pix, descrição
     * nem externalReference. Com token válido, aprovar transferências da conta.
     */
    if (tokenOk && value > 0) {
      console.log('[asaas-transfer-approval] APPROVED token válido (payload mínimo)', transferId, value);
      respond(res, { status: 'APPROVED' });
      return;
    }

    console.warn('[asaas-transfer-approval] REFUSED', {
      id: transferId,
      operationType: transfer.operationType,
      transferType: transfer.type,
      value,
      externalReference: transfer.externalReference,
    });
    respond(res, {
      status: 'REFUSED',
      refuseReason: 'Transferência não corresponde ao repasse financeiro autorizado',
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[asaas-transfer-approval]', message);
    respond(res, { status: 'REFUSED', refuseReason: message || 'erro_interno' });
  }
}

export const config = { maxDuration: 30 };
