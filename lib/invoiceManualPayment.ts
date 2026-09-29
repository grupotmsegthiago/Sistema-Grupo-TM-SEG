/**
 * Baixa manual do Controle de Faturas.
 * Grava evidência do extrato, data do pagamento, quem registrou e quando.
 * Não altera o valor (amount) da fatura.
 */
import { atualizarStatusAposBaixaCliente } from './comissao/comissaoCore.js';
import { createSupabaseAdminClient } from './supabaseAdmin.js';

export type ManualPaymentInput = {
  invoiceId: string;
  paymentDate: string;
  evidenceUrl: string;
  registeredBy: string;
  note?: string | null;
};

export function brazilTodayIso(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

export function assertManualPaymentInput(input: ManualPaymentInput, today = brazilTodayIso()): void {
  const id = String(input.invoiceId || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('Fatura inválida');
  }
  const date = String(input.paymentDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Informe a data do pagamento');
  }
  if (date > today) {
    throw new Error('A data do pagamento não pode ser futura');
  }
  const url = String(input.evidenceUrl || '').trim();
  if (!/^https:\/\//i.test(url)) {
    throw new Error('Anexe a evidência do extrato');
  }
  const by = String(input.registeredBy || '').trim();
  if (by.length < 2) {
    throw new Error('Não foi possível identificar quem registrou');
  }
}

/** Sincronizar com o Asaas não desfaz uma baixa manual enquanto o Asaas não confirmar o pagamento. */
export function shouldKeepManualPaidStatus(manualPaymentAt: unknown, asaasPaid: boolean): boolean {
  return Boolean(manualPaymentAt) && !asaasPaid;
}

export async function registrarBaixaManualFatura(input: ManualPaymentInput): Promise<{
  success: true;
  invoiceId: string;
  number: string | null;
  transactions: number;
  commissionUpdated: number;
  commissionError?: string;
}> {
  assertManualPaymentInput(input);
  const sb = createSupabaseAdminClient();
  if (!sb) throw new Error('Banco indisponível para registrar a baixa');

  const id = String(input.invoiceId).trim();
  const date = String(input.paymentDate).slice(0, 10);
  const note = String(input.note || '').trim();

  const { data, error } = await sb.rpc('registrar_baixa_manual_fatura', {
    p_invoice_id: id,
    p_payment_date: date,
    p_evidence_url: String(input.evidenceUrl).trim(),
    p_registered_by: String(input.registeredBy).trim(),
    p_note: note || null,
  });
  if (error) throw new Error(error.message || 'Falha ao registrar a baixa');

  const body = (data || {}) as { invoiceId?: string; number?: string | null; transactions?: number };
  let commissionUpdated = 0;
  let commissionError: string | undefined;
  try {
    const commission = await atualizarStatusAposBaixaCliente(sb, id, date);
    commissionUpdated = commission.updated;
    if (!commission.ok && commission.error) commissionError = commission.error;
  } catch (e: unknown) {
    commissionError = e instanceof Error ? e.message : String(e);
  }

  return {
    success: true,
    invoiceId: body.invoiceId || id,
    number: body.number ?? null,
    transactions: Number(body.transactions || 0),
    commissionUpdated,
    ...(commissionError ? { commissionError } : {}),
  };
}
