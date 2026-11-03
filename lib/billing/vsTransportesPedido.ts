/**
 * VS TRANSPORTES — Referência de Pedidos no boletim de medição.
 * Só identifica o cliente. Não altera cálculo, aprovação nem faturamento.
 */
export function isVsTransportesClient(...names: Array<string | null | undefined>): boolean {
  const blob = names
    .filter((n) => n != null && String(n).trim() !== '')
    .join(' ')
    .toUpperCase();
  return blob.includes('VS TRANSPORTES') || blob.includes('VS OPERADOR LOGISTICO');
}

/** Operacional não grava a OS da VS sem a referência de pedidos. */
export function referenciaPedidosVsFaltando(
  clientName: string | null | undefined,
  referencia: string | null | undefined,
): boolean {
  return isVsTransportesClient(clientName) && !String(referencia || '').trim();
}
