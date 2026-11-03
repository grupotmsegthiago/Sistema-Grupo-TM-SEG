/**
 * Leitura das fontes já existentes. Não insere, não atualiza, não chama recálculo de OS.
 * Receita e custo passam por computeCanonicalRevenueCost.
 * Conta de fornecedor não é somada de novo ao custo da OS: vira documento.
 */

import { supabase } from '../supabase';
import { fetchAllPages } from '../supabasePaging';
import { computeCanonicalRevenueCost, type CanonicalRefs } from '../missionFinancialsCanonical';
import { extractUF, UF_TO_REGION } from '../financialUtils';
import type { Client, ClientPriceTable, ProviderCostTable } from '../../types';
import { classificarEmpresa } from './empresas';
import { HISTORICO_INICIO, mesDeIso } from './periodo';
import type { CargaFiscal, DespesaLinha, DocumentoLinha, FatiaOs, RecebimentoLinha, TributoLancado } from './base';
import { atribuirRecebimentoPorDocumento, osComprovadamenteFaturada, type NotaParaRecebimento } from './conciliacao';
import { interpretarEmiteNf, type EmiteNf, type SituacaoNf } from './simulacao';

const COLS_MISSAO = [
  'id', 'status', 'client', 'provider', 'origin', 'destination',
  'start_time', 'end_time', 'created_at', 'last_update',
  'start_km', 'end_km', 'total_distance',
  'revenue_value', 'cost_value', 'billing_approved', 'billing_verified_by', 'is_same_os',
  'invoice_number', 'parent_mission_id',
  'toll_value', 'toll_value_provider', 'dhl_deslocamento_km',
  'displacement_value', 'displacement_value_provider',
].join(', ');

type Linha = Record<string, unknown>;

function texto(v: unknown): string {
  return String(v ?? '').trim();
}

