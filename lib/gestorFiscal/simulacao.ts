/**
 * Simulação tributária em cima de receita, custo e despesa já apurados.
 * Não recalcula OS. Quem produz receita e custo de escolta é computeCanonicalRevenueCost.
 * Nada aqui grava banco, fatura ou título.
 */

import { aliquotaValida, type PremissasFiscais } from './premissas';

export const FORMULAS_FISCAIS = {
  margem: 'Margem operacional = (receita − custo do fornecedor − despesas operacionais) ÷ receita.',
  simples: 'Tributo do Simples = receita × alíquota efetiva informada nesta tela. Sem alíquota, o valor não é calculado.',
  pisCofins: 'PIS e COFINS incidem sobre a receita. Crédito só entra se a simulação marcar o fornecedor e a NF for válida com emissão confirmada. Despesa ou NF sozinhas não viram crédito.',
  base: 'Lucro tributável do mês = receita − custo − despesas − PIS/COFINS líquido − ISS − outras alíquotas sobre a receita.',
  irpj: 'IRPJ, adicional e CSLL são calculados por mês. O adicional só incide na parcela acima do limite mensal. Prejuízo no mês não gera imposto negativo.',
  liquido: 'Lucro líquido do regime = resultado operacional − tributos desse regime.',
  teto: 'Teto do fornecedor = maior aumento de custo que, no Lucro Real, preserva ao mesmo tempo a margem mínima e o lucro líquido de referência do Simples.',
  cliente: 'Receita para a meta = (custo do fornecedor + despesas do recorte) ÷ (1 − margem ideal). Reajuste = essa receita − a receita atual.',
  preservar: 'Aumento para preservar o lucro = menor acréscimo de receita que faz o lucro líquido do Lucro Real voltar ao lucro líquido de referência do Simples. Não substitui o reajuste da margem de 40%.',
} as const;

export interface MesOperacional {
  mes: string;
  receita: number;
  custoFornecedor: number;
  despesasOperacionais: number;
  creditoPisCofins: number;
}

export interface ResultadoMes {
  mes: string;
  receita: number;
  custoFornecedor: number;
  despesasOperacionais: number;
  resultadoOperacional: number;
  margem: number | null;
  pis: number;
  cofins: number;
  creditoUsado: number;
  creditoNaoUsado: number;
  pisCofinsLiquido: number;
  iss: number;
  outras: number;
  lucroTributavel: number;
  irpj: number;
  irpjAdicional: number;
  csll: number;
  tributoLucroReal: number;
  tributoSimples: number | null;
  lucroLiquidoLucroReal: number;
  lucroLiquidoSimples: number | null;
}

export interface ResultadoPeriodo {
  meses: ResultadoMes[];
  receita: number;
  custoFornecedor: number;
  despesasOperacionais: number;
  resultadoOperacional: number;
  margem: number | null;
  tributoLucroReal: number;
  tributoSimples: number | null;
  lucroLiquidoLucroReal: number;
  lucroLiquidoSimples: number | null;
  simplesStatus: 'CALCULADO' | 'PREMISSA_AUSENTE';
  pis: number;
  cofins: number;
  creditoUsado: number;
  iss: number;
  irpj: number;
  irpjAdicional: number;
  csll: number;
}

export type FaixaMargem = 'abaixo_minimo' | 'entre_minimo_e_meta' | 'na_meta' | 'indeterminado';

export interface ReajusteCliente {
  status: 'JA_ATINGE' | 'REAJUSTE' | 'INDETERMINADO';
  margemAtual: number | null;
  receitaNecessaria: number | null;
  reajusteValor: number | null;
  reajustePercentual: number | null;
  formula: string;
}

export interface ExemploDelta {
  delta: number;
  lucroLiquidoLucroReal: number;
  margem: number | null;
  contraReferencia: 'MELHORA' | 'MANTÉM' | 'REDUZ';
}

export interface TetoFornecedor {
  status: 'CALCULADO' | 'SEM_FOLGA' | 'PREMISSA_AUSENTE' | 'INDETERMINADO' | 'LIMITADO_A_RECEITA';
  teto: number | null;
  motivo: string;
  lucroReferencia: number | null;
  exemploMelhora: ExemploDelta | null;
  exemploMantem: ExemploDelta | null;
  exemploReduz: ExemploDelta | null;
  formula: string;
}

