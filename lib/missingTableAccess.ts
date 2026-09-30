import { isFinanceSupervisorName } from './financeSupervisorAccess';

export type MissingTableUser = {
  name?: string | null;
  role?: string | null;
  permissions?: string[] | null;
};

function roleKey(role: string | null | undefined): string {
  return String(role || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Perfil Operador não vê o alerta, mesmo que o nome caia numa exceção antiga. */
export function isOperadorProfile(role: string | null | undefined): boolean {
  const roleLower = roleKey(role);
  return roleLower === 'operador' || roleLower === 'operacional';
}

/** Perfil Avançado também fica de fora da tela OS sem Tabela. */
export function isAvancadoProfile(role: string | null | undefined): boolean {
  const roleLower = roleKey(role);
  return roleLower === 'avancado';
}

/**
 * Alerta "OS sem Tabela": Administrador, acesso total e nomes históricos
 * (Thiago Moreira, Bárbara, Giovanna, Simone).
 * Os perfis Operador e Avançado ficam de fora em qualquer caso.
 */
export function canSeeMissingTableAlert(user: MissingTableUser | null | undefined): boolean {
  if (!user) return false;
  if (isOperadorProfile(user.role) || isAvancadoProfile(user.role)) return false;
  const nameLower = String(user.name || '').toLowerCase();
  const roleLower = roleKey(user.role);
  const isAdmin = roleLower === 'administrador'
    || (Array.isArray(user.permissions) && user.permissions.includes('*'));
  return isAdmin
    || nameLower.includes('thiago moreira')
    || isFinanceSupervisorName(user.name)
    || nameLower.includes('simone');
}

/** Administrador vê o alerta aberto ao entrar na tela. */
export function mustForceMissingTable(user: MissingTableUser | null | undefined): boolean {
  if (!canSeeMissingTableAlert(user)) return false;
  const roleLower = roleKey(user?.role);
  return roleLower === 'administrador'
    || (Array.isArray(user?.permissions) && user.permissions.includes('*'));
}
