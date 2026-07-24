/** Mensagens amigáveis para erros comuns da API Asaas em transferências Pix. */

import { ASAAS_PIX_FINANCEIRO_EMAIL } from './asaasPixTransfer.js';

const WITHDRAWAL_DENIED =
  /não possui permissão.*saque|sem permissão.*saque|permissão.*saque.*api|withdrawal.*permission|invalid_action/i;

/** Chave/conta Pix de destino ainda não cadastrada no painel Asaas. */
const PIX_DEST_NOT_REGISTERED =
  /chave.*pix.*(não|nao).*(cadastr|encontr|registr|válid|valid)|conta.*(não|nao).*(cadastr|encontr|registr)|destino.*(não|nao).*cadastr|cadastr.*nova conta|conta bancária.*(não|nao).*cadastr|informe uma conta cadastrada|benefici[aá]rio.*(não|nao).*cadastr|pix.*key.*not.*found|transfer.*account.*not.*registered/i;

const CRITICAL_AUTH =
  /autorização crítica|critical.*authorization|token.*sms|token.*app/i;

const IP_NOT_ALLOWED = /ip.*não.*segur|ip.*not.*allowed|whitelist/i;

const DUPLICATE_TRANSFER = /409|conflict|duplicad|15 minutos/i;

const ACCOUNTS_NOT_LINKED = /sem vínculo|sem vinculo|not linked/i;

const CANCELLED_BY_WEBHOOK =
  /cancelad|recusad|falhou|failed|não foi autoriz|nao foi autoriz|webhook/i;

type CombinedTransferErrors = {
  internal?: string;
  pix?: string;
};

function splitCombinedTransferErrors(msg: string): CombinedTransferErrors {
  const marker = '. Pix: ';
  const idx = msg.indexOf(marker);
  if (!msg.startsWith('Repasse interno:') || idx < 0) return {};
  return {
    internal: msg.slice('Repasse interno:'.length, idx).trim(),
    pix: msg.slice(idx + marker.length).trim(),
  };
}

function withdrawalDeniedMessage(companyHint?: string): string {
  const company = String(companyHint || '').trim();
  const isSeguranca = /SEGURAN/i.test(company);
  const keyEnv = isSeguranca
    ? 'ASAAS_TMSEGURANCA_API (ou TMSEGURANCA)'
    : /SECURITY/i.test(company)
      ? 'ASAAS_TMSECURITY_API'
      : 'ASAAS_TMGESTAO_API (ou Asaas_TMSEGESTÃO_API)';
  const webhookEnv = isSeguranca
    ? 'ASAAS_WEBHOOK_TMSEGURANCA_API'
    : /SECURITY/i.test(company)
      ? 'ASAAS_WEBHOOK_TMSECURITY_API'
      : 'ASAAS_WEBHOOK_TMGESTAO_API';
  const conta = company || 'TM Gestão / TM Segurança / TM Security';

  return (
    `O Asaas recusou o saque via API na conta ${conta} (o saldo aparece, mas a chave não tem permissão de transferência). ` +
    'Isso costuma acontecer na TM Segurança quando a chave foi gerada antes do mecanismo de saque. ' +
    `Na conta Asaas ${isSeguranca ? 'TM Segurança' : 'de origem'}: ` +
    '1) Integrações → Mecanismos de segurança → webhook de aprovação com a URL ' +
    'https://sistema.grupotmseg.com.br/api/asaas/transfer-approval e um authToken; ' +
    `2) grave o authToken na Vercel em ${webhookEnv}; ` +
    `3) Integrações → Chaves de API → gere uma NOVA chave, cole em ${keyEnv} e faça redeploy. ` +
    'A chave antiga continua bloqueada mesmo com saldo liberado.'
  );
}

function accountsNotLinkedMessage(): string {
  return (
    'Repasse interno entre contas Asaas falhou: as subcontas ainda não estão vinculadas (wallet financeiro). ' +
    'O sistema tenta Pix em seguida; se a chave Pix de destino não estiver cadastrada no painel, cadastre ' +
    `${ASAAS_PIX_FINANCEIRO_EMAIL} em Transferências → Cadastrar nova conta.`
  );
}

export function formatAsaasTransferError(raw: string, companyHint?: string): string {
  const msg = String(raw || '').trim();
  if (!msg) return 'Falha na transferência Pix. Tente novamente.';

  const combined = splitCombinedTransferErrors(msg);
  const internal = combined.internal || '';
  const pix = combined.pix || '';
  // Se a mensagem citar a empresa, preferir esse hint no texto final.
  const inferredCompany =
    companyHint ||
    (msg.match(/TM\s*SEGURAN[ÇC]A|TM\s*SECURITY|TM\s*GEST[AÃ]O/i)?.[0] ?? undefined);

  if (PIX_DEST_NOT_REGISTERED.test(pix || internal || msg)) {
    return (
      `A chave Pix de destino (${ASAAS_PIX_FINANCEIRO_EMAIL}) precisa ser cadastrada uma vez no painel Asaas ` +
      'da conta de origem, em Transferências → Cadastrar nova conta, antes de aceitar transferências via API ' +
      'para esse destino. Depois de salvar, tente o repasse novamente.'
    );
  }

  if (internal && ACCOUNTS_NOT_LINKED.test(internal) && pix && WITHDRAWAL_DENIED.test(pix)) {
    return `${accountsNotLinkedMessage()} Em seguida: ${withdrawalDeniedMessage(inferredCompany)}`;
  }

  if (ACCOUNTS_NOT_LINKED.test(internal || msg) && !WITHDRAWAL_DENIED.test(pix || msg)) {
    return accountsNotLinkedMessage();
  }

  if (WITHDRAWAL_DENIED.test(pix || msg) || /insufficient_permission/i.test(msg)) {
    return withdrawalDeniedMessage(inferredCompany);
  }

  if (DUPLICATE_TRANSFER.test(msg)) {
    return (
      'Já existe transferência idêntica nos últimos 15 minutos nesta conta Asaas. ' +
      'Aguarde a conclusão ou altere o valor antes de tentar novamente.'
    );
  }

  if (CRITICAL_AUTH.test(msg)) {
    return (
      'Conta Asaas com autorização crítica ativa: transferências via API exigem token SMS/App, ' +
      'IP fixo cadastrado ou webhook de aprovação. Configure em Integrações → Mecanismos de segurança.'
    );
  }

  if (IP_NOT_ALLOWED.test(msg)) {
    return (
      'IP do servidor não está na whitelist do Asaas. Cadastre os IPs de saída da Vercel ' +
      'em Integrações → IPs autorizados (ou use webhook de aprovação de transferências).'
    );
  }

  if (CANCELLED_BY_WEBHOOK.test(internal || msg) && !WITHDRAWAL_DENIED.test(pix || msg)) {
    return (
      'A transferência foi criada no Asaas, mas o webhook de aprovação recusou ou não respondeu a tempo. ' +
      'Verifique em Integrações → Webhooks se a fila está ativa e a URL está correta. ' +
      'URL (igual nas 3 contas): https://sistema.grupotmseg.com.br/api/asaas/transfer-approval. ' +
      'Tokens na Vercel: ASAAS_WEBHOOK_TMGESTAO_API, ASAAS_WEBHOOK_TMSEGURANCA_API, ASAAS_WEBHOOK_TMSECURITY_API.'
    );
  }

  if (msg.startsWith('Asaas:')) return msg;
  return `Asaas: ${msg}`;
}
