import { canAccessDiretoriaMenu } from './diretoriaAccess';

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

/** Quem recebe o e-mail para analisar (Bárbara e Giovanna). */
export const OS_ANALYSIS_RECIPIENT_EMAILS = [
  'barbara@grupotmseg.com.br',
  'giovanna@grupotmseg.com.br',
];

export function buildOsAuditDeepLink(missionId: string): string {
  const base = (typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.SYSTEM_URL || 'https://sistema.grupotmseg.com.br')
  ).replace(/\/$/, '');
  return `${base}/?page=missions&openMission=${encodeURIComponent(missionId)}`;
}
