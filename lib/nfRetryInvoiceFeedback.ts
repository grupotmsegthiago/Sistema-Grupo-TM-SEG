/** Mensagens de feedback do retry manual individual (Controle de Faturas). */

export type ManualRetryApiResponse = {
  success?: boolean;
  status?: string;
  error?: string;
  paused?: boolean;
  action?: string;
  pdfUrl?: string;
  number?: string;
  unpaused?: boolean;
};

export function buildManualRetryConfirmMessage(invoiceNumber: string): string {
  return (
    `Reemitir somente esta NF pelo Asaas?\n\n` +
    `Fatura: ${invoiceNumber}\n\n` +
    `A cobrança/boleto existente será reutilizada. ` +
    `Somente a NFS-e será reagendada após cancelamento seguro da NF anterior, se necessário.`
  );
}

export function formatManualRetryFeedback(data: ManualRetryApiResponse): string {
  if (data.success) {
    const status = String(data.status || 'PROCESSING').toUpperCase();
    if (status === 'AUTHORIZED') {
      return `NF autorizada${data.number ? ` (Nº ${data.number})` : ''}.`;
    }
    if (status === 'SCHEDULED' || status === 'SYNCHRONIZED' || status === 'PROCESSING') {
      return `NF reagendada — status atual: ${status}. Aguarde a Prefeitura/Asaas.`;
    }
    return `NF reagendada com sucesso. Status atual: ${data.status || 'pendente'}.`;
  }

  if (data.paused) {
    return `NF pausada novamente: ${data.error || 'erro permanente ou limite de tentativas.'}`;
  }

  if (data.action === 'cancel-blocked') {
    return `Reemissão bloqueada para evitar duplicidade: ${data.error || 'cancelamento da NF anterior indisponível.'}`;
  }

  if (data.action === 'wait') {
    return `NF ainda em processamento (${data.status || 'aguardando'}). Sincronize o status e tente novamente se persistir.`;
  }

  return data.error || data.status || 'Não foi possível reemitir agora.';
}

export function missingAsaasPaymentFeedback(invoiceNumber?: string): string {
  return `Não é possível reemitir NF${invoiceNumber ? ` da fatura ${invoiceNumber}` : ''}: cobrança Asaas (payment id) ausente nesta fatura.`;
}

type RetryInvoiceLike = {
  asaas_payment_id?: string | null;
  nf_provider?: string | null;
  plugnotas_invoice_id?: string | null;
  nf_status?: string | null;
  nf_image_url?: string | null;
};

/** Exibe ação de reemissão Asaas manual (ERROR ou NF pendente sem espelho). */
export function canShowAsaasManualRetry(inv: RetryInvoiceLike): boolean {
  if (!inv.asaas_payment_id) return false;
  const provider = String(inv.nf_provider || '').toUpperCase();
  if (provider === 'PLUGNOTAS' || inv.plugnotas_invoice_id) return false;
  const ns = String(inv.nf_status || '').toUpperCase();
  return ns === 'ERROR' || ns === 'FAILED' || (!inv.nf_image_url && ns !== 'AUTHORIZED');
}
