import { canAccessScreen } from '../screenAccess';

export interface RhUserContext {
  id?: string;
  name?: string;
  role?: string;
  permissions?: string[];
  employeeId?: string;
}

export function getRhUser(): RhUserContext {
  try {
    return JSON.parse(localStorage.getItem('userData') || '{}');
  } catch {
    return {};
  }
}

export function isRhAdmin(user: RhUserContext = getRhUser()): boolean {
  const role = (user.role || '').toLowerCase();
  return role === 'administrador' || role === 'diretoria' || user.permissions?.includes('*') || false;
}

export function isRhFinance(user: RhUserContext = getRhUser()): boolean {
  const role = (user.role || '').toLowerCase();
  return isRhAdmin(user) || role === 'financeiro' || user.permissions?.includes('rh-salaries') || false;
}

/**
 * Módulo RH na UI: só o que estiver vinculado ao perfil (`permissions`).
 * Role sozinho (Diretoria/RH) NÃO libera mais o menu.
 */
export function canAccessRhModule(user: RhUserContext = getRhUser()): boolean {
  return (
    canAccessScreen(user, 'rh-group')
    || canAccessScreen(user, 'rh-dashboard')
    || canAccessScreen(user, 'rh-employees')
    || canAccessScreen(user, 'rh-timeclock')
  );
}

/** Telas de cadastro/custos de funcionários — exigem `rh-employees` no perfil. */
export const RH_EMPLOYEES_SCREENS = [
  'rh-employees',
  'rh-employee-workspace',
  'rh-employee-form',
  'rh-employee-profile',
] as const;

export function canAccessEmployeesScreen(user: RhUserContext = getRhUser()): boolean {
  return canAccessScreen(user, 'rh-employees');
}

export function canViewEmployeeCosts(user: RhUserContext = getRhUser()): boolean {
  return canAccessEmployeesScreen(user);
}

export function canEditRh(user: RhUserContext = getRhUser()): boolean {
  if (user.permissions?.includes('*')) return true;
  return canAccessEmployeesScreen(user);
}

/** Ajuste manual de batidas — exige permissão de RH no perfil. */
export function canAdjustTimeclock(user: RhUserContext = getRhUser()): boolean {
  return canEditRh(user);
}

export function canViewSalary(user: RhUserContext = getRhUser()): boolean {
  return canEditRh(user) || user.permissions?.includes('rh-salaries') || false;
}

export function canViewEmployee(employeeId: string, user: RhUserContext = getRhUser()): boolean {
  if (canAccessEmployeesScreen(user)) return true;
  if (user.employeeId && user.employeeId === employeeId) return true;
  return false;
}

export function canAccessRhScreen(screenId: string, user: RhUserContext = getRhUser()): boolean {
  if (screenId !== 'rh-group' && !screenId.startsWith('rh-')) return false;
  return canAccessScreen(user, screenId);
}
