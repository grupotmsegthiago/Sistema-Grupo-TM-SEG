/**
 * Regras da futura homologação. Não recalculam o motor canônico e não leem o banco.
 */
import type { CodigoBloqueio, ClassificacaoGerencial, LancamentoProtegido, PedidoDecisao } from './tipos';

const NATUREZAS_FORA = new Set<ClassificacaoGerencial>([
  'contabil',
  'tributaria',
  'tributo',
  'investimento',
  'transferencia',
  'custo_os',
  'pendente',
]);

export interface Bloqueio {
  codigo: CodigoBloqueio;
  motivo: string;
}

export function bloqueiosDaHomologacao(lancamento: LancamentoProtegido | null, pedido: PedidoDecisao): Bloqueio[] {
  if (!pedido.justificativa.trim()) {
    return [{ codigo: 'justificativa_ausente', motivo: 'A decisão precisa de justificativa.' }];
  }
  if (!lancamento) {
    return [{ codigo: 'lancamento_ausente', motivo: 'O lançamento não está na base protegida desta simulação.' }];
  }
  const lista: Bloqueio[] = [];
  if (lancamento.cancelado) lista.push({ codigo: 'cancelado', motivo: 'Lançamento cancelado não entra na homologação.' });
  if (lancamento.cnpjAmbiguo || lancamento.empresaId == null || lancamento.cnpj == null) {
    lista.push({ codigo: 'cnpj_ambiguo', motivo: 'CNPJ ambíguo ou indefinido. A conta que pagou não escolhe a empresa.' });
  }
  if (pedido.empresaId == null || pedido.cnpj == null) {
    lista.push({ codigo: 'sem_empresa', motivo: 'A decisão não pode gravar empresa vazia.' });
  } else if (lancamento.empresaId && (pedido.empresaId !== lancamento.empresaId || pedido.cnpj !== lancamento.cnpj)) {
    lista.push({ codigo: 'empresa_divergente', motivo: 'A empresa do pedido não é a empresa da evidência.' });
  }
  if (pedido.valorConsideradoCentavos !== lancamento.valorCentavos) {
    lista.push({ codigo: 'valor_alterado', motivo: 'O valor considerado difere do lançamento original.' });
  }
  if (lancamento.jaNoResultado) {
    lista.push({ codigo: 'ja_no_resultado', motivo: 'Esta despesa já está no resultado. Nova dedução seria contagem dupla.' });
  }
  if (pedido.classificacao !== lancamento.classificacao || NATUREZAS_FORA.has(lancamento.classificacao)) {
    lista.push({ codigo: 'natureza_fora', motivo: 'Só despesa gerencial pode abater o resultado operacional. Fornecedor, tributo, investimento, transferência e ajuste contábil ficam de fora.' });
  }
  if (lancamento.documentoObrigatorio && (!lancamento.documentoInformado || !pedido.referenciaDocumental.trim())) {
    lista.push({ codigo: 'sem_documento', motivo: 'A homologação real futura exige a referência documental. Documento vazio não basta.' });
  }
  if (!lancamento.elegivel) lista.push({ codigo: 'nao_elegivel', motivo: 'Lançamento fora da lista elegível.' });
  return lista;
}
