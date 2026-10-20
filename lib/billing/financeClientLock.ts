/**
 * Depois que o Financeiro aprova, o valor do cliente fica travado
 * para os demais perfis. Diretoria e o próprio perfil Financeiro
 * continuam podendo editar. A reaprovação do financeiro exige motivo
 * e avisa a Diretoria.
 */
export function isClientValueLockedAfterFinanceApproval(
  hasFinanceApproval: boolean,
  role: string | null | undefined,
): boolean {
  if (!hasFinanceApproval) return false;
  const roleKey = String(role || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  return roleKey !== 'diretoria' && roleKey !== 'financeiro';
}
