/**
 * Supervisão financeira — privilégios por nome (além do perfil Administrador).
 * Bárbara Sgarlata e Giovanna Marsili compartilham o mesmo nível operacional.
 */

export function normalizePersonName(name: string | null | undefined): string {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** True para Bárbara Sgarlata / Giovanna Marsili (e variantes sem acento). */
export function isFinanceSupervisorName(name: string | null | undefined): boolean {
  const n = normalizePersonName(name);
  if (!n) return false;
  if (n.includes('barbara')) return true;
  // Única Giovanna no sistema (Giovanna Marsili) — mesmo acesso da Bárbara.
  if (n.includes('giovanna')) return true;
  return false;
}
