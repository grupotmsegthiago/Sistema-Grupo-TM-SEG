/**
 * Auditoria de Faturamento.
 * Só a Diretoria e o Financeiro autorizado (Bárbara, Giovanna Marsili e ANA.FERNANDES).
 * Administrador, Avançado e Operador não entram, nem com permissão * nem pelo nome.
 */
import { isFinanceProfileRole, isFinanceSupervisorName } from './financeSupervisorAccess';

export type UsuarioAuditoriaFaturamento = {
  name?: string | null;
  role?: string | null;
  permissions?: string[] | null;
};

const PAPEIS_BLOQUEADOS = new Set(['administrador', 'avancado', 'operador']);

export function perfilAuditoria(role: string | null | undefined): string {
  return String(role || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function podeAcessarAuditoriaFaturamento(
  user: UsuarioAuditoriaFaturamento | null | undefined,
): boolean {
  if (!user) return false;
  const papel = perfilAuditoria(user.role);
  if (!papel || PAPEIS_BLOQUEADOS.has(papel)) return false;
  if (papel === 'diretoria') return true;
  return isFinanceProfileRole(user.role) && isFinanceSupervisorName(user.name);
}

export function motivoSemAuditoriaFaturamento(
  user: UsuarioAuditoriaFaturamento | null | undefined,
): string {
  if (podeAcessarAuditoriaFaturamento(user)) return '';
  return 'Sem acesso à auditoria de faturamento.';
}
