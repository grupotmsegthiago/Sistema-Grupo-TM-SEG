import { ASAAS_PIX_FINANCEIRO_EMAIL } from './asaasPixTransfer.js';

/** Prefixo em externalReference para identificar repasses originados pelo sistema. */
export const ASAAS_TRANSFER_EXTERNAL_REF_PREFIX = 'tmseg-repasse-';

/**
 * Eventos de notificação Asaas — não exigem APPROVED/REFUSED de autorização.
 * Responder APPROVED evita pausa da fila de webhooks no painel.
 */
export const ASAAS_TRANSFER_NOTIFICATION_EVENTS = new Set([
  'TRANSFER_DONE',
  'TRANSFER_FAILED',
  'TRANSFER_CREATED',
  'TRANSFER_PENDING',
  'TRANSFER_IN_BANK_PROCESSING',
  'TRANSFER_BANK_PROCESSING',
  'TRANSFER_CANCELLED',
  'TRANSFER_CANCELED',
]);

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

/** Remove prefixo Bearer e espaços do token do webhook Asaas. */
export function normalizeAsaasWebhookToken(raw: unknown): string {
  return String(raw || '')
    .replace(/^Bearer\s+/i, '')
    .trim();
}

/**
 * Tokens de autenticação do webhook de aprovação — um por conta Asaas (ou compartilhado).
 * A URL do webhook é a mesma; cada painel Asaas pode ter authToken diferente.
 *
 * Nomes oficiais (Vercel):
 * - ASAAS_WEBHOOK_TMGESTAO_API
 * - ASAAS_WEBHOOK_TMSEGURANCA_API
 * - ASAAS_WEBHOOK_TMSECURITY_API
 * Opcional compartilhado: ASAAS_TRANSFER_WEBHOOK_TOKEN
 */
export const ASAAS_TRANSFER_WEBHOOK_TOKEN_ENV_NAMES = [
  'ASAAS_WEBHOOK_TMGESTAO_API',
  'ASAAS_WEBHOOK_TMSEGURANCA_API',
  'ASAAS_WEBHOOK_TMSECURITY_API',
  'ASAAS_WEBHOOK_TMGESTAO',
  'ASAAS_WEBHOOK_TMSEGURANCA',
  'ASAAS_WEBHOOK_TMSECURITY',
  'ASAAS_TRANSFER_WEBHOOK_TOKEN',
  'ASAAS_TRANSFER_WEBHOOK_TOKEN_TMGESTAO',
  'ASAAS_TRANSFER_WEBHOOK_TOKEN_TMSEGURANCA',
  'ASAAS_TRANSFER_WEBHOOK_TOKEN_TMSECURITY',
  // alias se o token da Security foi salvo com prefixo ZAPI por engano
  'ZAPI_WEBHOOK_TMSECURITY_API',
] as const;

export type AsaasWebhookTokenEntry = {
  envName: string;
  token: string;
};

export function listConfiguredAsaasTransferWebhookTokens(): AsaasWebhookTokenEntry[] {
  const seen = new Set<string>();
  const out: AsaasWebhookTokenEntry[] = [];
  for (const envName of ASAAS_TRANSFER_WEBHOOK_TOKEN_ENV_NAMES) {
    const token = normalizeAsaasWebhookToken(process.env[envName]);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push({ envName, token });
  }
  return out;
}

export function matchAsaasTransferWebhookToken(receivedRaw: unknown): {
  ok: boolean;
  received: string;
  matchedEnv: string | null;
  configuredCount: number;
  /** true se nenhuma env de token está preenchida (aceita qualquer chamada). */
  openMode: boolean;
} {
  const received = normalizeAsaasWebhookToken(receivedRaw);
  const configured = listConfiguredAsaasTransferWebhookTokens();
  if (configured.length === 0) {
    return {
      ok: true,
      received,
      matchedEnv: null,
      configuredCount: 0,
      openMode: true,
    };
  }
  const hit = configured.find((c) => c.token === received);
  return {
    ok: Boolean(hit),
    received,
    matchedEnv: hit?.envName || null,
    configuredCount: configured.length,
    openMode: false,
  };
}

export function readAsaasWebhookAccessToken(req: {
  headers?: Record<string, string | string[] | undefined>;
}): string {
  const raw = req.headers?.['asaas-access-token'] ?? req.headers?.['Asaas-Access-Token'];
  if (Array.isArray(raw)) return normalizeAsaasWebhookToken(raw[0]);
  return normalizeAsaasWebhookToken(raw);
}

export type AsaasTransferWebhookPayload = {
  event: string;
  type: string;
  transfer: Record<string, any>;
  isNotificationOnly: boolean;
  isAuthorizationRequest: boolean;
};

/**
 * Extrai transferência do payload Asaas em múltiplos formatos:
 * { type, transfer }, { event, transfer }, { event, data }, ou campos na raiz.
 */
export function extractAsaasTransferWebhookPayload(
  root: Record<string, any>,
): AsaasTransferWebhookPayload {
  const event = String(root.event || '').trim();
  const type = String(root.type || '').trim();
  const label = (event || type).toUpperCase();

  let transfer: Record<string, any> = {};

  if (root.transfer && typeof root.transfer === 'object' && !Array.isArray(root.transfer)) {
    transfer = { ...root.transfer };
  } else if (root.data && typeof root.data === 'object' && !Array.isArray(root.data)) {
    const data = root.data as Record<string, any>;
    if (data.transfer && typeof data.transfer === 'object' && !Array.isArray(data.transfer)) {
      transfer = { ...data.transfer };
    } else {
      transfer = { ...data };
    }
  } else if (
    root.id ||
    root.value != null ||
    root.pixAddressKey ||
    root.operationType ||
    root.externalReference
  ) {
    transfer = { ...root };
  }

  if (!transfer.id && root.id) transfer.id = root.id;
  if (transfer.value == null && root.value != null) transfer.value = root.value;
  if (!transfer.operationType && root.operationType) transfer.operationType = root.operationType;
  if (!transfer.externalReference && root.externalReference) {
    transfer.externalReference = root.externalReference;
  }

  const isNotificationOnly = ASAAS_TRANSFER_NOTIFICATION_EVENTS.has(label);
  const isAuthorizationRequest =
    !isNotificationOnly &&
    (label === 'TRANSFER' ||
      Boolean(
        transfer.id ||
          transfer.value != null ||
          transfer.pixAddressKey ||
          transfer.operationType ||
          transfer.externalReference,
      ));

  return { event, type, transfer, isNotificationOnly, isAuthorizationRequest };
}

export function buildAsaasTransferWebhookPublicUrl(req: {
  headers?: Record<string, string | string[] | undefined>;
}): string {
  const proto = String(req.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(
    req.headers?.['x-forwarded-host'] || req.headers?.host || 'sistema.grupotmseg.com.br',
  )
    .split(',')[0]
    .trim();
  return `${proto}://${host}/api/asaas/transfer-approval`;
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
