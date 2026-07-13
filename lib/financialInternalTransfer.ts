/**
 * Transferências internas entre empresas/contas do Grupo TM SEG.
 * Não são receita de cliente nem despesa operacional — só mudam de conta.
 */

export const INTERNAL_TRANSFER_NOTE_TAG = '[TRANSFERÊNCIA INTERNA]';

/** Contas operacionais oficiais do grupo (caixa consolidado). */
export const TMSEG_GROUP_ACCOUNT_NAMES = [
  'TM GESTÃO',
  'TM GESTAO',
  'TM MANAGEMENT',
  'TM SECURITY',
  'TM SEGURANÇA',
  'TM SEGURANCA',
  'TM SEG',
] as const;

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Normaliza texto para comparação (maiúsculas, sem acento, espaços colapsados). */
export function normalizeFinancialText(value: string | null | undefined): string {
  return stripDiacritics(String(value || ''))
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Detecta menção a empresa do grupo (TM SEG / TM Security / TM Gestão).
 * Evita falso positivo genérico em "SEGURANÇA" isolado.
 */
export function textMentionsGroupCompany(value: string | null | undefined): boolean {
  const n = normalizeFinancialText(value);
  if (!n) return false;
  if (/\bGRUPO TM ?SEG\b/.test(n) || /\bTMSEG\b/.test(n)) return true;
  if (/\bTM GESTAO\b/.test(n) || /\bTM MANAGEMENT\b/.test(n)) return true;
  if (/\bTM SECURITY\b/.test(n) || /\bTMSECURITY\b/.test(n)) return true;
  if (/\bTM SEGURANCA\b/.test(n)) return true;
  // "TM SEG" como token (não "TM SEGURO" etc.)
  if (/\bTM SEG\b/.test(n)) return true;
  return false;
}

function hasExplicitTransferKeyword(value: string | null | undefined): boolean {
  const n = normalizeFinancialText(value);
  if (!n) return false;
  if (/\bREPASSE\b/.test(n)) return true;
  if (/\bTRANSFERENCIA INTERNA\b/.test(n)) return true;
  if (/\bTRANSFERENCIA ENTRE CONTAS\b/.test(n)) return true;
  if (/\bENTRE CONTAS\b/.test(n)) return true;
  if (/\bTRANSFERENCIA DO GRUPO\b/.test(n)) return true;
  return false;
}

export type InternalTransferLike = {
  description?: string | null;
  entity_name?: string | null;
  category_name?: string | null;
  notes?: string | null;
  account_name?: string | null;
};

/**
 * True quando o lançamento é movimentação entre contas/empresas do grupo
 * (TM SEG ↔ TM Security ↔ TM Gestão), e não recebimento de cliente externo.
 */
export function isInternalGroupTransfer(t: InternalTransferLike): boolean {
  const notes = String(t.notes || '');
  if (notes.includes(INTERNAL_TRANSFER_NOTE_TAG)) return true;

  const entity = String(t.entity_name || '').trim();
  if (entity && textMentionsGroupCompany(entity)) return true;

  const category = String(t.category_name || '');
  if (hasExplicitTransferKeyword(category) && (textMentionsGroupCompany(category) || /interna|entre|grupo|repasse|conta/i.test(category))) {
    return true;
  }
  if (/transfer/i.test(category) && /interna|entre\s*contas|grupo|repasse/i.test(category)) {
    return true;
  }

  const blob = `${t.description || ''} ${t.notes || ''}`;
  if (hasExplicitTransferKeyword(blob) && textMentionsGroupCompany(blob)) return true;
  if (/repasse\s*tm\s*seg/i.test(blob)) return true;
  if (/transfer[eê]ncia\s*(interna|entre\s*contas|do\s*grupo)/i.test(blob)) return true;

  // Descrição essencialmente só o nome da empresa do grupo (crédito/débito espelho)
  const descNorm = normalizeFinancialText(t.description);
  if (descNorm && textMentionsGroupCompany(descNorm)) {
    const stripped = descNorm
      .replace(/\bGRUPO TM ?SEG\b/g, ' ')
      .replace(/\bTMSEG\b/g, ' ')
      .replace(/\bTM GESTAO\b/g, ' ')
      .replace(/\bTM MANAGEMENT\b/g, ' ')
      .replace(/\bTM SECURITY\b/g, ' ')
      .replace(/\bTMSECURITY\b/g, ' ')
      .replace(/\bTM SEGURANCA\b/g, ' ')
      .replace(/\bTM SEG\b/g, ' ')
      .replace(/\bTRANSFERENCIA\b/g, ' ')
      .replace(/\bREPASSE\b/g, ' ')
      .replace(/\bINTERNA\b/g, ' ')
      .replace(/\bENTRE\b/g, ' ')
      .replace(/\bCONTAS?\b/g, ' ')
      .replace(/\bDE\b/g, ' ')
      .replace(/\bPARA\b/g, ' ')
      .trim();
    if (!stripped) return true;
  }

  return false;
}
