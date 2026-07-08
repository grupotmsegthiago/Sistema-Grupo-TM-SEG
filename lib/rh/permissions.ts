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

/** Módulo RH completo — somente Diretoria e perfil RH. */
export function canAccessRhModule(user: RhUserContext = getRhUser()): boolean {
  const role = (user.role || '').toLowerCase();
  return role === 'diretoria' || role === 'rh';
}

/** Telas de cadastro/custos de funcionários — somente Diretoria e perfil RH. */
export const RH_EMPLOYEES_SCREENS = [
  'rh-employees',
  'rh-employee-workspace',
  'rh-employee-form',
  'rh-employee-profile',
] as const;

export function canAccessEmployeesScreen(user: RhUserContext = getRhUser()): boolean {
  return canAccessRhModule(user);
}

export function canViewEmployeeCosts(user: RhUserContext = getRhUser()): boolean {
  return canAccessEmployeesScreen(user);
}

export function canEditRh(user: RhUserContext = getRhUser()): boolean {
  const role = (user.role || '').toLowerCase();
  if (isRhAdmin(user)) return true;
  if (role === 'rh' || user.permissions?.includes('rh-employees')) return true;
  return false;
}

/** Ajuste manual de batidas (entrada, almoço, retorno, saída) — Diretoria e RH. */
export function canAdjustTimeclock(user: RhUserContext = getRhUser()): boolean {
  return canEditRh(user);
}

export function canViewSalary(user: RhUserContext = getRhUser()): boolean {
  return canEditRh(user) || isRhFinance(user) || user.permissions?.includes('rh-salaries');
}

export function canViewEmployee(employeeId: string, user: RhUserContext = getRhUser()): boolean {
  if (canAccessEmployeesScreen(user)) return true;
  if (user.employeeId && user.employeeId === employeeId) return true;
  return false;
}

export function canAccessRhScreen(screenId: string, user: RhUserContext = getRhUser()): boolean {
  if (screenId !== 'rh-group' && !screenId.startsWith('rh-')) return false;
  return canAccessRhModule(user);
}
