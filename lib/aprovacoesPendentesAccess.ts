/**
 * Aprovações Pendentes — perfis Financeiro e Diretoria.
 * Não herda de Administrador nem do curinga `*`.
 */

export type AprovacoesPendentesUser = {
  name?: string | null;
  role?: string | null;
  permissions?: string[] | null;
};

export const APROVACOES_PENDENTES_SCREEN = 'fin-aprovacoes-pendentes';

/** Mesma data da fila de aprovação do Painel de OS. */
export const APROVACOES_PENDENTES_DESDE = '2026-03-03T00:00:00-03:00';

/** Controle Diário → Sem aprovação: agosto/2026 em diante. */
export const SEM_APROVACAO_DESDE = '2026-08-01T00:00:00-03:00';

export const SEM_APROVACAO_POR_PAGINA = 10;

function perfilNormalizado(user: AprovacoesPendentesUser | null | undefined): string {
  return String(user?.role || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function isPerfilFinanceiro(user: AprovacoesPendentesUser | null | undefined): boolean {
  return perfilNormalizado(user) === 'financeiro';
}

export function isPerfilDiretoria(user: AprovacoesPendentesUser | null | undefined): boolean {
  return perfilNormalizado(user) === 'diretoria';
}

export function canViewAprovacoesPendentes(user: AprovacoesPendentesUser | null | undefined): boolean {
  return isPerfilFinanceiro(user) || isPerfilDiretoria(user);
}
