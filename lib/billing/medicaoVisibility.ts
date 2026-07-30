/**
 * Visibilidade de medições (MED-) nos painéis financeiros.
 *
 * Medição enviada por e-mail cria espelho MED- em financial_invoices e título
 * em financial_transactions SEM cobrança Asaas. Esses registros só devem
 * aparecer no Controle de NF e Contas a Receber depois de fatura+boleto
 * (ou só boleto) — aí o fluxo gera TMSEG-/Asaas, não MED-.
 */

export type MedicaoInvoiceLike = {
  number?: string | null;
  asaas_payment_id?: string | null;
  asaas_bankslip_url?: string | null;
  boleto_image_url?: string | null;
  plugnotas_invoice_id?: string | null;
};

export type MedicaoReceivableLike = {
  description?: string | null;
  notes?: string | null;
  payment_method?: string | null;
};

/** Espelho de medição sem boleto/NF/Asaas — ocultar no Controle de NF. */
export function isPureMedicaoInvoice(inv: MedicaoInvoiceLike | null | undefined): boolean {
  if (!inv) return false;
  const num = String(inv.number || '').trim().toUpperCase();
  if (!num.startsWith('MED-')) return false;
  if (inv.asaas_payment_id) return false;
  if (inv.plugnotas_invoice_id) return false;
  if (inv.asaas_bankslip_url || inv.boleto_image_url) return false;
  return true;
}

/** Título de Contas a Receber gerado só pela medição (sem boleto Asaas). */
export function isPureMedicaoReceivable(t: MedicaoReceivableLike | null | undefined): boolean {
  if (!t) return false;
  const notes = String(t.notes || '');
  const desc = String(t.description || '');
  const method = String(t.payment_method || '').toUpperCase();

  // Já tem cobrança real → pode aparecer
  if (notes.includes('Asaas:') || /Fatura\s+TMSEG-/i.test(notes)) return false;
  if (method === 'BOLETO' || method === 'PIX' || method === 'CREDIT_CARD') return false;

  if (notes.includes('Boletim de Medição enviado')) return true;
  if (/Ref\s*MED-/i.test(notes)) return true;
  if (/^Medição\s/i.test(desc.trim())) return true;
  return false;
}
