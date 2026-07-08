import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useRealtimeRefresh } from './RealtimeProvider';
import { dedupeTeamRoster, type TeamRosterMember } from './timeclock/teamPunchBoard';
import { employeeRequiresTimeclock } from './timeclock/eligibility';

export type { TeamRosterMember };

function extractRole(row: { profiles?: unknown }): string {
  const p = row.profiles as { name?: string } | { name?: string }[] | null | undefined;
  if (Array.isArray(p)) return p[0]?.name || 'Usuário';
  return p?.name || 'Usuário';
}

/**
 * Carrega a lista de usuários INTERNOS ativos (sem client_id/provider_id) para
 * o quadro "Equipe no Sistema". Assim os usuários aparecem sempre na tela, mesmo
 * quem não está online — o status é resolvido pela presença em tempo real.
 *
 * Atualiza sozinho quando a tabela system_users muda (realtime), sem polling.
 */
export function useTeamRoster(enabled = true): TeamRosterMember[] {
  const [roster, setRoster] = useState<TeamRosterMember[]>([]);

  const fetchRoster = useCallback(async () => {
    if (!enabled) {
      setRoster([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('system_users')
        .select('id, name, status, client_id, provider_id, profiles:profile_id(name)')
        .is('client_id', null)
        .is('provider_id', null);
      if (error) return;
      const list = (data || [])
        .filter((u: any) => String(u.status || '').toLowerCase() === 'ativo')
        .map((u: any) => ({
          userId: String(u.id),
          name: u.name || 'Usuário',
          role: extractRole(u),
        }));

      // Funcionários RH com login vinculado entram no quadro fixo (ex.: Michele).
      let rhMembers: TeamRosterMember[] = [];
      try {
        const { data: rhData } = await supabase
          .from('rh_employees')
          .select('user_id, full_name, status, contract_type, requires_timeclock')
          .is('deleted_at', null)
          .not('user_id', 'is', null);
        rhMembers = (rhData || [])
          .filter((e: any) => employeeRequiresTimeclock(e))
          .map((e: any) => ({
            userId: String(e.user_id),
            name: e.full_name || 'Funcionário',
            role: 'Operador',
          }));
      } catch {
        // mantém só system_users se RH falhar
      }

      const merged = dedupeTeamRoster([...list, ...rhMembers]);
      setRoster(merged);
    } catch {
      // mantém o último roster conhecido em caso de falha de rede
    }
  }, [enabled]);

  useEffect(() => {
    void fetchRoster();
  }, [fetchRoster]);

  // "Quando alguém for cadastrado/alterado, o banco avisa" — sem polling.
  useRealtimeRefresh('system_users', () => {
    void fetchRoster();
  });

  return roster;
}
