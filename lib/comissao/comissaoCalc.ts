/**
 * Cálculo puro de comissão comercial (sem I/O).
 * Base líquida = faturamento × (1 − imposto%). Comissão = base × comissão%.
 */

export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export type CalculoComissao = {
  valorFaturamento: number;
  percentualImposto: number;
  percentualComissao: number;
  valorBaseLiquida: number;
  valorComissao: number;
  valorImposto: number;
  formatado: {
    faturamento: string;
    imposto: string;
    baseLiquida: string;
    comissao: string;
  };
};

function fmtBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function calcularComissao(
  valorFaturamento: number,
  percentualImposto = 16,
  percentualComissao = 3,
): CalculoComissao {
  const fat = roundMoney(Math.max(0, Number(valorFaturamento) || 0));
  const imp = Number.isFinite(percentualImposto) ? Number(percentualImposto) : 16;
  const com = Number.isFinite(percentualComissao) ? Number(percentualComissao) : 3;
  const valorImposto = roundMoney(fat * (imp / 100));
  const valorBaseLiquida = roundMoney(fat * (1 - imp / 100));
  const valorComissao = roundMoney(valorBaseLiquida * (com / 100));
  return {
    valorFaturamento: fat,
    percentualImposto: imp,
    percentualComissao: com,
    valorBaseLiquida,
    valorComissao,
    valorImposto,
    formatado: {
      faturamento: fmtBRL(fat),
      imposto: fmtBRL(valorImposto),
      baseLiquida: fmtBRL(valorBaseLiquida),
      comissao: fmtBRL(valorComissao),
    },
  };
}

export const COMISSAO_STATUS = [
  'AGUARDANDO_PAGAMENTO_CLIENTE',
  'LIBERADO_PARA_PAGAMENTO',
  'PAGO',
  'CANCELADO',
] as const;

export type ComissaoStatus = (typeof COMISSAO_STATUS)[number];

export const COMISSAO_STATUS_LABEL: Record<ComissaoStatus, string> = {
  AGUARDANDO_PAGAMENTO_CLIENTE: 'Aguardando pagamento do cliente',
  LIBERADO_PARA_PAGAMENTO: 'Liberado para pagamento',
  PAGO: 'Pago',
  CANCELADO: 'Cancelado',
};