function numero(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function classificarSituacaoNf(status: unknown, temNumero: boolean): SituacaoNf {
  const s = texto(status).toUpperCase();
  if (['AUTHORIZED', 'AUTORIZADA', 'EMITIDA', 'CONCLUIDA', 'OK'].includes(s)) return 'valida';
  if (['CANCELED', 'CANCELADA', 'CANCELLED', 'DENIED', 'REJECTED', 'REJEITADA'].includes(s)) return 'ausente';
  if (!s && !temNumero) return 'ausente';
  return 'pendente';
}

function regiaoDe(origem: unknown, destino: unknown): string {
  const uf = extractUF(texto(origem)) || extractUF(texto(destino));
  return UF_TO_REGION[uf] || 'SEM_REGIAO';
}

function semAcento(valor: string): string {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

function ehImposto(tag: unknown, nome: unknown): boolean {
  if (texto(tag).toUpperCase() === 'IMPOSTO') return true;
  return /imposto|tributo/i.test(texto(nome));
}

/** Categoria de fornecedor ou título de fornecedor não entra de novo no custo da OS. */
export function papelDoLancamento(args: {
  entityType: string;
  categoryName: string;
  categoryTag: string;
  categoryGroup: string;
}): 'tributo' | 'custo_fornecedor' | 'despesa' {
  if (ehImposto(args.categoryTag, args.categoryName)) return 'tributo';
  if (semAcento(args.entityType) === 'PROVIDER') return 'custo_fornecedor';
  const nome = semAcento(args.categoryName);
  const tag = semAcento(args.categoryTag);
  const grupo = semAcento(args.categoryGroup);
  if (nome.startsWith('FORNECEDOR') || tag === 'FORNECEDOR' || grupo === 'FORNECEDOR') return 'custo_fornecedor';
  return 'despesa';
}

export function statusRecebido(status: string): boolean {
  return ['PAID', 'PAGO', 'PAGA', 'RECEBIDO', 'RECEIVED', 'SETTLED', 'CONFIRMED'].includes(status.toUpperCase());
}

function aprovada(valor: unknown): boolean {
  return valor === true || valor === 'true' || valor === 't' || valor === 1 || valor === '1';
}

async function paginar(tabela: string, aplicar: (q: any) => any): Promise<Linha[]> {
  const { rows, complete } = await fetchAllPages<Linha>(async (from, size) => {
    const res = await aplicar(supabase.from(tabela))
      .order('id', { ascending: true })
      .range(from, from + size - 1);
    return { data: res.data as Linha[] | null, error: res.error, count: res.count };
  }, 1000, 50_000, {
    getRowKey: (row) => {
      const id = texto(row.id);
      if (!id) throw new Error(`Registro de ${tabela} sem id. A leitura parou.`);
      return id;
    },
  });
  if (!complete) throw new Error(`Leitura de ${tabela} incompleta. O painel não usa a página parcial.`);
  return rows;
}

export async function carregarFontesGestorFiscal(inicio: string, fim: string): Promise<CargaFiscal> {
  const mensagens = [
    'Custo de fornecedor vem da OS canônica. Conta a pagar do fornecedor não entra de novo na soma.',
    'Despesa e tributo sem empresa emissora não são jogados para um CNPJ.',
    `Período lido: ${inicio} a ${fim}. Histórico anterior a ${HISTORICO_INICIO} não entra.`,
  ];
  const inicioIso = `${inicio}T00:00:00`;
  const fimIso = `${fim}T23:59:59`;

  let estado: CargaFiscal['estado'] = 'ENCONTRADO';
  const falhou = (fonte: string, erro: unknown) => {
    estado = estado === 'ERRO' ? 'ERRO' : 'CONSULTA_INCOMPLETA';
    const msg = erro instanceof Error ? erro.message : String(erro || 'falha');
    mensagens.push(`${fonte}: ${msg}`);
  };

  let missoes: Linha[] = [];
  let clientes: Linha[] = [];
  let tabelasCliente: Linha[] = [];
  let tabelasFornecedor: Linha[] = [];
  let transacoes: Linha[] = [];
  let categorias: Linha[] = [];
  let faturas: Linha[] = [];
  let vinculos: Linha[] = [];
  let vinculosOk = true;

  try {
    const porInicio = await paginar('missions', (q) => q.select(COLS_MISSAO, { count: 'exact' }).gte('start_time', inicioIso).lte('start_time', fimIso));
    let semInicio: Linha[] = [];
    try {
      semInicio = await paginar('missions', (q) => q.select(COLS_MISSAO, { count: 'exact' }).is('start_time', null).gte('created_at', inicioIso).lte('created_at', fimIso));
    } catch (erro) {
      falhou('OS sem hora de início', erro);
    }
    const ids = new Set<string>();
    missoes = [...porInicio, ...semInicio].filter((m) => {
      const id = texto(m.id);
      if (!id || ids.has(id)) return false;
      ids.add(id);
      return true;
    });
  } catch (erro) {
    estado = 'ERRO';
    falhou('OS', erro);
    missoes = [];
  }

  try {
    clientes = await paginar('clients', (q) => q.select('id, name, issuer_company', { count: 'exact' }));
  } catch (erro) {
    estado = 'ERRO';
    falhou('Clientes', erro);
    clientes = [];
  }

  try {
    tabelasCliente = await paginar('client_price_tables', (q) => q.select('*', { count: 'exact' }));
  } catch (erro) {
    falhou('Tabelas de preço do cliente', erro);
  }
  try {
    tabelasFornecedor = await paginar('provider_cost_tables', (q) => q.select('*', { count: 'exact' }));
  } catch (erro) {
    falhou('Tabelas de custo do fornecedor', erro);
  }
  try {
    transacoes = await paginar('financial_transactions', (q) => q.select('id, description, amount, type, status, due_date, payment_date, category_id, entity_type, entity_name, doc_nf_status', { count: 'exact' }).gte('due_date', inicio).lte('due_date', fim));
  } catch (erro) {
    falhou('Contas a pagar e receber', erro);
  }
  try {
    categorias = await paginar('financial_categories', (q) => q.select('id, name, tag, group', { count: 'exact' }));
  } catch (erro) {
    falhou('Categorias financeiras', erro);
  }
  try {
    faturas = await paginar('financial_invoices', (q) => q.select('id, client, number, amount, issuer_company, nf_status, nf_number, date, status', { count: 'exact' }).gte('date', inicio).lte('date', fim));
  } catch (erro) {
    falhou('Faturas e NF de cliente', erro);
  }
  try {
    const lidos = await fetchAllPages<Linha>(async (from, size) => {
      const res = await supabase.from('financial_invoice_missions')
        .select('invoice_id, mission_id', { count: 'exact' })
        .order('invoice_id', { ascending: true })
        .order('mission_id', { ascending: true })
        .range(from, from + size - 1);
      return { data: res.data as Linha[] | null, error: res.error, count: res.count };
    }, 1000, 50_000, {
      getRowKey: (row) => {
        const chave = `${texto(row.invoice_id)}|${texto(row.mission_id)}`;
        if (chave === '|') throw new Error('Vínculo fatura–OS sem identificador. A leitura parou.');
        return chave;
      },
    });
    if (!lidos.complete) throw new Error('Leitura do vínculo fatura–OS incompleta.');
    vinculos = lidos.rows;
  } catch (erro) {
    vinculosOk = false;
    vinculos = [];
    falhou('Vínculo fatura e OS', erro);
    mensagens.push('Sem o vínculo fatura–OS, a OS não é marcada como faturada nem como comprovadamente sem nota.');
  }

  const emiteLido: Record<string, EmiteNf> = {};
  try {
    const fornecedores = await paginar('providers', (q) => q.select('id, name, emite_nota_fiscal', { count: 'exact' }));
    for (const row of fornecedores) {
      const nome = texto(row.name);
      if (!nome) continue;
      emiteLido[nome] = interpretarEmiteNf(row.emite_nota_fiscal);
    }
  } catch {
    mensagens.push('A emissão de NF do fornecedor não foi lida. A coluna ainda não está no banco ou a consulta falhou. Fica não informado e nada é gravado.');
  }

  if (estado === 'ERRO') {
    return { estado, modo: 'leitura', mensagens, fatias: [], despesas: [], documentos: [], tributos: [], recebimentos: [], emiteLido };
  }

  const idsVinculados = new Set<string>();
  const osPorFatura = new Map<string, string[]>();
  if (vinculosOk) {
    for (const vinculo of vinculos) {
      const faturaId = texto(vinculo.invoice_id);
      const osId = texto(vinculo.mission_id);
      if (!faturaId || !osId) continue;
      idsVinculados.add(osId);
      const lista = osPorFatura.get(faturaId) || [];
      if (!lista.includes(osId)) lista.push(osId);
      osPorFatura.set(faturaId, lista);
    }
  }

  const clientePorNome = new Map<string, Linha>();
  for (const c of clientes) clientePorNome.set(texto(c.name), c);

  const refs: CanonicalRefs = {
    clientTables: tabelasCliente as unknown as ClientPriceTable[],
    providerTables: tabelasFornecedor as unknown as ProviderCostTable[],
    clientsData: clientes as unknown as Client[],
  };

  const fatias: FatiaOs[] = [];
  for (const m of missoes) {
    const mes = mesDeIso(texto(m.start_time) || texto(m.created_at));
    if (!mes || mes < '2026-01') continue;
    const nomeCliente = texto(m.client);
    const cadastro = clientePorNome.get(nomeCliente);
    const empresaKey = classificarEmpresa(texto(cadastro?.issuer_company));
    const osId = texto(m.id);
    const faturadaDireta = osComprovadamenteFaturada({
      invoiceNumber: texto(m.invoice_number),
      missionId: osId,
      idsVinculados: vinculosOk ? idsVinculados : null,
      notaDoMesmoClienteNoMes: false,
    });
    const comprovacao = faturadaDireta ? 'comprovada' : (vinculosOk ? 'pendente' : 'nao_determinada');
    const comum = {
      id: osId,
      mes,
      empresaKey,
      cliente: nomeCliente || 'SEM CLIENTE',
      fornecedor: texto(m.provider) || 'SEM FORNECEDOR',
      regiao: regiaoDe(m.origin, m.destination),
      origem: 'computeCanonicalRevenueCost' as const,
      status: texto(m.status),
      aprovada: aprovada(m.billing_approved),
      faturada: faturadaDireta,
      comprovacao,
    };
    let canon;
    try {
      canon = computeCanonicalRevenueCost(m, refs);
    } catch {
      fatias.push({
        ...comum,
        receita: 0,
        custo: 0,
        valueStatus: 'needs_validation',
      });
      continue;
    }
    fatias.push({
      ...comum,
      receita: canon.rev,
      custo: canon.cost,
      valueStatus: canon.valueStatus,
    });
  }

  const faturadasDiretas = new Set(fatias.filter((f) => f.faturada).map((f) => f.id));
  const fatiaPorId = new Map(fatias.map((f) => [f.id, f]));
  for (const m of missoes) {
    const pai = texto(m.parent_mission_id);
    const filha = fatiaPorId.get(texto(m.id));
    if (!filha || filha.faturada || !pai || !faturadasDiretas.has(pai)) continue;
    filha.faturada = true;
    filha.comprovacao = 'comprovada';
  }

  const catPorId = new Map<string, Linha>();
  for (const c of categorias) catPorId.set(texto(c.id), c);

  const despesas: DespesaLinha[] = [];
  const documentos: DocumentoLinha[] = [];
  const tributos: TributoLancado[] = [];
  const recebimentos: RecebimentoLinha[] = [];
  const notasParaRecebimento: NotaParaRecebimento[] = [];
  for (const f of faturas) {
    if (texto(f.status).toUpperCase() === 'CANCELADA') continue;
    const empresaKey = classificarEmpresa(texto(f.issuer_company));
    const nf = texto(f.nf_number);
    const numero = texto(f.number);
    if (nf) notasParaRecebimento.push({ id: texto(f.id), numero: nf, empresaKey });
    if (numero && numero !== nf) notasParaRecebimento.push({ id: texto(f.id), numero, empresaKey });
  }

  for (const t of transacoes) {
    const status = texto(t.status).toUpperCase();
    if (status === 'CANCELLED') continue;
    const tipo = texto(t.type).toUpperCase();
    const mes = mesDeIso(texto(t.due_date));
    if (!mes) continue;
    if (tipo === 'INCOME') {
      if (!statusRecebido(status)) continue;
      const atribuido = atribuirRecebimentoPorDocumento(texto(t.description), notasParaRecebimento);
      recebimentos.push({
        id: texto(t.id),
        mes,
        empresaKey: atribuido.empresaKey,
        valor: numero(t.amount),
        descricao: texto(t.description),
        numeroNota: atribuido.numero,
        vinculado: atribuido.vinculado,
        origem: 'financial_transactions',
      });
      continue;
    }
    if (tipo !== 'EXPENSE') continue;
    const cat = catPorId.get(texto(t.category_id));
    const valor = numero(t.amount);
    const entidade = texto(t.entity_name) || 'SEM ENTIDADE';
    const papel = papelDoLancamento({
      entityType: texto(t.entity_type),
      categoryName: texto(cat?.name),
      categoryTag: texto(cat?.tag),
      categoryGroup: texto(cat?.group),
    });
    if (papel === 'tributo') {
      const cliente = texto(t.entity_type) === 'Client' ? clientePorNome.get(texto(t.entity_name)) : undefined;
      tributos.push({
        id: texto(t.id),
        mes,
        empresaKey: classificarEmpresa(texto(cliente?.issuer_company)),
        valor,
        status: status === 'PAID' ? 'pago' : 'pendente',
        descricao: texto(t.description) || 'Tributo lançado',
      });
      continue;
    }
    if (papel === 'custo_fornecedor') {
      documentos.push({
        id: texto(t.id),
        mes,
        empresaKey: 'SEM_EMISSORA',
        tipo: 'nf_fornecedor',
        cliente: '',
        fornecedor: entidade,
        numero: '',
        valor,
        situacao: classificarSituacaoNf(t.doc_nf_status, false),
        impressaoDigital: `pagar|${entidade}|${valor}|${texto(t.due_date)}|${texto(t.description)}`.toLowerCase(),
        origem: 'financial_transactions.doc_nf_status',
      });
      continue;
    }
    const cliente = texto(t.entity_type) === 'Client' ? clientePorNome.get(texto(t.entity_name)) : undefined;
    despesas.push({
      id: texto(t.id),
      mes,
      empresaKey: classificarEmpresa(texto(cliente?.issuer_company)),
      valor,
      entidade,
      descricao: texto(t.description),
      impressaoDigital: `${texto(t.description)}|${valor}|${texto(t.due_date)}|${entidade}`.toLowerCase(),
      origem: 'financial_transactions',
    });
  }

  for (const f of faturas) {
    const statusFatura = texto(f.status).toUpperCase();
    if (statusFatura === 'CANCELADA') continue;
    const mes = mesDeIso(texto(f.date));
    if (!mes) continue;
    const numeroNota = texto(f.nf_number) || texto(f.number);
    documentos.push({
      id: texto(f.id),
      mes,
      empresaKey: classificarEmpresa(texto(f.issuer_company)),
      tipo: 'fatura_cliente',
      cliente: texto(f.client),
      fornecedor: '',
      numero: numeroNota,
      valor: numero(f.amount),
      situacao: classificarSituacaoNf(f.nf_status, !!numeroNota),
      impressaoDigital: `${classificarEmpresa(texto(f.issuer_company))}|${numeroNota}|${numero(f.amount)}`,
      origem: 'financial_invoices',
      osIds: vinculosOk ? (osPorFatura.get(texto(f.id)) || []) : undefined,
    });
  }

  if (!fatias.length && !despesas.length && !documentos.length && estado === 'ENCONTRADO') {
    estado = 'NAO_EXISTE';
    mensagens.push('Nenhum lançamento encontrado no período para as fontes lidas.');
  }

  return { estado, modo: 'leitura', mensagens, fatias, despesas, documentos, tributos, recebimentos, emiteLido };
}
