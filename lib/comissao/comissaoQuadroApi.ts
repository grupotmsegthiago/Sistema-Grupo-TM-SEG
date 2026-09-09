/**
 * Quadro de comissões via service_role.
 * O browser usa chave anon e financial_invoices só tem policy para authenticated
 * (o login do sistema não faz supabase.auth.signIn) — a consulta no cliente volta vazia.
 */
import {
  carregarPendenciasComissao,
  fetchAllRows,
  sincronizarComissoesFaturasExistentes,
} from './sincronizarComissoesFaturas.js';
import {
  carregarQuadroTmSeg,
  quadroDeComissoesTorres,
  type LinhaQuadroCliente,
} from './quadroFaturamentoComissao.js';
import type { ComissaoDbClient } from './comissaoCore.js';

export type QuadroComissoesApiResult = {
  ok: boolean;
  linhasTm: LinhaQuadroCliente[];
  linhasTorres: LinhaQuadroCliente[];
  meses: string[];
  pendencias: Awaited<ReturnType<typeof carregarPendenciasComissao>>['pendencias'];
  error?: string;
};

export async function montarQuadroComissoesApi(
  sb: ComissaoDbClient,
  periodStart: string,
  periodEnd: string,
): Promise<QuadroComissoesApiResult> {
  const { data: comerciais, error: comErr } = await sb.from('comerciais').select('id, nome');
  if (comErr) {
    return {
      ok: false,
      linhasTm: [],
      linhasTorres: [],
      meses: [],
      pendencias: [],
      error: comErr.message,
    };
  }
  const lista = (comerciais || []) as Array<{ id: string; nome?: string | null }>;
  const quadro = await carregarQuadroTmSeg(sb, periodStart, periodEnd, lista);
  const torresCols =
    'empresa_origem, cliente_nome, valor_faturamento, valor_comissao, percentual_imposto_aplicado, valor_base_liquida, comerciais(nome)';
  let torresRes = await fetchAllRows(
    sb,
    'comissoes',
    torresCols,
    (q) => q.eq('empresa_origem', 'TORRES').gte('data_faturamento', periodStart).lte('data_faturamento', periodEnd),
  );
  if (torresRes.error) {
    torresRes = await fetchAllRows(
      sb,
      'comissoes',
      'empresa_origem, cliente_nome, valor_faturamento, valor_comissao, percentual_imposto_aplicado, valor_base_liquida',
      (q) => q.eq('empresa_origem', 'TORRES').gte('data_faturamento', periodStart).lte('data_faturamento', periodEnd),
    );
  }
  const pend = await carregarPendenciasComissao(sb);
  return {
    ok: !quadro.error || quadro.linhas.length > 0 || quadro.meses.length > 0,
    linhasTm: quadro.linhas,
    linhasTorres: quadroDeComissoesTorres(torresRes.rows || []),
    meses: quadro.meses,
    pendencias: pend.ok ? pend.pendencias : [],
    error: quadro.error || torresRes.error || (!pend.ok ? pend.error : undefined),
  };
}

export async function sincronizarComissoesViaAdmin(sb: ComissaoDbClient) {
  return sincronizarComissoesFaturasExistentes(sb);
}
