/**
 * SSOT — GET/DELETE /api/asaas/payment/:id e GET /api/asaas/payments
 */
import {
  deletePayment,
  getPayment,
  getPaymentBankSlip,
  getPaymentPixQrCode,
  listPayments,
  mapAsaasStatus,
} from './asaasChargeApi.js';

export async function getAsaasPaymentDetail(params: {
  paymentId: string;
  company?: string;
}) {
  const payment = await getPayment(params.paymentId, params.company);
  let pixData = null;
  let bankSlipData = null;
  if (payment.status === 'PENDING' || payment.status === 'OVERDUE') {
    try {
      pixData = await getPaymentPixQrCode(payment.id, params.company);
    } catch {
      /* optional */
    }
    try {
      bankSlipData = await getPaymentBankSlip(payment.id, params.company);
    } catch {
      /* optional */
    }
  }
  return {
    payment: { ...payment, statusBr: mapAsaasStatus(payment.status) },
    pix: pixData ? { qrCodeBase64: pixData.encodedImage, copyPaste: pixData.payload } : null,
    bankSlip: bankSlipData
      ? { barCode: bankSlipData.barCode, digitableLine: bankSlipData.identificationField }
      : null,
  };
}

export async function listAsaasPayments(params: {
  status?: string;
  externalReference?: string;
  offset?: number;
  limit?: number;
  company?: string;
}) {
  const result = await listPayments({
    status: params.status,
    externalReference: params.externalReference,
    offset: params.offset,
    limit: params.limit,
    company: params.company,
  });
  const payments = result.data.map((p) => ({ ...p, statusBr: mapAsaasStatus(p.status) }));
  return { payments, totalCount: result.totalCount };
}

export async function deleteAsaasPayment(params: { paymentId: string; company?: string }) {
  await deletePayment(params.paymentId, params.company);
  return { success: true as const };
}
