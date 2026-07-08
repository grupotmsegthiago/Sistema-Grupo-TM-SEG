import type { SupabaseClient } from '@supabase/supabase-js';
import { employeeRequiresTimeclock } from '../timeclock/eligibility';
import { dedupeTeamRoster, type TeamRosterMember } from '../timeclock/teamPunchBoard';

function extractRole(row: { profiles?: unknown }): string {
  const p = row.profiles as { name?: string } | { name?: string }[] | null | undefined;
  if (Array.isArray(p)) return p[0]?.name || 'Usuário';
  return p?.name || 'Usuário';
}

/**
 * Carrega roster fixo da equipe (system_users internos + RH com ponto).
 * Fonte única — usar via service em hooks e APIs server-side.
 */
export async function fetchTeamRoster(sb: SupabaseClient): Promise<TeamRosterMember[]> {
  try {
    const { data, error } = await sb
      .from('system_users')
      .select('id, name, status, client_id, provider_id, profiles:profile_id(name)')
      .is('client_id', null)
      .is('provider_id', null);

    if (error) throw error;

    const list = (data || [])
      .filter((u: { status?: string | null }) => String(u.status || '').toLowerCase() === 'ativo')
      .map((u: { id: string | number; name?: string | null; profiles?: unknown }) => ({
        userId: String(u.id),
        name: u.name || 'Usuário',
        role: extractRole(u),
      }));

    let rhMembers: TeamRosterMember[] = [];
    try {
      const { data: rhData, error: rhErr } = await sb
        .from('rh_employees')
        .select('user_id, full_name, status, contract_type, requires_timeclock')
        .is('deleted_at', null)
        .not('user_id', 'is', null);

      if (!rhErr) {
        rhMembers = (rhData || [])
          .filter((e) => employeeRequiresTimeclock(e))
          .map((e: { user_id: string | number; full_name?: string | null }) => ({
            userId: String(e.user_id),
            name: e.full_name || 'Funcionário',
            role: 'Operador',
          }));
      }
    } catch {
      // mantém só system_users se RH falhar
    }

    return dedupeTeamRoster([...list, ...rhMembers]);
  } catch (err) {
    console.warn('[teamRosterService] Falha ao carregar roster:', err);
    return [];
  }
}
