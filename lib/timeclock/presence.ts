import type { TimeClockEntry } from './types';
import { formatTimeBR } from '../dateUtils';
import { buildPunchMarks, type PresencePunchMark } from './punchMarks';
import {
  buildPresenceFromPunchEntries,
  resolvePunchEntriesForMember,
  type TeamPunchLookup,
  type TeamRosterMember,
} from './teamPunchBoard';

export type { PresencePunchMark } from './punchMarks';
export { buildPunchMarks } from './punchMarks';

/** IDs do login (number) e do roster (string) devem casar no quadro e no broadcast. */
export function normalizePresenceUserId(id: unknown): string {
  if (id == null) return '';
  if (typeof id === 'number' && Number.isFinite(id)) return String(id);
  if (typeof id === 'string') return id.trim();
  return String(id).trim();
}

export const TMSEG_PRESENCE_CHANNEL = 'tmseg-user-presence';
/** Ícone de avatar para usuários online no quadro de presença. */
export const PRESENCE_USER_AVATAR_SRC = '/assets/presence-user-robot.svg';

export type PresenceCategory = 'operacao' | 'administrativo' | 'comercial';
export type PresenceServiceStatus = 'em_servico' | 'fora' | 'em_almoco' | 'online' | 'aguardando_ponto';

export interface PresenceStatusOptions {
  isOnline?: boolean;
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

/** Status operacional para o quadro: serviço, almoço, online, aguardando ponto ou fora. */
export function getPresenceServiceStatus(
  user: PresenceUserState,
  options?: PresenceStatusOptions,
): PresenceServiceStatus {
  const label = (user.onDutyLabel || '').toLowerCase();
  if (label.includes('almoço') || label.includes('almoco')) return 'em_almoco';

  const marks = user.punchMarks || [];
  const hasIn = marks.some((m) => m.type === 'IN');
  const hasOut = marks.some((m) => m.type === 'OUT');
  const hasBreakStart = marks.some((m) => m.type === 'BREAK_START');
  const hasBreakEnd = marks.some((m) => m.type === 'BREAK_END');

  if (hasBreakStart && !hasBreakEnd) return 'em_almoco';
  if (hasIn && !hasOut) return 'em_servico';

  if (user.onDuty) return 'em_servico';
  if (label.includes('em serviço') || label.includes('em servico')) return 'em_servico';

  const awaitingPunch =
    label.includes('aguardando ponto') || (user.isClt && !hasIn && !hasOut);
  if (options?.isOnline && awaitingPunch) return 'aguardando_ponto';
  if (options?.isOnline) return 'online';
  if (awaitingPunch) return 'aguardando_ponto';

  return 'fora';
}

export const PRESENCE_SERVICE_STATUS_LABELS: Record<PresenceServiceStatus, string> = {
  em_servico: 'Em serviço',
  fora: 'Fora de Serviço',
  em_almoco: 'Em Almoço',
  online: 'Online',
  aguardando_ponto: 'Aguardando ponto',
};

/** Ordem de exibição no quadro: serviço → online → aguardando → almoço → fora. */
export const PRESENCE_BOARD_STATUS_ORDER: PresenceServiceStatus[] = [
  'em_servico',
  'online',
  'aguardando_ponto',
  'em_almoco',
  'fora',
];

export function getPresenceStatusSortRank(status: PresenceServiceStatus): number {
  const idx = PRESENCE_BOARD_STATUS_ORDER.indexOf(status);
  return idx >= 0 ? idx : 99;
}

function comparePresenceUsers(
  a: PresenceUserState,
  b: PresenceUserState,
  isOnlineFn: (user: PresenceUserState) => boolean,
): number {
  const statusA = getPresenceServiceStatus(a, { isOnline: isOnlineFn(a) });
  const statusB = getPresenceServiceStatus(b, { isOnline: isOnlineFn(b) });
  const rankDiff =
    getPresenceStatusSortRank(statusA) - getPresenceStatusSortRank(statusB);
  if (rankDiff !== 0) return rankDiff;
  return (a.name || 'Usuário').localeCompare(b.name || 'Usuário', 'pt-BR');
}

/** Separa conectados (esquerda) e desconectados (direita), cada lado na ordem de status. */
export function partitionPresenceBoardUsers(
  users: PresenceUserState[],
  isOnlineFn: (user: PresenceUserState) => boolean,
): { online: PresenceUserState[]; offline: PresenceUserState[] } {
  const online: PresenceUserState[] = [];
  const offline: PresenceUserState[] = [];
  for (const user of users) {
    if (isOnlineFn(user)) online.push(user);
    else offline.push(user);
  }
  online.sort((a, b) => comparePresenceUsers(a, b, isOnlineFn));
  offline.sort((a, b) => comparePresenceUsers(a, b, isOnlineFn));
  return { online, offline };
}

function getServiceTimeFromMarks(user: PresenceUserState): string | null {
  const marks = user.punchMarks || [];
  let anchor: string | null = null;
  for (const mark of marks) {
    if (mark.type === 'IN' || mark.type === 'BREAK_END') anchor = mark.time;
  }
  return anchor;
}

function getLunchStartFromMarks(user: PresenceUserState): string | null {
  const marks = user.punchMarks || [];
  for (let i = marks.length - 1; i >= 0; i -= 1) {
    if (marks[i].type === 'BREAK_START') return marks[i].time;
  }
  return null;
}

/** Linha de status com horários HH:MM (Brasília), sem exibir minutos corridos. */
export function formatPresenceStatusLine(
  user: PresenceUserState,
  isOnline: boolean,
): string {
  const status = getPresenceServiceStatus(user, { isOnline });
  const base = PRESENCE_SERVICE_STATUS_LABELS[status];
  const lastAccess = formatTimeBR(user.lastActivityAt || user.onlineAt, '');

  if (status === 'em_servico') {
    const since = getServiceTimeFromMarks(user);
    if (since) return `${base} — desde ${since}`;
    if (lastAccess) return `${base} — ${lastAccess}`;
    return base;
  }

  if (status === 'em_almoco') {
    const since = getLunchStartFromMarks(user);
    if (since) return `${base} — desde ${since}`;
    if (lastAccess) return `${base} — ${lastAccess}`;
    return base;
  }

  if (status === 'online' || status === 'aguardando_ponto') {
    if (lastAccess) return `${base} — ${lastAccess}`;
    return base;
  }

  if (isOnline && lastAccess) {
    return `${base} — ${lastAccess}`;
  }

  return base;
}

/** Nome curto com inicial do sobrenome (evita confundir Beatriz/Beatriz, Thiago/Thiago). */
export function formatPresenceShortName(name: string): string {
  const parts = (name || 'Usuário').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Usuário';
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${first} ${lastInitial}.`;
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
    const since = getServiceTimeFromMarks(user);
    lines.push(since ? `Em serviço desde: ${since}` : `Tempo em serviço: ${user.minutesOnDuty} min`);
  }
  if (user.lastActivityAt) {
    lines.push(`Último acesso: ${formatTimeBR(user.lastActivityAt)}`);
  } else if (user.onlineAt && user.onlineAt !== new Date(0).toISOString()) {
    lines.push(`Conectado desde: ${formatTimeBR(user.onlineAt)}`);
  }
  if (user.activityStatus === 'idle' && user.lastActivityAt) {
    lines.push(`Sem uso desde: ${formatTimeBR(user.lastActivityAt)}`);
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
  const userId = normalizePresenceUserId(meta.userId);
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

/**
 * Mescla roster fixo + presença ao vivo + batidas do dia (banco).
 * - Cada funcionário aparece UMA vez (sem duplicar por batida ou sessão).
 * - Status Em serviço / Em almoço / Fora vem do ponto de hoje quando existir.
 * - Online ao vivo enriquece atividade; offline com ponto usa dados do banco.
 */
export function mergeRosterWithPresence(
  roster: TeamRosterMember[],
  onlineUsers: PresenceUserState[],
  punchLookup?: Map<string, Pick<TimeClockEntry, 'type' | 'timestamp'>[]> | TeamPunchLookup,
): PresenceUserState[] {
  const onlineMap = new Map(
    onlineUsers.map((u) => [normalizePresenceUserId(u.userId), u]),
  );
  const result: PresenceUserState[] = [];
  const seenIds = new Set<string>();

  for (const member of roster) {
    const memberId = normalizePresenceUserId(member.userId);
    if (!memberId || seenIds.has(memberId)) continue;
    seenIds.add(memberId);

    const online = onlineMap.get(memberId);
    const punchEntries = resolvePunchEntriesForMember(member, punchLookup);

    if (online) {
      const merged: PresenceUserState = { ...online };
      if (punchEntries?.length) {
        const fromPunch = buildPresenceFromPunchEntries(member, punchEntries);
        merged.onDuty = fromPunch.onDuty;
        merged.onDutyLabel = fromPunch.onDutyLabel;
        merged.minutesOnDuty = fromPunch.minutesOnDuty;
        merged.punchMarks = fromPunch.punchMarks;
        merged.isClt = merged.isClt || fromPunch.isClt;
      } else if (merged.isClt && !merged.punchMarks?.length && !merged.onDuty) {
        merged.onDutyLabel = 'Aguardando ponto';
        merged.onDuty = false;
      }
      result.push(merged);
      continue;
    }

    if (punchEntries?.length) {
      const fromPunch = buildPresenceFromPunchEntries(member, punchEntries);
      result.push({
        userId: memberId,
        name: member.name || 'Usuário',
        role: member.role || 'Usuário',
        isClt: fromPunch.isClt,
        onDuty: fromPunch.onDuty,
        onDutyLabel: fromPunch.onDutyLabel,
        minutesOnDuty: fromPunch.minutesOnDuty,
        punchMarks: fromPunch.punchMarks,
        onlineAt: new Date(0).toISOString(),
      });
      continue;
    }

    result.push({
      userId: memberId,
      name: member.name || 'Usuário',
      role: member.role || 'Usuário',
      isClt: false,
      onDuty: false,
      onDutyLabel: 'Fora de Serviço',
      onlineAt: new Date(0).toISOString(),
    });
  }

  return result;
}

export function getInitials(name: string): string {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
