import { ASAAS_PIX_FINANCEIRO_EMAIL } from '../lib/asaasPixTransfer.js';

const DEFAULT_FINANCEIRO_WALLET_ID = '6641fec4-8476-48e3-90a8-3db6b14f538c';

function financeiroWalletId(): string {
  return (
    String(process.env.ASAAS_FINANCEIRO_WALLET_ID || '').trim() || DEFAULT_FINANCEIRO_WALLET_ID
  );
}

/**
 * Webhook de aprovação de saques/transferências Asaas.
 * Configure em: Asaas → Integrações → Mecanismos de segurança → URL deste endpoint.
 * Opcional: ASAAS_TRANSFER_WEBHOOK_TOKEN no header asaas-access-token.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ status: 'REFUSED', refuseReason: 'method_not_allowed' });
    return;
  }

  const expectedToken = String(process.env.ASAAS_TRANSFER_WEBHOOK_TOKEN || '').trim();
  if (expectedToken) {
    const received = String(req.headers?.['asaas-access-token'] || '').trim();
    if (received !== expectedToken) {
      res.status(401).json({ status: 'REFUSED', refuseReason: 'token_invalido' });
      return;
    }
  }

  try {
    const body = req.body || {};
    const type = String(body.type || '').toUpperCase();

    if (type !== 'TRANSFER') {
      res.status(200).json({
        status: 'REFUSED',
        refuseReason: `Tipo ${type || 'desconhecido'} não autorizado automaticamente`,
      });
      return;
    }

    const transfer = body.transfer || {};
    const operationType = String(transfer.operationType || '').toUpperCase();
    const value = Number(transfer.value || 0);
    const pixKey = String(
      transfer.pixAddressKey ||
        transfer.bankAccount?.pixAddressKey ||
        '',
    )
      .trim()
      .toLowerCase();
    const walletId = String(transfer.walletId || transfer.destinationWalletId || '').trim();
    const financeiroWallet = financeiroWalletId();
    const destinoOk =
      pixKey === ASAAS_PIX_FINANCEIRO_EMAIL.toLowerCase() ||
      String(transfer.description || '').includes('Repasse TM SEG') ||
      (operationType === 'INTERNAL' && walletId === financeiroWallet);

    if (
      value > 0 &&
      destinoOk &&
      (operationType === 'PIX' || operationType === 'INTERNAL' || transfer.type === 'INTERNAL')
    ) {
      console.log('[asaas-transfer-approval] APPROVED', transfer.id, value);
      res.status(200).json({ status: 'APPROVED' });
      return;
    }

    console.warn('[asaas-transfer-approval] REFUSED', {
      id: transfer.id,
      operationType,
      value,
      pixKey,
    });
    res.status(200).json({
      status: 'REFUSED',
      refuseReason: 'Transferência não corresponde ao repasse financeiro autorizado',
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[asaas-transfer-approval]', message);
    res.status(200).json({ status: 'REFUSED', refuseReason: message || 'erro_interno' });
  }
}

export const config = { maxDuration: 30 };
