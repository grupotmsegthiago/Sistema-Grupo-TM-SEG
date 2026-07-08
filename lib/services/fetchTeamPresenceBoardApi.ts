import { deserializeTeamPunchLookup, type SerializedTeamPunchLookup } from '../services/teamPunchService';
import type { TeamPunchLookup } from '../timeclock/teamPunchBoard';
import type { TeamRosterMember } from '../timeclock/teamPunchBoard';

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type TeamPresenceBoardApiResponse = {
  ok: boolean;
  roster: TeamRosterMember[];
  punchLookup: SerializedTeamPunchLookup;
  fetchedAt: string;
  error?: string;
};

export async function fetchTeamPresenceBoardFromApi(): Promise<{
  roster: TeamRosterMember[];
  punchLookup: TeamPunchLookup;
  fetchedAt: string;
}> {
  const res = await fetch('/api/rh/team-presence-board', {
    headers: authHeaders(),
  });

  const text = await res.text();
  let json: TeamPresenceBoardApiResponse | null = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(res.ok ? 'Resposta inválida do servidor' : `Erro do servidor (${res.status})`);
  }

  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `Erro ao carregar quadro de presença (${res.status})`);
  }

  return {
    roster: json.roster || [],
    punchLookup: deserializeTeamPunchLookup(json.punchLookup || { byUserId: {}, byName: {} }),
    fetchedAt: json.fetchedAt || new Date().toISOString(),
  };
}
