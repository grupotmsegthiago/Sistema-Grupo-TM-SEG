/** Mensagens amigáveis para erros comuns da API Asaas em transferências Pix. */

import { ASAAS_PIX_FINANCEIRO_EMAIL } from './asaasPixTransfer.js';

const WITHDRAWAL_DENIED =
  /não possui permissão.*saque|sem permissão.*saque|withdrawal.*permission|invalid_action/i;

const CRITICAL_AUTH =
  /autorização crítica|critical.*authorization|token.*sms|token.*app/i;

const IP_NOT_ALLOWED = /ip.*não.*segur|ip.*not.*allowed|whitelist/i;

const CANCELLED_BY_WEBHOOK =
  /cancelad|recusad|falhou|failed|não foi autoriz|nao foi autoriz|webhook/i;

export function formatAsaasTransferError(raw: string): string {
  const msg = String(raw || '').trim();
  if (!msg) return 'Falha na transferência Pix. Tente novamente.';

  if (WITHDRAWAL_DENIED.test(msg)) {
    return (
      'Não foi possível repassar o saldo. O sistema tentou repasse interno entre contas Asaas e Pix para ' +
      `${ASAAS_PIX_FINANCEIRO_EMAIL}, mas a chave API não tem permissão de saque/transferência via API. ` +
      'No painel Asaas de cada conta (TM Gestão, TM Seg, TM Security): Integrações → peça ao gerente ' +
      'liberar transferências via API, ou configure webhook em Integrações → Mecanismos de segurança: ' +
      'https://sistema.grupotmseg.com.br/api/asaas/transfer-approval'
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

  if (CANCELLED_BY_WEBHOOK.test(msg)) {
    return (
      'A transferência foi criada no Asaas, mas o webhook de aprovação recusou ou não respondeu a tempo. ' +
      'Verifique em Integrações → Webhooks os logs (deve retornar HTTP 200 com status APPROVED). ' +
      'URL: https://sistema.grupotmseg.com.br/api/asaas/transfer-approval'
    );
  }

  if (msg.startsWith('Asaas:')) return msg;
  return `Asaas: ${msg}`;
}