const arredondar = (valor: number): number => {
  if (!Number.isFinite(valor)) return 0;
  return Math.round((valor + Number.EPSILON) * 100) / 100;
};

const soma = (valores: number[]): number => valores.reduce((a, b) => a + b, 0);

export function margemOperacional(receita: number, resultado: number): number | null {
  if (!(receita > 0) || !Number.isFinite(resultado)) return null;
  return resultado / receita;
}

export function classificarMargem(margem: number | null, premissas: PremissasFiscais): FaixaMargem {
  if (margem == null || !Number.isFinite(margem)) return 'indeterminado';
  if (margem + 1e-9 < premissas.margemMinima) return 'abaixo_minimo';
  if (margem + 1e-9 < premissas.margemIdeal) return 'entre_minimo_e_meta';
  return 'na_meta';
}

export function tributosDoMes(mes: MesOperacional, premissas: PremissasFiscais): ResultadoMes {
  const receita = arredondar(mes.receita);
  const custo = arredondar(mes.custoFornecedor);
  const despesas = arredondar(mes.despesasOperacionais);
  const resultado = arredondar(receita - custo - despesas);
  const pis = arredondar(receita * premissas.pis);
  const cofins = arredondar(receita * premissas.cofins);
  const debito = arredondar(pis + cofins);
  const creditoPedido = Math.max(0, arredondar(mes.creditoPisCofins));
  const creditoUsado = premissas.creditoRestituivel ? creditoPedido : Math.min(debito, creditoPedido);
  const creditoNaoUsado = arredondar(Math.max(0, creditoPedido - creditoUsado));
  const pisCofinsLiquido = arredondar(debito - creditoUsado);
  const iss = arredondar(receita * premissas.iss);
  const outras = arredondar(receita * premissas.outrasSobreReceita);
  const lucroTributavel = arredondar(receita - custo - despesas - pisCofinsLiquido - iss - outras);
  const basePositiva = Math.max(0, lucroTributavel);
  const irpj = arredondar(basePositiva * premissas.irpj);
  const excedente = Math.max(0, basePositiva - premissas.limiteAdicionalMensal);
  const irpjAdicional = arredondar(excedente * premissas.irpjAdicional);
  const csll = arredondar(basePositiva * premissas.csll);
  const tributoLucroReal = arredondar(pisCofinsLiquido + iss + outras + irpj + irpjAdicional + csll);
  const simplesOk = aliquotaValida(premissas.simplesAliquotaEfetiva);
  const tributoSimples = simplesOk ? arredondar(receita * (premissas.simplesAliquotaEfetiva as number)) : null;
  return {
    mes: mes.mes,
    receita,
    custoFornecedor: custo,
    despesasOperacionais: despesas,
    resultadoOperacional: resultado,
    margem: margemOperacional(receita, resultado),
    pis,
    cofins,
    creditoUsado,
    creditoNaoUsado,
    pisCofinsLiquido,
    iss,
    outras,
    lucroTributavel,
    irpj,
    irpjAdicional,
    csll,
    tributoLucroReal,
    tributoSimples,
    lucroLiquidoLucroReal: arredondar(resultado - tributoLucroReal),
    lucroLiquidoSimples: tributoSimples == null ? null : arredondar(resultado - tributoSimples),
  };
}

