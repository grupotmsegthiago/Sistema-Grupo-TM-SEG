/**
 * Regras de visibilidade da lista de OS (MissionTable).
 * Isolamento por cliente é client-side — admin/liberação financeira devem ver tudo.
 */

import { isFinanceProfileRole, isFinanceSupervisorName } from './financeSupervisorAccess';
import { isPerfilComercial } from './diretoriaAccess';

export type MissionAccessUser = {
  role?: string | null;
  name?: string | null;
  permissions?: string[] | null;
  clientId?: string | null;
};

/** Administrador (ou acesso total / supervisão financeira) — libera OS para faturamento e vê todas. */
export function hasFullMissionListAccess(user: MissionAccessUser | null | undefined): boolean {
  if (!user) return false;
  if (Array.isArray(user.permissions) && user.permissions.includes('*')) return true;
  const roleLower = String(user.role || '').toLowerCase().trim();
  if (roleLower === 'administrador') return true;
  // Bárbara / Giovanna — independente do rótulo exato do perfil no banco.
  if (isFinanceSupervisorName(user.name)) return true;
  return false;
}

/**
 * Perfil Financeiro não baixa o quadro de OS ao abrir o painel.
 * A OS entra só quando a pessoa consulta no filtro (número, cliente, placa, motorista).
 * Administrador e acesso total (*) continuam com a lista completa.
 * Bárbara / Giovanna no perfil Financeiro também consultam sob demanda — o nome
 * segue liberando faturamento (hasFullMissionListAccess), sem baixar o quadro.
 */
export function financeiroConsultaOsSobDemanda(user: MissionAccessUser | null | undefined): boolean {
  if (!user) return false;
  if (Array.isArray(user.permissions) && user.permissions.includes('*')) return false;
  const roleLower = String(user.role || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (roleLower === 'administrador') return false;
  return isFinanceProfileRole(user.role);
}

/**
 * Visão restrita a cliente (portal / client_view / comercial com carteira).
 * Administrador nunca é restrito — mesmo com client_view:* no perfil.
 */
export function isMissionClientScopeRestricted(user: MissionAccessUser | null | undefined): boolean {
  if (!user) return false;
  if (hasFullMissionListAccess(user)) return false;
  if (user.clientId) return true;
  if (isPerfilComercial(user)) return true;
  if (Array.isArray(user.permissions) && user.permissions.some((p) => String(p).startsWith('client_view:'))) {
    return true;
  }
  return false;
}
