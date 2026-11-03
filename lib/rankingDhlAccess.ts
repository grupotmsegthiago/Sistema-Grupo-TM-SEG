/**
 * Ranking DHL (prêmio) — só Diretoria e Financeiro.
 * Não herda de Administrador, Avançado, Operador nem do curinga `*`.
 */

import { isPerfilDiretoria, isPerfilFinanceiro } from './aprovacoesPendentesAccess';

export type RankingDhlUser = {
  role?: string | null;
};

export function canViewRankingDhl(user: RankingDhlUser | null | undefined): boolean {
  return isPerfilFinanceiro(user) || isPerfilDiretoria(user);
}
