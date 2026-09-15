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
import { carregarIniciosComissao, filtrarLinhasAposCadastro } from './dataInicioComissao.js';

export type QuadroComissoesApiResult = {
  ok: boolean;
  linhasTm: LinhaQuadroCliente[];
  linhasTorres: LinhaQuadroCliente[];
  meses: string[];
  pendencias: Awaited<ReturnType<typeof carregarPendenciasComissao>>['pendencias'];
  cobertura: CoberturaOsPeriodo;
  iniciosComissao: Record<string, string>;
  error?: string;
};

export type QuadroComissoesApiOpts = {
  comercialId?: string | null;
  somenteProprio?: boolean;
};

export function restringirQuadroAoComercial(
  quadro: QuadroComissoesApiResult,
  comercialId: string | null | undefined,
): QuadroComissoesApiResult {
  const id = String(comercialId || '').trim();
  if (!id) {
    return {
      ...quadro,
      linhasTm: [],
      linhasTorres: [],
      pendencias: [],
      cobertura: {
        ...quadro.cobertura,
        itens: [],
        porCliente: [],
        totais: { missoes: 0, faturadas: 0, semFatura: 0, receita: 0, custo: 0, lucro: 0 },
      },
      iniciosComissao: {},
    };
  }
  const linhasTm = quadro.linhasTm.filter((l) => String(l.comercialId || '') === id);
  const linhasTorres = quadro.linhasTorres.filter((l) => String(l.comercialId || '') === id);
  const itens = (quadro.cobertura.itens || []).filter((i) => String(i.comercialId || '') === id);
  const porCliente = (quadro.cobertura.porCliente || []).filter((c) => String(c.comercialId || '') === id);
  const inicio = quadro.iniciosComissao?.[id];
  return {
    ...quadro,
    linhasTm,
    linhasTorres,
    pendencias: [],
    cobertura: {
      ...quadro.cobertura,
      itens,
      porCliente,
      totais: itens.reduce(
        (acc, os) => ({
          missoes: acc.missoes + 1,
          faturadas: acc.faturadas + (os.faturada ? 1 : 0),
          semFatura: acc.semFatura + (os.faturada ? 0 : 1),
          receita: acc.receita + (Number(os.receita) || 0),
          custo: acc.custo + (Number(os.custo) || 0),
          lucro: acc.lucro + (Number(os.lucro) || 0),
        }),
        { missoes: 0, faturadas: 0, semFatura: 0, receita: 0, custo: 0, lucro: 0 },
      ),
    },
    iniciosComissao: inicio ? { [id]: inicio } : {},
  };
}

export async function montarQuadroComissoesApi(
  sb: ComissaoDbClient,
  periodStart: string,
  periodEnd: string,
  opts?: QuadroComissoesApiOpts,
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
      iniciosComissao: {},
      error: comErr.message,
    };
  }
  const lista = (comerciais || []) as Array<{ id: string; nome?: string | null }>;
  const [quadro, torres, cobertura, pend, inicios] = await Promise.all([
    carregarQuadroTmSeg(sb, periodStart, periodEnd, lista),
    carregarQuadroTorres(sb, periodStart, periodEnd, lista),
    carregarCoberturaOsPeriodo(sb, periodStart, periodEnd, lista),
    carregarPendenciasComissao(sb),
    carregarIniciosComissao(sb),
  ]);
  const linhasOs = montarQuadroClientes(
    faturasDeOsParaQuadro(cobertura.itens),
    [],
    lista,
    periodStart,
    periodEnd,
  );
  const linhasTm = filtrarLinhasAposCadastro(
    mesclarLinhasQuadro(quadro.linhas, linhasOs),
    inicios,
  );
  const linhasTorres = filtrarLinhasAposCadastro(torres.linhas, inicios);
  const comPiso = aplicarPisoComissaoQuadro(linhasTm, linhasTorres);
  const mesesTorres = mesesComFatura(
    torres.linhas.flatMap((linha) => (linha.detalhes || []).map((d) => ({
      date: d.date,
      status: d.pago ? 'PAGA' : 'EMITIDA',
    }))),
  );
  const base: QuadroComissoesApiResult = {
    ok: !quadro.error || quadro.linhas.length > 0 || quadro.meses.length > 0 || torres.linhas.length > 0,
    linhasTm: comPiso.linhasTm,
    linhasTorres: comPiso.linhasTorres,
    meses: [...new Set([...quadro.meses, ...mesesTorres])].sort().reverse(),
    pendencias: pend.ok ? pend.pendencias : [],
    cobertura,
    iniciosComissao: Object.fromEntries(inicios),
    error: quadro.error || torres.error || (!pend.ok ? pend.error : undefined) || cobertura.error,
  };
  if (opts?.somenteProprio) {
    return restringirQuadroAoComercial(base, opts.comercialId);
  }
  return base;
}

export async function sincronizarComissoesViaAdmin(sb: ComissaoDbClient) {
  return sincronizarComissoesFaturasExistentes(sb);
}
