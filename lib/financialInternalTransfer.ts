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
  if (/\bTM SECURITY\b/.test(n) || /\bTMSECURITY\b/.test(n) || /\bTM SEGURITY\b/.test(n)) return true;
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

/**
 * Categorias oficiais de “só muda de conta” (não são saída operacional).
 * "TRANSFERÊNCIA" sozinha é ambígua (às vezes pagam fornecedor nela) — não entra aqui.
 */
export function isInternalTransferCategoryName(value: string | null | undefined): boolean {
  const n = normalizeFinancialText(value);
  if (!n) return false;
  if (n === 'TRANSFERENCIA INTERNA') return true;
  if (n === 'TRANSFERENCIA ENTRE CONTAS') return true;
  if (/\bTRANSFERENCIA INTERNA\b/.test(n)) return true;
  if (/\bTRANSFERENCIA ENTRE CONTAS\b/.test(n)) return true;
  return false;
}

function isAmbiguousTransferCategoryName(value: string | null | undefined): boolean {
  const n = normalizeFinancialText(value);
  return n === 'TRANSFERENCIA' || n === 'TRANSFERENCIAS';
}

/** Ruído bancário que sobra em descrições de repasse entre contas do grupo. */
function stripInternalTransferNoise(normalized: string): string {
  return normalized
    .replace(/\bGRUPO TM ?SEG\b/g, ' ')
    .replace(/\bTMSEG\b/g, ' ')
    .replace(/\bTM GESTAO\b/g, ' ')
    .replace(/\bTM MANAGEMENT\b/g, ' ')
    .replace(/\bTM SECURITY\b/g, ' ')
    .replace(/\bTMSECURITY\b/g, ' ')
    .replace(/\bTM SEGURITY\b/g, ' ')
    .replace(/\bTM SEGURANCA\b/g, ' ')
    .replace(/\bTM SEG\b/g, ' ')
    .replace(/\bTRANSFERENCIA\b/g, ' ')
    .replace(/\bTRANSFRTM\b/g, ' ')
    .replace(/\bREPASSE\b/g, ' ')
    .replace(/\bINTERNA\b/g, ' ')
    .replace(/\bENTRE\b/g, ' ')
    .replace(/\bCONTAS?\b/g, ' ')
    .replace(/\bDE\b/g, ' ')
    .replace(/\bPARA\b/g, ' ')
    .replace(/\bDO\b/g, ' ')
    .replace(/\bDA\b/g, ' ')
    .replace(/\bASAAS\b/g, ' ')
    .replace(/\bTED\b/g, ' ')
    .replace(/\bPIX\b/g, ' ')
    .replace(/\bBANCO\b/g, ' ')
    .replace(/\bITAU\b/g, ' ')
    .replace(/\bITAÚ\b/g, ' ')
    .replace(/\bXP\b/g, ' ')
    .replace(/\bBTG\b/g, ' ')
    .replace(/\bINVESTIMENTOS?\b/g, ' ')
    .replace(/\bSALDO\b/g, ' ')
    .replace(/\bCOBRIR\b/g, ' ')
    .replace(/\bNEGATIVO\b/g, ' ')
    .replace(/\bEMPRESAS?\b/g, ' ')
    .replace(/\bHOLDING\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type InternalTransferLike = {
  description?: string | null;
  entity_name?: string | null;
  category_name?: string | null;
  category_id?: string | null;
  notes?: string | null;
  account_name?: string | null;
};

export type CategoryNameLookup = {
  id?: string | null;
  name?: string | null;
};

/** Resolve category_name mesmo quando a linha só tem category_id. */
export function resolveTransactionCategoryName(
  t: InternalTransferLike,
  categories?: CategoryNameLookup[] | null,
): string {
  const fromRow = String(t.category_name || '').trim();
  if (fromRow) return fromRow;
  const id = String(t.category_id || '').trim();
  if (!id || !categories?.length) return '';
  const hit = categories.find((c) => String(c.id || '') === id);
  return String(hit?.name || '').trim();
}

/**
 * True quando o lançamento é movimentação entre contas/empresas do grupo
 * (TM SEG ↔ TM Security ↔ TM Gestão / XP / Asaas interno), e não saída operacional.
 */
export function isInternalGroupTransfer(
  t: InternalTransferLike,
  categories?: CategoryNameLookup[] | null,
): boolean {
  const notes = String(t.notes || '');
  if (notes.includes(INTERNAL_TRANSFER_NOTE_TAG)) return true;

  const entity = String(t.entity_name || '').trim();
  if (entity && textMentionsGroupCompany(entity)) return true;

  const category = resolveTransactionCategoryName(t, categories);
  if (isInternalTransferCategoryName(category)) return true;

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

  // Categoria genérica "TRANSFERÊNCIA" + menção à empresa do grupo = repasse interno
  // (ex.: "TM GESTÃO - ASAAS"), sem tratar pagamento de fornecedor na mesma categoria.
  if (isAmbiguousTransferCategoryName(category) && textMentionsGroupCompany(blob)) {
    return true;
  }

  // Descrição essencialmente só o nome da empresa do grupo (+ ruído bancário)
  const descNorm = normalizeFinancialText(t.description);
  if (descNorm && textMentionsGroupCompany(descNorm)) {
    const stripped = stripInternalTransferNoise(descNorm);
    if (!stripped) return true;
  }

  return false;
}
