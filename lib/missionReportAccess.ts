/**
 * Acesso ao Relatório de OS (mission-report).
 * Fonte única para Sidebar, App e futuras rotas/API.
 */

export type MissionReportAccessUser = {
  name?: string | null;
  role?: string | null;
  permissions?: string[] | null;
};

const MISSION_REPORT_ALLOWED_NAMES = ['daniel', 'barbara', 'bárbara', 'giovanna', 'thiago moreira'] as const;

/** Mesma regra do Sidebar — inclui supervisão financeira (Giovanna/Bárbara). */
export function canAccessMissionReport(user: MissionReportAccessUser | null | undefined): boolean {
  if (!user) return false;
  const nameLower = String(user.name || '').toLowerCase();
  const role = String(user.role || '').toLowerCase();
  const perms = Array.isArray(user.permissions) ? user.permissions : [];

  if (MISSION_REPORT_ALLOWED_NAMES.some((n) => nameLower.includes(n))) return true;
  if (role === 'diretoria' || role === 'administrador' || role === 'avançado' || role === 'avancado') return true;
  if (perms.includes('mission-report')) return true;
  return false;
}
