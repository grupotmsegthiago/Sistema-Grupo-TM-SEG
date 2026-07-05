export function canViewGoalMonetaryData(canSeeMonetaryProp: boolean | undefined, userRole: string): boolean {
  return canSeeMonetaryProp ?? String(userRole || '').toLowerCase() === 'diretoria';
}
