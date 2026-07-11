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

export function formatAsaasTransferError(raw: string): string {
  const msg = String(raw || '').trim();
  if (!msg) return 'Falha na transferência Pix. Tente novamente.';

  if (PIX_DEST_NOT_REGISTERED.test(msg)) {
    return (
      `A chave Pix de destino (${ASAAS_PIX_FINANCEIRO_EMAIL}) precisa ser cadastrada uma vez no painel Asaas ` +
      'da conta de origem, em Transferências → Cadastrar nova conta, antes de aceitar transferências via API ' +
      'para esse destino. Depois de salvar, tente o repasse novamente.'
    );
  }

  if (WITHDRAWAL_DENIED.test(msg)) {
    return (
      'Esta conta Asaas ainda não tem liberação de saque/transferência via API. ' +
      'No painel da conta (TM Gestão, TM Seg ou TM Security): Integrações → Mecanismos de segurança — ' +
      'habilite transferência via API e escolha o webhook de autorização como mecanismo de segurança ' +
      '(URL já configurada: https://sistema.grupotmseg.com.br/api/asaas/transfer-approval). ' +
      'Se a opção não aparecer ou continuar recusando, abra chamado com o gerente de contas Asaas pedindo ' +
      'liberação de saque/transferência via API. Após liberar, regenere a chave API se o Asaas solicitar.'
    );
  }

  if (ACCOUNTS_NOT_LINKED.test(msg) && !WITHDRAWAL_DENIED.test(msg)) {
    return (
      'As contas Asaas ainda não estão vinculadas para repasse interno. O sistema tentará Pix para ' +
      `${ASAAS_PIX_FINANCEIRO_EMAIL}. Se o erro persistir, peça ao Asaas o vínculo entre as subcontas ` +
      'ou a liberação de transferência via API.'
    );
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

  if (CANCELLED_BY_WEBHOOK.test(msg) && !WITHDRAWAL_DENIED.test(msg)) {
    return (
      'A transferência foi criada no Asaas, mas o webhook de aprovação recusou ou não respondeu a tempo. ' +
      'Verifique em Integrações → Webhooks se a fila está ativa e a URL está correta. ' +
      'URL: https://sistema.grupotmseg.com.br/api/asaas/transfer-approval'
    );
  }

  if (msg.startsWith('Asaas:')) return msg;
  return `Asaas: ${msg}`;
}