export function simularPeriodo(meses: MesOperacional[], premissas: PremissasFiscais): ResultadoPeriodo {
  const lista = [...meses].sort((a, b) => a.mes.localeCompare(b.mes)).map((m) => tributosDoMes(m, premissas));
  const receita = arredondar(soma(lista.map((m) => m.receita)));
  const custoFornecedor = arredondar(soma(lista.map((m) => m.custoFornecedor)));
  const despesasOperacionais = arredondar(soma(lista.map((m) => m.despesasOperacionais)));
  const resultadoOperacional = arredondar(soma(lista.map((m) => m.resultadoOperacional)));
  const tributoLucroReal = arredondar(soma(lista.map((m) => m.tributoLucroReal)));
  const simplesStatus = aliquotaValida(premissas.simplesAliquotaEfetiva) ? 'CALCULADO' : 'PREMISSA_AUSENTE';
  const tributoSimples = simplesStatus === 'CALCULADO'
    ? arredondar(soma(lista.map((m) => m.tributoSimples || 0)))
    : null;
  return {
    meses: lista,
    receita,
    custoFornecedor,
    despesasOperacionais,
    resultadoOperacional,
    margem: margemOperacional(receita, resultadoOperacional),
    tributoLucroReal,
    tributoSimples,
    lucroLiquidoLucroReal: arredondar(resultadoOperacional - tributoLucroReal),
    lucroLiquidoSimples: tributoSimples == null ? null : arredondar(resultadoOperacional - tributoSimples),
    simplesStatus,
    pis: arredondar(soma(lista.map((m) => m.pis))),
    cofins: arredondar(soma(lista.map((m) => m.cofins))),
    creditoUsado: arredondar(soma(lista.map((m) => m.creditoUsado))),
    iss: arredondar(soma(lista.map((m) => m.iss))),
    irpj: arredondar(soma(lista.map((m) => m.irpj))),
    irpjAdicional: arredondar(soma(lista.map((m) => m.irpjAdicional))),
    csll: arredondar(soma(lista.map((m) => m.csll))),
  };
}

export function reajusteParaMargemIdeal(
  receita: number,
  custo: number,
  despesas: number,
  premissas: PremissasFiscais,
): ReajusteCliente {
  const formula = FORMULAS_FISCAIS.cliente;
  const alvo = premissas.margemIdeal;
  const base = arredondar(custo + despesas);
  if (!(alvo > 0 && alvo < 1) || (receita <= 0 && base <= 0)) {
    return { status: 'INDETERMINADO', margemAtual: null, receitaNecessaria: null, reajusteValor: null, reajustePercentual: null, formula };
  }
  const receitaNecessaria = arredondar(base / (1 - alvo));
  if (!(receita > 0)) {
    return {
      status: 'REAJUSTE',
      margemAtual: null,
      receitaNecessaria,
      reajusteValor: receitaNecessaria,
      reajustePercentual: null,
      formula,
    };
  }
  const margemAtual = margemOperacional(receita, receita - base);
  if (margemAtual != null && margemAtual + 1e-9 >= alvo) {
    return { status: 'JA_ATINGE', margemAtual, receitaNecessaria: arredondar(receita), reajusteValor: 0, reajustePercentual: 0, formula };
  }
  const reajusteValor = arredondar(receitaNecessaria - receita);
  return {
    status: 'REAJUSTE',
    margemAtual,
    receitaNecessaria,
    reajusteValor,
    reajustePercentual: receita > 0 ? reajusteValor / receita : null,
    formula,
  };
}

export interface ReajustePreservarLucro {
  status: 'JA_PRESERVA' | 'REAJUSTE' | 'PREMISSA_AUSENTE' | 'INDETERMINADO' | 'LIMITE_DA_BUSCA';
  aumento: number | null;
  lucroReferencia: number | null;
  lucroDepois: number | null;
  motivo: string;
  formula: string;
}

export interface ItemConferencia {
  regra: string;
  estado: 'ATENDE' | 'NAO_ATENDE' | 'PREMISSA_AUSENTE' | 'NAO_SE_APLICA';
  detalhe: string;
}

function aplicarDelta(meses: MesOperacional[], delta: number): MesOperacional[] {
  if (meses.length === 0 || delta === 0) return meses.map((m) => ({ ...m }));
  const totalCusto = soma(meses.map((m) => m.custoFornecedor));
  if (totalCusto <= 0) {
    return meses.map((m, i) => (i === 0 ? { ...m, custoFornecedor: m.custoFornecedor + delta } : { ...m }));
  }
  return meses.map((m) => ({
    ...m,
    custoFornecedor: m.custoFornecedor + delta * (m.custoFornecedor / totalCusto),
  }));
}

