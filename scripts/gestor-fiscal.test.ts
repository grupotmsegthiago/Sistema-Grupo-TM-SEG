import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PREMISSAS_INICIAIS } from '../lib/gestorFiscal/premissas';
import { classificarEmpresa } from '../lib/gestorFiscal/empresas';
import { clampPeriodoFiscal } from '../lib/gestorFiscal/periodo';
import {
  FORMULAS_FISCAIS,
  classificarMargem,
  creditoDaLinha,
  interpretarEmiteNf,
  reajusteParaMargemIdeal,
  reajusteParaPreservarLucro,
  simularPeriodo,
  tetoReajusteFornecedor,
} from '../lib/gestorFiscal/simulacao';
import { analisarCarga } from '../lib/gestorFiscal/base';
import { CARGA_LABORATORIO } from '../lib/gestorFiscal/laboratorio';
import { classificarSituacaoNf, papelDoLancamento } from '../lib/gestorFiscal/carregarFontes';
import {
  atribuirRecebimentoPorDocumento,
  consolidarFaturasPorConjuntoDeOs,
  osComprovadamenteFaturada,
} from '../lib/gestorFiscal/conciliacao';
import type { CargaFiscal, DocumentoLinha, FatiaOs } from '../lib/gestorFiscal/base';
import { canAccessScreen } from '../lib/screenAccess';
import type { PremissasFiscais } from '../lib/gestorFiscal/premissas';
import type { FiltroFiscal } from '../lib/gestorFiscal/base';

const filtroLab = (extra: Partial<FiltroFiscal> = {}): FiltroFiscal => ({
  empresaKey: 'LABORATORIO',
  inicio: '2026-01-01',
  fim: '2026-12-31',
  mes: '',
  cliente: '',
  fornecedor: '',
  regiao: '',
  incluirEstimados: false,
  escopo: 'consolidado',
  ...extra,
});

describe('gestor fiscal — premissas e fontes', () => {
  it('não fixa 27% e não calcula o Simples sem alíquota', () => {
    assert.equal(PREMISSAS_INICIAIS.simplesAliquotaEfetiva, null);
    const texto = Object.values(FORMULAS_FISCAIS).join(' ');
    assert.equal(texto.includes('27'), false);
    const fonte = fs.readFileSync('lib/gestorFiscal/premissas.ts', 'utf8');
    assert.equal(fonte.includes('0.27'), false);
    const r = simularPeriodo([{ mes: '2026-01', receita: 1000, custoFornecedor: 100, despesasOperacionais: 0, creditoPisCofins: 0 }], PREMISSAS_INICIAIS);
    assert.equal(r.simplesStatus, 'PREMISSA_AUSENTE');
    assert.equal(r.tributoSimples, null);
    assert.equal(r.lucroLiquidoSimples, null);
  });

  it('não grava banco, não recalcula OS e não cria coluna', () => {
    const carga = fs.readFileSync('lib/gestorFiscal/carregarFontes.ts', 'utf8');
    assert.equal(carga.includes('.insert('), false);
    assert.equal(carga.includes('.update('), false);
    assert.equal(carga.includes('.delete('), false);
    assert.equal(carga.includes('.rpc('), false);
    assert.equal(carga.includes('recalculate-open'), false);
    assert.match(carga, /computeCanonicalRevenueCost/);
    const form = fs.readFileSync('components/ProviderForm.tsx', 'utf8');
    assert.match(form, /Emite nota fiscal\?/);
    assert.match(form, /emite_nota_fiscal/);
    const payload = form.slice(form.indexOf('const payload: any = {'), form.indexOf('};', form.indexOf('const payload: any = {')));
    assert.match(payload, /emite_nota_fiscal/);
  });

  it('CNPJ vazio não cai na TM GESTÃO e o histórico corta 2025', () => {
    assert.equal(classificarEmpresa(''), 'SEM_EMISSORA');
    assert.equal(classificarEmpresa(null), 'SEM_EMISSORA');
    assert.equal(classificarEmpresa('TM GESTÃO'), 'TM GESTAO');
    assert.equal(classificarEmpresa('TM SEGURANÇA'), 'TM SEGURANCA');
    assert.equal(classificarEmpresa('TM SECURITY'), 'TM SECURITY');
    const periodo = clampPeriodoFiscal('2025-06-01', '2026-03-31');
    assert.equal(periodo.cortado, true);
    assert.equal(periodo.inicio, '2026-01-01');
  });
});

