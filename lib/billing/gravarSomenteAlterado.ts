/**
 * Salvamento da auditoria de faturamento.
 * O UPDATE leva só a coluna que a pessoa editou. Receita, custo, pedágio
 * e deslocamento que não foram mexidos ficam como estão no banco.
 * O motor da OS não entra neste patch.
 */

export type EdicaoAuditoria = {
  receita: boolean;
  custo: boolean;
  pedagioCliente: boolean;
  pedagioFornecedor: boolean;
  deslocamentoCliente: boolean;
  deslocamentoFornecedor: boolean;
};

export type ValoresEditadosAuditoria = {
  receitaServico: number;
  custoServico: number;
  pedagioCliente: number;
  pedagioFornecedor: number;
  deslocamentoCliente: number;
  deslocamentoFornecedor: number;
  mesmaOs: boolean;
};

const r2 = (valor: number) => Math.round((Number(valor) || 0) * 100) / 100;

/** Colunas de missions que este salvamento pode escrever. */
export function colunasDaEdicao(
  edicao: EdicaoAuditoria,
  valores: ValoresEditadosAuditoria,
): Record<string, number> {
  const colunas: Record<string, number> = {};
  if (edicao.receita) colunas.revenue_value = r2(valores.receitaServico);
  if (edicao.custo) colunas.cost_value = valores.mesmaOs ? 0 : r2(valores.custoServico);
  if (edicao.pedagioCliente) colunas.toll_value = r2(valores.pedagioCliente);
  if (edicao.pedagioFornecedor) {
    colunas.toll_value_provider = valores.mesmaOs ? 0 : r2(valores.pedagioFornecedor);
  }
  if (edicao.deslocamentoCliente) colunas.displacement_value = r2(valores.deslocamentoCliente);
  if (edicao.deslocamentoFornecedor) {
    colunas.displacement_value_provider = valores.mesmaOs ? 0 : r2(valores.deslocamentoFornecedor);
  }
  return colunas;
}

const CHAVE_NO_SNAPSHOT: Record<string, string> = {
  revenue_value: 'revenueServiceOnly',
  cost_value: 'costServiceOnly',
  toll_value: 'tollVal',
  toll_value_provider: 'tollProvider',
  displacement_value: 'displacementVal',
  displacement_value_provider: 'displacementProvider',
};

/** O total do cliente é serviço + pedágio + deslocamento. Custo não entra. */
const ENTRA_NO_TOTAL_CLIENTE = new Set(['revenueServiceOnly', 'tollVal', 'displacementVal']);

/**
 * Copia o snapshot já gravado e troca só a chave do campo editado.
 * Franquia, km extra e hora extra permanecem.
 */
export function snapshotComSomenteOAlterado(
  snapshot: Record<string, unknown> | null | undefined,
  colunas: Record<string, number>,
): Record<string, unknown> | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const chaves = Object.keys(colunas).filter((coluna) => CHAVE_NO_SNAPSHOT[coluna]);
  if (!chaves.length) return null;
  const proximo: Record<string, unknown> = { ...snapshot };
  let deltaTotal = 0;
  let mexeTotal = false;
  for (const coluna of chaves) {
    const chave = CHAVE_NO_SNAPSHOT[coluna];
    const novo = colunas[coluna];
    const antigoBruto = Number(snapshot[chave] ?? 0);
    const antigo = Number.isFinite(antigoBruto) ? antigoBruto : 0;
    if (ENTRA_NO_TOTAL_CLIENTE.has(chave) && Number.isFinite(Number(snapshot.totalGeral))) {
      deltaTotal += novo - antigo;
      mexeTotal = true;
    }
    proximo[chave] = novo;
  }
  if (mexeTotal) proximo.totalGeral = r2(Number(snapshot.totalGeral) + deltaTotal);
  return proximo;
}

/** Número operacional só entra no UPDATE quando o texto digitado é outro. */
export function valorOperacionalAlterado(
  atual: unknown,
  informado: string,
  permitirVazio = false,
): number | null | undefined {
  const texto = String(informado || '').trim().replace(',', '.');
  if (!texto) {
    if (!permitirVazio) return undefined;
    if (atual == null || atual === '') return undefined;
    return null;
  }
  const numero = Number(texto);
  if (!Number.isFinite(numero) || numero < 0) return undefined;
  const novo = r2(numero);
  if (atual != null && atual !== '' && Math.abs(Number(atual) - novo) <= 0.009) return undefined;
  return novo;
}

/** Texto operacional só entra no UPDATE quando é diferente do gravado. */
export function textoSeAlterado(atual: unknown, informado: string): string | undefined {
  const novo = String(informado || '').trim();
  if (!novo) return undefined;
  if (novo === String(atual || '').trim()) return undefined;
  return novo;
}
