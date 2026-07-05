export function canViewGoalMonetaryData(canSeeMonetaryProp: boolean | undefined, userRole: string): boolean {
  const isDiretoria = String(userRole || '').toLowerCase() === 'diretoria';
  if (!isDiretoria) return false;
  return canSeeMonetaryProp ?? true;
}
