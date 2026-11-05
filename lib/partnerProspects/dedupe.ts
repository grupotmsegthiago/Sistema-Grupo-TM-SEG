import { digitosCnpj, cnpjValido14 } from './cnpj';

export type CnpjRow = { id?: string | number; cnpj?: string | null; name?: string | null };

export type DedupeResult =
  | { ok: true; cnpj: string }
  | { ok: false; motivo: 'cnpj_invalido' | 'duplicado_fornecedor' | 'duplicado_prospecto'; match?: CnpjRow };

/**
 * Checa CNPJ de 14 dígitos contra fornecedores e a própria fila.
 * Nome parecido não bloqueia — só CNPJ.
 */
export function checarDuplicataCnpj(
  cnpjBruto: unknown,
  providers: CnpjRow[],
  prospects: CnpjRow[],
  excludeProspectId?: string | null,
): DedupeResult {
  if (!cnpjValido14(cnpjBruto)) {
    return { ok: false, motivo: 'cnpj_invalido' };
  }
  const cnpj = digitosCnpj(cnpjBruto);

  const noFornecedor = (providers || []).find((p) => digitosCnpj(p.cnpj) === cnpj);
  if (noFornecedor) {
    return { ok: false, motivo: 'duplicado_fornecedor', match: noFornecedor };
  }

  const naFila = (prospects || []).find((p) => {
    if (excludeProspectId && String(p.id) === String(excludeProspectId)) return false;
    return digitosCnpj(p.cnpj) === cnpj;
  });
  if (naFila) {
    return { ok: false, motivo: 'duplicado_prospecto', match: naFila };
  }

  return { ok: true, cnpj };
}

/** Aviso visual: razão social muito parecida (não bloqueia). */
export function avisoNomeParecido(
  companyName: string,
  providers: CnpjRow[],
): CnpjRow | null {
  const alvo = normalizarNome(companyName);
  if (alvo.length < 5) return null;
  for (const p of providers || []) {
    const n = normalizarNome(p.name || '');
    if (!n) continue;
    if (n === alvo || n.includes(alvo) || alvo.includes(n)) return p;
  }
  return null;
}

function normalizarNome(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}
