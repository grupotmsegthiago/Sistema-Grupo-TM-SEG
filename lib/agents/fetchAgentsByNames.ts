import type { SupabaseClient } from '@supabase/supabase-js';
import { findAgentByName, normalizeAgentNameKey } from './agentNameMatch';

/**
 * Busca agentes pelos nomes da OS.
 * 1) match exato (rápido)
 * 2) fallback ilike + comparação sem acento (evita falha VENANCIO vs VENÂNCIO na impressão)
 */
export async function fetchAgentsByNames(
  supabase: SupabaseClient,
  names: Array<string | null | undefined>,
  select = '*',
): Promise<any[]> {
  const unique = [...new Set(names.map((n) => String(n || '').trim()).filter(Boolean))];
  if (!unique.length) return [];

  const { data: exact } = await supabase.from('agents').select(select).in('name', unique);
  const found: any[] = [...(exact || [])];

  const missing = unique.filter((n) => !findAgentByName(found, n));
  for (const name of missing) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (!parts.length) continue;
    // Postgres ilike NÃO ignora acento: "VENA" não casa com "VENÂ".
    // Usar 1º+2º nome (estáveis) e, se precisar, só 3 letras do último sobrenome.
    const patterns: string[] = [];
    if (parts.length >= 2) patterns.push(`%${parts[0]}%${parts[1]}%`);
    const lastPrefix = parts[parts.length - 1].slice(0, Math.min(3, parts[parts.length - 1].length));
    if (parts.length >= 2 && lastPrefix) patterns.push(`%${parts[0]}%${lastPrefix}%`);
    if (!patterns.length) patterns.push(`%${parts[0]}%`);

    let match: any | undefined;
    for (const pattern of patterns) {
      const { data } = await supabase.from('agents').select(select).ilike('name', pattern).limit(40);
      match = (data || []).find(
        (a) => normalizeAgentNameKey(a?.name) === normalizeAgentNameKey(name),
      );
      if (match) break;
    }
    if (match && !findAgentByName(found, match.name)) {
      found.push(match);
    }
  }

  return found;
}
