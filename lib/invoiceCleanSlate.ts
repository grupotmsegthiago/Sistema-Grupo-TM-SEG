/**
 * Marco "tela limpa" do Controle de Faturas / NF.
 * Qualquer fatura criada ANTES deste instante não aparece na lista ativa.
 * Novas emissões (created_at >= epoch) passam a aparecer normalmente.
 */
/** Marco: tudo criado antes some da lista; só emissões a partir daqui aparecem. */
export const INVOICE_CONTROL_EPOCH = '2026-07-23T19:55:00.000Z';

export function isAfterInvoiceControlEpoch(
  createdAt?: string | null,
  fallbackDate?: string | null,
): boolean {
  const raw = createdAt || (fallbackDate ? `${fallbackDate.slice(0, 10)}T12:00:00.000Z` : null);
  if (!raw) return false;
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) return false;
  return t >= new Date(INVOICE_CONTROL_EPOCH).getTime();
}
