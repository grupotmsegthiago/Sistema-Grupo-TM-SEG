/**
 * Envia a cobrança (boleto + NF) aos 2 primeiros e-mails do responsável financeiro.
 * Disparo automático quando a NF e o boleto já estão na fatura; o botão do Controle reenvia.
 */
import { getInvoicesByPayment, getPayment, getPaymentBankSlip, getPaymentPixQrCode } from '../lib/asaasChargeApi.js';
import {
  INVOICE_BILLING_EMAIL_AUTO_FROM,
  MAX_INVOICE_BILLING_EMAIL_ATTEMPTS,
  brtDayEndExclusiveUtc,
  brtDayStartUtc,
  invoiceReadyForBillingEmail,
  pickMedicaoRecipients,
} from '../lib/billing/invoiceBillingEmailPolicy.js';
import { createSupabaseAdminClient } from './supabaseConfig';
import { sendBillingEmail } from './emailService';

const CLAIM_STALE_MS = 10 * 60 * 1000;

type InvoiceRow = {
  id: string;
  number?: string | null;
  client?: string | null;
  amount?: number | null;
  date?: string | null;
  boleto_due_date?: string | null;
  issuer_company?: string | null;
  status?: string | null;
  nf_image_url?: string | null;
  nf_number?: string | null;
  nf_provider?: string | null;
  asaas_payment_id?: string | null;
  asaas_bankslip_url?: string | null;
  boleto_image_url?: string | null;
  plugnotas_invoice_id?: string | null;
  notes?: string | null;
  billing_email_sent_at?: string | null;
  billing_email_attempts?: number | null;
};

export type InvoiceBillingEmailResult = {
  success: boolean;
  skipped?: boolean;
  messageId?: string | null;
  recipients?: string[];
  rejected?: string[];
  error?: string;
  nfIncluded?: boolean;
  boletoIncluded?: boolean;
  pixIncluded?: boolean;
  invoiceId?: string;
  client?: string | null;
};

function admin() {
  const sb = createSupabaseAdminClient();
  if (!sb) throw new Error('Supabase admin indisponível');
  return sb;
}

async function loadInvoice(opts: { invoiceId?: string; paymentId?: string }): Promise<InvoiceRow | null> {
  const sb = admin();
  const columns = 'id, number, client, amount, date, boleto_due_date, issuer_company, status, nf_image_url, nf_number, nf_provider, asaas_payment_id, asaas_bankslip_url, boleto_image_url, plugnotas_invoice_id, notes, billing_email_sent_at, billing_email_attempts';
  if (opts.invoiceId) {
    const { data, error } = await sb.from('financial_invoices').select(columns).eq('id', opts.invoiceId).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as InvoiceRow | null) || null;
  }
  if (!opts.paymentId) return null;
  const { data, error } = await sb
    .from('financial_invoices')
    .select(columns)
    .eq('asaas_payment_id', opts.paymentId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data || [])[0] as InvoiceRow | undefined) || null;
}

