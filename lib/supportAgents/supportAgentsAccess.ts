/** Acesso à Rede de Apoio (QRF) — somente usuários internos autenticados. */

export type SupportAgentsPrincipal = {
  clientId?: string | null;
  permissions?: string[] | null;
  role?: string | null;
};

export function isRestrictedClientUser(principal: SupportAgentsPrincipal | null | undefined): boolean {
  if (!principal) return false;
  if (principal.clientId) return true;
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  return permissions.some((permission) => String(permission).startsWith('client_view:'));
}

/** Mesma regra do menu: clientes externos não veem a Rede de Apoio. */
export function canReadSupportAgents(principal: SupportAgentsPrincipal | null | undefined): boolean {
  if (!principal) return false;
  if (isRestrictedClientUser(principal)) return false;
  return true;
}
