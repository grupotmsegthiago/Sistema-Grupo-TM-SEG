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

export function canEditRh(user: RhUserContext = getRhUser()): boolean {
  const role = (user.role || '').toLowerCase();
  if (isRhAdmin(user)) return true;
  if (role === 'rh' || user.permissions?.includes('rh-employees')) return true;
  return false;
}

export function canViewSalary(user: RhUserContext = getRhUser()): boolean {
  return canEditRh(user) || isRhFinance(user) || user.permissions?.includes('rh-salaries');
}

export function canViewEmployee(employeeId: string, user: RhUserContext = getRhUser()): boolean {
  if (canEditRh(user) || isRhFinance(user)) return true;
  if (user.employeeId && user.employeeId === employeeId) return true;
  return user.permissions?.includes('rh-employees');
}

export function canAccessRhScreen(screenId: string, user: RhUserContext = getRhUser()): boolean {
  const role = (user.role || '').toLowerCase();
  if (isRhAdmin(user)) return true;
  if (user.permissions?.includes(screenId)) return true;

  const salaryScreens = ['rh-salaries', 'rh-payroll', 'rh-payslips'];
  if (salaryScreens.includes(screenId) && (isRhFinance(user) || role === 'rh')) return true;

  const hrScreens = ['rh-dashboard', 'rh-employees', 'rh-admissions', 'rh-positions', 'rh-departments',
    'rh-benefits', 'rh-commissions', 'rh-awards', 'rh-bonuses', 'rh-warnings', 'rh-vacations',
    'rh-leaves', 'rh-reports', 'rh-settings', 'rh-point-report', 'rh-work-schedule'];
  if (hrScreens.includes(screenId) && (role === 'rh' || canEditRh(user))) return true;

  const allInternal = ['rh-timeclock', 'rh-employee-profile'];
  if (allInternal.includes(screenId) && !user.clientId) return true;

  return false;
}
