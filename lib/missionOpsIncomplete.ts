import { MissionStatus } from '../types';

export type OpsAlertUser = { name?: string | null; role?: string | null };

/** Michelle, Bárbara e Daniel — veem alertas de dados operacionais pendentes. */
export function isOpsAlertRecipient(user: OpsAlertUser | null | undefined): boolean {
  const name = String(user?.name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    name.includes('michelle') ||
    name.includes('barbara') ||
    name.includes('daniel')
  );
}

export function isCompletedMissionStatus(status: string | undefined | null): boolean {
  const s = String(status || '').trim();
  return s === MissionStatus.COMPLETED || s === 'Concluída' || s === 'Concluida';
}

function hasPositiveKm(km: unknown): boolean {
  const n = Number(km);
  return Number.isFinite(n) && n > 0;
}

function hasDateTime(value: unknown): boolean {
  if (value == null || value === '') return false;
  const t = new Date(String(value)).getTime();
  return Number.isFinite(t) && t > 0;
}

type MissionOpsFields = {
  status?: string | null;
  endKm?: number | null;
  end_km?: number | null;
  endTime?: string | null;
  end_time?: string | null;
  startKm?: number | null;
  start_km?: number | null;
  startTime?: string | null;
  start_time?: string | null;
};

/** Campos operacionais obrigatórios em OS concluída antes de aprovar faturamento. */
export function getMissionOpsMissingFields(mission: MissionOpsFields): string[] {
  if (!isCompletedMissionStatus(mission.status)) return [];

  const missing: string[] = [];
  const startKm = mission.startKm ?? mission.start_km;
  const endKm = mission.endKm ?? mission.end_km;
  const startTime = mission.startTime ?? mission.start_time;
  const endTime = mission.endTime ?? mission.end_time;

  if (!hasPositiveKm(startKm)) missing.push('KM INICIAL');
  if (!hasDateTime(startTime)) missing.push('HORA INICIAL');
  if (!hasDateTime(endTime)) missing.push('HORA FINAL');
  if (!hasPositiveKm(endKm)) missing.push('KM FINAL');

  return missing;
}

export function isMissionOpsIncomplete(mission: MissionOpsFields): boolean {
  return getMissionOpsMissingFields(mission).length > 0;
}

/** Status exibido na UI — concluída sem dados completos aparece como PENDENTE. */
export function getMissionOpsDisplayStatus(mission: MissionOpsFields): string {
  if (isMissionOpsIncomplete(mission)) return 'PENDENTE';
  return String(mission.status || '').trim() || '—';
}
