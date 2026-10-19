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
  reajusteParaMargemIdeal,
  simularPeriodo,
  tetoReajusteFornecedor,
} from '../lib/gestorFiscal/simulacao';
import { analisarCarga } from '../lib/gestorFiscal/base';
import { CARGA_LABORATORIO } from '../lib/gestorFiscal/laboratorio';
import { classificarSituacaoNf } from '../lib/gestorFiscal/carregarFontes';
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
    assert.equal(form.includes('emite_nota_fiscal'), false);
    const payload = form.slice(form.indexOf('const payload: any = {'), form.indexOf('};', form.indexOf('const payload: any = {')));
    assert.equal(/nota fiscal/i.test(payload), false);
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
    }, filtroLab({ empresaKey: 'TM GESTAO' }), PREMISSAS_INICIAIS, {}, {});
    assert.equal(analise.semCredito.receita, 0);
    assert.equal(analise.documentos.length, 0);
    assert.equal(analise.rotuloModo, 'SIMULAÇÃO');
    assert.ok(analise.avisos.some((a) => a.includes('Nenhuma OS oficial')));
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
