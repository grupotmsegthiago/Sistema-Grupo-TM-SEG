/** Mensagens amigáveis para erros comuns da API Asaas em transferências Pix. */

const WITHDRAWAL_DENIED =
  /não possui permissão.*saque|sem permissão.*saque|withdrawal.*permission|invalid_action/i;

const CRITICAL_AUTH =
  /autorização crítica|critical.*authorization|token.*sms|token.*app/i;

const IP_NOT_ALLOWED = /ip.*não.*segur|ip.*not.*allowed|whitelist/i;

export function formatAsaasTransferError(raw: string): string {
  const msg = String(raw || '').trim();
  if (!msg) return 'Falha na transferência Pix. Tente novamente.';

  if (WITHDRAWAL_DENIED.test(msg)) {
    return (
      'A chave API do Asaas (TM Gestão/Seg/Security) não tem permissão para saques via API. ' +
      'No painel Asaas: Integrações → fale com o gerente de contas para liberar transferências via API, ' +
      'ou configure IP fixo da Vercel + webhook de aprovação em Integrações → Mecanismos de segurança ' +
      `(URL: https://sistema.grupotmseg.com.br/api/asaas/transfer-approval).`
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

  if (msg.startsWith('Asaas:')) return msg;
  return `Asaas: ${msg}`;
}
