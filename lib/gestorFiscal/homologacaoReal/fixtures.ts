/**
 * Cópias sanitizadas dos totais da etapa 7. Não há identificador real, nome de pessoa nem documento.
 * Os valores servem para proteger as regras. Não são homologação.
 */
import { ITENS_SIMULADOS, REFERENCIA_ETAPA_7 } from '../centroHomologacao';
import type { IdentidadeServidor, LancamentoProtegido } from './tipos';

const INDEFINIDO = ITENS_SIMULADOS.find((item) => item.id === 'SIM-INDEF-CNPJ');
if (!INDEFINIDO) throw new Error('A referência dos cinco lançamentos sem CNPJ sumiu do centro.');

export const REFERENCIA_PROTEGIDA = {
  listaSegurancaCentavos: REFERENCIA_ETAPA_7.listaSegurancaCentavos,
  adicionalGestaoCentavos: REFERENCIA_ETAPA_7.adicionalGestaoCentavos,
  jaReconhecidoCentavos: REFERENCIA_ETAPA_7.jaReconhecidoCentavos,
  securityElegivelCentavos: REFERENCIA_ETAPA_7.adicionalSecurityCentavos - REFERENCIA_ETAPA_7.atribuicaoPendenteCentavos,
  securityAmbiguoCentavos: REFERENCIA_ETAPA_7.atribuicaoPendenteCentavos,
  semCnpjCentavos: INDEFINIDO.valorCentavos,
  painelCentavos: REFERENCIA_ETAPA_7.grupo.resultadoPainelCentavos,
  aptoHistoricoCentavos: REFERENCIA_ETAPA_7.grupo.resultadoAptoCentavos,
  elegivelCentavos: REFERENCIA_ETAPA_7.grupo.resultadoElegivelCentavos,
} as const;

const base = {
  cancelado: false,
  jaNoResultado: false,
  documentoObrigatorio: true,
  documentoInformado: true,
  cnpjAmbiguo: false,
  elegivel: true,
  origemDados: 'fixture-ficticia' as const,
};

export const CATALOGO_FIXTURE: readonly LancamentoProtegido[] = [
  { ...base, id: 'fx-seg-lista', empresaId: 'TM SEGURANCA', cnpj: 'FX-SEG', valorCentavos: REFERENCIA_PROTEGIDA.listaSegurancaCentavos, classificacao: 'gerencial' },
  { ...base, id: 'fx-gest-adicional', empresaId: 'TM GESTAO', cnpj: 'FX-GEST', valorCentavos: REFERENCIA_PROTEGIDA.adicionalGestaoCentavos, classificacao: 'gerencial' },
  { ...base, id: 'fx-sec-tarifas', empresaId: 'TM SECURITY', cnpj: 'FX-SEC', valorCentavos: REFERENCIA_PROTEGIDA.securityElegivelCentavos, classificacao: 'gerencial' },
  { ...base, id: 'fx-gest-reconhecido', empresaId: 'TM GESTAO', cnpj: 'FX-GEST', valorCentavos: REFERENCIA_PROTEGIDA.jaReconhecidoCentavos, classificacao: 'gerencial', jaNoResultado: true, elegivel: false },
  { ...base, id: 'fx-sec-ambiguo', empresaId: null, cnpj: null, valorCentavos: REFERENCIA_PROTEGIDA.securityAmbiguoCentavos, classificacao: 'pendente', cnpjAmbiguo: true, elegivel: false, documentoInformado: false },
  { ...base, id: 'fx-sem-cnpj', empresaId: null, cnpj: null, valorCentavos: REFERENCIA_PROTEGIDA.semCnpjCentavos, classificacao: 'pendente', cnpjAmbiguo: true, elegivel: false, documentoInformado: false },
  { ...base, id: 'fx-fornecedor', empresaId: 'TM SEGURANCA', cnpj: 'FX-SEG', valorCentavos: 100_000, classificacao: 'custo_os', elegivel: false },
  { ...base, id: 'fx-cancelado', empresaId: 'TM SEGURANCA', cnpj: 'FX-SEG', valorCentavos: 100, classificacao: 'gerencial', cancelado: true, elegivel: false },
  { ...base, id: 'fx-sem-documento', empresaId: 'TM SEGURANCA', cnpj: 'FX-SEG', valorCentavos: 250, classificacao: 'gerencial', documentoInformado: false },
];

export function identidadeDiretoria(empresas: readonly string[] = ['TM GESTAO', 'TM SEGURANCA', 'TM SECURITY']): IdentidadeServidor {
  return {
    origem: 'servidor',
    autenticado: true,
    usuarioId: 'usr-diretoria-fx',
    perfilDiretoria: true,
    permissoes: ['gestor-fiscal-homologar'],
    empresasAutorizadas: empresas,
  };
}
