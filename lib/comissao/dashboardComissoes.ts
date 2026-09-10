/**
 * Agregação do dashboard de comissões: quadro do funcionário, pagamento fatura×comissão, margem.
 * Não altera a fórmula (16% / 3% / piso) — só organiza o que já existe.
 */
import { calcularComissao, roundMoney, type ComissaoStatus } from './comissaoCalc.js';
import { calcularApuracaoComissao, valorComissaoLinhaAposPiso } from './tabelaComissaoPadrao.js';
import { chaveLinhaQuadro, faturaClienteEstaPaga, type LinhaQuadroCliente } from './quadroFaturamentoComissao.js';
import { normalizeClienteNome } from './sincronizarComissoesFaturas.js';
import type { CoberturaCliente, CoberturaOsPeriodo } from './coberturaOsPeriodo.js';

export type ComissaoDashboardRow = {
  id: string;
  fatura_id?: string | null;
  origem_fatura_id?: string | null;
  fatura_numero?: string | null;
  comercial_id?: string | null;
  cliente_nome?: string | null;
  valor_faturamento?: number | null;
  valor_comissao?: number | null;
  percentual_comissao_aplicado?: number | null;
  status?: ComissaoStatus | string | null;
  data_recebimento_cliente?: string | null;
  data_pagamento_comissao?: string | null;
};

export type StatusPagamentoPar = 'PAGO' | 'EM_ABERTO' | 'PARCIAL';

export type ClienteDashboard = {
  key: string;
  empresa: string;
  cliente: string;
  comercialId: string | null;
  comercialNome: string | null;
  faturas: number;
  faturamento: number;
  imposto: number;
  baseLiquida: number;
  comissao: number;
  abaixoDoPiso?: boolean;
  missoes: number;
  osFaturadas: number;
  osSemFatura: number;
  osSemFaturaIds: string[];
  coberturaEstado: string;
  receitaOs: number;
  custoOs: number;
  lucroOs: number;
  margemPct: number | null;
  faturasPagas: number;
  faturasAbertas: number;
  comissoesPagas: number;
  comissoesAbertas: number;
  statusFatura: StatusPagamentoPar;
  statusComissao: StatusPagamentoPar;
  detalhes: LinhaQuadroCliente['detalhes'];
};

export type QuadroFuncionario = {
  id: string;
  nome: string;
  pix: string | null;
  valorFixo: number;
  usuarioVinculado: boolean;
  missoes: number;
  osFaturadas: number;
  osSemFatura: number;
  faturamentoBruto: number;
  imposto: number;
  liquido: number;
  comissao3: number;
  bonus: number;
  totalAPagar: number;
  abaixoDoPiso: boolean;
  faturasPagas: number;
  faturasAbertas: number;
  comissaoPaga: number;
  comissaoLiberada: number;
  comissaoAguardando: number;
  statusPagamento: StatusPagamentoPar;
  clientes: ClienteDashboard[];
};

export type KpisDashboardComissao = {
  faturamento: number;
  imposto: number;
  lucroBase: number;
  comissao3: number;
  missoes: number;
  osSemFatura: number;
  margemOperacionalPct: number | null;
  bonus: number;
  coberturaEstado: string;
  consultaIncompleta: boolean;
};

function statusPar(pagas: number, abertas: number): StatusPagamentoPar {
  if (pagas > 0 && abertas > 0) return 'PARCIAL';
  if (pagas > 0 && abertas === 0) return 'PAGO';
  return 'EM_ABERTO';
}

export function acharComissaoDaFatura(
  rows: ComissaoDashboardRow[],
  detalhe: { id?: string | null; numero?: string | null },
): ComissaoDashboardRow | null {
  const id = String(detalhe.id || '').trim();
  const numero = String(detalhe.numero || '').trim();
  return rows.find((r) => {
    const faturaId = String(r.fatura_id || '').trim();
    const origem = String(r.origem_fatura_id || '').trim();
    const faturaNumero = String(r.fatura_numero || '').trim();
    if (id && (faturaId === id || origem === id || r.id === id)) return true;
    if (numero && faturaNumero === numero) return true;
    return false;
  }) || null;
}

export function coberturaDoCliente(
  cobertura: CoberturaOsPeriodo | null | undefined,
  cliente: string,
  comercialId?: string | null,
): CoberturaCliente | null {
  const nome = normalizeClienteNome(cliente);
  const comercial = String(comercialId || '').trim();
  const lista = cobertura?.porCliente || [];
  const exato = lista.find((c) =>
    normalizeClienteNome(c.cliente) === nome && (!comercial || String(c.comercialId || '') === comercial),
  );
  if (exato) return exato;
  return lista.find((c) => normalizeClienteNome(c.cliente) === nome) || null;
}