function exemplo(delta: number, meses: MesOperacional[], premissas: PremissasFiscais, referencia: number): ExemploDelta {
  const r = simularPeriodo(aplicarDelta(meses, delta), premissas);
  const diff = r.lucroLiquidoLucroReal - referencia;
  const contraReferencia = Math.abs(diff) <= 0.05 ? 'MANTÉM' : diff > 0 ? 'MELHORA' : 'REDUZ';
  return { delta: arredondar(delta), lucroLiquidoLucroReal: r.lucroLiquidoLucroReal, margem: r.margem, contraReferencia };
}

export function tetoReajusteFornecedor(meses: MesOperacional[], premissas: PremissasFiscais): TetoFornecedor {
  const formula = FORMULAS_FISCAIS.teto;
  if (!aliquotaValida(premissas.simplesAliquotaEfetiva)) {
    return {
      status: 'PREMISSA_AUSENTE',
      teto: null,
      motivo: 'Sem a alíquota do Simples não há lucro líquido de referência para comparar.',
      lucroReferencia: null,
      exemploMelhora: null,
      exemploMantem: null,
      exemploReduz: null,
      formula,
    };
  }
  const atual = simularPeriodo(meses, premissas);
  const referencia = atual.lucroLiquidoSimples;
  if (referencia == null || !(atual.receita > 0)) {
    return {
      status: 'INDETERMINADO',
      teto: null,
      motivo: 'Receita do recorte é zero. Margem e teto ficam indeterminados.',
      lucroReferencia: referencia,
      exemploMelhora: null,
      exemploMantem: null,
      exemploReduz: null,
      formula,
    };
  }

  const capCentavos = Math.max(0, Math.round(atual.receita * 100));
  const ok = (centavos: number): boolean => {
    const r = simularPeriodo(aplicarDelta(meses, centavos / 100), premissas);
    if (r.margem == null || r.lucroLiquidoSimples == null) return false;
    const margemOk = r.margem + 1e-9 >= premissas.margemMinima;
    const lucroOk = r.lucroLiquidoLucroReal + 0.005 >= referencia;
    return margemOk && lucroOk;
  };

  if (!ok(0)) {
    const margemBaixa = atual.margem == null || atual.margem + 1e-9 < premissas.margemMinima;
    return {
      status: 'SEM_FOLGA',
      teto: 0,
      motivo: margemBaixa
        ? 'A margem já está abaixo do mínimo. Não há folga para aumentar o fornecedor.'
        : 'No Lucro Real, o lucro líquido já fica abaixo da referência do Simples. O teto de aumento é zero.',
      lucroReferencia: referencia,
      exemploMelhora: null,
      exemploMantem: null,
      exemploReduz: exemplo(1, meses, premissas, referencia),
      formula,
    };
  }

  if (ok(capCentavos)) {
    const teto = arredondar(capCentavos / 100);
    return {
      status: 'LIMITADO_A_RECEITA',
      teto,
      motivo: 'A folga ainda existe no limite da receita do recorte. O teto exibido para aqui para não extrapolar o recorte.',
      lucroReferencia: referencia,
      exemploMelhora: exemplo(0, meses, premissas, referencia),
      exemploMantem: exemplo(teto, meses, premissas, referencia),
      exemploReduz: null,
      formula,
    };
  }

  let lo = 0;
  let hi = capCentavos;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ok(mid)) lo = mid;
    else hi = mid - 1;
  }
  const teto = arredondar(lo / 100);
  const melhoraCentavos = lo > 1 ? Math.floor(lo / 2) : 0;
  const proximo = simularPeriodo(aplicarDelta(meses, (lo + 1) / 100), premissas);
  const margemEstoura = proximo.margem == null || proximo.margem + 1e-9 < premissas.margemMinima;
  return {
    status: 'CALCULADO',
    teto,
    motivo: margemEstoura
      ? 'O próximo centavo derruba a margem mínima. O teto para antes disso e também respeita o lucro líquido de referência.'
      : 'O próximo centavo deixa o lucro líquido do Lucro Real abaixo da referência do Simples. A margem mínima ainda cabe nesse teto.',
    lucroReferencia: referencia,
    exemploMelhora: exemplo(melhoraCentavos / 100, meses, premissas, referencia),
    exemploMantem: exemplo(teto, meses, premissas, referencia),
    exemploReduz: exemplo((lo + 100) / 100, meses, premissas, referencia),
    formula,
  };
}

