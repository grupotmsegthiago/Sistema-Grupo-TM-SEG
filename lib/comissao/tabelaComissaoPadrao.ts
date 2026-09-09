/**
 * Tabela padrão de comissão comercial (print TM SEG / TORRES).
 * Não altera geração por NF: a apuração do período aplica piso, bônus e salário fixo.
 *
 * Regras homologadas:
 * - Os 16% da NF são DEDUZIDOS do bruto (nunca somados ao pagamento).
 * - Líquido = bruto − 16%. Comissão = 3% sobre o líquido.
 * - Abaixo de R$ 50.000: só o valor fixo do funcionário (sem comissão %).
 * - A partir de R$ 50.000: entra a escala (3% do líquido).
 * - Bônus acumulado: R$ 5.000 a partir de R$ 500.000; R$ 10.000 a partir de R$ 1.000.000.
 * - Total a pagar = Fixo + Comissão (+ bônus da faixa, se houver).
 * - Bruto do período = TM SEG + TORRES dos clientes daquele comercial.
 */

import { calcularComissao, roundMoney } from './comissaoCalc';

export const CODIGO_TABELA_COMISSAO_PADRAO = 'padrao-tmseg';

export type FaixaBonusComissao = {
  faturamentoMinimo: number;
  bonus: number;
};

export type TabelaComissaoPadrao = {
  codigo: string;
  nome: string;
  percentualImposto: number;
  percentualComissao: number;
  pisoComissao: number;
  faixasBonus: FaixaBonusComissao[];
};

export const TABELA_COMISSAO_PADRAO: TabelaComissaoPadrao = {
  codigo: CODIGO_TABELA_COMISSAO_PADRAO,
  nome: 'Tabela padrão TM SEG / TORRES',
  percentualImposto: 16,
  percentualComissao: 3,
  pisoComissao: 50_000,
  faixasBonus: [
    { faturamentoMinimo: 1_000_000, bonus: 10_000 },
    { faturamentoMinimo: 500_000, bonus: 5_000 },
  ],
};

export type ApuracaoComissao = {
  valorBruto: number;
  valorFixo: number;
  notaFiscal: number;
  resultadoLiquido: number;
  comissaoPercentual: number;
  bonusAcumulado: number;
  totalAPagar: number;
  abaixoDoPiso: boolean;
  tabelaCodigo: string;
};

export function bonusPorFaturamento(
  valorBruto: number,
  tabela: TabelaComissaoPadrao = TABELA_COMISSAO_PADRAO,
): number {
  const bruto = roundMoney(Math.max(0, Number(valorBruto) || 0));
  const faixas = [...tabela.faixasBonus].sort((a, b) => b.faturamentoMinimo - a.faturamentoMinimo);
  for (const faixa of faixas) {
    if (bruto >= faixa.faturamentoMinimo) return roundMoney(faixa.bonus);
  }
  return 0;
}

export function calcularApuracaoComissao(params: {
  valorBruto: number;
  valorFixo?: number;
  tabela?: TabelaComissaoPadrao;
}): ApuracaoComissao {
  const tabela = params.tabela || TABELA_COMISSAO_PADRAO;
  const valorBruto = roundMoney(Math.max(0, Number(params.valorBruto) || 0));
  const valorFixo = roundMoney(Math.max(0, Number(params.valorFixo) || 0));
  const abaixoDoPiso = valorBruto < tabela.pisoComissao;
  const base = calcularComissao(valorBruto, tabela.percentualImposto, tabela.percentualComissao);
  const comissaoPercentual = abaixoDoPiso ? 0 : base.valorComissao;
  const bonusAcumulado = abaixoDoPiso ? 0 : bonusPorFaturamento(valorBruto, tabela);
  return {
    valorBruto,
    valorFixo,
    notaFiscal: base.valorImposto,
    resultadoLiquido: base.valorBaseLiquida,
    comissaoPercentual,
    bonusAcumulado,
    totalAPagar: roundMoney(valorFixo + comissaoPercentual + bonusAcumulado),
    abaixoDoPiso,
    tabelaCodigo: tabela.codigo,
  };
}

/**
 * Valor da linha só é pagável depois do piso do comercial no período.
 * Abaixo de R$ 50 mil a comissão da NF fica R$ 0,00 (igual à apuração).
 */
export function valorComissaoLinhaAposPiso(opts: {
  valorComissao: number;
  brutoComercialNoPeriodo: number;
  percentual?: number;
  tabela?: TabelaComissaoPadrao;
}): { valor: number; percentual: number; abaixoDoPiso: boolean } {
  const tabela = opts.tabela || TABELA_COMISSAO_PADRAO;
  const abaixoDoPiso = roundMoney(Math.max(0, Number(opts.brutoComercialNoPeriodo) || 0)) < tabela.pisoComissao;
  if (abaixoDoPiso) return { valor: 0, percentual: 0, abaixoDoPiso: true };
  return {
    valor: roundMoney(Math.max(0, Number(opts.valorComissao) || 0)),
    percentual: Number(opts.percentual ?? tabela.percentualComissao) || 0,
    abaixoDoPiso: false,
  };
}

export function brutoPorComercialNasLinhas(
  rows: Array<{ comercial_id?: string | null; valor_faturamento?: number | null }>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const id = String(r.comercial_id || '').trim();
    if (!id) continue;
    map.set(id, roundMoney((map.get(id) || 0) + (Number(r.valor_faturamento) || 0)));
  }
  return map;
}

export type LinhaTabelaComissao = {
  valorBruto: number;
  notaFiscal: number;
  resultadoLiquido: number;
  comissao: number;
  bonusAcumulado: number;
  totalAPagar: number;
};

/** Espelho da planilha: R$ 50 mil a R$ 1 milhão, de 50 em 50 mil. */
export function gerarLinhasTabelaReferencia(
  tabela: TabelaComissaoPadrao = TABELA_COMISSAO_PADRAO,
): LinhaTabelaComissao[] {
  const linhas: LinhaTabelaComissao[] = [];
  for (let bruto = tabela.pisoComissao; bruto <= 1_000_000; bruto += 50_000) {
    const ap = calcularApuracaoComissao({ valorBruto: bruto, valorFixo: 0, tabela });
    linhas.push({
      valorBruto: ap.valorBruto,
      notaFiscal: ap.notaFiscal,
      resultadoLiquido: ap.resultadoLiquido,
      comissao: ap.comissaoPercentual,
      bonusAcumulado: ap.bonusAcumulado,
      totalAPagar: ap.totalAPagar,
    });
  }
  return linhas;
}

export function perfilEhComercial(profileName?: string | null): boolean {
  const n = String(profileName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  return n === 'comercial' || n.includes('comercial');
}
