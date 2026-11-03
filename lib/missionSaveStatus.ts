import { MissionStatus } from '../types';

/** Fases iniciais em que o operador cadastra equipe/documentação sem concluir a OS. */
export const MISSION_PRE_FLIGHT_STATUSES: readonly MissionStatus[] = [
  MissionStatus.SOLICITED,
  MissionStatus.DOCUMENTATION,
  MissionStatus.SCHEDULED,
];

const TERMINAL_STATUSES: readonly MissionStatus[] = [
  MissionStatus.COMPLETED,
  MissionStatus.CANCELLED,
  MissionStatus.REFUSED,
];

/**
 * Ao clicar em "Salvar Alterações" numa OS em fase inicial, preserva o status
 * operacional se o operador selecionou Concluída/Cancelada/Recusada por engano
 * (ex.: clicou no botão de status e cancelou o checklist).
 * A conclusão real continua pelo botão Concluída + checklist confirmado.
 */
export function resolveStatusForSaveSubmit(opts: {
  missionStatus: string;
  editStatus: string;
  originalStatus: string;
  finalizeConfirmed: boolean;
}): string {
  const { missionStatus, editStatus, originalStatus, finalizeConfirmed } = opts;
  if (finalizeConfirmed) return editStatus;
  if (!MISSION_PRE_FLIGHT_STATUSES.includes(missionStatus as MissionStatus)) return editStatus;
  if (!TERMINAL_STATUSES.includes(editStatus as MissionStatus)) return editStatus;
  return originalStatus || missionStatus;
}

/**
 * Perfil Operador pode marcar a OS como Recusada e anexar a evidência.
 * OS aprovada no financeiro e OS travada por prejuízo continuam fechadas.
 */
export function canOperatorRefuseOs(
  role: string | null | undefined,
  opts: { billingApproved?: boolean; negativeLocked?: boolean } = {},
): boolean {
  if (opts.billingApproved || opts.negativeLocked) return false;
  const normalized = String(role || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  return normalized === 'operador' || normalized === 'operacional';
}

/** Status a restaurar no formulário quando o operador cancela o checklist de finalização. */
export function statusToRestoreOnFinalizeCancel(opts: {
  originalStatus: string;
  missionStatus: string;
}): string {
  return opts.originalStatus || opts.missionStatus;
}