function aplicarDeltaReceita(meses: MesOperacional[], delta: number): MesOperacional[] {
  if (meses.length === 0 || delta === 0) return meses.map((m) => ({ ...m }));
  const total = soma(meses.map((m) => m.receita));
  if (total <= 0) {
    return meses.map((m, i) => (i === 0 ? { ...m, receita: m.receita + delta } : { ...m }));
  }
  return meses.map((m) => ({
    ...m,
    receita: m.receita + delta * (m.receita / total),
  }));
}

/** Quanto cobrar a mais do cliente para o Lucro Real não ficar abaixo do lucro do Simples. */
export function reajusteParaPreservarLucro(meses: MesOperacional[], premissas: PremissasFiscais): ReajustePreservarLucro {
  const formula = FORMULAS_FISCAIS.preservar;
  if (!aliquotaValida(premissas.simplesAliquotaEfetiva)) {
    return {
      status: 'PREMISSA_AUSENTE',
      aumento: null,
      lucroReferencia: null,
      lucroDepois: null,
      motivo: 'Sem a alíquota do Simples não há lucro de referência para preservar.',
      formula,
    };
  }
  const atual = simularPeriodo(meses, premissas);
  const referencia = atual.lucroLiquidoSimples;
  if (referencia == null || !(atual.receita > 0)) {
    return {
      status: 'INDETERMINADO',
      aumento: null,
      lucroReferencia: referencia,
      lucroDepois: null,
      motivo: 'Receita do recorte é zero. O aumento de preço fica indeterminado.',
      formula,
    };
  }
  const restaura = (centavos: number): boolean => {
    const r = simularPeriodo(aplicarDeltaReceita(meses, centavos / 100), premissas);
    return r.lucroLiquidoLucroReal + 0.005 >= referencia;
  };
  if (restaura(0)) {
    return {
      status: 'JA_PRESERVA',
      aumento: 0,
      lucroReferencia: referencia,
      lucroDepois: atual.lucroLiquidoLucroReal,
      motivo: 'O lucro líquido do Lucro Real já não fica abaixo do Simples. Não há aumento de preço para preservar o lucro.',
      formula,
    };
  }
  const capCentavos = Math.max(100, Math.round(atual.receita * 100 * 20));
  if (!restaura(capCentavos)) {
    return {
      status: 'LIMITE_DA_BUSCA',
      aumento: null,
      lucroReferencia: referencia,
      lucroDepois: null,
      motivo: 'Mesmo com a receita vinte vezes maior, o Lucro Real não alcança a referência. A premissa tributária precisa ser revista.',
      formula,
    };
  }
  let lo = 0;
  let hi = capCentavos;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (restaura(mid)) hi = mid;
    else lo = mid + 1;
  }
  const aumento = arredondar(lo / 100);
  const depois = simularPeriodo(aplicarDeltaReceita(meses, aumento), premissas);
  return {
    status: 'REAJUSTE',
    aumento,
    lucroReferencia: referencia,
    lucroDepois: depois.lucroLiquidoLucroReal,
    motivo: 'Este aumento de preço preserva o lucro líquido. O reajuste para a margem de 40% é outra conta e pode ser diferente.',
    formula,
  };
}

