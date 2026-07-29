import { canAccessDiretoriaMenu } from '../../diretoriaAccess';
import type { GestorUserContext } from '../types';
import { GC_COMERCIAL_ALLOWED_SCREENS, GESTOR_COMERCIAL_DEF } from './definition';

export function getGcUser(): GestorUserContext {
  try {
    return JSON.parse(localStorage.getItem('userData') || '{}');
  } catch {
    return {};
  }
}

/** Visão plena: Diretoria (menu), role Diretoria/Admin ou permissão * */
export function canAccessGcFull(user: GestorUserContext = getGcUser()): boolean {
  if (canAccessDiretoriaMenu(user)) return true;
  const role = (user.role || '').toLowerCase();
  if (role === 'diretoria' || role === 'administrador') return true;
  if (user.permissions?.includes('*')) return true;
  return false;
}

/** Comercial escopado (carteira própria) */
export function isGcScopedCommercial(user: GestorUserContext = getGcUser()): boolean {
  const role = (user.role || '').toLowerCase();
  return role === 'comercial' && !user.permissions?.includes('*');
}

export function canAccessGcModule(user: GestorUserContext = getGcUser()): boolean {
  if (canAccessGcFull(user)) return true;
  if (isGcScopedCommercial(user)) {
    const perms = user.permissions || [];
    if (perms.some((p) => p === 'gc-dashboard' || p.startsWith('gc-'))) return true;
    // Comercial com acesso a clientes/propostas pode entrar no gestor
    if (perms.includes('clients') || perms.includes('quotes') || perms.includes('clients-group')) return true;
  }
  const perms = user.permissions || [];
  return perms.some((p) => p.startsWith('gc-'));
}

export function canAccessGcScreen(screenId: string, user: GestorUserContext = getGcUser()): boolean {
  if (!screenId.startsWith('gc-') && screenId !== GESTOR_COMERCIAL_DEF.homeScreen) return false;
  if (!canAccessGcModule(user)) return false;
  if (canAccessGcFull(user)) return true;

  // Comercial escopado: nunca telas estratégicas globais
  if (!GC_COMERCIAL_ALLOWED_SCREENS.has(screenId)) return false;
  const perms = user.permissions || [];
  if (perms.includes(screenId) || perms.includes('gc-dashboard')) return true;
  if (perms.includes('clients') || perms.includes('quotes')) return true;
  return false;
}

/** Pode ver margem/lucro/global — nunca comercial escopado */
export function canViewGcStrategicMetrics(user: GestorUserContext = getGcUser()): boolean {
  return canAccessGcFull(user);
}

/** Pode ver dados de outro comercial */
export function canViewAllReps(user: GestorUserContext = getGcUser()): boolean {
  return canAccessGcFull(user);
}
