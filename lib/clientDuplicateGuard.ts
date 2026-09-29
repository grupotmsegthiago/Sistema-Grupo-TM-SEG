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

export type ClienteCarteiraRow = ClienteDocRow & {
  trading_name?: string | null;
  created_by?: string | null;
  responsavel_comercial_id?: string | null;
  is_prospect?: boolean | null;
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

/** Status operacional do cadastro TM SEG (Ativo / Inativo). */
export function clienteStatusAtivo(status: unknown): boolean {
  const s = String(status ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!s) return true;
  return s !== 'inativo';
}

/**
 * Carteira do comercial: cadastrou (created_by) OU é responsável comercial.
 * Fail-closed: sem nome e sem UUID → fora da carteira.
 */
export function clienteNaCarteiraComercial(
  client: ClienteCarteiraRow | null | undefined,
  opts: { userName?: string | null; comercialId?: string | null },
): boolean {
  if (!client) return false;
  const comercialId = String(opts.comercialId || '').trim().toLowerCase();
  const owner = String(client.responsavel_comercial_id || '').trim().toLowerCase();
  if (comercialId && owner && owner === comercialId) return true;
  const userName = String(opts.userName || '').trim().toLowerCase();
  const createdBy = String(client.created_by || '').trim().toLowerCase();
  if (userName && createdBy && createdBy === userName) return true;
  return false;
}

/**
 * Monta cláusula `.or()` do PostgREST para a carteira do comercial.
 * Retorna null se não houver nenhum critério (fail-closed → lista vazia).
 */
export function montarFiltroOrCarteiraComercial(opts: {
  userName?: string | null;
  comercialId?: string | null;
  extraIds?: Array<string | number>;
}): string | null {
  const parts: string[] = [];
  const name = String(opts.userName || '').trim();
  if (name) {
    // Aspas: nomes com espaço (ex.: MIGUEL MOTA)
    const escaped = name.replace(/"/g, '');
    parts.push(`created_by.ilike."${escaped}"`);
  }
  const comercialId = String(opts.comercialId || '').trim();
  if (comercialId) {
    parts.push(`responsavel_comercial_id.eq.${comercialId}`);
  }
  const ids = (opts.extraIds || [])
    .map((id) => String(id).trim())
    .filter((id) => /^\d+$/.test(id));
  if (ids.length > 0) {
    parts.push(`id.in.(${ids.join(',')})`);
  }
  return parts.length > 0 ? parts.join(',') : null;
}

/**
 * Remove duplicatas por CNPJ/CPF na listagem: prioriza Ativo, depois maior id.
 * Usado na carteira do comercial para não reaparecer tentativa falha de cadastro.
 */
export function deduparClientesPorDocumento<T extends ClienteCarteiraRow>(rows: T[]): T[] {
  const byDoc = new Map<string, T>();
  const semDoc: T[] = [];
  for (const row of rows || []) {
    const digits = digitosDocumentoCliente(row.cnpj);
    if (digits.length !== 11 && digits.length !== 14) {
      semDoc.push(row);
      continue;
    }
    const prev = byDoc.get(digits);
    if (!prev) {
      byDoc.set(digits, row);
      continue;
    }
    const prevAtivo = clienteStatusAtivo(prev.status);
    const rowAtivo = clienteStatusAtivo(row.status);
    if (rowAtivo && !prevAtivo) {
      byDoc.set(digits, row);
      continue;
    }
    if (rowAtivo === prevAtivo && Number(row.id) > Number(prev.id)) {
      byDoc.set(digits, row);
    }
  }
  return [...byDoc.values(), ...semDoc];
}