async function loadMedicaoRecipients(clientName: string): Promise<string[]> {
  const trimmed = clientName.trim();
  if (!trimmed) return [];
  const fragment = trimmed.replace(/[%_,.()'"\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24);
  if (!fragment) return [];
  const sb = admin();
  const { data, error } = await sb
    .from('clients')
    .select('name, trading_name, medicao_email, status')
    .or(`name.ilike."%${fragment}%",trading_name.ilike."%${fragment}%"`)
    .limit(30);
  if (error) throw new Error(error.message);
  return pickMedicaoRecipients(trimmed, data || []);
}

async function claimInvoice(id: string, resend: boolean): Promise<boolean> {
  const sb = admin();
  const { data, error } = await sb
    .from('financial_invoices')
    .select('billing_email_sent_at, billing_email_claim, billing_email_sending_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as {
    billing_email_sent_at?: string | null;
    billing_email_claim?: string | null;
    billing_email_sending_at?: string | null;
  } | null;
  if (!resend && row?.billing_email_sent_at) return false;
  const sendingAt = row?.billing_email_sending_at ? new Date(row.billing_email_sending_at).getTime() : 0;
  const claimIsFresh = !!row?.billing_email_claim && Date.now() - sendingAt < CLAIM_STALE_MS;
  if (claimIsFresh) return false;

  const claim = crypto.randomUUID();
  let query = sb
    .from('financial_invoices')
    .update({
      billing_email_claim: claim,
      billing_email_sending_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (row?.billing_email_claim) query = query.eq('billing_email_claim', row.billing_email_claim);
  else query = query.is('billing_email_claim', null);
  if (!resend) query = query.is('billing_email_sent_at', null);
  const { data: updated, error: updateError } = await query.select('billing_email_claim').maybeSingle();
  if (updateError) throw new Error(updateError.message);
  return (updated as { billing_email_claim?: string } | null)?.billing_email_claim === claim;
}

async function markEmailResult(id: string, patch: Record<string, unknown>): Promise<void> {
  const sb = admin();
  const { error } = await sb.from('financial_invoices').update({
    billing_email_claim: null,
    billing_email_sending_at: null,
    ...patch,
  }).eq('id', id);
  if (error) console.log(`[Fatura Email] falha ao gravar rastro ${id}: ${error.message}`);
}

export async function sendInvoiceBillingEmail(opts: {
  invoiceId?: string;
  paymentId?: string;
  resend?: boolean;
}): Promise<InvoiceBillingEmailResult> {
  const invoice = await loadInvoice(opts);
  if (!invoice) {
    return { success: false, error: 'Fatura não encontrada.' };
  }
  if (!opts.resend && invoice.billing_email_sent_at) {
    return { success: true, skipped: true, invoiceId: invoice.id, client: invoice.client, recipients: [], error: undefined };
  }
  const attempts = Number(invoice.billing_email_attempts || 0);
  if (!opts.resend && attempts >= MAX_INVOICE_BILLING_EMAIL_ATTEMPTS) {
    return {
      success: false,
      skipped: true,
      invoiceId: invoice.id,
      client: invoice.client,
      error: 'Limite de tentativas de e-mail atingido.',
    };
  }

  const ready = invoiceReadyForBillingEmail(invoice);
  if (!ready.ok) {
    return { success: false, skipped: true, invoiceId: invoice.id, client: invoice.client, error: ready.reason, nfIncluded: false, boletoIncluded: false };
  }

  const recipients = await loadMedicaoRecipients(String(invoice.client || ''));
  if (recipients.length === 0) {
    await markEmailResult(invoice.id, {
      billing_email_error: 'Cliente sem E-mail responsável financeiro (medição / cobrança).',
      billing_email_attempts: attempts + 1,
    });
    return {
      success: false,
      invoiceId: invoice.id,
      client: invoice.client,
      error: 'Cliente sem E-mail responsável financeiro (medição / cobrança).',
    };
  }

  const claimed = await claimInvoice(invoice.id, !!opts.resend);
  if (!claimed) {
    return { success: false, skipped: true, invoiceId: invoice.id, client: invoice.client, error: 'Envio de e-mail já em andamento.' };
  }

  const paymentId = String(invoice.asaas_payment_id);
  const company = invoice.issuer_company || undefined;
  let pixData: { payload?: string; encodedImage?: string } | null = null;
  let bankSlipData: { identificationField?: string; barCode?: string } | null = null;
  let payment: { bankSlipUrl?: string | null } | null = null;
  try { pixData = await getPaymentPixQrCode(paymentId, company); } catch { /* pix opcional */ }
  try { bankSlipData = await getPaymentBankSlip(paymentId, company); } catch { /* linha digitável opcional */ }
  try { payment = await getPayment(paymentId, company); } catch { /* usa URL já salva */ }

  let nfPdfUrl = invoice.nf_image_url || undefined;
  let nfNumber = invoice.nf_number || undefined;
  const provider = String(invoice.nf_provider || '').toUpperCase();
  if (provider !== 'PLUGNOTAS') {
    try {
      const list = await getInvoicesByPayment(paymentId, company);
      const nf = list.find((item) => item?.pdfUrl || item?.status === 'AUTHORIZED') || null;
      if (nf?.pdfUrl) nfPdfUrl = nf.pdfUrl;
      if (nf?.number) nfNumber = String(nf.number);
    } catch { /* mantém o PDF já gravado na fatura */ }
  }

  const boletoUrl = payment?.bankSlipUrl || invoice.asaas_bankslip_url || invoice.boleto_image_url || undefined;
  const hasBoleto = !!boletoUrl && !ready.transfer;
  const hasNf = !!nfPdfUrl;

  try {
    const result = await sendBillingEmail({
      clientName: invoice.client || 'Cliente',
      clientCnpj: '',
      clientEmail: recipients.join(', '),
      invoiceNumber: invoice.number || undefined,
      issuerCompany: invoice.issuer_company || 'Grupo TM SEG',
      value: Number(invoice.amount || 0),
      dueDate: String(invoice.boleto_due_date || invoice.date || '').slice(0, 10),
      description: invoice.notes || `Cobrança ref. NF ${invoice.number || ''}`.trim(),
      paymentId,
      boletoUrl: ready.transfer ? undefined : boletoUrl,
      pixPayload: pixData?.payload || undefined,
      pixQrCodeBase64: pixData?.encodedImage || undefined,
      boletoBarcode: bankSlipData?.barCode || undefined,
      boletoDigitableLine: bankSlipData?.identificationField || undefined,
      nfPdfUrl,
      nfNumber,
    });

    if (!result.success) {
      await markEmailResult(invoice.id, {
        billing_email_error: result.error || 'Falha no envio',
        billing_email_recipients: recipients.join(', '),
        billing_email_attempts: attempts + 1,
      });
      return {
        success: false,
        invoiceId: invoice.id,
        client: invoice.client,
        messageId: result.messageId || null,
        recipients: result.recipients || recipients,
        rejected: result.rejected || [],
        error: result.error,
        nfIncluded: hasNf,
        boletoIncluded: hasBoleto,
        pixIncluded: !!pixData?.payload,
      };
    }

    await markEmailResult(invoice.id, {
      billing_email_sent_at: new Date().toISOString(),
      billing_email_error: null,
      billing_email_recipients: (result.recipients || recipients).join(', '),
      billing_email_attempts: attempts,
    });
    console.log(`[Fatura Email] ${invoice.number || invoice.id} → ${(result.recipients || recipients).join(', ')}`);
    return {
      success: true,
      invoiceId: invoice.id,
      client: invoice.client,
      messageId: result.messageId || null,
      recipients: result.recipients || recipients,
      rejected: [],
      nfIncluded: hasNf,
      boletoIncluded: hasBoleto,
      pixIncluded: !!pixData?.payload,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await markEmailResult(invoice.id, {
      billing_email_error: message.slice(0, 500),
      billing_email_attempts: attempts + 1,
    });
    return { success: false, invoiceId: invoice.id, client: invoice.client, error: message };
  }
}

export async function runPendingInvoiceBillingEmails(opts?: {
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): Promise<{ scanned: number; sent: number; skipped: number; failed: number }> {
  const fromDate = opts?.fromDate || INVOICE_BILLING_EMAIL_AUTO_FROM;
  const limit = Math.max(1, Math.min(Number(opts?.limit) || 8, 40));
  const sb = admin();
  let query = sb
    .from('financial_invoices')
    .select('id')
    .in('status', ['EMITIDA', 'VENCIDA', 'PAGA'])
    .is('billing_email_sent_at', null)
    .lt('billing_email_attempts', MAX_INVOICE_BILLING_EMAIL_ATTEMPTS)
    .ilike('nf_image_url', 'http%')
    .or('asaas_bankslip_url.ilike.http%,boleto_image_url.ilike.http%,client.ilike.%CEVA%,client.ilike.%DHL%')
    .gte('created_at', brtDayStartUtc(fromDate))
    .order('created_at', { ascending: true })
    .limit(limit);
  if (opts?.toDate) query = query.lt('created_at', brtDayEndExclusiveUtc(opts.toDate));
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of data || []) {
    const result = await sendInvoiceBillingEmail({ invoiceId: String((row as { id: string }).id) });
    if (result.success && !result.skipped) sent++;
    else if (result.skipped || result.success) skipped++;
    else failed++;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  if ((data || []).length > 0) {
    console.log(`[Fatura Email] ciclo ${fromDate}${opts?.toDate ? `..${opts.toDate}` : ''} scanned=${(data || []).length} sent=${sent} skipped=${skipped} failed=${failed}`);
  }
  return { scanned: (data || []).length, sent, skipped, failed };
}
