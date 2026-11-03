/** Texto livre da observação do Controle Diário. Vazio não grava. */
export const CONTROLE_DIARIO_NOTE_MAX = 2000;

/** observacao = plantão; auditoria = lembrete na lista de pendências. */
export type ControleDiarioNoteKind = 'observacao' | 'auditoria';

export function normalizeControleDiarioNote(raw: unknown): string {
  return String(raw ?? '').replace(/\r\n/g, '\n').trim().slice(0, CONTROLE_DIARIO_NOTE_MAX);
}

export function normalizeControleDiarioNoteKind(raw: unknown): ControleDiarioNoteKind {
  return raw === 'auditoria' ? 'auditoria' : 'observacao';
}
