/**
 * Política futura. Não altera screenAccess, RLS nem autenticação.
 * A identidade precisa nascer no servidor. O navegador não é prova.
 */
import { PERMISSAO_FUTURA_HOMOLOGAR, type CodigoBloqueio, type IdentidadeServidor } from './tipos';

export interface Autorizacao {
  permitido: boolean;
  codigo: CodigoBloqueio | null;
  motivo: string;
}

export function autorizarIdentidade(identidade: IdentidadeServidor): Autorizacao {
  if (!identidade.autenticado || !identidade.usuarioId) {
    return { permitido: false, codigo: 'nao_autenticado', motivo: 'A decisão exige usuário autenticado no servidor.' };
  }
  if (identidade.origem !== 'servidor') {
    return { permitido: false, codigo: 'origem_navegador', motivo: 'Dados de usuário enviados pelo navegador não autorizam a decisão.' };
  }
  if (!identidade.perfilDiretoria || !identidade.permissoes.includes(PERMISSAO_FUTURA_HOMOLOGAR)) {
    return { permitido: false, codigo: 'sem_permissao', motivo: 'Só a Diretoria com a permissão específica de homologação pode decidir.' };
  }
  return { permitido: true, codigo: null, motivo: '' };
}

export function autorizarHomologacao(identidade: IdentidadeServidor, empresaId: string | null): Autorizacao {
  const base = autorizarIdentidade(identidade);
  if (!base.permitido) return base;
  if (!empresaId || !identidade.empresasAutorizadas.includes(empresaId)) {
    return { permitido: false, codigo: 'empresa_nao_autorizada', motivo: 'O usuário não está autorizado para o CNPJ desta despesa.' };
  }
  return { permitido: true, codigo: null, motivo: '' };
}
