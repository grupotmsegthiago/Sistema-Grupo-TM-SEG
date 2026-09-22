/**
 * Regras do e-mail automático da fatura (boleto + NF).
 * Destino: no máximo os 2 primeiros e-mails de clients.medicao_email.
 * Cópia fixa: financeiro@ e thiago@ (aplicada no envio SMTP).
 */
import { takeFirstEmailRecipients } from '../email/recipientList.js';
import { isBankTransferBillingClient } from './transferBillingClients.js';

export const MAX_INVOICE_BILLING_RECIPIENTS = 2;
export const MAX_INVOICE_BILLING_EMAIL_ATTEMPTS = 5;

/** A partir desta data (Brasília) a emissão nova dispara o e-mail sozinha. */
export const INVOICE_BILLING_EMAIL_AUTO_FROM = '2026-09-22';

/** Reenvio pedido para faturas já emitidas neste intervalo (inclusive). */
export const INVOICE_BILLING_EMAIL_RESEND_FROM = '2026-09-01';
export const INVOICE_BILLING_EMAIL_RESEND_TO = '2026-09-15';

export const INVOICE_BILLING_COPY = [
  'financeiro@grupotmseg.com.br',
  'thiago@grupotmseg.com.br',
] as const;

export function brtDayStartUtc(isoDate: string): string {
  return `${isoDate}T03:00:00.000Z`;
}

export function nextIsoDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function brtDayEndExclusiveUtc(isoDate: string): string {
  return brtDayStartUtc(nextIsoDate(isoDate));
}

export function normalizeBillingClientName(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export type ClientEmailCandidate = {
  name?: string | null;
  trading_name?: string | null;
  medicao_email?: string | null;
  status?: string | null;
};

function matchScore(invoiceClient: string, candidate: ClientEmailCandidate): number {
  const needle = normalizeBillingClientName(invoiceClient);
  if (!needle) return 0;
  const name = normalizeBillingClientName(candidate.name);
  const trading = normalizeBillingClientName(candidate.trading_name);
  const exact = name === needle || trading === needle;
  const covers = (value: string) =>
    value.length >= 4 && (value.startsWith(needle) || needle.startsWith(value));
  let score = 0;
  if (exact) score = 100;
  else if (covers(name) || covers(trading)) score = 60;
  else return 0;
  if (String(candidate.status || '').toLowerCase() === 'ativo') score += 10;
  if (takeFirstEmailRecipients(candidate.medicao_email, 1).length > 0) score += 5;
  return score;
}

/** Escolhe o cadastro do cliente e devolve só os 2 primeiros e-mails financeiros. */
export function pickMedicaoRecipients(
  invoiceClient: string,
  candidates: ClientEmailCandidate[],
  max = MAX_INVOICE_BILLING_RECIPIENTS,
): string[] {
  let best: ClientEmailCandidate | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = matchScore(invoiceClient, candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  if (!best) return [];
  return takeFirstEmailRecipients(best.medicao_email, max);
}

export function invoiceReadyForBillingEmail(inv: {
  status?: string | null;
  nf_image_url?: string | null;
  asaas_bankslip_url?: string | null;
  boleto_image_url?: string | null;
  client?: string | null;
  asaas_payment_id?: string | null;
}): { ok: true; transfer: boolean } | { ok: false; reason: string } {
  const status = String(inv.status || '').toUpperCase();
  if (status === 'CANCELADA' || status === 'CANCELADO' || status === 'CANCELED') {
    return { ok: false, reason: 'Fatura cancelada.' };
  }
  if (!inv.asaas_payment_id) {
    return { ok: false, reason: 'Fatura sem cobrança Asaas.' };
  }
  if (!/^https?:\/\//i.test(String(inv.nf_image_url || ''))) {
    return { ok: false, reason: 'Nota Fiscal ainda não disponível. Sincronize o status primeiro.' };
  }
  const transfer = isBankTransferBillingClient(inv.client);
  const boleto = String(inv.asaas_bankslip_url || inv.boleto_image_url || '');
  if (!transfer && !/^https?:\/\//i.test(boleto)) {
    return { ok: false, reason: 'Boleto ainda não disponível. Sincronize o status primeiro.' };
  }
  return { ok: true, transfer };
}
