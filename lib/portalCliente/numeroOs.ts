/** Próximo GTM. A sequência do banco é a fonte atômica. Sem ela, vale o maior número de todas as OS, não uma amostra. */

import { fetchAllPages } from '../supabasePaging';

type ConsultaNumero = {
  from: (tabela: string) => any;
  rpc?: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;
};

export function extrairNumeroGtm(id: string): number {
  const match = /^GTM-(\d+)$/i.exec(String(id || '').trim());
  if (!match) return 0;
  const numero = Number(match[1]);
  return Number.isSafeInteger(numero) && numero > 0 ? numero : 0;
}

export function maiorNumeroGtm(ids: string[]): number {
  let maximo = 0;
  for (const id of ids) {
    const numero = extrairNumeroGtm(id);
    if (numero > maximo) maximo = numero;
  }
  return maximo;
}

export function formatarIdGtm(numero: number): string {
  return `GTM-${String(numero).padStart(4, '0')}`;
}

function funcaoDeNumeroAusente(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const codigo = String(error.code || '');
  const texto = String(error.message || '').toLowerCase();
  return codigo === 'PGRST202'
    || codigo === '42883'
    || texto.includes('proximo_numero_gtm')
    || texto.includes('could not find the function')
    || texto.includes('schema cache');
}

async function maiorNumeroNaBase(sb: ConsultaNumero): Promise<number> {
  const pagina = await fetchAllPages<{ id: string }>(
    async (inicio, tamanho) => sb.from('missions')
      .select('id', { count: 'exact' })
      .like('id', 'GTM-%')
      .order('id', { ascending: true })
      .range(inicio, inicio + tamanho - 1),
    1000,
    50_000,
    { getRowKey: (linha) => linha.id },
  );
  if (!pagina.complete) {
    throw new Error('A leitura dos números GTM ficou incompleta. A OS não foi numerada.');
  }
  return maiorNumeroGtm(pagina.rows.map((linha) => String(linha.id || '')));
}

/** Próximo inteiro livre. Não olha só as últimas gravações. */
export async function proximoNumeroGtm(sb: ConsultaNumero): Promise<number> {
  if (typeof sb.rpc === 'function') {
    const { data, error } = await sb.rpc('proximo_numero_gtm');
    if (!error) {
      const numero = Number(data);
      if (Number.isSafeInteger(numero) && numero > 0) return numero;
      throw new Error('A sequência GTM devolveu um número inválido.');
    }
    if (!funcaoDeNumeroAusente(error)) {
      throw new Error(error.message || 'Não foi possível numerar a OS.');
    }
  }
  return (await maiorNumeroNaBase(sb)) + 1;
}
