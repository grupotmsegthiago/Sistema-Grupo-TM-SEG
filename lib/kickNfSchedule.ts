/**
 * Dispara o worker de NF sem bloquear a UI.
 * Usado após create-charge (NF isolada) para não depender só do cron de 5–15 min.
 */
import { authFetch } from './authFetch';

/** Agenda/reagenda NF de uma fatura específica (best-effort). */
export function kickNfScheduleForInvoice(invoiceId: string | null | undefined): void {
  const id = String(invoiceId || '').trim();
  if (!id) return;
  void authFetch(`/api/nf/retry/${encodeURIComponent(id)}`, { method: 'POST' }).catch((e) => {
    console.warn('[kickNfSchedule] retry individual falhou:', e);
  });
}

/** Ciclo leve do Controle — reabre soft + processa lote pendente. */
export function kickNfRetryCycle(limit = 5): void {
  const n = Math.max(1, Math.min(Number(limit) || 5, 20));
  void authFetch(`/api/nf/retry-now?limit=${n}&reopen=1`, { method: 'POST' }).catch((e) => {
    console.warn('[kickNfSchedule] retry-now falhou:', e);
  });
}

export function kickNfScheduleForInvoices(invoiceIds: Array<string | null | undefined>): void {
  const uniq = [...new Set(invoiceIds.map((x) => String(x || '').trim()).filter(Boolean))];
  for (const id of uniq) kickNfScheduleForInvoice(id);
  // Também empurra o ciclo geral (cobre split / race de persistência).
  if (uniq.length > 0) kickNfRetryCycle(Math.min(10, Math.max(5, uniq.length + 2)));
}
