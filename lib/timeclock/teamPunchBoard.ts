import type { TimeClockEntry } from './types';
import {
  buildPunchMarks,
  type PresenceUserState,
} from './presence';
import {
  getMinutesOnDutyToday,
  getOnDutyStageLabel,
  isCltOnDutyToday,
} from './onDuty';

export interface TeamRosterMember {
  userId: string;
  name: string;
  role: string;
}

/** Chave estável para deduplicar pessoas (evita dois robôs do mesmo nome). */
export function normalizePersonKey(name: string): string {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Remove duplicatas por userId e por nome normalizado. */
export function dedupeTeamRoster(members: TeamRosterMember[]): TeamRosterMember[] {
  const byId = new Map<string, TeamRosterMember>();
  const byName = new Set<string>();

  for (const member of members) {
    const id = String(member.userId || '').trim();
    if (!id) continue;
    if (byId.has(id)) continue;

    const nameKey = normalizePersonKey(member.name);
    if (nameKey && byName.has(nameKey)) continue;

    byId.set(id, member);
    if (nameKey) byName.add(nameKey);
  }

  return Array.from(byId.values());
}

function sortPunchEntries(
  list: Pick<TimeClockEntry, 'type' | 'timestamp'>[],
): Pick<TimeClockEntry, 'type' | 'timestamp'>[] {
  return [...list].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/** Agrupa batidas do dia por usuário (último estado = todas as marcações do dia). */
export function groupTodayEntriesByUser(
  entries: Pick<TimeClockEntry, 'user_id' | 'type' | 'timestamp'>[],
): Map<string, Pick<TimeClockEntry, 'type' | 'timestamp'>[]> {
  const map = new Map<string, Pick<TimeClockEntry, 'type' | 'timestamp'>[]>();
  for (const row of entries) {
    const uid = String(row.user_id || '').trim();
    if (!uid) continue;
    const list = map.get(uid) || [];
    list.push({ type: row.type, timestamp: row.timestamp });
    map.set(uid, list);
  }
  for (const [uid, list] of map) {
    map.set(uid, sortPunchEntries(list));
  }
  return map;
}

export interface TeamPunchLookup {
  byUserId: Map<string, Pick<TimeClockEntry, 'type' | 'timestamp'>[]>;
  /** Fallback quando user_id do ponto não bate com system_users (ex.: vínculo antigo). */
  byName: Map<string, Pick<TimeClockEntry, 'type' | 'timestamp'>[]>;
}

/** Índice por user_id e por nome normalizado para resolver ponto no quadro fixo. */
export function buildTeamPunchLookup(
  entries: Pick<TimeClockEntry, 'user_id' | 'user_name' | 'type' | 'timestamp'>[],
): TeamPunchLookup {
  const byUserId = groupTodayEntriesByUser(entries);
  const byName = new Map<string, Pick<TimeClockEntry, 'type' | 'timestamp'>[]>();

  for (const row of entries) {
    const nameKey = normalizePersonKey(row.user_name || '');
    if (!nameKey) continue;
    const list = byName.get(nameKey) || [];
    list.push({ type: row.type, timestamp: row.timestamp });
    byName.set(nameKey, list);
  }
  for (const [nameKey, list] of byName) {
    byName.set(nameKey, sortPunchEntries(list));
  }

  return { byUserId, byName };
}

export function resolvePunchEntriesForMember(
  member: TeamRosterMember,
  lookup?: Map<string, Pick<TimeClockEntry, 'type' | 'timestamp'>[]> | TeamPunchLookup,
): Pick<TimeClockEntry, 'type' | 'timestamp'>[] | undefined {
  if (!lookup) return undefined;

  if (lookup instanceof Map) {
    return lookup.get(member.userId);
  }

  const byId = lookup.byUserId.get(member.userId);
  if (byId?.length) return byId;

  const nameKey = normalizePersonKey(member.name);
  if (!nameKey) return undefined;
  return lookup.byName.get(nameKey);
}

/** Deriva estado de presença a partir das batidas do dia (fonte: banco). */
export function buildPresenceFromPunchEntries(
  member: TeamRosterMember,
  entries: Pick<TimeClockEntry, 'type' | 'timestamp'>[],
): Pick<
  PresenceUserState,
  'onDuty' | 'onDutyLabel' | 'minutesOnDuty' | 'punchMarks' | 'isClt'
> {
  const punchMarks = buildPunchMarks(entries);
  const onDuty = isCltOnDutyToday(entries);
  const onDutyLabel = entries.length > 0 ? getOnDutyStageLabel(entries) : 'Fora de Serviço';
  return {
    isClt: true,
    onDuty,
    onDutyLabel,
    minutesOnDuty: onDuty ? getMinutesOnDutyToday(entries) : 0,
    punchMarks,
  };
}

export function hasPunchedToday(entries: Pick<TimeClockEntry, 'type'>[] | undefined): boolean {
  return (entries?.length || 0) > 0;
}
