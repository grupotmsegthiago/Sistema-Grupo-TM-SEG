/**
 * Contratos da fase 2. Nada aqui grava lançamento, OS ou nota.
 * A decisão é um registro próprio. Ela não substitui o lançamento original.
 */

export const PERMISSAO_FUTURA_HOMOLOGAR = 'gestor-fiscal-homologar';
export const ORIGEM_DADOS_FASE_2 = 'memoria-local-fase-2';

export type EmpresaHomologacao = 'TM GESTAO' | 'TM SEGURANCA' | 'TM SECURITY';

export type StatusHomologacao =
  | 'preparada'
  | 'homologada_simulada'
  | 'rejeitada_simulada'
  | 'documentacao_solicitada'
  | 'revogada_simulada';

export type ClassificacaoGerencial =
  | 'gerencial'
  | 'contabil'
  | 'tributaria'
  | 'tributo'
  | 'investimento'
  | 'transferencia'
  | 'custo_os'
  | 'pendente';

export interface LancamentoProtegido {
  id: string;
  empresaId: EmpresaHomologacao | null;
  cnpj: string | null;
  valorCentavos: number;
  classificacao: ClassificacaoGerencial;
  cancelado: boolean;
  jaNoResultado: boolean;
  documentoObrigatorio: boolean;
  documentoInformado: boolean;
  cnpjAmbiguo: boolean;
  elegivel: boolean;
  origemDados: 'fixture-ficticia';
}

export interface IdentidadeServidor {
  origem: 'servidor' | 'navegador';
  autenticado: boolean;
  usuarioId: string;
  perfilDiretoria: boolean;
  permissoes: readonly string[];
  empresasAutorizadas: readonly string[];
}

export interface PedidoDecisao {
  chaveIdempotencia: string;
  lancamentoId: string;
  empresaId: EmpresaHomologacao | null;
  cnpj: string | null;
  valorConsideradoCentavos: number;
  classificacao: ClassificacaoGerencial;
  justificativa: string;
  referenciaDocumental: string;
  evidencias: readonly string[];
  versaoEsperada: number;
}

export interface EventoDecisao {
  id: string;
  lancamentoId: string;
  empresaId: EmpresaHomologacao | null;
  cnpj: string | null;
  status: StatusHomologacao;
  valorConsideradoCentavos: number;
  classificacao: ClassificacaoGerencial;
  usuarioId: string;
  decididoEm: string;
  justificativa: string;
  referenciaDocumental: string;
  versao: number;
  decisaoAnteriorId: string | null;
  origemDados: typeof ORIGEM_DADOS_FASE_2;
  evidencias: readonly string[];
  chaveIdempotencia: string;
  homologacaoReal: false;
}

export interface TentativaRecusada {
  id: string;
  em: string;
  usuarioInformado: string;
  origem: IdentidadeServidor['origem'];
  lancamentoId: string | null;
  codigo: string;
  motivo: string;
}

export interface ImpactoEmpresa {
  empresaId: EmpresaHomologacao;
  receitaCentavos: number;
  custoOsCentavos: number;
  despesaHomologadaCentavos: number;
  resultadoCentavos: number;
}

export interface ImpactoCalculado {
  receitaCentavos: number;
  custoOsCentavos: number;
  despesaReconhecidaCentavos: number;
  despesaHomologadaCentavos: number;
  resultadoCentavos: number;
  porEmpresa: ImpactoEmpresa[];
  homologacaoReal: false;
}

export type CodigoBloqueio =
  | 'nao_autenticado'
  | 'origem_navegador'
  | 'sem_permissao'
  | 'empresa_nao_autorizada'
  | 'ativacao_desligada'
  | 'escrita_nao_disponivel'
  | 'lancamento_ausente'
  | 'cancelado'
  | 'nao_elegivel'
  | 'cnpj_ambiguo'
  | 'sem_empresa'
  | 'empresa_divergente'
  | 'valor_alterado'
  | 'ja_no_resultado'
  | 'natureza_fora'
  | 'sem_documento'
  | 'duplicidade'
  | 'conflito_versao'
  | 'conflito_idempotencia'
  | 'revogada_nao_reativa'
  | 'justificativa_ausente'
  | 'decisao_ausente';

export interface FalhaDecisao {
  ok: false;
  codigo: CodigoBloqueio;
  motivo: string;
}

export interface SucessoDecisao {
  ok: true;
  decisao: EventoDecisao;
  historico: readonly EventoDecisao[];
  impacto: ImpactoCalculado;
  repetida: boolean;
}

export type ResultadoDecisao = SucessoDecisao | FalhaDecisao;
