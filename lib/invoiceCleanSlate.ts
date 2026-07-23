/**
 * Marco "tela limpa" do Controle de Faturas / NF.
 * Qualquer fatura com created_at ANTES deste instante não aparece na lista ativa.
 * Novas emissões (created_at >= epoch) passam a aparecer normalmente.
 *
 * Importante: NÃO usar `date` (data de competência/quinzena) como critério —
 * emissão da Amazon com período antigo sumia da tela mesmo sendo nova.
 */
/** Marco: tudo criado antes some da lista; só emissões a partir daqui aparecem. */
export const INVOICE_CONTROL_EPOCH = '2026-07-23T19:55:00.000Z';

export function isAfterInvoiceControlEpoch(
  createdAt?: string | null,
  _fallbackDate?: string | null,
): boolean {
  if (createdAt) {
    const t = new Date(createdAt).getTime();
    if (!Number.isNaN(t)) return t >= new Date(INVOICE_CONTROL_EPOCH).getTime();
  }
  // Sem created_at: fail-open — não esconder emissão recém-salva incompleta.
  // Faturas antigas têm created_at e continuam filtradas pelo marco.
  return true;
}

/** Chave sessionStorage: Controle acompanha NF Processando→Emitida após emitir. */
export const INVOICE_WATCH_STORAGE_KEY = 'tmseg_invoice_nf_watch';

export type InvoiceWatchPayload = {
  at: number;
  paymentIds: string[];
  invoiceIds: string[];
};

export function stashInvoiceWatch(payload: Omit<InvoiceWatchPayload, 'at'>): void {
  try {
    const body: InvoiceWatchPayload = {
      at: Date.now(),
      paymentIds: [...new Set((payload.paymentIds || []).filter(Boolean))],
      invoiceIds: [...new Set((payload.invoiceIds || []).filter(Boolean))],
    };
    if (body.paymentIds.length === 0 && body.invoiceIds.length === 0) return;
    sessionStorage.setItem(INVOICE_WATCH_STORAGE_KEY, JSON.stringify(body));
  } catch {
    /* ignore */
  }
}

export function readInvoiceWatch(maxAgeMs = 30 * 60_000): InvoiceWatchPayload | null {
  try {
    const raw = sessionStorage.getItem(INVOICE_WATCH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InvoiceWatchPayload;
    if (!parsed?.at || Date.now() - parsed.at > maxAgeMs) {
      sessionStorage.removeItem(INVOICE_WATCH_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearInvoiceWatch(): void {
  try {
    sessionStorage.removeItem(INVOICE_WATCH_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
