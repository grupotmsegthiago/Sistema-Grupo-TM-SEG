import { canAccessDiretoriaMenu } from './diretoriaAccess.js';

export type OsAnalysisUser = {
  name?: string | null;
  role?: string | null;
  permissions?: string[] | null;
};

/** Pedir análise + ver tela de pendências — somente Diretoria. */
export function canRequestOsAnalysis(user: OsAnalysisUser | null | undefined): boolean {
  if (!user) return false;
  if (canAccessDiretoriaMenu(user)) return true;
  const role = String(user.role || '').toLowerCase();
  if (role === 'diretoria') return true;
  if (user.permissions?.includes('*') && role === 'administrador') {
    // Admin genérico não — só se for Diretoria/Thiagos
    return false;
  }
  return false;
}

export function canViewOsAnalysisPendencies(user: OsAnalysisUser | null | undefined): boolean {
  return canRequestOsAnalysis(user);
}

/** Prefill sugerido no seletor (Bárbara / Giovanna) — a Diretoria escolhe livremente. */
export const OS_ANALYSIS_DEFAULT_RECIPIENT_HINTS = ['barbara', 'giovanna'] as const;

export function buildOsAuditDeepLink(missionId: string): string {
  const base = (typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.SYSTEM_URL || 'https://sistema.grupotmseg.com.br')
  ).replace(/\/$/, '');
  return `${base}/?page=missions&openMission=${encodeURIComponent(missionId)}`;
}
