/**
 * Lista operacional de OS no servidor.
 * O navegador não escolhe a coluna: a resposta nunca traz valor nem auditoria.
 */
import { COLUNAS_OPERACIONAIS_OS, COLUNAS_PROTEGIDAS_OS, ehColunaProtegidaOs } from '../financeiro/colunasProtegidas';

export type PassoLeituraOs = { m: string; args: unknown[] };

const LEITURA = new Set([
  'select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in',
  'or', 'not', 'filter', 'match', 'order', 'limit', 'range', 'single', 'maybeSingle',
  'contains', 'containedBy', 'overlaps', 'textSearch',
]);

export function selectOperacional(): string {
  return COLUNAS_OPERACIONAIS_OS.join(',');
}

export function passosDeLeituraOs(passos: unknown): passos is PassoLeituraOs[] {
  if (!Array.isArray(passos) || passos.length === 0 || passos.length > 40) return false;
  const validos = passos.every((passo) => {
    if (!passo || typeof passo !== 'object') return false;
    const item = passo as PassoLeituraOs;
    return typeof item.m === 'string' && LEITURA.has(item.m) && Array.isArray(item.args) && item.args.length <= 8;
  });
  return validos && (passos[0] as PassoLeituraOs).m === 'select';
}

function textoTemProtegida(valor: unknown): boolean {
  const texto = typeof valor === 'string' ? valor : JSON.stringify(valor ?? '');
  return COLUNAS_PROTEGIDAS_OS.some((coluna) => new RegExp(`(^|[^A-Za-z0-9_])${coluna}([^A-Za-z0-9_]|$)`).test(texto));
}

/** Filtro que cita valor ou auditoria. O select do cliente é ignorado de propósito. */
export function filtroUsaColunaProtegida(passos: PassoLeituraOs[]): boolean {
  for (const passo of passos) {
    if (passo.m === 'select') continue;
    if (passo.m === 'or' || passo.m === 'not' || passo.m === 'match' || passo.m === 'filter') {
      if (textoTemProtegida(passo.args)) return true;
      continue;
    }
    if (ehColunaProtegidaOs(String(passo.args?.[0] ?? ''))) return true;
  }
  return false;
}

export function decisaoLeituraOs(passos: unknown, podeValor: boolean): 'ok' | 'invalida' | 'protegida' {
  if (!passosDeLeituraOs(passos)) return 'invalida';
  if (filtroUsaColunaProtegida(passos) && !podeValor) return 'protegida';
  return 'ok';
}

export function semColunasProtegidas(data: unknown): unknown {
  if (Array.isArray(data)) return data.map((linha) => (linha && typeof linha === 'object' ? semUma(linha as Record<string, unknown>) : linha));
  if (data && typeof data === 'object') return semUma(data as Record<string, unknown>);
  return data;
}

function semUma(linha: Record<string, unknown>): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(linha)) {
    if (!ehColunaProtegidaOs(chave)) saida[chave] = valor;
  }
  return saida;
}

function selectForcado(passos: PassoLeituraOs[]): PassoLeituraOs[] {
  const opcoes = passos[0]?.args?.[1];
  const primeiro: PassoLeituraOs = opcoes && typeof opcoes === 'object'
    ? { m: 'select', args: [selectOperacional(), opcoes] }
    : { m: 'select', args: [selectOperacional()] };
  return [primeiro, ...passos.slice(1)];
}

export async function executarLeituraOs(
  sb: { from: (tabela: string) => any },
  passos: PassoLeituraOs[],
): Promise<{ data: unknown; error: { message: string } | null; count: number | null }> {
  let consulta: any = sb.from('missions');
  for (const passo of selectForcado(passos)) {
    const metodo = consulta[passo.m];
    if (typeof metodo !== 'function') {
      throw new Error('operacao');
    }
    consulta = metodo.apply(consulta, passo.args || []);
  }
  const resultado = await consulta;
  return {
    data: semColunasProtegidas(resultado?.data ?? null),
    error: resultado?.error ? { message: String(resultado.error.message || 'Falha.') } : null,
    count: resultado?.count ?? null,
  };
}