export function montarClientesDashboard(args: {
  linhas: LinhaQuadroCliente[];
  rows: ComissaoDashboardRow[];
  cobertura?: CoberturaOsPeriodo | null;
}): ClienteDashboard[] {
  return args.linhas.map((linha) => {
    const cob = coberturaDoCliente(args.cobertura, linha.cliente, linha.comercialId);
    let faturasPagas = 0;
    let faturasAbertas = 0;
    let comissoesPagas = 0;
    let comissoesAbertas = 0;
    for (const d of linha.detalhes || []) {
      const faturaPaga = d.pago || faturaClienteEstaPaga({ status: d.pago ? 'PAGA' : 'EMITIDA' });
      if (faturaPaga) faturasPagas += 1;
      else faturasAbertas += 1;
      const com = acharComissaoDaFatura(args.rows, d);
      if (String(com?.status || '') === 'PAGO') comissoesPagas += 1;
      else comissoesAbertas += 1;
    }
    return {
      key: chaveLinhaQuadro(linha),
      empresa: linha.empresa,
      cliente: linha.cliente,
      comercialId: linha.comercialId,
      comercialNome: linha.comercialNome,
      faturas: linha.faturas,
      faturamento: linha.faturamento,
      imposto: linha.imposto,
      baseLiquida: linha.baseLiquida,
      comissao: linha.comissao,
      abaixoDoPiso: linha.abaixoDoPiso,
      missoes: cob?.missoes || 0,
      osFaturadas: cob?.faturadas || 0,
      osSemFatura: cob?.semFatura || 0,
      osSemFaturaIds: cob?.osSemFaturaIds || [],
      coberturaEstado: cob?.estado || (args.cobertura?.consultaIncompleta ? 'CONSULTA INCOMPLETA' : 'NÃO EXISTE'),
      receitaOs: cob?.receita || 0,
      custoOs: cob?.custo || 0,
      lucroOs: cob?.lucro || 0,
      margemPct: cob?.margemPct ?? null,
      faturasPagas,
      faturasAbertas,
      comissoesPagas,
      comissoesAbertas,
      statusFatura: statusPar(faturasPagas, faturasAbertas),
      statusComissao: statusPar(comissoesPagas, comissoesAbertas),
      detalhes: linha.detalhes || [],
    };
  });
}

