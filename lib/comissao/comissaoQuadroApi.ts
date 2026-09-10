/**
 * Quadro de comissões via service_role.
 * O browser usa chave anon e financial_invoices só tem policy para authenticated
 * (o login do sistema não faz supabase.auth.signIn) — a consulta no cliente volta vazia.
 */
import {
  carregarPendenciasComissao,
  sincronizarComissoesFaturasExistentes,
} from './sincronizarComissoesFaturas.js';
import {
  aplicarPisoComissaoQuadro,
  carregarQuadroTmSeg,
  faturasDeOsParaQuadro,
  mesclarLinhasQuadro,
  mesesComFatura,
  montarQuadroClientes,
  type LinhaQuadroCliente,
} from './quadroFaturamentoComissao.js';
import { carregarQuadroTorres } from './quadroTorres.js';
import { carregarCoberturaOsPeriodo, coberturaVazia, type CoberturaOsPeriodo } from './coberturaOsPeriodo.js';
import type { ComissaoDbClient } from './comissaoCore.js';

export type QuadroComissoesApiResult = {
  ok: boolean;
  linhasTm: LinhaQuadroCliente[];
  linhasTorres: LinhaQuadroCliente[];
  meses: string[];
  pendencias: Awaited<ReturnType<typeof carregarPendenciasComissao>>['pendencias'];
  cobertura: CoberturaOsPeriodo;
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
      cobertura: coberturaVazia('ERRO', comErr.message, true),
      error: comErr.message,
    };
  }
  const lista = (comerciais || []) as Array<{ id: string; nome?: string | null }>;
  const [quadro, torres, cobertura, pend] = await Promise.all([
    carregarQuadroTmSeg(sb, periodStart, periodEnd, lista),
    carregarQuadroTorres(sb, periodStart, periodEnd, lista),
    carregarCoberturaOsPeriodo(sb, periodStart, periodEnd, lista),
    carregarPendenciasComissao(sb),
  ]);
  const linhasOs = montarQuadroClientes(
    faturasDeOsParaQuadro(cobertura.itens),
    [],
    lista,
    periodStart,
    periodEnd,
  );
  const linhasTm = mesclarLinhasQuadro(quadro.linhas, linhasOs);
  const comPiso = aplicarPisoComissaoQuadro(linhasTm, torres.linhas);
  const mesesOs = mesesComFatura(
    cobertura.itens.map((os) => ({ date: os.date, status: os.faturada ? 'PAGA' : 'EMITIDA' })),
  );
  return {
    ok: !quadro.error || quadro.linhas.length > 0 || linhasTm.length > 0 || quadro.meses.length > 0 || torres.linhas.length > 0,
    linhasTm: comPiso.linhasTm,
    linhasTorres: comPiso.linhasTorres,
    meses: [...new Set([...quadro.meses, ...mesesOs])].sort().reverse(),
    pendencias: pend.ok ? pend.pendencias : [],
    cobertura,
    error: quadro.error || torres.error || (!pend.ok ? pend.error : undefined) || cobertura.error,
  };
}

export async function sincronizarComissoesViaAdmin(sb: ComissaoDbClient) {
  return sincronizarComissoesFaturasExistentes(sb);
}
