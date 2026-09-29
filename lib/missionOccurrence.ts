/** Texto do aviso no cartão quando a OS já tem ocorrência salva. */
export const OCCURRENCE_BANNER = 'Essa OS possui ocorrências, verificar..';

const MIN_LENGTH = 5;
const MAX_LENGTH = 2000;

export function normalizeOccurrenceText(raw: string): string {
  return String(raw || '').replace(/\s+/g, ' ').trim();
}

export function occurrenceTextError(raw: string): string | null {
  const text = normalizeOccurrenceText(raw);
  if (text.length < MIN_LENGTH) return 'Descreva o problema para a auditoria poder verificar.';
  if (text.length > MAX_LENGTH) return 'A ocorrência passou de 2000 caracteres.';
  return null;
}

export function missionHasOccurrence(count: number | null | undefined): boolean {
  return Number(count) > 0;
}
