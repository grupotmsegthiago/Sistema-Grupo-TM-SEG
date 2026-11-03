export const DHL_CANCELLED_HOURS_CUTOFF = '2026-09-01T00:00:00-03:00';

export type DhlEndTimeHistory = {
  changedAt?: string | null;
  newValue?: string | null;
};

type CancelledSheetWindowInput = {
  scheduledIso?: string | null;
  currentEndIso?: string | null;
  cancelStatusAt?: string | null;
  endTimeHistory?: DhlEndTimeHistory[];
};

export type DhlCancelledSheetWindow = {
  start: string;
  end: string;
  cancelledBefore: boolean;
  usesExecutedWindow: boolean;
};

function validTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

/**
 * A partir de setembro/2026, a planilha DHL deve repetir a janela já usada
 * pela Auditoria de Faturamento: agendamento até o menor fim operacional
 * válido (end_time registrado no cancelamento) ou momento do cancelamento.
 *
 * Antes do corte, preserva o comportamento histórico da planilha (0 hora).
 */
export function resolveDhlCancelledSheetWindow(
  input: CancelledSheetWindowInput,
): DhlCancelledSheetWindow {
  const start = input.scheduledIso || '';
  const startMs = validTime(start);
  const cutoffMs = new Date(DHL_CANCELLED_HOURS_CUTOFF).getTime();
  if (startMs == null || startMs < cutoffMs) {
    return { start, end: start, cancelledBefore: true, usesExecutedWindow: false };
  }

  const cancelMs = validTime(input.cancelStatusAt);
  const endAtCancel = (input.endTimeHistory || [])
    .map((entry) => ({
      changedAt: validTime(entry.changedAt),
      newValue: entry.newValue || '',
      endMs: validTime(entry.newValue),
    }))
    .filter((entry) => (
      entry.changedAt != null
      && cancelMs != null
      && Math.abs(entry.changedAt - cancelMs) <= 2_000
      && entry.endMs != null
      && entry.endMs > startMs
    ))
    .sort((a, b) => Math.abs(a.changedAt! - cancelMs!) - Math.abs(b.changedAt! - cancelMs!))[0];

  const candidates = [
    endAtCancel?.newValue,
    input.currentEndIso,
    input.cancelStatusAt,
  ]
    .map((value) => ({ value: value || '', time: validTime(value) }))
    .filter((entry) => entry.time != null && entry.time > startMs)
    .filter((entry) => cancelMs == null || entry.time! <= cancelMs)
    .sort((a, b) => a.time! - b.time!);

  const end = candidates[0]?.value || start;
  const endMs = validTime(end);
  const usesExecutedWindow = endMs != null && endMs > startMs;
  return {
    start,
    end: usesExecutedWindow ? end : start,
    cancelledBefore: !usesExecutedWindow,
    usesExecutedWindow,
  };
}
