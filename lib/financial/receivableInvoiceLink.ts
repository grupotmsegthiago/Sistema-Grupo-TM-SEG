export type ReceivableInvoiceLink = {
  id: string;
  number?: string | null;
  asaas_payment_id?: string | null;
  nf_image_url?: string | null;
  nf_status?: string | null;
  asaas_invoice_url?: string | null;
};

function normalizeNumber(value: unknown): string {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

/** Liga o título à mesma fatura exibida no Controle de NF. */
export function findInvoiceForReceivable(
  faturaNumero: string | null | undefined,
  notes: string | null | undefined,
  invoices: ReceivableInvoiceLink[],
): ReceivableInvoiceLink | null {
  const number = normalizeNumber(faturaNumero);
  if (number) {
    const byNumber = invoices.find((invoice) => normalizeNumber(invoice.number) === number);
    if (byNumber) return byNumber;
  }
  const noteText = String(notes || '');
  return invoices.find((invoice) => {
    const paymentId = String(invoice.asaas_payment_id || '').trim();
    return paymentId.length > 0 && noteText.includes(paymentId);
  }) || null;
}

/** Mesma prioridade de documento usada pelo Controle de NF. */
export function invoiceNfUrl(invoice: ReceivableInvoiceLink | null | undefined): string | null {
  const direct = String(invoice?.nf_image_url || '').trim();
  if (direct) return direct;
  const status = String(invoice?.nf_status || '').toUpperCase();
  const asaas = String(invoice?.asaas_invoice_url || '').trim();
  return status === 'AUTHORIZED' && asaas ? asaas : null;
}
