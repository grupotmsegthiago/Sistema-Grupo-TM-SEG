/** Identifica se a conta é colaborador interno (não cliente/fornecedor). */

export interface PortalUserLike {
  userType?: string | null;
  user_type?: string | null;
  clientId?: string | null;
  client_id?: string | null;
  providerId?: string | null;
  provider_id?: string | null;
}

export type PortalAccountKind = 'internal' | 'client' | 'provider';

export function resolvePortalAccountKind(user: PortalUserLike): PortalAccountKind {
  if (user.clientId || user.client_id) return 'client';
  if (user.providerId || user.provider_id) return 'provider';
  const ut = (user.userType || user.user_type || '').toLowerCase();
  if (ut === 'client' || ut === 'provider') return ut;
  return 'internal';
}

/** Colaborador interno TM SEG — único que pode ter ponto e patrimônio obrigatórios. */
export function isInternalEmployeeAccount(user: PortalUserLike): boolean {
  return resolvePortalAccountKind(user) === 'internal';
}
