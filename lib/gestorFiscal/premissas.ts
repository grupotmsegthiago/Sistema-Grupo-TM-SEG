/**
 * Premissas editáveis do Gestor Fiscal.
 * Não são alíquota universal da empresa e não substituem a contabilidade.
 * A alíquota do Simples começa vazia de propósito: sem número informado, o tributo não é inventado.
 */

export interface PremissasFiscais {
  /** Fração sobre a receita. null = a diretoria ainda não informou. */
  simplesAliquotaEfetiva: number | null;
  irpj: number;
  irpjAdicional: number;
  /** Teto mensal de lucro tributável acima do qual incide o adicional. Premissa, não tabela gravada. */
  limiteAdicionalMensal: number;
  csll: number;
  pis: number;
  cofins: number;
  iss: number;
  /** Outras alíquotas sobre a receita, somadas na base. Zero até a contabilidade informar. */
  outrasSobreReceita: number;
  margemMinima: number;
  margemIdeal: number;
  /** Crédito de PIS/COFINS acima do débito não vira restituição enquanto isto estiver falso. */
  creditoRestituivel: boolean;
  /** Valor que a diretoria diz ter compensado. Não existe coluna no banco. */
  compensacaoInformada: number;
  aplicarCompensacao: boolean;
}

export const PREMISSAS_INICIAIS: PremissasFiscais = {
  simplesAliquotaEfetiva: null,
  irpj: 0.15,
  irpjAdicional: 0.10,
  limiteAdicionalMensal: 20_000,
  csll: 0.09,
  pis: 0.0165,
  cofins: 0.076,
  iss: 0,
  outrasSobreReceita: 0,
  margemMinima: 0.30,
  margemIdeal: 0.40,
  creditoRestituivel: false,
  compensacaoInformada: 0,
  aplicarCompensacao: false,
};

export const ROTULOS_PREMISSA: { chave: keyof PremissasFiscais; rotulo: string; origem: string }[] = [
  { chave: 'simplesAliquotaEfetiva', rotulo: 'Alíquota efetiva do Simples', origem: 'Informada nesta tela. Não há percentual fixo no código.' },
  { chave: 'irpj', rotulo: 'IRPJ', origem: 'Premissa inicial 15% sobre o lucro tributável do mês. Editável.' },
  { chave: 'irpjAdicional', rotulo: 'Adicional de IRPJ', origem: 'Premissa inicial 10% só acima do limite mensal. Editável.' },
  { chave: 'limiteAdicionalMensal', rotulo: 'Limite mensal do adicional', origem: 'Premissa inicial R$ 20.000 por mês. Não soma o período inteiro num limite só.' },
  { chave: 'csll', rotulo: 'CSLL', origem: 'Premissa inicial 9% sobre o lucro tributável do mês. Editável.' },
  { chave: 'pis', rotulo: 'PIS', origem: 'Premissa inicial 1,65% sobre a receita. Editável.' },
  { chave: 'cofins', rotulo: 'COFINS', origem: 'Premissa inicial 7,6% sobre a receita. Editável.' },
  { chave: 'iss', rotulo: 'ISS', origem: 'Começa em zero. A contabilidade informa a alíquota do município.' },
  { chave: 'outrasSobreReceita', rotulo: 'Outras alíquotas sobre a receita', origem: 'Começa em zero.' },
  { chave: 'margemMinima', rotulo: 'Margem operacional mínima', origem: 'Regra desta etapa: 30%.' },
  { chave: 'margemIdeal', rotulo: 'Margem operacional ideal', origem: 'Regra desta etapa: 40%.' },
];

export function aliquotaValida(valor: number | null): boolean {
  return valor != null && Number.isFinite(valor) && valor >= 0 && valor < 1;
}