describe('gestor fiscal — laboratório e integridade', () => {
  it('não mistura empresa, duplicata, estimativa nem despesa sem CNPJ', () => {
    const analise = analisarCarga(CARGA_LABORATORIO, filtroLab(), PREMISSAS_INICIAIS, {}, {});
    assert.equal(analise.semCredito.receita, 150_000);
    assert.equal(analise.semCredito.custoFornecedor, 50_000);
    assert.equal(analise.semCredito.despesasOperacionais, 10_000);
    assert.equal(analise.osNaBase, 3);
    assert.equal(analise.osFora, 1);
    assert.equal(analise.incompleto, true);
    assert.equal(analise.tributoPago, 1_000);
    assert.equal(analise.tributoPendente, 500);
    assert.equal(analise.receitaForaDaEmpresa, 999_999);
    assert.equal(analise.despesaSemEmpresa, 7_777);
    assert.equal(analise.tributoSemEmpresa, 4_000);
    assert.equal(analise.separacao.receitaOperacional, 150_000);
    assert.equal(analise.separacao.custo, 50_000);
    assert.equal(analise.separacao.lucroEstimado, 90_000);
    assert.equal(analise.reajusteCliente.status, 'JA_ATINGE');
    assert.equal(analise.reajusteCliente.reajusteValor, 0);
    assert.equal(analise.preservarLucro.status, 'PREMISSA_AUSENTE');
    assert.notEqual(analise.separacao.faturamentoFiscal, analise.separacao.receitaOperacional);
    assert.ok(analise.conferencia.some((item) => item.regra.includes('Crédito') && item.estado === 'ATENDE'));
    assert.ok(analise.duplicatas.length >= 2);
    assert.equal(analise.rotuloModo, 'LABORATÓRIO');
    assert.ok(analise.avisos.some((a) => a.includes('fictícios')));
  });

  it('conta de fornecedor ligada só pelo nome não aumenta o custo da OS', () => {
    const carga = {
      ...CARGA_LABORATORIO,
      documentos: [
        ...CARGA_LABORATORIO.documentos,
        {
          id: 'PAGAR-1',
          mes: '2026-01',
          empresaKey: 'SEM_EMISSORA',
          tipo: 'nf_fornecedor' as const,
          cliente: '',
          fornecedor: 'FORNECEDOR FICTICIO COM NF',
          numero: '',
          valor: 30_000,
          situacao: 'valida' as const,
          impressaoDigital: 'pagar-avulso',
          origem: 'financial_transactions.doc_nf_status',
        },
      ],
    };
    const analise = analisarCarga(carga, filtroLab(), PREMISSAS_INICIAIS, {}, {});
    assert.equal(analise.semCredito.custoFornecedor, 50_000);
    assert.ok(analise.documentos.some((d) => d.id === 'PAGAR-1'));
  });

  it('NF válida não vira crédito até ser marcada; sem NF o crédito é recusado', () => {
    const semMarca = analisarCarga(
      CARGA_LABORATORIO,
      filtroLab(),
      PREMISSAS_INICIAIS,
      { 'FORNECEDOR FICTICIO COM NF': 'sim', 'FORNECEDOR FICTICIO SEM NF': 'nao' },
      {},
    );
    assert.equal(semMarca.comCredito.creditoUsado, 0);

    const marcado = analisarCarga(
      CARGA_LABORATORIO,
      filtroLab(),
      PREMISSAS_INICIAIS,
      { 'FORNECEDOR FICTICIO COM NF': 'sim', 'FORNECEDOR FICTICIO SEM NF': 'nao' },
      { 'FORNECEDOR FICTICIO COM NF': true, 'FORNECEDOR FICTICIO SEM NF': true },
    );
    const com = marcado.fornecedores.find((f) => f.nome === 'FORNECEDOR FICTICIO COM NF');
    const sem = marcado.fornecedores.find((f) => f.nome === 'FORNECEDOR FICTICIO SEM NF');
    assert.ok(com && com.credito > 0);
    assert.equal(sem?.credito, 0);
    assert.match(sem?.motivoCredito || '', /não emite/);
    assert.ok(marcado.comCredito.creditoUsado > 0);
    assert.equal(creditoDaLinha(100, 'nao_informado', 'valida', true, PREMISSAS_INICIAIS).valor, 0);
    assert.equal(classificarSituacaoNf('AUTHORIZED', true), 'valida');
    assert.equal(classificarSituacaoNf('', false), 'ausente');
  });
});

