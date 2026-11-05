import { digitosCnpj, cnpjValido14 } from './cnpj';

/** CNAEs-alvo: escolta/transporte de valores e vigilância/segurança privada. */
export const CNAES_ESCOLTA_SEGURANCA = new Set(['8012700', '8011900']);

export type BrasilApiCnpj = {
  cnpj: string;
  razao_social?: string;
  nome_fantasia?: string;
  descricao_situacao_cadastral?: string;
  uf?: string;
  municipio?: string;
  ddd_telefone_1?: string;
  email?: string;
  cnae_fiscal?: number | string;
  cnae_fiscal_descricao?: string;
  cnaes_secundarios?: Array<{ codigo?: number | string; descricao?: string }>;
};

export type ValidacaoCnpjRadar =
  | {
      ok: true;
      cnpj: string;
      razaoSocial: string;
      nomeFantasia: string | null;
      uf: string | null;
      cidade: string | null;
      telefoneApi: string | null;
      emailApi: string | null;
      cnaes: string[];
    }
  | { ok: false; motivo: string };

function normalizarCnae(codigo: unknown): string {
  return String(codigo ?? '').replace(/\D/g, '');
}

export function cnaesDaFicha(ficha: BrasilApiCnpj): string[] {
  const out = new Set<string>();
  const prim = normalizarCnae(ficha.cnae_fiscal);
  if (prim) out.add(prim);
  for (const s of ficha.cnaes_secundarios || []) {
    const c = normalizarCnae(s?.codigo);
    if (c) out.add(c);
  }
  return [...out];
}

export function temCnaeEscoltaOuSeguranca(cnaes: string[]): boolean {
  return cnaes.some((c) => CNAES_ESCOLTA_SEGURANCA.has(c));
}

export function situacaoAtiva(descricao: unknown): boolean {
  return String(descricao || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .includes('ATIVA');
}

/**
 * Consulta BrasilAPI (gratuita). Fail-closed: erro de rede = inválido.
 * https://brasilapi.com.br/docs#tag/CNPJ
 */
export async function validarCnpjBrasilApi(
  cnpjBruto: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<ValidacaoCnpjRadar> {
  if (!cnpjValido14(cnpjBruto)) {
    return { ok: false, motivo: 'cnpj_invalido' };
  }
  const cnpj = digitosCnpj(cnpjBruto);
  try {
    const res = await fetchImpl(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      headers: { Accept: 'application/json' },
    });
    if (res.status === 404) return { ok: false, motivo: 'cnpj_nao_encontrado' };
    if (!res.ok) return { ok: false, motivo: `brasilapi_http_${res.status}` };
    const ficha = (await res.json()) as BrasilApiCnpj;
    if (!situacaoAtiva(ficha.descricao_situacao_cadastral)) {
      return { ok: false, motivo: 'situacao_nao_ativa' };
    }
    const cnaes = cnaesDaFicha(ficha);
    if (!temCnaeEscoltaOuSeguranca(cnaes)) {
      return { ok: false, motivo: 'cnae_fora_do_escopo' };
    }
    const tel = [ficha.ddd_telefone_1].filter(Boolean).join('').trim() || null;
    return {
      ok: true,
      cnpj,
      razaoSocial: String(ficha.razao_social || '').trim() || `CNPJ ${cnpj}`,
      nomeFantasia: String(ficha.nome_fantasia || '').trim() || null,
      uf: String(ficha.uf || '').trim().toUpperCase().slice(0, 2) || null,
      cidade: String(ficha.municipio || '').trim() || null,
      telefoneApi: tel,
      emailApi: String(ficha.email || '').trim().toLowerCase() || null,
      cnaes,
    };
  } catch (e: any) {
    return { ok: false, motivo: `brasilapi_erro:${e?.message || 'rede'}` };
  }
}
