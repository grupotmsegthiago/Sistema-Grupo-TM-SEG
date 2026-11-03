/**
 * Fase 2 da homologação real. A flag nasce desligada e não há escrita.
 * O Centro de Homologação atual não importa este módulo.
 */
export { FLAG_HOMOLOGACAO_REAL, homologacaoRealHabilitada } from './flag';
export { autorizarHomologacao, autorizarIdentidade } from './politicaAcesso';
export { bloqueiosDaHomologacao } from './regras';
export { RepositorioMemoria } from './repositorioMemoria';
export { CATALOGO_FIXTURE, REFERENCIA_PROTEGIDA, identidadeDiretoria } from './fixtures';
export { criarServicoHomologacao } from './servico';
export { ORIGEM_DADOS_FASE_2, PERMISSAO_FUTURA_HOMOLOGAR } from './tipos';
export type {
  EventoDecisao,
  IdentidadeServidor,
  ImpactoCalculado,
  LancamentoProtegido,
  PedidoDecisao,
  ResultadoDecisao,
  StatusHomologacao,
} from './tipos';
