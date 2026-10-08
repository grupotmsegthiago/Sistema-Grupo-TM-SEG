/**
 * Sync cobrança + NF Asaas → financial_invoices (handler leve Vercel).
 * Evita cold start do Express (causa do 504 "An error occurred..." no botão Sincronizar).
 */
import {
  getInvoicesByPayment,
  getPayment,
  getPaymentBankSlip,
  getPaymentPixQrCode,
  mapAsaasStatus,
} from './asaasChargeApi.js';
import { shouldKeepManualPaidStatus } from './invoiceManualPayment.js';
import { createSupabaseAdminClient } from './supabaseAdmin.js';
import {
  normalizeAsaasReceipt,
  syncAsaasReceiptToReceivables,
  upsertAsaasReceiptNote,
  type AsaasReceiptDetails,
} from './asaasReceiptDetails.js';

export type SyncPaymentStatusResult = {
  status: string;
  statusBr: string;
  isPaid: boolean;
  value: number;
  paymentDate: string | null;
  paidAmount: number | null;
  interestAndFineAmount: number;
  discountAmount: number;
  netAmount: number | null;
  feeAmount: number;
  creditDate: string | null;
  availability: 'AVAILABLE' | 'SCHEDULED' | 'UNKNOWN' | null;
  nfPdfUrl: string | null;
  nfStatus: string | null;
  nfNumber: string | null;
  nfLastError: string | null;
  asaasInvoiceId: string | null;
  hasBoleto: boolean;
  hasNf: boolean;
  bankSlipUrl: string | null;
  boletoBarcode: string | null;
  pixPayload: string | null;
  emailReady: boolean;
  liteHandler: true;
};

function pickBestInvoice(list: any[]): any | null {
  if (!list.length) return null;
  return (
    list.find((i) => i.status === 'AUTHORIZED' || i.pdfUrl) ||
    list.find((i) => i.status === 'ERROR') ||
    list.find((i) => i.status === 'SCHEDULED' || i.status === 'SYNCHRONIZED') ||
    list[0] ||
    null
  );
}

function nfErrorFromAsaas(nf: any): string | null {
  if (!nf) return null;
  const status = String(nf.status || '').toUpperCase();
  if (status !== 'ERROR' && status !== 'FAILED') return null;
  const desc = String(nf.statusDescription || nf.errorMessages || nf.failReason || '').trim();
  return desc || 'NF com erro no Asaas (sem detalhe)';
}

