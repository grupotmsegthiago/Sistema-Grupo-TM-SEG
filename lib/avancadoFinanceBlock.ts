export type AvancadoUser = {
  role?: string | null;
};

export function isPerfilAvancado(user: AvancadoUser | null | undefined): boolean {
  const role = String(user?.role || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  return role === 'avancado';
}

/** Telas e atalhos de dinheiro. O perfil Avançado não entra, mesmo com a permissão marcada. */
export function telaFinanceiraOcultaParaAvancado(screenId: string): boolean {
  const id = String(screenId || '');
  if (!id) return false;
  if (id === 'finance-group' || id.startsWith('fin-')) return true;
  return [
    'diretoria-faturamento',
    'comissoes-comerciais',
    'gestao-investimento',
    'quotes',
    'quote-form',
    'cost-optimization',
  ].includes(id);
}
