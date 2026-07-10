import { ASAAS_PIX_FINANCEIRO_EMAIL } from './asaasPixTransfer.js';

/** Prefixo em externalReference para identificar repasses originados pelo sistema. */
export const ASAAS_TRANSFER_EXTERNAL_REF_PREFIX = 'tmseg-repasse-';

const DEFAULT_FINANCEIRO_WALLET_ID = '6641fec4-8476-48e3-90a8-3db6b14f538c';

export function financeiroWalletIdFromEnv(): string {
  return (
    String(process.env.ASAAS_FINANCEIRO_WALLET_ID || '').trim() || DEFAULT_FINANCEIRO_WALLET_ID
  );
}

export function buildAsaasTransferExternalReference(company: string): string {
  const slug = String(company || 'conta')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '');
  return `${ASAAS_TRANSFER_EXTERNAL_REF_PREFIX}${slug}-${Date.now()}`;
}

export function isTmSegRepasseExternalReference(ref: unknown): boolean {
  return String(ref || '').trim().startsWith(ASAAS_TRANSFER_EXTERNAL_REF_PREFIX);
}

export function parseAsaasWebhookBody(body: unknown): Record<string, any> {
  if (typeof body === 'string') {
    const trimmed = body.trim();
    if (!trimmed) return {};
    try {
      return JSON.parse(trimmed) as Record<string, any>;
    } catch {
      return {};
    }
  }
  return (body as Record<string, any>) || {};
}

function normalizePixKey(transfer: Record<string, any>): string {
  return String(
    transfer.pixAddressKey ||
      transfer.bankAccount?.pixAddressKey ||
      transfer.externalAccount?.addressKey ||
      '',
  )
    .trim()
    .toLowerCase();
}

function normalizeWalletId(transfer: Record<string, any>): string {
  return String(transfer.walletId || transfer.destinationWalletId || '').trim();
}

/**
 * Decide se o webhook de aprovação deve autorizar a transferência.
 * O payload do Asaas frequentemente omite pixAddressKey/description (docs oficiais).
 */
export function shouldApproveAsaasTransferWebhook(
  transfer: Record<string, any>,
  financeiroWallet = financeiroWalletIdFromEnv(),
): boolean {
  const value = Number(transfer.value || 0);
  if (!(value > 0)) return false;

  if (isTmSegRepasseExternalReference(transfer.externalReference)) {
    return true;
  }

  const operationType = String(transfer.operationType || '').toUpperCase();
  const transferType = String(transfer.type || '').toUpperCase();
  const pixKey = normalizePixKey(transfer);
  const walletId = normalizeWalletId(transfer);
  const financeiroEmail = ASAAS_PIX_FINANCEIRO_EMAIL.toLowerCase();

  const destinoOk =
    pixKey === financeiroEmail ||
    String(transfer.description || '').includes('Repasse TM SEG') ||
    (walletId === financeiroWallet &&
      (operationType === 'INTERNAL' || transferType === 'INTERNAL'));

  const isPix =
    operationType === 'PIX' ||
    transferType === 'PIX' ||
    (transferType === 'BANK_ACCOUNT' && (operationType === 'PIX' || !operationType));

  const isInternal = operationType === 'INTERNAL' || transferType === 'INTERNAL';

  return destinoOk && (isPix || isInternal);
}
