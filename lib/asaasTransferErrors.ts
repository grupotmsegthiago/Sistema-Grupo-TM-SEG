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
  const marker = '. Pix:';
  const idx = msg.indexOf(marker);
  if (!msg.startsWith('Repasse interno:') || idx < 0) return {};
  return {
    internal: msg.slice('Repasse interno:'.length, idx).trim(),
    pix: msg.slice(idx + marker.length).trim(),
  };
}

function withdrawalDeniedMessage(): string {
  return (
    'A chave API desta conta na Vercel não consegue transferir (o saldo até aparece, mas o saque via API é recusado). ' +
    'Copie para a Vercel as mesmas chaves de produção do Replit/Asaas e faça redeploy: ' +
    'ASAAS_TMGESTAO_API (ou TMGESTAO), ASAAS_TMSEGURANCA_API (ou TMSEGURANCA), ASAAS_TMSECURITY_API (ou TMSECURITY), ' +
    'ASAAS_FINANCEIRO_WALLET_ID e ASAAS_TRANSFER_WEBHOOK_TOKEN. ' +
    'No painel Asaas de cada conta, a chave precisa ter permissão de saque/transferência via API. ' +
    'Chaves vazias, antigas ou sem permissão de saque causam exatamente esse erro.'
  );
}

function accountsNotLinkedMessage(): string {
  return (
    'Repasse interno entre contas Asaas falhou: as subcontas ainda não estão vinculadas (wallet financeiro). ' +
    'No Replit isso costuma funcionar com o mesmo ASAAS_FINANCEIRO_WALLET_ID — confira se esse ID na Vercel é igual ao do Replit. ' +
    'O sistema tentará Pix em seguida; se a chave Pix de destino não estiver cadastrada no painel, cadastre ' +
    `${ASAAS_PIX_FINANCEIRO_EMAIL} em Transferências → Cadastrar nova conta.`
  );
}

export function formatAsaasTransferError(raw: string): string {
  const msg = String(raw || '').trim();
  if (!msg) return 'Falha na transferência Pix. Tente novamente.';

  const combined = splitCombinedTransferErrors(msg);
  const internal = combined.internal || '';
  const pix = combined.pix || '';

  if (PIX_DEST_NOT_REGISTERED.test(pix || internal || msg)) {
    return (
      `A chave Pix de destino (${ASAAS_PIX_FINANCEIRO_EMAIL}) precisa ser cadastrada uma vez no painel Asaas ` +
      'da conta de origem, em Transferências → Cadastrar nova conta, antes de aceitar transferências via API ' +
      'para esse destino. Depois de salvar, tente o repasse novamente.'
    );
  }

  if (internal && ACCOUNTS_NOT_LINKED.test(internal) && pix && WITHDRAWAL_DENIED.test(pix)) {
    return `${accountsNotLinkedMessage()} Em seguida: ${withdrawalDeniedMessage()}`;
  }

  if (ACCOUNTS_NOT_LINKED.test(internal || msg) && !WITHDRAWAL_DENIED.test(pix || msg)) {
    return accountsNotLinkedMessage();
  }

  if (WITHDRAWAL_DENIED.test(pix || msg)) {
    return withdrawalDeniedMessage();
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
      'URL: https://sistema.grupotmseg.com.br/api/asaas/transfer-approval'
    );
  }

  if (msg.startsWith('Asaas:')) return msg;
  return `Asaas: ${msg}`;
}