describe('gestor fiscal — teto, margem e reajuste', () => {
  const base: PremissasFiscais = { ...PREMISSAS_INICIAIS, simplesAliquotaEfetiva: 0.4 };

  it('separa aumento que melhora, mantém e reduz o lucro', () => {
    const meses = [{ mes: '2026-01', receita: 50_000, custoFornecedor: 10_000, despesasOperacionais: 0, creditoPisCofins: 0 }];
    const teto = tetoReajusteFornecedor(meses, base);
    assert.equal(teto.status, 'CALCULADO');
    assert.ok((teto.teto || 0) > 1000);
    assert.equal(teto.exemploMelhora?.contraReferencia, 'MELHORA');
    assert.equal(teto.exemploMantem?.contraReferencia, 'MANTÉM');
    assert.equal(teto.exemploReduz?.contraReferencia, 'REDUZ');
    const noTeto = simularPeriodo(
      [{ ...meses[0], custoFornecedor: 10_000 + (teto.teto || 0) }],
      base,
    );
    assert.ok(noTeto.lucroLiquidoLucroReal + 0.05 >= (teto.lucroReferencia || 0));
    assert.ok((noTeto.margem || 0) + 1e-9 >= 0.3);
    const acima = simularPeriodo(
      [{ ...meses[0], custoFornecedor: 10_000 + (teto.teto || 0) + 0.01 }],
      base,
    );
    const furaMargem = (acima.margem || 0) + 1e-9 < 0.3;
    const furaLucro = acima.lucroLiquidoLucroReal + 0.005 < (teto.lucroReferencia || 0);
    assert.equal(furaMargem || furaLucro, true);
  });

  it('segura o teto pela margem de 30% quando o lucro ainda tem folga', () => {
    const meses = [{ mes: '2026-01', receita: 100_000, custoFornecedor: 60_000, despesasOperacionais: 0, creditoPisCofins: 0 }];
    const teto = tetoReajusteFornecedor(meses, { ...base, simplesAliquotaEfetiva: 0.5 });
    assert.equal(teto.teto, 10_000);
    assert.match(teto.motivo, /margem|centavo/i);
  });

  it('marca margem abaixo de 30% e não oferece aumento', () => {
    const premissas = { ...base, simplesAliquotaEfetiva: 0.1 };
    const meses = [{ mes: '2026-01', receita: 100_000, custoFornecedor: 80_000, despesasOperacionais: 0, creditoPisCofins: 0 }];
    const periodo = simularPeriodo(meses, premissas);
    assert.equal(classificarMargem(periodo.margem, premissas), 'abaixo_minimo');
    const teto = tetoReajusteFornecedor(meses, premissas);
    assert.equal(teto.status, 'SEM_FOLGA');
    assert.equal(teto.teto, 0);
    assert.equal(teto.exemploReduz?.contraReferencia, 'REDUZ');
  });

  it('cobra a mais do cliente só quando o Lucro Real fica abaixo do Simples', () => {
    const meses = [{ mes: '2026-01', receita: 100_000, custoFornecedor: 40_000, despesasOperacionais: 0, creditoPisCofins: 0 }];
    const semAliquota = reajusteParaPreservarLucro(meses, PREMISSAS_INICIAIS);
    assert.equal(semAliquota.status, 'PREMISSA_AUSENTE');
    assert.equal(semAliquota.aumento, null);

    const ja = reajusteParaPreservarLucro(meses, { ...PREMISSAS_INICIAIS, simplesAliquotaEfetiva: 0.5 });
    assert.equal(ja.status, 'JA_PRESERVA');
    assert.equal(ja.aumento, 0);

    const premissas = { ...PREMISSAS_INICIAIS, simplesAliquotaEfetiva: 0.06 };
    const precisa = reajusteParaPreservarLucro(meses, premissas);
    assert.equal(precisa.status, 'REAJUSTE');
    assert.ok((precisa.aumento || 0) > 0);
    const depois = simularPeriodo([{ ...meses[0], receita: 100_000 + (precisa.aumento || 0) }], premissas);
    assert.ok(depois.lucroLiquidoLucroReal + 0.05 >= (precisa.lucroReferencia || 0));
    const umCentavoAntes = simularPeriodo([{ ...meses[0], receita: 100_000 + (precisa.aumento || 0) - 0.01 }], premissas);
    assert.ok(umCentavoAntes.lucroLiquidoLucroReal + 0.005 < (precisa.lucroReferencia || 0));
    const margem = reajusteParaMargemIdeal(100_000, 40_000, 0, premissas);
    assert.equal(margem.reajusteValor, 0);
    assert.notEqual(precisa.aumento, margem.reajusteValor);
  });

  it('grava a coluna de NF do fornecedor sem tocar a TORRES', () => {
    assert.equal(interpretarEmiteNf('sim'), 'sim');
    assert.equal(interpretarEmiteNf('Não'), 'nao');
    assert.equal(interpretarEmiteNf(''), 'nao_informado');
    const migrations = fs.readdirSync('migrations');
    assert.equal(migrations.some((nome) => nome.includes('emite_nota')), true);
    const sql = fs.readFileSync('migrations/2026_10_19_providers_emite_nota_fiscal.sql', 'utf8');
    assert.match(sql, /ADD COLUMN IF NOT EXISTS emite_nota_fiscal/);
    assert.equal(/drop table/i.test(sql), false);
    const carga = fs.readFileSync('lib/gestorFiscal/carregarFontes.ts', 'utf8');
    assert.equal(carga.includes('service_orders'), false);
    assert.equal(/torres/i.test(carga), false);
    assert.match(carga, /emite_nota_fiscal/);
  });

  it('calcula o reajuste do cliente para chegar a 40%', () => {
    const premissas = PREMISSAS_INICIAIS;
    const baixo = reajusteParaMargemIdeal(100_000, 75_000, 0, premissas);
    assert.equal(baixo.status, 'REAJUSTE');
    assert.equal(baixo.reajusteValor, 25_000);
    assert.ok((baixo.margemAtual || 0) < 0.3);
    const ok = reajusteParaMargemIdeal(100_000, 50_000, 0, premissas);
    assert.equal(ok.status, 'JA_ATINGE');
    assert.equal(ok.reajusteValor, 0);
    const vazio = reajusteParaMargemIdeal(0, 0, 0, premissas);
    assert.equal(vazio.status, 'INDETERMINADO');
  });

  it('ausência de despesa e de documento não vira número oficial', () => {
    const analise = analisarCarga({
      estado: 'NAO_EXISTE',
      modo: 'leitura',
      mensagens: [],
      fatias: [],
      despesas: [],
      documentos: [],
      tributos: [],
      emiteLido: {},
    }, filtroLab({ empresaKey: 'TM GESTAO' }), PREMISSAS_INICIAIS, {}, {});
    assert.equal(analise.semCredito.receita, 0);
    assert.equal(analise.documentos.length, 0);
    assert.equal(analise.rotuloModo, 'SIMULAÇÃO');
    assert.ok(analise.avisos.some((a) => a.includes('Nenhuma OS oficial')));
  });
});

