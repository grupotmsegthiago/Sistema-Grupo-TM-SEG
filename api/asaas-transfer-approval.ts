import {
  financeiroWalletIdFromEnv,
  parseAsaasWebhookBody,
  shouldApproveAsaasTransferWebhook,
} from '../lib/asaasTransferApproval.js';

/** Asaas só considera entrega OK com HTTP 200 (docs/fila-pausada). */
function respond(res: any, body: Record<string, unknown>) {
  res.status(200).json(body);
}

/**
 * Webhook de aprovação de saques/transferências Asaas.
 * Configure em: Asaas → Integrações → Mecanismos de segurança.
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
    if (expectedToken) {
      const received = String(req.headers?.['asaas-access-token'] || '').trim();
      if (received !== expectedToken) {
        console.warn('[asaas-transfer-approval] token inválido ou ausente');
        respond(res, { status: 'REFUSED', refuseReason: 'token_invalido' });
        return;
      }
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

    if (shouldApproveAsaasTransferWebhook(transfer, financeiroWallet)) {
      console.log('[asaas-transfer-approval] APPROVED', transfer.id, transfer.value);
      respond(res, { status: 'APPROVED' });
      return;
    }

    console.warn('[asaas-transfer-approval] REFUSED', {
      id: transfer.id,
      operationType: transfer.operationType,
      transferType: transfer.type,
      value: transfer.value,
      externalReference: transfer.externalReference,
      pixKey:
        transfer.pixAddressKey ||
        transfer.bankAccount?.pixAddressKey ||
        transfer.externalAccount?.addressKey,
      walletId: transfer.walletId || transfer.destinationWalletId,
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
