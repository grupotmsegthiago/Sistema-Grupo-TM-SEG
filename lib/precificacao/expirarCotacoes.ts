import { colunaRegionalAusente, PRAZO_COTACAO_MS } from './tabela2027';

type ClienteCotacao = {
  from: (tabela: string) => {
    update: (valores: { is_active: false; status: 'expirada' }) => {
      is: (coluna: string, valor: null) => {
        eq: (coluna: string, valor: boolean) => {
          lt: (coluna: string, valor: string) => {
            neq: (coluna: string, valor: string) => PromiseLike<{ error: { code?: string; message?: string } | null; data?: unknown }>;
          };
        };
      };
    };
  };
};

/** Marca como expirada a cotação sem OS e com mais de 10 dias. Não mexe em cotação convertida. */
export async function checkAndExpireQuotations(db: ClienteCotacao): Promise<{ expiradas: boolean; colunaAusente: boolean; erro?: string }> {
  const limite = new Date(Date.now() - PRAZO_COTACAO_MS).toISOString();
  const resultado = await db
    .from('quotes')
    .update({ is_active: false, status: 'expirada' })
    .is('converted_to_order_id', null)
    .eq('is_active', true)
    .lt('created_at', limite)
    .neq('status', 'expirada');
  if (!resultado.error) return { expiradas: true, colunaAusente: false };
  if (colunaRegionalAusente(resultado.error)) return { expiradas: false, colunaAusente: true, erro: resultado.error.message };
  return { expiradas: false, colunaAusente: false, erro: resultado.error.message };
}
