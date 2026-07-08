export const TMSEG_PRESENCE_CHANNEL = 'tmseg-user-presence';

export interface PresenceUserState {
  userId: string;
  name: string;
  role: string;
  isClt: boolean;
  onDuty: boolean;
  onDutyLabel: string;
  onlineAt: string;
}

export function parsePresenceState(
  state: Record<string, PresenceUserState[]>
): PresenceUserState[] {
  const users: PresenceUserState[] = [];
  for (const key of Object.keys(state)) {
    const metas = state[key];
    if (!Array.isArray(metas) || metas.length === 0) continue;
    const latest = metas[metas.length - 1];
    if (latest?.userId) users.push(latest);
  }
  return users.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function getInitials(name: string): string {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
