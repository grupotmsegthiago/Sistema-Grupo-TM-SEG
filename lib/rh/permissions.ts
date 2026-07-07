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

/** Relatório e auditoria de ponto — somente equipe RH (não o colaborador comum). */
export function canViewTimeclockReport(user: RhUserContext = getRhUser()): boolean {
  if (isRhAdmin(user)) return true;
  const role = (user.role || '').toLowerCase();
  if (role === 'rh' || user.permissions?.includes('rh-timeclock-report')) return true;
  if (canEditRh(user)) return true;
  return false;
}

/** Qualquer permissão rh-* ou perfil RH libera o módulo. */
function hasAnyRhPermission(user: RhUserContext): boolean {
  if (user.permissions?.some((p) => p === '*' || p.startsWith('rh-'))) return true;
  const role = (user.role || '').toLowerCase();
  return ['rh', 'financeiro', 'administrador', 'diretoria'].includes(role);
}

export function canAccessRhScreen(screenId: string, user: RhUserContext = getRhUser()): boolean {
  if (isRhAdmin(user)) return true;

  if (screenId === 'rh-timeclock' || screenId === 'rh-point-report') {
    return canViewTimeclockReport(user);
  }

  if (!hasAnyRhPermission(user)) return false;

  const menuScreens = ['rh-dashboard', 'rh-employees', 'rh-timeclock'];
  const internalScreens = [
    'rh-employee-workspace', 'rh-employee-form', 'rh-employee-profile',
    'rh-point-report', 'rh-settings', 'rh-payroll',
    // legado — redirecionados para pasta do funcionário ou dashboard
    'rh-admissions', 'rh-positions', 'rh-departments', 'rh-salaries', 'rh-benefits',
    'rh-work-schedule', 'rh-commissions', 'rh-awards', 'rh-bonuses', 'rh-warnings',
    'rh-vacations', 'rh-leaves', 'rh-exams', 'rh-payslips', 'rh-reports',
  ];

  if (menuScreens.includes(screenId) || internalScreens.includes(screenId)) {
    if (user.permissions?.includes(screenId)) return true;
    if (screenId.startsWith('rh-') && user.permissions?.some((p) => p.startsWith('rh-'))) return true;
    const role = (user.role || '').toLowerCase();
    if (['rh', 'financeiro'].includes(role)) return true;
  }

  return false;
}
