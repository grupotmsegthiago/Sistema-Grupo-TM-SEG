import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useRealtimeRefresh } from './RealtimeProvider';

/** Membro da equipe interna (usuário cadastrado em system_users). */
export interface TeamRosterMember {
  userId: string;
  name: string;
  role: string;
}

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
      setRoster(list);
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
