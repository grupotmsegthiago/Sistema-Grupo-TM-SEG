/**
 * Pendência depois que o operador finaliza missão velada de ATIVA ou TM SEG.
 * O aviso pode ser fechado, volta ao abrir o sistema e some da lista
 * quando KM final, hora final e pedágio estão preenchidos.
 */
import { isVeladaMission } from './liveTrack/isVeladaMission';
import { isOdometerExemptProvider } from './veladaFinalize';

export const VELADA_CLOSURE_FINANCE_EMAILS = [
  'giovanna@grupotmseg.com.br',
  'beatriz.machado@grupotmseg.com.br',
] as const;

export const VELADA_CLOSURE_ESCALATION_EMAIL = 'thiago@grupotmseg.com.br';
export const VELADA_CLOSURE_ESCALATION_MS = 48 * 60 * 60 * 1000;

export type VeladaClosureMission = {
  status?: string | null;
  provider?: string | null;
  mission_type?: string | null;
  missionType?: string | null;
  endKm?: number | null;
  end_km?: number | null;
  endTime?: string | null;
  end_time?: string | null;
  startKm?: number | null;
  start_km?: number | null;
  velada_toll_confirmed?: boolean | null;
  velada_closure_operator?: string | null;
  velada_closure_opened_at?: string | null;
};

function normalizeName(name: string | null | undefined): string {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function veladaClosureApplies(mission: VeladaClosureMission | null | undefined): boolean {
  if (!mission) return false;
  const status = String(mission.status || '').trim();
  if (status !== 'Concluída' && status !== 'Concluida') return false;
  if (!isVeladaMission(mission)) return false;
  return isOdometerExemptProvider(mission.provider);
}

export function hasVeladaFinalKm(mission: VeladaClosureMission): boolean {
  const endKm = Number(mission.endKm ?? mission.end_km);
  return Number.isFinite(endKm) && endKm > 0;
}

/** OS concluída da velada ATIVA/TM SEG ainda sem KM para cobrar o fornecedor. */
export function isVeladaFinalKmPending(mission: VeladaClosureMission | null | undefined): boolean {
  if (!mission) return false;
  return veladaClosureApplies(mission) && !hasVeladaFinalKm(mission);
}

export function hasVeladaFinalTime(mission: VeladaClosureMission): boolean {
  const raw = mission.endTime ?? mission.end_time;
  if (raw == null || String(raw).trim() === '') return false;
  const t = new Date(String(raw)).getTime();
  return Number.isFinite(t) && t > 0;
}

export function hasVeladaTollConfirmation(mission: VeladaClosureMission, tollLogExists = false): boolean {
  return mission.velada_toll_confirmed === true || tollLogExists;
}

/** O que ainda falta para o alerta do operador sair. */
export function getVeladaClosureMissing(mission: VeladaClosureMission, tollLogExists = false): string[] {
  if (!veladaClosureApplies(mission)) return [];
  const missing: string[] = [];
  if (!hasVeladaFinalKm(mission)) missing.push('KM FINAL');
  if (!hasVeladaFinalTime(mission)) missing.push('HORA FINAL');
  if (!hasVeladaTollConfirmation(mission, tollLogExists)) missing.push('PEDÁGIO');
  return missing;
}

export function isVeladaClosureOverdue(
  openedAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!openedAt) return false;
  const t = new Date(openedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return nowMs - t >= VELADA_CLOSURE_ESCALATION_MS;
}

export function veladaClosureOperatorMatches(
  storedOperator: string | null | undefined,
  userName: string | null | undefined,
): boolean {
  const stored = normalizeName(storedOperator);
  const user = normalizeName(userName);
  return !!stored && stored === user;
}

export function isThiagoVeladaEscalationUser(user: {
  email?: string | null;
  name?: string | null;
} | null | undefined): boolean {
  const email = String(user?.email || '').trim().toLowerCase();
  if (email === VELADA_CLOSURE_ESCALATION_EMAIL) return true;
  const name = normalizeName(user?.name);
  return name.includes('thiago') && name.includes('moreira');
}

export function veladaFinalKmIsValid(endKm: number, startKm: number | null | undefined): boolean {
  if (!Number.isFinite(endKm) || endKm <= 0) return false;
  const start = Number(startKm);
  if (Number.isFinite(start) && start > 0 && endKm < start) return false;
  return true;
}
