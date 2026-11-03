import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canAccessScreen } from '../lib/screenAccess';
import { isBankTransferBillingClient } from '../lib/billing/transferBillingClients';
import {
  colunaCobranca,
  competenciaAtual,
  descricaoContasReceber,
  diferencaLinha,
  lerValorMonetario,
  limitesDoMes,
  montarLinhasDoCadastro,
  podeGerarFatura,
  prepararAjusteValor,
  textoDiscriminacao,
  textoInformacoes,
  totaisDaPreFatura,
  validarServicoMensal,
  vigenciaCobreMes,
  corpoCobrancaPreFatura,
  type ServicoVigente,
} from '../lib/billing/preFaturaMensal';
import { gerarPdfPreFatura } from '../lib/billing/preFaturaPdf';

const recepcionista: ServicoVigente = {
  id: 's1',
  shortName: 'Recepcionista',
  description: '01 POSTO DE RECEPCIONISTA DIURNO',
  monthlyAmount: 7592.62,
  startDate: '2026-10-13',
  endDate: null,
  active: true,
};

describe('pré-fatura mensal', () => {
  it('copia o valor mensal cheio mesmo com início no meio do mês', () => {
    assert.equal(vigenciaCobreMes(recepcionista, '2026-10'), true);
    assert.equal(vigenciaCobreMes(recepcionista, '2026-09'), false);
    const linhas = montarLinhasDoCadastro([recepcionista], '2026-10');
    assert.equal(linhas.length, 1);
    assert.equal(linhas[0].contractualAmount, 7592.62);
    assert.equal(linhas[0].calculatedAmount, 7592.62);
    assert.equal(linhas[0].invoicedAmount, 7592.62);
    assert.equal(linhas[0].billingReference, 'out/26');
    assert.notEqual(Math.round(7592.62 * 19) / 31, 4555.57);
  });

  it('serviço inativo ou encerrado fica fora da competência', () => {
    assert.equal(vigenciaCobreMes({ ...recepcionista, active: false }, '2026-10'), false);
    assert.equal(vigenciaCobreMes({ ...recepcionista, endDate: '2026-09-30' }, '2026-10'), false);
    assert.equal(vigenciaCobreMes({ ...recepcionista, startDate: '2026-11-01' }, '2026-10'), false);
  });

  it('soma em centavos, tira a linha excluída e aplica o desconto', () => {
    const totais = totaisDaPreFatura([
      { contractualAmount: 7592.62, invoicedAmount: 4555.57, excluded: false },
      { contractualAmount: 0, invoicedAmount: -100, excluded: false },
      { contractualAmount: 10, invoicedAmount: 10, excluded: true },
    ]);
    assert.equal(totais.contratual, 7592.62);
    assert.equal(totais.faturar, 4455.57);
    assert.equal(diferencaLinha({ contractualAmount: 7592.62, invoicedAmount: 4555.57, excluded: false }), -3037.05);
  });

  it('ajuste exige justificativa e não inventa fórmula de dias', () => {
    const semMotivo = prepararAjusteValor({ atual: 7592.62, novo: 4555.57, motivo: '  ', tipo: 'PROPORCIONAL' });
    assert.equal(semMotivo.ok, false);
    const comMotivo = prepararAjusteValor({
      atual: 7592.62,
      novo: 4555.57,
      motivo: 'Ajuste proporcional - início em 13/10',
      tipo: 'PROPORCIONAL',
    });
    assert.equal(comMotivo.ok, true);
    if (comMotivo.ok) {
      assert.equal(comMotivo.ajuste.previousAmount, 7592.62);
      assert.equal(comMotivo.ajuste.newAmount, 4555.57);
    }
  });

  it('competência de Brasília e coluna da cobrança', () => {
    assert.equal(competenciaAtual(new Date('2026-11-01T02:00:00Z')), '2026-10');
    assert.equal(colunaCobranca('2026-10'), 'out/26');
    assert.equal(limitesDoMes('2026-02').fim, '2026-02-28');
    assert.equal(limitesDoMes('2024-02').fim, '2024-02-29');
    assert.equal(descricaoContasReceber('2026-10'), 'Ref. ao mês completo de Outubro/2026');
  });

  it('texto do PDF junta os inícios e a geração de fatura não leva OS', () => {
    const texto = textoInformacoes([
      { itemKind: 'SERVICO', excluded: false, shortName: 'Fiscal de Piso', serviceStartDate: '2026-08-13' },
      { itemKind: 'SERVICO', excluded: false, shortName: 'Recepcionista', serviceStartDate: '2026-10-13' },
    ]);
    assert.equal(texto, 'Início do contrato de Fiscal de Piso em 13/08/2026 e de Recepcionista em 13/10/2026.');
    assert.equal(lerValorMonetario('7.592,62'), 7592.62);
    assert.equal(lerValorMonetario('4555.57'), 4555.57);
    const erro = validarServicoMensal({
      shortName: 'Recepcionista',
      description: 'Posto',
      postCount: 1,
      monthlyAmount: 10,
      startDate: '2026-10-13',
      endDate: '2026-10-01',
    });
    assert.match(erro || '', /fim da vigência/);
    assert.equal(podeGerarFatura('APROVADA', null, null), true);
    assert.equal(podeGerarFatura('APROVADA', null, 'TMSEG-1'), false);
    assert.equal(podeGerarFatura('RASCUNHO', null, null), false);

    const corpo = corpoCobrancaPreFatura({
      cliente: {
        id: '10',
        name: 'FLASH COURIER LTDA',
        trading_name: 'Flash',
        cnpj: '00.000.000/0001-00',
        issuer_company: 'TM SEG',
      },
      total: 31205.57,
      competencia: '2026-10',
      vencimento: '2026-11-29',
      email: 'financeiro@cliente.com',
      rastreio: 'TMSEG-TESTE',
    });
    assert.equal(corpo.value, 31205.57);
    assert.equal('missionIds' in corpo, false);
    assert.equal(corpo.periodStart, '2026-10-01');
    assert.equal(corpo.periodEnd, '2026-10-31');
    assert.match(String(corpo.description), /Mês Completo de Outubro\/2026/);
    assert.equal(corpo.skipBoleto, isBankTransferBillingClient('FLASH COURIER LTDA', 'Flash'));
    assert.match(textoDiscriminacao({
      descriptionBase: 'Ref. aos Serviços de Intermediação de Escolta Armada',
      amazon: false,
      competencia: '2026-10',
    }), /^Referente aos /);
  });

  it('PDF sai com as quatro colunas e a marca de rascunho no bytes', () => {
    const bytes = gerarPdfPreFatura({
      rascunho: true,
      competencia: '2026-10',
      emissorNome: 'GRUPO TM SEG',
      emissorCnpj: '28.804.378/0001-67',
      clienteFantasia: 'Flash',
      clienteRazao: 'FLASH COURIER LTDA',
      clienteCnpj: '00.000.000/0001-00',
      clienteEndereco: 'Rua A, 10',
      clienteTelefone: '11999999999',
      clienteEmail: 'financeiro@cliente.com',
      linhas: montarLinhasDoCadastro([recepcionista], '2026-10'),
    });
    assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), '%PDF-');
    const texto = Buffer.from(bytes).toString('latin1');
    assert.match(texto, /PRÉ-FATURA TM SEG|PRE-FATURA/);
    assert.match(texto, /COBRANÇA|COBRANCA/);
    assert.match(texto, /RASCUNHO/);
  });

  it('a tela herda o boletim e não mexe no motor da OS', () => {
    const financeiro = { role: 'Financeiro', permissions: ['fin-billing'] };
    assert.equal(canAccessScreen(financeiro, 'fin-pre-fatura'), true);
    assert.equal(canAccessScreen({ role: 'Financeiro', permissions: ['fin-invoices'] }, 'fin-pre-fatura'), false);
    assert.equal(canAccessScreen({ role: 'Avançado', permissions: ['fin-billing', '*'] }, 'fin-pre-fatura'), false);
    assert.equal(canAccessScreen({ role: 'Cliente', clientId: '1', permissions: ['fin-billing'] }, 'fin-pre-fatura'), false);

    const store = readFileSync('lib/billing/preFaturaStore.ts', 'utf8');
    const tela = readFileSync('components/PreFaturaMensal.tsx', 'utf8');
    const aba = readFileSync('components/ClientMonthlyServicesTab.tsx', 'utf8');
    assert.doesNotMatch(`${store}\n${tela}\n${aba}`, /calculateMissionFinancials|client_price_tables|from\('missions'\)/);
    assert.match(tela, /\/api\/asaas\/create-charge/);
    assert.match(readFileSync('lib/navItems.ts', 'utf8'), /fin-pre-fatura/);
    assert.match(readFileSync('migrations/2026_10_30_pre_fatura_mensal.sql', 'utf8'), /client_id bigint/);
  });
});