export function montarQuadrosFuncionarios(args: {
  comerciais: Array<{
    id: string;
    nome?: string | null;
    pix_chave?: string | null;
    valor_fixo?: number | null;
    usuario_id?: number | null;
    ativo?: boolean;
  }>;
  linhas: LinhaQuadroCliente[];
  rows: ComissaoDashboardRow[];
  cobertura?: CoberturaOsPeriodo | null;
}): QuadroFuncionario[] {
  const clientes = montarClientesDashboard(args);
  const porComercial = new Map<string, ClienteDashboard[]>();
  for (const c of clientes) {
    const id = String(c.comercialId || '').trim();
    if (!id) continue;
    const prev = porComercial.get(id) || [];
    prev.push(c);
    porComercial.set(id, prev);
  }

  const brutoPorComercial = new Map<string, number>();
  for (const r of args.rows) {
    const id = String(r.comercial_id || '').trim();
    if (!id) continue;
    brutoPorComercial.set(id, roundMoney((brutoPorComercial.get(id) || 0) + (Number(r.valor_faturamento) || 0)));
  }

  const ids = new Set<string>([
    ...args.comerciais.filter((c) => c.ativo !== false).map((c) => c.id),
    ...porComercial.keys(),
  ]);

  const quadros: QuadroFuncionario[] = [];
  for (const id of ids) {
    const cadastro = args.comerciais.find((c) => c.id === id);
    const lista = porComercial.get(id) || [];
    const cobClientes = (args.cobertura?.porCliente || []).filter((c) => String(c.comercialId || '') === id);
    const faturamentoBruto = roundMoney(lista.reduce((s, c) => s + c.faturamento, 0)
      || cobClientes.reduce((s, c) => s + c.receita, 0)
      || brutoPorComercial.get(id) || 0);
    const imposto = roundMoney(lista.reduce((s, c) => s + c.imposto, 0));
    const liquido = roundMoney(lista.reduce((s, c) => s + c.baseLiquida, 0));
    const apuracao = calcularApuracaoComissao({
      valorBruto: faturamentoBruto,
      valorFixo: Number(cadastro?.valor_fixo || 0),
    });
    const rowsComercial = args.rows.filter((r) => String(r.comercial_id || '') === id);
    let comissaoPaga = 0;
    let comissaoLiberada = 0;
    let comissaoAguardando = 0;
    for (const r of rowsComercial) {
      const v = valorComissaoLinhaAposPiso({
        valorComissao: Number(r.valor_comissao),
        brutoComercialNoPeriodo: faturamentoBruto,
        percentual: Number(r.percentual_comissao_aplicado),
      }).valor;
      if (r.status === 'PAGO') comissaoPaga = roundMoney(comissaoPaga + v);
      else if (r.status === 'LIBERADO_PARA_PAGAMENTO') comissaoLiberada = roundMoney(comissaoLiberada + v);
      else if (r.status !== 'CANCELADO') comissaoAguardando = roundMoney(comissaoAguardando + v);
    }
    const faturasPagas = lista.reduce((s, c) => s + c.faturasPagas, 0);
    const faturasAbertas = lista.reduce((s, c) => s + c.faturasAbertas, 0);
    quadros.push({
      id,
      nome: cadastro?.nome || lista[0]?.comercialNome || '—',
      pix: cadastro?.pix_chave || null,
      valorFixo: apuracao.valorFixo,
      usuarioVinculado: !!cadastro?.usuario_id,
      missoes: cobClientes.reduce((s, c) => s + c.missoes, 0),
      osFaturadas: cobClientes.reduce((s, c) => s + c.faturadas, 0),
      osSemFatura: cobClientes.reduce((s, c) => s + c.semFatura, 0),
      faturamentoBruto,
      imposto: imposto || apuracao.notaFiscal,
      liquido: liquido || apuracao.resultadoLiquido,
      comissao3: apuracao.comissaoPercentual,
      bonus: apuracao.bonusAcumulado,
      totalAPagar: apuracao.totalAPagar,
      abaixoDoPiso: apuracao.abaixoDoPiso,
      faturasPagas,
      faturasAbertas,
      comissaoPaga,
      comissaoLiberada,
      comissaoAguardando,
      statusPagamento: statusPar(
        comissaoPaga > 0 ? 1 : 0,
        (comissaoLiberada + comissaoAguardando) > 0 ? 1 : 0,
      ),
      clientes: lista,
    });
  }

  return quadros
    .filter((q) => q.faturamentoBruto > 0 || q.missoes > 0 || q.valorFixo > 0)
    .sort((a, b) => b.faturamentoBruto - a.faturamentoBruto);
}

export function montarKpisDashboard(args: {
  linhas: LinhaQuadroCliente[];
  funcionarios: QuadroFuncionario[];
  cobertura?: CoberturaOsPeriodo | null;
}): KpisDashboardComissao {
  const fat = roundMoney(args.linhas.reduce((s, l) => s + l.faturamento, 0));
  const imposto = roundMoney(args.linhas.reduce((s, l) => s + l.imposto, 0));
  const lucroBase = roundMoney(args.linhas.reduce((s, l) => s + l.baseLiquida, 0));
  const comissao3 = roundMoney(args.funcionarios.reduce((s, f) => s + f.comissao3, 0));
  const bonus = roundMoney(args.funcionarios.reduce((s, f) => s + f.bonus, 0));
  const rec = args.cobertura?.totais.receita || 0;
  const lucroOs = args.cobertura?.totais.lucro || 0;
  return {
    faturamento: fat,
    imposto,
    lucroBase,
    comissao3,
    missoes: args.cobertura?.totais.missoes || 0,
    osSemFatura: args.cobertura?.totais.semFatura || 0,
    margemOperacionalPct: margemKpi(rec, lucroOs, args.cobertura),
    bonus,
    coberturaEstado: args.cobertura?.estado || 'CONSULTA INCOMPLETA',
    consultaIncompleta: !!args.cobertura?.consultaIncompleta,
  };
}

function margemKpi(receita: number, lucro: number, cobertura?: CoberturaOsPeriodo | null): number | null {
  if (!cobertura || cobertura.consultaIncompleta) return null;
  if (receita <= 0) return null;
  return roundMoney((lucro / receita) * 100);
}

export function impostoDeFaturamento(valor: number, percentual = 16): number {
  return calcularComissao(valor, percentual, 3).valorImposto;
}
