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

/**
 * Subitens de dinheiro do boletim.
 * Valor gravado (inclusive 0) manda: se ativação + km extra + hora extra
 * não fecham nesse número, o serviço inteiro fica na ativação e os extras
 * de dinheiro zeram. Coluna NULL mantém o detalhe calculado.
 */
export function fecharSubitensNoValorGravado(input: {
  valorGravado: number | null | undefined;
  ativacao: number;
  kmExtra: number;
  horaExtra: number;
}): { ativacao: number; kmExtra: number; horaExtra: number; colapsou: boolean } {
  if (input.valorGravado == null || !Number.isFinite(Number(input.valorGravado))) {
    return {
      ativacao: input.ativacao,
      kmExtra: input.kmExtra,
      horaExtra: input.horaExtra,
      colapsou: false,
    };
  }
  const alvo = Math.round(Number(input.valorGravado) * 100) / 100;
  const soma = Math.round((Number(input.ativacao) + Number(input.kmExtra) + Number(input.horaExtra)) * 100) / 100;
  if (Math.abs(soma - alvo) < 0.02) {
    return {
      ativacao: input.ativacao,
      kmExtra: input.kmExtra,
      horaExtra: input.horaExtra,
      colapsou: false,
    };
  }
  return { ativacao: alvo, kmExtra: 0, horaExtra: 0, colapsou: true };
}
