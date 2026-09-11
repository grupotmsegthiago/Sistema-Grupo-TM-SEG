/**
 * Fonte única de verdade para menu e deep-link:
 * aparece o que está vinculado ao perfil (permissions);
 * o que não está vinculado fica oculto / bloqueado.
 *
 * Restrições extras (AND) só para telas sensíveis já homologadas.
 */

import { NAV_ITEMS } from './navItems';
import {
  canAccessDiretoriaMenu,
  canAccessComissoesComerciais,
  canAccessFaturamentoDiretoria,
  DIRETORIA_MENU_SCREEN_IDS,
} from './diretoriaAccess';
import { canAccessMissionReport } from './missionReportAccess';
import { canViewOsAnalysisPendencies } from './osAnalysisAccess';

export type ScreenAccessUser = {
  name?: string | null;
  role?: string | null;
  permissions?: string[] | null;
  clientId?: string | null;
};

/** Telas de formulário / workspace herdam a permissão da tela-mãe do menu. */
export const SCREEN_PERMISSION_ALIASES: Record<string, string> = {
  'new-mission': 'missions',
  'client-form': 'clients',
  'client-user-form': 'client-users',
  'client-vehicle-form': 'client-vehicles',
  'client-route-form': 'client-routes',
  'quote-form': 'quotes',
  'provider-form': 'providers',
  'provider-user-form': 'provider-users',
  'provider-vehicle-form': 'provider-vehicles',
  'provider-agent-form': 'provider-agents',
  'provider-technology-form': 'provider-technologies',
  'internal-user-form': 'internal-users',
  'profile-form': 'profiles',
  'manual-override-settings': 'system-settings',
  'rh-employee-workspace': 'rh-employees',
  'rh-employee-form': 'rh-employees',
  'rh-employee-profile': 'rh-employees',
  'ai-support': 'dashboard',
};

/** Áreas internas bloqueadas para usuário-cliente do portal. */
const CLIENT_FORBIDDEN_IDS = new Set([
  'finance-group',
  'fin-dashboard',
  'fin-billing',
  'fin-daily-movement',
  'fin-invoices',
  'fin-transactions',
  'fin-report',
  'fin-dre',
  'fin-accounts',
  'fin-categories',
  'fin-vendor-verification',
  'fin-dhl-noncompliant',
  'providers-group',
  'providers',
  'provider-activation-map',
  'alvara-control',
  'provider-users',
  'provider-vehicles',
  'provider-agents',
  'provider-technologies',
  'settings-group',
  'db-maintenance',
  'cost-optimization',
  'internal-users',
  'equipment-manager',
  'profiles',
  'system-settings',
  'system-logs',
  'server-stats',
  'manual-override-settings',
  'diretoria-group',
  'diretoria-cockpit',
  'diretoria-faturamento',
  'comissoes-comerciais',
  'gestao-investimento',
  'os-analysis-pending',
  'rh-group',
  'rh-dashboard',
  'rh-employees',
  'rh-timeclock',
  'clients',
  'clients-group',
  'shift-handover',
  'support-network',
  'legal-dashboard',
]);

function normalizePerms(user: ScreenAccessUser | null | undefined): string[] {
  return Array.isArray(user?.permissions) ? user!.permissions!.filter((p) => typeof p === 'string') : [];
}

export function resolvePermissionId(screenId: string): string {
  return SCREEN_PERMISSION_ALIASES[screenId] || screenId;
}

export function isRestrictedClientUser(user: ScreenAccessUser | null | undefined): boolean {
  if (!user) return false;
  if (user.clientId) return true;
  return normalizePerms(user).some((p) => p.startsWith('client_view:'));
}

export function hasWildcardAccess(user: ScreenAccessUser | null | undefined): boolean {
  return normalizePerms(user).includes('*');
}

/**
 * Permissão explícita no perfil/usuário (ou `*`).
 * Sem bypass por role e sem herdar filho a partir do grupo pai
 * (desmarcar uma tela no perfil precisa ocultá-la).
 */
export function hasProfilePermission(user: ScreenAccessUser | null | undefined, screenId: string): boolean {
  if (!user) return false;
  const perms = normalizePerms(user);
  if (perms.includes('*')) return true;
  const id = resolvePermissionId(screenId);
  return perms.includes(id);
}

function isClientForbidden(screenId: string): boolean {
  const id = resolvePermissionId(screenId);
  if (CLIENT_FORBIDDEN_IDS.has(id)) return true;
  if (id.startsWith('fin-') || id.startsWith('provider-') || id.startsWith('rh-') || id.startsWith('diretoria-')) {
    return true;
  }
  return false;
}

function childrenOfGroup(groupId: string): string[] {
  const group = NAV_ITEMS.find((i) => i.id === groupId);
  return group?.children?.map((c) => c.id) || [];
}

/**
 * Pode abrir/ver a tela?
 * 1) Cliente restrito: bloqueio duro de áreas internas
 * 2) Telas exclusivas (Thiagos / Diretoria / regras já homologadas)
 * 3) Caso geral: só o que está em profiles.permissions ∪ system_users.permissions
 */
export function canAccessScreen(user: ScreenAccessUser | null | undefined, screenId: string): boolean {
  if (!user || !screenId) return false;

  if (isRestrictedClientUser(user) && isClientForbidden(screenId)) {
    return false;
  }

  // Dashboard é a home segura de qualquer usuário autenticado (mesmo sem item no perfil).
  if (screenId === 'dashboard') return true;

  // Cockpit / Gestão Investimento: exclusivo dos Thiagos (não basta perfil).
  if (DIRETORIA_MENU_SCREEN_IDS.has(screenId)) {
    return canAccessDiretoriaMenu(user);
  }

  // Faturamento / Comissões: perfil Diretoria E tela vinculada (ou *).
  if (screenId === 'diretoria-faturamento') {
    return canAccessFaturamentoDiretoria(user) && hasProfilePermission(user, screenId);
  }
  if (screenId === 'comissoes-comerciais') {
    return canAccessComissoesComerciais(user) && hasProfilePermission(user, screenId);
  }

  // Pendências de OS: regra homologada (Thiagos / Diretoria).
  if (screenId === 'os-analysis-pending') {
    return canViewOsAnalysisPendencies(user);
  }

  // Relatório de OS: helper já inclui permissão `mission-report` + allowlist.
  if (screenId === 'mission-report') {
    return canAccessMissionReport(user);
  }

  // Grupos do menu: visível somente se algum filho estiver acessível.
  if (screenId.endsWith('-group')) {
    return childrenOfGroup(screenId).some((childId) => canAccessScreen(user, childId));
  }

  return hasProfilePermission(user, screenId);
}

/** Home segura quando a tela pedida não está liberada. */
export function fallbackScreenForUser(user: ScreenAccessUser | null | undefined): string {
  // Preferir o que realmente está no perfil (dashboard "sempre aberto" não conta aqui).
  if (hasProfilePermission(user, 'dashboard')) return 'dashboard';
  if (hasProfilePermission(user, 'missions') || canAccessScreen(user, 'missions')) return 'missions';
  for (const item of NAV_ITEMS) {
    if (item.children?.length) {
      for (const child of item.children) {
        if (child.id === 'dashboard') continue;
        if (canAccessScreen(user, child.id)) return child.id;
      }
    } else if (item.id !== 'dashboard' && canAccessScreen(user, item.id)) {
      return item.id;
    }
  }
  return 'dashboard';
}