export function conferirRegras(entrada: {
  premissas: PremissasFiscais;
  margemAtual: number | null;
  teto: TetoFornecedor;
  reajusteMargem: ReajusteCliente;
  preservar: ReajustePreservarLucro;
  creditoUsadoSemMarca: number;
}): ItemConferencia[] {
  const itens: ItemConferencia[] = [];
  if (entrada.margemAtual == null) {
    itens.push({ regra: 'Margem operacional', estado: 'NAO_SE_APLICA', detalhe: 'Receita zero. A margem não é calculada.' });
  } else if (entrada.margemAtual + 1e-9 < entrada.premissas.margemMinima) {
    itens.push({ regra: 'Margem mínima de 30%', estado: 'NAO_ATENDE', detalhe: 'O recorte atual está abaixo do mínimo. O teto do fornecedor fica zerado.' });
  } else if (entrada.margemAtual + 1e-9 < entrada.premissas.margemIdeal) {
    itens.push({ regra: 'Margem mínima de 30%', estado: 'ATENDE', detalhe: 'Acima de 30% e abaixo da meta de 40%. O reajuste do cliente cobre a meta.' });
  } else {
    itens.push({ regra: 'Margem mínima de 30% e meta de 40%', estado: 'ATENDE', detalhe: 'O recorte já está na meta. O reajuste de margem do cliente é zero.' });
  }

  if (entrada.teto.status === 'PREMISSA_AUSENTE' || entrada.teto.status === 'INDETERMINADO') {
    itens.push({ regra: 'Teto do fornecedor', estado: 'PREMISSA_AUSENTE', detalhe: entrada.teto.motivo });
  } else if (entrada.teto.teto == null) {
    itens.push({ regra: 'Teto do fornecedor', estado: 'NAO_ATENDE', detalhe: entrada.teto.motivo });
  } else {
    itens.push({
      regra: 'Teto do fornecedor preserva margem e lucro',
      estado: 'ATENDE',
      detalhe: entrada.teto.motivo,
    });
  }

  if (entrada.reajusteMargem.status === 'INDETERMINADO') {
    itens.push({ regra: 'Reajuste do cliente para 40%', estado: 'NAO_SE_APLICA', detalhe: 'Sem base de receita e custo.' });
  } else if (entrada.reajusteMargem.status === 'JA_ATINGE') {
    itens.push({ regra: 'Reajuste do cliente para 40%', estado: 'ATENDE', detalhe: 'A margem operacional já alcança a meta.' });
  } else {
    itens.push({ regra: 'Reajuste do cliente para 40%', estado: 'ATENDE', detalhe: 'O valor indicado leva a margem operacional à meta de 40%.' });
  }

  if (entrada.preservar.status === 'PREMISSA_AUSENTE' || entrada.preservar.status === 'INDETERMINADO') {
    itens.push({ regra: 'Preço para preservar o lucro líquido', estado: 'PREMISSA_AUSENTE', detalhe: entrada.preservar.motivo });
  } else if (entrada.preservar.status === 'LIMITE_DA_BUSCA') {
    itens.push({ regra: 'Preço para preservar o lucro líquido', estado: 'NAO_ATENDE', detalhe: entrada.preservar.motivo });
  } else {
    itens.push({ regra: 'Preço para preservar o lucro líquido', estado: 'ATENDE', detalhe: entrada.preservar.motivo });
  }

  itens.push({
    regra: 'Crédito tributário não é automático',
    estado: entrada.creditoUsadoSemMarca === 0 ? 'ATENDE' : 'NAO_ATENDE',
    detalhe: entrada.creditoUsadoSemMarca === 0
      ? 'Despesa e NF só viram crédito se a simulação marcar o fornecedor.'
      : 'Houve crédito sem marcação. Isso fere a regra.',
  });
  return itens;
}

export function interpretarEmiteNf(valor: unknown): EmiteNf {
  const s = String(valor ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (s === 'sim' || s === 's' || s === 'true' || s === '1') return 'sim';
  if (s === 'nao' || s === 'n' || s === 'false' || s === '0') return 'nao';
  return 'nao_informado';
}

export type EmiteNf = 'sim' | 'nao' | 'nao_informado';
export type SituacaoNf = 'valida' | 'pendente' | 'ausente' | 'mista' | 'duplicada';

export function creditoDaLinha(
  custo: number,
  emite: EmiteNf,
  nf: SituacaoNf,
  marcado: boolean,
  premissas: PremissasFiscais,
): { valor: number; motivo: string } {
  if (!marcado) {
    return { valor: 0, motivo: 'Não marcado. NF e despesa não entram sozinhas como crédito.' };
  }
  if (emite !== 'sim') {
    return { valor: 0, motivo: emite === 'nao' ? 'Fornecedor marcado como não emite NF.' : 'Emissão de NF não informada no cadastro.' };
  }
  if (nf !== 'valida') {
    return { valor: 0, motivo: 'Sem NF válida para o fornecedor neste recorte. Crédito recusado.' };
  }
  if (!(custo > 0)) return { valor: 0, motivo: 'Custo zero.' };
  return { valor: arredondar(custo * (premissas.pis + premissas.cofins)), motivo: 'Crédito informado na simulação sobre o custo com NF válida.' };
}
