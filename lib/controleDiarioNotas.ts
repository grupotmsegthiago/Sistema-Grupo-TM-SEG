/** Texto livre da observação do Controle Diário. Vazio não grava. */
export const CONTROLE_DIARIO_NOTE_MAX = 2000;

export function normalizeControleDiarioNote(raw: unknown): string {
  return String(raw ?? '').replace(/\r\n/g, '\n').trim().slice(0, CONTROLE_DIARIO_NOTE_MAX);
}
