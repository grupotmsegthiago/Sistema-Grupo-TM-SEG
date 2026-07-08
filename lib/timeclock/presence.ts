export const TMSEG_PRESENCE_CHANNEL = 'tmseg-user-presence';
/** Ícone de avatar para usuários online no quadro de presença. */
export const PRESENCE_USER_AVATAR_SRC = '/assets/presence-user-robot.svg';

export interface PresenceUserState {
  userId: string;
  name: string;
  role: string;
  /** Tipo de contrato do funcionário (CLT, PJ, MEI, AUTONOMO, etc.). Vazio se não for funcionário RH. */
  contractType?: string;
  isClt: boolean;
  onDuty: boolean;
  onDutyLabel: string;
  onlineAt: string;
}

type RawPresenceMeta = Partial<PresenceUserState> | Record<string, unknown>;

function normalizePresenceMeta(meta: RawPresenceMeta): PresenceUserState | null {
  const userId = typeof meta.userId === 'string' && meta.userId.trim() ? meta.userId.trim() : '';
  if (!userId) return null;

  return {
    userId,
    name: typeof meta.name === 'string' && meta.name.trim() ? meta.name.trim() : 'Usuário',
    role: typeof meta.role === 'string' && meta.role.trim() ? meta.role.trim() : 'Online',
    contractType:
      typeof meta.contractType === 'string' && meta.contractType.trim()
        ? meta.contractType.trim().toUpperCase()
        : undefined,
    isClt: meta.isClt === true,
    onDuty: meta.onDuty === true,
    onDutyLabel:
      typeof meta.onDutyLabel === 'string' && meta.onDutyLabel.trim()
        ? meta.onDutyLabel.trim()
        : 'Online',
    onlineAt:
      typeof meta.onlineAt === 'string' && meta.onlineAt.trim()
        ? meta.onlineAt.trim()
        : new Date(0).toISOString(),
  };
}

export function parsePresenceState(
  state: Record<string, RawPresenceMeta[] | RawPresenceMeta>
): PresenceUserState[] {
  const users: PresenceUserState[] = [];
  for (const key of Object.keys(state || {})) {
    const raw = state[key];
    const metas = Array.isArray(raw) ? raw : [raw];
    if (metas.length === 0) continue;
    const latest = metas[metas.length - 1];
    const normalized = normalizePresenceMeta(latest || {});
    if (normalized) users.push(normalized);
  }
  return users.sort((a, b) =>
    (a.name || 'Usuário').localeCompare(b.name || 'Usuário', 'pt-BR')
  );
}

export function getInitials(name: string): string {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
