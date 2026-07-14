import { ASAAS_PIX_FINANCEIRO_EMAIL } from '../lib/asaasPixTransfer.js';
import {
  buildAsaasTransferWebhookPublicUrl,
  extractAsaasTransferWebhookPayload,
  financeiroWalletIdFromEnv,
  listConfiguredAsaasTransferWebhookTokens,
  matchAsaasTransferWebhookToken,
  parseAsaasWebhookBody,
  readAsaasWebhookAccessToken,
  shouldApproveAsaasTransferWebhook,
} from '../lib/asaasTransferApproval.js';
import { isPendingTransferInMemory } from '../lib/asaasPendingTransferMemory.js';
import { fingerprintAsaasKey } from '../lib/asaasEnvKeys.js';

/** Asaas só considera entrega OK com HTTP 200 (docs/fila-pausada). */
function respond(res: any, body: Record<string, unknown>) {
  res.status(200).json(body);
}

function webhookTokenDiagnostics(req: { headers?: Record<string, string | string[] | undefined> }) {
  const receivedToken = readAsaasWebhookAccessToken(req);
  const match = matchAsaasTransferWebhookToken(receivedToken);
  const configured = listConfiguredAsaasTransferWebhookTokens();
  return {
    receivedToken,
    tokenOk: match.ok,
    matchedEnv: match.matchedEnv,
    configuredCount: match.configuredCount,
    openMode: match.openMode,
    configuredEnvs: configured.map((c) => c.envName),
    /** Compat: primeiro token configurado (diagnóstico legado). */
    expectedToken: configured[0]?.token || '',
  };
}

function logWebhookPost(
  req: { headers?: Record<string, string | string[] | undefined> },
  body: Record<string, any>,
  payload: ReturnType<typeof extractAsaasTransferWebhookPayload>,
) {
  const diag = webhookTokenDiagnostics(req);
  console.log('[asaas-transfer-approval] POST', {
    event: payload.event,
    type: payload.type,
    id: payload.transfer.id,
    operationType: payload.transfer.operationType,
    value: payload.transfer.value,
    externalReference: payload.transfer.externalReference,
    bodyKeys: Object.keys(body).slice(0, 25),
    tokenHeaders: {
      'asaas-access-token': Boolean(req.headers?.['asaas-access-token']),
      'Asaas-Access-Token': Boolean(req.headers?.['Asaas-Access-Token']),
    },
    receivedTokenLen: diag.receivedToken.length,
    webhookTokensConfigured: diag.configuredCount,
    webhookTokenMatchedEnv: diag.matchedEnv,
    webhookOpenMode: diag.openMode,
    isNotificationOnly: payload.isNotificationOnly,
    isAuthorizationRequest: payload.isAuthorizationRequest,
  });
}

async function handleAdminDiagnosticGet(req: any, res: any): Promise<boolean> {
  const hasAuth =
    Boolean(req.headers?.authorization || req.headers?.Authorization) ||
    Boolean(req.headers?.['x-auth-token']);

  if (!hasAuth) return false;

  const { extractAuthToken, assertAsaasApiAccess } = await import('../lib/asaasApiAuth.js');
  const token = extractAuthToken(req);
  const denied = await assertAsaasApiAccess(token, req);
  if (denied) {
    res.status(denied === 'Não autorizado' ? 401 : 403).json({ ok: false, error: denied });
    return true;
  }

  const diag = webhookTokenDiagnostics(req);
  const configured = listConfiguredAsaasTransferWebhookTokens();
  const { summarizeAsaasTransferEnv } = await import('../lib/asaasEnvKeys.js');
  res.status(200).json({
    ok: true,
    endpoint: 'asaas-transfer-approval',
    mode: 'admin-diagnostic',
    webhookUrl: buildAsaasTransferWebhookPublicUrl(req),
    tokenConfigured: diag.configuredCount > 0,
    webhookTokens: configured.map((c) => ({
      envName: c.envName,
      length: c.token.length,
      fingerprint: fingerprintAsaasKey(c.token),
    })),
    authorizedPixKey: ASAAS_PIX_FINANCEIRO_EMAIL,
    financeiroWalletId: financeiroWalletIdFromEnv(),
    externalReferencePrefix: 'tmseg-repasse-',
    asaasEnv: await summarizeAsaasTransferEnv(true),
    hint:
      'Uma URL de webhook para as 3 contas. Tokens: ASAAS_WEBHOOK_TMGESTAO_API, ASAAS_WEBHOOK_TMSEGURANCA_API, ASAAS_WEBHOOK_TMSECURITY_API. Chaves API: Asaas_TMSEGESTÃO_API, ASAAS_TMSEGURANCA_API, ASAAS_TMSECURITY_API. Após salvar, faça redeploy.',
  });
  return true;
}

/**
 * Webhook de aprovação de saques/transferências Asaas.
 * Rota pública — sem auth de sessão/JWT no POST. Módulo leve, sem Supabase no POST.
 * Aceita authToken distinto por conta (Gestão / Segurança / Security).
 */
export default async function handler(req: any, res: any) {
  try {
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (req.method === 'GET' && (await handleAdminDiagnosticGet(req, res))) {
        return;
      }
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

    const body = parseAsaasWebhookBody(req.body);
    const payload = extractAsaasTransferWebhookPayload(body);
    logWebhookPost(req, body, payload);

    if (payload.isNotificationOnly || !payload.isAuthorizationRequest) {
      console.log('[asaas-transfer-approval] APPROVED ignorado (notificação)', payload.event || payload.type);
      respond(res, { status: 'APPROVED' });
      return;
    }

    const transfer = payload.transfer;
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
     * Payload oficial de autorização Asaas omite externalReference, descrição e chave Pix.
     * Neste endpoint (cadastrado só para aprovação de transferências), aprovar qualquer
     * solicitação de autorização com valor > 0 — mesmo comportamento do sistema Replit.
     */
    if (value > 0) {
      console.log('[asaas-transfer-approval] APPROVED autorização Asaas (payload mínimo)', transferId, value);
      respond(res, { status: 'APPROVED' });
      return;
    }

    const diag = webhookTokenDiagnostics(req);

    if (!diag.tokenOk) {
      console.warn('[asaas-transfer-approval] token inválido ou ausente', {
        receivedTokenLen: diag.receivedToken.length,
        configuredCount: diag.configuredCount,
        configuredEnvs: diag.configuredEnvs,
      });
      respond(res, { status: 'REFUSED', refuseReason: 'token_invalido' });
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
