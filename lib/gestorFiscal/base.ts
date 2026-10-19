/**
 * Monta o recorte que a simulação lê.
 * Receita e custo de OS chegam prontos (fonte canônica).
 * Conta a pagar de fornecedor não é somada de novo ao custo da OS.
 * Despesa sem empresa emissora fica de fora da soma da empresa selecionada.
 */

import { empresaPorChave, formatarCnpj } from './empresas';
import { mesDentro } from './periodo';
import {
  creditoDaLinha,
  simularPeriodo,
  tetoReajusteFornecedor,
  reajusteParaMargemIdeal,
  classificarMargem,
  FORMULAS_FISCAIS,
  type EmiteNf,
  type MesOperacional,
  type SituacaoNf,
} from './simulacao';
import type { PremissasFiscais } from './premissas';

export type EstadoConjunto = 'ENCONTRADO' | 'NAO_EXISTE' | 'NAO_CARREGADO' | 'CONSULTA_INCOMPLETA' | 'ERRO' | 'NAO_VALIDADO';

export interface FatiaOs {
  id: string;
  mes: string;
  empresaKey: string;
  cliente: string;
  fornecedor: string;
  regiao: string;
  receita: number;
  custo: number;
  valueStatus: 'official' | 'estimated' | 'needs_validation';
  origem: 'computeCanonicalRevenueCost';
}

export interface DespesaLinha {
  id: string;
  mes: string;
  empresaKey: string;
  valor: number;
  entidade: string;
  descricao: string;
  impressaoDigital: string;
  origem: 'financial_transactions';
}

export interface DocumentoLinha {
  id: string;
  mes: string;
  empresaKey: string;
  tipo: 'fatura_cliente' | 'nf_fornecedor';
  cliente: string;
  fornecedor: string;
  numero: string;
  valor: number;
  situacao: SituacaoNf;
  impressaoDigital: string;
  origem: string;
}

export interface TributoLancado {
  id: string;
  mes: string;
  empresaKey: string;
  valor: number;
  status: 'pago' | 'pendente';
  descricao: string;
}

export interface CargaFiscal {
  estado: EstadoConjunto;
  mensagens: string[];
  fatias: FatiaOs[];
  despesas: DespesaLinha[];
  documentos: DocumentoLinha[];
  tributos: TributoLancado[];
  modo: 'leitura' | 'laboratorio';
}

export interface FiltroFiscal {
  empresaKey: string;
  inicio: string;
  fim: string;
  mes: string;
  cliente: string;
  fornecedor: string;
  regiao: string;
  incluirEstimados: boolean;
  escopo: 'consolidado' | 'cliente' | 'fornecedor';
}

export interface FornecedorVista {
  nome: string;
  receita: number;
  custo: number;
  emite: EmiteNf;
  nf: SituacaoNf;
  documentos: number;
  credito: number;
  motivoCredito: string;
}

export interface AnaliseFiscal {
  rotuloModo: string;
  empresaNome: string;
  cnpj: string;
  incompleto: boolean;
  avisos: string[];
  duplicatas: string[];
  meses: MesOperacional[];
  mesesComCredito: MesOperacional[];
  semCredito: ReturnType<typeof simularPeriodo>;
  comCredito: ReturnType<typeof simularPeriodo>;
  faixa: ReturnType<typeof classificarMargem>;
  teto: ReturnType<typeof tetoReajusteFornecedor>;
  reajusteCliente: ReturnType<typeof reajusteParaMargemIdeal>;
  fornecedores: FornecedorVista[];
  clientes: { nome: string; receita: number; custo: number; reajuste: ReturnType<typeof reajusteParaMargemIdeal> }[];
  documentos: DocumentoLinha[];
  tributoPago: number;
  tributoPendente: number;
  tributoCompensado: number;
  compensadoOrigem: string;
  osNaBase: number;
  osFora: number;
  formulas: typeof FORMULAS_FISCAIS;
}

