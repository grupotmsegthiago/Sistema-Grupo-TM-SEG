/**
 * Clientes que pagam por transferência bancária — não devem receber/gerar boleto.
 */

export function normalizeClientBillingName(name: string | null | undefined): string {
  return String(name || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** CEVA e DHL pagam via TED/transferência — sem boleto Asaas. */
export function isBankTransferBillingClient(
  name: string | null | undefined,
  tradingName?: string | null,
): boolean {
  const n = `${normalizeClientBillingName(name)} ${normalizeClientBillingName(tradingName)}`;
  return n.includes('CEVA') || n.includes('DHL');
}

export function transferBillingDueDays(name: string | null | undefined, tradingName?: string | null): number {
  const n = `${normalizeClientBillingName(name)} ${normalizeClientBillingName(tradingName)}`;
  if (n.includes('CEVA')) return 70;
  return 30;
}