function fatia(extra: Partial<FatiaOs> & Pick<FatiaOs, 'id' | 'receita' | 'custo'>): FatiaOs {
  return {
    mes: '2026-03',
    empresaKey: 'LABORATORIO',
    cliente: 'CLIENTE FICTICIO',
    fornecedor: 'FORNECEDOR FICTICIO COM NF',
    regiao: 'SUDESTE',
    valueStatus: 'official',
    origem: 'computeCanonicalRevenueCost',
    ...extra,
  };
}

function nota(extra: Partial<DocumentoLinha> & Pick<DocumentoLinha, 'id' | 'valor'>): DocumentoLinha {
  return {
    mes: '2026-03',
    empresaKey: 'LABORATORIO',
    tipo: 'fatura_cliente',
    cliente: 'CLIENTE FICTICIO',
    fornecedor: '',
    numero: extra.id,
    situacao: 'valida',
    impressaoDigital: `nota-${extra.id}`,
    origem: 'financial_invoices',
    ...extra,
  };
}

function cargaMinima(extra: Partial<CargaFiscal>): CargaFiscal {
  return {
    estado: 'ENCONTRADO',
    modo: 'laboratorio',
    mensagens: [],
    fatias: [],
    despesas: [],
    documentos: [],
    tributos: [],
    recebimentos: [],
    emiteLido: {},
    ...extra,
  };
}