export async function runAsaasSyncPaymentStatus(params: {
  paymentId: string;
  invoiceId?: string;
  company?: string;
}): Promise<SyncPaymentStatusResult> {
  const paymentId = String(params.paymentId || '').trim();
  if (!paymentId) throw new Error('paymentId obrigatório');
  const company = params.company || undefined;
  const invoiceId = String(params.invoiceId || '').trim() || undefined;

  const payment = await getPayment(paymentId, company);
  const statusBr = mapAsaasStatus(payment.status);
  const isPaid = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(payment.status);
  const receipt: AsaasReceiptDetails | null = isPaid ? normalizeAsaasReceipt(payment) : null;

  let nfPdfUrl: string | null = null;
  let nfStatus: string | null = null;
  let nfNumber: string | null = null;
  let nfLastError: string | null = null;
  let asaasInvoiceId: string | null = null;
  let skipNfSync = false;
  let manualPaymentAt: string | null = null;
  let invoiceNotes: string | null = null;

  const sb = createSupabaseAdminClient();

  if (invoiceId && sb) {
    try {
      const { data } = await sb
        .from('financial_invoices')
        .select('nf_provider, nf_image_url, nf_status, nf_number, plugnotas_invoice_id, asaas_payment_id, manual_payment_at, notes')
        .eq('id', invoiceId)
        .maybeSingle();
      manualPaymentAt = (data as any)?.manual_payment_at || null;
      invoiceNotes = (data as any)?.notes || null;
      const rawProv = String((data as any)?.nf_provider || '').toUpperCase();
      const isPlug =
        rawProv === 'PLUGNOTAS' || (!rawProv && !!(data as any)?.plugnotas_invoice_id);
      if (isPlug) {
        skipNfSync = true;
        nfPdfUrl = (data as any)?.nf_image_url || null;
        nfStatus = (data as any)?.nf_status || null;
        nfNumber = (data as any)?.nf_number || null;
      }
      if ((data as any)?.asaas_payment_id && (data as any).asaas_payment_id !== paymentId) {
        throw new Error('Invoice não vinculada a este paymentId');
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('não vinculada')) throw e;
    }
  }

  if (!skipNfSync) {
    try {
      const list = await getInvoicesByPayment(paymentId, company);
      const nf = pickBestInvoice(list);
      if (nf) {
        asaasInvoiceId = nf.id || null;
        if (nf.pdfUrl) nfPdfUrl = nf.pdfUrl;
        if (nf.status) nfStatus = nf.status;
        if (nf.number) nfNumber = String(nf.number);
        nfLastError = nfErrorFromAsaas(nf);
      }
    } catch (e: any) {
      console.warn('[asaas-sync-payment] NF:', e?.message || e);
    }
  }

  let pixPayload: string | null = null;
  let boletoBarcode: string | null = null;
  if (!isPaid) {
    const [pix, slip] = await Promise.all([
      getPaymentPixQrCode(paymentId, company),
      getPaymentBankSlip(paymentId, company),
    ]);
    pixPayload = pix?.payload || null;
    boletoBarcode = slip?.identificationField || slip?.barCode || null;
  }

  if (invoiceId && sb) {
    const newStatus = isPaid ? 'PAGA' : payment.status === 'OVERDUE' ? 'VENCIDA' : 'EMITIDA';
    const updateData: Record<string, unknown> = {
      status: newStatus,
      asaas_status: payment.status,
    };
    if (receipt) updateData.notes = upsertAsaasReceiptNote(invoiceNotes, receipt);
    if (nfPdfUrl) updateData.nf_image_url = nfPdfUrl;
    if (nfStatus) updateData.nf_status = nfStatus;
    if (nfNumber) updateData.nf_number = nfNumber;
    if (asaasInvoiceId) updateData.asaas_invoice_id = asaasInvoiceId;
    if (payment.invoiceUrl) updateData.asaas_invoice_url = payment.invoiceUrl;
    if (payment.bankSlipUrl) updateData.asaas_bankslip_url = payment.bankSlipUrl;
    if (pixPayload) updateData.asaas_pix_payload = pixPayload;
    if (boletoBarcode) updateData.asaas_barcode = boletoBarcode;
    if (nfLastError) {
      updateData.nf_last_error = nfLastError.slice(0, 500);
    } else if (nfStatus === 'AUTHORIZED' || nfPdfUrl) {
      updateData.nf_last_error = null;
    }
    if (shouldKeepManualPaidStatus(manualPaymentAt, isPaid)) {
      delete updateData.status;
    }

    await sb.from('financial_invoices').update(updateData).eq('id', invoiceId);

    if (isPaid) {
      const { data: inv } = await sb
        .from('financial_invoices')
        .select('id, number, client, notes')
        .eq('id', invoiceId)
        .maybeSingle();
      if (inv?.number) {
        await syncAsaasReceiptToReceivables(sb, inv, payment);
      }
      try {
        const { syncPaidInvoicesToReceivables } = await import('./invoiceReceivableSync.js');
        await syncPaidInvoicesToReceivables(sb);
      } catch {
        /* a fatura já foi marcada */
      }
    }
  }

  const hasBoleto = !!(payment.bankSlipUrl || boletoBarcode);
  const hasNf = !!nfPdfUrl;

  return {
    status: payment.status,
    statusBr,
    isPaid,
    value: Number(payment.value || 0),
    paymentDate: receipt?.paymentDate || null,
    paidAmount: receipt?.paidAmount || null,
    interestAndFineAmount: receipt?.interestAndFineAmount || 0,
    discountAmount: receipt?.discountAmount || 0,
    netAmount: receipt?.netAmount ?? null,
    feeAmount: receipt?.feeAmount || 0,
    creditDate: receipt?.creditDate || null,
    availability: receipt?.availability || null,
    nfPdfUrl,
    nfStatus,
    nfNumber,
    nfLastError,
    asaasInvoiceId,
    hasBoleto,
    hasNf,
    bankSlipUrl: payment.bankSlipUrl || null,
    boletoBarcode,
    pixPayload,
    emailReady: hasBoleto && hasNf,
    liteHandler: true,
  };
}
