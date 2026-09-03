export type MissionUserIdentity = {
  id?: string | number | null;
  email?: string | null;
  name?: string | null;
  username?: string | null;
};

export type BillingApprovalIdentity = {
  role?: string | null;
  stage?: string | null;
};

const PLINIO_USER_ID = '9';
const PLINIO_EMAIL = 'plinio@grupotmseg.com.br';
const PLINIO_FULL_NAME = 'plinio alves prado dos santos';

function normalizeIdentityPart(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Identidade operacional homologada do Plínio.
 * ID e e-mail são as chaves principais; o nome completo preserva compatibilidade
 * com sessões antigas que ainda não carregam esses campos no localStorage.
 */
export function isRestrictedPlinioUser(user: MissionUserIdentity | null | undefined): boolean {
  if (!user) return false;
  const id = String(user.id ?? '').trim();
  const email = normalizeIdentityPart(user.email);
  const name = normalizeIdentityPart(user.name || user.username);
  return id === PLINIO_USER_ID || email === PLINIO_EMAIL || name === PLINIO_FULL_NAME;
}

/** Plínio só pode atuar depois de aprovação registrada por Diretoria/Administração. */
export function hasAdminOrDirectorApproval(
  approvals: BillingApprovalIdentity[] | null | undefined,
): boolean {
  return (approvals || []).some((approval) => {
    const role = normalizeIdentityPart(approval.role);
    const stage = normalizeIdentityPart(approval.stage);
    return role === 'administrador'
      || role === 'diretoria'
      || stage === 'diretoria';
  });
}