describe('gestor fiscal — correções de conciliação', () => {
  it('soma partes da mesma OS uma vez e não duplica a receita', () => {
    const grupos = consolidarFaturasPorConjuntoDeOs([
      { id: 'S2', numero: 'NF-S2', valor: 800.1, osIds: ['OS-B', 'OS-A'] },
      { id: 'S1', numero: 'NF-S1', valor: 700, osIds: ['OS-A', 'OS-B'] },
    ]);
    assert.equal(grupos.length, 1);
    assert.equal(grupos[0].partes.length, 2);
    assert.equal(grupos[0].valorFiscal, 1500.1);
    assert.deepEqual(grupos[0].osIds, ['OS-A', 'OS-B']);

    const analise = analisarCarga(cargaMinima({
      fatias: [
        fatia({ id: 'OS-A', receita: 1000, custo: 100, faturada: true, comprovacao: 'comprovada' }),
        fatia({ id: 'OS-B', receita: 500, custo: 50, faturada: true, comprovacao: 'comprovada' }),
      ],
      documentos: [
        nota({ id: 'S1', valor: 700, numero: 'NF-S1', osIds: ['OS-A', 'OS-B'] }),
        nota({ id: 'S2', valor: 800.1, numero: 'NF-S2', osIds: ['OS-B', 'OS-A'] }),
      ],
    }), filtroLab({ mes: '2026-03' }), PREMISSAS_INICIAIS, {}, {});
    assert.equal(analise.osNaBase, 2);
    assert.equal(analise.separacao.receitaOperacional, 1500);
    assert.equal(analise.separacao.faturamentoFiscal, 1500.1);
    assert.equal(analise.separacao.custo, 150);
    assert.equal(analise.gruposFatura.length, 1);
    assert.equal(analise.gruposFatura[0].diferenca, 0.1);
    assert.equal(analise.pendencias.osSemComprovacao, 0);
  });

  it('não junta notas com conjuntos diferentes nem casa OS pelo cliente e mês', () => {
    const grupos = consolidarFaturasPorConjuntoDeOs([
      { id: 'P1', numero: 'NF-P1', valor: 1000, osIds: ['OS-A', 'OS-B'] },
      { id: 'P2', numero: 'NF-P2', valor: 400, osIds: ['OS-A'] },
      { id: 'AV', numero: 'NF-AV', valor: 900, osIds: [] },
    ]);
    assert.equal(grupos.length, 3);

    assert.equal(osComprovadamenteFaturada({
      invoiceNumber: '',
      missionId: 'OS-1',
      idsVinculados: new Set(),
      notaDoMesmoClienteNoMes: true,
    }), false);
    assert.equal(osComprovadamenteFaturada({ invoiceNumber: '1234', missionId: 'OS-1' }), true);
    assert.equal(osComprovadamenteFaturada({ invoiceNumber: '0', missionId: 'OS-1', idsVinculados: new Set(['OS-1']) }), true);

    const analise = analisarCarga(cargaMinima({
      fatias: [fatia({
        id: 'OS-1',
        receita: 1000,
        custo: 400,
        cliente: 'ACME',
        faturada: false,
        comprovacao: 'pendente',
        status: 'Concluída',
      })],
      documentos: [nota({ id: 'NF-ACME', valor: 1000, cliente: 'ACME', osIds: [], numero: 'NF-ACME-MES' })],
    }), filtroLab({ mes: '2026-03' }), PREMISSAS_INICIAIS, {}, {});
    assert.equal(analise.pendencias.osSemComprovacao, 1);
    assert.equal(analise.pendencias.osSemComprovacaoValor, 1000);
    assert.equal(analise.separacao.receitaOperacional, 1000);
    assert.equal(analise.separacao.faturamentoFiscal, 1000);
    assert.equal(analise.gruposFatura[0].osIds.length, 0);
  });

  it('mantém a OS cancelada na receita e separa faturado, aprovado e pendente', () => {
    const analise = analisarCarga(cargaMinima({
      fatias: [
        fatia({ id: 'C1', status: 'Cancelada', aprovada: true, faturada: true, comprovacao: 'comprovada', receita: 100, custo: 0 }),
        fatia({ id: 'C2', status: 'Cancelada', aprovada: true, faturada: false, comprovacao: 'pendente', receita: 200, custo: 0 }),
        fatia({ id: 'C3', status: 'Cancelada', aprovada: false, faturada: false, comprovacao: 'pendente', receita: 50, custo: 0 }),
        fatia({ id: 'C4', status: 'Cancelada', aprovada: false, faturada: false, comprovacao: 'pendente', receita: 0, custo: 0 }),
        fatia({ id: 'OK', status: 'Concluída', faturada: false, comprovacao: 'pendente', receita: 1000, custo: 100 }),
      ],
    }), filtroLab({ mes: '2026-03' }), PREMISSAS_INICIAIS, {}, {});
    assert.equal(analise.separacao.receitaOperacional, 1350);
    assert.equal(analise.canceladas.quantidade, 4);
    assert.equal(analise.canceladas.receita, 350);
    assert.equal(analise.canceladas.faturada.quantidade, 1);
    assert.equal(analise.canceladas.faturada.valor, 100);
    assert.equal(analise.canceladas.aprovadaSemNota.quantidade, 1);
    assert.equal(analise.canceladas.aprovadaSemNota.valor, 200);
    assert.equal(analise.canceladas.pendente.quantidade, 1);
    assert.equal(analise.canceladas.pendente.valor, 50);
    assert.equal(analise.canceladas.semValor.quantidade, 1);
    assert.equal(
      analise.canceladas.faturada.quantidade
      + analise.canceladas.aprovadaSemNota.quantidade
      + analise.canceladas.pendente.quantidade
      + analise.canceladas.semValor.quantidade,
      analise.canceladas.quantidade,
    );
  });

  it('deixa despesa sem CNPJ e custo de fornecedor fora do resultado da empresa', () => {
    assert.equal(papelDoLancamento({
      entityType: 'Other',
      categoryName: 'FORNECEDOR - ESCOLTA',
      categoryTag: '',
      categoryGroup: '',
    }), 'custo_fornecedor');
    assert.equal(papelDoLancamento({
      entityType: 'Provider',
      categoryName: 'Administrativa',
      categoryTag: '',
      categoryGroup: '',
    }), 'custo_fornecedor');
    assert.equal(papelDoLancamento({
      entityType: 'Other',
      categoryName: 'Aluguel',
      categoryTag: '',
      categoryGroup: '',
    }), 'despesa');
    assert.equal(papelDoLancamento({
      entityType: '',
      categoryName: '',
      categoryTag: 'IMPOSTO',
      categoryGroup: '',
    }), 'tributo');

    const analise = analisarCarga(cargaMinima({
      fatias: [fatia({ id: 'OS-1', receita: 1000, custo: 400 })],
      despesas: [
        {
          id: 'SEM',
          mes: '2026-03',
          empresaKey: 'SEM_EMISSORA',
          valor: 777,
          entidade: 'SEM CNPJ',
          descricao: 'Sem emissora',
          impressaoDigital: 'sem',
          origem: 'financial_transactions',
        },
        {
          id: 'COM',
          mes: '2026-03',
          empresaKey: 'LABORATORIO',
          valor: 100,
          entidade: 'COM CNPJ',
          descricao: 'Da empresa',
          impressaoDigital: 'com',
          origem: 'financial_transactions',
        },
      ],
      documentos: [nota({
        id: 'PAGAR',
        tipo: 'nf_fornecedor',
        valor: 400,
        fornecedor: 'FORNECEDOR FICTICIO COM NF',
        cliente: '',
        empresaKey: 'SEM_EMISSORA',
        origem: 'financial_transactions.doc_nf_status',
      })],
    }), filtroLab({ mes: '2026-03' }), PREMISSAS_INICIAIS, {}, {});
    assert.equal(analise.separacao.custo, 400);
    assert.equal(analise.semCredito.despesasOperacionais, 100);
    assert.equal(analise.separacao.lucroEstimado, 500);
    assert.equal(analise.pendencias.despesaSemCnpj, 777);
    assert.equal(analise.pendencias.despesaSemCnpjQuantidade, 1);
    assert.equal(analise.pendencias.custoFornecedorEmContas, 400);
    assert.equal(analise.separacao.receitaOperacional - analise.separacao.custo - analise.semCredito.despesasOperacionais, analise.separacao.lucroEstimado);
  });

  it('atribui recebimento só por número único de nota e preserva teto e reajustes', () => {
    const notas = [
      { id: 'F1', numero: 'TMSEG-20261002-172535-MKAM', empresaKey: 'TM SEGURANCA' },
      { id: 'F2', numero: '12', empresaKey: 'TM GESTAO' },
      { id: 'F3', numero: '9999', empresaKey: 'TM SECURITY' },
      { id: 'F4', numero: '9999', empresaKey: 'TM GESTAO' },
    ];
    assert.equal(atribuirRecebimentoPorDocumento('Baixa TMSEG-20261002-172535-MKAM', notas).empresaKey, 'TM SEGURANCA');
    assert.equal(atribuirRecebimentoPorDocumento('Baixa 12 do cliente', notas).vinculado, false);
    assert.equal(atribuirRecebimentoPorDocumento('Baixa 9999', notas).vinculado, false);
    assert.equal(atribuirRecebimentoPorDocumento('FOUR LOG', notas).vinculado, false);

    const analise = analisarCarga(cargaMinima({
      fatias: [fatia({ id: 'OS-1', receita: 1000, custo: 200 })],
      recebimentos: [
        { id: 'R1', mes: '2026-03', empresaKey: 'LABORATORIO', valor: 300, descricao: 'nota', numeroNota: 'NF-1', vinculado: true, origem: 'financial_transactions' },
        { id: 'R2', mes: '2026-03', empresaKey: 'SEM_EMISSORA', valor: 900, descricao: 'sem nota', numeroNota: '', vinculado: false, origem: 'financial_transactions' },
      ],
    }), filtroLab({ mes: '2026-03' }), PREMISSAS_INICIAIS, {}, {});
    assert.equal(analise.separacao.recebimento, 300);
    assert.equal(analise.pendencias.recebimentoSemDocumento, 900);
    assert.notEqual(analise.separacao.recebimento, analise.separacao.receitaOperacional);
    assert.notEqual(analise.separacao.faturamentoFiscal, analise.separacao.receitaOperacional);
    assert.equal(analise.teto.status, 'PREMISSA_AUSENTE');
    assert.equal(analise.reajusteCliente.status, 'JA_ATINGE');
    assert.equal(analise.reajusteCliente.reajusteValor, 0);
    assert.equal(analise.preservarLucro.status, 'PREMISSA_AUSENTE');
    assert.equal(analise.preservarLucro.aumento, null);
    assert.equal(analise.formulas.teto, FORMULAS_FISCAIS.teto);
    assert.equal(analise.formulas.cliente, FORMULAS_FISCAIS.cliente);
    assert.equal(analise.formulas.preservar, FORMULAS_FISCAIS.preservar);
  });

  it('não grava, não recalcula OS e não usa a TORRES na conciliação', () => {
    const carga = fs.readFileSync('lib/gestorFiscal/carregarFontes.ts', 'utf8');
    const base = fs.readFileSync('lib/gestorFiscal/base.ts', 'utf8');
    const conciliacao = fs.readFileSync('lib/gestorFiscal/conciliacao.ts', 'utf8');
    const blocoFatura = carga.slice(carga.lastIndexOf('for (const f of faturas)'));
    assert.equal(/const numero =/.test(blocoFatura), false);
    assert.match(blocoFatura, /valor: numero\(f\.amount\)/);
    assert.match(carga, /financial_invoice_missions/);
    assert.match(carga, /osComprovadamenteFaturada/);
    assert.equal(carga.includes('.insert('), false);
    assert.equal(carga.includes('.update('), false);
    assert.equal(carga.includes('.delete('), false);
    assert.equal(carga.includes('service_orders'), false);
    assert.equal(/torres/i.test(carga + base + conciliacao), false);
    assert.equal(base.includes('calculateMissionFinancials'), false);
    assert.equal(conciliacao.includes('calculateMissionFinancials'), false);
    assert.match(conciliacao, /notaDoMesmoClienteNoMes/);
  });

  it('mostra na tela a separação, as canceladas e as pendências', async () => {
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const pagina = await import('../components/gestorFiscal/GestorFiscalPage');
    const html = renderToStaticMarkup(React.createElement(pagina.default, {
      modoInicial: 'laboratorio',
      abaInicial: 'visao',
      expandido: true,
    }));
    assert.match(html, /Receita operacional/);
    assert.match(html, /Faturamento fiscal/);
    assert.match(html, /Recebimento/);
    assert.match(html, /Lucro estimado/);
    assert.match(html, /OS canceladas na receita operacional/);
    assert.match(html, /Pendências fora do resultado/);
    assert.match(html, /Reajuste para a margem de 40%/);
    assert.match(html, /Teto de reajuste/);
    assert.match(html, /data-testid="kpi-lucro-estimado"/);
    const fonte = fs.readFileSync('components/gestorFiscal/GestorFiscalPage.tsx', 'utf8');
    assert.match(fonte, /import React, \{ useEffect, useMemo, useState \} from 'react'/);
  });
});

describe('gestor fiscal — acesso', () => {
  it('abre para Diretoria que já vê Faturamento e fecha para os demais', () => {
    assert.equal(canAccessScreen({ role: 'Diretoria', permissions: ['diretoria-faturamento'] }, 'gestor-fiscal'), true);
    assert.equal(canAccessScreen({ role: 'Diretoria', permissions: ['gestor-fiscal'] }, 'gestor-fiscal'), true);
    assert.equal(canAccessScreen({ role: 'Diretoria', permissions: [] }, 'gestor-fiscal'), false);
    assert.equal(canAccessScreen({ role: 'Administrador', permissions: ['*'] }, 'gestor-fiscal'), false);
    assert.equal(canAccessScreen({ role: 'Avançado', permissions: ['*'] }, 'gestor-fiscal'), false);
    assert.equal(canAccessScreen({ role: 'Financeiro', permissions: ['diretoria-faturamento'] }, 'gestor-fiscal'), false);
    assert.equal(canAccessScreen({ role: 'Operador', permissions: ['gestor-fiscal'], clientId: 'c1' }, 'gestor-fiscal'), false);
  });
});
