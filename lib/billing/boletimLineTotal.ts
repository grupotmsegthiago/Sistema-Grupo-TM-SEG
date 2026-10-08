/**
 * Total da linha do boletim de cliente.
 *
 * O rodapé soma receita + pedágio + deslocamento atuais.
 * O snapshot congelado permanece na linha só quando ainda coincide com essa
 * base, ou quando a base atual está zerada. Se a receita ou o pedágio mudaram
 * depois da aprovação, a linha acompanha o rodapé. Sem isso a soma do Excel
 * fica menor que o TOTAL (GTM-8231, TM0810: R$ 83,66).
 */
export function resolveBoletimClientLineTotal(input: {
  dbTotal: number;
  snapTotalWithDisp: number;
  componentTotal: number;
  wasManuallyEdited: boolean;
}): number {
  if (input.wasManuallyEdited) return input.dbTotal;
  const snap = input.snapTotalWithDisp > 0 ? input.snapTotalWithDisp : 0;
  if (snap > 0 && (input.dbTotal <= 0 || Math.abs(input.dbTotal - snap) < 0.01)) {
    return snap;
  }
  if (input.dbTotal > 0) return input.dbTotal;
  return input.componentTotal;
}
