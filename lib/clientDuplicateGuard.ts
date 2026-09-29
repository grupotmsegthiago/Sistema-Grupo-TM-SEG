/** Normalização e detecção de CNPJ/CPF duplicado no cadastro de cliente (TM SEG). */

export function digitosDocumentoCliente(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

export type ClienteDocRow = {
  id: number | string;
  name?: string | null;
  cnpj?: string | null;
  status?: string | null;
};

/**
 * Consulta por CNPJ/CPF nas listas: aceita formatado ou só dígitos.
 * Ex.: termo "03020839000180" encontra "03.020.839/0001-80".
 * Exige ao menos 3 dígitos no termo para match por dígitos (evita falso positivo).
 */
export function documentoCorrespondeBusca(documento: unknown, termo: string): boolean {
  const term = String(termo ?? '').trim();
  if (!term) return false;
  const docStr = String(documento ?? '');
  if (docStr.toLowerCase().includes(term.toLowerCase())) return true;
  const termDigits = digitosDocumentoCliente(term);
  if (termDigits.length < 3) return false;
  return digitosDocumentoCliente(docStr).includes(termDigits);
}

/**
 * Encontra outro registro (cliente/fornecedor) com o mesmo CNPJ/CPF (só dígitos).
 * Falha fechada: sem dígitos suficientes → sem match.
 */
export function acharClienteMesmoDocumento(
  rows: ClienteDocRow[],
  documento: unknown,
  excludeId?: number | string | null,
): ClienteDocRow | null {
  const digits = digitosDocumentoCliente(documento);
  if (digits.length !== 11 && digits.length !== 14) return null;
  const exclude = excludeId == null || excludeId === '' ? null : String(excludeId);
  for (const row of rows || []) {
    if (exclude && String(row.id) === exclude) continue;
    if (digitosDocumentoCliente(row.cnpj) === digits) return row;
  }
  return null;
}

/** Comercial logado: usa o vínculo usuário→comerciais; senão null. */
export function comercialIdDoUsuarioLogado(
  comerciais: Array<{ id: string | number; usuario_id?: number | string | null }>,
  usuarioId: number | string | null | undefined,
): string | null {
  const uid = Number(usuarioId);
  if (!Number.isFinite(uid) || uid <= 0) return null;
  const hit = (comerciais || []).find((c) => Number(c.usuario_id) === uid);
  return hit?.id != null ? String(hit.id) : null;
}

export function perfilEhComercialRole(role: unknown): boolean {
  const r = String(role || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return r === 'comercial' || r.includes('comercial');
}