function separarDuplicados<T extends { id: string; impressaoDigital: string }>(linhas: T[]): { unicos: T[]; duplicatas: string[] } {
  const vistos = new Map<string, string>();
  const unicos: T[] = [];
  const duplicatas: string[] = [];
  const ordenadas = [...linhas].sort((a, b) => a.id.localeCompare(b.id));
  for (const linha of ordenadas) {
    const chave = linha.impressaoDigital || linha.id;
    const primeiro = vistos.get(chave);
    if (primeiro) {
      duplicatas.push(`${linha.id} repete ${primeiro}`);
      continue;
    }
    vistos.set(chave, linha.id);
    unicos.push(linha);
  }
  return { unicos, duplicatas };
}

function situacaoFornecedor(docs: SituacaoNf[]): SituacaoNf {
  if (docs.length === 0) return 'ausente';
  const unicas = new Set(docs);
  if (unicas.size === 1) return docs[0];
  if (unicas.has('valida') && (unicas.has('pendente') || unicas.has('ausente'))) return 'mista';
  if (unicas.has('duplicada')) return 'duplicada';
  return 'mista';
}

export function analisarCarga(
  carga: CargaFiscal,
  filtro: FiltroFiscal,
  premissas: PremissasFiscais,
  emitePorFornecedor: Record<string, EmiteNf>,
  creditoMarcado: Record<string, boolean>,
): AnaliseFiscal {
  const empresa = empresaPorChave(filtro.empresaKey);
  const avisos = [...carga.mensagens];
  if (carga.modo === 'laboratorio') {
    avisos.unshift('LABORATÓRIO — valores fictícios. Não são números da empresa.');
  } else {
    avisos.unshift('SIMULAÇÃO — o tributo calculado não é lançamento oficial nem valor aprovado.');
  }
  if (!empresa) avisos.push('Empresa não reconhecida. Nada foi somado.');

  const noPeriodo = (mes: string) => {
    if (filtro.mes && mes !== filtro.mes) return false;
    return mesDentro(mes, filtro.inicio, filtro.fim);
  };
  const daEmpresa = (key: string) => !!empresa && key === empresa.key;

  const fatias = carga.fatias.filter((f) => {
    if (!daEmpresa(f.empresaKey) || !noPeriodo(f.mes)) return false;
    if (filtro.cliente && f.cliente !== filtro.cliente) return false;
    if (filtro.fornecedor && f.fornecedor !== filtro.fornecedor) return false;
    if (filtro.regiao && f.regiao !== filtro.regiao) return false;
    if (filtro.escopo === 'cliente' && !filtro.cliente) return false;
    if (filtro.escopo === 'fornecedor' && !filtro.fornecedor) return false;
    return true;
  });

  const oficiais = fatias.filter((f) => f.valueStatus === 'official');
  const fora = fatias.filter((f) => f.valueStatus !== 'official');
  const baseOs = filtro.incluirEstimados ? fatias : oficiais;
  if (fora.length > 0) {
    avisos.push(
      filtro.incluirEstimados
        ? `${fora.length} OS estimadas ou sem validação entraram porque a opção foi ligada. Continuam marcadas como incompletas.`
        : `${fora.length} OS estimadas ou sem validação ficaram de fora da base. O período está incompleto.`,
    );
  }
  if (filtro.escopo !== 'consolidado') {
    avisos.push('No recorte individual, despesa fixa não é rateada. A margem usa só a receita e o custo das OS do filtro.');
  }

  const despesasBrutas = filtro.escopo === 'consolidado'
    ? carga.despesas.filter((d) => daEmpresa(d.empresaKey) && noPeriodo(d.mes))
    : [];
  const despesasSep = separarDuplicados(despesasBrutas);
  const fornecedoresDaBase = new Set(fatias.map((f) => f.fornecedor));
  const docsBrutos = carga.documentos.filter((d) => {
    if (!noPeriodo(d.mes)) return false;
    if (filtro.cliente && d.cliente && d.cliente !== filtro.cliente) return false;
    if (filtro.fornecedor && d.fornecedor && d.fornecedor !== filtro.fornecedor) return false;
    if (d.tipo === 'nf_fornecedor' && d.empresaKey === 'SEM_EMISSORA') {
      return fornecedoresDaBase.has(d.fornecedor);
    }
    return daEmpresa(d.empresaKey);
  });
  const docsSep = separarDuplicados(docsBrutos);
  if (despesasSep.duplicatas.length || docsSep.duplicatas.length) {
    avisos.push('Há duplicidade. A repetição ficou de fora da soma e aparece na lista.');
  }
  if (docsSep.unicos.some((d) => d.tipo === 'nf_fornecedor' && d.empresaKey === 'SEM_EMISSORA')) {
    avisos.push('NF de fornecedor no título não traz o CNPJ emissor da TM SEG. Ela aparece na empresa que tem OS desse fornecedor e o valor não entra no custo.');
  }
  const semEmpresa = carga.despesas.filter((d) => d.empresaKey === 'SEM_EMISSORA' && noPeriodo(d.mes));
  if (semEmpresa.length && filtro.escopo === 'consolidado') {
    avisos.push(`${semEmpresa.length} despesa(s) sem empresa emissora ficaram de fora para não misturar CNPJ.`);
  }
  const osSemEmpresa = carga.fatias.filter((f) => f.empresaKey === 'SEM_EMISSORA').length;
  if (osSemEmpresa > 0 && carga.modo === 'leitura') {
    avisos.push(`${osSemEmpresa} OS sem empresa emissora no cliente ficaram de fora de todas as empresas.`);
  }

  const mesesMap = new Map<string, MesOperacional>();
  const garantir = (mes: string): MesOperacional => {
    let row = mesesMap.get(mes);
    if (!row) {
      row = { mes, receita: 0, custoFornecedor: 0, despesasOperacionais: 0, creditoPisCofins: 0 };
      mesesMap.set(mes, row);
    }
    return row;
  };
  for (const f of baseOs) {
    const row = garantir(f.mes);
    row.receita += f.receita;
    row.custoFornecedor += f.custo;
  }
  for (const d of despesasSep.unicos) {
    garantir(d.mes).despesasOperacionais += d.valor;
  }

  const custoPorFornecedor = new Map<string, { receita: number; custo: number; porMes: Map<string, number> }>();
  for (const f of baseOs) {
    const nome = f.fornecedor || 'SEM FORNECEDOR';
    let row = custoPorFornecedor.get(nome);
    if (!row) {
      row = { receita: 0, custo: 0, porMes: new Map() };
      custoPorFornecedor.set(nome, row);
    }
    row.receita += f.receita;
    row.custo += f.custo;
    row.porMes.set(f.mes, (row.porMes.get(f.mes) || 0) + f.custo);
  }

  const docsPorFornecedor = new Map<string, SituacaoNf[]>();
  for (const doc of docsSep.unicos) {
    if (doc.tipo !== 'nf_fornecedor' || !doc.fornecedor) continue;
    const lista = docsPorFornecedor.get(doc.fornecedor) || [];
    lista.push(doc.situacao);
    docsPorFornecedor.set(doc.fornecedor, lista);
  }

  const fornecedores: FornecedorVista[] = [...custoPorFornecedor.entries()]
    .map(([nome, row]) => {
      const emite = emitePorFornecedor[nome] || 'nao_informado';
      const nf = situacaoFornecedor(docsPorFornecedor.get(nome) || []);
      const marcado = !!creditoMarcado[nome];
      const credito = creditoDaLinha(row.custo, emite, nf, marcado, premissas);
      return { nome, receita: row.receita, custo: row.custo, emite, nf, documentos: (docsPorFornecedor.get(nome) || []).length, credito: credito.valor, motivoCredito: credito.motivo };
    })
    .sort((a, b) => b.custo - a.custo);

  const mesesComCredito: MesOperacional[] = [...mesesMap.values()].map((m) => ({ ...m, creditoPisCofins: 0 }));
  for (const forn of fornecedores) {
    if (!(forn.credito > 0)) continue;
    const detalhe = custoPorFornecedor.get(forn.nome);
    if (!detalhe || detalhe.custo <= 0) continue;
    for (const mes of mesesComCredito) {
      const custoMes = detalhe.porMes.get(mes.mes) || 0;
      mes.creditoPisCofins += forn.credito * (custoMes / detalhe.custo);
    }
  }

  const meses = [...mesesMap.values()].map((m) => ({ ...m, creditoPisCofins: 0 }));
  const semCredito = simularPeriodo(meses, premissas);
  const comCredito = simularPeriodo(mesesComCredito, premissas);
  const teto = tetoReajusteFornecedor(mesesComCredito.length ? mesesComCredito : meses, premissas);
  const reajusteCliente = reajusteParaMargemIdeal(
    semCredito.receita,
    semCredito.custoFornecedor,
    semCredito.despesasOperacionais,
    premissas,
  );

  const porCliente = new Map<string, { receita: number; custo: number }>();
  for (const f of baseOs) {
    const nome = f.cliente || 'SEM CLIENTE';
    const row = porCliente.get(nome) || { receita: 0, custo: 0 };
    row.receita += f.receita;
    row.custo += f.custo;
    porCliente.set(nome, row);
  }
  const clientes = [...porCliente.entries()]
    .map(([nome, row]) => ({
      nome,
      receita: row.receita,
      custo: row.custo,
      reajuste: reajusteParaMargemIdeal(row.receita, row.custo, filtro.escopo === 'consolidado' ? 0 : 0, premissas),
    }))
    .sort((a, b) => b.receita - a.receita);

  if (filtro.escopo === 'consolidado') {
    avisos.push('O reajuste por cliente, na lista, não rateia despesa fixa. O reajuste consolidado, no card, inclui as despesas da empresa.');
  }

  const tributos = carga.tributos.filter((t) => daEmpresa(t.empresaKey) && noPeriodo(t.mes));
  const tributosSemEmpresa = carga.tributos.filter((t) => t.empresaKey === 'SEM_EMISSORA' && noPeriodo(t.mes));
  if (tributosSemEmpresa.length) {
    avisos.push(`${tributosSemEmpresa.length} tributo(s) lançado(s) sem empresa emissora não entraram neste CNPJ.`);
  }

  if (!baseOs.length && (carga.estado === 'ENCONTRADO' || carga.estado === 'NAO_EXISTE')) {
    avisos.push('Nenhuma OS oficial neste recorte. Ausência de base não vira lucro zero da empresa.');
  }
  if (carga.estado === 'ERRO' || carga.estado === 'CONSULTA_INCOMPLETA' || carga.estado === 'NAO_CARREGADO') {
    avisos.push(`Leitura das fontes: ${carga.estado}. Não tratar o painel como número oficial.`);
  }

  return {
    rotuloModo: carga.modo === 'laboratorio' ? 'LABORATÓRIO' : 'SIMULAÇÃO',
    empresaNome: empresa?.nome || 'Sem empresa',
    cnpj: empresa ? formatarCnpj(empresa.cnpj) : '—',
    incompleto: fora.length > 0 || carga.estado !== 'ENCONTRADO',
    avisos,
    duplicatas: [...despesasSep.duplicatas, ...docsSep.duplicatas],
    meses,
    mesesComCredito,
    semCredito,
    comCredito,
    faixa: classificarMargem(semCredito.margem, premissas),
    teto,
    reajusteCliente,
    fornecedores,
    clientes,
    documentos: docsSep.unicos,
    tributoPago: tributos.filter((t) => t.status === 'pago').reduce((s, t) => s + t.valor, 0),
    tributoPendente: tributos.filter((t) => t.status === 'pendente').reduce((s, t) => s + t.valor, 0),
    tributoCompensado: premissas.compensacaoInformada,
    compensadoOrigem: 'Premissa digitada nesta tela. O banco não tem coluna de tributo compensado.',
    osNaBase: baseOs.length,
    osFora: fora.length,
    formulas: FORMULAS_FISCAIS,
  };
}
