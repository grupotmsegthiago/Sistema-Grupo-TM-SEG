import { formatTimeBR } from '../dateUtils';
import { TIME_CLOCK_STAGE_SHORT } from './stages';
import type { TimeClockEntry, TimeClockStage } from './types';

export const TMSEG_PRESENCE_CHANNEL = 'tmseg-user-presence';
/** Ícone de avatar para usuários online no quadro de presença. */
export const PRESENCE_USER_AVATAR_SRC = '/assets/presence-user-robot.png';

export type PresenceCategory = 'operacao' | 'administrativo' | 'comercial';
export type PresenceServiceStatus = 'em_servico' | 'fora' | 'em_almoco';

export interface PresencePunchMark {
  type: TimeClockStage;
  label: string;
  time: string;
}

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
  /** Última interação real no sistema */
  lastActivityAt?: string;
  /** Minutos em serviço (desde batida IN / retorno almoço) */
  minutesOnDuty?: number;
  /** active | idle (>10min sem mexer) */
  activityStatus?: 'active' | 'idle';
  /** Minutos sem uso após limiar de inatividade */
  idleMinutes?: number;
  /** Marcações de ponto do dia (para tooltip no quadro da diretoria) */
  punchMarks?: PresencePunchMark[];
}

const OPERACAO_ROLES = new Set(['operador', 'operacional', 'avançado', 'avancado']);
const COMERCIAL_ROLES = new Set(['comercial']);

export const PRESENCE_CATEGORY_ORDER: PresenceCategory[] = [
  'operacao',
  'administrativo',
  'comercial',
];

export const PRESENCE_CATEGORY_LABELS: Record<PresenceCategory, string> = {
  operacao: 'Operação',
  administrativo: 'Administrativo',
  comercial: 'Comercial',
};

export function getPresenceCategory(role: string | null | undefined): PresenceCategory {
  const normalized = String(role || '').trim().toLowerCase();
  if (OPERACAO_ROLES.has(normalized)) return 'operacao';
  if (COMERCIAL_ROLES.has(normalized)) return 'comercial';
  return 'administrativo';
}

/** Status operacional simplificado para o quadro: Em serviço | Fora de Serviço | Em Almoço. */
export function getPresenceServiceStatus(user: PresenceUserState): PresenceServiceStatus {
  const label = (user.onDutyLabel || '').toLowerCase();
  if (label.includes('almoço') || label.includes('almoco')) return 'em_almoco';
  if (user.onDuty) return 'em_servico';
  if (label.includes('em serviço') || label.includes('em servico')) return 'em_servico';
  return 'fora';
}

export const PRESENCE_SERVICE_STATUS_LABELS: Record<PresenceServiceStatus, string> = {
  em_servico: 'Em serviço',
  fora: 'Fora de Serviço',
  em_almoco: 'Em Almoço',
};

export function buildPunchMarks(
  entries: Pick<TimeClockEntry, 'type' | 'timestamp'>[]
): PresencePunchMark[] {
  return [...entries]
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map((entry) => ({
      type: entry.type,
      label: TIME_CLOCK_STAGE_SHORT[entry.type],
      time: formatTimeBR(entry.timestamp),
    }));
}

export function buildPresenceTooltip(user: PresenceUserState): string {
  const lines: string[] = [];
  const status = getPresenceServiceStatus(user);
  lines.push(`${user.name || 'Usuário'} — ${PRESENCE_SERVICE_STATUS_LABELS[status]}`);
  if (user.role) lines.push(`Perfil: ${user.role}`);
  if (user.contractType) lines.push(`Contrato: ${user.contractType}`);
  if (user.onDutyLabel && user.onDutyLabel !== PRESENCE_SERVICE_STATUS_LABELS[status]) {
    lines.push(`Detalhe ponto: ${user.onDutyLabel}`);
  }
  if (user.minutesOnDuty != null && user.minutesOnDuty > 0 && status === 'em_servico') {
    lines.push(`Tempo em serviço: ${user.minutesOnDuty} min`);
  }
  if (user.activityStatus === 'idle' && user.idleMinutes && user.idleMinutes > 0) {
    lines.push(`Sem uso no sistema há ${user.idleMinutes} min`);
  }
  lines.push('');
  if (user.punchMarks && user.punchMarks.length > 0) {
    lines.push('Marcações de hoje:');
    for (const mark of user.punchMarks) {
      lines.push(`• ${mark.label}: ${mark.time}`);
    }
  } else if (user.isClt) {
    lines.push('Marcações de hoje: nenhuma registrada');
  } else {
    lines.push('Sem obrigatoriedade de ponto');
  }
  return lines.join('\n');
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
    lastActivityAt:
      typeof meta.lastActivityAt === 'string' && meta.lastActivityAt.trim()
        ? meta.lastActivityAt.trim()
        : undefined,
    minutesOnDuty:
      typeof meta.minutesOnDuty === 'number' && Number.isFinite(meta.minutesOnDuty)
        ? meta.minutesOnDuty
        : undefined,
    activityStatus:
      meta.activityStatus === 'active' || meta.activityStatus === 'idle'
        ? meta.activityStatus
        : undefined,
    idleMinutes:
      typeof meta.idleMinutes === 'number' && Number.isFinite(meta.idleMinutes)
        ? meta.idleMinutes
        : undefined,
    punchMarks: Array.isArray(meta.punchMarks)
      ? meta.punchMarks
          .filter(
            (m): m is PresencePunchMark =>
              !!m &&
              typeof m === 'object' &&
              typeof (m as PresencePunchMark).type === 'string' &&
              typeof (m as PresencePunchMark).label === 'string' &&
              typeof (m as PresencePunchMark).time === 'string'
          )
          .map((m) => ({
            type: m.type,
            label: m.label,
            time: m.time,
          }))
      : undefined,
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
