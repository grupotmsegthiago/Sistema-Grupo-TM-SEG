/** Normaliza nome de agente para comparação (ignora acento, case e espaços extras). */
export function normalizeAgentNameKey(name?: string | null): string {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\t\r\n\u200b-\u200d\ufeff]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/** Remove tabs/caracteres invisíveis de campos documentais (CPF, RG, CNV, etc.). */
export function sanitizeAgentField(value?: string | null): string {
  return String(value || '')
    .replace(/[\t\r\n\u200b-\u200d\ufeff]/g, '')
    .trim();
}

/** Resolve agente por nome exato ou chave normalizada (ex.: VENANCIO ≡ VENÂNCIO). */
export function findAgentByName<T extends { name?: string | null }>(
  agents: readonly T[],
  name?: string | null,
): T | undefined {
  if (!name) return undefined;
  const exact = agents.find((a) => a.name === name);
  if (exact) return exact;
  const key = normalizeAgentNameKey(name);
  if (!key) return undefined;
  return agents.find((a) => normalizeAgentNameKey(a.name) === key);
}
