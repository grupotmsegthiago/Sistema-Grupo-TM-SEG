/**
 * Depois que o Financeiro aprova, o valor do cliente fica travado.
 * Só o perfil Diretoria pode alterar receita, pedágio e deslocamento do cliente.
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
  return roleKey !== 'diretoria';
}
