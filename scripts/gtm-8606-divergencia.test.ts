/**
 * Caso fictício no formato da divergência vista na homologação.
 * Não usa a OS real e não grava valor.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  avaliarPropagacaoValorCliente,
  compensacaoArtificial,
  conferenciaAutorizada,
  divergenciaSnapshot,
  totalCliente,
  totalFornecedor,
} from '../lib/financeiro/divergenciaValorCliente';
import { camposAlterados, justificativaValida, montarResumoEdicao, podeEdicaoTotal, podeReaprovar } from '../lib/reaprovacaoFinanceira/regras';

const KM = 190;
const TARIFA_CLIENTE = 7.35;
const TARIFA_FORNECEDOR = 4.5;
const DESLOCAMENTO_CLIENTE = Math.round(KM * TARIFA_CLIENTE * 100) / 100;
const DESLOCAMENTO_FORNECEDOR = Math.round(KM * TARIFA_FORNECEDOR * 100) / 100;

const casoZerado = {
  status: 'Recusada',
  receitaServico: 0,
  custoServico: -DESLOCAMENTO_FORNECEDOR,
  pedagioCliente: 0,
  pedagioFornecedor: 0,
  deslocamentoCliente: DESLOCAMENTO_CLIENTE,
  deslocamentoFornecedor: DESLOCAMENTO_FORNECEDOR,
  motivoReceita: 'Valor zero confirmado',
  motivoCusto: 'OS Recusada — zerado automaticamente',
};

describe('divergência de valor zero com deslocamento', () => {
  it('reproduz o caso: serviço zero, fornecedor zerado na tela e cliente com o deslocamento', () => {
    assert.equal(DESLOCAMENTO_CLIENTE, 1396.5);
    assert.equal(DESLOCAMENTO_FORNECEDOR, 855);
    const aviso = avaliarPropagacaoValorCliente(casoZerado);
    assert.equal(totalCliente(casoZerado), 1396.5);
    assert.equal(totalFornecedor(casoZerado), 0);
    assert.equal(aviso.bloqueia, true);
    assert.match(aviso.mensagem, /1\.396,50/);
    assert.match(aviso.mensagem, /impedida/);
  });

  it('não propaga quando o adicional também está zerado', () => {
    const aviso = avaliarPropagacaoValorCliente({
      ...casoZerado,
      custoServico: 0,
      deslocamentoCliente: 0,
      deslocamentoFornecedor: 0,
    });
    assert.equal(aviso.bloqueia, false);
    assert.equal(aviso.totalCliente, 0);
  });

  it('libera somente com justificativa de conferência, diferente do carimbo automático', () => {
    const semTexto = avaliarPropagacaoValorCliente(casoZerado);
    assert.equal(semTexto.bloqueia, true);
    const conferido = {
      ...casoZerado,
      custoServico: 0,
      deslocamentoFornecedor: 0,
      motivoReceita: 'Cobrar o deslocamento de 190 km autorizado nesta OS',
    };
    assert.equal(conferenciaAutorizada(conferido), true);
    assert.equal(avaliarPropagacaoValorCliente(conferido).bloqueia, false);
  });

  it('bloqueia serviço negativo que só anula o deslocamento e aceita estorno justificado', () => {
    assert.equal(compensacaoArtificial(casoZerado), true);
    assert.equal(avaliarPropagacaoValorCliente(casoZerado).bloqueia, true);
    const estorno = avaliarPropagacaoValorCliente({
      ...casoZerado,
      deslocamentoCliente: 0,
      motivoReceita: 'Estorno do deslocamento conferido com o cliente',
      motivoCusto: 'Estorno do fornecedor nesta OS recusada',
    });
    assert.equal(estorno.bloqueia, false);
  });

  it('snapshot divergente do valor salvo não passa como aprovado', () => {
    const aviso = divergenciaSnapshot({
      receitaServico: 0,
      pedagioCliente: 0,
      deslocamentoCliente: 0,
      snapshot: { revenueServiceOnly: 0, displacementVal: 1396.5, totalGeral: 1396.5, tollVal: 0 },
    });
    assert.equal(aviso.diverge, true);
    const igual = divergenciaSnapshot({
      receitaServico: 0,
      pedagioCliente: 0,
      deslocamentoCliente: 1396.5,
      snapshot: { revenueServiceOnly: 0, displacementVal: 1396.5, totalGeral: 1396.5, tollVal: 0 },
    });
    assert.equal(igual.diverge, false);
  });

  it('não trata serviço com valor como se fosse zero', () => {
    const aviso = avaliarPropagacaoValorCliente({
      ...casoZerado,
      status: 'Concluída',
      receitaServico: 735,
      custoServico: 400,
      motivoReceita: 'Salvamento manual confirmado',
      motivoCusto: 'Salvamento manual confirmado',
    });
    assert.equal(aviso.bloqueia, false);
    assert.equal(aviso.totalCliente, 2131.5);
  });
});

describe('edição total no caso da OS aprovada', () => {
  const giovanna = { id: '24', name: 'Giovanna Marsili', role: 'Financeiro' };

  it('OS recusada recebe correção excepcional e a reaprovação continua fechada', () => {
    const os = {
      id: 'OS-FICTICIA-RECUSADA',
      status: 'Recusada',
      billing_approved: true,
      invoice_number: null,
    };
    assert.equal(podeEdicaoTotal(giovanna, os).permitido, true);
    assert.equal(podeReaprovar(giovanna, os).permitido, false);
  });

  it('OS concluída aprovada e elegível exige senha, justificativa, antes/depois e aviso', () => {
    const os = {
      id: 'OS-FICTICIA-APROVADA',
      status: 'Concluída',
      billing_approved: true,
      invoice_number: null,
      negative_margin_locked: false,
      faturaPaga: false,
    };
    assert.equal(podeEdicaoTotal(giovanna, os).permitido, true);
    assert.equal(justificativaValida('curta').ok, false);
    const justificativa = justificativaValida('Corrigir o valor conferido depois da aprovação');
    assert.equal(justificativa.ok, true);
    const campos = camposAlterados(
      { revenue_value: 0, cost_value: 400 },
      { revenue_value: 735, cost_value: 400 },
    );
    assert.equal(campos.length, 1);
    assert.equal(campos[0].campo, 'revenue_value');
    assert.equal(campos[0].antes, 0);
    assert.equal(campos[0].depois, 735);
    const resumo = montarResumoEdicao({
      id: 'evt-ficticio',
      tentativaId: '11111111-1111-4111-8111-111111111111',
      missionId: 'OS-FICTICIA-APROVADA',
      osNumero: 'OS-FICTICIA-APROVADA',
      incluidoPor: 'Operação',
      aprovadoOriginalmentePor: 'Giovanna Marsili',
      aprovadoOriginalmenteEm: '2026-10-16T18:40:58.000Z',
      conferidoOriginalmentePor: null,
      alteradoPor: 'Giovanna Marsili',
      reaprovadoPor: 'Giovanna Marsili',
      reaprovadoEm: '2026-10-16T19:00:00.000Z',
      justificativa: justificativa.ok ? justificativa.texto : '',
      campos,
      capturaAntesPath: 'antes.jpg',
      capturaDepoisPath: 'depois.jpg',
      snapshotOriginal: { totalGeral: 0 },
      valoresAplicados: false,
      notificacaoId: null,
      status: 'pendente',
      erro: null,
    }, 'Cliente fictício');
    assert.equal(resumo.origem, 'edicao_total');
    assert.equal(resumo.alteradoPor, 'Giovanna Marsili');
    assert.equal(resumo.capturaAntesPath, 'antes.jpg');
    assert.equal(resumo.capturaDepoisPath, 'depois.jpg');
    assert.match(resumo.justificativa, /Corrigir o valor/);
  });
});
