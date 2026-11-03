import { MissionStatus } from '../types';

/** Mais de 2 horas sem atualização sobe para a prioridade 0. */
export const PANEL_IDLE_CRITICAL_MIN = 120;
/** A partir de 1 hora sem atualização entra na prioridade 2. */
export const PANEL_IDLE_WARN_MIN = 60;
/** Agendamento que começa em até 30 minutos entra na prioridade 0. */
export const PANEL_START_SOON_MIN = 30;

export type MissionPanelLayer = 'atraso' | 'iniciar' | 'atualizar' | 'viagem' | 'solicitada' | 'outras';

export const PANEL_LAYER_ORDER: MissionPanelLayer[] = [
  'atraso',
  'iniciar',
  'atualizar',
  'viagem',
  'solicitada',
  'outras',
];

export const PANEL_LAYER_META: Record<MissionPanelLayer, { title: string; hint: string; rail: string }> = {
  atraso: {
    title: 'Prioridade 0 · Atraso',
    hint: 'Mais de 2 horas sem atualizar, início em até 30 minutos, ou o horário já passou',
    rail: 'bg-red-500',
  },
  iniciar: {
    title: 'Prioridade 1 · Próximas a iniciar',
    hint: 'Agendamento com até 30 minutos para começar',
    rail: 'bg-amber-500',
  },
  atualizar: {
    title: 'Prioridade 2 · Atualizar em 1 hora',
    hint: 'Em viagem ou na origem, com 1 hora ou mais sem atualização',
    rail: 'bg-orange-500',
  },
  viagem: {
    title: 'Em viagem',
    hint: 'Origem e em viagem que estão atualizadas',
    rail: 'bg-violet-500',
  },
  solicitada: {
    title: 'Solicitadas',
    hint: 'Solicitadas, documentação e agendamentos que ainda não estão no prazo',
    rail: 'bg-slate-400',
  },
  outras: {
    title: 'Demais OS',
    hint: 'Concluídas, canceladas, recusadas e pendentes',
    rail: 'bg-gray-300',
  },
};

const NOT_STARTED = new Set<string>([
  MissionStatus.SOLICITED,
  MissionStatus.DOCUMENTATION,
  MissionStatus.SCHEDULED,
]);

const ON_ROAD = new Set<string>([
  MissionStatus.IN_TRANSIT,
  MissionStatus.ORIGIN,
]);

export interface PanelMissionRef {
  id?: string;
  status: string;
  startTime?: string;
  lastUpdate?: string;
  createdAt?: string;
}

export interface PanelPlacement {
  layer: MissionPanelLayer;
  /** Menor valor fica mais acima. */
  rank: number;
  /** Dentro da mesma camada, maior urgência fica primeiro. */
  urgency: number;
}

function minutesSince(iso: string | undefined, nowMs: number): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((nowMs - t) / 60000));
}

export function placeMissionOnPanel(mission: PanelMissionRef, now: Date): PanelPlacement {
  const nowMs = now.getTime();
  const status = mission.status;
  const idle = minutesSince(mission.lastUpdate || mission.createdAt, nowMs);
  const startMs = mission.startTime ? new Date(mission.startTime).getTime() : Number.NaN;
  const minutesToStart = Number.isNaN(startMs) ? null : Math.floor((startMs - nowMs) / 60000);

  // Horário de início já passou: prioridade 0, acima de todo o resto da camada.
  if (NOT_STARTED.has(status) && minutesToStart !== null && minutesToStart < 0) {
    return { layer: 'atraso', rank: 0, urgency: 3_000_000 + Math.abs(minutesToStart) };
  }

  // Mais de 2 horas sem atualizar: prioridade 0.
  if (ON_ROAD.has(status) && idle >= PANEL_IDLE_CRITICAL_MIN) {
    return { layer: 'atraso', rank: 0, urgency: 2_000_000 + idle };
  }

  // Até 30 minutos para iniciar (Agendada, Documentação ou Solicitada): prioridade 0.
  // Inclui o minuto 30 inteiro (00:30:59 ainda conta).
  if (NOT_STARTED.has(status) && minutesToStart !== null && minutesToStart <= PANEL_START_SOON_MIN) {
    return { layer: 'atraso', rank: 0, urgency: 1_000_000 + (PANEL_START_SOON_MIN - minutesToStart) };
  }

  if (ON_ROAD.has(status) && idle >= PANEL_IDLE_WARN_MIN) {
    return { layer: 'atualizar', rank: 2, urgency: idle };
  }

  if (ON_ROAD.has(status)) {
    return { layer: 'viagem', rank: 3, urgency: idle };
  }

  if (NOT_STARTED.has(status)) {
    const soon = minutesToStart === null ? 10_000 : minutesToStart;
    return { layer: 'solicitada', rank: 4, urgency: -soon };
  }

  return { layer: 'outras', rank: 5, urgency: 0 };
}

export function comparePanelMissions(a: PanelMissionRef, b: PanelMissionRef, now: Date): number {
  const pa = placeMissionOnPanel(a, now);
  const pb = placeMissionOnPanel(b, now);
  if (pa.rank !== pb.rank) return pa.rank - pb.rank;
  if (pa.urgency !== pb.urgency) return pb.urgency - pa.urgency;
  const ida = String(a.id || '');
  const idb = String(b.id || '');
  if (ida < idb) return -1;
  if (ida > idb) return 1;
  return 0;
}
